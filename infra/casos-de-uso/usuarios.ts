import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import type { Papel, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  avaliarMudancaDeUsuario,
  exigeNovaEpocaDeSessao,
  type MudancaDeUsuario,
} from "@/dominio/usuarios/regras";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso da T27 (Onda 6, ficha §3).
 *
 * Três invariantes atravessam tudo o que está aqui:
 *  RN46 — escrita exclusiva do Administrador da Plataforma, e o último
 *         administrador ativo não pode ser rebaixado nem inativado;
 *  RN47 — inativar e rebaixar revogam o acesso na hora, incrementando a
 *         época da sessão, e nada é excluído — histórico e autoria ficam;
 *  auditoria — toda mutação grava valor anterior/novo/autor, e a senha
 *         NUNCA entra na trilha (nem o hash).
 */

const ESQUEMA_NOVO_USUARIO = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo do usuário."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um e-mail corporativo válido."),
  papel: z.string().min(1, "Escolha o papel do usuário."),
});

const ESQUEMA_EDICAO = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo do usuário."),
  papel: z.string().min(1, "Escolha o papel do usuário."),
});

/**
 * Campos jamais auditados. O hash da senha é segredo operacional: gravá-lo
 * na trilha entregaria a todo mundo com acesso à T28 o material para um
 * ataque de dicionário offline. A troca é registrada pelo evento de
 * "credencial redefinida", que diz o que houve sem dizer o quê.
 */
const CAMPOS_FORA_DA_TRILHA = ["senhaHash", "sessaoEpoca"];

const ENTIDADE = "usuario";

/**
 * Senha provisória legível, entregue UMA vez ao Administrador para que ele
 * a repasse ao dono. Não é dado de negócio inventado: é material de
 * credencial, e o usuário é obrigado a trocá-la no primeiro acesso.
 */
export function gerarSenhaProvisoria(): string {
  return `broto-${randomBytes(6).toString("base64url")}`;
}

function estadoAuditavel(usuario: {
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  trocaSenhaObrigatoria: boolean;
}) {
  return {
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    ativo: usuario.ativo,
    trocaSenhaObrigatoria: usuario.trocaSenhaObrigatoria,
  };
}

/**
 * Lê todos os usuários DENTRO da transação, com a linha do alvo travada.
 *
 * É o que fecha a corrida da RN46: dois administradores se rebaixando ao
 * mesmo tempo veriam, cada um, "existe outro administrador ativo" e a
 * plataforma ficaria sem nenhum. `FOR UPDATE` na linha do alvo serializa
 * as duas transações; a segunda relê o mundo já com a primeira aplicada.
 */
async function retratoParaRN46(tx: Prisma.TransactionClient, alvoId: string) {
  await tx.$queryRaw`SELECT id FROM "usuarios" WHERE id = ${alvoId} FOR UPDATE`;
  return tx.usuario.findMany({ select: { id: true, papel: true, ativo: true } });
}

export interface UsuarioCriado {
  id: string;
  /** Exibida uma única vez ao Administrador; nunca fica armazenada em claro. */
  senhaProvisoria: string;
}

/** Cria um usuário interno com credencial provisória (ficha §3). */
export async function criarUsuario(
  ator: Ator,
  dados: { nome: string; email: string; papel: string },
): Promise<UsuarioCriado> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  const analise = ESQUEMA_NOVO_USUARIO.safeParse(dados);
  if (!analise.success) {
    throw new ErroDeValidacao(analise.error.issues.map((problema) => problema.message));
  }
  const papel = analise.data.papel as Papel;

  const jaExiste = await prisma.usuario.findUnique({
    where: { email: analise.data.email },
    select: { id: true },
  });
  if (jaExiste) {
    throw new ErroDeValidacao([
      "Já existe um usuário com este e-mail. Usuário com histórico não é excluído — reative o existente.",
    ]);
  }

  const senhaProvisoria = gerarSenhaProvisoria();
  const senhaHash = await hash(senhaProvisoria, 10);

  const criado = await prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nome: analise.data.nome,
        email: analise.data.email,
        papel,
        senhaHash,
        ativo: true,
        trocaSenhaObrigatoria: true,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: usuario.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(usuario),
      camposIgnorados: CAMPOS_FORA_DA_TRILHA,
    });
    return usuario;
  });

  return { id: criado.id, senhaProvisoria };
}

/**
 * Edita nome, papel e situação. A RN46 é avaliada com o retrato lido dentro
 * da transação, e a RN47 decide se a época avança.
 */
export async function atualizarUsuario(
  ator: Ator,
  usuarioId: string,
  dados: { nome: string; papel: string; ativo?: boolean },
): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  const analise = ESQUEMA_EDICAO.safeParse(dados);
  if (!analise.success) {
    throw new ErroDeValidacao(analise.error.issues.map((problema) => problema.message));
  }

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id: usuarioId } });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }

    const mudanca: MudancaDeUsuario = {
      papel: analise.data.papel as Papel,
      ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }),
    };

    const todos = await retratoParaRN46(tx, usuarioId);
    const erros = avaliarMudancaDeUsuario({ alvo: anterior, mudanca, todos });
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }

    const novo = await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        nome: analise.data.nome,
        papel: mudanca.papel,
        ...(mudanca.ativo === undefined ? {} : { ativo: mudanca.ativo }),
        ...(exigeNovaEpocaDeSessao(anterior, mudanca)
          ? { sessaoEpoca: { increment: 1 } }
          : {}),
      },
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: usuarioId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(novo),
      camposIgnorados: CAMPOS_FORA_DA_TRILHA,
    });
  });
}

/**
 * RN47 — inativação. Não existe exclusão: o usuário com histórico é
 * inativado, e toda a autoria dele nos registros continua de pé.
 */
export async function inativarUsuario(ator: Ator, usuarioId: string): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id: usuarioId } });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }
    if (!anterior.ativo) {
      return;
    }

    const todos = await retratoParaRN46(tx, usuarioId);
    const erros = avaliarMudancaDeUsuario({
      alvo: anterior,
      mudanca: { ativo: false },
      todos,
    });
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }

    const novo = await tx.usuario.update({
      where: { id: usuarioId },
      // A época avança: as sessões abertas caem na requisição seguinte.
      data: { ativo: false, sessaoEpoca: { increment: 1 } },
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: usuarioId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(novo),
      camposIgnorados: CAMPOS_FORA_DA_TRILHA,
    });
  });
}

/**
 * Reativação. Emite credencial provisória nova: quem volta não volta com a
 * senha que tinha quando saiu — ela pode ter sido comprometida no intervalo,
 * e ninguém sabe há quanto tempo.
 */
export async function reativarUsuario(
  ator: Ator,
  usuarioId: string,
): Promise<{ senhaProvisoria: string }> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  const senhaProvisoria = gerarSenhaProvisoria();
  const senhaHash = await hash(senhaProvisoria, 10);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id: usuarioId } });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }

    const novo = await tx.usuario.update({
      where: { id: usuarioId },
      data: { ativo: true, senhaHash, trocaSenhaObrigatoria: true },
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: usuarioId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(novo),
      camposIgnorados: CAMPOS_FORA_DA_TRILHA,
    });
  });

  return { senhaProvisoria };
}

/**
 * Redefinição de credencial pelo Administrador. Derruba as sessões abertas
 * do dono: se a senha está sendo trocada por suspeita, deixar a sessão viva
 * anularia a troca.
 */
export async function redefinirCredencial(
  ator: Ator,
  usuarioId: string,
): Promise<{ senhaProvisoria: string }> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  const senhaProvisoria = gerarSenhaProvisoria();
  const senhaHash = await hash(senhaProvisoria, 10);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id: usuarioId } });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }

    const novo = await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        senhaHash,
        trocaSenhaObrigatoria: true,
        sessaoEpoca: { increment: 1 },
      },
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: usuarioId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(novo),
      camposIgnorados: CAMPOS_FORA_DA_TRILHA,
    });
  });

  return { senhaProvisoria };
}

const ESQUEMA_TROCA = z
  .object({
    nova: z.string().min(10, "A nova senha precisa de ao menos 10 caracteres."),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.nova === dados.confirmacao, {
    message: "A confirmação não confere com a nova senha.",
  });

/**
 * Troca da própria senha — encerra a obrigatoriedade do primeiro acesso.
 *
 * Aqui a época NÃO avança, de propósito. Ela derruba TODAS as sessões do
 * usuário, inclusive a que está trocando a senha: a pessoa seria expulsa no
 * mesmo instante em que cumpre o que a plataforma exigiu dela. Revogar por
 * suspeita é ato do Administrador (redefinirCredencial), que derruba mesmo.
 */
export async function trocarPropriaSenha(
  ator: Ator,
  dados: { nova: string; confirmacao: string },
): Promise<void> {
  const analise = ESQUEMA_TROCA.safeParse(dados);
  if (!analise.success) {
    throw new ErroDeValidacao(analise.error.issues.map((problema) => problema.message));
  }

  const senhaHash = await hash(analise.data.nova, 10);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id: ator.id } });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }
    const novo = await tx.usuario.update({
      where: { id: ator.id },
      data: { senhaHash, trocaSenhaObrigatoria: false },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: ator.id,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(novo),
      camposIgnorados: CAMPOS_FORA_DA_TRILHA,
    });
  });
}

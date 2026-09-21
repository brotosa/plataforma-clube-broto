import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import type { Papel, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  avaliarMudancaDeUsuario,
  exigeConfirmacaoDeAcessoTotal,
  exigeNovaEpocaDeSessao,
  MENSAGEM_CONFIRMAR_ACESSO_TOTAL,
  type MudancaDeUsuario,
} from "@/dominio/usuarios/regras";
import { validarSenhaContraPolitica } from "@/dominio/usuarios/politica-senha";
import { lerPoliticaDeSenha } from "./configuracoes";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso da T27 (Onda 6, ficha §3).
 *
 * Três invariantes atravessam tudo o que está aqui:
 *  RN46 — escrita exclusiva do Administrador, e o último
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
  credencialEmitidaEm?: Date | null;
}) {
  return {
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    ativo: usuario.ativo,
    trocaSenhaObrigatoria: usuario.trocaSenhaObrigatoria,
    /*
     * O instante da emissão entra na trilha — e com ele um buraco se fecha.
     * Redefinir a credencial de quem JÁ estava com a troca exigida não mudava
     * nenhum campo auditável, então `registrarMutacao` não gravava nada: a
     * reemissão era invisível na T28. Agora toda emissão muda este valor, e
     * toda emissão aparece. O hash continua fora (CAMPOS_FORA_DA_TRILHA), e a
     * data não revela senha alguma.
     */
    credencialEmitidaEm: usuario.credencialEmitidaEm?.toISOString() ?? null,
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
  dados: {
    nome: string;
    email: string;
    papel: string;
    /**
     * Marcada pela pessoa quando o papel escolhido concede acesso total.
     *
     * Chega como dado da requisição e **é conferida aqui**, não só na tela: a
     * confirmação da interface impede o clique distraído, e esta impede o
     * POST montado à mão. Uma sem a outra é decoração.
     */
    confirmacaoAcessoTotal?: boolean;
  },
): Promise<UsuarioCriado> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  const analise = ESQUEMA_NOVO_USUARIO.safeParse(dados);
  if (!analise.success) {
    throw new ErroDeValidacao(analise.error.issues.map((problema) => problema.message));
  }
  const papel = analise.data.papel as Papel;

  if (exigeConfirmacaoDeAcessoTotal(null, papel) && !dados.confirmacaoAcessoTotal) {
    throw new ErroDeValidacao([MENSAGEM_CONFIRMAR_ACESSO_TOTAL]);
  }

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
        credencialEmitidaEm: new Date(),
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
  dados: { nome: string; papel: string; ativo?: boolean; confirmacaoAcessoTotal?: boolean },
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

    /*
     * A conferência precisa do papel ANTERIOR, e por isso mora dentro da
     * transação, depois da leitura: só aqui se sabe se isto é uma concessão
     * (papel comum → acesso total) ou a edição do nome de quem já o tinha. A
     * segunda não pede cerimônia nenhuma — ver o comentário da regra.
     */
    if (
      exigeConfirmacaoDeAcessoTotal(anterior.papel, mudanca.papel!) &&
      !dados.confirmacaoAcessoTotal
    ) {
      throw new ErroDeValidacao([MENSAGEM_CONFIRMAR_ACESSO_TOTAL]);
    }

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
      data: {
        ativo: true,
        senhaHash,
        trocaSenhaObrigatoria: true,
        credencialEmitidaEm: new Date(),
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
        credencialEmitidaEm: new Date(),
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

/**
 * Troca da própria senha — encerra a obrigatoriedade do primeiro acesso.
 *
 * A senha é validada contra a POLÍTICA vigente (Configurações): comprimento,
 * classes de caractere e o histórico das últimas N. O histórico guarda só o
 * HASH das senhas anteriores, nunca o texto (RN55/segurança); a comparação
 * usa bcrypt, e por isso roda FORA da transação — hashear dezenas de
 * milissegundos segurando a conexão do banco é o que esta ordem evita.
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
  const politica = await lerPoliticaDeSenha();
  const erros = validarSenhaContraPolitica(dados.nova, politica);
  if (dados.nova !== dados.confirmacao) {
    erros.push("A confirmação não confere com a nova senha.");
  }
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  const usuarioAtual = await prisma.usuario.findUnique({
    where: { id: ator.id },
    select: { senhaHash: true },
  });
  if (!usuarioAtual) {
    throw new ErroDeValidacao(["Usuário não encontrado."]);
  }

  // Histórico: a nova não pode ser uma das últimas N — a senha ATUAL conta
  // como a 1ª dessas N, e as demais vêm do histórico, da mais recente.
  if (politica.historicoN > 0) {
    const hashesRecentes = [usuarioAtual.senhaHash];
    if (politica.historicoN > 1) {
      const anteriores = await prisma.senhaHistorico.findMany({
        where: { usuarioId: ator.id },
        orderBy: { criadoEm: "desc" },
        take: politica.historicoN - 1,
        select: { senhaHash: true },
      });
      hashesRecentes.push(...anteriores.map((linha) => linha.senhaHash));
    }
    for (const hashAntigo of hashesRecentes) {
      if (await compare(dados.nova, hashAntigo)) {
        throw new ErroDeValidacao([
          `A nova senha não pode repetir uma das últimas ${politica.historicoN} senhas.`,
        ]);
      }
    }
  }

  const senhaHash = await hash(dados.nova, 10);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id: ator.id } });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }
    const novo = await tx.usuario.update({
      where: { id: ator.id },
      // `senhaAlteradaEm` é o relógio da validade periódica (RN72): sem
      // gravá-lo aqui a senha nova nasceria "nunca vence".
      //
      // E `credencialEmitidaEm` volta a nulo: a senha agora é escolhida pela
      // pessoa, ninguém a transmitiu, e a validade da credencial provisória
      // deixa de ter o que governar. Deixá-la preenchida expiraria a senha
      // definitiva pelo prazo da provisória — o defeito exato que separar os
      // dois relógios existe para impedir.
      data: {
        senhaHash,
        trocaSenhaObrigatoria: false,
        senhaAlteradaEm: new Date(),
        credencialEmitidaEm: null,
      },
    });

    // Registra a senha ANTERIOR no histórico (só o hash) e poda para o
    // necessário: as N-1 mais recentes + a nova (agora atual) formam as N que
    // a próxima troca vai conferir.
    if (politica.historicoN > 0) {
      await tx.senhaHistorico.create({
        data: { usuarioId: ator.id, senhaHash: anterior.senhaHash },
      });
      const manter = Math.max(politica.historicoN - 1, 0);
      const excedentes = await tx.senhaHistorico.findMany({
        where: { usuarioId: ator.id },
        orderBy: { criadoEm: "desc" },
        skip: manter,
        select: { id: true },
      });
      if (excedentes.length > 0) {
        await tx.senhaHistorico.deleteMany({
          where: { id: { in: excedentes.map((linha) => linha.id) } },
        });
      }
    }

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

/**
 * Exigir nova senha no próximo acesso — para um usuário.
 *
 * **Não é o mesmo que "Redefinir credencial", e a diferença é o ponto.**
 * Redefinir *troca* a senha e devolve uma provisória que alguém precisa
 * transmitir — por WhatsApp, e-mail, recado —, e todo canal desses é uma
 * chance de vazamento. Esta ação **preserva a senha atual**: a pessoa entra
 * com o que já sabe e é conduzida à troca. Nada trafega.
 *
 * Por isso também **não derruba a sessão**: quem está trabalhando continua, e
 * a exigência se aplica na requisição seguinte — o `revisarTokenDeSessao` lê a
 * marca do banco a cada requisição, não do token. Derrubar seria perder
 * trabalho sem ganhar segurança: a pessoa já está autenticada com a senha que
 * estamos pedindo para trocar.
 *
 * O caso que motivou: ligar a validade de senha (RN72) **não alcança quem já
 * está na base**, porque `senhaAlteradaEm` nasce nula e nulo significa "nunca
 * vence". Sem esta ação, a política fica ligada e sem morder até que cada
 * pessoa troque a senha por conta própria — que pode ser nunca.
 */
export async function exigirNovaSenha(ator: Ator, usuarioId: string): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id: usuarioId } });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }
    if (!anterior.ativo) {
      throw new ErroDeValidacao([
        "Usuário inativo não acessa a plataforma — reative antes de exigir a troca.",
      ]);
    }
    if (anterior.trocaSenhaObrigatoria) {
      // Já está exigido: sair sem gravar evita poluir a trilha com um evento
      // que não muda nada (RN49 — a auditoria não se apaga, então não se suja).
      return;
    }

    const novo = await tx.usuario.update({
      where: { id: usuarioId },
      data: { trocaSenhaObrigatoria: true },
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
 * Exigir nova senha de **todos os usuários ativos**.
 *
 * É o ato que dá início ao ciclo do vencimento de senha sobre uma base que já
 * existia. Devolve quantos foram alcançados, porque "apliquei a política" sem
 * número é uma frase que não se confere.
 *
 * **Inclui quem executa**, de propósito: a tela de Configurações já diz que os
 * ajustes "valem para todo mundo, inclusive para quem os alterou", e abrir uma
 * exceção para o Administrador seria contradizer isso justamente na regra em
 * que a exceção mais chamaria atenção.
 *
 * **Não inclui inativos**: eles não acessam a plataforma, então exigir troca
 * deles não protege nada — e quem for reativado já recebe credencial
 * provisória com troca obrigatória, pelo caminho da `reativarUsuario`.
 *
 * Grava **um evento por usuário**, não um evento agregado: a trilha responde
 * "o que aconteceu com esta conta", e um evento coletivo obrigaria quem
 * audita uma pessoa a saber que houve uma ação em massa naquele dia.
 */
export async function exigirNovaSenhaDeTodos(ator: Ator): Promise<{ alcancados: number }> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  const alvos = await prisma.usuario.findMany({
    where: { ativo: true, trocaSenhaObrigatoria: false },
    select: { id: true },
  });
  if (alvos.length === 0) {
    return { alcancados: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const alvo of alvos) {
      const anterior = await tx.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
      const novo = await tx.usuario.update({
        where: { id: alvo.id },
        data: { trocaSenhaObrigatoria: true },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: ENTIDADE,
        entidadeId: alvo.id,
        autorId: ator.id,
        anterior: estadoAuditavel(anterior),
        novo: estadoAuditavel(novo),
        camposIgnorados: CAMPOS_FORA_DA_TRILHA,
      });
    }
  });

  return { alcancados: alvos.length };
}

/**
 * Encerrar as sessões abertas de um usuário, **sem tirar o acesso dele**.
 *
 * O caso real: o notebook esquecido logado no cliente, ou a suspeita de que um
 * token vazou sem que a pessoa tenha feito nada de errado. Nenhuma ação
 * existente cobria isso sem efeito colateral — `inativarUsuario` derruba as
 * sessões, mas revoga o acesso e força credencial provisória nova na volta, e
 * `redefinirCredencial` troca a senha e cria um segredo para alguém
 * transmitir. Aqui não se mexe em papel, em situação nem em senha: a pessoa
 * simplesmente entra de novo, com o que já sabe.
 *
 * **Bloquear manualmente foi considerado e descartado**, por ser
 * indistinguível de inativar no que importa — e pior em dois pontos: a conta
 * continuaria marcada "Ativo" sem conseguir entrar, o que é chamado de
 * suporte garantido, e a pessoa voltaria com a senha antiga, que é justamente
 * o que não se quer quando a suspensão vem de suspeita.
 *
 * O mecanismo é o da RN47: incrementar `sessaoEpoca` invalida todo token
 * emitido antes, e a queda acontece na requisição seguinte de cada sessão.
 *
 * **A auditoria é escrita à mão, e não pelo diff.** `sessaoEpoca` está em
 * `CAMPOS_FORA_DA_TRILHA` — e com razão, porque ele muda junto de outras ações
 * e poluiria a trilha —, então o diff genérico não geraria evento nenhum e o
 * ato ficaria invisível. Um administrador derrubando a sessão de outra pessoa
 * é exatamente o tipo de coisa que a trilha existe para registrar, então o
 * evento é de **ato**, com campo nomeado, no mesmo padrão do acesso a dados
 * plenos da Onda 5.
 */
export async function encerrarSessoes(ator: Ator, usuarioId: string): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_USUARIOS");

  await prisma.$transaction(async (tx) => {
    const alvo = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, nome: true },
    });
    if (!alvo) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }

    await tx.usuario.update({
      where: { id: usuarioId },
      data: { sessaoEpoca: { increment: 1 } },
    });

    await criarGravadorPrisma(tx).gravar([
      {
        entidade: ENTIDADE,
        entidadeId: usuarioId,
        campo: "sessoes_encerradas",
        valorAnterior: null,
        valorNovo: JSON.stringify({
          motivo: "encerramento manual pelo administrador",
          proprioAutor: ator.id === usuarioId,
        }),
        autorId: ator.id,
      },
    ]);
  });
}

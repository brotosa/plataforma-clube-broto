import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { ROTULOS_PAPEL } from "@/dominio/autorizacao/papeis";
import {
  estaBloqueado,
  estadoLimpo,
  minutosRestantesDeBloqueio,
} from "@/dominio/usuarios/politica-login";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Bloqueio por tentativas de login (PR C): a consulta do estado para a tela de
 * login, a lista de contas bloqueadas e o desbloqueio manual (o "lugar para
 * desbloquear" das Configurações).
 */

/**
 * A conta desse e-mail está bloqueada agora? Usada pela tela de login para
 * mostrar a mensagem certa — sem que o provedor de credenciais vaze o motivo.
 * Nunca reporta o Administrador como bloqueado (ele não é), nem revela a
 * existência de e-mail: desconhecido/inativo devolve `false`.
 */
export async function emailEstaBloqueado(email: string): Promise<boolean> {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { ativo: true, papel: true, loginBloqueadoAte: true },
  });
  if (!usuario || !usuario.ativo || usuario.papel === "ADMINISTRADOR_PLATAFORMA") {
    return false;
  }
  return estaBloqueado(usuario.loginBloqueadoAte, new Date());
}

/** Uma conta bloqueada, para a lista de desbloqueio. */
export interface LoginBloqueado {
  id: string;
  nome: string;
  email: string;
  rotuloPapel: string;
  bloqueadoAte: Date;
  minutosRestantes: number;
}

/** Contas bloqueadas agora (bloqueio vigente), mais recentes primeiro. */
export async function listarLoginsBloqueados(): Promise<LoginBloqueado[]> {
  const agora = new Date();
  const linhas = await prisma.usuario.findMany({
    where: { loginBloqueadoAte: { gt: agora } },
    select: { id: true, nome: true, email: true, papel: true, loginBloqueadoAte: true },
    orderBy: { loginBloqueadoAte: "desc" },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    rotuloPapel: ROTULOS_PAPEL[linha.papel],
    bloqueadoAte: linha.loginBloqueadoAte as Date,
    minutosRestantes: minutosRestantesDeBloqueio(linha.loginBloqueadoAte, agora),
  }));
}

/**
 * Desbloqueia manualmente uma conta (zera contador e bloqueio). Só o
 * Administrador (CONFIGURAR_PORTAL), auditado. É o "lugar para desbloquear"
 * das Configurações — a saída antes de o tempo de bloqueio correr sozinho.
 */
export async function desbloquearLogin(ator: Ator, usuarioId: string): Promise<void> {
  exigirPermissao(ator.papel, "CONFIGURAR_PORTAL");
  await prisma.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { loginTentativas: true, loginBloqueadoAte: true },
    });
    if (!anterior) {
      throw new ErroDeValidacao(["Usuário não encontrado."]);
    }
    const limpo = estadoLimpo();
    await tx.usuario.update({
      where: { id: usuarioId },
      data: { loginTentativas: limpo.tentativas, loginBloqueadoAte: limpo.bloqueadoAte },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "usuario",
      entidadeId: usuarioId,
      autorId: ator.id,
      anterior: {
        loginTentativas: anterior.loginTentativas,
        loginBloqueadoAte: anterior.loginBloqueadoAte?.toISOString() ?? null,
      },
      novo: { loginTentativas: 0, loginBloqueadoAte: null },
    });
  });
}

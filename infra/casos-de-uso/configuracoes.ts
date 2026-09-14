import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  type PoliticaDeSenha,
  POLITICA_SENHA_PADRAO,
  validarPoliticaDeSenha,
} from "@/dominio/usuarios/politica-senha";
import {
  type PoliticaDeSessao,
  POLITICA_SESSAO_PADRAO,
  validarPoliticaDeSessao,
} from "@/dominio/usuarios/politica-sessao";
import {
  type PoliticaDeLogin,
  POLITICA_LOGIN_PADRAO,
  validarPoliticaDeLogin,
} from "@/dominio/usuarios/politica-login";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Configurações do portal — leitura e escrita do singleton `ConfiguracaoPortal`.
 *
 * A escrita é do Administrador da Plataforma (CONFIGURAR_PORTAL) e sempre
 * auditada, no mesmo padrão do Parametrizador. A leitura devolve os padrões do
 * domínio quando ainda não há linha — assim o comportamento anterior é
 * preservado sem depender de seed.
 */

/** Id fixo do singleton — só existe uma linha de configuração do portal. */
const ID_SINGLETON = "portal";

const ENTIDADE = "configuracao_portal";

/** Só os campos da política, para a trilha de auditoria (anterior/novo). */
function paraAuditavel(politica: PoliticaDeSenha): Record<string, unknown> {
  return {
    senhaComprimentoMin: politica.comprimentoMin,
    senhaExigeMaiuscula: politica.exigeMaiuscula,
    senhaExigeMinuscula: politica.exigeMinuscula,
    senhaExigeNumero: politica.exigeNumero,
    senhaExigeSimbolo: politica.exigeSimbolo,
    senhaHistoricoN: politica.historicoN,
  };
}

/** Política de senha vigente — os padrões do domínio quando não há linha. */
export async function lerPoliticaDeSenha(): Promise<PoliticaDeSenha> {
  const linha = await prisma.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
  if (!linha) return POLITICA_SENHA_PADRAO;
  return {
    comprimentoMin: linha.senhaComprimentoMin,
    exigeMaiuscula: linha.senhaExigeMaiuscula,
    exigeMinuscula: linha.senhaExigeMinuscula,
    exigeNumero: linha.senhaExigeNumero,
    exigeSimbolo: linha.senhaExigeSimbolo,
    historicoN: linha.senhaHistoricoN,
  };
}

/** Só o campo da política de sessão, para a trilha de auditoria. */
function paraAuditavelSessao(politica: PoliticaDeSessao): Record<string, unknown> {
  return { tempoSessaoMin: politica.tempoSessaoMin };
}

/** Política de sessão vigente — o padrão do domínio quando não há linha. */
export async function lerPoliticaDeSessao(): Promise<PoliticaDeSessao> {
  const linha = await prisma.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
  if (!linha) return POLITICA_SESSAO_PADRAO;
  return { tempoSessaoMin: linha.tempoSessaoMin };
}

/** Salva a política de sessão — só Administrador, valores validados e auditados. */
export async function alterarPoliticaDeSessao(ator: Ator, nova: PoliticaDeSessao): Promise<void> {
  exigirPermissao(ator.papel, "CONFIGURAR_PORTAL");
  const erros = validarPoliticaDeSessao(nova);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
    const dados = paraAuditavelSessao(nova);
    await tx.configuracaoPortal.upsert({
      where: { id: ID_SINGLETON },
      create: { id: ID_SINGLETON, ...dados },
      update: dados,
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: ID_SINGLETON,
      autorId: ator.id,
      anterior: anterior
        ? paraAuditavelSessao({ tempoSessaoMin: anterior.tempoSessaoMin })
        : paraAuditavelSessao(POLITICA_SESSAO_PADRAO),
      novo: dados,
    });
  });
}

/** Só os campos da política de bloqueio, para a trilha de auditoria. */
function paraAuditavelLogin(politica: PoliticaDeLogin): Record<string, unknown> {
  return {
    loginMaxTentativas: politica.maxTentativas,
    loginBloqueioMin: politica.bloqueioMin,
  };
}

/** Política de bloqueio por login vigente — o padrão do domínio se não há linha. */
export async function lerPoliticaDeLogin(): Promise<PoliticaDeLogin> {
  const linha = await prisma.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
  if (!linha) return POLITICA_LOGIN_PADRAO;
  return { maxTentativas: linha.loginMaxTentativas, bloqueioMin: linha.loginBloqueioMin };
}

/** Salva a política de bloqueio por login — só Administrador, validada e auditada. */
export async function alterarPoliticaDeLogin(ator: Ator, nova: PoliticaDeLogin): Promise<void> {
  exigirPermissao(ator.papel, "CONFIGURAR_PORTAL");
  const erros = validarPoliticaDeLogin(nova);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
    const dados = paraAuditavelLogin(nova);
    await tx.configuracaoPortal.upsert({
      where: { id: ID_SINGLETON },
      create: { id: ID_SINGLETON, ...dados },
      update: dados,
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: ID_SINGLETON,
      autorId: ator.id,
      anterior: anterior
        ? paraAuditavelLogin({
            maxTentativas: anterior.loginMaxTentativas,
            bloqueioMin: anterior.loginBloqueioMin,
          })
        : paraAuditavelLogin(POLITICA_LOGIN_PADRAO),
      novo: dados,
    });
  });
}

/** Salva a política de senha — só Administrador, valores validados e auditados. */
export async function alterarPoliticaDeSenha(ator: Ator, nova: PoliticaDeSenha): Promise<void> {
  exigirPermissao(ator.papel, "CONFIGURAR_PORTAL");
  const erros = validarPoliticaDeSenha(nova);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
    const dados = paraAuditavel(nova);
    await tx.configuracaoPortal.upsert({
      where: { id: ID_SINGLETON },
      create: { id: ID_SINGLETON, ...dados },
      update: dados,
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: ID_SINGLETON,
      autorId: ator.id,
      // Sem linha ainda, o estado anterior efetivo é o padrão do domínio.
      anterior: anterior
        ? paraAuditavel({
            comprimentoMin: anterior.senhaComprimentoMin,
            exigeMaiuscula: anterior.senhaExigeMaiuscula,
            exigeMinuscula: anterior.senhaExigeMinuscula,
            exigeNumero: anterior.senhaExigeNumero,
            exigeSimbolo: anterior.senhaExigeSimbolo,
            historicoN: anterior.senhaHistoricoN,
          })
        : paraAuditavel(POLITICA_SENHA_PADRAO),
      novo: dados,
    });
  });
}

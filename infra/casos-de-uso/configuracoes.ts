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
import {
  type PoliticaDeOrigem,
  POLITICA_ORIGEM_PADRAO,
  validarPoliticaDeOrigem,
} from "@/dominio/usuarios/politica-origem";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Configurações do portal — leitura e escrita do singleton `ConfiguracaoPortal`.
 *
 * A escrita é de quem tem CONFIGURAR_PORTAL — o Administrador — e sempre
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
    senhaValidadeDias: politica.validadeDias,
    credencialProvisoriaHoras: politica.credencialProvisoriaHoras,
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
    validadeDias: linha.senhaValidadeDias,
    credencialProvisoriaHoras: linha.credencialProvisoriaHoras,
  };
}

/** Só o campo da política de sessão, para a trilha de auditoria. */
function paraAuditavelSessao(politica: PoliticaDeSessao): Record<string, unknown> {
  return { tempoSessaoMin: politica.tempoSessaoMin, sessaoTetoMin: politica.tetoMin };
}

/** Política de sessão vigente — o padrão do domínio quando não há linha. */
export async function lerPoliticaDeSessao(): Promise<PoliticaDeSessao> {
  const linha = await prisma.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
  if (!linha) return POLITICA_SESSAO_PADRAO;
  return { tempoSessaoMin: linha.tempoSessaoMin, tetoMin: linha.sessaoTetoMin };
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
        ? paraAuditavelSessao({ tempoSessaoMin: anterior.tempoSessaoMin, tetoMin: anterior.sessaoTetoMin })
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
            validadeDias: anterior.senhaValidadeDias,
            credencialProvisoriaHoras: anterior.credencialProvisoriaHoras,
          })
        : paraAuditavel(POLITICA_SENHA_PADRAO),
      novo: dados,
    });
  });
}

/** Só os campos da política de origem, para a trilha de auditoria. */
function paraAuditavelOrigem(politica: PoliticaDeOrigem): Record<string, unknown> {
  return {
    origemMaxTentativas: politica.maxTentativas,
    origemBloqueioMin: politica.bloqueioMin,
  };
}

/** Política de bloqueio por origem vigente — o padrão do domínio se não há linha. */
export async function lerPoliticaDeOrigem(): Promise<PoliticaDeOrigem> {
  const linha = await prisma.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
  if (!linha) return POLITICA_ORIGEM_PADRAO;
  return { maxTentativas: linha.origemMaxTentativas, bloqueioMin: linha.origemBloqueioMin };
}

/** Salva a política de bloqueio por origem — só Administrador, validada e auditada. */
export async function alterarPoliticaDeOrigem(ator: Ator, nova: PoliticaDeOrigem): Promise<void> {
  exigirPermissao(ator.papel, "CONFIGURAR_PORTAL");
  const erros = validarPoliticaDeOrigem(nova);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.configuracaoPortal.findUnique({ where: { id: ID_SINGLETON } });
    const dados = paraAuditavelOrigem(nova);
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
        ? paraAuditavelOrigem({
            maxTentativas: anterior.origemMaxTentativas,
            bloqueioMin: anterior.origemBloqueioMin,
          })
        : paraAuditavelOrigem(POLITICA_ORIGEM_PADRAO),
      novo: dados,
    });
  });
}

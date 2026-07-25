import type { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  apurarCusto,
  inicioDoMes,
  inicioDoMesSeguinte,
  type TarifaDossie,
  verificarTetos,
} from "@/dominio/dossie/custo";
import {
  MENSAGEM_NOVA_TENTATIVA_INVALIDA,
  marcarComoRevisado,
  podeMarcarComoRevisado,
  podeTentarNovamente,
  validarPedidoDeGeracao,
} from "@/dominio/dossie/regras";
import { ErroDeProvedor, type DossieProvider, type UsoDaExecucao } from "@/infra/dossie/provedor";
import { provedorAutomatico, provedorManual, tarifaConfigurada } from "@/infra/dossie/provedores";
import { versaoDoTemplate } from "@/infra/dossie/template";
import { logger } from "@/infra/log/logger";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do dossiê de due diligence (F8 — T11).
 *
 * Regras duras que moram aqui:
 *
 * - **Geração somente sob demanda.** Todo caminho começa num ator com a
 *   permissão GERAR_REVISAR_DOSSIE; não existe função que percorra
 *   empresas gerando dossiês, e uma geração por empresa de cada vez.
 * - **RN19.** O dossiê nasce com `revisado = false` (gerado por IA ou
 *   colado), e "marcar como revisado" grava autor e data. Nenhum caminho
 *   daqui toca em nota de indicador — o dossiê é evidência para a leitura
 *   humana, nunca pontuação.
 * - **Tetos antes de gastar.** O custo do pior caso é apurado antes de
 *   chamar a API e comparado ao teto unitário e ao consumo do mês; o teto
 *   também é reavaliado durante a execução, dentro do provedor.
 * - **Custo e duração por execução**, inclusive nas tentativas que falham.
 */

/** Estado auditável do dossiê (o conteúdo não entra: é volumoso). */
function estadoAuditavel(dossie: {
  empresaId: string;
  status: string;
  origem: string;
  revisado: boolean;
  revisorId: string | null;
  revisadoEm: Date | null;
  versaoTemplate: string | null;
  erro: string | null;
}) {
  return {
    empresaId: dossie.empresaId,
    status: dossie.status,
    origem: dossie.origem,
    revisado: dossie.revisado,
    revisorId: dossie.revisorId,
    revisadoEm: dossie.revisadoEm,
    versaoTemplate: dossie.versaoTemplate,
    erro: dossie.erro,
  };
}

/** Consumo em reais das execuções do mês da data de referência. */
export async function gastoDoMes(
  referencia: Date,
  cliente: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const soma = await cliente.dossieExecucao.aggregate({
    _sum: { custoBrl: true },
    where: {
      iniciadaEm: { gte: inicioDoMes(referencia), lt: inicioDoMesSeguinte(referencia) },
    },
  });
  return Number(soma._sum.custoBrl ?? 0);
}

export interface PedidoDeGeracao {
  empresaId: string;
  contextoAdicional?: string | null;
}

/**
 * T11 — "Gerar dossiê". Cria o dossiê em GERANDO depois de checar papel,
 * estágio, disponibilidade do provedor e tetos. Não executa a geração: a
 * ação da tela chama `processarGeracao` em seguida, fora do ciclo da
 * resposta, e a T11 acompanha pelo status.
 */
export async function pedirGeracaoDeDossie(
  ator: Ator,
  pedido: PedidoDeGeracao,
  agora: Date = new Date(),
): Promise<{ dossieId: string }> {
  exigirPermissao(ator.papel, "GERAR_REVISAR_DOSSIE");

  const estadoProvedor = provedorAutomatico();
  if (!estadoProvedor.disponivel) {
    throw new ErroDeValidacao([estadoProvedor.mensagem]);
  }

  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: pedido.empresaId },
    select: { id: true, nomeFantasia: true, site: true, estagio: true },
  });

  const emAndamento = await prisma.dossie.count({
    where: { empresaId: empresa.id, status: "GERANDO" },
  });

  const erros = validarPedidoDeGeracao({
    estagio: empresa.estagio,
    temGeracaoEmAndamento: emAndamento > 0,
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  const contexto = (pedido.contextoAdicional ?? "").trim() || null;
  const custoEstimado = await estimarOuFalhar(estadoProvedor.provedor, {
    nomeEmpresa: empresa.nomeFantasia,
    site: empresa.site,
    contextoAdicional: contexto,
  });

  const veredicto = verificarTetos({
    custoEstimado,
    gastoNoMes: await gastoDoMes(agora),
    tetos: estadoProvedor.tetos,
  });
  if (!veredicto.liberado) {
    throw new ErroDeValidacao([veredicto.mensagem]);
  }

  return prisma.$transaction(async (tx) => {
    const dossie = await tx.dossie.create({
      data: {
        empresaId: empresa.id,
        status: "GERANDO",
        origem: "GERADO_IA",
        solicitanteId: ator.id,
        contextoAdicional: contexto,
        versaoTemplate: versaoDoTemplate(),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "dossie",
      entidadeId: dossie.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(dossie),
    });
    return { dossieId: dossie.id };
  });
}

/** Converte a falha de estimativa em erro de validação legível na tela. */
async function estimarOuFalhar(
  provedor: DossieProvider,
  pedido: { nomeEmpresa: string; site: string | null; contextoAdicional: string | null },
): Promise<number> {
  try {
    return await provedor.estimarCustoMaximo(pedido);
  } catch (erro) {
    if (erro instanceof ErroDeProvedor) {
      throw new ErroDeValidacao([erro.message]);
    }
    throw erro;
  }
}

/**
 * T11 — "Tentar novamente" sobre uma geração que falhou. Reabre o mesmo
 * dossiê em GERANDO (o histórico de execuções fica), refazendo as
 * verificações de teto: o mês pode ter estourado desde a tentativa
 * anterior.
 */
export async function tentarNovamenteGeracao(
  ator: Ator,
  dossieId: string,
  agora: Date = new Date(),
): Promise<{ dossieId: string }> {
  exigirPermissao(ator.papel, "GERAR_REVISAR_DOSSIE");

  const estadoProvedor = provedorAutomatico();
  if (!estadoProvedor.disponivel) {
    throw new ErroDeValidacao([estadoProvedor.mensagem]);
  }

  const dossie = await prisma.dossie.findUniqueOrThrow({
    where: { id: dossieId },
    include: { empresa: { select: { nomeFantasia: true, site: true, estagio: true } } },
  });

  if (!podeTentarNovamente(dossie.status)) {
    throw new ErroDeValidacao([MENSAGEM_NOVA_TENTATIVA_INVALIDA]);
  }

  const custoEstimado = await estimarOuFalhar(estadoProvedor.provedor, {
    nomeEmpresa: dossie.empresa.nomeFantasia,
    site: dossie.empresa.site,
    contextoAdicional: dossie.contextoAdicional,
  });
  const veredicto = verificarTetos({
    custoEstimado,
    gastoNoMes: await gastoDoMes(agora),
    tetos: estadoProvedor.tetos,
  });
  if (!veredicto.liberado) {
    throw new ErroDeValidacao([veredicto.mensagem]);
  }

  await prisma.$transaction(async (tx) => {
    const atualizado = await tx.dossie.update({
      where: { id: dossie.id },
      data: { status: "GERANDO", erro: null, versaoTemplate: versaoDoTemplate() },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "dossie",
      entidadeId: dossie.id,
      autorId: ator.id,
      anterior: estadoAuditavel(dossie),
      novo: estadoAuditavel(atualizado),
    });
  });

  return { dossieId: dossie.id };
}

/**
 * Executa a geração de um dossiê que está em GERANDO e grava o resultado.
 * Roda fora do ciclo da resposta (a ação da T11 a dispara com `after`),
 * então nunca lança: a falha vira status FALHA com mensagem para o
 * analista, e o consumo realizado é registrado do mesmo jeito.
 */
export async function processarGeracao(
  dossieId: string,
  opcoes: { provedor?: DossieProvider; tarifa?: TarifaDossie; agora?: () => Date } = {},
): Promise<void> {
  const dossie = await prisma.dossie.findUnique({
    where: { id: dossieId },
    include: { empresa: { select: { nomeFantasia: true, site: true } } },
  });
  if (!dossie || dossie.status !== "GERANDO") {
    return;
  }

  const estadoProvedor = opcoes.provedor ? null : provedorAutomatico();
  const provedor = opcoes.provedor ?? (estadoProvedor?.disponivel ? estadoProvedor.provedor : null);
  const tarifa = opcoes.tarifa ?? tarifaConfigurada();
  const relogio = opcoes.agora ?? (() => new Date());

  const tentativa =
    (await prisma.dossieExecucao.aggregate({
      where: { dossieId: dossie.id },
      _max: { tentativa: true },
    }))._max.tentativa ?? 0;

  if (!provedor) {
    await concluirComFalha({
      dossie,
      tentativa: tentativa + 1,
      provedor: "anthropic",
      iniciadaEm: relogio(),
      concluidaEm: relogio(),
      mensagem:
        estadoProvedor && !estadoProvedor.disponivel
          ? estadoProvedor.mensagem
          : "Geração automática indisponível.",
      uso: null,
      tarifa: null,
    });
    return;
  }

  const iniciadaEm = relogio();
  const tetos = estadoProvedor?.disponivel ? estadoProvedor.tetos : null;

  try {
    const resultado = await provedor.gerar({
      nomeEmpresa: dossie.empresa.nomeFantasia,
      site: dossie.empresa.site,
      contextoAdicional: dossie.contextoAdicional,
      custoMaximoBrl: tetos?.unitarioBrl ?? null,
    });
    const concluidaEm = relogio();

    await prisma.$transaction(async (tx) => {
      const atualizado = await tx.dossie.update({
        where: { id: dossie.id },
        data: {
          status: "PRONTO",
          conteudo: resultado.conteudo as unknown as Prisma.InputJsonValue,
          erro: null,
        },
      });
      await tx.dossieExecucao.create({
        data: {
          dossieId: dossie.id,
          provedor: provedor.nome,
          modelo: resultado.modelo,
          tentativa: tentativa + 1,
          iniciadaEm,
          concluidaEm,
          duracaoMs: concluidaEm.getTime() - iniciadaEm.getTime(),
          tokensEntrada: resultado.uso.tokensEntrada,
          tokensSaida: resultado.uso.tokensSaida,
          buscasWeb: resultado.uso.buscasWeb,
          custoBrl: tarifa ? apurarCusto(resultado.uso, tarifa) : null,
          sucesso: true,
          versaoTemplate: dossie.versaoTemplate ?? versaoDoTemplate(),
        },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "dossie",
        entidadeId: dossie.id,
        // A geração corre por conta de quem pediu: a autoria da mutação é
        // do solicitante, nunca de um usuário técnico anônimo.
        autorId: dossie.solicitanteId,
        anterior: estadoAuditavel(dossie),
        novo: estadoAuditavel(atualizado),
      });
    });
  } catch (erro) {
    const mensagem =
      erro instanceof ErroDeProvedor
        ? erro.message
        : "A geração do dossiê falhou por um erro inesperado. Tente novamente ou insira o dossiê manualmente.";
    if (!(erro instanceof ErroDeProvedor)) {
      logger.error({ erro: String(erro), dossieId }, "falha inesperada na geração de dossiê");
    }
    await concluirComFalha({
      dossie,
      tentativa: tentativa + 1,
      provedor: provedor.nome,
      iniciadaEm,
      concluidaEm: relogio(),
      mensagem,
      uso: erro instanceof ErroDeProvedor ? erro.uso : null,
      tarifa: tarifa ?? null,
    });
  }
}

async function concluirComFalha(parametros: {
  dossie: {
    id: string;
    empresaId: string;
    status: string;
    origem: string;
    revisado: boolean;
    revisorId: string | null;
    revisadoEm: Date | null;
    versaoTemplate: string | null;
    erro: string | null;
    solicitanteId: string;
  };
  tentativa: number;
  provedor: string;
  iniciadaEm: Date;
  concluidaEm: Date;
  mensagem: string;
  uso: UsoDaExecucao | null;
  tarifa: TarifaDossie | null;
}): Promise<void> {
  const { dossie, uso, tarifa } = parametros;
  await prisma.$transaction(async (tx) => {
    const atualizado = await tx.dossie.update({
      where: { id: dossie.id },
      data: { status: "FALHA", erro: parametros.mensagem },
    });
    await tx.dossieExecucao.create({
      data: {
        dossieId: dossie.id,
        provedor: parametros.provedor,
        tentativa: parametros.tentativa,
        iniciadaEm: parametros.iniciadaEm,
        concluidaEm: parametros.concluidaEm,
        duracaoMs: parametros.concluidaEm.getTime() - parametros.iniciadaEm.getTime(),
        tokensEntrada: uso?.tokensEntrada ?? null,
        tokensSaida: uso?.tokensSaida ?? null,
        buscasWeb: uso?.buscasWeb ?? null,
        // Tentativa que falha também gasta: o custo entra no consumo do mês.
        custoBrl: uso && tarifa ? apurarCusto(uso, tarifa) : null,
        sucesso: false,
        erro: parametros.mensagem,
        versaoTemplate: dossie.versaoTemplate ?? versaoDoTemplate(),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "dossie",
      entidadeId: dossie.id,
      autorId: dossie.solicitanteId,
      anterior: estadoAuditavel(dossie),
      novo: estadoAuditavel(atualizado),
    });
  });
}

export interface DossieManual {
  empresaId: string;
  conteudoColado: string;
  contextoAdicional?: string | null;
}

/**
 * T11 — "Inserir manualmente": o analista cola o dossiê produzido fora da
 * plataforma. Nasce pronto e **não revisado** — a origem muda, a RN19 não.
 */
export async function inserirDossieManual(
  ator: Ator,
  dados: DossieManual,
  agora: Date = new Date(),
): Promise<{ dossieId: string; avisos: ReadonlyArray<string> }> {
  exigirPermissao(ator.papel, "GERAR_REVISAR_DOSSIE");

  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: dados.empresaId },
    select: { id: true, nomeFantasia: true, site: true, estagio: true },
  });

  const emAndamento = await prisma.dossie.count({
    where: { empresaId: empresa.id, status: "GERANDO" },
  });
  const erros = validarPedidoDeGeracao({
    estagio: empresa.estagio,
    temGeracaoEmAndamento: emAndamento > 0,
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  const provedor = provedorManual();
  let resultado;
  try {
    resultado = await provedor.gerar({
      nomeEmpresa: empresa.nomeFantasia,
      site: empresa.site,
      contextoAdicional: dados.contextoAdicional ?? null,
      conteudoColado: dados.conteudoColado,
    });
  } catch (erro) {
    if (erro instanceof ErroDeProvedor) {
      throw new ErroDeValidacao([erro.message, ...erro.detalhes]);
    }
    throw erro;
  }

  const dossieId = await prisma.$transaction(async (tx) => {
    const dossie = await tx.dossie.create({
      data: {
        empresaId: empresa.id,
        status: "PRONTO",
        origem: "INSERIDO_MANUALMENTE",
        conteudo: resultado.conteudo as unknown as Prisma.InputJsonValue,
        solicitanteId: ator.id,
        contextoAdicional: (dados.contextoAdicional ?? "").trim() || null,
        versaoTemplate: versaoDoTemplate(),
      },
    });
    await tx.dossieExecucao.create({
      data: {
        dossieId: dossie.id,
        provedor: provedor.nome,
        tentativa: 1,
        iniciadaEm: agora,
        concluidaEm: agora,
        duracaoMs: 0,
        // Colar não consome orçamento: custo nulo, não zero por acaso.
        custoBrl: null,
        sucesso: true,
        versaoTemplate: dossie.versaoTemplate ?? versaoDoTemplate(),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "dossie",
      entidadeId: dossie.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(dossie),
    });
    return dossie.id;
  });

  return { dossieId, avisos: resultado.avisos };
}

/**
 * RN19 — "marcar como revisado": ação humana explícita que grava autor e
 * data. É o único caminho que tira a tarja "gerado automaticamente —
 * requer revisão".
 */
export async function marcarDossieComoRevisado(
  ator: Ator,
  dossieId: string,
  agora: Date = new Date(),
): Promise<void> {
  exigirPermissao(ator.papel, "GERAR_REVISAR_DOSSIE");

  await prisma.$transaction(async (tx) => {
    const dossie = await tx.dossie.findUniqueOrThrow({ where: { id: dossieId } });
    const erros = podeMarcarComoRevisado(dossie);
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }
    const atualizado = await tx.dossie.update({
      where: { id: dossie.id },
      data: marcarComoRevisado(ator.id, agora),
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "dossie",
      entidadeId: dossie.id,
      autorId: ator.id,
      anterior: estadoAuditavel(dossie),
      novo: estadoAuditavel(atualizado),
    });
  });
}

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import type { ConteudoDossie } from "@/dominio/dossie/schema";
import type { DossieProvider } from "@/infra/dossie/provedor";
import { ErroDeProvedor } from "@/infra/dossie/provedor";
import { telaDossie } from "@/infra/consultas/dossies";
import { ErroDeValidacao } from "./contexto";
import {
  gastoDoMes,
  inserirDossieManual,
  marcarDossieComoRevisado,
  processarGeracao,
  tentarNovamenteGeracao,
} from "./dossies";

/**
 * Jornada do dossiê da F8 em nível de serviço (exige banco com seed):
 * inserção manual → RN19 (nasce requerendo revisão, revisão grava autor e
 * data) → geração assíncrona pronta/falha com custo e duração por
 * execução → nova tentativa depois da falha → telemetria consultável.
 *
 * O provedor é dublado: nenhuma chamada de rede e nenhuma chave — o que se
 * verifica aqui é o comportamento da plataforma.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

function conteudoValido(): ConteudoDossie {
  return {
    resumo_executivo: "Operadora de conectividade rural.",
    perfil: [
      { indicador: "Ano de fundação", valor: "2011", fonte: "site", confianca: "Alto" },
    ],
    produtos: [
      {
        nome: "Plano rural",
        descricao: "Conectividade via satélite.",
        problema: "Falta de internet no campo.",
        publico: "Produtores",
        preco: "Não foi encontrada informação pública",
        cobranca: "Assinatura",
        integracoes: "Não foi encontrada informação pública",
        tecnologias: "Satélite",
        diferenciais: "Cobertura",
        fontes: ["https://exemplo.com/planos"],
      },
    ],
    impacto_produtor: [
      {
        indicador: "Produtividade",
        valor: "Não foi encontrada informação pública",
        estudo_de_caso: "Não foi encontrada informação pública",
        fonte: "Não foi encontrada informação pública",
      },
    ],
    mercado: {
      clientes: ["Cooperativas"],
      parceiros: ["Revendas"],
      observacoes: "Distribuição por revendas.",
      fontes: ["https://exemplo.com/parceiros"],
    },
    concorrencia: [
      { empresa: "Concorrente A", comparacao: "Menor cobertura.", fontes: ["https://exemplo.com"] },
    ],
    swot: {
      forcas: ["Cobertura"],
      fraquezas: ["Preço"],
      oportunidades: ["Agro"],
      ameacas: ["LEO"],
    },
    gaps: [
      {
        informacao: "Clientes ativos",
        importancia: "Alta",
        pergunta_sugerida: "Quantos clientes ativos?",
      },
    ],
    roteiro_reuniao: Array.from({ length: 15 }, (_valor, indice) => `Pergunta ${indice + 1}`),
    fechamento: "Seções consistentes.",
    fontes_consultadas: ["https://exemplo.com"],
  };
}

/** Provedor dublado com resultado ou falha programada. */
function provedorFalso(
  comportamento:
    | { tipo: "sucesso"; tokensEntrada?: number; tokensSaida?: number }
    | { tipo: "falha"; erro: ErroDeProvedor },
): DossieProvider {
  return {
    nome: "anthropic",
    automatico: true,
    async estimarCustoMaximo() {
      return 1;
    },
    async gerar() {
      if (comportamento.tipo === "falha") {
        throw comportamento.erro;
      }
      return {
        conteudo: conteudoValido(),
        avisos: [],
        uso: {
          tokensEntrada: comportamento.tokensEntrada ?? 20_000,
          tokensSaida: comportamento.tokensSaida ?? 10_000,
          buscasWeb: 4,
        },
        modelo: "claude-opus-5",
      };
    },
  };
}

const TARIFA = { entradaBrlPorMilhao: 30, saidaBrlPorMilhao: 150 };

describe.skipIf(!temBanco)("dossiê de due diligence — casos de uso integrados (F8)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let scout: { id: string; papel: "ANALISTA_SCOUT" };
  let comercial: { id: string; papel: "COMERCIAL" };
  let empresaId = "";

  async function limparDadosDeTeste() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-F8]" } },
    });
    const ids = empresas.map((empresa) => empresa.id);
    const dossies = await prisma.dossie.findMany({ where: { empresaId: { in: ids } } });
    const dossieIds = dossies.map((dossie) => dossie.id);
    await prisma.dossieExecucao.deleteMany({ where: { dossieId: { in: dossieIds } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: "dossie", entidadeId: { in: dossieIds } },
    });
    await prisma.dossie.deleteMany({ where: { id: { in: dossieIds } } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    const porPapel = (papel: string) => {
      const usuario = usuarios.find((u) => u.papel === papel);
      if (!usuario) throw new Error(`Seed ausente: usuário ${papel}`);
      return usuario;
    };
    gestor = { id: porPapel("GESTOR").id, papel: "GESTOR" };
    scout = { id: porPapel("ANALISTA_SCOUT").id, papel: "ANALISTA_SCOUT" };
    comercial = { id: porPapel("COMERCIAL").id, papel: "COMERCIAL" };
    await limparDadosDeTeste();
  });

  beforeEach(async () => {
    await limparDadosDeTeste();
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-F8] Empresa do dossiê",
        estagio: "EM_AVALIACAO",
        origem: "SCOUTING_ATIVO",
        site: "https://exemplo.com",
      },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("RN19 — dossiê colado nasce pronto e requerendo revisão", async () => {
    const { dossieId } = await inserirDossieManual(scout, {
      empresaId,
      conteudoColado: JSON.stringify(conteudoValido()),
    });

    const dossie = await prisma.dossie.findUniqueOrThrow({ where: { id: dossieId } });
    expect(dossie.status).toBe("PRONTO");
    expect(dossie.origem).toBe("INSERIDO_MANUALMENTE");
    expect(dossie.revisado).toBe(false);
    expect(dossie.revisorId).toBeNull();
    expect(dossie.versaoTemplate).toMatch(/^v1@/);

    const execucao = await prisma.dossieExecucao.findFirstOrThrow({ where: { dossieId } });
    expect(execucao.provedor).toBe("manual");
    expect(execucao.custoBrl).toBeNull();
    expect(execucao.sucesso).toBe(true);
  });

  it("RN19 — marcar como revisado grava autor e data, e só acontece uma vez", async () => {
    const { dossieId } = await inserirDossieManual(scout, {
      empresaId,
      conteudoColado: JSON.stringify(conteudoValido()),
    });

    const quando = new Date("2026-07-25T14:00:00.000Z");
    await marcarDossieComoRevisado(gestor, dossieId, quando);

    const dossie = await prisma.dossie.findUniqueOrThrow({ where: { id: dossieId } });
    expect(dossie.revisado).toBe(true);
    expect(dossie.revisorId).toBe(gestor.id);
    expect(dossie.revisadoEm?.toISOString()).toBe(quando.toISOString());

    await expect(marcarDossieComoRevisado(gestor, dossieId)).rejects.toBeInstanceOf(
      ErroDeValidacao,
    );

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "dossie", entidadeId: dossieId },
    });
    expect(eventos.map((evento) => evento.campo)).toContain("revisado");
  });

  it("recusa conteúdo colado fora do schema, sem gravar dossiê", async () => {
    await expect(
      inserirDossieManual(scout, { empresaId, conteudoColado: '{"resumo_executivo": "x"}' }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
    expect(await prisma.dossie.count({ where: { empresaId } })).toBe(0);
  });

  it("Comercial vê, mas não gera nem revisa (matriz da ficha §2)", async () => {
    await expect(
      inserirDossieManual(comercial, {
        empresaId,
        conteudoColado: JSON.stringify(conteudoValido()),
      }),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });

  it("geração bem-sucedida grava conteúdo, custo e duração da execução", async () => {
    const dossie = await prisma.dossie.create({
      data: {
        empresaId,
        status: "GERANDO",
        origem: "GERADO_IA",
        solicitanteId: scout.id,
        versaoTemplate: "v1@teste",
      },
    });

    let instante = 0;
    const instantes = [
      new Date("2026-07-25T10:00:00.000Z"),
      new Date("2026-07-25T10:02:30.000Z"),
    ];
    await processarGeracao(dossie.id, {
      provedor: provedorFalso({ tipo: "sucesso" }),
      tarifa: TARIFA,
      agora: () => instantes[Math.min(instante++, instantes.length - 1)]!,
    });

    const gravado = await prisma.dossie.findUniqueOrThrow({
      where: { id: dossie.id },
      include: { execucoes: true },
    });
    expect(gravado.status).toBe("PRONTO");
    expect(gravado.erro).toBeNull();
    expect((gravado.conteudo as unknown as ConteudoDossie).swot.forcas).toEqual(["Cobertura"]);

    const execucao = gravado.execucoes[0]!;
    expect(execucao.sucesso).toBe(true);
    expect(execucao.duracaoMs).toBe(150_000);
    expect(execucao.tokensEntrada).toBe(20_000);
    expect(execucao.buscasWeb).toBe(4);
    // 20 mil de entrada (0,60) + 10 mil de saída (1,50) = 2,10
    expect(Number(execucao.custoBrl)).toBe(2.1);
    expect(execucao.modelo).toBe("claude-opus-5");
  });

  it("falha vira status FALHA com mensagem e registra o consumo já gasto", async () => {
    const dossie = await prisma.dossie.create({
      data: {
        empresaId,
        status: "GERANDO",
        origem: "GERADO_IA",
        solicitanteId: scout.id,
        versaoTemplate: "v1@teste",
      },
    });

    await processarGeracao(dossie.id, {
      provedor: provedorFalso({
        tipo: "falha",
        erro: new ErroDeProvedor("RECUSA", "O modelo recusou este pedido de pesquisa.", {
          uso: { tokensEntrada: 10_000, tokensSaida: 2_000, buscasWeb: 1 },
        }),
      }),
      tarifa: TARIFA,
    });

    const gravado = await prisma.dossie.findUniqueOrThrow({
      where: { id: dossie.id },
      include: { execucoes: true },
    });
    expect(gravado.status).toBe("FALHA");
    expect(gravado.erro).toContain("recusou");
    expect(gravado.conteudo).toBeNull();

    const execucao = gravado.execucoes[0]!;
    expect(execucao.sucesso).toBe(false);
    // 10 mil de entrada (0,30) + 2 mil de saída (0,30) = 0,60 — tentativa
    // que falha também consome orçamento.
    expect(Number(execucao.custoBrl)).toBe(0.6);
    expect(await gastoDoMes(new Date())).toBeGreaterThanOrEqual(0.6);
  });

  it("nova tentativa só depois da falha, e a segunda execução é registrada", async () => {
    const dossie = await prisma.dossie.create({
      data: {
        empresaId,
        status: "GERANDO",
        origem: "GERADO_IA",
        solicitanteId: scout.id,
        versaoTemplate: "v1@teste",
      },
    });

    await expect(tentarNovamenteGeracao(scout, dossie.id)).rejects.toBeInstanceOf(
      ErroDeValidacao,
    );

    await processarGeracao(dossie.id, {
      provedor: provedorFalso({
        tipo: "falha",
        erro: new ErroDeProvedor("FALHA_API", "A consulta às fontes públicas falhou."),
      }),
      tarifa: TARIFA,
    });

    // A tela reabre a geração; o provedor automático só existe com o
    // ambiente configurado, então aqui reabrimos direto para exercitar o
    // registro da segunda execução.
    await prisma.dossie.update({
      where: { id: dossie.id },
      data: { status: "GERANDO", erro: null },
    });
    await processarGeracao(dossie.id, {
      provedor: provedorFalso({ tipo: "sucesso" }),
      tarifa: TARIFA,
    });

    const execucoes = await prisma.dossieExecucao.findMany({
      where: { dossieId: dossie.id },
      orderBy: { tentativa: "asc" },
    });
    expect(execucoes.map((execucao) => execucao.tentativa)).toEqual([1, 2]);
    expect(execucoes[1]!.sucesso).toBe(true);
  });

  it("geração automática indisponível sem ambiente configurado — e o manual segue de pé", async () => {
    const dossie = await prisma.dossie.create({
      data: {
        empresaId,
        status: "GERANDO",
        origem: "GERADO_IA",
        solicitanteId: scout.id,
        versaoTemplate: "v1@teste",
      },
    });

    // Sem provedor injetado e sem ANTHROPIC_API_KEY no ambiente de teste,
    // a geração conclui em falha com a mensagem de indisponibilidade.
    await processarGeracao(dossie.id);

    const gravado = await prisma.dossie.findUniqueOrThrow({ where: { id: dossie.id } });
    expect(gravado.status).toBe("FALHA");
    expect(gravado.erro).toContain("indisponível");

    await prisma.dossie.delete({ where: { id: dossie.id } }).catch(() => undefined);
  });

  it("a T11 enxerga dossiê, execuções e o estado da configuração", async () => {
    const { dossieId } = await inserirDossieManual(scout, {
      empresaId,
      conteudoColado: JSON.stringify(conteudoValido()),
      contextoAdicional: "Indicada por cooperativa.",
    });

    const tela = await telaDossie(empresaId);
    expect(tela).not.toBeNull();
    expect(tela!.dossie?.id).toBe(dossieId);
    expect(tela!.dossie?.conteudo?.roteiro_reuniao).toHaveLength(15);
    expect(tela!.dossie?.conteudoInvalido).toEqual([]);
    expect(tela!.dossie?.execucoes).toHaveLength(1);
    expect(tela!.estagioAceitaDossie).toBe(true);
    expect(tela!.promptParaCopiar.usuario).toContain("[TESTE-F8] Empresa do dossiê");
    expect(tela!.promptParaCopiar.usuario).toContain("Indicada por cooperativa.");
    // Ambiente de teste não configura a chave: a tela informa e oferece o manual.
    expect(tela!.geracaoAutomatica.disponivel).toBe(false);
  });

  it("empresa em estágio sem dossiê recusa a inserção", async () => {
    await prisma.dossie.deleteMany({ where: { empresaId } });
    await prisma.empresa.update({ where: { id: empresaId }, data: { estagio: "EM_APROVACAO" } });
    await expect(
      inserirDossieManual(scout, {
        empresaId,
        conteudoColado: JSON.stringify(conteudoValido()),
      }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });
});

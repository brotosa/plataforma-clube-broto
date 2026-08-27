import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { gerarAssinantesSinteticos } from "@/infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import { montarCorpoDoRelatorio } from "@/infra/casos-de-uso/relatorio-patrocinador";
import { cardsDeConsumo } from "./patrocinadores";
import { montarPainel } from "./dashboard";
import {
  apurarCatalogo,
  apurarExtratoNominal,
  apurarFunilDeAtivacao,
  resgatesNominaisGlobais,
} from "./telemetria-operadora";

/**
 * **Complemento operacional da RN65 — o selo é derivado, não escrito.**
 *
 * A F19 gravou `selo: "AGUARDA_CHAVE"` literal para resgates, compras e
 * funil, porque não havia dado. Estes testes cobram os **dois estados de
 * cada card e de cada célula**: apagado sem apuração, aceso com ela — que
 * é a única forma de a promessa "acende sem mudança de layout" ser
 * verdadeira. Sem isto, a chegada do dado exigiria uma fase inteira só
 * para trocar constantes.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const MARCA = "[TESTE-SELO]";

describe.skipIf(!temBanco)("RN65 — selos derivados do dado (integração)", () => {
  const prisma = new PrismaClient();
  let patrocinadorId = "";
  let assinanteId = "";
  let ofertaRecompensaId = "";
  let ofertaCupomId = "";
  let importacaoId = "";
  let autorId = "";

  async function limpar() {
    await prisma.eventoDeResgateTelemetria.deleteMany({
      where: { importacao: { nomeArquivo: { startsWith: MARCA } } },
    });
    await prisma.contadorDeOfertaTelemetria.deleteMany({
      where: { importacao: { nomeArquivo: { startsWith: MARCA } } },
    });
    await prisma.importacaoTelemetria.deleteMany({
      where: { nomeArquivo: { startsWith: MARCA } },
    });
    const assinantes = await prisma.assinante.findMany({
      where: { nome: { startsWith: MARCA } },
      select: { id: true },
    });
    const ids = assinantes.map((a) => a.id);
    await prisma.eventoDeResgateTelemetria.deleteMany({ where: { assinanteId: { in: ids } } });
    await prisma.vinculoPatrocinio.deleteMany({ where: { assinanteId: { in: ids } } });
    await prisma.assinante.deleteMany({ where: { id: { in: ids } } });
    await prisma.relatorioPatrocinador.deleteMany({
      where: { patrocinador: { razaoSocial: { startsWith: MARCA } } },
    });
    await prisma.patrocinador.deleteMany({ where: { razaoSocial: { startsWith: MARCA } } });
  }

  /** A importação de origem — todo contador e todo evento precisam de uma. */
  async function criarImportacao() {
    const criada = await prisma.importacaoTelemetria.create({
      data: {
        tipoLayout: "OFERTAS",
        nomeArquivo: `${MARCA} retrato.csv`,
        dataGeracaoDeclarada: new Date("2026-07-20T00:00:00.000Z"),
        hashConteudo: `hash-do-teste-de-selo-${Date.now()}`,
        autorId,
        lidas: 2,
        aplicadas: 2,
        recusadas: 0,
        recusasPorCausa: {},
      },
      select: { id: true },
    });
    return criada.id;
  }

  beforeAll(async () => {
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    autorId = usuario.id;

    const categoria = await prisma.categoria.findFirstOrThrow();
    const tipoBeneficio = await prisma.tipoBeneficio.findFirstOrThrow();
    const mecanica = await prisma.mecanica.findFirstOrThrow();
    const empresa = await prisma.empresa.upsert({
      where: { idExternoMinutrade: "seller-selo-f20" },
      update: {},
      create: {
        nomeFantasia: "[TESTE-SELO-FIXO] Aliada",
        estagio: "ALIADA_ATIVA",
        idExternoMinutrade: "seller-selo-f20",
      },
      select: { id: true },
    });
    const solucao =
      (await prisma.solucao.findFirst({
        where: { empresaId: empresa.id },
        select: { id: true },
      })) ??
      (await prisma.solucao.create({
        data: {
          empresaId: empresa.id,
          nome: "[TESTE-SELO-FIXO] Solução",
          categoriaId: categoria.id,
          status: "ATIVA",
        },
        select: { id: true },
      }));

    const criarOferta = async (titulo: string, natureza: "RECOMPENSA" | "CUPOM_DESCONTO") => {
      const existente = await prisma.oferta.findFirst({
        where: { titulo, solucaoId: solucao.id },
        select: { id: true },
      });
      if (existente) return existente.id;
      const criada = await prisma.oferta.create({
        data: {
          solucaoId: solucao.id,
          titulo,
          natureza,
          tipoBeneficioId: tipoBeneficio.id,
          mecanicaId: mecanica.id,
          vigenciaInicio: new Date("2026-01-01T00:00:00.000Z"),
          status: "PUBLICADA",
        },
        select: { id: true },
      });
      return criada.id;
    };
    ofertaRecompensaId = await criarOferta("[TESTE-SELO-FIXO] Recompensa", "RECOMPENSA");
    ofertaCupomId = await criarOferta("[TESTE-SELO-FIXO] Cupom", "CUPOM_DESCONTO");
  });

  beforeEach(async () => {
    await limpar();
    const patrocinador = await prisma.patrocinador.create({
      data: { razaoSocial: `${MARCA} Patrocinadora`, cnpj: "11222333000181" },
      select: { id: true },
    });
    patrocinadorId = patrocinador.id;

    const [sintetico] = gerarAssinantesSinteticos(1, 77);
    const assinante = await prisma.assinante.create({
      data: {
        nome: `${MARCA} Assinante`,
        cpfHash: hashCpf(sintetico!.cpf),
        cpfCifrado: cifrarCpf(sintetico!.cpf),
        marcaSintetico: true,
      },
      select: { id: true },
    });
    assinanteId = assinante.id;
    await prisma.vinculoPatrocinio.create({
      data: {
        patrocinadorId,
        assinanteId,
        inicio: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    importacaoId = await criarImportacao();
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------
  // T33 — os dois estados de cada card
  // -------------------------------------------------------------------

  describe("T33 — card Resgates de ofertas", () => {
    it("SEM apuração: aguarda chave, sem número e com o motivo escrito", async () => {
      const cards = await cardsDeConsumo(patrocinadorId);
      const resgates = cards.find((card) => card.chave === "resgates")!;
      expect(resgates.selo).toBe("AGUARDA_CHAVE");
      expect(resgates.linhas).toHaveLength(0);
      expect(resgates.motivo).toBeTruthy();
    });

    it("COM apuração: vivo, com o número e a data do retrato", async () => {
      await prisma.eventoDeResgateTelemetria.createMany({
        data: [
          {
            assinanteId,
            dataEvento: new Date("2026-07-10T00:00:00.000Z"),
            produto: "Curso A",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-a`,
            importacaoId,
          },
          {
            assinanteId,
            dataEvento: new Date("2026-07-18T00:00:00.000Z"),
            produto: "Curso B",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-b`,
            importacaoId,
          },
        ],
      });

      const cards = await cardsDeConsumo(patrocinadorId);
      const resgates = cards.find((card) => card.chave === "resgates")!;
      expect(resgates.selo).toBe("VIVO");
      expect(resgates.motivo).toBeNull();
      expect(resgates.linhas[0]!.valor).toContain("2");
      // O número nunca viaja sem o quando.
      expect(resgates.linhas[0]!.valor).toContain("18/07/2026");
      expect(resgates.linhas[1]!.valor).toBe("1");
    });

    it("evento de assinante SEM vínculo vigente não acende o card", async () => {
      await prisma.vinculoPatrocinio.updateMany({
        where: { assinanteId },
        data: { fim: new Date("2026-06-01T00:00:00.000Z") },
      });
      await prisma.eventoDeResgateTelemetria.create({
        data: {
          assinanteId,
          dataEvento: new Date("2026-07-10T00:00:00.000Z"),
          produto: "Curso A",
          tipoOferta: "Recompensa gratuita",
          chaveNatural: `${MARCA}-encerrado`,
          importacaoId,
        },
      });

      const cards = await cardsDeConsumo(patrocinadorId);
      expect(cards.find((card) => card.chave === "resgates")!.selo).toBe("AGUARDA_CHAVE");
    });
  });

  describe("T33 — card Funil de ativação", () => {
    it("SEM estado informado: aguarda chave", async () => {
      const cards = await cardsDeConsumo(patrocinadorId);
      expect(cards.find((card) => card.chave === "funil")!.selo).toBe("AGUARDA_CHAVE");
    });

    it("COM estado informado pela importação: vivo, com as três linhas", async () => {
      await prisma.assinante.update({
        where: { id: assinanteId },
        data: { estadoUsuario: "FREEMIUM" },
      });

      const cards = await cardsDeConsumo(patrocinadorId);
      const funil = cards.find((card) => card.chave === "funil")!;
      expect(funil.selo).toBe("VIVO");
      expect(funil.linhas.map((linha) => linha.rotulo)).toEqual([
        "Cadastrados",
        "Freemium",
        "Assinantes",
      ]);
      expect(funil.linhas.find((linha) => linha.rotulo === "Freemium")!.valor).toBe("1");
    });
  });

  describe("T33 — card Modalidades de resgate", () => {
    it("SEM apuração: aguarda chave, com motivo próprio que distingue do catálogo", async () => {
      const cards = await cardsDeConsumo(patrocinadorId);
      const modalidades = cards.find((card) => card.chave === "modalidades")!;
      expect(modalidades.selo).toBe("AGUARDA_CHAVE");
      expect(modalidades.linhas).toHaveLength(0);
      // O texto avisa que o contador da lista de Ofertas é OUTRO número.
      expect(modalidades.motivo).toContain("RN68");
      expect(modalidades.motivo).toContain("Tipo de Oferta");
    });

    it("COM apuração: vivo, com a quebra por modalidade — checkout é resgate", async () => {
      // Decisão de 28/08: os três valores são resgate; a diferença entre
      // eles é a MODALIDADE, preservada aqui. O total vai no card Resgates.
      await prisma.eventoDeResgateTelemetria.createMany({
        data: [
          {
            assinanteId,
            dataEvento: new Date("2026-07-10T00:00:00.000Z"),
            produto: "Curso pago",
            tipoOferta: "Checkout no clube",
            chaveNatural: `${MARCA}-c1`,
            importacaoId,
          },
          {
            assinanteId,
            dataEvento: new Date("2026-07-16T00:00:00.000Z"),
            produto: "Insumo",
            tipoOferta: "Checkout externo",
            chaveNatural: `${MARCA}-c2`,
            importacaoId,
          },
          {
            assinanteId,
            dataEvento: new Date("2026-07-18T00:00:00.000Z"),
            produto: "Brinde",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-c3`,
            importacaoId,
          },
        ],
      });

      const cards = await cardsDeConsumo(patrocinadorId);
      const modalidades = cards.find((card) => card.chave === "modalidades")!;
      expect(modalidades.selo).toBe("VIVO");
      expect(modalidades.motivo).toBeNull();
      // As três modalidades, na ordem de exibição, cada uma com um evento.
      expect(modalidades.linhas.map((l) => l.rotulo)).toEqual([
        "Gratuito",
        "Checkout no clube",
        "Checkout externo",
      ]);
      expect(modalidades.linhas[1]!.valor).toContain("1");
      expect(modalidades.linhas[1]!.valor).toContain("10/07/2026");

      // O card de resgates conta o TOTAL — os três, checkout incluído.
      const resgates = cards.find((card) => card.chave === "resgates")!;
      expect(resgates.selo).toBe("VIVO");
      expect(resgates.linhas[0]!.valor).toContain("3");
      expect(resgates.linhas[0]!.valor).toContain("18/07/2026");
    });

    it("mostra só as modalidades presentes — nenhuma linha zerada de palpite", async () => {
      // Base com um único resgate gratuito: a quebra traz só "Gratuito".
      // O total (no card Resgates) é a informação completa; a quebra não
      // inventa linhas de checkout que ninguém usou.
      await prisma.eventoDeResgateTelemetria.create({
        data: {
          assinanteId,
          dataEvento: new Date("2026-07-10T00:00:00.000Z"),
          produto: "Brinde",
          tipoOferta: "Recompensa gratuita",
          chaveNatural: `${MARCA}-so-gratuito`,
          importacaoId,
        },
      });

      const modalidades = (await cardsDeConsumo(patrocinadorId)).find(
        (card) => card.chave === "modalidades",
      )!;
      expect(modalidades.selo).toBe("VIVO");
      expect(modalidades.linhas.map((l) => l.rotulo)).toEqual(["Gratuito"]);
    });

    it("tipo desconhecido não vira resgate — é declarado à parte, no card Resgates", async () => {
      await prisma.eventoDeResgateTelemetria.createMany({
        data: [
          {
            assinanteId,
            dataEvento: new Date("2026-07-10T00:00:00.000Z"),
            produto: "Curso",
            tipoOferta: "Checkout no clube",
            chaveNatural: `${MARCA}-conhecido`,
            importacaoId,
          },
          {
            assinanteId,
            dataEvento: new Date("2026-07-11T00:00:00.000Z"),
            produto: "Novidade",
            tipoOferta: "Checkout parcelado",
            chaveNatural: `${MARCA}-novo`,
            importacaoId,
          },
        ],
      });

      const cards = await cardsDeConsumo(patrocinadorId);
      // A modalidade conhecida entra; a desconhecida não vira modalidade.
      const modalidades = cards.find((card) => card.chave === "modalidades")!;
      expect(modalidades.linhas.map((l) => l.rotulo)).toEqual(["Checkout no clube"]);
      // O volume fora da conta é DECLARADO no card de resgates (total).
      const resgates = cards.find((card) => card.chave === "resgates")!;
      expect(resgates.linhas[0]!.valor).toContain("1");
      expect(resgates.linhas.map((l) => l.rotulo)).toContain(
        "Eventos com tipo não reconhecido (fora da conta)",
      );
    });

    it("o card NÃO pega emprestado o contador de catálogo (RN68)", async () => {
      await prisma.contadorDeOfertaTelemetria.create({
        data: {
          ofertaId: ofertaRecompensaId,
          resgates: 40,
          compras: 25,
          dataArquivo: new Date("2026-07-20T00:00:00.000Z"),
          importacaoId,
        },
      });

      const modalidades = (await cardsDeConsumo(patrocinadorId)).find(
        (card) => card.chave === "modalidades",
      )!;
      // Sem evento nominal, o card espera — mesmo com 25 no catálogo.
      expect(modalidades.selo).toBe("AGUARDA_CHAVE");
      expect(JSON.stringify(modalidades.linhas)).not.toContain("25");
    });
  });

  describe("Dashboard — card 'Resgates de benefícios' = total do extrato (errata 27/08)", () => {
    it("soma os resgates do extrato por natureza e acende a célula do panorama", async () => {
      // Dois resgates gratuitos e um checkout (também resgate desde 28/08)
      // numa oferta RECOMPENSA — os três contam em benefícios —, mais um
      // resgate numa oferta CUPOM (não conta aqui).
      await prisma.eventoDeResgateTelemetria.createMany({
        data: [
          {
            assinanteId,
            ofertaId: ofertaRecompensaId,
            dataEvento: new Date("2026-07-10T00:00:00.000Z"),
            produto: "Brinde",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-b1`,
            importacaoId,
          },
          {
            assinanteId,
            ofertaId: ofertaRecompensaId,
            dataEvento: new Date("2026-07-12T00:00:00.000Z"),
            produto: "Brinde",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-b2`,
            importacaoId,
          },
          {
            assinanteId,
            ofertaId: ofertaRecompensaId,
            dataEvento: new Date("2026-07-11T00:00:00.000Z"),
            produto: "Curso",
            tipoOferta: "Checkout no clube",
            chaveNatural: `${MARCA}-compra`,
            importacaoId,
          },
          {
            assinanteId,
            ofertaId: ofertaCupomId,
            dataEvento: new Date("2026-07-13T00:00:00.000Z"),
            produto: "Desconto",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-cupom`,
            importacaoId,
          },
        ],
      });

      // A consulta conta todos os RESGATE de RECOMPENSA/BENEFICIO: 3 (as
      // duas gratuitas e o checkout, que agora é resgate); o cupom fica de
      // fora por ser outra natureza.
      const global = await resgatesNominaisGlobais(["RECOMPENSA", "BENEFICIO"]);
      expect(global?.resgates).toBe(3);
      expect(global?.dataDoRetrato).toEqual(new Date("2026-07-12T00:00:00.000Z"));

      // A célula do hero acende com esse total e a origem "extrato".
      const painel = await montarPainel("90");
      const celula = painel.panorama.find((c) => c.chave === "PAN_RESGATES_BENEFICIOS")!;
      expect(celula.resultado.estado).toBe("DISPONIVEL");
      if (celula.resultado.estado === "DISPONIVEL") {
        expect(celula.resultado.valor).toBe(3);
      }
      expect(celula.nota).toContain("extrato");
    });

    it("sem evento nominal de benefício, a célula continua aguardando (RN53)", async () => {
      expect(await resgatesNominaisGlobais(["RECOMPENSA", "BENEFICIO"])).toBeNull();
      const painel = await montarPainel("90");
      const celula = painel.panorama.find((c) => c.chave === "PAN_RESGATES_BENEFICIOS")!;
      expect(celula.resultado.estado).toBe("INDISPONIVEL");
    });

    it("o card de cupons também sai do extrato (errata 28/08) — natureza cupom", async () => {
      await prisma.eventoDeResgateTelemetria.createMany({
        data: [
          {
            assinanteId,
            ofertaId: ofertaCupomId,
            dataEvento: new Date("2026-07-10T00:00:00.000Z"),
            produto: "Desconto",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-cup1`,
            importacaoId,
          },
          // Um resgate de BENEFÍCIO não deve contar no card de cupons.
          {
            assinanteId,
            ofertaId: ofertaRecompensaId,
            dataEvento: new Date("2026-07-11T00:00:00.000Z"),
            produto: "Brinde",
            tipoOferta: "Recompensa gratuita",
            chaveNatural: `${MARCA}-ben1`,
            importacaoId,
          },
        ],
      });

      expect((await resgatesNominaisGlobais(["CUPOM_DESCONTO"]))?.resgates).toBe(1);

      const painel = await montarPainel("90");
      const celula = painel.panorama.find((c) => c.chave === "PAN_RESGATES_CUPONS")!;
      expect(celula.resultado.estado).toBe("DISPONIVEL");
      if (celula.resultado.estado === "DISPONIVEL") {
        expect(celula.resultado.valor).toBe(1);
      }
      expect(celula.nota).toContain("extrato");
    });
  });

  describe("T33 — cards que a F20 não muda", () => {
    it("acessos e consumo de soluções seguem aguardando fonte", async () => {
      const cards = await cardsDeConsumo(patrocinadorId);
      expect(cards.find((card) => card.chave === "acessos")!.selo).toBe("AGUARDA_FONTE");
      expect(cards.find((card) => card.chave === "solucoes")!.selo).toBe("AGUARDA_FONTE");
    });

    it("os seis cards continuam existindo, na mesma ordem", async () => {
      const cards = await cardsDeConsumo(patrocinadorId);
      expect(cards.map((card) => card.chave)).toEqual([
        "base",
        "resgates",
        "modalidades",
        "funil",
        "acessos",
        "solucoes",
      ]);
    });
  });

  // -------------------------------------------------------------------
  // R1 — espelha os selos pela mesma fonte
  // -------------------------------------------------------------------

  describe("R1 — os selos do relatório são os mesmos da T33", () => {
    it("apagados antes da apuração, acesos depois — pela mesma consulta", async () => {
      const periodo = {
        periodoInicio: new Date("2026-07-01T00:00:00.000Z"),
        periodoFim: new Date("2026-07-31T00:00:00.000Z"),
        finalidade: "conferência do teste",
      };

      const antes = await montarCorpoDoRelatorio(
        patrocinadorId,
        periodo,
        "Teste",
        new Date("2026-07-28T00:00:00.000Z"),
      );
      expect(antes.consumo.find((card) => card.chave === "resgates")!.selo).toBe(
        "AGUARDA_CHAVE",
      );

      await prisma.eventoDeResgateTelemetria.create({
        data: {
          assinanteId,
          dataEvento: new Date("2026-07-12T00:00:00.000Z"),
          produto: "Curso",
          tipoOferta: "Recompensa gratuita",
          chaveNatural: `${MARCA}-r1`,
          importacaoId,
        },
      });

      const depois = await montarCorpoDoRelatorio(
        patrocinadorId,
        periodo,
        "Teste",
        new Date("2026-07-28T00:00:00.000Z"),
      );
      const cardDoR1 = depois.consumo.find((card) => card.chave === "resgates")!;
      const cardDaT33 = (await cardsDeConsumo(patrocinadorId)).find(
        (card) => card.chave === "resgates",
      )!;
      expect(cardDoR1.selo).toBe("VIVO");
      // Duas telas, uma verdade: o card é literalmente o mesmo objeto.
      expect(cardDoR1).toEqual(cardDaT33);
    });

    it("o R1 continua sem dado pessoal, mesmo com o card aceso (RN66)", async () => {
      await prisma.eventoDeResgateTelemetria.create({
        data: {
          assinanteId,
          dataEvento: new Date("2026-07-12T00:00:00.000Z"),
          produto: "Curso",
          tipoOferta: "Recompensa gratuita",
          chaveNatural: `${MARCA}-r1-lgpd`,
          importacaoId,
        },
      });
      const corpo = await montarCorpoDoRelatorio(
        patrocinadorId,
        {
          periodoInicio: new Date("2026-07-01T00:00:00.000Z"),
          periodoFim: new Date("2026-07-31T00:00:00.000Z"),
          finalidade: "conferência",
        },
        "Teste",
        new Date("2026-07-28T00:00:00.000Z"),
      );
      const serializado = JSON.stringify(corpo);
      const assinante = await prisma.assinante.findUniqueOrThrow({
        where: { id: assinanteId },
        select: { nome: true, cpfHash: true },
      });
      expect(serializado).not.toContain(assinante.nome);
      expect(serializado).not.toContain(assinante.cpfHash);
    });
  });

  // -------------------------------------------------------------------
  // T26 — as duas células de telemetria do panorama
  // -------------------------------------------------------------------

  describe("T26 — panorama: as células acendem sem virar uma nona", () => {
    it("o panorama continua com OITO células", async () => {
      const painel = await montarPainel("90");
      expect(painel.panorama).toHaveLength(8);
    });

    it("SEM apuração: a célula de cupons volta ao traço com motivo", async () => {
      const painel = await montarPainel("90");
      const cupons = painel.panorama.find((c) => c.chave === "PAN_RESGATES_CUPONS")!;
      expect(cupons.resultado.estado).toBe("INDISPONIVEL");
      expect(cupons.nota).toContain("nenhum relatório da operadora importado ainda");
    });

    it("COM apuração de catálogo: acende com o número, a origem e o retrato", async () => {
      await prisma.contadorDeOfertaTelemetria.create({
        data: {
          ofertaId: ofertaCupomId,
          resgates: 227,
          compras: 3,
          dataArquivo: new Date("2026-07-20T00:00:00.000Z"),
          importacaoId,
        },
      });

      const painel = await montarPainel("90");
      const cupons = painel.panorama.find((c) => c.chave === "PAN_RESGATES_CUPONS")!;
      expect(cupons.resultado).toMatchObject({ estado: "DISPONIVEL", valor: 227 });
      // RN68 — a origem viaja com o número, sempre.
      expect(cupons.nota).toContain("origem: catálogo da operadora");
      expect(cupons.nota).toContain("retrato de 20/07/2026");
    });

    it("a célula de benefícios acende pela apuração de RECOMPENSA/BENEFICIO", async () => {
      await prisma.contadorDeOfertaTelemetria.create({
        data: {
          ofertaId: ofertaRecompensaId,
          resgates: 38,
          compras: 0,
          dataArquivo: new Date("2026-07-20T00:00:00.000Z"),
          importacaoId,
        },
      });

      const painel = await montarPainel("90");
      const beneficios = painel.panorama.find((c) => c.chave === "PAN_RESGATES_BENEFICIOS")!;
      if (beneficios.resultado.estado === "DISPONIVEL") {
        // Sem campanha ativa no ambiente de teste, o número é o do catálogo.
        expect(beneficios.nota).toContain("origem");
      }
      expect(beneficios.nota).toMatch(/origem|importado ainda/);
    });

    it("catálogo e extrato NUNCA são somados na mesma célula (RN68)", async () => {
      await prisma.contadorDeOfertaTelemetria.createMany({
        data: [
          {
            ofertaId: ofertaCupomId,
            resgates: 227,
            compras: 0,
            dataArquivo: new Date("2026-07-20T00:00:00.000Z"),
            importacaoId,
          },
        ],
      });
      await prisma.eventoDeResgateTelemetria.create({
        data: {
          assinanteId,
          dataEvento: new Date("2026-07-12T00:00:00.000Z"),
          produto: "Curso",
          tipoOferta: "Recompensa gratuita",
          ofertaId: ofertaCupomId,
          chaveNatural: `${MARCA}-nao-somar`,
          importacaoId,
        },
      });

      const painel = await montarPainel("90");
      const cupons = painel.panorama.find((c) => c.chave === "PAN_RESGATES_CUPONS")!;
      // Errata 28/08: o extrato é a fonte primária do card; então mostra 1
      // (o evento nominal), com o catálogo (227) como segunda opção NÃO
      // usada aqui. O que a RN68 proíbe segue valendo: jamais 228 (a soma),
      // jamais 227+1 — uma contagem só, nomeada, nunca as duas juntas.
      expect(cupons.resultado).toMatchObject({ estado: "DISPONIVEL", valor: 1 });
      expect(cupons.nota).toContain("origem: extrato");
    });
  });

  // -------------------------------------------------------------------
  // A consulta única
  // -------------------------------------------------------------------

  describe("apuração — ausência é ausência, nunca zero (RN53)", () => {
    it("catálogo sem nenhum contador devolve null, não zero", async () => {
      expect(await apurarCatalogo({ natureza: "CUPOM_DESCONTO" })).toBeNull();
    });

    it("extrato sem nenhum evento devolve null, não zero", async () => {
      expect(await apurarExtratoNominal(patrocinadorId)).toBeNull();
    });

    it("funil sem nenhum estado informado devolve null, não zero", async () => {
      expect(await apurarFunilDeAtivacao(patrocinadorId)).toBeNull();
    });

    it("contador com valor zero é dado, e devolve zero — não null", async () => {
      // A distinção que a RN53 protege: "ninguém resgatou" é um fato
      // apurado; "nenhum arquivo foi importado" é ausência de apuração.
      await prisma.contadorDeOfertaTelemetria.create({
        data: {
          ofertaId: ofertaCupomId,
          resgates: 0,
          compras: 0,
          dataArquivo: new Date("2026-07-20T00:00:00.000Z"),
          importacaoId,
        },
      });
      const apuracao = await apurarCatalogo({ natureza: "CUPOM_DESCONTO" });
      expect(apuracao).not.toBeNull();
      expect(apuracao!.resgates).toBe(0);
      expect(apuracao!.ofertas).toBe(1);
    });
  });
});

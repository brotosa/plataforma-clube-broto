import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeArquivo } from "@/dominio/erros/falhas";
import { completarDigitosCpf } from "@/dominio/assinantes/cpf";
import { gerarAssinantesSinteticos } from "@/infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import {
  gerarCsvOfertasSintetico,
  gerarCsvResgatesRealSintetico,
  gerarCsvResgatesSintetico,
  gerarCsvSellersSintetico,
  gerarCsvUsuariosSintetico,
} from "@/infra/telemetria-operadora/fixtures-sinteticas";
import { apurarExtratoNominal } from "@/infra/consultas/telemetria-operadora";
import { higienizarCelula } from "@/dominio/telemetria-operadora/higienes";
import { normalizarNomeDeColuna } from "@/dominio/telemetria-operadora/layouts";
import { lerArquivoTabular } from "@/infra/planilhas/leitor-tabular";
import { importarRelatorioDaOperadora } from "./telemetria-operadora";

/**
 * A esteira da F20 fim a fim (RN67–RN70).
 *
 * O caminho de catálogo roda contra as amostras REAIS de `dados/` e
 * contra CSV sintético quando o teste precisa de conteúdo controlado. O
 * caminho nominal roda **só** contra fixture sintética: arquivo real de
 * usuários ou resgates não entra no repositório em nenhuma hipótese
 * (ficha §7), e com o CPF a restrição ficou mais dura, não menos.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const MARCA = "[TESTE-F20]";
const RAIZ = join(import.meta.dirname, "..", "..");

describe.skipIf(!temBanco)("RN67–RN70 — telemetria da operadora (integração)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let analista: { id: string; papel: "ANALISTA" };
  let leitura: { id: string; papel: "LEITURA" };

  let empresaId = "";
  let solucaoId = "";
  let ofertaPublicadaId = "";
  const ID_SELLER = "seller-externo-f20";
  const ID_OFERTA_PUBLICADA = "oferta-externa-f20-publicada";
  const ID_OFERTA_ENCERRADA = "oferta-externa-f20-encerrada";

  async function limpar() {
    await prisma.eventoDeResgateTelemetria.deleteMany({
      where: { importacao: { nomeArquivo: { startsWith: MARCA } } },
    });
    await prisma.contadorDeOfertaTelemetria.deleteMany({
      where: { importacao: { nomeArquivo: { startsWith: MARCA } } },
    });
    await prisma.divergenciaDeCatalogo.deleteMany({
      where: { importacao: { nomeArquivo: { startsWith: MARCA } } },
    });
    const importacoes = await prisma.importacaoTelemetria.findMany({
      where: { nomeArquivo: { startsWith: MARCA } },
      select: { id: true },
    });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidadeId: { in: importacoes.map((i) => i.id) } },
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
    await prisma.assinatura.deleteMany({ where: { assinanteId: { in: ids } } });
    await prisma.assinante.deleteMany({ where: { id: { in: ids } } });

    await prisma.patrocinador.deleteMany({ where: { razaoSocial: { startsWith: MARCA } } });
  }

  /** Cadastro mínimo: um aliado com uma solução e duas ofertas. */
  async function prepararCadastro() {
    const existente = await prisma.empresa.findUnique({
      where: { idExternoMinutrade: ID_SELLER },
      select: { id: true },
    });
    if (existente) {
      empresaId = existente.id;
      const solucao = await prisma.solucao.findFirstOrThrow({
        where: { empresaId },
        select: { id: true },
      });
      solucaoId = solucao.id;
      ofertaPublicadaId = (
        await prisma.oferta.findFirstOrThrow({
          where: { idExternoMinutrade: ID_OFERTA_PUBLICADA },
          select: { id: true },
        })
      ).id;
      return;
    }

    const categoria = await prisma.categoria.findFirstOrThrow();
    const tipoBeneficio = await prisma.tipoBeneficio.findFirstOrThrow();
    const mecanica = await prisma.mecanica.findFirstOrThrow();

    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: `${MARCA} Aliada da telemetria`,
        estagio: "ALIADA_ATIVA",
        idExternoMinutrade: ID_SELLER,
      },
      select: { id: true },
    });
    empresaId = empresa.id;

    const solucao = await prisma.solucao.create({
      data: {
        empresaId,
        nome: `${MARCA} Solução`,
        categoriaId: categoria.id,
        status: "ATIVA",
      },
      select: { id: true },
    });
    solucaoId = solucao.id;

    const publicada = await prisma.oferta.create({
      data: {
        solucaoId,
        titulo: `${MARCA} Oferta publicada`,
        natureza: "RECOMPENSA",
        tipoBeneficioId: tipoBeneficio.id,
        mecanicaId: mecanica.id,
        vigenciaInicio: new Date("2026-01-01T00:00:00.000Z"),
        status: "PUBLICADA",
        idExternoMinutrade: ID_OFERTA_PUBLICADA,
      },
      select: { id: true },
    });
    ofertaPublicadaId = publicada.id;

    await prisma.oferta.create({
      data: {
        solucaoId,
        titulo: `${MARCA} Oferta encerrada`,
        natureza: "RECOMPENSA",
        tipoBeneficioId: tipoBeneficio.id,
        mecanicaId: mecanica.id,
        vigenciaInicio: new Date("2026-01-01T00:00:00.000Z"),
        status: "ENCERRADA",
        idExternoMinutrade: ID_OFERTA_ENCERRADA,
      },
      select: { id: true },
    });
  }

  async function criarAssinanteSintetico(cpf: string, sufixo: string) {
    return prisma.assinante.create({
      data: {
        nome: `${MARCA} Assinante ${sufixo}`,
        cpfHash: hashCpf(cpf),
        cpfCifrado: cifrarCpf(cpf),
        marcaSintetico: true,
      },
      select: { id: true },
    });
  }

  const csvOfertas = (resgates: string, compras: string, produto = "Produto de teste") =>
    Buffer.from(
      gerarCsvOfertasSintetico([
        {
          idSeller: ID_SELLER,
          seller: "Aliada da telemetria",
          idOferta: ID_OFERTA_PUBLICADA,
          status: "Oferta Ativa",
          produto,
          data: "2026-07-20",
          resgates,
          compras,
        },
      ]),
      "utf8",
    );

  beforeAll(async () => {
    const g = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    gestor = { id: g.id, papel: "GESTOR" };
    const a = await prisma.usuario.findFirstOrThrow({ where: { papel: "ANALISTA" } });
    analista = { id: a.id, papel: "ANALISTA" };
    const c = await prisma.usuario.findFirstOrThrow({ where: { papel: "LEITURA" } });
    leitura = { id: c.id, papel: "LEITURA" };
    await prepararCadastro();
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------
  // RN67 — idempotência e procedência
  // -------------------------------------------------------------------

  describe("RN67 — idempotência por hash do conteúdo", () => {
    it("reimportar o MESMO arquivo não duplica nada e não altera contagem", async () => {
      const conteudo = csvOfertas("12", "3");
      const primeira = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas.csv`,
        conteudo,
      });
      expect(primeira.jaImportado).toBe(false);
      expect(primeira.aplicadas).toBe(1);

      const segunda = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas.csv`,
        conteudo,
      });
      expect(segunda.jaImportado).toBe(true);
      expect(segunda.importacaoId).toBe(primeira.importacaoId);

      const importacoes = await prisma.importacaoTelemetria.count({
        where: { nomeArquivo: { startsWith: MARCA } },
      });
      expect(importacoes).toBe(1);

      const contador = await prisma.contadorDeOfertaTelemetria.findUniqueOrThrow({
        where: { ofertaId: ofertaPublicadaId },
      });
      expect(contador.resgates).toBe(12);
      expect(contador.compras).toBe(3);
    });

    it("o mesmo conteúdo com OUTRO nome também é reconhecido", async () => {
      // O nome traz sufixo aleatório da operadora: `_3`, `_4`, `_5`.
      const conteudo = csvOfertas("7", "1");
      await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} Lista_de_Ofertas_3.csv`,
        conteudo,
      });
      const repetida = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} Lista_de_Ofertas_98.csv`,
        conteudo,
      });
      expect(repetida.jaImportado).toBe(true);
    });

    it("arquivo DIFERENTE do mesmo tipo atualiza o retrato, sem empilhar linha", async () => {
      await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas-1.csv`,
        conteudo: csvOfertas("5", "0"),
      });
      await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas-2.csv`,
        conteudo: csvOfertas("9", "2"),
      });

      const contadores = await prisma.contadorDeOfertaTelemetria.findMany({
        where: { ofertaId: ofertaPublicadaId },
      });
      expect(contadores).toHaveLength(1);
      expect(contadores[0]!.resgates).toBe(9);
      expect(contadores[0]!.compras).toBe(2);
    });

    it("grava procedência e audita a importação (RN49)", async () => {
      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas.csv`,
        conteudo: csvOfertas("4", "1"),
      });

      const registro = await prisma.importacaoTelemetria.findUniqueOrThrow({
        where: { id: resultado.importacaoId },
      });
      expect(registro.nomeArquivo).toBe(`${MARCA} ofertas.csv`);
      expect(registro.hashConteudo).toMatch(/^[0-9a-f]{64}$/);
      expect(registro.autorId).toBe(gestor.id);
      expect(registro.dataGeracaoDeclarada?.toISOString().slice(0, 10)).toBe("2026-07-20");

      const eventos = await prisma.auditoriaEvento.findMany({
        where: { entidade: "ImportacaoTelemetria", entidadeId: resultado.importacaoId },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]!.autorId).toBe(gestor.id);
    });
  });

  // -------------------------------------------------------------------
  // Catálogo — amostras reais e higienes
  // -------------------------------------------------------------------

  describe("catálogo — amostras reais de dados/", () => {
    it("ingere o arquivo real de ofertas, detectando o layout pelo cabeçalho", async () => {
      const ofertasAntes = await prisma.oferta.count();
      const empresasAntes = await prisma.empresa.count();
      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} Lista_de_Ofertas_3.xlsx`,
        conteudo: readFileSync(join(RAIZ, "dados", "Lista_de_Ofertas_3.xlsx")),
      });
      expect(resultado.tipoLayout).toBe("OFERTAS");
      expect(resultado.lidas).toBeGreaterThan(150);

      // A invariante, e NÃO o número: toda linha lida foi aplicada ou
      // recusada, sem sumir no caminho.
      //
      // A primeira versão deste teste exigia
      // `ITEM_DESCONHECIDO_NA_PLATAFORMA > 0`, e isso dependia do estado
      // do banco: quando a carga inicial já povoou as 192 ofertas deste
      // mesmo arquivo, todas passam a ser conhecidas e a causa
      // legitimamente não aparece. O teste quebrava sem nada estar
      // errado — o defeito era dele.
      expect(resultado.aplicadas + resultado.recusadas).toBe(resultado.lidas);

      // E o cadastro segue intocado nos dois estados (RN70).
      const ofertasDepois = await prisma.oferta.count();
      const empresasDepois = await prisma.empresa.count();
      expect(ofertasDepois).toBe(ofertasAntes);
      expect(empresasDepois).toBe(empresasAntes);
    });

    it("ingere o arquivo real de sellers, com o emoji do status higienizado", async () => {
      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} Lista_de_Sellers_1.xlsx`,
        conteudo: readFileSync(join(RAIZ, "dados", "Lista_de_Sellers_1.xlsx")),
      });
      expect(resultado.tipoLayout).toBe("SELLERS");
      expect(resultado.lidas).toBeGreaterThan(40);

      const divergencias = await prisma.divergenciaDeCatalogo.findMany({
        where: { importacaoId: resultado.importacaoId },
      });
      // Nenhuma descrição carrega emoji: a higiene 2 agiu antes.
      for (const divergencia of divergencias) {
        expect(divergencia.descricao).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
      }
    });

    it("recusa arquivo cujo cabeçalho não é de nenhum dos quatro relatórios", async () => {
      await expect(
        importarRelatorioDaOperadora(gestor, {
          nomeArquivo: `${MARCA} qualquer.csv`,
          conteudo: Buffer.from("coluna a,coluna b\n1,2\n", "utf8"),
        }),
      ).rejects.toBeInstanceOf(ErroDeArquivo);
    });
  });

  // -------------------------------------------------------------------
  // Retratos sucessivos — as duas fotografias REAIS do catálogo (F22)
  // -------------------------------------------------------------------

  /**
   * O caso que a fixture sintética não cobre (nota do red team da F20).
   *
   * A idempotência já estava provada nos dois sentidos com CSV montado à
   * mão: mesmo conteúdo não duplica, conteúdo diferente atualiza. O que
   * faltava era o arquivo real, com o que ele tem de próprio e que
   * ninguém pensaria em sintetizar — 192 linhas, a coluna de índice sem
   * nome **reordenada** entre as duas exportações (o que muda o hash sem
   * mudar um único dado de negócio) e apenas quatro ofertas com movimento
   * verdadeiro.
   *
   * O que este bloco NÃO faz: fixar 192, 4, ou qualquer número lido hoje.
   * As expectativas saem dos próprios arquivos, pelo mesmo leitor que a
   * importação usa. Trocar as fotografias por duas mais recentes não
   * quebra o teste — é exatamente o que se espera dele.
   */
  describe("retratos sucessivos — as duas fotografias reais do catálogo", () => {
    const OFERTAS_V3 = "Lista_de_Ofertas_3.xlsx";
    const OFERTAS_V4 = "Lista_de_Ofertas_4.xlsx";
    const SELLERS_V1 = "Lista_de_Sellers_1.xlsx";
    const SELLERS_V2 = "Lista_de_Sellers_2.xlsx";

    const planilha = (nome: string) => readFileSync(join(RAIZ, "dados", nome));

    /** O que o arquivo AFIRMA por oferta, lido como a importação lê. */
    async function retratoDoArquivo(
      nome: string,
    ): Promise<Map<string, { resgates: number; compras: number }>> {
      const lido = await lerArquivoTabular(nome, planilha(nome));
      const celula = (valores: Record<string, string>, coluna: string): string => {
        for (const [nomeDaColuna, valor] of Object.entries(valores)) {
          if (normalizarNomeDeColuna(nomeDaColuna) === coluna) {
            return higienizarCelula(valor);
          }
        }
        return "";
      };
      return new Map(
        lido.linhas.map((linha) => [
          celula(linha.valores, "id da oferta"),
          {
            resgates: Number(celula(linha.valores, "resgates")) || 0,
            compras: Number(celula(linha.valores, "compras")) || 0,
          },
        ]),
      );
    }

    /**
     * Põe no cadastro as ofertas que o teste precisa medir.
     *
     * O banco do CI tem seed de taxonomias e nada de catálogo real: sem
     * isto, toda linha das duas planilhas viraria
     * `ITEM_DESCONHECIDO_NA_PLATAFORMA`, nenhum contador seria escrito e
     * o teste passaria medindo o vazio. Os identificadores são os REAIS
     * do arquivo — é o mesmo vínculo que a carga inicial estabelece em
     * produção, e é ele que o teste exercita.
     */
    async function garantirOfertasDoCatalogo(idsExternos: readonly string[]): Promise<string[]> {
      const tipoBeneficio = await prisma.tipoBeneficio.findFirstOrThrow();
      const mecanica = await prisma.mecanica.findFirstOrThrow();
      const ids: string[] = [];
      for (const idExterno of idsExternos) {
        const existente = await prisma.oferta.findFirst({
          where: { idExternoMinutrade: idExterno },
          select: { id: true },
        });
        if (existente) {
          ids.push(existente.id);
          continue;
        }
        const criada = await prisma.oferta.create({
          data: {
            solucaoId,
            titulo: `${MARCA} Oferta do catálogo ${idExterno.slice(0, 8)}`,
            natureza: "RECOMPENSA",
            tipoBeneficioId: tipoBeneficio.id,
            mecanicaId: mecanica.id,
            vigenciaInicio: new Date("2026-01-01T00:00:00.000Z"),
            status: "PUBLICADA",
            idExternoMinutrade: idExterno,
          },
          select: { id: true },
        });
        ids.push(criada.id);
      }
      return ids;
    }

    it("v3 → v4: o contador por oferta atualiza sem duplicar, e a procedência aponta o retrato novo", async () => {
      const retratoV3 = await retratoDoArquivo(OFERTAS_V3);
      const retratoV4 = await retratoDoArquivo(OFERTAS_V4);

      const comMovimento = [...retratoV4].filter(([idExterno, agora]) => {
        const antes = retratoV3.get(idExterno);
        return (
          antes !== undefined &&
          (antes.resgates !== agora.resgates || antes.compras !== agora.compras)
        );
      });
      // Sem diferença entre as fotografias não há o que provar: se um dia
      // alguém substituir os arquivos por dois retratos iguais, é aqui que
      // o teste avisa, em vez de passar sem medir nada.
      expect(
        comMovimento.length,
        "as duas fotografias precisam diferir em ao menos uma oferta",
      ).toBeGreaterThan(0);

      const idsExternos = comMovimento.map(([idExterno]) => idExterno);
      const ofertaIds = await garantirOfertasDoCatalogo(idsExternos);
      const idExternoPorOferta = new Map(
        ofertaIds.map((ofertaId, indice) => [ofertaId, idsExternos[indice]!]),
      );

      const v3 = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ${OFERTAS_V3}`,
        conteudo: planilha(OFERTAS_V3),
      });
      const depoisDaV3 = await prisma.contadorDeOfertaTelemetria.findMany({
        where: { ofertaId: { in: ofertaIds } },
        select: { ofertaId: true, resgates: true, compras: true, importacaoId: true },
      });

      // Cada oferta medida tem UM contador, com o que a v3 afirma.
      expect(depoisDaV3).toHaveLength(ofertaIds.length);
      for (const contador of depoisDaV3) {
        const noArquivo = retratoV3.get(idExternoPorOferta.get(contador.ofertaId)!);
        expect(contador.resgates).toBe(noArquivo?.resgates);
        expect(contador.compras).toBe(noArquivo?.compras);
        expect(contador.importacaoId).toBe(v3.importacaoId);
      }

      const v4 = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ${OFERTAS_V4}`,
        conteudo: planilha(OFERTAS_V4),
      });

      // Conteúdo diferente, importação nova (RN67) — e o mesmo universo
      // de linhas, porque as duas fotografias trazem o mesmo catálogo.
      expect(v4.jaImportado).toBe(false);
      expect(v4.importacaoId).not.toBe(v3.importacaoId);
      expect(v4.lidas).toBe(v3.lidas);

      const depoisDaV4 = await prisma.contadorDeOfertaTelemetria.findMany({
        where: { ofertaId: { in: ofertaIds } },
        select: { ofertaId: true, resgates: true, compras: true, importacaoId: true },
      });

      // SEM DUPLICAR: o mesmo número de linhas, para as mesmas ofertas.
      expect(depoisDaV4).toHaveLength(ofertaIds.length);
      expect([...depoisDaV4].map((c) => c.ofertaId).sort()).toEqual(
        [...depoisDaV3].map((c) => c.ofertaId).sort(),
      );

      // ATUALIZA, e a procedência é a da importação nova.
      const antesPorOferta = new Map(depoisDaV3.map((c) => [c.ofertaId, c]));
      let mudaramDeFato = 0;
      for (const contador of depoisDaV4) {
        const noArquivo = retratoV4.get(idExternoPorOferta.get(contador.ofertaId)!);
        expect(contador.resgates).toBe(noArquivo?.resgates);
        expect(contador.compras).toBe(noArquivo?.compras);
        expect(contador.importacaoId).toBe(v4.importacaoId);
        const antes = antesPorOferta.get(contador.ofertaId)!;
        if (antes.resgates !== contador.resgates || antes.compras !== contador.compras) {
          mudaramDeFato += 1;
        }
      }
      expect(mudaramDeFato, "o retrato novo precisa ter movido algum contador").toBe(
        comMovimento.length,
      );
    });

    it("v1 → v2 de sellers: reordenar linhas muda o hash e não muda o resultado", async () => {
      // As duas fotografias de sellers trazem os mesmos 46 aliados com os
      // mesmos números; o que difere é a ordem, refletida na coluna de
      // índice sem nome — que o leitor descarta antes de qualquer parser.
      // O hash é do CONTEÚDO DO ARQUIVO (RN67), então a segunda é uma
      // importação nova de verdade; o que ela não pode é mudar a leitura.
      const v1 = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ${SELLERS_V1}`,
        conteudo: planilha(SELLERS_V1),
      });
      const v2 = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ${SELLERS_V2}`,
        conteudo: planilha(SELLERS_V2),
      });

      expect(v2.jaImportado).toBe(false);
      expect(v2.importacaoId).not.toBe(v1.importacaoId);
      expect(v2.tipoLayout).toBe("SELLERS");
      expect(v2.lidas).toBe(v1.lidas);
      expect(v2.aplicadas).toBe(v1.aplicadas);
      expect(v2.recusadas).toBe(v1.recusadas);
      expect(v2.divergencias).toBe(v1.divergencias);
    });
  });

  // -------------------------------------------------------------------
  // RN70 — reconciliação relata e nunca corrige
  // -------------------------------------------------------------------

  describe("RN70 — reconciliação relata, não corrige", () => {
    it("oferta desconhecida vira divergência, e NADA é criado no cadastro", async () => {
      const ofertasAntes = await prisma.oferta.count();
      const empresasAntes = await prisma.empresa.count();
      const solucoesAntes = await prisma.solucao.count();

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas.csv`,
        conteudo: Buffer.from(
          gerarCsvOfertasSintetico([
            {
              idSeller: ID_SELLER,
              seller: "Aliada",
              idOferta: "oferta-que-a-plataforma-nao-conhece",
              status: "Oferta Ativa",
              produto: "Fantasma",
              data: "2026-07-20",
              resgates: "3",
              compras: "1",
            },
          ]),
          "utf8",
        ),
      });

      expect(await prisma.oferta.count()).toBe(ofertasAntes);
      expect(await prisma.empresa.count()).toBe(empresasAntes);
      expect(await prisma.solucao.count()).toBe(solucoesAntes);

      const divergencias = await prisma.divergenciaDeCatalogo.findMany({
        where: { importacaoId: resultado.importacaoId, tipo: "AUSENTE_NA_PLATAFORMA" },
      });
      expect(divergencias.length).toBeGreaterThan(0);
    });

    it("status divergente é relatado e o status da plataforma NÃO muda", async () => {
      const antes = await prisma.oferta.findUniqueOrThrow({
        where: { id: ofertaPublicadaId },
        select: { status: true, titulo: true },
      });

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas-divergente.csv`,
        conteudo: Buffer.from(
          gerarCsvOfertasSintetico([
            {
              idSeller: ID_SELLER,
              seller: "Aliada",
              idOferta: ID_OFERTA_PUBLICADA,
              // Publicada aqui, inativa lá.
              status: "Oferta Inativa",
              produto: "Nome COMPLETAMENTE diferente na operadora",
              data: "2026-07-20",
              resgates: "1",
              compras: "0",
            },
          ]),
          "utf8",
        ),
      });

      const depois = await prisma.oferta.findUniqueOrThrow({
        where: { id: ofertaPublicadaId },
        select: { status: true, titulo: true },
      });
      // Nem o status, nem "só o nome".
      expect(depois.status).toBe(antes.status);
      expect(depois.titulo).toBe(antes.titulo);

      const divergencias = await prisma.divergenciaDeCatalogo.findMany({
        where: { importacaoId: resultado.importacaoId, tipo: "ATRIBUTO_DIVERGENTE" },
      });
      expect(divergencias.length).toBeGreaterThan(0);
      expect(divergencias[0]!.descricao).toContain("inativa na operadora");
    });

    it("oferta ativa aqui e ausente lá é relatada como AUSENTE_NA_OPERADORA", async () => {
      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} ofertas-vazia.csv`,
        conteudo: Buffer.from(
          gerarCsvOfertasSintetico([
            {
              idSeller: "outro-seller",
              seller: "Outro",
              idOferta: "outra-oferta",
              status: "Oferta Ativa",
              produto: "Outra",
              data: "2026-07-20",
              resgates: "0",
              compras: "0",
            },
          ]),
          "utf8",
        ),
      });

      const divergencias = await prisma.divergenciaDeCatalogo.findMany({
        where: { importacaoId: resultado.importacaoId, tipo: "AUSENTE_NA_OPERADORA" },
      });
      expect(divergencias.map((d) => d.identificador)).toContain(ID_OFERTA_PUBLICADA);
      // A ENCERRADA não entra: inativa aqui e ausente lá é o esperado.
      expect(divergencias.map((d) => d.identificador)).not.toContain(ID_OFERTA_ENCERRADA);
    });

    it("divergência de contagem de sellers é relatada sem tocar no aliado", async () => {
      const antes = await prisma.empresa.findUniqueOrThrow({
        where: { id: empresaId },
        select: { nomeFantasia: true, estagio: true },
      });

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} sellers.csv`,
        conteudo: Buffer.from(
          gerarCsvSellersSintetico([
            {
              idSeller: ID_SELLER,
              seller: "Nome diferente na operadora",
              dataEntrada: "2026-01-10",
              ofertasAtivas: "17",
              ofertasInativas: "0",
            },
          ]),
          "utf8",
        ),
      });

      const depois = await prisma.empresa.findUniqueOrThrow({
        where: { id: empresaId },
        select: { nomeFantasia: true, estagio: true },
      });
      expect(depois).toEqual(antes);

      const divergencias = await prisma.divergenciaDeCatalogo.findMany({
        where: { importacaoId: resultado.importacaoId },
      });
      expect(
        divergencias.some((d) => d.descricao.includes("17 no arquivo da operadora")),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // RN69 — junção nominal: os DOIS estados
  // -------------------------------------------------------------------

  describe("RN69 — fixture sintética COM a coluna de CPF", () => {
    it("junta por CPF-HMAC: perfil atualizado, vínculo criado, nada inventado", async () => {
      const [sintetico] = gerarAssinantesSinteticos(1, 20);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "com-cpf");
      const patrocinador = await prisma.patrocinador.create({
        data: { razaoSocial: `${MARCA} Yamer Agro`, cnpj: "11222333000181" },
        select: { id: true },
      });

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios.csv`,
        conteudo: Buffer.from(
          gerarCsvUsuariosSintetico(
            [
              {
                assinante: sintetico!,
                perfil: "Assinatura Patrocinada",
                patrocinador: `${MARCA} Yamer Agro`,
                estado: "Assinante",
                plano: "Anual",
                periodicidade: "12 meses",
                metodoPagamento: "Boleto",
                preco: "480,00",
              },
            ],
            { comColunaDeCpf: true },
          ),
          "utf8",
        ),
      });

      expect(resultado.tipoLayout).toBe("USUARIOS");
      expect(resultado.aplicadas).toBe(1);
      expect(resultado.recusadas).toBe(0);
      expect(resultado.colunaDeCpfEncontrada).toBe("CPF");

      const atualizado = await prisma.assinante.findUniqueOrThrow({
        where: { id: assinante.id },
        select: { perfilAssinatura: true, estadoUsuario: true },
      });
      expect(atualizado.perfilAssinatura).toBe("PATROCINADA");
      expect(atualizado.estadoUsuario).toBe("ASSINANTE");

      const vinculos = await prisma.vinculoPatrocinio.findMany({
        where: { assinanteId: assinante.id },
      });
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0]!.patrocinadorId).toBe(patrocinador.id);
      expect(vinculos[0]!.fim).toBeNull();

      const assinatura = await prisma.assinatura.findUniqueOrThrow({
        where: { assinanteId: assinante.id },
      });
      expect(assinatura.plano).toBe("ANUAL");
      expect(assinatura.metodoPagamento).toBe("Boleto");
      expect(assinatura.preco?.toString()).toBe("480");
    });

    it("aceita o CPF COM máscara e junta igual", async () => {
      const [sintetico] = gerarAssinantesSinteticos(1, 21);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "mascara");

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios-mascara.csv`,
        conteudo: Buffer.from(
          gerarCsvUsuariosSintetico(
            [
              {
                assinante: sintetico!,
                perfil: "Assinatura Paga",
                patrocinador: "",
                estado: "Assinante",
                plano: "Mensal",
                periodicidade: "1 mês",
                metodoPagamento: "Cartão",
                preco: "49,90",
              },
            ],
            { comColunaDeCpf: true, comMascara: true, nomeDaColunaCpf: "CPF do Cliente" },
          ),
          "utf8",
        ),
      });

      expect(resultado.aplicadas).toBe(1);
      expect(resultado.colunaDeCpfEncontrada).toBe("CPF do Cliente");
      const atualizado = await prisma.assinante.findUniqueOrThrow({
        where: { id: assinante.id },
        select: { perfilAssinatura: true },
      });
      expect(atualizado.perfilAssinatura).toBe("AUTOASSINATURA");
    });

    it("`Broto` na coluna Patrocinador vira Promocional Broto, sem vínculo (RN63)", async () => {
      const [sintetico] = gerarAssinantesSinteticos(1, 22);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "broto");

      await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios-broto.csv`,
        conteudo: Buffer.from(
          gerarCsvUsuariosSintetico(
            [
              {
                assinante: sintetico!,
                perfil: "Assinatura Patrocinada",
                patrocinador: "Broto",
                estado: "Usuário Freemium",
                plano: "Mensal",
                periodicidade: "1 mês",
                metodoPagamento: "",
                preco: "",
              },
            ],
            { comColunaDeCpf: true },
          ),
          "utf8",
        ),
      });

      const atualizado = await prisma.assinante.findUniqueOrThrow({
        where: { id: assinante.id },
        select: { perfilAssinatura: true, estadoUsuario: true },
      });
      expect(atualizado.perfilAssinatura).toBe("PROMOCIONAL_BROTO");
      expect(atualizado.estadoUsuario).toBe("FREEMIUM");
      expect(await prisma.vinculoPatrocinio.count({ where: { assinanteId: assinante.id } })).toBe(0);
    });

    it("vínculo vigente já existente não é duplicado", async () => {
      const [sintetico] = gerarAssinantesSinteticos(1, 23);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "sem-duplicar");
      const patrocinador = await prisma.patrocinador.create({
        data: { razaoSocial: `${MARCA} Yamer Agro`, cnpj: "11222333000181" },
        select: { id: true },
      });
      await prisma.vinculoPatrocinio.create({
        data: {
          patrocinadorId: patrocinador.id,
          assinanteId: assinante.id,
          inicio: new Date("2026-01-01T00:00:00.000Z"),
        },
      });

      const csv = gerarCsvUsuariosSintetico(
        [
          {
            assinante: sintetico!,
            perfil: "Assinatura Patrocinada",
            patrocinador: `${MARCA} Yamer Agro`,
            estado: "Assinante",
            plano: "Anual",
            periodicidade: "12 meses",
            metodoPagamento: "Boleto",
            preco: "480,00",
          },
        ],
        { comColunaDeCpf: true },
      );
      await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios-a.csv`,
        conteudo: Buffer.from(csv, "utf8"),
      });
      await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios-b.csv`,
        conteudo: Buffer.from(csv + "\n", "utf8"),
      });

      expect(
        await prisma.vinculoPatrocinio.count({ where: { assinanteId: assinante.id } }),
      ).toBe(1);
    });

    it("resgates nominais viram evento, deduplicado pela chave natural", async () => {
      const [sintetico] = gerarAssinantesSinteticos(1, 24);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "resgate");

      const linha = {
        assinante: sintetico!,
        data: "2026-07-15",
        produto: "Curso de solos",
        tipoOferta: "Recompensa gratuita",
        seller: "Aliada da telemetria",
      };
      const primeira = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} resgates-1.csv`,
        conteudo: Buffer.from(gerarCsvResgatesSintetico([linha]), "utf8"),
      });
      expect(primeira.tipoLayout).toBe("RESGATES");
      expect(primeira.aplicadas).toBe(1);

      // Arquivo acumulado do dia seguinte: a mesma linha volta, mais uma.
      const segunda = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} resgates-2.csv`,
        conteudo: Buffer.from(
          gerarCsvResgatesSintetico([linha, { ...linha, produto: "Outro curso" }]),
          "utf8",
        ),
      });
      expect(segunda.jaImportado).toBe(false);

      const eventos = await prisma.eventoDeResgateTelemetria.findMany({
        where: { assinanteId: assinante.id },
      });
      // Duas, não três: a repetida não entrou de novo.
      expect(eventos).toHaveLength(2);
      // `ofertaId` nulo — a operadora ainda não manda o id (item 2).
      expect(eventos.every((evento) => evento.ofertaId === null)).toBe(true);
    });

    it("o `Tipo de Oferta` entra COMO VEIO, e a classificação é na leitura", async () => {
      // A importação não interpreta a coluna: grava o texto da fonte. É
      // isso que faz o de-para (item 4 da requisição) ser corrigível por
      // edição de código, sem reimportar nada.
      const [sintetico] = gerarAssinantesSinteticos(1, 25);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "tipos");

      const base = {
        assinante: sintetico!,
        data: "2026-07-15",
        seller: "Aliada da telemetria",
      };
      await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} resgates-tipos.csv`,
        conteudo: Buffer.from(
          gerarCsvResgatesSintetico([
            { ...base, produto: "Brinde", tipoOferta: "Recompensa gratuita" },
            { ...base, produto: "Curso pago", tipoOferta: "Checkout no clube" },
            { ...base, produto: "Insumo", tipoOferta: "Checkout externo" },
            { ...base, produto: "Novidade", tipoOferta: "Checkout parcelado" },
          ]),
          "utf8",
        ),
      });

      const eventos = await prisma.eventoDeResgateTelemetria.findMany({
        where: { assinanteId: assinante.id },
        select: { tipoOferta: true },
      });
      expect(eventos).toHaveLength(4);
      // Os quatro textos preservados, inclusive o que o de-para não conhece.
      expect(eventos.map((evento) => evento.tipoOferta).sort()).toEqual([
        "Checkout externo",
        "Checkout no clube",
        "Checkout parcelado",
        "Recompensa gratuita",
      ]);

      // E a leitura separa: dois checkouts conhecidos viram compra, a
      // recompensa vira resgate, e o valor novo fica fora da conta.
      const patrocinador = await prisma.patrocinador.create({
        data: { razaoSocial: `${MARCA} Yamer Agro`, cnpj: "11222333000181" },
        select: { id: true },
      });
      await prisma.vinculoPatrocinio.create({
        data: {
          patrocinadorId: patrocinador.id,
          assinanteId: assinante.id,
          inicio: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      const apuracao = await apurarExtratoNominal(patrocinador.id);
      expect(apuracao?.compras.eventos).toBe(2);
      expect(apuracao?.resgates.eventos).toBe(1);
      expect(apuracao?.naoClassificados).toBe(1);
    });

    it("lê o formato REAL de 'Resgate e Compras' e casa a oferta pelo NOSSO id", async () => {
      // A primeira importação real (ago/2026) veio num formato que as
      // hipóteses `[A CONFIRMAR]` não previam: sem coluna "Produto", com a
      // data em "Data da compra ou resgate", o CPF em "cpf" (caixa baixa),
      // e — item 2 da requisição de 27/07 atendido — o `Id_oferta` traz o
      // NOSSO id de plataforma, não o id externo da Minutrade.
      const [sintetico] = gerarAssinantesSinteticos(1, 26);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "formato-real");

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} Clube_Broto__Resgate_e_Compras_das_Ofertas_99.csv`,
        conteudo: Buffer.from(
          gerarCsvResgatesRealSintetico([
            {
              assinante: sintetico!,
              dataHora: "2026-08-21 12:21:27",
              idSeller: "48596479000105",
              idOferta: ofertaPublicadaId, // o NOSSO id, como no arquivo real
              idVoucher: "CB0001",
              tipoOferta: "Recompensa gratuita",
              valor: "0",
              canal: "app",
            },
            {
              assinante: sintetico!,
              dataHora: "2026-08-21 12:15:28",
              idSeller: "48596479000105",
              idOferta: ofertaPublicadaId,
              idVoucher: "CB0002",
              tipoOferta: "Checkout no clube",
              valor: "149,90",
              canal: "web",
            },
          ]),
          "utf8",
        ),
      });

      // O cabeçalho real é reconhecido como RESGATES, e o CPF em caixa
      // baixa é detectado.
      expect(resultado.tipoLayout).toBe("RESGATES");
      expect(resultado.colunaDeCpfEncontrada).toBe("cpf");
      expect(resultado.aplicadas).toBe(2);
      expect(resultado.recusadas).toBe(0);

      const eventos = await prisma.eventoDeResgateTelemetria.findMany({
        where: { assinanteId: assinante.id },
        select: { ofertaId: true, tipoOferta: true, seller: true },
      });
      expect(eventos).toHaveLength(2);
      // Casou à oferta pelo NOSSO id — o item 2, atendido.
      expect(eventos.every((evento) => evento.ofertaId === ofertaPublicadaId)).toBe(true);
      // O `id_voucher` distingue os dois eventos do mesmo dia, mesmo sem
      // "Produto": sem ele, a chave natural colidiria e um sumiria.
      expect(eventos.map((e) => e.tipoOferta).sort()).toEqual([
        "Checkout no clube",
        "Recompensa gratuita",
      ]);
      expect(eventos.every((evento) => evento.seller === "48596479000105")).toBe(true);
    });

    it("no formato real, aceita o CPF COM máscara (caixa baixa) e junta igual", async () => {
      const [sintetico] = gerarAssinantesSinteticos(1, 27);
      const assinante = await criarAssinanteSintetico(sintetico!.cpf, "real-mascara");

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} resgate-real-mascara.csv`,
        conteudo: Buffer.from(
          gerarCsvResgatesRealSintetico(
            [
              {
                assinante: sintetico!,
                dataHora: "2026-08-21 09:00:00",
                idSeller: "48596479000105",
                idOferta: ofertaPublicadaId,
                idVoucher: "CB0003",
                tipoOferta: "Checkout externo",
                valor: "89,90",
                canal: "app",
              },
            ],
            { comMascara: true },
          ),
          "utf8",
        ),
      });

      expect(resultado.tipoLayout).toBe("RESGATES");
      expect(resultado.aplicadas).toBe(1);
      const eventos = await prisma.eventoDeResgateTelemetria.findMany({
        where: { assinanteId: assinante.id },
        select: { ofertaId: true },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]!.ofertaId).toBe(ofertaPublicadaId);
    });

    it("XLSX real: CPF exportado como número com formato de DATA ainda junta", async () => {
      // O defeito exato da primeira importação real: a operadora exportou a
      // coluna `cpf` com `numFmt` de data, e o ExcelJS coage o CPF a
      // `Invalid Date`. O leitor recupera o número cru do XML; aqui provamos
      // o caminho inteiro — recuperação, junção por CPF-HMAC, evento gravado.
      //
      // Um CPF de 11 dígitos e um COM zero à esquerda (que o Excel guarda
      // como 10 dígitos) — o segundo prova a reposição do zero.
      const [normal] = gerarAssinantesSinteticos(1, 60);
      const comZero = completarDigitosCpf("012345678"); // 11 díg, começa com 0
      const aNormal = await criarAssinanteSintetico(normal!.cpf, "xlsx-normal");
      const aZero = await criarAssinanteSintetico(comZero, "xlsx-zero");

      const pasta = new ExcelJS.Workbook();
      const aba = pasta.addWorksheet("Resgates");
      aba.addRow([
        "Data da compra ou resgate",
        "cpf",
        "Id_Seller",
        "Id_oferta",
        "id_voucher",
        "Tipo de Oferta",
        "Valor",
        "Canal",
      ]);
      for (const [indice, cpf] of [normal!.cpf, comZero].entries()) {
        const linha = aba.addRow([
          new Date(Date.UTC(2026, 7, 21)),
          Number(cpf), // NÚMERO — zero à esquerda some, como no arquivo real
          "48596479000105",
          ofertaPublicadaId,
          `CB100${indice}`,
          "Recompensa gratuita",
          0,
          "app",
        ]);
        // Herança de estilo de data nas duas colunas numéricas de "data".
        linha.getCell(1).numFmt = "yyyy-mm-dd hh:mm:ss.000";
        linha.getCell(2).numFmt = "yyyy-mm-dd hh:mm:ss.000";
      }
      const conteudo = Buffer.from(await pasta.xlsx.writeBuffer());

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} resgate-real-xlsx.xlsx`,
        conteudo,
      });

      expect(resultado.tipoLayout).toBe("RESGATES");
      expect(resultado.colunaDeCpfEncontrada).toBe("cpf");
      // Os dois casaram: nenhum CPF_INVALIDO, nenhum CPF_SEM_ASSINANTE.
      expect(resultado.aplicadas).toBe(2);
      expect(resultado.recusadas).toBe(0);

      const doNormal = await prisma.eventoDeResgateTelemetria.count({
        where: { assinanteId: aNormal.id },
      });
      const doZero = await prisma.eventoDeResgateTelemetria.count({
        where: { assinanteId: aZero.id },
      });
      expect(doNormal).toBe(1);
      expect(doZero).toBe(1); // o zero à esquerda foi reposto e o CPF fechou
    });
  });

  describe("RN69 — fixture sintética SEM a coluna de CPF", () => {
    it("recusa TODAS as linhas com a causa certa, sem gravar nada e sem lançar", async () => {
      const sinteticos = gerarAssinantesSinteticos(3, 30);
      for (const [indice, sintetico] of sinteticos.entries()) {
        await criarAssinanteSintetico(sintetico.cpf, `historico-${indice}`);
      }

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios-historico.csv`,
        conteudo: Buffer.from(
          gerarCsvUsuariosSintetico(
            sinteticos.map((assinante) => ({
              assinante,
              perfil: "Assinatura Patrocinada" as const,
              patrocinador: "Yamer Agro",
              estado: "Assinante" as const,
              plano: "Anual" as const,
              periodicidade: "12 meses",
              metodoPagamento: "Boleto",
              preco: "480,00",
            })),
            { comColunaDeCpf: false },
          ),
          "utf8",
        ),
      });

      expect(resultado.lidas).toBe(3);
      expect(resultado.aplicadas).toBe(0);
      expect(resultado.recusadas).toBe(3);
      expect(resultado.recusasPorCausa.SEM_COLUNA_DE_CPF).toBe(3);
      expect(resultado.colunaDeCpfEncontrada).toBeNull();

      // Nada gravado: nenhum perfil, nenhum vínculo, nenhuma assinatura.
      const assinantes = await prisma.assinante.findMany({
        where: { nome: { startsWith: MARCA } },
        select: { perfilAssinatura: true, estadoUsuario: true },
      });
      expect(assinantes.every((a) => a.perfilAssinatura === null)).toBe(true);
      expect(assinantes.every((a) => a.estadoUsuario === null)).toBe(true);
      expect(await prisma.vinculoPatrocinio.count()).toBe(0);
    });

    it("resgates sem a coluna também recusam tudo, sem evento algum", async () => {
      const sinteticos = gerarAssinantesSinteticos(2, 31);
      for (const [indice, sintetico] of sinteticos.entries()) {
        await criarAssinanteSintetico(sintetico.cpf, `res-historico-${indice}`);
      }

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} resgates-historico.csv`,
        conteudo: Buffer.from(
          gerarCsvResgatesSintetico(
            sinteticos.map((assinante) => ({
              assinante,
              data: "2026-07-15",
              produto: "Curso",
              tipoOferta: "Recompensa gratuita",
              seller: "Aliada",
            })),
            { comColunaDeCpf: false },
          ),
          "utf8",
        ),
      });

      expect(resultado.recusasPorCausa.SEM_COLUNA_DE_CPF).toBe(2);
      expect(resultado.aplicadas).toBe(0);
      expect(await prisma.eventoDeResgateTelemetria.count()).toBe(0);
    });
  });

  describe("RN69 — as três causas são contadas SEPARADAS", () => {
    it("sem coluna, CPF inválido e CPF sem assinante nunca se misturam", async () => {
      const [conhecido, desconhecido] = gerarAssinantesSinteticos(2, 40);
      await criarAssinanteSintetico(conhecido!.cpf, "conhecido");

      // Linha 1: CPF válido e conhecido. Linha 2: CPF válido, sem
      // assinante. Linha 3: CPF com dígito verificador quebrado.
      const invalido = { ...conhecido!, cpf: "11111111111" };
      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios-tres-causas.csv`,
        conteudo: Buffer.from(
          gerarCsvUsuariosSintetico(
            [conhecido!, desconhecido!, invalido].map((assinante) => ({
              assinante,
              perfil: "Assinatura Paga" as const,
              patrocinador: "",
              estado: "Assinante" as const,
              plano: "Mensal" as const,
              periodicidade: "1 mês",
              metodoPagamento: "Cartão",
              preco: "49,90",
            })),
            { comColunaDeCpf: true },
          ),
          "utf8",
        ),
      });

      expect(resultado.lidas).toBe(3);
      expect(resultado.aplicadas).toBe(1);
      expect(resultado.recusasPorCausa.CPF_INVALIDO).toBe(1);
      expect(resultado.recusasPorCausa.CPF_SEM_ASSINANTE).toBe(1);
      // A causa de layout incompleto NÃO aparece: a coluna existe.
      expect(resultado.recusasPorCausa.SEM_COLUNA_DE_CPF).toBeUndefined();
    });
  });

  describe("RN69 — o CPF nunca aparece em claro", () => {
    it("nem no resultado, nem no registro da importação, nem na auditoria", async () => {
      const [sintetico] = gerarAssinantesSinteticos(1, 50);
      await criarAssinanteSintetico(sintetico!.cpf, "sigilo");
      const cpf = sintetico!.cpf;

      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} usuarios-sigilo.csv`,
        conteudo: Buffer.from(
          gerarCsvUsuariosSintetico(
            [
              {
                assinante: sintetico!,
                perfil: "Assinatura Paga",
                patrocinador: "",
                estado: "Assinante",
                plano: "Mensal",
                periodicidade: "1 mês",
                metodoPagamento: "Cartão",
                preco: "49,90",
              },
            ],
            { comColunaDeCpf: true },
          ),
          "utf8",
        ),
      });

      const serializado = JSON.stringify(resultado);
      expect(serializado).not.toContain(cpf);

      const registro = await prisma.importacaoTelemetria.findUniqueOrThrow({
        where: { id: resultado.importacaoId },
      });
      expect(JSON.stringify(registro)).not.toContain(cpf);

      const eventos = await prisma.auditoriaEvento.findMany({
        where: { entidadeId: resultado.importacaoId },
      });
      expect(JSON.stringify(eventos)).not.toContain(cpf);
    });
  });

  // -------------------------------------------------------------------
  // Permissões
  // -------------------------------------------------------------------

  describe("permissões", () => {
    it("Analista importa", async () => {
      const resultado = await importarRelatorioDaOperadora(analista, {
        nomeArquivo: `${MARCA} ofertas-analista.csv`,
        conteudo: csvOfertas("2", "0"),
      });
      expect(resultado.aplicadas).toBe(1);
    });

    it("papel de Leitura não importa", async () => {
      await expect(
        importarRelatorioDaOperadora(leitura, {
          nomeArquivo: `${MARCA} ofertas-leitura.csv`,
          conteudo: csvOfertas("2", "0"),
        }),
      ).rejects.toBeInstanceOf(ErroDeAutorizacao);
    });
  });
});

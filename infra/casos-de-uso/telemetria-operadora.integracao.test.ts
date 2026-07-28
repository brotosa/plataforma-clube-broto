import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeArquivo } from "@/dominio/erros/falhas";
import { gerarAssinantesSinteticos } from "@/infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import {
  gerarCsvOfertasSintetico,
  gerarCsvResgatesSintetico,
  gerarCsvSellersSintetico,
  gerarCsvUsuariosSintetico,
} from "@/infra/telemetria-operadora/fixtures-sinteticas";
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
      const resultado = await importarRelatorioDaOperadora(gestor, {
        nomeArquivo: `${MARCA} Lista_de_Ofertas_3.xlsx`,
        conteudo: readFileSync(join(RAIZ, "dados", "Lista_de_Ofertas_3.xlsx")),
      });
      expect(resultado.tipoLayout).toBe("OFERTAS");
      expect(resultado.lidas).toBeGreaterThan(150);
      // Nenhuma das ofertas reais do arquivo está no cadastro de teste:
      // todas viram divergência, nenhuma vira correção (RN70).
      expect(resultado.recusasPorCausa.ITEM_DESCONHECIDO_NA_PLATAFORMA).toBeGreaterThan(0);
      expect(resultado.divergencias).toBeGreaterThan(0);
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

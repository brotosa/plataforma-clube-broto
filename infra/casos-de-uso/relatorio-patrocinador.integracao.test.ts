import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import {
  ENTIDADE_RELATORIO,
  gerarRelatorio,
  lerRegistroDeRelatorio,
  montarCorpoDoRelatorio,
} from "./relatorio-patrocinador";
import {
  criarPatrocinador,
  salvarContrato,
  vincularAssinante,
} from "./patrocinadores";

/**
 * RN66 — o R1 é agregado, e a prova é varredura, não revisão.
 *
 * O teste central aqui é o de vazamento: monta o corpo do relatório de um
 * patrocinador cuja base tem nome, CPF, e-mail e telefone conhecidos, e
 * procura os quatro no que saiu. É o mesmo padrão do teste de vazamento da
 * RN61 (rota de saúde), e pelo mesmo motivo: o que não pode aparecer é
 * fácil de reintroduzir sem querer, ao acrescentar um campo "só para
 * conferir".
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const CNPJ_VALIDO = "11222333000181";
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Dados sintéticos e reconhecíveis — nada disto pode sair no relatório. */
const NOME_DO_ASSINANTE = "[TESTE-RN66] Zoraide Purpurina Sintetica";
const CPF_DO_ASSINANTE = "52998224725";
const EMAIL_DO_ASSINANTE = "zoraide.purpurina@exemplo.invalido";
const TELEFONE_DO_ASSINANTE = "34999887766";

describe.skipIf(!temBanco)("RN66 — Relatório do Patrocinador (integração)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let analista: { id: string; papel: "ANALISTA" };
  let patrocinadorId = "";

  async function limpar() {
    const patrocinadores = await prisma.patrocinador.findMany({
      where: { razaoSocial: { startsWith: "[TESTE-RN66]" } },
      select: { id: true },
    });
    const ids = patrocinadores.map((p) => p.id);
    await prisma.relatorioPatrocinador.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.vinculoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.contratoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.patrocinador.deleteMany({ where: { id: { in: ids } } });
    await prisma.assinante.deleteMany({ where: { nome: { startsWith: "[TESTE-RN66]" } } });
  }

  beforeAll(async () => {
    const usuarioGestor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    gestor = { id: usuarioGestor.id, papel: "GESTOR" };
    const usuarioAnalista = await prisma.usuario.findFirstOrThrow({ where: { papel: "ANALISTA" } });
    analista = { id: usuarioAnalista.id, papel: "ANALISTA" };
  });

  beforeEach(async () => {
    await limpar();
    const { id } = await criarPatrocinador(gestor, {
      razaoSocial: "[TESTE-RN66] Patrocinadora do relatório",
      cnpj: CNPJ_VALIDO,
      segmento: "Insumos",
      contatoNome: null,
      contatoEmail: null,
      contatoTelefone: null,
      responsavelComercialId: null,
      observacoes: null,
    });
    patrocinadorId = id;
    await salvarContrato(gestor, id, {
      dataAssinatura: dia("2026-01-15"),
      vigenciaInicio: dia("2026-02-01"),
      vigenciaFim: dia("2027-01-31"),
      precoUnitario: "120.00",
      valorTotalContratado: "60000.00",
      assinaturasAdquiridas: 500,
    });
    const assinante = await prisma.assinante.create({
      data: {
        nome: NOME_DO_ASSINANTE,
        cpfHash: hashCpf(CPF_DO_ASSINANTE),
        cpfCifrado: cifrarCpf(CPF_DO_ASSINANTE),
        email: EMAIL_DO_ASSINANTE,
        telefone: TELEFONE_DO_ASSINANTE,
        marcaSintetico: true,
      },
      select: { id: true },
    });
    await vincularAssinante(gestor, id, assinante.id, dia("2026-02-01"));
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  describe("agregado — nenhum dado pessoal identificável", () => {
    it("o corpo gerado não contém nome, CPF, e-mail nem telefone de assinante", async () => {
      const corpo = await montarCorpoDoRelatorio(
        patrocinadorId,
        {
          periodoInicio: dia("2026-02-01"),
          periodoFim: dia("2026-07-31"),
          finalidade: "prestação de contas semestral",
        },
        "Gestor de teste",
        dia("2026-07-27"),
      );
      const serializado = JSON.stringify(corpo);

      // O nome inteiro, e também cada parte dele: um relatório que
      // vazasse só o sobrenome vazaria assim mesmo.
      for (const trecho of ["Zoraide", "Purpurina", NOME_DO_ASSINANTE]) {
        expect(serializado, `nome no corpo (${trecho})`).not.toContain(trecho);
      }
      // CPF em todas as formas em que ele poderia aparecer.
      for (const forma of [
        CPF_DO_ASSINANTE,
        "529.982.247-25",
        "529982247-25",
        hashCpf(CPF_DO_ASSINANTE),
      ]) {
        expect(serializado, `CPF no corpo (${forma})`).not.toContain(forma);
      }
      expect(serializado).not.toContain(EMAIL_DO_ASSINANTE);
      expect(serializado).not.toContain("exemplo.invalido");
      expect(serializado).not.toContain(TELEFONE_DO_ASSINANTE);
    });

    it("mas o corpo traz os agregados que o patrocinador precisa ver", async () => {
      const corpo = await montarCorpoDoRelatorio(
        patrocinadorId,
        {
          periodoInicio: dia("2026-02-01"),
          periodoFim: dia("2026-07-31"),
          finalidade: "prestação de contas semestral",
        },
        "Gestor de teste",
        dia("2026-07-27"),
      );
      expect(corpo.saldo).toMatchObject({ estado: "APURADO", adquiridas: 500, ativadas: 1 });
      expect(corpo.base.vinculosVigentes).toBe(1);
      expect(corpo.consumo).toHaveLength(6);
      expect(corpo.finalidade).toBe("prestação de contas semestral");
    });

    it("sem adquiridas confirmadas, o relatório diz o motivo — não escreve zero", async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: null,
        vigenciaInicio: null,
        vigenciaFim: null,
        precoUnitario: null,
        valorTotalContratado: null,
        assinaturasAdquiridas: null,
      });
      const corpo = await montarCorpoDoRelatorio(
        patrocinadorId,
        {
          periodoInicio: dia("2026-02-01"),
          periodoFim: dia("2026-07-31"),
          finalidade: "conferência",
        },
        "Gestor de teste",
        dia("2026-07-27"),
      );
      expect(corpo.saldo.estado).toBe("INDISPONIVEL");
      expect(corpo.saldo).not.toHaveProperty("saldo");
      if (corpo.saldo.estado === "INDISPONIVEL") {
        expect(corpo.saldo.motivo).toBeTruthy();
      }
    });
  });

  describe("toda geração é auditada com período e finalidade", () => {
    it("grava o registro e o evento de auditoria", async () => {
      const { id } = await gerarRelatorio(gestor, patrocinadorId, {
        periodoInicio: dia("2026-02-01"),
        periodoFim: dia("2026-07-31"),
        finalidade: "prestação de contas semestral",
      });
      const registro = await lerRegistroDeRelatorio(gestor, id);
      expect(registro).toMatchObject({ finalidade: "prestação de contas semestral" });

      const eventos = await prisma.auditoriaEvento.findMany({
        where: { entidade: ENTIDADE_RELATORIO, entidadeId: id },
      });
      const campos = eventos.map((evento) => evento.campo);
      expect(campos).toContain("finalidade");
      expect(campos).toContain("periodoInicio");
      expect(campos).toContain("periodoFim");
      await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: id } });
      await prisma.relatorioPatrocinador.delete({ where: { id } });
    });

    it("recusa período invertido e finalidade vazia, nomeando a causa", async () => {
      await expect(
        gerarRelatorio(gestor, patrocinadorId, {
          periodoInicio: dia("2026-07-31"),
          periodoFim: dia("2026-02-01"),
          finalidade: "x",
        }),
      ).rejects.toThrow(/não pode ser anterior ao início/);
      await expect(
        gerarRelatorio(gestor, patrocinadorId, {
          periodoInicio: dia("2026-02-01"),
          periodoFim: dia("2026-07-31"),
          finalidade: "   ",
        }),
      ).rejects.toThrow(/Declare a finalidade/);
    });

    it("o Analista não gera o R1 — a célula é do Gestor", async () => {
      await expect(
        gerarRelatorio(analista, patrocinadorId, {
          periodoInicio: dia("2026-02-01"),
          periodoFim: dia("2026-07-31"),
          finalidade: "tentativa",
        }),
      ).rejects.toThrow(ErroDeAutorizacao);
    });

    it("mas LÊ um registro gerado: a leitura é de todos os papéis", async () => {
      const { id } = await gerarRelatorio(gestor, patrocinadorId, {
        periodoInicio: dia("2026-02-01"),
        periodoFim: dia("2026-07-31"),
        finalidade: "leitura",
      });
      await expect(lerRegistroDeRelatorio(analista, id)).resolves.toMatchObject({
        finalidade: "leitura",
      });
      await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: id } });
      await prisma.relatorioPatrocinador.delete({ where: { id } });
    });
  });
});

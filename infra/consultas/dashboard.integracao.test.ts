import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  CATALOGO_ACAO_HOJE,
  CATALOGO_INDICADORES,
  campanhaEtiquetada,
} from "@/dominio/dashboard/indicadores";
import {
  PERIODOS_DASHBOARD,
  janelaDoDashboard,
  montarPainel,
  pendenciasDeHoje,
  periodoValido,
} from "./dashboard";

/**
 * Integração da T26 (executa apenas com banco disponível).
 *
 * O que se prova aqui não é o valor de cada indicador — isso muda com a
 * base —, e sim as invariantes que a RN50 exige do painel inteiro: todo
 * indicador do catálogo é apurado, nenhum outro aparece, números de
 * campanha saem etiquetados, o indicador que depende de telemetria por CPF
 * declara a indisponibilidade em vez de devolver 0%, e as seis contagens
 * da faixa vêm de query real (mexer no banco muda a contagem).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const prisma = new PrismaClient();

let empresaId = "";
let usuarioId = "";

async function usuarioDeTeste() {
  const usuario = await prisma.usuario.upsert({
    where: { email: "dashboard-f13@teste.local" },
    update: {},
    create: {
      nome: "Perfil de teste (F13)",
      email: "dashboard-f13@teste.local",
      senhaHash: "sem-login",
      papel: "GESTOR",
    },
  });
  return usuario.id;
}

describe.skipIf(!temBanco)("T26 — painel do Dashboard (RN50)", () => {
  beforeAll(async () => {
    usuarioId = await usuarioDeTeste();
  });

  afterAll(async () => {
    if (empresaId) {
      await prisma.empresa.deleteMany({ where: { id: empresaId } });
    }
    await prisma.$disconnect();
  });

  it("apura TODOS os indicadores do catálogo, e só eles", async () => {
    const painel = await montarPainel("90");
    const apurados = painel.blocos.flatMap((bloco) =>
      bloco.indicadores.map((indicador) => indicador.chave),
    );
    expect([...apurados].sort()).toEqual(
      CATALOGO_INDICADORES.map((definicao) => definicao.chave).sort(),
    );
  });

  it("nenhum indicador fica sem estado — disponível ou indisponível com motivo", async () => {
    const painel = await montarPainel("90");
    for (const bloco of painel.blocos) {
      for (const indicador of bloco.indicadores) {
        if (indicador.resultado.estado === "INDISPONIVEL") {
          expect(indicador.resultado.motivo, indicador.chave).toBeTruthy();
        } else {
          expect(Number.isFinite(indicador.resultado.valor), indicador.chave).toBe(true);
        }
      }
    }
  });

  it("todo número de campanha viaja com a etiqueta de atribuição (RN43)", async () => {
    const painel = await montarPainel("90");
    const campanhas = painel.blocos.find((bloco) => bloco.bloco === "CAMPANHAS");
    expect(campanhas).toBeDefined();
    for (const indicador of campanhas!.indicadores) {
      expect(campanhaEtiquetada(indicador), indicador.chave).toBe(true);
    }
  });

  it("uso por assinante fica indisponível enquanto a telemetria não trouxer CPF", async () => {
    const comCpf = await prisma.telemetriaEvento.count({
      where: { cpfHash: { not: null } },
    });
    const painel = await montarPainel("90");
    const uso = painel.blocos
      .flatMap((bloco) => bloco.indicadores)
      .find((indicador) => indicador.chave === "ASSINANTES_COM_USO_90D_PCT");

    expect(uso).toBeDefined();
    if (comCpf === 0) {
      expect(uso!.resultado).toEqual({
        estado: "INDISPONIVEL",
        motivo: "AGUARDA_TELEMETRIA_ASSINANTE",
      });
    } else {
      // Com granularidade disponível, o indicador existe de verdade.
      expect(uso!.resultado.estado).toBeDefined();
    }
  });

  it("a faixa traz as seis pendências da ficha, com destino resolvido", async () => {
    const pendencias = await pendenciasDeHoje();
    expect(pendencias.map((p) => p.chave)).toEqual(CATALOGO_ACAO_HOJE.map((p) => p.chave));
    for (const pendencia of pendencias) {
      expect(pendencia.contagem, pendencia.chave).toBeGreaterThanOrEqual(0);
      expect(pendencia.destino.startsWith("/"), pendencia.chave).toBe(true);
    }
  });

  it("a contagem de reavaliações vem de query real — marcar uma empresa a move", async () => {
    const antes =
      (await pendenciasDeHoje()).find((p) => p.chave === "REAVALIACOES_VENCIDAS")?.contagem ?? 0;

    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "Aliada de teste F13",
        estagio: "ALIADA_ATIVA",
        reavaliacaoPendente: true,
      },
    });
    empresaId = empresa.id;

    const depois =
      (await pendenciasDeHoje()).find((p) => p.chave === "REAVALIACOES_VENCIDAS")?.contagem ?? 0;
    expect(depois).toBe(antes + 1);

    await prisma.empresa.update({
      where: { id: empresa.id },
      data: { reavaliacaoPendente: false },
    });
    const desmarcada =
      (await pendenciasDeHoje()).find((p) => p.chave === "REAVALIACOES_VENCIDAS")?.contagem ?? 0;
    expect(desmarcada).toBe(antes);
  });

  it("a meta × realizado lê o alvo do Parametrizador (RN23), não uma constante", async () => {
    const painel = await montarPainel("90");
    const metaVigente = await prisma.metaPeriodo.findFirst({
      where: { categoriaId: null },
      orderBy: { inicio: "desc" },
    });
    if (metaVigente) {
      expect(painel.meta?.alvo).toBe(metaVigente.valor);
    } else {
      expect(painel.meta).toBeNull();
    }
  });

  it("aceita os três períodos e cai no padrão diante de lixo", () => {
    for (const periodo of PERIODOS_DASHBOARD) {
      expect(periodoValido(periodo)).toBe(periodo);
    }
    expect(periodoValido("safra")).toBe("90");
    expect(periodoValido(undefined)).toBe("90");
  });

  it("a janela do período é fechada para trás a partir de agora", () => {
    const agora = new Date("2026-07-26T00:00:00.000Z");
    expect(janelaDoDashboard("30", agora).inicio.toISOString()).toBe(
      "2026-06-26T00:00:00.000Z",
    );
    expect(janelaDoDashboard("12m", agora).dias).toBe(365);
  });

  it("a HOME inteira responde em menos de 1s com os volumes de projeto", async () => {
    // Aquecimento: a primeira leitura preenche o cache de configuração.
    await montarPainel("90");
    const inicio = Date.now();
    await montarPainel("90");
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  it("não grava nada — o painel é leitura pura", async () => {
    const antes = await prisma.auditoriaEvento.count();
    await montarPainel("30");
    expect(await prisma.auditoriaEvento.count()).toBe(antes);
    expect(usuarioId).toBeTruthy();
  });
});

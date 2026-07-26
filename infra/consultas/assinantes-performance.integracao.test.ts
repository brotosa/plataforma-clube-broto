import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { contarAssinantes } from "./assinantes";
import {
  gerarAssinantesSinteticos,
  inserirAssinantesSinteticos,
} from "@/infra/assinantes/fixtures-sinteticas";

/**
 * Performance do construtor (critério do prompt da Onda 5): com 50 mil
 * assinantes sintéticos e os índices do catálogo, a contagem responde em
 * dezenas de milissegundos. O teste usa a mediana de 5 execuções após
 * aquecimento e um teto folgado para variação de CI (250 ms) — as
 * durações reais ficam registradas na saída. As contagens são conferidas
 * contra o cálculo em memória sobre as MESMAS fixtures (nenhum número
 * inventado).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

process.env.CPF_HASH_KEY ??= "chave-de-teste-integracao-hmac";
process.env.APP_ENCRYPTION_KEY ??= "chave-de-teste-integracao-cifra";

const prisma = new PrismaClient();
const VOLUME = 50_000;
const TETO_MEDIANA_MS = 250;
/**
 * Timeout EXPLÍCITO dos casos que medem (F5). Cada um dispara oito consultas
 * sobre 50 mil linhas — a de corretude, duas de aquecimento e cinco medidas —
 * e os `it` usavam o padrão de 5s do vitest. Em contêiner sob contenção o que
 * estourava era esse teto do harness, ANTES de a medição terminar: o teste
 * morria por timeout sem nunca reportar a mediana, sintoma que não distingue
 * "consulta lenta" de "máquina ocupada".
 *
 * Nada foi afrouxado: as contagens seguem exatas e `TETO_MEDIANA_MS` continua
 * em 250ms. O que muda é que uma máquina lenta agora produz uma MEDIÇÃO — que
 * reprova no teto de verdade, com os números à vista — em vez de um timeout
 * mudo.
 */
const TIMEOUT_MEDICAO_MS = 120_000;

const SINTETICOS = gerarAssinantesSinteticos(VOLUME, 42);

async function limpar() {
  await prisma.atributoEnriquecimento.deleteMany({});
  await prisma.assinatura.deleteMany({});
  await prisma.exportacaoLista.deleteMany({});
  await prisma.segmento.deleteMany({});
  await prisma.stagingAssinante.deleteMany({});
  await prisma.assinante.deleteMany({});
  await prisma.importacao.deleteMany({
    where: { tipo: { in: ["ASSINANTES_NUCLEO", "ASSINANTES_ENRIQUECIMENTO"] } },
  });
}

async function medirMediana(regras: unknown): Promise<number> {
  await contarAssinantes(regras); // aquecimento (plano + cache de página)
  await contarAssinantes(regras);
  const duracoes: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const inicio = performance.now();
    await contarAssinantes(regras);
    duracoes.push(performance.now() - inicio);
  }
  duracoes.sort((a, b) => a - b);
  const mediana = duracoes[2]!;
  console.info(
    `contagem 50k — durações ms: [${duracoes.map((d) => d.toFixed(1)).join(", ")}] · mediana ${mediana.toFixed(1)}`,
  );
  return mediana;
}

describe.skipIf(!temBanco)("F11 — contagem do construtor com 50 mil sintéticos", () => {
  beforeAll(async () => {
    await limpar();
    await inserirAssinantesSinteticos(prisma, SINTETICOS);
  }, 600_000);

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  }, 600_000);

  it("carteira inteira: contagem certa e mediana dentro do teto", async () => {
    const contagem = await contarAssinantes([]);
    expect(contagem).toEqual({ status: "OK", total: VOLUME });
    expect(await medirMediana([])).toBeLessThan(TETO_MEDIANA_MS);
  }, TIMEOUT_MEDICAO_MS);

  it("fixtures inseridas direto levam TODAS a marca SINTÉTICO (regra do CLAUDE.md)", async () => {
    const marcados = await prisma.assinante.count({ where: { marcaSintetico: true } });
    expect(marcados).toBe(VOLUME);
  });

  it("filtro do núcleo (índice de uf): contagem confere com as fixtures", async () => {
    const regras = [{ campo: "uf", operador: "e", valor: "MT" }];
    const esperado = SINTETICOS.filter((s) => s.uf === "MT").length;
    expect(await contarAssinantes(regras)).toEqual({ status: "OK", total: esperado });
    expect(await medirMediana(regras)).toBeLessThan(TETO_MEDIANA_MS);
  }, TIMEOUT_MEDICAO_MS);

  it("núcleo E atributo EAV (índice catalogo+valor): contagem confere e responde no teto", async () => {
    const regras = [
      { campo: "uf", operador: "e", valor: "MT" },
      { campo: "cultura", operador: "e", valor: "soja", combinadorAnterior: "E" },
    ];
    const esperado = SINTETICOS.filter(
      (s) => s.uf === "MT" && s.atributos.cultura === "soja",
    ).length;
    expect(await contarAssinantes(regras)).toEqual({ status: "OK", total: esperado });
    expect(await medirMediana(regras)).toBeLessThan(TETO_MEDIANA_MS);
  }, TIMEOUT_MEDICAO_MS);

  it("vencimento (RN37, janela cumulativa em assinaturas): contagem confere", async () => {
    const regras = [{ campo: "vencimento", operador: "vence_em", valor: "60" }];
    const esperado = SINTETICOS.filter(
      (s) => s.assinatura.vencimentoEmDias >= 0 && s.assinatura.vencimentoEmDias <= 60,
    ).length;
    expect(await contarAssinantes(regras)).toEqual({ status: "OK", total: esperado });
    expect(await medirMediana(regras)).toBeLessThan(TETO_MEDIANA_MS);
  }, TIMEOUT_MEDICAO_MS);

  it('estado honesto do "não derivado": nem "é", nem "não é" contam quem não tem UF', async () => {
    const semUf = SINTETICOS.filter((s) => s.uf === null).length;
    expect(semUf).toBeGreaterThan(0); // o gerador produz ~2% sem derivação

    const eMT = await contarAssinantes([{ campo: "uf", operador: "e", valor: "MT" }]);
    const naoEMT = await contarAssinantes([{ campo: "uf", operador: "nao_e", valor: "MT" }]);
    if (eMT.status !== "OK" || naoEMT.status !== "OK") throw new Error("esperava OK");
    expect(eMT.total + naoEMT.total).toBe(VOLUME - semUf);
  });
});

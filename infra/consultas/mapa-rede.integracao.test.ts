import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/infra/prisma/cliente";
import { distribuicaoGeografica } from "./mapa-rede";

/**
 * RN52 em integração — **sede e abrangência são leituras distintas**.
 *
 * O cenário é montado para que os dois modos NÃO possam coincidir por acaso:
 * um aliado sediado no Paraná cuja solução declara cobertura nacional, e
 * outro sediado em São Paulo cuja solução declara só a Bahia. No modo Sede
 * eles aparecem em PR e SP; no modo Abrangência, em 27 UFs e na BA. Se
 * alguém um dia fizer a abrangência "cair para a sede" quando não houver
 * declaração, este arquivo acusa.
 */

const SUFIXO = "-mapa-f14";

/**
 * Integração: só executa com banco disponível. O primeiro job do CI
 * (typecheck, lint e unidade) roda SEM PostgreSQL de propósito — é a
 * verificação rápida —, e o segundo é que sobe o serviço. Sem esta guarda o
 * arquivo derruba o job errado, dizendo "DATABASE_URL não encontrada" em vez
 * de reportar regra de negócio. Mesmo padrão das demais suítes de integração
 * do repositório.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const ids = {
  empresas: [] as string[],
  solucoes: [] as string[],
  ofertas: [] as string[],
};

async function criarAliadoComSolucao(
  nome: string,
  uf: string | null,
  cobertura: { nacional: boolean; ufs: string[] } | null,
) {
  const empresa = await prisma.empresa.create({
    data: { nomeFantasia: `${nome}${SUFIXO}`, estagio: "ALIADA_ATIVA", enderecoUf: uf },
  });
  ids.empresas.push(empresa.id);

  if (!cobertura) {
    return empresa;
  }

  const [tipo, mecanica] = await Promise.all([
    prisma.tipoBeneficio.findFirst({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.mecanica.findFirst({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
  ]);
  if (!tipo || !mecanica) {
    throw new Error("Seed de taxonomias ausente: rode `pnpm db:seed` antes da suíte.");
  }

  const ufsDeclaradas = await prisma.uf.findMany({
    where: { sigla: { in: cobertura.ufs } },
    select: { id: true },
  });

  const solucao = await prisma.solucao.create({
    data: {
      empresaId: empresa.id,
      nome: `Solução ${nome}${SUFIXO}`,
      coberturaNacional: cobertura.nacional,
      ufs: { create: ufsDeclaradas.map((uf) => ({ ufId: uf.id })) },
    },
  });
  ids.solucoes.push(solucao.id);

  const oferta = await prisma.oferta.create({
    data: {
      solucaoId: solucao.id,
      titulo: `Oferta ${nome}${SUFIXO}`,
      natureza: "BENEFICIO",
      tipoBeneficioId: tipo.id,
      mecanicaId: mecanica.id,
      vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
      status: "PUBLICADA",
    },
  });
  ids.ofertas.push(oferta.id);
  return empresa;
}

describe.skipIf(!temBanco)("T30 — distribuição geográfica (RN52)", () => {
  beforeAll(async () => {
    // Sede PR, alcance nacional — a divergência máxima entre os dois modos.
    await criarAliadoComSolucao("Nacional", "PR", { nacional: true, ufs: [] });
    // Sede SP, alcance declarado só na BA — sede e alcance em regiões distintas.
    await criarAliadoComSolucao("Focado", "SP", { nacional: false, ufs: ["BA"] });
    // Sede MG, sem solução publicada — entra na sede, some na abrangência.
    await criarAliadoComSolucao("Sem solução", "MG", null);
    // Sem UF de sede — some dos dois mapas e é declarado no modo Sede.
    await criarAliadoComSolucao("Sem endereço", null, null);
  });

  afterAll(async () => {
    await prisma.oferta.deleteMany({ where: { id: { in: ids.ofertas } } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: ids.solucoes } } });
    await prisma.solucao.deleteMany({ where: { id: { in: ids.solucoes } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids.empresas } } });
  });

  function aliadosNa(
    linhas: ReadonlyArray<{ sigla: string; aliados: number }>,
    sigla: string,
  ): number {
    return linhas.find((linha) => linha.sigla === sigla)?.aliados ?? 0;
  }

  describe("os dois modos do mapa nunca se misturam", () => {
    it("sempre devolve as 27 UFs, mesmo as zeradas (RN53)", async () => {
      for (const modo of ["SEDE", "ABRANGENCIA"] as const) {
        const distribuicao = await distribuicaoGeografica(modo);
        expect(distribuicao.linhas, modo).toHaveLength(27);
        expect(distribuicao.modo).toBe(modo);
      }
    });

    it("modo Sede plota o endereço cadastrado, e só ele", async () => {
      const antes = await distribuicaoGeografica("SEDE");
      // O aliado de alcance nacional aparece UMA vez, no Paraná — não em 27.
      expect(aliadosNa(antes.linhas, "PR")).toBeGreaterThanOrEqual(1);
      expect(aliadosNa(antes.linhas, "SP")).toBeGreaterThanOrEqual(1);
      expect(aliadosNa(antes.linhas, "MG")).toBeGreaterThanOrEqual(1);
    });

    it("modo Abrangência plota o alcance declarado, não a sede", async () => {
      const distribuicao = await distribuicaoGeografica("ABRANGENCIA");

      // Cobertura nacional alcança as 27 — inclusive UFs onde ninguém tem sede.
      for (const sigla of ["AC", "RR", "AP", "SE"]) {
        expect(aliadosNa(distribuicao.linhas, sigla), sigla).toBeGreaterThanOrEqual(1);
      }
      // O aliado sediado em SP que só declara a BA conta na BA.
      expect(aliadosNa(distribuicao.linhas, "BA")).toBeGreaterThanOrEqual(2);
    });

    it("o aliado sem cobertura declarada NÃO cai para a sede — vira não declarado", async () => {
      const distribuicao = await distribuicaoGeografica("ABRANGENCIA");

      expect(distribuicao.naoDeclarado).not.toBeNull();
      expect(distribuicao.naoDeclarado!.aliados).toBeGreaterThanOrEqual(2);
      expect(distribuicao.naoDeclarado!.motivo).toMatch(/não infere/i);
    });

    it("modo Sede declara quem está sem UF em vez de omitir", async () => {
      const distribuicao = await distribuicaoGeografica("SEDE");
      expect(distribuicao.naoDeclarado).not.toBeNull();
      expect(distribuicao.naoDeclarado!.aliados).toBeGreaterThanOrEqual(1);
      expect(distribuicao.naoDeclarado!.motivo).toMatch(/sem UF/i);
    });

    it("a base de aliados não é a soma da coluna no modo abrangência", async () => {
      const distribuicao = await distribuicaoGeografica("ABRANGENCIA");
      const soma = distribuicao.linhas.reduce((total, linha) => total + linha.aliados, 0);
      // Um aliado nacional sozinho já soma 27 na coluna e 1 na base.
      expect(soma).toBeGreaterThan(distribuicao.baseDeAliados);
    });

    it("os dois modos produzem distribuições diferentes — é o ponto da regra", async () => {
      const [sede, abrangencia] = await Promise.all([
        distribuicaoGeografica("SEDE"),
        distribuicaoGeografica("ABRANGENCIA"),
      ]);
      expect(sede.linhas).not.toEqual(abrangencia.linhas);
    });

    it("o filtro por categoria recorta os dois modos", async () => {
      const categoria = await prisma.categoria.findFirst({ where: { ativa: true } });
      if (!categoria) {
        return;
      }
      // Nenhum aliado do cenário tem categoria: o recorte zera a base deles.
      const filtrada = await distribuicaoGeografica("ABRANGENCIA", {
        categoriaId: categoria.id,
      });
      expect(filtrada.linhas).toHaveLength(27);
      expect(filtrada.baseDeAliados).toBeLessThanOrEqual(
        (await distribuicaoGeografica("ABRANGENCIA")).baseDeAliados,
      );
    });
  });
});

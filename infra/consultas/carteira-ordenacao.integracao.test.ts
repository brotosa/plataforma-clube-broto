import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import { gerarAssinantesSinteticos } from "@/infra/assinantes/fixtures-sinteticas";
import { listarCarteira } from "./assinantes";

/**
 * T18 — ordenação por coluna (Onda 15). A ordenação vem da UI mas entra no
 * SQL só pela allowlist (`EXPRESSAO_ORDENACAO`); estes testes provam a
 * ordem resultante por nome/perfil/UF e as duas direções, isolando as
 * linhas de teste por um marcador no nome (via `busca`).
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const MARCA = "[TESTE-ORD]";

// CHAVES ISOLADAS por chaveNatural do nome (busca ILIKE encontra o marcador).
const AMOSTRA = [
  { sufixo: "Ana", uf: "BA", perfil: "PATROCINADA" as const },
  { sufixo: "Bruno", uf: "MG", perfil: "AUTOASSINATURA" as const },
  { sufixo: "Carla", uf: "SP", perfil: "PROMOCIONAL_BROTO" as const },
];

describe.skipIf(!temBanco)("T18 — ordenação da carteira (integração)", () => {
  const prisma = new PrismaClient();

  async function limpar() {
    await prisma.assinante.deleteMany({ where: { nome: { startsWith: MARCA } } });
  }

  beforeAll(async () => {
    await limpar();
    const sinteticos = gerarAssinantesSinteticos(AMOSTRA.length, 91);
    for (let i = 0; i < AMOSTRA.length; i += 1) {
      const item = AMOSTRA[i]!;
      const cpf = sinteticos[i]!.cpf;
      await prisma.assinante.create({
        data: {
          nome: `${MARCA} ${item.sufixo}`,
          cpfHash: hashCpf(cpf),
          cpfCifrado: cifrarCpf(cpf),
          uf: item.uf,
          perfilAssinatura: item.perfil,
          statusBase: "ATIVO",
          marcaSintetico: true,
        },
      });
    }
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  const nomesDe = async (ordenarPor: "nome" | "perfil" | "uf", direcao: "asc" | "desc") => {
    const carteira = await listarCarteira(
      { regras: [], busca: MARCA, ordenarPor, direcao },
      { dadosPlenos: false },
    );
    return carteira.linhas.map((l) => l.nome.replace(`${MARCA} `, ""));
  };

  it("ordena por nome, ascendente e descendente", async () => {
    expect(await nomesDe("nome", "asc")).toEqual(["Ana", "Bruno", "Carla"]);
    expect(await nomesDe("nome", "desc")).toEqual(["Carla", "Bruno", "Ana"]);
  });

  it("ordena por UF (BA < MG < SP asc)", async () => {
    expect(await nomesDe("uf", "asc")).toEqual(["Ana", "Bruno", "Carla"]);
    expect(await nomesDe("uf", "desc")).toEqual(["Carla", "Bruno", "Ana"]);
  });

  it("ordena por perfil de assinatura", async () => {
    // AUTOASSINATURA < PATROCINADA < PROMOCIONAL_BROTO (ordem alfabética do enum)
    expect(await nomesDe("perfil", "asc")).toEqual(["Bruno", "Ana", "Carla"]);
  });

  it("chave de ordenação fora da allowlist cai no padrão (nome asc), nunca vira SQL", async () => {
    const carteira = await listarCarteira(
      // @ts-expect-error — valor inválido de propósito: a consulta deve ignorá-lo.
      { regras: [], busca: MARCA, ordenarPor: "cpf; DROP TABLE assinantes;--", direcao: "asc" },
      { dadosPlenos: false },
    );
    expect(carteira.linhas.map((l) => l.nome.replace(`${MARCA} `, ""))).toEqual([
      "Ana",
      "Bruno",
      "Carla",
    ]);
  });
});

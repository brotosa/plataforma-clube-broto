import { describe, expect, it } from "vitest";
import {
  type Acao,
  ErroDeAutorizacao,
  exigirPermissao,
  podeExecutar,
} from "./permissoes";
import type { Papel } from "@prisma/client";

/**
 * Casos positivos e negativos derivados célula a célula das tabelas de
 * permissões das fichas §2 (● = permitido, — = negado; Ondas 1 e 2).
 */
const TABELA_DA_FICHA: ReadonlyArray<{
  acao: Acao;
  permitidos: ReadonlyArray<Papel>;
  negados: ReadonlyArray<Papel>;
}> = [
  {
    // Leitura geral: papéis da Onda 1 + perfis novos (o funil abre T2/T12).
    acao: "VISUALIZAR",
    permitidos: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
    negados: [],
  },
  {
    acao: "CRIAR_EDITAR",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    // Ficha Onda 2 §2: Comercial solicita a promoção; o scout, não.
    acao: "SOLICITAR_PROMOCAO",
    permitidos: ["GESTOR", "ANALISTA", "COMERCIAL"],
    negados: ["ANALISTA_SCOUT", "APROVADOR", "LEITURA"],
  },
  {
    acao: "APROVAR_DEVOLVER",
    permitidos: ["GESTOR", "APROVADOR"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "LEITURA"],
  },
  {
    acao: "CONFIGURAR_REGRAS_APROVACAO",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "PUBLICAR_PAUSAR_ENCERRAR_OFERTA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "GERAR_EXPORTACAO",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "IMPORTAR_TELEMETRIA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  // ---- Onda 2: Mercado & Scout (ficha §2) ----
  {
    acao: "VISUALIZAR_FUNIL",
    permitidos: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
    negados: [],
  },
  {
    acao: "INCLUIR_NO_RADAR",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "ASSUMIR_E_AVALIAR",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "PRIORIZAR",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "GERAR_REVISAR_DOSSIE",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    // "○ (ver)" do Comercial na linha do dossiê.
    acao: "VER_DOSSIE",
    permitidos: ["GESTOR", "ANALISTA_SCOUT", "COMERCIAL"],
    negados: ["ANALISTA", "APROVADOR", "LEITURA"],
  },
  {
    acao: "ASSUMIR_NEGOCIACAO",
    permitidos: ["GESTOR", "COMERCIAL"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "APROVADOR", "LEITURA"],
  },
  {
    acao: "DEFINIR_METAS_E_DESIGNAR",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  // Onda 5 — ficha §2. Administrador da Plataforma entra nas duas
  // primeiras quando a trilha da Onda 3 criar o papel (RN23).
  {
    acao: "VISUALIZAR_DADOS_PESSOAIS_PLENOS",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "APROVADOR", "LEITURA"],
  },
  {
    acao: "EXPORTAR_LISTAS_CONTATO",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "APROVADOR", "LEITURA"],
  },
  {
    acao: "IMPORTAR_ASSINANTES",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["APROVADOR", "LEITURA"],
  },
  {
    acao: "GERIR_SEGMENTOS",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["APROVADOR", "LEITURA"],
  },
];

describe("RBAC — tabelas de permissões das fichas §2 (Ondas 1 e 2)", () => {
  for (const { acao, permitidos, negados } of TABELA_DA_FICHA) {
    for (const papel of permitidos) {
      it(`permite ${acao} para ${papel}`, () => {
        expect(podeExecutar(papel, acao)).toBe(true);
        expect(() => exigirPermissao(papel, acao)).not.toThrow();
      });
    }
    for (const papel of negados) {
      it(`nega ${acao} para ${papel}`, () => {
        expect(podeExecutar(papel, acao)).toBe(false);
        expect(() => exigirPermissao(papel, acao)).toThrow(ErroDeAutorizacao);
      });
    }
  }

  it("expõe papel e ação no erro de autorização", () => {
    try {
      exigirPermissao("LEITURA", "GERAR_EXPORTACAO");
      expect.unreachable("deveria ter lançado ErroDeAutorizacao");
    } catch (erro) {
      const e = erro as ErroDeAutorizacao;
      expect(e.papel).toBe("LEITURA");
      expect(e.acao).toBe("GERAR_EXPORTACAO");
    }
  });
});

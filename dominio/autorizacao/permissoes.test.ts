import { describe, expect, it } from "vitest";
import {
  type Acao,
  ErroDeAutorizacao,
  exigirPermissao,
  podeExecutar,
} from "./permissoes";
import type { Papel } from "@prisma/client";

/**
 * Casos positivos e negativos derivados célula a célula da tabela de
 * permissões da ficha §2 (● = permitido, — = negado).
 */
const TABELA_DA_FICHA: ReadonlyArray<{
  acao: Acao;
  permitidos: ReadonlyArray<Papel>;
  negados: ReadonlyArray<Papel>;
}> = [
  {
    acao: "VISUALIZAR",
    permitidos: ["GESTOR", "ANALISTA", "APROVADOR", "LEITURA"],
    negados: [],
  },
  {
    acao: "CRIAR_EDITAR",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["APROVADOR", "LEITURA"],
  },
  {
    acao: "SOLICITAR_PROMOCAO",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["APROVADOR", "LEITURA"],
  },
  {
    acao: "APROVAR_DEVOLVER",
    permitidos: ["GESTOR", "APROVADOR"],
    negados: ["ANALISTA", "LEITURA"],
  },
  {
    acao: "CONFIGURAR_REGRAS_APROVACAO",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "APROVADOR", "LEITURA"],
  },
  {
    acao: "PUBLICAR_PAUSAR_ENCERRAR_OFERTA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["APROVADOR", "LEITURA"],
  },
  {
    acao: "GERAR_EXPORTACAO",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "APROVADOR", "LEITURA"],
  },
  {
    acao: "IMPORTAR_TELEMETRIA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["APROVADOR", "LEITURA"],
  },
];

describe("RBAC — tabela de permissões da ficha §2", () => {
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

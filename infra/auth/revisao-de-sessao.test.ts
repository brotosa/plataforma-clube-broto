import { describe, expect, it } from "vitest";
import type { JWT } from "next-auth/jwt";
import { POLITICA_SESSAO_PADRAO } from "@/dominio/usuarios/politica-sessao";
import { revisarTokenDeSessao, type UsuarioParaRevisao } from "./revisao-de-sessao";

/**
 * A LIGAÇÃO do callback `jwt` — revogação (RN47) e expiração por inatividade
 * na ordem certa, com a marca de atividade reiniciada. Era o pedaço sem
 * cobertura: as funções puras de baixo tinham testes, a composição não.
 */

const AGORA = new Date("2026-09-14T15:00:00Z").getTime();
const MIN = 60_000;

function token(parcial: Partial<JWT> = {}): JWT {
  return {
    id: "u1",
    nome: "Fulano",
    papel: "LEITURA",
    sessaoEpoca: 3,
    trocaSenhaObrigatoria: false,
    ultimaAtividade: AGORA - 5 * MIN,
    ...parcial,
  } as JWT;
}

function usuario(parcial: Partial<UsuarioParaRevisao> = {}): UsuarioParaRevisao {
  return {
    ativo: true,
    papel: "LEITURA",
    nome: "Fulano",
    sessaoEpoca: 3,
    trocaSenhaObrigatoria: false,
    ...parcial,
  };
}

describe("revisão do token de sessão (callback jwt)", () => {
  it("sessão ativa sobrevive e a marca de atividade é reiniciada para agora", () => {
    const { token: novo } = revisarTokenDeSessao({
      token: token(),
      usuarioAtual: usuario(),
      politica: POLITICA_SESSAO_PADRAO,
      agora: AGORA,
    });
    expect(novo).not.toBeNull();
    expect(novo?.ultimaAtividade).toBe(AGORA);
  });

  it("derruba quando a inatividade passa do tempo configurado", () => {
    const resultado = revisarTokenDeSessao({
      // 31 minutos parados, política de 30.
      token: token({ ultimaAtividade: AGORA - 31 * MIN }),
      usuarioAtual: usuario(),
      politica: { tempoSessaoMin: 30 },
      agora: AGORA,
    });
    expect(resultado.token).toBeNull();
    expect(resultado.motivo).toBe("inatividade");
  });

  it("apertar a política derruba sessão que antes sobreviveria", () => {
    const parado = token({ ultimaAtividade: AGORA - 20 * MIN });
    // Com 30 min, passa.
    expect(
      revisarTokenDeSessao({
        token: parado,
        usuarioAtual: usuario(),
        politica: { tempoSessaoMin: 30 },
        agora: AGORA,
      }).token,
    ).not.toBeNull();
    // Com 15 min — a política é lida a cada requisição —, cai.
    expect(
      revisarTokenDeSessao({
        token: parado,
        usuarioAtual: usuario(),
        politica: { tempoSessaoMin: 15 },
        agora: AGORA,
      }).token,
    ).toBeNull();
  });

  it("usuário inexistente ou inativo derruba como REVOGADA, não inatividade", () => {
    expect(
      revisarTokenDeSessao({
        token: token(),
        usuarioAtual: null,
        politica: POLITICA_SESSAO_PADRAO,
        agora: AGORA,
      }),
    ).toEqual({ token: null, motivo: "revogada" });

    expect(
      revisarTokenDeSessao({
        token: token(),
        usuarioAtual: usuario({ ativo: false }),
        politica: POLITICA_SESSAO_PADRAO,
        agora: AGORA,
      }).motivo,
    ).toBe("revogada");
  });

  it("época divergente (RN47) derruba mesmo com atividade recentíssima", () => {
    const resultado = revisarTokenDeSessao({
      token: token({ sessaoEpoca: 3, ultimaAtividade: AGORA }),
      usuarioAtual: usuario({ sessaoEpoca: 4 }),
      politica: POLITICA_SESSAO_PADRAO,
      agora: AGORA,
    });
    expect(resultado.token).toBeNull();
    expect(resultado.motivo).toBe("revogada");
  });

  it("a revogação vence a inatividade quando as duas valem — o motivo importa", () => {
    const resultado = revisarTokenDeSessao({
      token: token({ sessaoEpoca: 3, ultimaAtividade: AGORA - 99 * MIN }),
      usuarioAtual: usuario({ sessaoEpoca: 9 }),
      politica: POLITICA_SESSAO_PADRAO,
      agora: AGORA,
    });
    expect(resultado.motivo).toBe("revogada");
  });

  it("papel, nome e credencial provisória são relidos do banco", () => {
    const { token: novo } = revisarTokenDeSessao({
      token: token({ papel: "LEITURA", nome: "Antigo", trocaSenhaObrigatoria: false }),
      usuarioAtual: usuario({ papel: "GESTOR", nome: "Novo", trocaSenhaObrigatoria: true }),
      politica: POLITICA_SESSAO_PADRAO,
      agora: AGORA,
    });
    expect(novo?.papel).toBe("GESTOR");
    expect(novo?.nome).toBe("Novo");
    expect(novo?.trocaSenhaObrigatoria).toBe(true);
  });

  it("token sem marca de atividade (emitido antes desta fase) não é expulso", () => {
    const { token: novo } = revisarTokenDeSessao({
      token: token({ ultimaAtividade: undefined }),
      usuarioAtual: usuario(),
      politica: POLITICA_SESSAO_PADRAO,
      agora: AGORA,
    });
    expect(novo).not.toBeNull();
    // E passa a ter a marca a partir de agora.
    expect(novo?.ultimaAtividade).toBe(AGORA);
  });
});

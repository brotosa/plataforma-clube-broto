import { describe, expect, it } from "vitest";
import {
  type Acao,
  ACOES,
  ErroDeAutorizacao,
  exigirPermissao,
  podeExecutar,
} from "./permissoes";
import type { Papel } from "@prisma/client";

/**
 * Casos positivos e negativos derivados célula a célula das tabelas de
 * permissões das fichas §2 (● = permitido, — = negado; Ondas 1, 2, 3 e 5).
 * Toda ação tem a célula do ADMINISTRADOR_PLATAFORMA explicitada: o papel
 * novo não herda nada por omissão.
 */
const TABELA_DA_FICHA: ReadonlyArray<{
  acao: Acao;
  permitidos: ReadonlyArray<Papel>;
  negados: ReadonlyArray<Papel>;
}> = [
  {
    // Leitura geral: papéis da Onda 1 + perfis novos (o funil abre T2/T12).
    acao: "VISUALIZAR",
    permitidos: [
      "GESTOR",
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
    negados: [],
  },
  {
    acao: "CRIAR_EDITAR",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    // Ficha Onda 2 §2: Comercial solicita a promoção; o scout, não.
    acao: "SOLICITAR_PROMOCAO",
    permitidos: ["GESTOR", "ANALISTA", "COMERCIAL"],
    negados: ["ANALISTA_SCOUT", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "APROVAR_DEVOLVER",
    permitidos: ["GESTOR", "APROVADOR"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "CONFIGURAR_REGRAS_APROVACAO",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "PUBLICAR_PAUSAR_ENCERRAR_OFERTA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "GERAR_EXPORTACAO",
    permitidos: ["GESTOR"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "IMPORTAR_TELEMETRIA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: ["ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  // ---- Onda 2: Mercado & Scout (ficha §2) ----
  {
    acao: "VISUALIZAR_FUNIL",
    permitidos: [
      "GESTOR",
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
    negados: [],
  },
  {
    acao: "INCLUIR_NO_RADAR",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "ASSUMIR_E_AVALIAR",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "PRIORIZAR",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "GERAR_REVISAR_DOSSIE",
    permitidos: ["GESTOR", "ANALISTA_SCOUT"],
    negados: ["ANALISTA", "COMERCIAL", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    // "○ (ver)" do Comercial na linha do dossiê.
    acao: "VER_DOSSIE",
    permitidos: ["GESTOR", "ANALISTA_SCOUT", "COMERCIAL"],
    negados: ["ANALISTA", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  {
    acao: "ASSUMIR_NEGOCIACAO",
    permitidos: ["GESTOR", "COMERCIAL"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
  // ---- Errata da ficha Onda 3 v0.2: a célula única "definir metas e
  // designar" da ficha da Onda 2 vira duas, com titulares diferentes. ----
  {
    // Designar responsável de scout/comercial permanece com o Gestor —
    // inclusive contra o Administrador, que não opera o funil.
    acao: "DESIGNAR_RESPONSAVEIS",
    permitidos: ["GESTOR"],
    negados: [
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  {
    // Metas passam ao Administrador da Plataforma: o Gestor, que as tinha
    // na ficha da Onda 2, agora é negado — é o coração da errata.
    acao: "DEFINIR_METAS",
    permitidos: ["ADMINISTRADOR_PLATAFORMA"],
    negados: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  // ---- Onda 3: Parametrizador (ficha §2, RN23) ----
  {
    // Leitura do hub para todos — transparência da configuração vigente.
    acao: "VISUALIZAR_PARAMETROS",
    permitidos: [
      "GESTOR",
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
    negados: [],
  },
  {
    acao: "CONFIGURAR_PARAMETROS",
    permitidos: ["ADMINISTRADOR_PLATAFORMA"],
    negados: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  // Onda 5 — ficha §2. As duas primeiras são de "Gestor e Administrador":
  // a F11 as deixou só com o Gestor porque o papel ainda não existia e
  // anotou que incluí-lo seria a única mudança quando a trilha da Onda 3
  // chegasse. É o que a F10 faz aqui.
  {
    acao: "VISUALIZAR_DADOS_PESSOAIS_PLENOS",
    permitidos: ["GESTOR", "ADMINISTRADOR_PLATAFORMA"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "EXPORTAR_LISTAS_CONTATO",
    permitidos: ["GESTOR", "ADMINISTRADOR_PLATAFORMA"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    acao: "IMPORTAR_ASSINANTES",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: [
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  {
    // F20 (ficha §8) — a permissão já existia desde a F4, com os mesmos
    // dois papéis; a célula do ADMINISTRADOR_PLATAFORMA é que nunca havia
    // sido explicitada. Ele NÃO importa: o papel dele é parametrizar a
    // plataforma (RN23), não operar carga de dado da operadora. Leitura do
    // histórico e das divergências continua sendo de todos os papéis, e
    // por isso não há permissão de leitura a declarar aqui.
    acao: "IMPORTAR_TELEMETRIA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: [
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  {
    acao: "GERIR_SEGMENTOS",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: [
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  // Onda 4 — ficha §2: modelagem e ativação com Gestor e Analista. A
  // geração do kit exige, ADICIONALMENTE, a permissão de exportar listas
  // da Onda 5 — verificada no caso de uso, não aqui.
  {
    acao: "MODELAR_CAMPANHA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: [
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      // Segregação: o Administrador da Plataforma (RN23) configura o
      // produto e não opera campanha — a ficha da Onda 4 §2 dá modelagem
      // e ativação a Gestor e Analista.
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  {
    acao: "ATIVAR_ENCERRAR_CAMPANHA",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: [
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  {
    acao: "GERIR_CESTAS",
    permitidos: ["GESTOR", "ANALISTA"],
    negados: [
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  // ---- Onda 6: Usuários e Auditoria (ficha §3 e §4) ----
  {
    // RN46 — exclusiva do Administrador da Plataforma. O Gestor é negado
    // aqui: é a mesma segregação da escrita no Parametrizador.
    acao: "GERIR_USUARIOS",
    permitidos: ["ADMINISTRADOR_PLATAFORMA"],
    negados: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  {
    // Ficha §4: "somente leitura para todos os papéis" — nenhum negado.
    acao: "VISUALIZAR_AUDITORIA",
    permitidos: [
      "GESTOR",
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
    negados: [],
  },
  {
    // RN48 — exportar o extrato exige Gestor ou Administrador. Ler a
    // trilha na tela é de todos; tirá-la do produto, não.
    acao: "EXPORTAR_EXTRATO_AUDITORIA",
    permitidos: ["GESTOR", "ADMINISTRADOR_PLATAFORMA"],
    negados: ["ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  },
  // ---- Onda 12: Patrocinadores (ficha §4, RN62 e RN66) ----
  {
    // "leitura para todos os papéis" — inclusive o Administrador da
    // Plataforma, cuja célula a ficha manda explicitar.
    acao: "VISUALIZAR_PATROCINADORES",
    permitidos: [
      "GESTOR",
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
    negados: [],
  },
  {
    // "Gestor cria, edita e inativa". O Analista, que opera aliados e
    // campanhas, NÃO opera patrocinador: a ficha nomeia só o Gestor, e
    // acrescentá-lo seria inventar célula. O Administrador fica de fora
    // pela segregação da RN46.
    acao: "GERIR_PATROCINADORES",
    permitidos: ["GESTOR"],
    negados: [
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  {
    // Célula que a ficha NÃO enumerou — ver a justificativa em
    // `permissoes.ts`. Restrita ao Gestor porque o R1 sai da plataforma e
    // é auditado, como toda saída de dado no produto.
    acao: "GERAR_RELATORIO_PATROCINADOR",
    permitidos: ["GESTOR"],
    negados: [
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ],
  },
  {
    // Pós-homologação — comentar na ficha do aliado (painel de atividades).
    // Os papéis que operam a ficha comentam; Leitura, Aprovador e
    // Administrador da Plataforma leem o feed, mas não escrevem.
    acao: "COMENTAR_FICHA_ALIADO",
    permitidos: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL"],
    negados: ["APROVADOR", "LEITURA", "ADMINISTRADOR_PLATAFORMA"],
  },
];

describe("RBAC — tabelas de permissões das fichas §2 (Ondas 1 a 6)", () => {
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

  // A tabela acima só vale como "célula a célula" se cobrir mesmo todas as
  // células. Este teste falha quando uma ação nova (ou um papel novo)
  // entra no código sem a decisão correspondente na ficha.
  it("cobre toda a matriz papéis × ações, sem célula implícita", () => {
    const PAPEIS: ReadonlyArray<Papel> = [
      "GESTOR",
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMINISTRADOR_PLATAFORMA",
    ];
    for (const linha of TABELA_DA_FICHA) {
      const declarados = [...linha.permitidos, ...linha.negados].sort();
      expect(declarados, `ação ${linha.acao}`).toEqual([...PAPEIS].sort());
    }
  });

  /**
   * O complemento que faltava ao teste acima.
   *
   * Até a F19 a completude era verificada apenas *dentro* das linhas
   * existentes: uma ação nova podia entrar no tipo `Acao` e no mapa de
   * permissões sem nunca aparecer aqui, e a matriz deixaria de ser "célula
   * a célula" em silêncio. Com a lista `ACOES` exportada, a ausência passa
   * a quebrar o build — que é o que a Onda 12 diz já ser exigido "de toda
   * ação".
   */
  it("toda ação do código tem linha na tabela da ficha", () => {
    const naTabela = new Set(TABELA_DA_FICHA.map((linha) => linha.acao));
    const semLinha = ACOES.filter((acao) => !naTabela.has(acao));
    expect(
      semLinha,
      `ações sem decisão declarada na ficha: ${semLinha.join(", ")}`,
    ).toEqual([]);
  });

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

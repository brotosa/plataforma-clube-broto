import { describe, expect, it } from "vitest";
import type { Papel } from "@prisma/client";
import { temAcessoTotal } from "@/dominio/autorizacao/permissoes";
import {
  MENSAGEM_CONFIRMAR_ACESSO_TOTAL,
  MENSAGEM_ULTIMO_ADMINISTRADOR,
  MENSAGENS_DE_REVOGACAO,
  avaliarMudancaDeUsuario,
  eAdministradorEfetivo,
  exigeConfirmacaoDeAcessoTotal,
  exigeNovaEpocaDeSessao,
  motivoDaRevogacao,
  outrosAdministradoresAtivos,
  removeCondicaoDeAdministrador,
  sessaoContinuaValida,
  type UsuarioEmAvaliacao,
} from "./regras";

const admin = (id: string, ativo = true): UsuarioEmAvaliacao => ({
  id,
  papel: "ADMINISTRADOR_PLATAFORMA",
  ativo,
});
const gestor = (id: string, ativo = true): UsuarioEmAvaliacao => ({
  id,
  papel: "GESTOR",
  ativo,
});

/** O papel RENOMEADO na Onda 15 — é onde vivem as contas reais. */
const administrador = (id: string, ativo = true): UsuarioEmAvaliacao => ({
  id,
  papel: "ADMIN",
  ativo,
});

describe("RN46 — proteção do último administrador (anti-lockout)", () => {
  it("só conta como administrador efetivo quem tem o papel E está ativo", () => {
    expect(eAdministradorEfetivo(admin("a1"))).toBe(true);
    expect(eAdministradorEfetivo(admin("a1", false))).toBe(false);
    expect(eAdministradorEfetivo(gestor("g1"))).toBe(false);
  });

  /**
   * A regressão que a renomeação da Onda 15 quase produziu, e que este teste
   * existe para impedir que volte.
   *
   * A RN46 comparava o papel com o literal `"ADMINISTRADOR_PLATAFORMA"`. Depois
   * da renomeação, as contas reais passaram a ser `ADMIN` e a base ficou sem
   * nenhum `ADMINISTRADOR_PLATAFORMA` — a contagem daria **zero**, a regra
   * nunca dispararia e alguém poderia rebaixar o último Administrador,
   * deixando a plataforma sem quem atribui papéis. Silenciosamente: nenhum
   * erro, nenhum aviso, só a proteção deixando de existir.
   *
   * A definição passou a ser por **capacidade** (`GERIR_USUARIOS`), e é isso
   * que estes casos cobram.
   */
  it("conta o papel renomeado (Administrador) — e qualquer papel que possa gerir usuários", () => {
    expect(eAdministradorEfetivo(administrador("n1"))).toBe(true);
    expect(eAdministradorEfetivo(administrador("n1", false))).toBe(false);
    // O acesso total também gere usuários, então também conta.
    expect(eAdministradorEfetivo(admin("a1"))).toBe(true);
  });

  it("o último Administrador não pode ser rebaixado, mesmo havendo acesso total ausente", () => {
    const alvo = administrador("n1");
    expect(outrosAdministradoresAtivos(alvo, [alvo, gestor("g1")])).toBe(0);
    expect(removeCondicaoDeAdministrador(alvo, { papel: "GESTOR" })).toBe(true);
    // Converter o último Administrador em acesso total NÃO o desprotege: ele
    // continua podendo gerir usuários, então a condição se mantém.
    expect(removeCondicaoDeAdministrador(alvo, { papel: "ADMINISTRADOR_PLATAFORMA" })).toBe(false);
  });

  it("conta os outros administradores ativos excluindo o alvo por id", () => {
    const alvo = admin("a1");
    // O alvo aparece na lista, como aparece quando vem do mesmo findMany.
    expect(outrosAdministradoresAtivos(alvo, [alvo, admin("a2"), gestor("g1")])).toBe(1);
    expect(outrosAdministradoresAtivos(alvo, [alvo, admin("a2", false)])).toBe(0);
  });

  // ---- casos negativos: a regra impede ----
  it("impede inativar o único administrador ativo", () => {
    const alvo = admin("a1");
    const erros = avaliarMudancaDeUsuario({
      alvo,
      mudanca: { ativo: false },
      todos: [alvo, gestor("g1"), gestor("g2")],
    });
    expect(erros).toEqual([MENSAGEM_ULTIMO_ADMINISTRADOR]);
  });

  it("impede rebaixar o único administrador ativo", () => {
    const alvo = admin("a1");
    const erros = avaliarMudancaDeUsuario({
      alvo,
      mudanca: { papel: "GESTOR" },
      todos: [alvo, gestor("g1")],
    });
    expect(erros).toEqual([MENSAGEM_ULTIMO_ADMINISTRADOR]);
  });

  it("impede a mudança que rebaixa e inativa de uma vez", () => {
    const alvo = admin("a1");
    const erros = avaliarMudancaDeUsuario({
      alvo,
      mudanca: { papel: "LEITURA", ativo: false },
      todos: [alvo],
    });
    expect(erros).toEqual([MENSAGEM_ULTIMO_ADMINISTRADOR]);
  });

  it("impede quando os demais administradores existem mas estão inativos", () => {
    const alvo = admin("a1");
    const erros = avaliarMudancaDeUsuario({
      alvo,
      mudanca: { ativo: false },
      todos: [alvo, admin("a2", false), admin("a3", false)],
    });
    expect(erros).toEqual([MENSAGEM_ULTIMO_ADMINISTRADOR]);
  });

  // ---- casos positivos: a regra deixa passar ----
  it("permite inativar um administrador quando existe outro ativo", () => {
    const alvo = admin("a1");
    expect(
      avaliarMudancaDeUsuario({
        alvo,
        mudanca: { ativo: false },
        todos: [alvo, admin("a2")],
      }),
    ).toEqual([]);
  });

  it("permite rebaixar um administrador quando existe outro ativo", () => {
    const alvo = admin("a1");
    expect(
      avaliarMudancaDeUsuario({
        alvo,
        mudanca: { papel: "APROVADOR" },
        todos: [alvo, admin("a2")],
      }),
    ).toEqual([]);
  });

  it("permite inativar o último GESTOR — a regra protege o Administrador, não todo papel", () => {
    const alvo = gestor("g1");
    expect(
      avaliarMudancaDeUsuario({
        alvo,
        mudanca: { ativo: false },
        todos: [alvo, admin("a1")],
      }),
    ).toEqual([]);
  });

  it("permite editar o único administrador sem mexer em papel nem em ativo", () => {
    const alvo = admin("a1");
    expect(avaliarMudancaDeUsuario({ alvo, mudanca: {}, todos: [alvo] })).toEqual([]);
    expect(removeCondicaoDeAdministrador(alvo, {})).toBe(false);
  });

  it("permite promover alguém a administrador quando não há nenhum ativo", () => {
    const alvo = gestor("g1");
    expect(
      avaliarMudancaDeUsuario({
        alvo,
        mudanca: { papel: "ADMINISTRADOR_PLATAFORMA" },
        todos: [alvo, admin("a1", false)],
      }),
    ).toEqual([]);
  });

  it("permite reativar um administrador inativo (não remove condição de ninguém)", () => {
    const alvo = admin("a1", false);
    expect(removeCondicaoDeAdministrador(alvo, { ativo: true })).toBe(false);
    expect(avaliarMudancaDeUsuario({ alvo, mudanca: { ativo: true }, todos: [alvo] })).toEqual(
      [],
    );
  });
});

describe("RN47 — quando a mudança derruba as sessões abertas", () => {
  it("inativar derruba", () => {
    expect(exigeNovaEpocaDeSessao(gestor("g1"), { ativo: false })).toBe(true);
  });

  it("trocar de papel derruba — o papel viaja no token e decide o que a UI mostra", () => {
    expect(exigeNovaEpocaDeSessao(gestor("g1"), { papel: "LEITURA" })).toBe(true);
  });

  it("reativar não derruba — não há sessão a revogar em quem estava fora", () => {
    expect(exigeNovaEpocaDeSessao(gestor("g1", false), { ativo: true })).toBe(false);
  });

  it("inativar quem já estava inativo não derruba de novo", () => {
    expect(exigeNovaEpocaDeSessao(gestor("g1", false), { ativo: false })).toBe(false);
  });

  it("gravar o mesmo papel não derruba", () => {
    expect(exigeNovaEpocaDeSessao(gestor("g1"), { papel: "GESTOR" })).toBe(false);
  });

  it("mudança que só altera nome/e-mail não derruba", () => {
    expect(exigeNovaEpocaDeSessao(gestor("g1"), {})).toBe(false);
  });
});

describe("RN47 — validade da sessão do portador do token", () => {
  it("aceita o token cuja época bate com a do usuário ativo", () => {
    expect(sessaoContinuaValida(3, { ativo: true, sessaoEpoca: 3 })).toBe(true);
    expect(motivoDaRevogacao(3, { ativo: true, sessaoEpoca: 3 })).toBeNull();
  });

  it("derruba o token de época anterior — é a revogação imediata da RN47", () => {
    expect(sessaoContinuaValida(3, { ativo: true, sessaoEpoca: 4 })).toBe(false);
    expect(motivoDaRevogacao(3, { ativo: true, sessaoEpoca: 4 })).toBe("ACESSO_ALTERADO");
  });

  it("derruba o token de usuário inativado, mesmo com a época igual", () => {
    expect(sessaoContinuaValida(0, { ativo: false, sessaoEpoca: 0 })).toBe(false);
    expect(motivoDaRevogacao(0, { ativo: false, sessaoEpoca: 0 })).toBe("INATIVADO");
  });

  it("derruba o token de usuário que não existe mais no banco", () => {
    expect(sessaoContinuaValida(0, null)).toBe(false);
    expect(motivoDaRevogacao(0, null)).toBe("INATIVADO");
  });

  it("token sem época vale como época 0 — a virada da F13 não derruba ninguém", () => {
    expect(sessaoContinuaValida(undefined, { ativo: true, sessaoEpoca: 0 })).toBe(true);
    // ...mas a primeira revogação de verdade já o alcança.
    expect(sessaoContinuaValida(undefined, { ativo: true, sessaoEpoca: 1 })).toBe(false);
  });

  it("cada motivo tem mensagem institucional própria", () => {
    expect(MENSAGENS_DE_REVOGACAO.INATIVADO).toContain("Administrador da Plataforma");
    expect(MENSAGENS_DE_REVOGACAO.ACESSO_ALTERADO).toContain("Entre novamente");
  });
});

/**
 * Conceder acesso total exige confirmação explícita.
 *
 * O caso que mais importa aqui é o NEGATIVO: editar quem já tem acesso total
 * não pode pedir cerimônia. Uma implementação ingênua — "o papel novo é
 * total? então confirme" — passaria no caminho feliz e transformaria toda
 * edição daquele usuário num ritual, que é o jeito conhecido de ensinar
 * alguém a marcar sem ler.
 */
describe("confirmação de acesso total", () => {
  it("exige confirmação ao promover um papel comum a acesso total", () => {
    expect(exigeConfirmacaoDeAcessoTotal("LEITURA", "ADMINISTRADOR_PLATAFORMA")).toBe(true);
    expect(exigeConfirmacaoDeAcessoTotal("GESTOR", "ADMINISTRADOR_PLATAFORMA")).toBe(true);
  });

  it("exige confirmação ao promover o Administrador, que é o vizinho na lista", () => {
    // É o erro mais provável da tela: os dois itens são adjacentes no seletor
    // e os nomes começam igual.
    expect(exigeConfirmacaoDeAcessoTotal("ADMIN", "ADMINISTRADOR_PLATAFORMA")).toBe(true);
  });

  it("exige confirmação ao criar alguém já com acesso total", () => {
    expect(exigeConfirmacaoDeAcessoTotal(null, "ADMINISTRADOR_PLATAFORMA")).toBe(true);
  });

  it("NÃO exige ao editar quem já tem acesso total", () => {
    expect(exigeConfirmacaoDeAcessoTotal("ADMINISTRADOR_PLATAFORMA", "ADMINISTRADOR_PLATAFORMA"))
      .toBe(false);
  });

  it("NÃO exige ao rebaixar quem tinha acesso total", () => {
    // Tirar poder não é o risco que esta regra cobre — e a RN46 já protege o
    // caso de sobrar ninguém.
    expect(exigeConfirmacaoDeAcessoTotal("ADMINISTRADOR_PLATAFORMA", "LEITURA")).toBe(false);
    expect(exigeConfirmacaoDeAcessoTotal("ADMINISTRADOR_PLATAFORMA", "ADMIN")).toBe(false);
  });

  it("NÃO exige em nenhuma troca entre papéis comuns", () => {
    const comuns: Papel[] = [
      "GESTOR",
      "ANALISTA",
      "ANALISTA_SCOUT",
      "COMERCIAL",
      "APROVADOR",
      "LEITURA",
      "ADMIN",
    ];
    for (const de of comuns) {
      for (const para of comuns) {
        expect(exigeConfirmacaoDeAcessoTotal(de, para), `${de} → ${para}`).toBe(false);
      }
    }
  });

  /*
   * A cerca contra o defeito da Onda 15: a regra pergunta pela CAPACIDADE, e
   * não pelo nome do papel. Se um dia outro papel ganhar acesso total, ele
   * passa a exigir confirmação sozinho — sem ninguém lembrar de vir aqui.
   */
  it("vale para qualquer papel de acesso total, não para um nome escolhido a dedo", () => {
    const totais = (["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR",
      "LEITURA", "ADMIN", "ADMINISTRADOR_PLATAFORMA"] as Papel[]).filter(temAcessoTotal);
    expect(totais.length, "nenhum papel de acesso total — a cerca ficou cega").toBeGreaterThan(0);
    for (const papel of totais) {
      expect(exigeConfirmacaoDeAcessoTotal("LEITURA", papel), papel).toBe(true);
    }
  });

  it("a mensagem diz o que fazer, e não só o que houve", () => {
    expect(MENSAGEM_CONFIRMAR_ACESSO_TOTAL).toContain("toda ação da plataforma");
    expect(MENSAGEM_CONFIRMAR_ACESSO_TOTAL).toMatch(/[Mm]arque a confirmação/);
  });
});

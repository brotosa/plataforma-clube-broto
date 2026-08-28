import { describe, expect, it } from "vitest";

import { ACOES } from "@/dominio/autorizacao/permissoes";
import { MANUAL_ACOES, ORDEM_MODULOS } from "@/conteudo/manual-usuario/conteudo";

/**
 * **O Manual do usuário descreve TODA ação da matriz de permissões.**
 *
 * As seções por papel do manual (`/manual`) são geradas a partir da matriz
 * (`podeExecutar`): cada papel mostra exatamente as ações que ele pode. Se
 * uma ação nova entrar na matriz sem uma descrição em `MANUAL_ACOES`, o
 * manual do papel que a tiver ficaria com um buraco silencioso — a ação
 * apareceria só como `undefined`, sem título nem passo a passo. Esta cerca
 * quebra o build nesse caso: a documentação acompanha a permissão.
 */
describe("manual do usuário cobre a matriz de permissões", () => {
  it("toda ação tem descrição no manual", () => {
    const semDescricao = ACOES.filter((acao) => MANUAL_ACOES[acao] === undefined);
    expect(
      semDescricao,
      `Ações sem entrada em MANUAL_ACOES (conteudo/manual-usuario/conteudo.ts): ${semDescricao.join(", ")}`,
    ).toEqual([]);
  });

  it("o manual não descreve ação que não existe na matriz", () => {
    const conjunto = new Set<string>(ACOES);
    const orfas = Object.keys(MANUAL_ACOES).filter((acao) => !conjunto.has(acao));
    expect(orfas, `Descrições órfãs no manual: ${orfas.join(", ")}`).toEqual([]);
  });

  it("todo módulo referido pelas ações está na ordem de exibição", () => {
    const ordem = new Set<string>(ORDEM_MODULOS);
    const foraDaOrdem = Object.values(MANUAL_ACOES)
      .map((descricao) => descricao.modulo)
      .filter((modulo) => !ordem.has(modulo));
    expect([...new Set(foraDaOrdem)]).toEqual([]);
  });

  it("cada descrição tem título, o-que-é, onde e ao menos um passo", () => {
    const incompletas = ACOES.filter((acao) => {
      const d = MANUAL_ACOES[acao];
      return !d?.titulo?.trim() || !d?.oQueE?.trim() || !d?.onde?.trim() || (d?.passos?.length ?? 0) === 0;
    });
    expect(incompletas, `Descrições incompletas: ${incompletas.join(", ")}`).toEqual([]);
  });
});

import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { MAPA_AJUDA } from "@/dominio/ajuda/mapa-contextual";

/**
 * Cerca da RN59 — **toda tela da plataforma está no `MAPA_AJUDA`**.
 *
 * ## O defeito que ela impede, e que já aconteceu três vezes
 *
 * Tela fora do mapa não cai na abertura: ela perde a **barra de volta**.
 * `resolverOrigem` não casa com padrão nenhum e devolve nulo, então quem
 * clica no "?" ali entra no guia e não tem como voltar ao que estava
 * fazendo. Não há erro, não há tela vazia — não há saída.
 *
 * Aconteceu com **Configurações** (corrigido na Onda 15, e o comentário do
 * mapa registra o diagnóstico), e depois, de novo e em silêncio, com o
 * **Gerador de relatórios**, os **Painéis**, a **Busca** e o **Manual**. A
 * causa é sempre a mesma: módulo entregue depois do mapa, sem passar por
 * aqui. Até agora, quem cobrava era um teste escrito à mão **por tela** —
 * que é exatamente o tipo de cobrança que envelhece junto com o mapa.
 *
 * ## O que ela lê
 *
 * Os diretórios de primeiro nível sob `app/(plataforma)/` que têm
 * `page.tsx`. É onde vive toda tela dentro do shell — e é o shell que
 * desenha o "?", então é exatamente o conjunto que precisa de destino.
 *
 * **Seção não é cobrada, só a entrada.** A RN59 admite módulo conhecido sem
 * seção atribuída: ele abre na abertura, e a volta funciona. O que ela não
 * admite é a tela que o mapa não conhece.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHELL = join(RAIZ, "app", "(plataforma)");

/**
 * A única exceção, e ela é o destino, não uma tela esquecida.
 *
 * `/ajuda` é o próprio guia: mapeá-lo faria a ajuda oferecer voltar para a
 * ajuda. A barra de volta dele aponta para a origem que veio na URL.
 */
const FORA_DO_MAPA: ReadonlyArray<string> = ["ajuda"];

function telasDoShell(): ReadonlyArray<string> {
  return readdirSync(SHELL, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    // Grupos de rota (`(grupo)`) e rotas dinâmicas não são módulo de primeiro
    // nível; o mapa resolve por prefixo e alcança o que está abaixo delas.
    .filter((entrada) => !entrada.name.startsWith("(") && !entrada.name.startsWith("["))
    .filter((entrada) => existsSync(join(SHELL, entrada.name, "page.tsx")))
    .map((entrada) => entrada.name)
    .sort();
}

describe("RN59 — o mapa de ajuda cobre todas as telas", () => {
  const telas = telasDoShell();

  /*
   * Anti-cegueira: as asserções abaixo varrem uma lista, e uma lista vazia
   * as faria passar sem examinar nada — bastaria alguém renomear a pasta do
   * shell.
   */
  it("há telas para conferir", () => {
    expect(telas.length).toBeGreaterThanOrEqual(15);
    expect(telas).toContain("relatorios");
    expect(telas).toContain("paineis");
  });

  it("toda tela do shell tem entrada no MAPA_AJUDA", () => {
    const mapeadas = new Set(MAPA_AJUDA.map((modulo) => modulo.padrao.replace(/^\//, "")));
    const semEntrada = telas.filter(
      (tela) => !mapeadas.has(tela) && !FORA_DO_MAPA.includes(tela),
    );
    expect(
      semEntrada,
      "tela sem entrada no MAPA_AJUDA — sem ela a barra de volta da ajuda desaparece (RN59)",
    ).toEqual([]);
  });

  /**
   * O contrário também: entrada que não corresponde a tela nenhuma.
   *
   * Mapa que aponta para rota inexistente não quebra nada visivelmente — só
   * carrega lixo que a próxima pessoa lê como se fosse verdade sobre a
   * plataforma.
   */
  it("nenhuma entrada do mapa aponta para tela que não existe", () => {
    const existentes = new Set(telas);
    const orfas = MAPA_AJUDA.map((modulo) => modulo.padrao.replace(/^\//, ""))
      // A raiz é o Dashboard, que é o `page.tsx` do próprio shell.
      .filter((padrao) => padrao !== "")
      // Padrões com mais de um segmento (`/aliados/mapa`) são recortes de uma
      // tela que já existe; o que se confere aqui é o módulo de primeiro nível.
      .map((padrao) => padrao.split("/")[0]!)
      .filter((modulo) => !existentes.has(modulo));
    expect([...new Set(orfas)]).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * CERCA — classe usada na interface existe no CSS.
 *
 * ## O defeito que a originou
 *
 * A T36 foi entregue usando `h1`, `sub`, `h2`, `card-h`, `card-t`, `card-b` e
 * `aviso-erro`. **Nenhuma das sete existe** em `dseed-admin.css`. O resultado
 * chegou à produção: títulos no tamanho padrão do navegador, cartões sem
 * espaçamento interno, conteúdo colado na lateral e a mensagem de erro do
 * compilador pintada como aviso azul de informação.
 *
 * ## Por que nada pegou
 *
 * Classe inexistente **não é erro em lugar nenhum**. O TypeScript vê uma
 * string. O React a escreve no DOM. O navegador não casa seletor e segue em
 * frente. E os testes que a plataforma tem olham para outras coisas:
 *
 *  • o **axe-core** mede contraste e semântica, não estilo aplicado — texto
 *    preto sem padding passa em AAA com folga;
 *  • os **e2e** localizam por papel e por texto, que independem de classe;
 *  • o teste de **380px** confere transbordo horizontal, e uma tela sem
 *    padding nenhum transborda menos, não mais.
 *
 * A tela passou em 258 e2e, no axe AAA e em 38 casos de responsividade, e
 * ainda assim chegou quebrada à tela de quem usa. Quem viu foi a TI, olhando.
 *
 * ## Por que esta cerca é barata
 *
 * A varredura que a motivou encontrou **244 classes literais** em `app/` e
 * exatamente **4 sem definição** — as quatro do defeito. Não há dívida velha
 * para limpar nem allowlist para manter: o repositório já estava correto, e a
 * cerca só impede que deixe de estar.
 *
 * ## O que ela NÃO cobre, dito por escrito
 *
 * Só `className` com **string literal**. Classe montada em expressão
 * (`className={ativo ? "a" : "b"}`) fica de fora: cobri-la exigiria avaliar
 * código, e uma cerca que erra o alvo é pior que uma cerca estreita. Na
 * prática a maioria dos nomes aparece ao menos uma vez como literal, então a
 * cobertura real é maior que o recorte sugere.
 */

const RAIZ = process.cwd();

/** Onde as classes são definidas. `tokens.css` é intocável, mas conta. */
const FOLHAS = [join("design", "dseed-admin.css"), join("design", "tokens.css")];

/**
 * Classes que a interface usa e que **não** vêm das folhas do produto.
 *
 * `skip` é o atalho "pular para o conteúdo" da Onda 14 e vive no `layout`;
 * as demais são utilitárias de terceiros ou nomes de biblioteca. Entrada nova
 * aqui exige motivo escrito, como em toda lista de exceção desta casa.
 */
const FORA_DAS_FOLHAS: Readonly<Record<string, string>> = {};

function arquivosTsx(pasta: string, acumulado: string[] = []): string[] {
  for (const nome of readdirSync(join(RAIZ, pasta))) {
    const relativo = join(pasta, nome);
    if (statSync(join(RAIZ, relativo)).isDirectory()) {
      arquivosTsx(relativo, acumulado);
    } else if (nome.endsWith(".tsx")) {
      acumulado.push(relativo);
    }
  }
  return acumulado;
}

function classesDefinidas(): Set<string> {
  const css = FOLHAS.map((folha) => readFileSync(join(RAIZ, folha), "utf8")).join("\n");
  const nomes = new Set<string>();
  for (const achado of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    nomes.add(achado[1]!);
  }
  return nomes;
}

interface UsoDeClasse {
  classe: string;
  arquivo: string;
}

function classesUsadas(): UsoDeClasse[] {
  const usos: UsoDeClasse[] = [];
  for (const arquivo of arquivosTsx("app")) {
    const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
    // Só a forma literal: `className="a b c"`. A chave fechada no conjunto de
    // caracteres exclui `className={...}` de propósito.
    for (const achado of fonte.matchAll(/className="([^"{}]+)"/g)) {
      for (const classe of achado[1]!.split(/\s+/).filter(Boolean)) {
        usos.push({ classe, arquivo });
      }
    }
  }
  return usos;
}

describe("toda classe escrita na interface existe no CSS do produto", () => {
  const definidas = classesDefinidas();
  const usos = classesUsadas();

  /*
   * O guarda contra a cegueira: se a leitura deixar de encontrar classes — por
   * um refactor de formatação, por outra forma de escrever `className` —, os
   * testes abaixo passariam vazios, verdes e inúteis.
   */
  it("a leitura encontra o CSS e a interface", () => {
    expect(definidas.size, "nenhuma classe lida das folhas").toBeGreaterThan(200);
    expect(new Set(usos.map((uso) => uso.classe)).size, "nenhuma classe lida do app").toBeGreaterThan(
      150,
    );
    // Duas âncoras conhecidas, para o caso de a leitura passar a achar lixo.
    expect(definidas.has("card")).toBe(true);
    expect(definidas.has("h-page")).toBe(true);
  });

  it("nenhuma classe da interface está sem definição", () => {
    const orfas = [
      ...new Map(
        usos
          .filter((uso) => !definidas.has(uso.classe) && !(uso.classe in FORA_DAS_FOLHAS))
          .map((uso) => [`${uso.classe} — ${uso.arquivo}`, uso]),
      ).keys(),
    ].sort();

    expect(
      orfas,
      "Classe usada na interface e não definida em design/dseed-admin.css nem em " +
        "design/tokens.css.\n\n" +
        "Classe inexistente NÃO dá erro em lugar nenhum: o TypeScript vê uma string, o React a " +
        "escreve no DOM e o navegador ignora. O axe não mede estilo, o e2e localiza por papel e " +
        "texto, e o teste de 380px confere transbordo — uma tela sem padding transborda menos.\n\n" +
        "Ou use a classe que a plataforma já tem, ou defina a nova em dseed-admin.css, no padrão " +
        "de comentário do arquivo. `design/tokens.css` é intocável.",
    ).toEqual([]);
  });

  it("nenhuma exceção sobrevive ao motivo que a justificava", () => {
    const usadas = new Set(usos.map((uso) => uso.classe));
    const obsoletas = Object.keys(FORA_DAS_FOLHAS).filter(
      (classe) => !usadas.has(classe) || definidas.has(classe),
    );
    expect(obsoletas, "exceção que já não corresponde a nada — tire da lista").toEqual([]);
  });
});

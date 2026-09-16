import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * CERCA — caso de uso que ESCREVE decide, conscientemente, se audita.
 *
 * ## Por que esta cerca existe
 *
 * "Auditoria e RBAC não são opcionais: toda mutação de entidade de negócio
 * grava evento com valor anterior/novo/autor" — CLAUDE.md, regra inviolável.
 * Até aqui, nada no build a cobrava. O resultado apareceu duas vezes:
 *
 *  • redefinir credencial de quem JÁ estava com a troca exigida não mudava
 *    nenhum campo auditável, o diff saía vazio, e `registrarMutacao` não
 *    gravava nada — a reemissão era invisível na T28 (corrigido na Onda 15);
 *  • a importação de telemetria da Onda 1 gravava procedência em
 *    `Importacao` e **não** aparecia na trilha, enquanto a da operadora
 *    (Onda 12) aparecia — duas importações, uma visível.
 *
 * Nenhum dos dois foi descuido de quem escreveu: os dois são o mesmo ponto
 * cego, o de que "escrevi no banco" e "registrei o ato" parecem a mesma
 * coisa e não são.
 *
 * ## O que ela cobra
 *
 * Toda função exportada de `infra/casos-de-uso/` que escreve no banco ou
 * **audita no próprio corpo**, ou está declarada em `ESCRITAS_SEM_TRILHA`
 * com um motivo escrito. Não há terceira opção — e é esse o ponto: a cerca
 * não julga se a escrita merece trilha (não teria como), ela obriga a
 * **decisão a ser explícita** e revisável no PR.
 *
 * ## Por que a lista de exceções não vira lixeira
 *
 * O segundo teste é tão importante quanto o primeiro: entrada que já não
 * corresponde a uma função que escreve sem auditar **reprova**. Função
 * renomeada, removida ou que passou a auditar tira a entrada junto. Lista de
 * exceções que só cresce é pior que cerca nenhuma, porque dá a impressão de
 * governança onde há acúmulo.
 */

const PASTA = join(process.cwd(), "infra", "casos-de-uso");

const ESCRITA =
  /(prisma|tx|cliente)\.[a-zA-Z]+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/;
const AUDITA = /registrarMutacao|\.gravar\(/;
const ASSINATURA = /^export (?:async )?function (\w+)/;

/**
 * As escritas que NÃO geram evento de trilha, e por quê.
 *
 * A chave é `arquivo.ts:funcao`. O motivo é lido por gente, no PR — é o
 * único lugar onde a decisão fica registrada, então frases como "não
 * precisa" não servem: escreva o que a torna diferente de uma mutação de
 * negócio.
 */
const ESCRITAS_SEM_TRILHA: Readonly<Record<string, string>> = {
  // ---- STAGING: área de trabalho da importação, não o cadastro ----
  // Staging é rascunho conferível na tela, descartável, e nada dele alcança
  // o negócio até a efetivação — que audita. Auditar cada correção de célula
  // encheria a trilha de ruído e afogaria o ato que importa.
  "assinantes-importacao.ts:prepararImportacaoAssinantes":
    "grava staging de assinantes; a efetivação é que audita",
  "carga-inicial.ts:iniciarCarga": "povoa o staging da carga inicial",
  "carga-inicial.ts:decidirSellers": "decisão sobre linha de staging",
  "carga-inicial.ts:decidirAgrupamentos": "decisão sobre linha de staging",
  "carga-inicial.ts:aprovarTudo": "decisão em lote sobre staging",
  "carga-inicial.ts:renomearAgrupamento": "edita rótulo em staging",
  "carga-inicial.ts:moverOferta": "move oferta entre agrupamentos do staging, antes de existir cadastro",
  "carga-prospects.ts:iniciarImportacaoProspects": "povoa staging de prospects",
  "carga-prospects.ts:aplicarMapeamentoProspects": "de/para sobre staging",
  "importar-ofertas.ts:importarOfertas": "povoa staging de ofertas",
  "importar-ofertas.ts:corrigirCelulaOferta": "corrige célula em staging",
  "importar-solucoes.ts:importarSolucoes": "povoa staging de soluções",
  "importar-solucoes.ts:corrigirCelulaSolucao": "corrige célula em staging",

  // ---- DELEGAÇÃO: quem audita é o caso de uso reusado ----
  "importar-ofertas.ts:efetivarImportacaoOfertas":
    "cria pelas mãos de `criarOferta`, que audita — RN01 e trilha vêm de graça",
  "importar-solucoes.ts:efetivarImportacaoSolucoes":
    "cria pelas mãos de `criarSolucao`, que audita",

  // ---- AUTOMÁTICO: contador de proteção, não ato de gente ----
  // O bloqueio por origem conta falhas sozinho, sem ninguém decidir nada. O
  // ato humano correspondente — liberar o endereço — é auditado em
  // `bloqueio-origem.ts:liberarOrigem`. Mesmo desenho do bloqueio por conta.
  "bloqueio-origem.ts:registrarFalhaDeOrigem": "contador automático de falhas por endereço",
  "bloqueio-origem.ts:limparOrigem": "zera contador após login bem-sucedido",

  // ---- DERIVADO: snapshot de uma escrita que já foi auditada ----
  "parametrizador.ts:criarVersaoDeConfiguracao":
    "congela indicadores após escrita já auditada; grava autorId e motivo próprios (RN25)",

  // ---- DRY-RUN: valida e conta, não toca no cadastro ----
  // As duas gravam o de/para e o resultado da validação NO STAGING, e
  // declaram no próprio cabeçalho que nada muta em `assinantes` (RN29). A
  // efetivação é outra função, e ela audita.
  "assinantes-importacao.ts:aplicarMapeamentoNucleo":
    "simulação declarada — valida e grava o de/para em staging, sem tocar em assinantes (RN29)",
  "assinantes-importacao.ts:aplicarMapeamentoEnriquecimento":
    "simulação declarada — casa por CPF e conta, sem gravar enriquecimento",
};

interface FuncaoQueEscreve {
  chave: string;
  audita: boolean;
}

/** Fatia cada arquivo pelas funções exportadas e classifica cada uma. */
function levantarFuncoes(): FuncaoQueEscreve[] {
  const achados: FuncaoQueEscreve[] = [];

  for (const arquivo of readdirSync(PASTA).sort()) {
    if (!arquivo.endsWith(".ts") || arquivo.includes(".test.")) continue;
    const linhas = readFileSync(join(PASTA, arquivo), "utf8").split("\n");

    const inicios: Array<{ indice: number; nome: string }> = [];
    linhas.forEach((linha, indice) => {
      const nome = ASSINATURA.exec(linha)?.[1];
      if (nome) inicios.push({ indice, nome });
    });

    inicios.forEach(({ indice, nome }) => {
      /*
       * O fim da função é o `}` na COLUNA ZERO, não o próximo `export`.
       *
       * A primeira versão desta cerca fatiava até o próximo export e acusou
       * `chaveNaturalDoEvento` — uma função pura, de hash — por escrever no
       * banco. Ela é a ÚLTIMA exportada do arquivo, e o corte engoliu 150
       * linhas de auxiliares privados que vêm depois. A cerca encontrou um
       * defeito nela mesma antes de alguém confiar no que ela diz.
       */
      let fim = linhas.length;
      for (let i = indice + 1; i < linhas.length; i += 1) {
        if (linhas[i] === "}") {
          fim = i + 1;
          break;
        }
      }
      const corpo = linhas.slice(indice, fim).join("\n");
      if (!ESCRITA.test(corpo)) return;
      achados.push({ chave: `${arquivo}:${nome}`, audita: AUDITA.test(corpo) });
    });
  }

  return achados;
}

describe("toda escrita de caso de uso decide sobre a trilha (CLAUDE.md — auditoria não é opcional)", () => {
  it("nenhuma função escreve sem auditar e sem estar declarada", () => {
    const semTrilha = levantarFuncoes()
      .filter((funcao) => !funcao.audita)
      .map((funcao) => funcao.chave)
      .filter((chave) => !(chave in ESCRITAS_SEM_TRILHA));

    expect(
      semTrilha,
      [
        "Função de caso de uso escreve no banco e NÃO grava evento de auditoria.",
        "",
        "Se for mutação de entidade de negócio, grave o evento — é regra inviolável",
        "do CLAUDE.md, e o defeito que ela evita é invisível: a escrita funciona,",
        "só ninguém consegue provar depois quem a fez.",
        "",
        "Se for staging, delegação, contador automático ou simulação, declare em",
        "ESCRITAS_SEM_TRILHA com o motivo — a decisão precisa ser lida no PR.",
      ].join("\n"),
    ).toEqual([]);
  });

  /*
   * O contrapeso. Sem ele a lista vira depósito: alguém conserta a função,
   * a entrada fica, e a próxima pessoa a lê como se ainda valesse.
   */
  it("nenhuma declaração sobrevive à função que a justificava", () => {
    const funcoes = levantarFuncoes();
    const aindaEscrevemSemAuditar = new Set(
      funcoes.filter((funcao) => !funcao.audita).map((funcao) => funcao.chave),
    );

    const obsoletas = Object.keys(ESCRITAS_SEM_TRILHA).filter(
      (chave) => !aindaEscrevemSemAuditar.has(chave),
    );

    expect(
      obsoletas,
      [
        "Declaração em ESCRITAS_SEM_TRILHA que já não corresponde a nada.",
        "",
        "A função foi renomeada, removida, ou passou a auditar. Em qualquer dos",
        "casos a entrada sai da lista: exceção que sobrevive ao motivo dá",
        "aparência de governança onde só há acúmulo.",
      ].join("\n"),
    ).toEqual([]);
  });

  it("toda declaração traz um motivo escrito, não um carimbo", () => {
    const vagas = Object.entries(ESCRITAS_SEM_TRILHA).filter(
      ([, motivo]) => motivo.trim().length < 20,
    );
    expect(vagas.map(([chave]) => chave), "motivo curto demais para ser lido como razão").toEqual(
      [],
    );
  });

  /*
   * A cerca só vale enquanto estiver medindo algo. Se um refactor mudar o
   * formato dos casos de uso e o levantamento passar a não achar nada, os
   * testes acima passariam vazios — verdes e inúteis.
   */
  it("o levantamento continua enxergando os casos de uso", () => {
    const funcoes = levantarFuncoes();
    expect(funcoes.length).toBeGreaterThan(40);
    expect(funcoes.some((funcao) => funcao.audita)).toBe(true);
  });
});

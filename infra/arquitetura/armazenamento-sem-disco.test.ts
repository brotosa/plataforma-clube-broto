import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Nenhum caminho de produção escreve em disco (RN71).**
 *
 * Invariante de arquitetura, no padrão das cercas da RN07/RN19/RN49/RN58/
 * RN62: a regra só sobrevive às próximas fases se o build quebrar quando
 * alguém a desfizer. E ela é fácil de desfazer sem má-fé — gravar um
 * arquivo temporário "só para montar o zip" é conveniente, funciona na
 * máquina de quem escreveu, passa no CI, e **só falha em produção**, onde
 * o disco é efêmero e por instância.
 *
 * Foi exatamente assim que a Onda 13 nasceu: a ativação de campanha só
 * quebrou depois de a plataforma estar no ar, meses depois de a F11 e a
 * F12 gravarem em `var/exportacoes/` sem que nada apontasse o problema.
 *
 * O que esta cerca prende:
 *
 * 1. Nenhum arquivo de produção de `app/`, `infra/` ou `dominio/` importa
 *    uma API de ESCRITA de `node:fs`. Leitura continua livre — o template
 *    do dossiê lê o próprio repositório, e isso é legítimo.
 * 2. Nem por importação de namespace (`import * as fs`), que passaria pela
 *    verificação de nomes se ela olhasse só os importes nomeados.
 * 3. A porta `ArmazenadorSnapshots` tem UMA implementação, e ela é a do
 *    banco. Duas implementações fariam desenvolvimento e CI exercitarem um
 *    caminho que produção não executa, que é a forma como esta falha
 *    chegou ao ar sem ninguém ver.
 *
 * **`scripts/` fica de fora, de propósito.** O gerador do guia autônomo
 * (`scripts/gerar-guia-autonomo.ts`) e o da geometria do Brasil escrevem
 * em disco por definição: são ferramentas de build que rodam na máquina de
 * quem desenvolve e commitam o resultado. Acusá-los seria a cerca punindo
 * o uso correto.
 *
 * O que ela NÃO proíbe: ler arquivo, usar `node:path`, nem nomear uma
 * variável `writeFile`. O alvo é a ESCRITA em disco a partir do código que
 * roda servindo requisição.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRETORIOS_DE_PRODUCAO = ["app", "infra", "dominio"];

/**
 * As funções de `node:fs` que escrevem. A lista é de nomes exportados
 * pelo módulo — tanto a forma síncrona quanto a de promessa —, e inclui
 * remoção e renomeação: quem apaga arquivo em produção também está
 * supondo um disco que persiste.
 */
const ESCRITAS_DE_DISCO = [
  "appendFile",
  "appendFileSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "createWriteStream",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempSync",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "truncate",
  "truncateSync",
  "unlink",
  "unlinkSync",
  "write",
  "writeFile",
  "writeFileSync",
  "writeSync",
  "writev",
] as const;

/** Os especificadores que trazem o sistema de arquivos para dentro. */
const MODULOS_DE_ARQUIVO = ["node:fs", "node:fs/promises", "fs", "fs/promises"];

function arquivosDeProducao(): string[] {
  const encontrados: string[] = [];
  const visitar = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === ".next") continue;
        visitar(caminho);
        continue;
      }
      if (!/\.tsx?$/.test(entrada.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entrada.name)) continue;
      encontrados.push(caminho);
    }
  };
  for (const diretorio of DIRETORIOS_DE_PRODUCAO) {
    visitar(join(RAIZ, diretorio));
  }
  return encontrados;
}

/**
 * O fonte sem comentários — porque a cerca julga CÓDIGO, não texto.
 *
 * O próprio `armazenador.ts` cita `var/exportacoes/` ao contar por que a
 * implementação local saiu, e essa história é a parte mais útil do
 * arquivo: uma cerca que a proibisse estaria punindo a documentação da
 * decisão que ela existe para proteger.
 *
 * A remoção é ingênua de propósito (não entende `//` dentro de string).
 * O efeito de um engano seria deixar de VER uma ocorrência, nunca acusar
 * uma que não existe — e o custo de um falso negativo aqui é bem menor
 * que o de uma cerca que se ignora por acusar demais.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Todo `import … from "<modulo de arquivo>"` de um fonte, com a cláusula. */
function importesDeArquivo(fonte: string): string[] {
  const alternativas = MODULOS_DE_ARQUIVO.map((m) => m.replace("/", "\\/")).join("|");
  const padrao = new RegExp(`import\\s+([^;]*?)\\s+from\\s+["'](?:${alternativas})["']`, "g");
  return [...fonte.matchAll(padrao)].map((achado) => achado[1] ?? "");
}

describe("RN71 · nenhum caminho de produção escreve em disco", () => {
  it("nenhum arquivo de app/, infra/ ou dominio/ importa escrita de node:fs", () => {
    const infratores: string[] = [];

    for (const caminho of arquivosDeProducao()) {
      const fonte = semComentarios(readFileSync(caminho, "utf8"));
      for (const clausula of importesDeArquivo(fonte)) {
        // `import * as fs` traz o módulo inteiro, escrita incluída: não dá
        // para saber pelo importe o que será usado, então recusa-se o
        // atalho e exige-se importe nomeado de leitura.
        if (/^\*\s+as\s+/.test(clausula.trim())) {
          infratores.push(`${relative(RAIZ, caminho)} — importe de namespace (\`${clausula}\`)`);
          continue;
        }
        const nomeados = clausula
          .replace(/^[^{]*\{/, "")
          .replace(/\}[^}]*$/, "")
          .split(",")
          .map((nome) => nome.split(" as ")[0]?.trim() ?? "")
          .filter(Boolean);
        for (const nome of nomeados) {
          if ((ESCRITAS_DE_DISCO as ReadonlyArray<string>).includes(nome)) {
            infratores.push(`${relative(RAIZ, caminho)} — ${nome}`);
          }
        }
      }
    }

    expect(
      infratores,
      "escrita em disco no código de produção: o arquivo não sobrevive a um deploy nem existe " +
        "na próxima instância (RN71). O destino é o armazenamento da plataforma, pela porta " +
        "ArmazenadorSnapshots.",
    ).toEqual([]);
  });

  it("a porta tem uma implementação só, e ela guarda no banco", () => {
    const dono = join("infra", "exportacoes", "armazenador.ts");
    const fonte = semComentarios(readFileSync(join(RAIZ, dono), "utf8"));

    // A implementação do banco existe e é a que se exporta.
    expect(fonte).toMatch(/export function criarArmazenadorPrisma\(\): ArmazenadorSnapshots/);
    expect(fonte).toContain("arquivoArmazenado");

    // E nenhuma outra: `criarArmazenadorLocal`, que gravava em
    // var/exportacoes/, saiu na F21 e não volta por descuido.
    const criadores = [...fonte.matchAll(/export function (criarArmazenador\w*)/g)].map(
      (achado) => achado[1],
    );
    expect(criadores).toEqual(["criarArmazenadorPrisma"]);

    const outrosImplementadores = arquivosDeProducao()
      .filter((caminho) => relative(RAIZ, caminho) !== dono)
      .filter((caminho) =>
        /:\s*ArmazenadorSnapshots\s*\{/.test(semComentarios(readFileSync(caminho, "utf8"))),
      )
      .map((caminho) => relative(RAIZ, caminho));

    expect(
      outrosImplementadores,
      "segunda implementação da porta: desenvolvimento e CI passariam por um caminho que " +
        "produção nunca executa — foi assim que a falha da Onda 13 chegou ao ar.",
    ).toEqual([]);
  });

  it("var/exportacoes/ não é destino de ninguém no código de produção", () => {
    const citando = arquivosDeProducao()
      .filter((caminho) =>
        semComentarios(readFileSync(caminho, "utf8")).includes(join("var", "exportacoes")),
      )
      .map((caminho) => relative(RAIZ, caminho));

    expect(citando, `o diretório em disco não tem mais dono (separador "${sep}")`).toEqual([]);
  });
});

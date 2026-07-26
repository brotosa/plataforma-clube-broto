import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  criarKitAdapterGenericoZip,
  nomeDoArquivoDaMarca,
  nomesDosArquivosDaPeca,
  type ConteudoDoKit,
} from "./adapter";
import { criarZip } from "./zip";

/** Lê um zip do jeito mais simples: percorre os cabeçalhos locais. */
function lerZip(pacote: Buffer): Map<string, Buffer> {
  const arquivos = new Map<string, Buffer>();
  let posicao = 0;
  while (posicao + 4 <= pacote.length && pacote.readUInt32LE(posicao) === 0x04034b50) {
    const tamanhoComprimido = pacote.readUInt32LE(posicao + 18);
    const tamanhoNome = pacote.readUInt16LE(posicao + 26);
    const tamanhoExtra = pacote.readUInt16LE(posicao + 28);
    const inicioNome = posicao + 30;
    const nome = pacote.subarray(inicioNome, inicioNome + tamanhoNome).toString("utf8");
    const inicioDados = inicioNome + tamanhoNome + tamanhoExtra;
    const dados = pacote.subarray(inicioDados, inicioDados + tamanhoComprimido);
    arquivos.set(nome, inflateRawSync(dados));
    posicao = inicioDados + tamanhoComprimido;
  }
  return arquivos;
}

const MOMENTO = new Date("2026-08-01T12:00:00Z");

const conteudoDoKit = (): ConteudoDoKit => ({
  campanha: {
    id: "camp-1",
    nome: "Safra 2026 — Centro-Oeste",
    objetivo: "Ativar assinantes de grãos no Centro-Oeste",
    instrucoes: "Disparar o e-mail na primeira semana de agosto.",
    vigenciaInicio: "2026-08-01",
    vigenciaFim: "2026-08-31",
  },
  publicoCsv: Buffer.from("nome;cpf\nAssinante Sintético;000.000.000-00\n", "utf8"),
  manifesto: {
    campanha: {
      id: "camp-1",
      nome: "Safra 2026 — Centro-Oeste",
      objetivo: "Ativar assinantes de grãos no Centro-Oeste",
      vigenciaInicio: "2026-08-01",
      vigenciaFim: "2026-08-31",
    },
    publico: {
      contagem: 1,
      finalidade: "Campanha: Safra 2026 — Centro-Oeste",
      exportacaoId: "exp-1",
      hashArquivo: "abc123",
    },
    cestas: [{ id: "c-1", nome: "Cesta Solo Vivo", narrativa: "Solo saudável o ano todo" }],
    ofertas: [
      {
        id: "of-1",
        titulo: "Análise de solo",
        natureza: "BENEFICIO",
        aliado: "Aliado de exemplo",
        idExternoMinutrade: null,
        vigenciaInicio: "2026-08-01",
        vigenciaFim: "2026-08-31",
        viaCesta: "Cesta Solo Vivo",
      },
    ],
    pecas: [
      {
        formato: "E-mail",
        titulo: "Sua safra merece o Clube Broto",
        arquivoTexto: "pecas/01-sua-safra-merece-o-clube-broto.txt",
        arquivoImagem: null,
      },
    ],
  },
  pecas: [
    {
      formato: "E-mail",
      titulo: "Sua safra merece o Clube Broto",
      texto: "Ofertas selecionadas para quem planta e cria.",
      imagem: null,
    },
  ],
  versao: 1,
  momento: MOMENTO,
});

describe("empacotador zip", () => {
  it("preserva o conteúdo de cada arquivo", () => {
    const pacote = criarZip(
      [
        { nome: "a.txt", conteudo: Buffer.from("conteúdo com acento", "utf8") },
        { nome: "pasta/b.bin", conteudo: Buffer.from([0, 1, 2, 250, 255]) },
      ],
      MOMENTO,
    );
    const lido = lerZip(pacote);
    expect(lido.get("a.txt")?.toString("utf8")).toBe("conteúdo com acento");
    expect([...(lido.get("pasta/b.bin") ?? [])]).toEqual([0, 1, 2, 250, 255]);
  });

  it("gera bytes idênticos para a mesma entrada — hash do kit é verificável", () => {
    const arquivos = [{ nome: "a.txt", conteudo: Buffer.from("igual") }];
    expect(criarZip(arquivos, MOMENTO).equals(criarZip(arquivos, MOMENTO))).toBe(true);
  });

  // Validação por ferramenta externa: garante que o pacote é um zip de
  // verdade, não só legível pelo nosso próprio leitor. Onde o `unzip` não
  // existe, o teste se declara pulado em vez de falhar por ambiente.
  const temUnzip = (() => {
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!temUnzip)("produz um pacote que o unzip do sistema valida", () => {
    const pacote = criarZip(
      [{ nome: "publico.csv", conteudo: Buffer.from("nome;cpf\n") }],
      MOMENTO,
    );
    const diretorio = mkdtempSync(path.join(tmpdir(), "kit-"));
    const caminho = path.join(diretorio, "kit.zip");
    writeFileSync(caminho, pacote);
    const saida = execFileSync("unzip", ["-t", caminho], { encoding: "utf8" });
    expect(saida).toContain("No errors detected");
  });
});

describe("KitAdapter genérico (v1) — formato definitivo [A CONFIRMAR]", () => {
  it("empacota público, manifesto, instruções e peças", () => {
    const pacote = criarKitAdapterGenericoZip().montar(conteudoDoKit());
    const arquivos = lerZip(pacote.conteudo);
    expect([...arquivos.keys()]).toEqual([
      "publico.csv",
      "manifesto.json",
      "instrucoes.md",
      "pecas/01-sua-safra-merece-o-clube-broto.txt",
    ]);
  });

  it("nomeia o pacote com campanha e versão", () => {
    expect(criarKitAdapterGenericoZip().montar(conteudoDoKit()).nomeArquivo).toBe(
      "kit-safra-2026-centro-oeste-v1.zip",
    );
  });

  it("declara o adapter em uso, como o ExportAdapter da F4", () => {
    expect(criarKitAdapterGenericoZip().nome).toBe("GenericoZipV1");
  });

  it("leva o CSV do público exatamente como veio da exportação auditada", () => {
    const conteudo = conteudoDoKit();
    const arquivos = lerZip(criarKitAdapterGenericoZip().montar(conteudo).conteudo);
    expect(arquivos.get("publico.csv")?.equals(conteudo.publicoCsv)).toBe(true);
  });

  it("escreve o manifesto legível, com id externo pendente quando não há", () => {
    const arquivos = lerZip(criarKitAdapterGenericoZip().montar(conteudoDoKit()).conteudo);
    const manifesto = JSON.parse(arquivos.get("manifesto.json")!.toString("utf8"));
    expect(manifesto.ofertas[0].idExternoMinutrade).toBeNull();
    expect(arquivos.get("instrucoes.md")?.toString("utf8")).toContain("id externo pendente");
  });

  it("diz nas instruções que a plataforma não dispara nada (RN39)", () => {
    const arquivos = lerZip(criarKitAdapterGenericoZip().montar(conteudoDoKit()).conteudo);
    expect(arquivos.get("instrucoes.md")?.toString("utf8")).toContain(
      "A plataforma não dispara nada",
    );
  });

  it("inclui a imagem da peça e a referencia pelo mesmo nome do manifesto", () => {
    const conteudo = conteudoDoKit();
    const peca = {
      ...conteudo.pecas[0]!,
      imagem: { nomeArquivo: "banner.png", conteudo: Buffer.from([137, 80, 78, 71]) },
    };
    const nomes = nomesDosArquivosDaPeca(peca, 0);
    const arquivos = lerZip(
      criarKitAdapterGenericoZip().montar({ ...conteudo, pecas: [peca] }).conteudo,
    );
    expect(nomes.imagem).toBe("pecas/01-sua-safra-merece-o-clube-broto.png");
    expect(arquivos.has(nomes.imagem!)).toBe(true);
    expect(arquivos.has(nomes.texto)).toBe(true);
  });

  it("registra explicitamente a ausência de peças", () => {
    const arquivos = lerZip(
      criarKitAdapterGenericoZip().montar({
        ...conteudoDoKit(),
        pecas: [],
        manifesto: { ...conteudoDoKit().manifesto, pecas: [] },
      }).conteudo,
    );
    expect(arquivos.get("instrucoes.md")?.toString("utf8")).toContain("Nenhuma peça anexada.");
  });
});

// ---------------------------------------------------------------------
// F15 (RN54) — a marca do aliado embarcada no kit
// ---------------------------------------------------------------------

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', "utf8");

const comMarcas = (): ConteudoDoKit => {
  const base = conteudoDoKit();
  const marcas = [
    { aliado: "Agro Alfa", conteudo: PNG, extensao: ".png" },
    { aliado: "Beta Sementes", conteudo: SVG, extensao: ".svg" },
  ];
  return {
    ...base,
    marcas,
    manifesto: {
      ...base.manifesto,
      marcas: marcas.map((marca, indice) => ({
        aliado: marca.aliado,
        arquivo: nomeDoArquivoDaMarca(marca, indice),
      })),
    },
  };
};

describe("RN54 — marca do aliado no kit", () => {
  it("embarca cada marca em marcas/, com o mesmo nome que o manifesto declara", () => {
    const conteudo = comMarcas();
    const arquivos = lerZip(criarKitAdapterGenericoZip().montar(conteudo).conteudo);
    for (const declarada of conteudo.manifesto.marcas ?? []) {
      expect(arquivos.has(declarada.arquivo)).toBe(true);
    }
    expect(arquivos.get("marcas/01-agro-alfa.png")).toEqual(PNG);
    expect(arquivos.get("marcas/02-beta-sementes.svg")).toEqual(SVG);
  });

  it("preserva a extensão do tipo real — SVG entra como SVG, não rasterizado", () => {
    const arquivos = lerZip(criarKitAdapterGenericoZip().montar(comMarcas()).conteudo);
    expect(arquivos.get("marcas/02-beta-sementes.svg")?.toString("utf8")).toContain("<svg");
  });

  it("lista as marcas nas instruções da operação", () => {
    const arquivos = lerZip(criarKitAdapterGenericoZip().montar(comMarcas()).conteudo);
    const instrucoes = arquivos.get("instrucoes.md")?.toString("utf8") ?? "";
    expect(instrucoes).toContain("## Marcas dos aliados");
    expect(instrucoes).toContain("marcas/01-agro-alfa.png");
  });

  it("o zip continua determinístico com marcas — mesma entrada, mesmos bytes", () => {
    // A RN45 grava o hash do arquivo do kit: se o pacote variar entre duas
    // montagens iguais, o hash deixa de provar qualquer coisa.
    const primeiro = criarKitAdapterGenericoZip().montar(comMarcas()).conteudo;
    const segundo = criarKitAdapterGenericoZip().montar(comMarcas()).conteudo;
    expect(primeiro.equals(segundo)).toBe(true);
  });

  it("kit sem nenhuma marca sai idêntico ao de antes da F15 — nada a mais no zip", () => {
    // Não-regressão do que já está em produção: aliado sem marca (hoje,
    // todos) não muda um byte do pacote nem uma chave do manifesto.
    const semMarcas = criarKitAdapterGenericoZip().montar(conteudoDoKit()).conteudo;
    const comListaVazia = criarKitAdapterGenericoZip().montar({
      ...conteudoDoKit(),
      marcas: [],
    }).conteudo;
    expect(semMarcas.equals(comListaVazia)).toBe(true);

    const arquivos = lerZip(semMarcas);
    expect([...arquivos.keys()].some((nome) => nome.startsWith("marcas/"))).toBe(false);
    expect(arquivos.get("instrucoes.md")?.toString("utf8")).not.toContain("Marcas dos aliados");
  });

  it("as chaves antigas do manifesto continuam intactas quando há marca", () => {
    // "Sem quebrar o manifesto atual": `marcas` é chave NOVA; campanha,
    // publico, cestas, ofertas e pecas seguem com o mesmo nome e forma.
    const conteudo = comMarcas();
    const arquivos = lerZip(criarKitAdapterGenericoZip().montar(conteudo).conteudo);
    const manifesto = JSON.parse(arquivos.get("manifesto.json")!.toString("utf8"));
    const base = conteudoDoKit().manifesto;
    expect(manifesto.campanha).toEqual(base.campanha);
    expect(manifesto.publico).toEqual(base.publico);
    expect(manifesto.cestas).toEqual(base.cestas);
    expect(manifesto.ofertas).toEqual(base.ofertas);
    expect(manifesto.pecas).toEqual(base.pecas);
  });
});

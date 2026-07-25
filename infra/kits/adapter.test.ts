import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  criarKitAdapterGenericoZip,
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
      ...conteudo.pecas[0],
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

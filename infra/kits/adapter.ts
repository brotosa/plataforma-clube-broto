import { criarZip, type ArquivoDoZip } from "./zip";

/**
 * Kit de execução da campanha — o que a Broto entrega e a Minutrade
 * executa (ficha §1.1). O CANAL e o FORMATO definitivos preferidos pela
 * Minutrade estão **[A CONFIRMAR]** (ficha §9): a montagem fica isolada
 * atrás desta porta, com a implementação genérica da v1 (pacote zip com
 * CSV do público, manifesto, peças e instruções). Quando o formato for
 * confirmado, entra um adapter novo aqui — sem tocar domínio nem telas,
 * o mesmo padrão do ExportAdapter da F4.
 */

/** Manifesto: o que a operação precisa saber sobre o conteúdo. */
export interface ManifestoKit {
  campanha: {
    id: string;
    nome: string;
    objetivo: string | null;
    vigenciaInicio: string | null;
    vigenciaFim: string | null;
  };
  publico: {
    contagem: number;
    finalidade: string;
    exportacaoId: string;
    hashArquivo: string;
  };
  cestas: ReadonlyArray<{ id: string; nome: string; narrativa: string | null }>;
  ofertas: ReadonlyArray<{
    id: string;
    titulo: string;
    natureza: string;
    aliado: string;
    idExternoMinutrade: string | null;
    vigenciaInicio: string;
    vigenciaFim: string | null;
    viaCesta: string | null;
  }>;
  pecas: ReadonlyArray<{
    formato: string;
    titulo: string;
    arquivoTexto: string;
    arquivoImagem: string | null;
  }>;
  /**
   * F15 (RN54) — marcas dos aliados presentes no kit, quando existirem.
   *
   * Chave NOVA e opcional, de propósito: as anteriores continuam com o
   * mesmo nome e a mesma forma, então manifesto de kit já gerado segue
   * legível e o diff da RN45 não acusa mudança em oferta nenhuma. Aliado
   * sem marca simplesmente não aparece aqui — ausência é ausência, não
   * entrada vazia.
   */
  marcas?: ReadonlyArray<{ aliado: string; arquivo: string }>;
}

/** Marca de um aliado a embarcar no pacote (RN54). */
export interface MarcaDoKit {
  /** Nome de exibição do aliado — vira o nome do arquivo no zip. */
  aliado: string;
  conteudo: Buffer;
  /** Extensão canônica do tipo real apurado no envio (".png", ".svg"…). */
  extensao: string;
}

export interface PecaDoKit {
  formato: string;
  titulo: string;
  texto: string | null;
  imagem: { nomeArquivo: string; conteudo: Buffer } | null;
}

export interface ConteudoDoKit {
  campanha: {
    id: string;
    nome: string;
    objetivo: string | null;
    instrucoes: string | null;
    vigenciaInicio: string | null;
    vigenciaFim: string | null;
  };
  publicoCsv: Buffer;
  manifesto: ManifestoKit;
  pecas: ReadonlyArray<PecaDoKit>;
  /** Vazio quando nenhum aliado do kit tem marca — o zip só não tem a pasta. */
  marcas?: ReadonlyArray<MarcaDoKit>;
  versao: number;
  momento: Date;
}

export interface PacoteDoKit {
  nomeArquivo: string;
  conteudo: Buffer;
}

export interface KitAdapter {
  /** Identificador gravado na linha do kit, como no ExportAdapter (F4). */
  readonly nome: string;
  montar(conteudo: ConteudoDoKit): PacoteDoKit;
}

/** Nome de arquivo previsível a partir de um título livre. */
function nomeSeguro(texto: string, indice: number): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${String(indice + 1).padStart(2, "0")}-${base || "peca"}`;
}

/**
 * Caminho da marca dentro do zip (RN54). Mesma função usada na montagem e
 * na construção do manifesto, para os dois nunca divergirem — o mesmo
 * cuidado que `nomesDosArquivosDaPeca` já tomava para as peças.
 */
export function nomeDoArquivoDaMarca(marca: { aliado: string; extensao: string }, indice: number): string {
  return `marcas/${nomeSeguro(marca.aliado, indice)}${marca.extensao}`;
}

/** instrucoes.md — o texto que a operação lê antes de disparar. */
function instrucoesMarkdown(conteudo: ConteudoDoKit): string {
  const { campanha, manifesto } = conteudo;
  const linhas = [
    `# ${campanha.nome} — kit v${conteudo.versao}`,
    "",
    "Pacote gerado pela Plataforma de Administração do Clube Broto para",
    "execução pela Minutrade. A plataforma não dispara nada (RN39): o",
    "disparo é feito a partir deste pacote.",
    "",
    "## Campanha",
    "",
    `- Objetivo: ${campanha.objetivo?.trim() || "—"}`,
    `- Vigência: ${campanha.vigenciaInicio ?? "—"} a ${campanha.vigenciaFim ?? "—"}`,
    `- Público: ${manifesto.publico.contagem} assinantes (arquivo \`publico.csv\`)`,
    `- Finalidade declarada da lista: ${manifesto.publico.finalidade}`,
    "",
    "## Conteúdo",
    "",
  ];

  if (manifesto.cestas.length > 0) {
    linhas.push("### Cestas", "");
    for (const cesta of manifesto.cestas) {
      linhas.push(`- **${cesta.nome}** — ${cesta.narrativa?.trim() || "sem narrativa"}`);
    }
    linhas.push("");
  }

  linhas.push("### Ofertas", "");
  for (const oferta of manifesto.ofertas) {
    const externo = oferta.idExternoMinutrade ?? "id externo pendente";
    const via = oferta.viaCesta ? ` · via cesta ${oferta.viaCesta}` : "";
    linhas.push(`- **${oferta.titulo}** (${oferta.aliado}) — ${externo}${via}`);
  }
  linhas.push("");

  linhas.push("## Peças", "");
  if (manifesto.pecas.length === 0) {
    linhas.push("Nenhuma peça anexada.", "");
  } else {
    for (const peca of manifesto.pecas) {
      const imagem = peca.arquivoImagem ? ` · imagem: \`${peca.arquivoImagem}\`` : "";
      linhas.push(`- ${peca.formato} — ${peca.titulo}: \`${peca.arquivoTexto}\`${imagem}`);
    }
    linhas.push("");
  }

  if (manifesto.marcas && manifesto.marcas.length > 0) {
    linhas.push("## Marcas dos aliados", "");
    for (const marca of manifesto.marcas) {
      linhas.push(`- ${marca.aliado}: \`${marca.arquivo}\``);
    }
    linhas.push("");
  }

  linhas.push("## Instruções da operação", "", campanha.instrucoes?.trim() || "—", "");
  return linhas.join("\n");
}

/**
 * Implementação genérica da v1: um zip com `publico.csv`,
 * `manifesto.json`, `instrucoes.md` e a pasta `pecas/`.
 */
export function criarKitAdapterGenericoZip(): KitAdapter {
  return {
    nome: "GenericoZipV1",
    montar(conteudo) {
      const arquivos: ArquivoDoZip[] = [
        { nome: "publico.csv", conteudo: conteudo.publicoCsv },
        {
          nome: "manifesto.json",
          conteudo: Buffer.from(JSON.stringify(conteudo.manifesto, null, 2) + "\n", "utf8"),
        },
        { nome: "instrucoes.md", conteudo: Buffer.from(instrucoesMarkdown(conteudo), "utf8") },
      ];

      conteudo.pecas.forEach((peca, indice) => {
        const base = nomeSeguro(peca.titulo, indice);
        arquivos.push({
          nome: `pecas/${base}.txt`,
          conteudo: Buffer.from(
            `${peca.formato} — ${peca.titulo}\n\n${peca.texto?.trim() ?? ""}\n`,
            "utf8",
          ),
        });
        if (peca.imagem) {
          const extensao = peca.imagem.nomeArquivo.includes(".")
            ? peca.imagem.nomeArquivo.slice(peca.imagem.nomeArquivo.lastIndexOf("."))
            : "";
          arquivos.push({
            nome: `pecas/${base}${extensao}`,
            conteudo: peca.imagem.conteudo,
          });
        }
      });

      // Marcas por último e na ordem recebida (o caso de uso ordena por
      // nome do aliado): o zip precisa sair byte a byte igual para a mesma
      // entrada, que é o que o teste de determinismo prende.
      (conteudo.marcas ?? []).forEach((marca, indice) => {
        arquivos.push({
          nome: nomeDoArquivoDaMarca(marca, indice),
          conteudo: marca.conteudo,
        });
      });

      return {
        nomeArquivo: `kit-${nomeSeguro(conteudo.campanha.nome, 0).slice(3)}-v${conteudo.versao}.zip`,
        conteudo: criarZip(arquivos, conteudo.momento),
      };
    },
  };
}

/**
 * Nomes dos arquivos que o manifesto referencia para uma peça — usados
 * tanto na montagem quanto na construção do manifesto no caso de uso,
 * para os dois nunca divergirem.
 */
export function nomesDosArquivosDaPeca(
  peca: Pick<PecaDoKit, "titulo" | "imagem">,
  indice: number,
): { texto: string; imagem: string | null } {
  const base = nomeSeguro(peca.titulo, indice);
  if (!peca.imagem) {
    return { texto: `pecas/${base}.txt`, imagem: null };
  }
  const extensao = peca.imagem.nomeArquivo.includes(".")
    ? peca.imagem.nomeArquivo.slice(peca.imagem.nomeArquivo.lastIndexOf("."))
    : "";
  return { texto: `pecas/${base}.txt`, imagem: `pecas/${base}${extensao}` };
}

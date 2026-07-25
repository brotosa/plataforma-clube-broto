import { z } from "zod";

/**
 * Schema do conteúdo do dossiê de due diligence pública — espelho fiel do
 * "Schema de saída (JSON estrito)" de
 * docs/especificacao/prompt-dossie-due-diligence.md (v1), que é o template
 * versionado e a fonte da verdade. Alterar o template é alterar produto:
 * mudou lá, muda aqui, com versão registrada nas execuções.
 *
 * A validação é a fronteira entre o provedor e o banco: nada é gravado
 * como dossiê pronto sem passar por aqui — vale tanto para a resposta do
 * provedor automático quanto para o texto colado no provedor manual.
 */

/**
 * String literal que o template manda usar onde não houver dado público.
 * Ausência de dado é estado declarado, nunca número plausível (CLAUDE.md).
 */
export const SEM_INFORMACAO_PUBLICA = "Não foi encontrada informação pública";

/** Graus de confiança atribuídos a cada indicador do perfil (template §2). */
export const GRAUS_CONFIANCA = ["Alto", "Médio", "Baixo"] as const;

/** Importância de cada lacuna da pesquisa (template §8). */
export const IMPORTANCIAS_GAP = ["Alta", "Média", "Baixa"] as const;

/** Quantidade de perguntas que o template pede no roteiro de reunião (§9). */
export const PERGUNTAS_ESPERADAS_NO_ROTEIRO = 15;

const texto = z.string().trim().min(1);
const listaDeTextos = z.array(texto);

const indicadorPerfil = z.object({
  indicador: texto,
  valor: texto,
  fonte: texto,
  confianca: z.enum(GRAUS_CONFIANCA),
});

const produto = z.object({
  nome: texto,
  descricao: texto,
  problema: texto,
  publico: texto,
  preco: texto,
  cobranca: texto,
  integracoes: texto,
  tecnologias: texto,
  diferenciais: texto,
  fontes: listaDeTextos,
});

const impactoProdutor = z.object({
  indicador: texto,
  valor: texto,
  estudo_de_caso: texto,
  fonte: texto,
});

const mercado = z.object({
  clientes: listaDeTextos,
  parceiros: listaDeTextos,
  observacoes: texto,
  fontes: listaDeTextos,
});

const concorrente = z.object({
  empresa: texto,
  comparacao: texto,
  fontes: listaDeTextos,
});

const swot = z.object({
  forcas: listaDeTextos,
  fraquezas: listaDeTextos,
  oportunidades: listaDeTextos,
  ameacas: listaDeTextos,
});

const gap = z.object({
  informacao: texto,
  importancia: z.enum(IMPORTANCIAS_GAP),
  pergunta_sugerida: texto,
});

/**
 * As dez etapas mais as fontes consultadas. Chaves desconhecidas são
 * descartadas (comportamento padrão do Zod) — o provedor pode acrescentar
 * campos sem invalidar o dossiê, mas nada além do schema é persistido.
 */
export const esquemaConteudoDossie = z.object({
  resumo_executivo: texto,
  perfil: z.array(indicadorPerfil),
  produtos: z.array(produto),
  impacto_produtor: z.array(impactoProdutor),
  mercado,
  concorrencia: z.array(concorrente),
  swot,
  gaps: z.array(gap),
  roteiro_reuniao: listaDeTextos,
  fechamento: texto,
  fontes_consultadas: listaDeTextos,
});

export type ConteudoDossie = z.infer<typeof esquemaConteudoDossie>;
export type IndicadorPerfil = z.infer<typeof indicadorPerfil>;
export type ProdutoDossie = z.infer<typeof produto>;
export type ImpactoProdutor = z.infer<typeof impactoProdutor>;
export type Concorrente = z.infer<typeof concorrente>;
export type GapPesquisa = z.infer<typeof gap>;

/** Chave de cada uma das dez etapas, na ordem do template. */
export type SecaoDossie =
  | "resumo_executivo"
  | "perfil"
  | "produtos"
  | "impacto_produtor"
  | "mercado"
  | "concorrencia"
  | "swot"
  | "gaps"
  | "roteiro_reuniao"
  | "fechamento";

/** Rótulos e numeração das dez etapas para a leitura da T11. */
export const SECOES_DOSSIE: ReadonlyArray<{
  chave: SecaoDossie;
  numero: number;
  titulo: string;
}> = [
  { chave: "resumo_executivo", numero: 1, titulo: "Resumo executivo" },
  { chave: "perfil", numero: 2, titulo: "Perfil da empresa" },
  { chave: "produtos", numero: 3, titulo: "Produtos" },
  { chave: "impacto_produtor", numero: 4, titulo: "Impacto para o produtor" },
  { chave: "mercado", numero: 5, titulo: "Mercado" },
  { chave: "concorrencia", numero: 6, titulo: "Concorrência" },
  { chave: "swot", numero: 7, titulo: "SWOT" },
  { chave: "gaps", numero: 8, titulo: "Gaps da pesquisa" },
  { chave: "roteiro_reuniao", numero: 9, titulo: "Roteiro para reunião" },
  { chave: "fechamento", numero: 10, titulo: "Fechamento" },
];

export type ResultadoValidacao =
  | { valido: true; conteudo: ConteudoDossie; avisos: string[] }
  | { valido: false; erros: string[] };

/**
 * Extrai o objeto JSON de um texto. O template manda retornar somente o
 * JSON, mas provedores (e o analista que cola de outra ferramenta) às
 * vezes embrulham em cerca de código ou acrescentam uma linha de conversa:
 * pegamos o primeiro objeto de chaves balanceadas, ignorando chaves dentro
 * de strings. Retorna null quando não há objeto algum.
 */
export function extrairJson(bruto: string): unknown {
  const texto = bruto.trim();
  if (!texto) {
    return null;
  }
  const inicio = texto.indexOf("{");
  if (inicio < 0) {
    return null;
  }
  let profundidade = 0;
  let dentroDeString = false;
  let escapado = false;
  for (let i = inicio; i < texto.length; i += 1) {
    const caractere = texto[i];
    if (dentroDeString) {
      if (escapado) {
        escapado = false;
      } else if (caractere === "\\") {
        escapado = true;
      } else if (caractere === '"') {
        dentroDeString = false;
      }
      continue;
    }
    if (caractere === '"') {
      dentroDeString = true;
    } else if (caractere === "{") {
      profundidade += 1;
    } else if (caractere === "}") {
      profundidade -= 1;
      if (profundidade === 0) {
        try {
          return JSON.parse(texto.slice(inicio, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Caminho legível do campo com erro ("produtos[0].nome"). */
function caminho(partes: ReadonlyArray<string | number>): string {
  return partes.reduce<string>((acumulado, parte) => {
    if (typeof parte === "number") {
      return `${acumulado}[${parte}]`;
    }
    return acumulado ? `${acumulado}.${parte}` : parte;
  }, "");
}

/**
 * Observações que não invalidam o dossiê, mas o revisor precisa ver: o
 * template pede 15 perguntas no roteiro e fontes por afirmação. Nada aqui
 * bloqueia a gravação — a decisão de aceitar é humana (RN19).
 */
function conferirCompletude(conteudo: ConteudoDossie): string[] {
  const avisos: string[] = [];
  if (conteudo.roteiro_reuniao.length !== PERGUNTAS_ESPERADAS_NO_ROTEIRO) {
    avisos.push(
      `O roteiro de reunião veio com ${conteudo.roteiro_reuniao.length} pergunta(s); o template pede ${PERGUNTAS_ESPERADAS_NO_ROTEIRO}.`,
    );
  }
  if (conteudo.fontes_consultadas.length === 0) {
    avisos.push("Nenhuma fonte consultada foi listada — confira a origem das afirmações.");
  }
  const produtosSemFonte = conteudo.produtos.filter((item) => item.fontes.length === 0).length;
  if (produtosSemFonte > 0) {
    avisos.push(`${produtosSemFonte} produto(s) sem fonte citada.`);
  }
  return avisos;
}

/**
 * Valida o conteúdo (objeto já parseado ou texto bruto) contra o schema do
 * template. Erros voltam em português, com o caminho do campo — a T11 os
 * exibe tanto na falha da geração quanto na colagem manual.
 */
export function validarConteudoDossie(bruto: unknown): ResultadoValidacao {
  const candidato = typeof bruto === "string" ? extrairJson(bruto) : bruto;
  if (candidato === null || typeof candidato !== "object" || Array.isArray(candidato)) {
    return {
      valido: false,
      erros: [
        "Conteúdo não é um objeto JSON — cole o JSON do schema do template (docs/especificacao/prompt-dossie-due-diligence.md).",
      ],
    };
  }

  const resultado = esquemaConteudoDossie.safeParse(candidato);
  if (!resultado.success) {
    const erros = resultado.error.issues
      .slice(0, 12)
      .map((problema) => `${caminho(problema.path) || "raiz"}: ${problema.message}`);
    const excedentes = resultado.error.issues.length - erros.length;
    if (excedentes > 0) {
      erros.push(`… e mais ${excedentes} campo(s) fora do schema.`);
    }
    return { valido: false, erros };
  }

  return { valido: true, conteudo: resultado.data, avisos: conferirCompletude(resultado.data) };
}

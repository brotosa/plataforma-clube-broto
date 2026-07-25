import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  montarPrompt,
  type PromptDoDossie,
  type VariaveisDoTemplate,
} from "@/dominio/dossie/template";

/**
 * Leitura do template versionado do dossiê a partir do repositório. O
 * arquivo é a fonte do prompt (ficha §6 e prompt da Onda 2): o código não
 * guarda cópia dele — lê, monta e registra a versão usada em cada
 * execução, para que um dossiê antigo continue explicável quando o
 * template mudar.
 */

export const CAMINHO_DO_TEMPLATE = "docs/especificacao/prompt-dossie-due-diligence.md";

interface TemplateCarregado {
  markdown: string;
  versao: string;
}

let cache: TemplateCarregado | null = null;

/**
 * Versão = "v1@<sha256 curto>": o título do arquivo declara a versão
 * editorial e o hash detecta qualquer alteração de conteúdo, mesmo sem
 * troca de versão declarada.
 */
function calcularVersao(markdown: string): string {
  const hash = createHash("sha256").update(markdown, "utf8").digest("hex").slice(0, 12);
  const declarada = /—\s*Dossiê de Scouting\s*\((v[\w.]+)\)/i.exec(markdown)?.[1];
  return declarada ? `${declarada}@${hash}` : hash;
}

/** Carrega (e memoriza) o template do repositório. */
export function carregarTemplate(): TemplateCarregado {
  if (cache) {
    return cache;
  }
  const caminho = join(process.cwd(), CAMINHO_DO_TEMPLATE);
  const markdown = readFileSync(caminho, "utf8");
  cache = { markdown, versao: calcularVersao(markdown) };
  return cache;
}

/** Só para os testes: esquece o template memorizado. */
export function limparCacheDoTemplate(): void {
  cache = null;
}

export interface PromptComVersao extends PromptDoDossie {
  versaoTemplate: string;
}

/** Monta o prompt do pedido e devolve junto a versão do template usada. */
export function prepararPrompt(variaveis: VariaveisDoTemplate): PromptComVersao {
  const { markdown, versao } = carregarTemplate();
  return { ...montarPrompt(markdown, variaveis), versaoTemplate: versao };
}

/** Versão corrente do template — gravada também nas inserções manuais. */
export function versaoDoTemplate(): string {
  return carregarTemplate().versao;
}

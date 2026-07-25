/**
 * Leitura do template versionado do dossiê
 * (docs/especificacao/prompt-dossie-due-diligence.md) e montagem do prompt
 * enviado ao provedor. O template é a fonte da verdade do que se pede ao
 * modelo: o prompt **nunca** é escrito no código — é recortado do arquivo,
 * com os placeholders substituídos. Alterar o arquivo é alterar produto, e
 * a versão usada em cada execução fica registrada (infra/dossie/template.ts
 * calcula o hash).
 *
 * Funções puras: recebem o markdown já lido, devolvem as partes. A leitura
 * de disco e o hash ficam na infraestrutura.
 */

/** Placeholders do template (§"Uso programático"). */
export interface VariaveisDoTemplate {
  nome_empresa: string;
  site?: string | null;
  contexto_adicional?: string | null;
}

export interface PromptDoDossie {
  sistema: string;
  usuario: string;
}

const TITULO_SISTEMA = "## Prompt de sistema";
const TITULO_USUARIO = "## Prompt de usuário (template)";
const TITULO_SCHEMA = "## Schema de saída (JSON estrito)";

export class ErroDeTemplate extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeTemplate";
  }
}

/** Recorta a seção que começa no título dado até o próximo título de nível 2. */
function recortarSecao(markdown: string, titulo: string): string {
  const inicio = markdown.indexOf(titulo);
  if (inicio < 0) {
    throw new ErroDeTemplate(
      `Template do dossiê sem a seção "${titulo}" — o arquivo docs/especificacao/prompt-dossie-due-diligence.md é a fonte do prompt e precisa mantê-la.`,
    );
  }
  const corpo = markdown.slice(inicio + titulo.length);
  const proximo = corpo.indexOf("\n## ");
  const conteudo = (proximo < 0 ? corpo : corpo.slice(0, proximo)).trim();
  if (!conteudo) {
    throw new ErroDeTemplate(`Seção "${titulo}" do template do dossiê está vazia.`);
  }
  return conteudo;
}

/**
 * Substituição no dialeto do template: blocos condicionais
 * `{{#variavel}}…{{/variavel}}` ficam quando a variável tem valor e somem
 * quando não tem, e `{{variavel}}` vira o valor. Variável obrigatória sem
 * valor é erro — melhor falhar do que mandar prompt com buraco.
 */
export function renderizar(modelo: string, variaveis: VariaveisDoTemplate): string {
  const valores: Record<string, string> = {
    nome_empresa: variaveis.nome_empresa.trim(),
    site: (variaveis.site ?? "").trim(),
    contexto_adicional: (variaveis.contexto_adicional ?? "").trim(),
  };

  if (!valores.nome_empresa) {
    throw new ErroDeTemplate("O dossiê exige o nome da empresa ({{nome_empresa}}).");
  }

  const comCondicionais = modelo.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_todo, chave: string, conteudo: string) => (valores[chave] ? conteudo : ""),
  );

  return comCondicionais
    .replace(/\{\{(\w+)\}\}/g, (todo, chave: string) => valores[chave] ?? todo)
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Monta o par de prompts a partir do markdown do template. O prompt de
 * usuário leva junto o schema de saída do próprio arquivo — o modelo
 * precisa vê-lo para devolver o JSON estrito que a aplicação valida.
 */
export function montarPrompt(
  markdown: string,
  variaveis: VariaveisDoTemplate,
): PromptDoDossie {
  const sistema = recortarSecao(markdown, TITULO_SISTEMA);
  const usuario = renderizar(recortarSecao(markdown, TITULO_USUARIO), variaveis);
  const schema = recortarSecao(markdown, TITULO_SCHEMA);

  return {
    sistema,
    usuario: `${usuario}\n\n${TITULO_SCHEMA.replace("## ", "")}\n\n${schema}`,
  };
}

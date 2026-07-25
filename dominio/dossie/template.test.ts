import { describe, expect, it } from "vitest";
import { ErroDeTemplate, montarPrompt, renderizar } from "./template";

/** Recorte fiel à estrutura do arquivo versionado (títulos e placeholders). */
const TEMPLATE = `# Template de Due Diligence Pública — Dossiê de Scouting (v1)

## Uso programático

Chamada à API Anthropic. Placeholders: \`{{nome_empresa}}\`, \`{{site}}\`.

## Prompt de sistema

Você atuará como um Analista Sênior de Product Discovery.

Regras invioláveis: cite a fonte de cada informação.

## Prompt de usuário (template)

Realize a due diligence pública da empresa: {{nome_empresa}}{{#site}} (site: {{site}}){{/site}}.
{{#contexto_adicional}}Contexto do analista: {{contexto_adicional}}{{/contexto_adicional}}

Produza as dez etapas:

1. **Resumo executivo**

## Schema de saída (JSON estrito)

\`\`\`json
{ "resumo_executivo": "string" }
\`\`\`

Campos sem informação pública recebem a string literal "Não foi encontrada informação pública".
`;

describe("renderizar — dialeto de placeholders do template", () => {
  it("substitui o nome e mantém o bloco do site quando há site", () => {
    const texto = renderizar(
      "Empresa: {{nome_empresa}}{{#site}} (site: {{site}}){{/site}}.",
      { nome_empresa: "Viasat Brasil", site: "https://viasat.com.br" },
    );
    expect(texto).toBe("Empresa: Viasat Brasil (site: https://viasat.com.br).");
  });

  it("remove o bloco condicional quando o site não foi informado", () => {
    const texto = renderizar(
      "Empresa: {{nome_empresa}}{{#site}} (site: {{site}}){{/site}}.",
      { nome_empresa: "Viasat Brasil" },
    );
    expect(texto).toBe("Empresa: Viasat Brasil.");
    expect(texto).not.toContain("site");
  });

  it("remove o bloco quando o valor vem em branco (só espaços)", () => {
    const texto = renderizar("{{#contexto_adicional}}Contexto: {{contexto_adicional}}{{/contexto_adicional}}fim", {
      nome_empresa: "Empresa X",
      contexto_adicional: "   ",
    });
    expect(texto).toBe("fim");
  });

  it("inclui o contexto do analista quando informado", () => {
    const texto = renderizar(
      "{{#contexto_adicional}}Contexto do analista: {{contexto_adicional}}{{/contexto_adicional}}",
      { nome_empresa: "Empresa X", contexto_adicional: "Indicada por cooperativa." },
    );
    expect(texto).toBe("Contexto do analista: Indicada por cooperativa.");
  });

  it("recusa prompt sem nome de empresa em vez de mandar prompt com buraco", () => {
    expect(() => renderizar("{{nome_empresa}}", { nome_empresa: "  " })).toThrow(
      ErroDeTemplate,
    );
  });
});

describe("montarPrompt — recorta as seções do arquivo versionado", () => {
  it("usa o texto do arquivo como prompt de sistema, sem reescrever nada", () => {
    const prompt = montarPrompt(TEMPLATE, { nome_empresa: "Viasat Brasil" });
    expect(prompt.sistema).toContain("Analista Sênior de Product Discovery");
    expect(prompt.sistema).toContain("cite a fonte de cada informação");
    expect(prompt.sistema).not.toContain("## Prompt de usuário");
  });

  it("leva o schema de saída junto do prompt de usuário", () => {
    const prompt = montarPrompt(TEMPLATE, { nome_empresa: "Viasat Brasil" });
    expect(prompt.usuario).toContain("Realize a due diligence pública da empresa: Viasat Brasil");
    expect(prompt.usuario).toContain("Schema de saída (JSON estrito)");
    expect(prompt.usuario).toContain('"resumo_executivo"');
    expect(prompt.usuario).toContain("Não foi encontrada informação pública");
  });

  it("falha com mensagem explícita quando o template perde uma seção", () => {
    const semSistema = TEMPLATE.replace("## Prompt de sistema", "## Outra coisa");
    expect(() => montarPrompt(semSistema, { nome_empresa: "X" })).toThrow(
      /Prompt de sistema/,
    );
  });

  it("falha quando a seção existe mas está vazia", () => {
    const vazio = TEMPLATE.replace(
      "Você atuará como um Analista Sênior de Product Discovery.\n\nRegras invioláveis: cite a fonte de cada informação.",
      "",
    );
    expect(() => montarPrompt(vazio, { nome_empresa: "X" })).toThrow(ErroDeTemplate);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeArquivo, ErroDeConfiguracao } from "@/dominio/erros/falhas";
import { ErroDeLayoutTelemetria } from "@/dominio/integracao/telemetria";
import { ErroDeMarca } from "@/dominio/marca/marca";
import { ErroDeSegmentoInvalido } from "@/dominio/segmentacao/compilador";
import { ErroDeValidacao } from "@/infra/casos-de-uso/contexto";
import { logger } from "@/infra/log/logger";
import { mensagensDeFalha, mensagemGenerica } from "./falha-para-mensagem";

// O mapeador grava o detalhe no log do servidor — é o comportamento sob
// teste. Silenciar durante a suíte evita despejar pilha a cada caso; o que
// prova que o detalhe foi registrado é o log ter sido chamado, não o ruído
// no terminal.
const nivelOriginal = logger.level;
beforeAll(() => {
  logger.level = "silent";
});
afterAll(() => {
  logger.level = nivelOriginal;
});

const OPCOES = {
  operacao: "concluir a ação",
  semPermissao: "Seu papel não tem permissão para esta ação (ficha §2).",
  contexto: "teste",
};

describe("RN55 — erro de causa conhecida chega com a mensagem do domínio", () => {
  it("validação: as mensagens do domínio sobem inteiras", () => {
    const erro = new ErroDeValidacao(["CNPJ inválido: dígito verificador não confere (RN08)."]);
    expect(mensagensDeFalha(erro, OPCOES)).toEqual([
      "CNPJ inválido: dígito verificador não confere (RN08).",
    ]);
  });

  it("segmento inválido: também é lista de mensagens e sobe inteira", () => {
    const erro = new ErroDeSegmentoInvalido(["Operador desconhecido no nó raiz."]);
    expect(mensagensDeFalha(erro, OPCOES)).toEqual(["Operador desconhecido no nó raiz."]);
  });

  it("configuração ausente NOMEIA a variável — o caso que originou a regra", () => {
    // Era exatamente isto que virava "Tente novamente", conselho errado:
    // repetir a ação jamais criaria a variável de ambiente.
    const erro = new ErroDeConfiguracao(
      "CPF_HASH_KEY",
      "a proteção de CPF exige a chave. Configure-a no ambiente (ver .env.example) e repita a operação.",
    );
    const mensagens = mensagensDeFalha(erro, OPCOES);
    expect(mensagens[0]).toContain("CPF_HASH_KEY");
    expect(mensagens[0]).toContain("ausente no ambiente");
    expect(mensagens[0]).not.toContain(mensagemGenerica(OPCOES.operacao));
  });

  it("configuração ausente jamais carrega o VALOR da variável", () => {
    // A garantia é estrutural: o construtor recebe o nome, e não há por
    // onde o valor entrar. Este teste prende a forma.
    const segredo = "s3gr3d0-que-nunca-pode-vazar";
    process.env.CHAVE_DE_TESTE_RN55 = segredo;
    try {
      const erro = new ErroDeConfiguracao("CHAVE_DE_TESTE_RN55", "algo depende dela.");
      expect(mensagensDeFalha(erro, OPCOES).join(" ")).not.toContain(segredo);
    } finally {
      delete process.env.CHAVE_DE_TESTE_RN55;
    }
  });

  it("layout de arquivo, limite e formato sobem com a ação a tomar", () => {
    const layout = new ErroDeLayoutTelemetria("Coluna 'cpf' ausente no arquivo de telemetria.");
    expect(mensagensDeFalha(layout, OPCOES)).toEqual([
      "Coluna 'cpf' ausente no arquivo de telemetria.",
    ]);

    const limite = new ErroDeArquivo(
      "A lista tem 6000 linhas — o máximo por importação é 5000. Divida o arquivo e importe em partes.",
    );
    expect(mensagensDeFalha(limite, OPCOES)[0]).toContain("Divida o arquivo");
  });

  it("recusa de marca sobe nomeando o motivo (RN54 + RN55)", () => {
    const erro = new ErroDeMarca("A marca tem 320 KB e o limite é 200 KB.");
    expect(mensagensDeFalha(erro, OPCOES)).toEqual(["A marca tem 320 KB e o limite é 200 KB."]);
  });

  it("permissão é a exceção: a tela escreve a sua, sem citar papel nem ação internos", () => {
    const erro = new ErroDeAutorizacao("LEITURA", "CRIAR_EDITAR");
    const mensagens = mensagensDeFalha(erro, OPCOES);
    expect(mensagens).toEqual([OPCOES.semPermissao]);
    expect(mensagens.join(" ")).not.toContain("CRIAR_EDITAR");
    expect(mensagens.join(" ")).not.toContain("LEITURA");
  });
});

describe("RN55 — erro inesperado chega genérico e não vaza detalhe", () => {
  it("nunca sugere repetir a ação", () => {
    const mensagens = mensagensDeFalha(new Error("qualquer coisa"), OPCOES);
    expect(mensagens.join(" ")).not.toMatch(/tente novamente/i);
    expect(mensagens).toEqual([mensagemGenerica("concluir a ação")]);
  });

  it("não vaza a mensagem original, nem SQL, nem nome de tabela", () => {
    const erroDeBanco = new Error(
      'Invalid `prisma.empresa.findMany()` invocation: SELECT "public"."empresas"."cnpj" FROM "public"."empresas" WHERE id = $1',
    );
    erroDeBanco.name = "PrismaClientKnownRequestError";
    const texto = mensagensDeFalha(erroDeBanco, OPCOES).join(" ");
    expect(texto).not.toContain("SELECT");
    expect(texto).not.toContain("empresas");
    expect(texto).not.toContain("prisma");
  });

  it("não vaza rastro de pilha nem caminho de arquivo", () => {
    const erro = new Error("ENOENT: no such file or directory, open '/var/app/segredo.pem'");
    const texto = mensagensDeFalha(erro, OPCOES).join(" ");
    expect(texto).not.toContain("/var/app");
    expect(texto).not.toContain(".pem");
    expect(texto).not.toContain("ENOENT");
    expect(texto).not.toMatch(/\bat \w+ \(/);
  });

  it("não vaza valor de variável de ambiente carregado numa exceção crua", () => {
    const erro = new Error("falha ao usar a chave abc123-valor-secreto");
    expect(mensagensDeFalha(erro, OPCOES).join(" ")).not.toContain("abc123-valor-secreto");
  });

  it("o que não é Error — string, objeto, null — também vira genérico", () => {
    for (const solto of ["explodiu", { codigo: 42 }, null, undefined]) {
      expect(mensagensDeFalha(solto, OPCOES)).toEqual([mensagemGenerica("concluir a ação")]);
    }
  });

  it("a mensagem genérica diz onde o detalhe está e o que informar", () => {
    const texto = mensagemGenerica("gerar o pacote");
    expect(texto).toContain("gerar o pacote");
    expect(texto).toContain("log do servidor");
    expect(texto).toContain("TI");
  });
});

// ---------------------------------------------------------------------
// Cerca de arquitetura — a regra vale para TODAS as server actions
// ---------------------------------------------------------------------

function arquivosDeAcoes(raiz: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(raiz)) {
    const caminho = path.join(raiz, entrada);
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...arquivosDeAcoes(caminho));
    } else if (/^acoes(-[a-z0-9]+)?\.ts$/.test(entrada)) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

describe("RN55 — a regra é da plataforma inteira, não de uma tela", () => {
  const raiz = path.join(process.cwd(), "app");
  const arquivos = arquivosDeAcoes(raiz);

  it("existem server actions para conferir", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(15);
  });

  it('nenhuma server action diz "Tente novamente"', () => {
    const reincidentes = arquivos.filter((arquivo) =>
      /tente novamente/i.test(readFileSync(arquivo, "utf8")),
    );
    expect(reincidentes).toEqual([]);
  });

  it("toda server action delega ao mapeador único, em vez de decidir sozinha", () => {
    // Sem esta cerca, a próxima tela nasce com o `catch` genérico de novo e
    // a regra volta a valer só onde alguém lembrou.
    const semDelegar = arquivos.filter((arquivo) => {
      const fonte = readFileSync(arquivo, "utf8");
      const trata = /catch \(erro\)/.test(fonte);
      return trata && !fonte.includes("mensagensDeFalha");
    });
    expect(semDelegar.map((a) => path.relative(process.cwd(), a))).toEqual([]);
  });
});

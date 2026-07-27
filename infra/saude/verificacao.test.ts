import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/infra/log/logger";
import { responderPronto, responderVivo } from "./verificacao";

/**
 * RN61 — os dois níveis da rota de saúde, e o que ela **não** pode dizer.
 *
 * Unidade de verdade: a sonda é injetada, então o arquivo cobre o caso
 * "banco indisponível" sem precisar derrubar um PostgreSQL. Isso importa
 * porque o primeiro job do CI roda sem banco de propósito — se o caso mais
 * crítico dos três dependesse de serviço, ele só seria exercitado no job
 * lento, que é o oposto de onde uma regressão deve aparecer.
 *
 * O caminho real (Prisma alcançando um PostgreSQL de verdade, dentro do
 * contêiner construído) é coberto pelo teste de fumaça da esteira.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function conteudo(caminhoRelativo: string): string {
  return readFileSync(join(RAIZ, caminhoRelativo), "utf8");
}

/**
 * Uma falha de banco realista — e por isso perigosa.
 *
 * A mensagem do driver carrega credencial, host, porta e nome do banco. É
 * exatamente este texto que não pode atravessar para o corpo de um endereço
 * público, e é com ele que o teste de vazamento tem de ser feito: um
 * `new Error("falhou")` genérico passaria em qualquer implementação, inclusive
 * numa que ecoasse a mensagem inteira.
 */
const FALHA_REALISTA = new Error(
  "Can't reach database server at `banco-producao.interno.broto:5432`. " +
    "URL: postgresql://broto_app:senha-secreta@banco-producao.interno.broto:5432/clube_broto?schema=public",
);

/** Fragmentos que jamais podem aparecer no corpo, por origem da falha acima. */
const VAZAMENTOS = [
  "banco-producao.interno.broto",
  "5432",
  "clube_broto",
  "senha-secreta",
  "broto_app",
  "postgresql://",
  "schema=public",
];

afterEach(() => {
  vi.restoreAllMocks();
});

/** Silencia o log e, de quebra, permite provar que o detalhe foi PARA ele. */
function espionarLog() {
  return vi.spyOn(logger, "error").mockImplementation(() => undefined);
}

describe("RN61 — nível vivo", () => {
  it("responde 200 sem tocar o banco", async () => {
    // A sonda nem é passada: se `responderVivo` consultasse o banco, este
    // teste precisaria de um, e é justamente isso que ele prova que não.
    const resposta = responderVivo();
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ estado: "vivo" });
  });

  it("não é cacheável — verificação respondida de cache é verificação de nada", () => {
    expect(responderVivo().headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("RN61 — nível pronto", () => {
  it("responde 200 quando a sonda alcança o banco", async () => {
    const resposta = await responderPronto(async () => [{ "?column?": 1 }]);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ estado: "pronto" });
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
  });

  it("responde 503 quando o banco recusa — não 500 nem 200", async () => {
    const log = espionarLog();
    const resposta = await responderPronto(async () => {
      throw FALHA_REALISTA;
    });
    // 503 diz "estou de pé, não me mande tráfego agora", que é o estado.
    // 500 diria falha da aplicação; 200 mentiria e manteria a instância
    // recebendo requisição que ela não consegue atender.
    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toEqual({ estado: "indisponivel" });
    expect(log).toHaveBeenCalledOnce();
  });

  it("responde 503 quando o banco não responde dentro do teto", async () => {
    const log = espionarLog();
    // Sonda que nunca resolve: é o caso que trava a instância sem o teto.
    const resposta = await responderPronto(() => new Promise(() => {}), 20);
    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toEqual({ estado: "indisponivel" });
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("RN61 — a resposta não revela nada", () => {
  it("o corpo da falha não carrega host, porta, credencial nem nome do banco", async () => {
    espionarLog();
    const resposta = await responderPronto(async () => {
      throw FALHA_REALISTA;
    });
    const corpo = await resposta.text();
    const vazados = VAZAMENTOS.filter((fragmento) => corpo.includes(fragmento));
    expect(vazados, `o corpo público vazou: ${vazados.join(", ")} — em ${corpo}`).toEqual([]);
  });

  it("o detalhe completo vai para o log do servidor, e só para lá", async () => {
    const log = espionarLog();
    await responderPronto(async () => {
      throw FALHA_REALISTA;
    });
    const registrado = JSON.stringify(log.mock.calls[0]?.[0] ?? {});
    // A contrapartida da regra: calar no corpo só é aceitável porque a TI
    // tem onde olhar. Se o detalhe sumir dos dois lados, a rota vira caixa
    // preta e a indisponibilidade fica sem diagnóstico.
    expect(registrado).toContain("banco-producao.interno.broto");
  });

  it("todo corpo tem exatamente a chave `estado` — nada de versão ou contagem", async () => {
    espionarLog();
    const corpos = [
      await responderVivo().json(),
      await (await responderPronto(async () => 1)).json(),
      await (
        await responderPronto(async () => {
          throw FALHA_REALISTA;
        })
      ).json(),
    ];
    for (const corpo of corpos) {
      expect(Object.keys(corpo as object)).toEqual(["estado"]);
    }
  });
});

describe("RN61 — cerca: a rota é pública e não escreve na trilha", () => {
  it("o middleware não protege /api/saude", () => {
    // Com o gate, a verificação responderia 307 para /entrar — e balanceador
    // que conta redirecionamento como sucesso veria plataforma saudável com
    // o banco fora. É o defeito silencioso que esta cerca existe para pegar.
    const matcher = conteudo("middleware.ts");
    expect(matcher).toMatch(/\(\?![^)]*\bapi\/saude\b/);
  });

  it("nem as rotas nem a verificação gravam auditoria ou exigem sessão", () => {
    const arquivos = [
      "app/api/saude/route.ts",
      "app/api/saude/pronto/route.ts",
      "infra/saude/verificacao.ts",
    ];
    /**
     * Import e chamada, nunca a palavra solta: a primeira versão desta
     * cerca procurava "auditoria" no texto e acusou o próprio comentário
     * que explica por que a rota não audita. Cerca que pega demais vira
     * ruído que a equipe aprende a ignorar.
     */
    const ESCRITA_PROIBIDA = /from ["']@\/infra\/(auditoria|auth)|gravarEvento\s*\(/;
    const violacoes = arquivos.filter((arquivo) => ESCRITA_PROIBIDA.test(conteudo(arquivo)));
    expect(
      violacoes,
      `a rota de saúde é chamada de segundos em segundos e a trilha da RN49 ` +
        `não se apaga: ${violacoes.join(", ")}`,
    ).toEqual([]);
  });

  it("as duas rotas são dinâmicas — senão o build pré-renderiza a de prontidão", () => {
    // Sem `force-dynamic`, o Next tenta gerar a rota de prontidão durante o
    // build, quando não há banco: o `docker build` quebraria por causa da
    // rota que existe para dizer se o banco está de pé.
    for (const arquivo of ["app/api/saude/route.ts", "app/api/saude/pronto/route.ts"]) {
      expect(conteudo(arquivo), arquivo).toMatch(/export const dynamic = "force-dynamic"/);
    }
  });
});

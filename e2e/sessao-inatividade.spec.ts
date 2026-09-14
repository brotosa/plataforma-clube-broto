import { expect, test } from "@playwright/test";
import { decode, encode } from "next-auth/jwt";
import { entrar, resolverDoArquivoEnv } from "./ajudantes";

/**
 * E2E da expiração de sessão por inatividade — a prova que faltava.
 *
 * O domínio já testava a decisão isoladamente, mas nada provava que o
 * SERVIDOR de verdade derruba a sessão: o callback `jwt` só roda dentro do
 * Auth.js, e esperar os 30 minutos da política num teste é inviável.
 *
 * A saída é ler e forjar o próprio cookie de sessão. O token é um JWE assinado
 * com o AUTH_SECRET, e `next-auth/jwt` expõe `decode`/`encode` com o mesmo
 * segredo e o nome do cookie como sal — então dá para inspecionar a marca de
 * atividade e para fabricar uma sessão "parada há dias" sem tocar o relógio.
 */

resolverDoArquivoEnv(["AUTH_SECRET"]);

const ADMIN = "administrador@dev.clubebroto.local";
/** Nome do cookie do Auth.js em http (sem o prefixo __Secure- do https). */
const COOKIE = "authjs.session-token";

function segredo(): string {
  const valor = process.env.AUTH_SECRET;
  if (!valor) {
    throw new Error("[e2e] AUTH_SECRET ausente — necessário para ler/forjar o cookie de sessão.");
  }
  return valor;
}

/** Lê o cookie de sessão e devolve o conteúdo decifrado do token. */
async function lerToken(contexto: {
  cookies: () => Promise<Array<{ name: string; value: string }>>;
}) {
  const cookies = await contexto.cookies();
  const bruto = cookies.find((c) => c.name === COOKIE);
  expect(bruto, `cookie ${COOKIE} deveria existir após o login`).toBeDefined();
  return decode({ token: bruto!.value, secret: segredo(), salt: COOKIE });
}

/**
 * O heartbeat é ESTRUTURAL, não enfeite — e este teste é o que prova.
 *
 * Server Component não escreve cookie no Next.js: numa navegação o callback
 * `jwt` atualiza a marca em memória e o cookie fica com o valor antigo. Quem
 * grava a marca nova é a server action do heartbeat (`unstable_update`), que
 * pode emitir Set-Cookie. Sem ela a janela contaria desde o login, e quem
 * estivesse trabalhando cairia no meio do expediente.
 *
 * O preço de provar isso é esperar um ciclo do heartbeat (60s) — caro, mas é
 * a diferença entre supor que o mecanismo funciona e saber.
 */
test("o heartbeat persiste a marca de atividade no cookie", async ({ page }) => {
  test.setTimeout(150_000);
  await entrar(page, ADMIN);

  const primeiro = await lerToken(page.context());
  expect(typeof primeiro?.ultimaAtividade).toBe("number");

  // Atividade real: o heartbeat só dispara se houver. Um clique basta.
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.up();

  // Espera ATIVA, não `waitForTimeout` cego: o pulso é de 60s, mas cravar o
  // instante deixa o teste instável (já aconteceu). Consultando o cookie de
  // tempos em tempos, o teste termina assim que a marca anda — normalmente
  // perto dos 60s — e só falha se não andar dentro da janela inteira.
  await expect
    .poll(
      async () => Number((await lerToken(page.context()))?.ultimaAtividade ?? 0),
      {
        message: "o heartbeat deveria gravar uma marca mais recente no cookie",
        timeout: 100_000,
        intervals: [5_000],
      },
    )
    .toBeGreaterThan(Number(primeiro?.ultimaAtividade));
});

test("sessão parada além do tempo configurado é derrubada pelo servidor", async ({ page }) => {
  await entrar(page, ADMIN);

  const atual = await lerToken(page.context());
  expect(atual).not.toBeNull();

  // Forja a MESMA sessão, só que com a última atividade há dias — acima de
  // qualquer política (o teto é 480 min). Nada mais muda: mesma pessoa, mesma
  // época; o único motivo possível de queda é a inatividade.
  const paradoHaDias = Date.now() - 10 * 24 * 60 * 60_000;
  const forjado = await encode({
    token: { ...atual, ultimaAtividade: paradoHaDias },
    secret: segredo(),
    salt: COOKIE,
    maxAge: 30 * 24 * 60 * 60,
  });

  await page.context().clearCookies();
  await page.context().addCookies([
    { name: COOKIE, value: forjado, domain: "localhost", path: "/", httpOnly: true },
  ]);

  // Rota protegida: o servidor confere, encontra o intervalo estourado e
  // manda para o login em vez de renderizar a plataforma.
  await page.goto("/aliados");
  await page.waitForURL(/\/entrar/);
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("sessão com atividade recente NÃO é derrubada — a cerca não é um falso positivo", async ({
  page,
}) => {
  await entrar(page, ADMIN);
  const atual = await lerToken(page.context());

  // Mesmo forjamento, só que parada há 1 minuto: deve seguir valendo.
  const forjado = await encode({
    token: { ...atual, ultimaAtividade: Date.now() - 60_000 },
    secret: segredo(),
    salt: COOKIE,
    maxAge: 30 * 24 * 60 * 60,
  });

  await page.context().clearCookies();
  await page.context().addCookies([
    { name: COOKIE, value: forjado, domain: "localhost", path: "/", httpOnly: true },
  ]);

  await page.goto("/aliados");
  await expect(page).toHaveURL(/\/aliados/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

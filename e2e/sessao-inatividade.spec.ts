import { expect, test, type Page } from "@playwright/test";
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

  /*
   * Atividade real, e num alvo INERTE: o heartbeat só dispara se houver.
   *
   * Era um clique na coordenada cega (200, 200), que cai sobre a lateral e
   * às vezes acerta um link. Quando acertava, a navegação remontava a
   * sentinela e zerava a marca de atividade pendente — o pulso seguinte não
   * tinha o que enviar, o cookie não andava, e o teste falhava por um motivo
   * que nada tem a ver com o que ele afirma. Medido no mesmo commit: uma
   * falha e uma aprovação em duas execuções seguidas.
   *
   * O título da página é `pointerdown` como qualquer outro e não leva a
   * lugar nenhum.
   */
  await page.getByRole("heading", { level: 1, name: "O Clube hoje" }).click();

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

/**
 * Espera a sentinela estar VIVA, não apenas presente.
 *
 * O contador vem no HTML do servidor: `toHaveCount(1)` passa antes de o
 * JavaScript assumir a página, e nesse intervalo não há ouvinte de
 * `visibilitychange` nenhum — o evento é disparado no vazio e o teste falha
 * por corrida, não por defeito. Prova de vida é o texto ANDAR, que só o tique
 * de 1 s do cliente faz.
 */
async function esperarSentinelaViva(pagina: Page) {
  const contador = pagina.locator(".sessao-contador");
  await expect(contador).toHaveCount(1);
  const inicial = await contador.textContent();
  await expect
    .poll(async () => contador.textContent(), {
      message: "a sentinela deveria estar hidratada (o contador anda a cada segundo)",
      timeout: 15_000,
      intervals: [250],
    })
    .not.toBe(inicial);
}

/**
 * A ABA ESQUECIDA — o relato de produção, reproduzido.
 *
 * "Deixo a aba aberta, volto horas ou dias depois e continuo logado."
 *
 * O mecanismo: navegador congela e descarta aba em segundo plano, e **timer
 * de aba congelada não roda**. O tique de 1 s que deveria perceber o
 * vencimento simplesmente não acontece enquanto ninguém olha. Ao voltar,
 * `visibilitychange` dispara ANTES do próximo tique — e a versão anterior da
 * sentinela tratava isso como atividade, reiniciando a janela para "agora +
 * 30 min". O tempo em que não houve ninguém era perdoado, e a sessão
 * continuava viva sem que o servidor fosse consultado.
 *
 * **Como se simula congelamento**, que é a parte difícil: `page.clock` com
 * `setFixedTime` adianta o `Date.now()` do navegador **sem executar os
 * timers pendentes** — que é exatamente o que o congelamento faz. Adiantar o
 * relógio com `fastForward` seria o oposto: rodaria o tique 2.400 vezes e o
 * componente perceberia o vencimento pelo caminho que nesta situação não
 * existe.
 *
 * O teste também não navega nem clica, de propósito: qualquer navegação já
 * derrubaria a sessão pelo servidor, e é por isso que o defeito passou
 * despercebido — quem navega não vê, quem só volta para a aba vê.
 */
test("voltar a uma aba congelada NÃO rejuvenesce a sessão", async ({ page }) => {
  await page.clock.install();
  await entrar(page, ADMIN);
  await expect(page.getByRole("heading", { level: 1, name: "O Clube hoje" })).toBeVisible();
  await esperarSentinelaViva(page);

  /*
   * A aba congela por 12 horas. `setFixedTime` adianta o `Date.now()` do
   * navegador **sem** executar os temporizadores que teriam disparado no
   * caminho — que é a definição de aba congelada.
   *
   * `pauseAt` + `resume` foi tentado e descartado: ao retomar, o tique
   * recuperado percebia o vencimento sozinho, e o teste passava COM e SEM a
   * correção — deixava de discriminar, que é o pior defeito que um teste
   * pode ter. Aqui o `visibilitychange` chega antes de qualquer tique, que é
   * exatamente a corrida que a correção existe para resolver.
   */
  await page.clock.setFixedTime(new Date(Date.now() + 12 * 60 * 60_000));

  // A pessoa volta para a aba. Nenhuma navegação, nenhum clique.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  /*
   * `toHaveURL` e não `waitForURL`: a saída é um redirecionamento de server
   * action, que o Next executa como navegação SOFT — não há evento `load`
   * novo, e o `waitForURL` esperaria um sinal que não vem enquanto a URL já
   * mudou há segundos.
   */
  await expect(page).toHaveURL(/\/entrar\?expirada=1/, { timeout: 15_000 });
  await expect(page.getByText(/Sua sessão expirou por inatividade/)).toBeVisible();
});

/**
 * O contraponto, sem o qual o teste acima seria satisfeito por um componente
 * que simplesmente desloga a cada troca de aba: com a ausência CURTA, voltar
 * à aba mantém a pessoa trabalhando.
 */
test("voltar a uma aba recente mantém a sessão — a correção não é um facão", async ({ page }) => {
  await page.clock.install();
  await entrar(page, ADMIN);
  await expect(page.getByRole("heading", { level: 1, name: "O Clube hoje" })).toBeVisible();
  await esperarSentinelaViva(page);

  // Dois minutos de ausência, bem dentro dos 30 da política.
  await page.clock.setFixedTime(new Date(Date.now() + 2 * 60_000));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  await page.waitForTimeout(3_000);
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "O Clube hoje" })).toBeVisible();
});

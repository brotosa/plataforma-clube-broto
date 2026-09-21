import { expect, test } from "@playwright/test";
import { entrar, prisma, runId, SENHA, semViolacoesAxe } from "./ajudantes";

/**
 * E2E das Configurações (PR A — item na lateral + política de senha).
 *
 * Cobre o que a interface promete: o item "Configurações" aparece na lateral
 * abaixo de "Auditoria" só para quem tem CONFIGURAR_PORTAL (o Administrador);
 * o Gestor não o vê e é redirecionado se tentar a rota direto; o Administrador
 * edita a política, salva (auditado no serviço) e a tela confirma. Axe-core
 * limpo na tela.
 *
 * A tela mexe num singleton GLOBAL (`configuracao_portal`): cada caso restaura
 * o padrão (apaga a linha) para não vazar política apertada para os demais
 * specs, que trocam senha no seu próprio fluxo.
 */

const ADMIN = "administrador@dev.clubebroto.local";
const GESTOR = "gestor@dev.clubebroto.local";

const SUFIXO_E2E = "@cfg-e2e.local";

async function restaurarPadrao() {
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: "portal" } });
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: SUFIXO_E2E } },
    select: { id: true },
  });
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
}

/** Usuário LEITURA descartável com a senha de dev (copia o hash do seed). */
async function semearUsuario(sufixo: string) {
  const modelo = await prisma.usuario.findUniqueOrThrow({
    where: { email: "leitura@dev.clubebroto.local" },
    select: { senhaHash: true },
  });
  const email = `bloqueio-${sufixo}${SUFIXO_E2E}`;
  return prisma.usuario.create({
    data: {
      nome: `Bloqueio ${sufixo}`,
      email,
      senhaHash: modelo.senhaHash,
      papel: "LEITURA",
      ativo: true,
      trocaSenhaObrigatoria: false,
    },
  });
}

test.beforeEach(restaurarPadrao);
test.afterAll(restaurarPadrao);

test("Administrador vê 'Configurações' na lateral, abaixo de 'Auditoria'", async ({ page }) => {
  await entrar(page, ADMIN);
  const nav = page.getByRole("navigation", { name: "Módulos" });
  const auditoria = nav.getByRole("link", { name: "Auditoria" });
  const configuracoes = nav.getByRole("link", { name: "Configurações" });
  await expect(auditoria).toBeVisible();
  await expect(configuracoes).toBeVisible();

  // "Configurações" é o ÚLTIMO item — vem depois de "Auditoria".
  const auditoriaTop = await auditoria.boundingBox();
  const configTop = await configuracoes.boundingBox();
  expect(configTop!.y).toBeGreaterThan(auditoriaTop!.y);
});

test("Administrador abre /configuracoes, edita e salva a política — axe limpo", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Configurações" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Política de senha" })).toBeVisible();
  await semViolacoesAxe(page);

  // Aperta a política: comprimento 12 e exige maiúscula.
  const comprimento = page.getByLabel("Comprimento mínimo");
  await comprimento.fill("12");
  await page.getByLabel("Exigir letra maiúscula").check();

  await page.getByRole("button", { name: "Salvar política" }).click();
  await expect(page.getByText("Política de senha salva")).toBeVisible();

  // Persistiu: recarregar a tela traz os valores salvos.
  await page.reload();
  await expect(page.getByLabel("Comprimento mínimo")).toHaveValue("12");
  await expect(page.getByLabel("Exigir letra maiúscula")).toBeChecked();
});

test("contador de sessão aparece ao lado do sino e conta em mm:ss", async ({ page }) => {
  await entrar(page, ADMIN);
  const contador = page.locator(".sessao-contador");
  await expect(contador).toBeVisible();
  await expect(contador).toHaveAttribute("role", "timer");
  // Mostra mm:ss (padrão 30 min → começa perto de 29:xx/30:00).
  await expect(contador).toHaveText(/\d\d:\d\d/);
  // Fica ao lado do sino de pendências, à esquerda dele no cabeçalho.
  const sino = page.getByRole("button", { name: /abrir o painel/i }).first();
  await expect(sino).toBeVisible();
  const cx = await contador.boundingBox();
  const sx = await sino.boundingBox();
  expect(cx!.x).toBeLessThan(sx!.x);
});

test("Administrador ajusta o tempo de sessão e salva", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes?aba=sessao");
  await expect(page.getByRole("heading", { name: "Tempo de sessão" })).toBeVisible();

  const campo = page.getByLabel("Tempo de sessão (minutos)");
  await campo.fill("20");
  await page.getByRole("button", { name: "Salvar tempo de sessão" }).click();
  await expect(page.getByText("Tempo de sessão salvo")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Tempo de sessão (minutos)")).toHaveValue("20");
});

/**
 * O histórico sob cada formulário (pós-homologação).
 *
 * A T35 mostrava o estado vigente e mais nada: quem abria via que a sessão cai
 * em 30 minutos e não via se isso era o padrão desde a implantação ou algo que
 * alguém apertou ontem. Numa tela de segurança essa é a pergunta que mais se
 * faz depois de um incidente, e a única resposta era abrir a Auditoria e ler
 * evento a evento.
 *
 * O dado já existia desde a F23; faltava a leitura.
 */
test("o histórico aparece sob o formulário depois de uma alteração", async ({ page }) => {
  await restaurarPadrao();
  await entrar(page, ADMIN);
  await page.goto("/configuracoes?aba=sessao");

  // Antes de qualquer alteração: a frase é a da ausência, e ela é
  // informativa — "sem alteração" não é o mesmo que "sem histórico".
  await expect(page.getByText("sem alteração desde a implantação").first()).toBeVisible();

  await page.getByLabel("Tempo de sessão (minutos)").fill("45");
  await page.getByRole("button", { name: "Salvar tempo de sessão" }).click();
  await expect(page.getByText("Tempo de sessão salvo")).toBeVisible();
  await page.reload();

  // Agora diz o quê, de quanto para quanto, por quem e quando.
  const legenda = page.getByText(/Inatividade: .* → 45 min/);
  await expect(legenda).toBeVisible();
  await expect(legenda).toContainText("Administrador");

  await restaurarPadrao();
});

/**
 * O vocabulário do histórico é o da faixa de panorama.
 *
 * Seria absurdo a faixa escrever "Desligado" no alto da tela e a legenda
 * escrever "0" três centímetros abaixo, falando do mesmo número. A regra da
 * ficha v0.3 vale para a tela inteira, não só para a faixa.
 */
test("proteção desligada aparece como palavra também no histórico", async ({ page }) => {
  await restaurarPadrao();
  await entrar(page, ADMIN);
  await page.goto("/configuracoes?aba=bloqueios");

  // O bloqueio por origem nasce desligado; ligar e desligar deixa o rastro.
  await page.getByLabel("Falhas por endereço antes de bloquear").fill("10");
  await page.getByRole("button", { name: "Salvar bloqueio por origem" }).click();
  await expect(page.getByText("Bloqueio por origem salvo")).toBeVisible();

  await page.getByLabel("Falhas por endereço antes de bloquear").fill("0");
  await page.getByRole("button", { name: "Salvar bloqueio por origem" }).click();
  await expect(page.getByText("Bloqueio por origem salvo")).toBeVisible();
  await page.reload();

  await expect(page.getByText(/→ Desligado/).first()).toBeVisible();
  await restaurarPadrao();
});

test("Administrador ajusta o bloqueio por login e vê a lista de bloqueados vazia", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes?aba=bloqueios");
  await expect(page.getByRole("heading", { name: "Bloqueio por tentativas de login" })).toBeVisible();
  await expect(page.getByText("Nenhuma conta bloqueada no momento.")).toBeVisible();

  await page.getByLabel("Tentativas antes de bloquear").fill("4");
  await page.getByLabel("Tempo de bloqueio (minutos)").fill("20");
  // `exact` é necessário desde que existe "Salvar bloqueio por origem": a
  // correspondência por nome é por substring e casaria com os dois botões.
  await page.getByRole("button", { name: "Salvar bloqueio", exact: true }).click();
  await expect(page.getByText("Bloqueio por login salvo")).toBeVisible();
});

test("Administrador ajusta o bloqueio por origem e vê a lista de endereços vazia", async ({
  page,
}) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes?aba=bloqueios");
  await expect(page.getByRole("heading", { name: "Bloqueio por origem de rede" })).toBeVisible();
  await expect(page.getByText("Nenhum endereço bloqueado no momento.")).toBeVisible();
  // Nasce desligado: o campo vem em 0 e a prévia diz isso.
  await expect(page.getByLabel("Falhas por endereço antes de bloquear")).toHaveValue("0");
  await expect(page.getByText(/bloqueio por origem está desligado/i)).toBeVisible();

  await page.getByLabel("Falhas por endereço antes de bloquear").fill("10");
  await page.getByRole("button", { name: "Salvar bloqueio por origem" }).click();
  await expect(page.getByText("Bloqueio por origem salvo")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Falhas por endereço antes de bloquear")).toHaveValue("10");
});

test("bloqueio por tentativas: erra a senha, é barrado e o Administrador desbloqueia", async ({
  browser,
}) => {
  const marca = runId();
  const alvo = await semearUsuario(`${marca}`);
  // Política curta para o teste: bloqueia em 3 falhas.
  await prisma.configuracaoPortal.upsert({
    where: { id: "portal" },
    update: { loginMaxTentativas: 3 },
    create: { id: "portal", loginMaxTentativas: 3 },
  });

  // A vítima erra a senha 3 vezes e passa a ver o aviso de bloqueio.
  const ctx = await browser.newContext();
  try {
    const pagina = await ctx.newPage();
    for (let i = 1; i <= 3; i += 1) {
      await pagina.goto("/entrar");
      await pagina.getByLabel("E-mail").fill(alvo.email);
      await pagina.getByLabel("Senha").fill("senha-errada");
      await pagina.getByRole("button", { name: "Entrar" }).click();
      await pagina.waitForURL(/\/entrar\?erro=/);
    }
    await expect(pagina.getByText(/Acesso bloqueado por tentativas/)).toBeVisible();

    // Mesmo com a senha CERTA, segue barrada enquanto bloqueada.
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(alvo.email);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    await pagina.waitForURL(/\/entrar\?erro=bloqueado/);

    // O Administrador desbloqueia pela tela de Configurações.
    const adminCtx = await browser.newContext();
    try {
      const paginaAdmin = await adminCtx.newPage();
      await entrar(paginaAdmin, ADMIN);
      await paginaAdmin.goto("/configuracoes?aba=bloqueios");
      const linha = paginaAdmin.getByRole("row", { name: new RegExp(alvo.email) });
      await expect(linha).toBeVisible();
      await linha.getByRole("button", { name: "Desbloquear" }).click();
      await expect(paginaAdmin.getByText(new RegExp(alvo.email))).toHaveCount(0);
    } finally {
      await adminCtx.close();
    }

    // Agora a vítima entra normalmente.
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(alvo.email);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    await pagina.waitForURL((url) => new URL(url).pathname === "/");
  } finally {
    await ctx.close();
  }
});

test("as três abas navegam e trocam o conteúdo — axe limpo em cada uma", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes");

  const abas = page.getByRole("navigation", { name: "Seções das configurações" });

  // Abre em "Senha": é a aba padrão de quem chega sem `?aba=`.
  await expect(page.getByRole("heading", { name: "Política de senha" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tempo de sessão" })).toHaveCount(0);
  await semViolacoesAxe(page);

  await abas.getByRole("link", { name: "Sessão" }).click();
  await page.waitForURL(/\?aba=sessao/);
  await expect(page.getByRole("heading", { name: "Tempo de sessão" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Política de senha" })).toHaveCount(0);
  await semViolacoesAxe(page);

  await abas.getByRole("link", { name: "Bloqueios" }).click();
  await page.waitForURL(/\?aba=bloqueios/);
  await expect(page.getByRole("heading", { name: "Bloqueio por tentativas de login" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bloqueio por origem de rede" })).toBeVisible();
  await semViolacoesAxe(page);
});

/**
 * A razão de ser da faixa: abas ESCONDEM. Sem ela, quem administra o portal
 * pode nunca abrir "Bloqueios" e nunca descobrir que o bloqueio por origem
 * existe — desligado. A faixa fica fora do sistema de abas e cobre as quatro
 * proteções em qualquer uma delas. Se alguém mover a faixa para dentro de uma
 * aba, este teste é que reprova.
 */
test("a faixa de panorama mostra as cinco proteções em TODAS as abas", async ({ page }) => {
  await entrar(page, ADMIN);
  const faixa = page.getByRole("group", { name: "Panorama das configurações de segurança" });

  for (const aba of ["senha", "sessao", "bloqueios"]) {
    await page.goto(`/configuracoes?aba=${aba}`);
    await expect(faixa).toBeVisible();
    await expect(faixa.getByText("Senha", { exact: true })).toBeVisible();
    await expect(faixa.getByText("Sessão", { exact: true })).toBeVisible();
    await expect(faixa.getByText("Bloqueio por login", { exact: true })).toBeVisible();
    await expect(faixa.getByText("Bloqueio por origem", { exact: true })).toBeVisible();
    // A quinta célula (fila de acabamento da Onda 15). Ela está na PRIMEIRA
    // aba, mas na faixa pelo mesmo motivo das outras: é a única proteção da
    // tela que pode deixar alguém de fora, e isso não pode depender de rolar
    // a aba até o fim.
    await expect(faixa.getByText("Credencial provisória", { exact: true })).toBeVisible();
  }
});

test("proteção desligada aparece como palavra na faixa, nunca como zero", async ({ page }) => {
  // Padrão do domínio: DUAS proteções nascem desligadas — o bloqueio por
  // origem e a validade da credencial provisória. Ambas precisam da palavra:
  // "0" se leria como "nenhuma tentativa permitida" numa e como "expira
  // imediatamente" na outra, que são o oposto do que significam.
  await entrar(page, ADMIN);
  await page.goto("/configuracoes");
  const faixa = page.getByRole("group", { name: "Panorama das configurações de segurança" });
  await expect(faixa.getByText("Desligado")).toHaveCount(2);
  await expect(faixa.getByText("Desligado").first()).toBeVisible();
  // E nenhuma das duas escreve o zero cru no lugar do destaque.
  await expect(faixa.getByText("0 h", { exact: true })).toHaveCount(0);
  await expect(faixa.getByText("0", { exact: true })).toHaveCount(0);
});

test("aba inexistente na URL cai no padrão, não em erro nem em tela vazia", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes?aba=inventada");
  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Política de senha" })).toBeVisible();
});

test("Gestor não vê 'Configurações' e é redirecionado se tentar a rota", async ({ page }) => {
  await entrar(page, GESTOR);
  const nav = page.getByRole("navigation", { name: "Módulos" });
  await expect(nav.getByRole("link", { name: "Auditoria" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configurações" })).toHaveCount(0);

  // Acesso direto à rota: volta para a HOME (a área é exclusiva do Administrador).
  await page.goto("/configuracoes");
  await page.waitForURL((url) => new URL(url).pathname === "/");
  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toHaveCount(0);
});

/**
 * Validade da credencial provisória — o prazo da senha que alguém transmitiu.
 *
 * O percurso inteiro, com dois navegadores, porque é onde as duas metades se
 * encontram: o Administrador cria a conta e recebe a senha; o prazo passa; a
 * pessoa é recusada **com a senha certa** e a tela lhe diz o que fazer; o
 * Administrador reemite e ela entra. Nenhum teste de unidade alcança isso, e
 * é justamente a cadeia em que um elo solto não aparece — a proteção ficaria
 * ligada e não mordendo, ou mordendo sem saída.
 */
test("credencial provisória expirada barra a senha certa, e a reemissão devolve o acesso", async ({
  browser,
}) => {
  const marca = runId();
  await prisma.configuracaoPortal.upsert({
    where: { id: "portal" },
    update: { credencialProvisoriaHoras: 24 },
    create: { id: "portal", credencialProvisoriaHoras: 24 },
  });

  const contextoAdmin = await browser.newContext();
  const contextoAlvo = await browser.newContext();
  try {
    // 1. O Administrador cria a conta e recolhe a senha provisória da tela.
    const paginaAdmin = await contextoAdmin.newPage();
    await entrar(paginaAdmin, ADMIN);
    await paginaAdmin.goto("/usuarios");
    await paginaAdmin.getByRole("button", { name: "+ Novo usuário" }).click();
    await paginaAdmin.getByLabel("Nome completo").fill(`Prazo ${marca}`);
    const email = `prazo-${marca}${SUFIXO_E2E}`;
    await paginaAdmin.getByLabel("E-mail corporativo").fill(email);
    await paginaAdmin.getByLabel("Papel", { exact: true }).selectOption("LEITURA");
    await paginaAdmin.getByRole("button", { name: "Criar usuário" }).click();

    const aviso = paginaAdmin.getByText(/Senha provisória:/);
    await expect(aviso).toBeVisible();
    const senha = ((await aviso.textContent()) ?? "").match(/broto-[\w-]+/)?.[0] ?? "";
    expect(senha).not.toBe("");

    // A lista já mostra o prazo, e é por isso que ele é calculado na consulta
    // e não na tela: os dois lados leem a mesma função.
    await paginaAdmin.getByLabel("Buscar por nome ou e-mail").fill(email);
    const linha = paginaAdmin.getByRole("row").filter({ hasText: email });
    await expect(linha.getByText(/expira em \d+ h/)).toBeVisible();

    // 2. Envelhece a emissão para além do prazo — 30 minutos de espera não
    //    cabem numa suíte, e o que se quer provar é a regra, não o relógio.
    await prisma.usuario.update({
      where: { email },
      data: { credencialEmitidaEm: new Date(Date.now() - 25 * 60 * 60_000) },
    });

    // 3. A senha está CERTA e mesmo assim não entra — e a tela diz por quê.
    const paginaAlvo = await contextoAlvo.newPage();
    await paginaAlvo.goto("/entrar");
    await paginaAlvo.getByLabel("E-mail").fill(email);
    await paginaAlvo.getByLabel("Senha").fill(senha);
    await paginaAlvo.getByRole("button", { name: "Entrar" }).click();
    await paginaAlvo.waitForURL(/\/entrar\?erro=credencial-expirada/);
    await expect(paginaAlvo.getByText(/A senha provisória desta conta expirou/)).toBeVisible();
    await semViolacoesAxe(paginaAlvo);

    // E a recusa NÃO conta como senha errada: a conta não fica bloqueada por
    // acertar. Punir quem acertou seria contar o que a regra não mede.
    const apos = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    expect(apos.loginTentativas).toBe(0);
    expect(apos.loginBloqueadoAte).toBeNull();

    // 4. A lista do Administrador acusa o estado, com o remédio na frase.
    await paginaAdmin.reload();
    await paginaAdmin.getByLabel("Buscar por nome ou e-mail").fill(email);
    await expect(linha.getByText("expirada — emita outra")).toBeVisible();

    // 5. Reemitir devolve o acesso — é a única saída, e ela funciona.
    await linha.getByRole("button", { name: "Acesso" }).click();
    await linha.getByRole("button", { name: "Redefinir credencial" }).click();
    const novoAviso = paginaAdmin.getByText(/Senha provisória:/);
    await expect(novoAviso).toBeVisible();
    const nova = ((await novoAviso.textContent()) ?? "").match(/broto-[\w-]+/)?.[0] ?? "";
    expect(nova).not.toBe(senha);

    await paginaAlvo.goto("/entrar");
    await paginaAlvo.getByLabel("E-mail").fill(email);
    await paginaAlvo.getByLabel("Senha").fill(nova);
    await paginaAlvo.getByRole("button", { name: "Entrar" }).click();
    // Credencial provisória só navega para a troca de senha (ficha §3).
    await paginaAlvo.waitForURL(/\/trocar-senha/);
  } finally {
    await contextoAdmin.close();
    await contextoAlvo.close();
  }
});

/**
 * A isenção de quem configura o portal, pelo mesmo motivo da RN74: é a conta
 * que emite credencial para as outras, e se a dela expirar não sobra ninguém
 * para reemitir. Uma plataforma cuja única saída é o banco de dados não tem
 * saída.
 *
 * O teste força o pior caso possível — credencial do Administrador emitida há
 * um mês, com a proteção ligada — e exige que ele entre assim mesmo.
 */
test("quem configura o portal não é barrado pela credencial provisória expirada", async ({
  browser,
}) => {
  await prisma.configuracaoPortal.upsert({
    where: { id: "portal" },
    update: { credencialProvisoriaHoras: 1 },
    create: { id: "portal", credencialProvisoriaHoras: 1 },
  });
  const antes = await prisma.usuario.findUniqueOrThrow({ where: { email: ADMIN } });
  await prisma.usuario.update({
    where: { email: ADMIN },
    data: {
      trocaSenhaObrigatoria: true,
      credencialEmitidaEm: new Date(Date.now() - 30 * 24 * 60 * 60_000),
    },
  });

  const contexto = await browser.newContext();
  try {
    const pagina = await contexto.newPage();
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(ADMIN);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    // Entra — e vai para a troca obrigatória, que é outra coisa e continua
    // valendo. O que não pode acontecer é ser recusado.
    await pagina.waitForURL(/\/trocar-senha/);
  } finally {
    await contexto.close();
    await prisma.usuario.update({
      where: { email: ADMIN },
      data: {
        trocaSenhaObrigatoria: antes.trocaSenhaObrigatoria,
        credencialEmitidaEm: antes.credencialEmitidaEm,
      },
    });
  }
});

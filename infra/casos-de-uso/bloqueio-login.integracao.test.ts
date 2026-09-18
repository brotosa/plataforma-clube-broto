import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { provedorCredenciaisPrisma } from "@/infra/identidade/provedor-credenciais-prisma";
import { alterarPoliticaDeLogin } from "./configuracoes";
import {
  desbloquearLogin,
  emailEstaBloqueado,
  listarLoginsBloqueados,
} from "./bloqueio-login";
import { type Ator } from "./contexto";

/**
 * Integração do bloqueio por tentativas de login (PR C) — executa só com banco.
 * Cobre a contagem/bloqueio no provedor de credenciais, a isenção do
 * Administrador, o desbloqueio manual (RBAC + efeito) e a leitura de estado que
 * a tela de login usa.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const prisma = new PrismaClient();
const SUFIXO = "@blq.local";
const SENHA = "senha-correta-1";
const ID_SINGLETON = "portal";

let admin: Ator;

async function criarDireto(
  nome: string,
  papel: "ADMINISTRADOR_PLATAFORMA" | "ADMIN" | "GESTOR" | "LEITURA",
) {
  return prisma.usuario.create({
    data: {
      nome,
      email: `${nome.toLowerCase().replace(/\W+/g, "-")}${SUFIXO}`,
      senhaHash: await hash(SENHA, 10),
      papel,
      ativo: true,
      trocaSenhaObrigatoria: false,
    },
  });
}

async function limparConfig() {
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: ID_SINGLETON } });
}

async function limparUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: SUFIXO } },
    select: { id: true },
  });
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({ where: { autorId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
}

/** Repete falhas de login até bloquear (política de 3 nos testes). */
async function errarSenha(email: string, vezes: number) {
  for (let i = 0; i < vezes; i += 1) {
    await provedorCredenciaisPrisma.autenticarPorCredenciais(email, "errada");
  }
}

describe.skipIf(!temBanco)("Bloqueio por tentativas de login (PR C)", () => {
  beforeEach(async () => {
    await limparUsuarios();
    await limparConfig();
    const administrador = await criarDireto("Admin Blq", "ADMINISTRADOR_PLATAFORMA");
    admin = { id: administrador.id, papel: administrador.papel };
    // Política curta para o teste: bloqueia em 3 falhas, por 15 min.
    await alterarPoliticaDeLogin(admin, { maxTentativas: 3, bloqueioMin: 15 });
  });

  afterEach(limparConfig);

  afterAll(async () => {
    await limparUsuarios();
    await limparConfig();
    await prisma.$disconnect();
  });

  it("bloqueia após o limite de falhas e recusa mesmo com a senha certa", async () => {
    const alvo = await criarDireto("Vitima Blq", "LEITURA");
    // 2 falhas: ainda não bloqueia.
    await errarSenha(alvo.email, 2);
    expect(await emailEstaBloqueado(alvo.email)).toBe(false);
    // A senha certa ainda entra e zera o contador.
    expect(await provedorCredenciaisPrisma.autenticarPorCredenciais(alvo.email, SENHA)).not.toBeNull();
    let estado = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(estado.loginTentativas).toBe(0);

    // Agora 3 falhas seguidas: bloqueia.
    await errarSenha(alvo.email, 3);
    expect(await emailEstaBloqueado(alvo.email)).toBe(true);
    estado = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(estado.loginBloqueadoAte).not.toBeNull();

    // Bloqueado: a senha CERTA também é recusada.
    expect(await provedorCredenciaisPrisma.autenticarPorCredenciais(alvo.email, SENHA)).toBeNull();
  });

  /**
   * **Este teste dizia "nem contado", e agora conta.** A mudança é deliberada
   * e a asserção que importa continua idêntica: a conta isenta NUNCA é
   * trancada, e entra com a senha certa depois de dez erros.
   *
   * O que mudou é que ela deixou de ser invisível. Antes, tentar senhas contra
   * uma conta de Administrador não tocava contador nenhum e não gravava evento
   * nenhum — e como o bloqueio por origem nasce desligado, a tentativa podia se
   * repetir sem limite, sem prazo e sem rastro em lugar algum. A isenção
   * continua sem contrapartida decidida (pendência da ficha da Onda 15); o que
   * existe agora é o número em que apoiar a decisão.
   */
  it("o Administrador da Plataforma nunca é bloqueado — mas agora é CONTADO", async () => {
    const outroAdmin = await criarDireto("Admin Alvo Blq", "ADMINISTRADOR_PLATAFORMA");
    await errarSenha(outroAdmin.email, 10);
    const estado = await prisma.usuario.findUniqueOrThrow({ where: { id: outroAdmin.id } });
    expect(estado.loginTentativas).toBe(10);
    // Não-regressão da RN74 — inalterado de propósito:
    expect(estado.loginBloqueadoAte).toBeNull();
    expect(await emailEstaBloqueado(outroAdmin.email)).toBe(false);
    // E continua entrando com a senha certa.
    expect(
      await provedorCredenciaisPrisma.autenticarPorCredenciais(outroAdmin.email, SENHA),
    ).not.toBeNull();
  });

  /**
   * A isenção acompanhou a RENOMEAÇÃO da Onda 15, e tinha de acompanhar.
   *
   * O papel que se chamava "Administrador da Plataforma" passou a se chamar
   * "Administrador" (`ADMIN`), e é nele que estão as contas reais. Se a
   * isenção tivesse ficado presa ao literal `ADMINISTRADOR_PLATAFORMA`, ela
   * passaria a valer para um papel que ninguém detém e as contas reais —
   * que só trocaram de nome — perderiam a isenção **sem que nada no pedido
   * mandasse tirá-la**. Numa renomeação, nada pode mudar.
   *
   * A condição passou a ser a CAPACIDADE (`CONFIGURAR_PORTAL`), que é o
   * motivo original da regra: a conta que destranca as outras não pode se
   * trancar.
   */
  it("o papel renomeado (Administrador) também nunca é bloqueado — e também é contado", async () => {
    const administrador = await criarDireto("Administrador Alvo Blq", "ADMIN");
    await errarSenha(administrador.email, 10);
    const estado = await prisma.usuario.findUniqueOrThrow({ where: { id: administrador.id } });
    expect(estado.loginTentativas).toBe(10);
    // Não-regressão da RN74 — inalterado de propósito:
    expect(estado.loginBloqueadoAte).toBeNull();
    expect(await emailEstaBloqueado(administrador.email)).toBe(false);
    expect(
      await provedorCredenciaisPrisma.autenticarPorCredenciais(administrador.email, SENHA),
    ).not.toBeNull();
  });

  it("desbloquear zera o estado e devolve o acesso — só ao Administrador, auditado", async () => {
    const alvo = await criarDireto("Solto Blq", "GESTOR");
    await errarSenha(alvo.email, 3);
    expect(await emailEstaBloqueado(alvo.email)).toBe(true);

    // Gestor não desbloqueia.
    await expect(
      desbloquearLogin({ id: alvo.id, papel: "GESTOR" }, alvo.id),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);

    await desbloquearLogin(admin, alvo.id);
    const estado = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(estado.loginTentativas).toBe(0);
    expect(estado.loginBloqueadoAte).toBeNull();
    expect(await emailEstaBloqueado(alvo.email)).toBe(false);
    // Entra de novo com a senha certa.
    expect(await provedorCredenciaisPrisma.autenticarPorCredenciais(alvo.email, SENHA)).not.toBeNull();

    // Auditou o desbloqueio.
    const evento = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "usuario", entidadeId: alvo.id, campo: "loginBloqueadoAte" },
    });
    expect(evento?.autorId).toBe(admin.id);
  });

  it("lista as contas bloqueadas para o desbloqueio", async () => {
    const alvo = await criarDireto("Listado Blq", "LEITURA");
    await errarSenha(alvo.email, 3);
    const lista = await listarLoginsBloqueados();
    const encontrado = lista.find((linha) => linha.id === alvo.id);
    expect(encontrado).toBeDefined();
    expect(encontrado?.minutosRestantes).toBeGreaterThan(0);
    expect(encontrado?.minutosRestantes).toBeLessThanOrEqual(15);
  });
});

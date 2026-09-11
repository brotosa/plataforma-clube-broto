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
  papel: "ADMINISTRADOR_PLATAFORMA" | "GESTOR" | "LEITURA",
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

  it("o Administrador da Plataforma nunca é bloqueado nem contado", async () => {
    const outroAdmin = await criarDireto("Admin Alvo Blq", "ADMINISTRADOR_PLATAFORMA");
    await errarSenha(outroAdmin.email, 10);
    const estado = await prisma.usuario.findUniqueOrThrow({ where: { id: outroAdmin.id } });
    expect(estado.loginTentativas).toBe(0);
    expect(estado.loginBloqueadoAte).toBeNull();
    expect(await emailEstaBloqueado(outroAdmin.email)).toBe(false);
    // E continua entrando com a senha certa.
    expect(
      await provedorCredenciaisPrisma.autenticarPorCredenciais(outroAdmin.email, SENHA),
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

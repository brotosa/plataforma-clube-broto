import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { alterarPoliticaDeOrigem } from "./configuracoes";
import {
  desbloquearOrigem,
  limparOrigem,
  listarOrigensBloqueadas,
  origemEstaBloqueada,
  registrarFalhaDeOrigem,
} from "./bloqueio-origem";
import { type Ator } from "./contexto";

/**
 * Integração do bloqueio por ORIGEM. Não passa pelo provedor de credenciais
 * (que lê cabeçalho de requisição real): exercita a contagem, o desligamento,
 * a listagem e o desbloqueio diretamente.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const prisma = new PrismaClient();
const SUFIXO = "@org.local";
const ORIGEM = "203.0.113.7"; // faixa TEST-NET-3, reservada para documentação
const ID_SINGLETON = "portal";

let admin: Ator;

async function limpar() {
  await prisma.bloqueioOrigem.deleteMany({ where: { origem: { startsWith: "203.0.113." } } });
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "bloqueio_origem" } });
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: ID_SINGLETON } });
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: SUFIXO } },
    select: { id: true },
  });
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({ where: { autorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
}

describe.skipIf(!temBanco)("Bloqueio por origem de rede", () => {
  beforeEach(async () => {
    await limpar();
    const a = await prisma.usuario.create({
      data: {
        nome: "Admin Org",
        email: `admin-org${SUFIXO}`,
        senhaHash: await hash("x", 10),
        papel: "ADMINISTRADOR_PLATAFORMA",
        ativo: true,
        trocaSenhaObrigatoria: false,
      },
    });
    admin = { id: a.id, papel: a.papel };
  });

  afterEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("desligado (padrão) não conta nem bloqueia", async () => {
    for (let i = 0; i < 20; i += 1) await registrarFalhaDeOrigem(ORIGEM);
    expect(await origemEstaBloqueada(ORIGEM)).toBe(false);
    expect(await prisma.bloqueioOrigem.findUnique({ where: { origem: ORIGEM } })).toBeNull();
  });

  it("ligado, bloqueia no limite e a lista mostra o endereço", async () => {
    await alterarPoliticaDeOrigem(admin, { maxTentativas: 5, bloqueioMin: 15 });
    for (let i = 0; i < 4; i += 1) await registrarFalhaDeOrigem(ORIGEM);
    expect(await origemEstaBloqueada(ORIGEM)).toBe(false);

    await registrarFalhaDeOrigem(ORIGEM);
    expect(await origemEstaBloqueada(ORIGEM)).toBe(true);

    const lista = await listarOrigensBloqueadas();
    const achado = lista.find((l) => l.origem === ORIGEM);
    expect(achado).toBeDefined();
    expect(achado?.minutosRestantes).toBeGreaterThan(0);
  });

  it("origem nula nunca bloqueia — sem endereço, a regra não se aplica", async () => {
    await alterarPoliticaDeOrigem(admin, { maxTentativas: 5, bloqueioMin: 15 });
    for (let i = 0; i < 10; i += 1) await registrarFalhaDeOrigem(null);
    expect(await origemEstaBloqueada(null)).toBe(false);
  });

  it("login bem-sucedido limpa a origem", async () => {
    await alterarPoliticaDeOrigem(admin, { maxTentativas: 5, bloqueioMin: 15 });
    for (let i = 0; i < 3; i += 1) await registrarFalhaDeOrigem(ORIGEM);
    await limparOrigem(ORIGEM);
    const linha = await prisma.bloqueioOrigem.findUnique({ where: { origem: ORIGEM } });
    expect(linha?.tentativas).toBe(0);
    expect(linha?.bloqueadoAte).toBeNull();
  });

  it("desbloquear libera — só Administrador, e auditado", async () => {
    await alterarPoliticaDeOrigem(admin, { maxTentativas: 5, bloqueioMin: 15 });
    for (let i = 0; i < 5; i += 1) await registrarFalhaDeOrigem(ORIGEM);
    const linha = await prisma.bloqueioOrigem.findUniqueOrThrow({ where: { origem: ORIGEM } });

    await expect(
      desbloquearOrigem({ id: admin.id, papel: "GESTOR" }, linha.id),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);

    await desbloquearOrigem(admin, linha.id);
    expect(await origemEstaBloqueada(ORIGEM)).toBe(false);

    const evento = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "bloqueio_origem", entidadeId: linha.id },
    });
    expect(evento?.autorId).toBe(admin.id);
  });

  it("desligar a regra faz a origem deixar de ser reportada como bloqueada", async () => {
    await alterarPoliticaDeOrigem(admin, { maxTentativas: 5, bloqueioMin: 15 });
    for (let i = 0; i < 5; i += 1) await registrarFalhaDeOrigem(ORIGEM);
    expect(await origemEstaBloqueada(ORIGEM)).toBe(true);
    await alterarPoliticaDeOrigem(admin, { maxTentativas: 0, bloqueioMin: 15 });
    expect(await origemEstaBloqueada(ORIGEM)).toBe(false);
  });
});

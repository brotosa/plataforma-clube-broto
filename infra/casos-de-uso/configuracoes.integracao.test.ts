import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { POLITICA_SENHA_PADRAO } from "@/dominio/usuarios/politica-senha";
import { ErroDeValidacao, type Ator } from "./contexto";
import { alterarPoliticaDeSenha, lerPoliticaDeSenha } from "./configuracoes";
import { trocarPropriaSenha } from "./usuarios";

/**
 * Integração das Configurações (PR A): a política de senha do portal e a sua
 * aplicação na troca da própria senha (executa apenas com banco disponível).
 *
 * Cobre RBAC (só Administrador escreve), auditoria da mudança de política, e o
 * efeito da política na `trocarPropriaSenha` — comprimento, classe de
 * caractere e histórico (a nova não repete as últimas N; guarda-se só o HASH).
 *
 * O `configuracao_portal` é um singleton GLOBAL: cada caso restaura o estado
 * padrão (apaga a linha) ao terminar, para não vazar política apertada para os
 * demais testes de integração. Os usuários de teste vivem em @cfg.local.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const prisma = new PrismaClient();
const SUFIXO = "@cfg.local";
const ID_SINGLETON = "portal";

let admin: Ator;

async function criarDireto(
  nome: string,
  papel: "ADMINISTRADOR_PLATAFORMA" | "GESTOR" | "LEITURA",
  senhaClara = "sem-login",
) {
  const senhaHash = senhaClara === "sem-login" ? "sem-login" : await hash(senhaClara, 10);
  return prisma.usuario.create({
    data: {
      nome,
      email: `${nome.toLowerCase().replace(/\W+/g, "-")}${SUFIXO}`,
      senhaHash,
      papel,
      ativo: true,
      trocaSenhaObrigatoria: false,
    },
  });
}

async function limparConfiguracao() {
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: ID_SINGLETON } });
}

async function limparUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: SUFIXO } },
    select: { id: true },
  });
  const ids = usuarios.map((usuario) => usuario.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({ where: { autorId: { in: ids } } });
    // As linhas de histórico caem por cascade ao remover o usuário.
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
}

describe.skipIf(!temBanco)("Configurações — política de senha (PR A)", () => {
  beforeEach(async () => {
    await limparUsuarios();
    await limparConfiguracao();
    const administrador = await criarDireto("Admin Cfg", "ADMINISTRADOR_PLATAFORMA");
    admin = { id: administrador.id, papel: administrador.papel };
  });

  afterEach(async () => {
    await limparConfiguracao();
  });

  afterAll(async () => {
    await limparUsuarios();
    await limparConfiguracao();
    await prisma.$disconnect();
  });

  // ---- RBAC ----
  it("recusa a escrita da política a quem não é Administrador", async () => {
    const gestor = await criarDireto("Gestor Cfg", "GESTOR");
    await expect(
      alterarPoliticaDeSenha(
        { id: gestor.id, papel: "GESTOR" },
        { ...POLITICA_SENHA_PADRAO, comprimentoMin: 12 },
      ),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });

  it("recusa política com valores fora da faixa", async () => {
    await expect(
      alterarPoliticaDeSenha(admin, { ...POLITICA_SENHA_PADRAO, comprimentoMin: 4 }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  // ---- leitura/escrita do singleton ----
  it("lê o padrão do domínio quando não há linha e passa a ler o que foi salvo", async () => {
    const inicial = await lerPoliticaDeSenha();
    expect(inicial).toEqual(POLITICA_SENHA_PADRAO);

    await alterarPoliticaDeSenha(admin, {
      comprimentoMin: 12,
      exigeMaiuscula: true,
      exigeMinuscula: false,
      exigeNumero: true,
      exigeSimbolo: false,
      historicoN: 3,
    });

    const depois = await lerPoliticaDeSenha();
    expect(depois.comprimentoMin).toBe(12);
    expect(depois.exigeMaiuscula).toBe(true);
    expect(depois.exigeNumero).toBe(true);
    expect(depois.historicoN).toBe(3);
  });

  it("audita a mudança com anterior (padrão do domínio) e novo", async () => {
    await alterarPoliticaDeSenha(admin, { ...POLITICA_SENHA_PADRAO, comprimentoMin: 14 });
    const evento = await prisma.auditoriaEvento.findFirst({
      where: {
        entidade: "configuracao_portal",
        entidadeId: ID_SINGLETON,
        campo: "senhaComprimentoMin",
      },
    });
    expect(evento?.valorAnterior).toBe(String(POLITICA_SENHA_PADRAO.comprimentoMin));
    expect(evento?.valorNovo).toBe("14");
    expect(evento?.autorId).toBe(admin.id);
  });

  // ---- efeito na troca da própria senha ----
  it("rejeita senha que não cumpre a classe de caractere exigida", async () => {
    await alterarPoliticaDeSenha(admin, {
      ...POLITICA_SENHA_PADRAO,
      comprimentoMin: 8,
      exigeMaiuscula: true,
      exigeNumero: true,
      historicoN: 0,
    });
    const alvo = await criarDireto("Classe Cfg", "LEITURA", "senha-antiga-1");
    const ator = { id: alvo.id, papel: "LEITURA" as const };
    // Sem maiúscula: recusa.
    await expect(
      trocarPropriaSenha(ator, { nova: "somente-minusculas-1", confirmacao: "somente-minusculas-1" }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
    // Com maiúscula e número: passa.
    await trocarPropriaSenha(ator, { nova: "Senha-Forte-9", confirmacao: "Senha-Forte-9" });
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(await compare("Senha-Forte-9", depois.senhaHash)).toBe(true);
  });

  it("guarda só o HASH da senha anterior no histórico e recusa a repetição", async () => {
    await alterarPoliticaDeSenha(admin, {
      ...POLITICA_SENHA_PADRAO,
      comprimentoMin: 8,
      historicoN: 3,
    });
    const alvo = await criarDireto("Historico Cfg", "LEITURA", "primeira-senha-1");
    const ator = { id: alvo.id, papel: "LEITURA" as const };

    // Troca 1: primeira-senha-1 (atual) -> segunda-senha-2.
    await trocarPropriaSenha(ator, { nova: "segunda-senha-2", confirmacao: "segunda-senha-2" });
    // A anterior foi ao histórico, só como hash.
    const historico = await prisma.senhaHistorico.findMany({ where: { usuarioId: alvo.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.senhaHash).not.toContain("primeira-senha-1");
    expect(await compare("primeira-senha-1", historico[0]!.senhaHash)).toBe(true);

    // Repetir a atual: recusa.
    await expect(
      trocarPropriaSenha(ator, { nova: "segunda-senha-2", confirmacao: "segunda-senha-2" }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
    // Repetir a imediatamente anterior (no histórico): recusa.
    await expect(
      trocarPropriaSenha(ator, { nova: "primeira-senha-1", confirmacao: "primeira-senha-1" }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it("poda o histórico para no máximo N-1 linhas", async () => {
    await alterarPoliticaDeSenha(admin, {
      ...POLITICA_SENHA_PADRAO,
      comprimentoMin: 8,
      historicoN: 2,
    });
    const alvo = await criarDireto("Poda Cfg", "LEITURA", "senha-numero-1");
    const ator = { id: alvo.id, papel: "LEITURA" as const };

    await trocarPropriaSenha(ator, { nova: "senha-numero-2", confirmacao: "senha-numero-2" });
    await trocarPropriaSenha(ator, { nova: "senha-numero-3", confirmacao: "senha-numero-3" });
    await trocarPropriaSenha(ator, { nova: "senha-numero-4", confirmacao: "senha-numero-4" });

    // N=2 => a atual + 1 do histórico formam as 2 que a próxima confere.
    const historico = await prisma.senhaHistorico.findMany({ where: { usuarioId: alvo.id } });
    expect(historico).toHaveLength(1);
    // A que sobrou é a mais recente das anteriores (senha-numero-3).
    expect(await compare("senha-numero-3", historico[0]!.senhaHash)).toBe(true);
    // E a mais antiga (senha-numero-1) já pode ser reusada.
    await trocarPropriaSenha(ator, { nova: "senha-numero-1", confirmacao: "senha-numero-1" });
  });
});

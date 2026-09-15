import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { MENSAGEM_ULTIMO_ADMINISTRADOR } from "@/dominio/usuarios/regras";
import { ErroDeValidacao, type Ator } from "./contexto";
import {
  atualizarUsuario,
  criarUsuario,
  inativarUsuario,
  reativarUsuario,
  redefinirCredencial,
  trocarPropriaSenha,
  exigirNovaSenha,
  exigirNovaSenhaDeTodos,
} from "./usuarios";

/**
 * Integração da T27 (executa apenas com banco disponível): RN46 (proteção
 * do último administrador), RN47 (revogação por época e preservação do
 * histórico) e a disciplina de auditoria — a senha nunca entra na trilha.
 *
 * Os usuários de teste vivem num domínio próprio (@f13.local) e são
 * removidos entre os casos, para não interferir na contagem de
 * administradores do seed.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const prisma = new PrismaClient();
const SUFIXO = "@f13.local";

let admin: Ator;

async function criarDireto(
  nome: string,
  papel: "ADMINISTRADOR_PLATAFORMA" | "GESTOR" | "LEITURA",
  ativo = true,
) {
  return prisma.usuario.create({
    data: {
      nome,
      email: `${nome.toLowerCase().replace(/\W+/g, "-")}${SUFIXO}`,
      senhaHash: "sem-login",
      papel,
      ativo,
      trocaSenhaObrigatoria: false,
    },
  });
}

/**
 * Neutraliza os administradores do seed dentro do caso: a RN46 conta
 * administradores ATIVOS da base inteira, então provar "é o último" exige
 * que ele seja mesmo o último.
 */
async function apenasUmAdministradorAtivo() {
  await prisma.usuario.updateMany({
    // A RN46 passou a contar quem PODE GERIR USUÁRIOS, e não um papel literal
    // (ver `eAdministradorEfetivo`): depois da renomeação da Onda 15 são dois
    // papéis. Neutralizar só um deles deixaria o outro contando, e o teste
    // provaria "é o último" sobre uma base onde ele não é.
    where: {
      papel: { in: ["ADMINISTRADOR_PLATAFORMA", "ADMIN"] },
      email: { not: { endsWith: SUFIXO } },
    },
    data: { ativo: false },
  });
}

async function restaurarAdministradoresDoSeed() {
  await prisma.usuario.updateMany({
    // A RN46 passou a contar quem PODE GERIR USUÁRIOS, e não um papel literal
    // (ver `eAdministradorEfetivo`): depois da renomeação da Onda 15 são dois
    // papéis. Neutralizar só um deles deixaria o outro contando, e o teste
    // provaria "é o último" sobre uma base onde ele não é.
    where: {
      papel: { in: ["ADMINISTRADOR_PLATAFORMA", "ADMIN"] },
      email: { not: { endsWith: SUFIXO } },
    },
    data: { ativo: true },
  });
}

async function limpar() {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: SUFIXO } },
    select: { id: true },
  });
  const ids = usuarios.map((usuario) => usuario.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({ where: { autorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
}

describe.skipIf(!temBanco)("T27 — gestão de usuários (RN46, RN47)", () => {
  beforeEach(async () => {
    await limpar();
    await restaurarAdministradoresDoSeed();
    const administrador = await criarDireto("Admin F13", "ADMINISTRADOR_PLATAFORMA");
    admin = { id: administrador.id, papel: administrador.papel };
  });

  afterAll(async () => {
    await limpar();
    await restaurarAdministradoresDoSeed();
    await prisma.$disconnect();
  });

  // ---- RBAC (RN46) ----
  it("recusa a gestão de usuários a quem não é Administrador — inclusive ao Gestor", async () => {
    const gestor = await criarDireto("Gestor F13", "GESTOR");
    await expect(
      criarUsuario(
        { id: gestor.id, papel: "GESTOR" },
        { nome: "Nova Pessoa", email: `nova${SUFIXO}`, papel: "LEITURA" },
      ),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });

  it("cria usuário com credencial provisória e troca obrigatória", async () => {
    const { id, senhaProvisoria } = await criarUsuario(admin, {
      nome: "Pessoa Nova",
      email: `pessoa.nova${SUFIXO}`,
      papel: "ANALISTA",
    });
    const criado = await prisma.usuario.findUniqueOrThrow({ where: { id } });
    expect(criado.trocaSenhaObrigatoria).toBe(true);
    expect(criado.ativo).toBe(true);
    expect(criado.sessaoEpoca).toBe(0);
    // A senha devolvida é a que autentica, e o que fica gravado é só o hash.
    expect(await compare(senhaProvisoria, criado.senhaHash)).toBe(true);
    expect(criado.senhaHash).not.toContain(senhaProvisoria);
  });

  it("recusa e-mail repetido apontando a inativação como caminho", async () => {
    await criarUsuario(admin, {
      nome: "Pessoa Unica",
      email: `unica${SUFIXO}`,
      papel: "LEITURA",
    });
    await expect(
      criarUsuario(admin, {
        nome: "Outra Pessoa",
        email: `unica${SUFIXO}`,
        papel: "LEITURA",
      }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  // ---- RN46: proteção do último administrador ----
  it("impede INATIVAR o último administrador ativo", async () => {
    await apenasUmAdministradorAtivo();
    await expect(inativarUsuario(admin, admin.id)).rejects.toThrow(
      MENSAGEM_ULTIMO_ADMINISTRADOR,
    );
    const intacto = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(intacto.ativo).toBe(true);
    expect(intacto.sessaoEpoca).toBe(0);
  });

  it("impede REBAIXAR o último administrador ativo", async () => {
    await apenasUmAdministradorAtivo();
    await expect(
      atualizarUsuario(admin, admin.id, { nome: "Admin F13", papel: "GESTOR" }),
    ).rejects.toThrow(MENSAGEM_ULTIMO_ADMINISTRADOR);
    const intacto = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(intacto.papel).toBe("ADMINISTRADOR_PLATAFORMA");
  });

  it("permite inativar um administrador quando existe outro ativo", async () => {
    await apenasUmAdministradorAtivo();
    const segundo = await criarDireto("Admin F13 Dois", "ADMINISTRADOR_PLATAFORMA");
    await inativarUsuario(admin, segundo.id);
    const inativado = await prisma.usuario.findUniqueOrThrow({ where: { id: segundo.id } });
    expect(inativado.ativo).toBe(false);
  });

  // ---- RN47: revogação por época ----
  it("inativar avança a época — é o que derruba a sessão aberta", async () => {
    const alvo = await criarDireto("Alvo F13", "LEITURA");
    expect(alvo.sessaoEpoca).toBe(0);
    await inativarUsuario(admin, alvo.id);
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.ativo).toBe(false);
    expect(depois.sessaoEpoca).toBe(1);
  });

  it("trocar de papel avança a época — o papel viaja no token", async () => {
    const alvo = await criarDireto("Papel F13", "LEITURA");
    await atualizarUsuario(admin, alvo.id, { nome: "Papel F13", papel: "APROVADOR" });
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.papel).toBe("APROVADOR");
    expect(depois.sessaoEpoca).toBe(1);
  });

  it("editar só o nome NÃO avança a época", async () => {
    const alvo = await criarDireto("Nome F13", "LEITURA");
    await atualizarUsuario(admin, alvo.id, { nome: "Nome F13 Editado", papel: "LEITURA" });
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.nome).toBe("Nome F13 Editado");
    expect(depois.sessaoEpoca).toBe(0);
  });

  it("redefinir credencial derruba as sessões e exige troca de novo", async () => {
    const alvo = await criarDireto("Credencial F13", "LEITURA");
    const { senhaProvisoria } = await redefinirCredencial(admin, alvo.id);
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.sessaoEpoca).toBe(1);
    expect(depois.trocaSenhaObrigatoria).toBe(true);
    expect(await compare(senhaProvisoria, depois.senhaHash)).toBe(true);
  });

  it("trocar a própria senha encerra a obrigatoriedade sem se autoexpulsar", async () => {
    const alvo = await criarDireto("Propria F13", "LEITURA");
    await prisma.usuario.update({
      where: { id: alvo.id },
      data: { trocaSenhaObrigatoria: true },
    });
    await trocarPropriaSenha(
      { id: alvo.id, papel: "LEITURA" },
      { nova: "senha-bem-longa-1", confirmacao: "senha-bem-longa-1" },
    );
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.trocaSenhaObrigatoria).toBe(false);
    // A época NÃO avança: a pessoa seria expulsa no instante em que cumpre
    // o que a plataforma exigiu dela.
    expect(depois.sessaoEpoca).toBe(0);
    expect(await compare("senha-bem-longa-1", depois.senhaHash)).toBe(true);
  });

  it("recusa troca com confirmação divergente ou senha curta", async () => {
    const alvo = await criarDireto("Curta F13", "LEITURA");
    const ator = { id: alvo.id, papel: "LEITURA" as const };
    await expect(
      trocarPropriaSenha(ator, { nova: "senha-longa-1", confirmacao: "outra-coisa-1" }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
    await expect(
      trocarPropriaSenha(ator, { nova: "curta", confirmacao: "curta" }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it("reativar emite credencial nova e não avança a época", async () => {
    const alvo = await criarDireto("Volta F13", "LEITURA", false);
    const { senhaProvisoria } = await reativarUsuario(admin, alvo.id);
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.ativo).toBe(true);
    expect(depois.trocaSenhaObrigatoria).toBe(true);
    expect(depois.sessaoEpoca).toBe(0);
    expect(await compare(senhaProvisoria, depois.senhaHash)).toBe(true);
  });

  // ---- RN47: histórico e autoria preservados ----
  it("inativar preserva o histórico e a autoria do usuário", async () => {
    const alvo = await criarDireto("Historico F13", "GESTOR");
    await prisma.auditoriaEvento.create({
      data: {
        entidade: "empresa",
        entidadeId: "empresa-ficticia-f13",
        campo: "nomeFantasia",
        valorAnterior: null,
        valorNovo: "Registro do usuário inativado",
        autorId: alvo.id,
      },
    });

    await inativarUsuario(admin, alvo.id);

    // O usuário continua existindo (não há exclusão) e o evento dele também.
    const aindaExiste = await prisma.usuario.findUnique({ where: { id: alvo.id } });
    expect(aindaExiste).not.toBeNull();
    const eventos = await prisma.auditoriaEvento.findMany({
      where: { autorId: alvo.id, entidade: "empresa" },
    });
    expect(eventos).toHaveLength(1);
  });

  // ---- auditoria da própria gestão ----
  it("audita a criação sem jamais gravar senha nem hash na trilha", async () => {
    const { id, senhaProvisoria } = await criarUsuario(admin, {
      nome: "Auditada F13",
      email: `auditada${SUFIXO}`,
      papel: "LEITURA",
    });
    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "usuario", entidadeId: id },
    });
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos.every((evento) => evento.autorId === admin.id)).toBe(true);
    expect(eventos.some((evento) => evento.campo === "senhaHash")).toBe(false);
    expect(eventos.some((evento) => evento.campo === "sessaoEpoca")).toBe(false);
    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toContain(senhaProvisoria);
    expect(serializado).not.toContain("$2");
  });

  it("audita a inativação com valor anterior e novo", async () => {
    const alvo = await criarDireto("Trilha F13", "LEITURA");
    await inativarUsuario(admin, alvo.id);
    const evento = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "usuario", entidadeId: alvo.id, campo: "ativo" },
    });
    expect(evento?.valorAnterior).toBe("true");
    expect(evento?.valorNovo).toBe("false");
    expect(evento?.autorId).toBe(admin.id);
  });

  /**
   * Exigir nova senha — o remédio para a lacuna da validade (RN72).
   *
   * Ligar o vencimento não alcança quem já está na base: `senhaAlteradaEm`
   * nasce nula e nulo significa "nunca vence". Sem esta ação a política fica
   * acesa e sem morder.
   */
  describe("exigir nova senha no próximo acesso", () => {
    it("acende a marca SEM trocar a senha — a atual continua valendo", async () => {
      const alvo = await criarDireto("Troca F23", "LEITURA");
      const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });

      await exigirNovaSenha(admin, alvo.id);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
      expect(depois.trocaSenhaObrigatoria).toBe(true);
      // O ponto que separa esta ação de "redefinir credencial": o hash é o
      // MESMO, então nada precisou ser transmitido a ninguém.
      expect(depois.senhaHash).toBe(antes.senhaHash);
      // E a sessão não é derrubada: a pessoa já está autenticada com a senha
      // que estamos pedindo para trocar.
      expect(depois.sessaoEpoca).toBe(antes.sessaoEpoca);
    });

    it("grava a mudança na trilha, com autor", async () => {
      const alvo = await criarDireto("Troca Trilha F23", "LEITURA");
      await exigirNovaSenha(admin, alvo.id);
      const evento = await prisma.auditoriaEvento.findFirst({
        where: { entidadeId: alvo.id, campo: "trocaSenhaObrigatoria" },
        orderBy: { criadoEm: "desc" },
      });
      expect(evento?.valorAnterior).toBe("false");
      expect(evento?.valorNovo).toBe("true");
      expect(evento?.autorId).toBe(admin.id);
    });

    it("não grava evento quando a marca já está acesa — trilha não se suja", async () => {
      const alvo = await criarDireto("Troca Idempotente F23", "LEITURA");
      await exigirNovaSenha(admin, alvo.id);
      const antes = await prisma.auditoriaEvento.count({ where: { entidadeId: alvo.id } });
      await exigirNovaSenha(admin, alvo.id);
      const depois = await prisma.auditoriaEvento.count({ where: { entidadeId: alvo.id } });
      expect(depois).toBe(antes);
    });

    it("recusa usuário inativo — quem não acessa não tem o que trocar", async () => {
      const alvo = await criarDireto("Troca Inativo F23", "LEITURA");
      await inativarUsuario(admin, alvo.id);
      await expect(exigirNovaSenha(admin, alvo.id)).rejects.toBeInstanceOf(ErroDeValidacao);
    });

    it("exige permissão de gestão de usuários", async () => {
      const alvo = await criarDireto("Troca RBAC F23", "LEITURA");
      await expect(
        exigirNovaSenha({ id: alvo.id, papel: "GESTOR" }, alvo.id),
      ).rejects.toBeInstanceOf(ErroDeAutorizacao);
    });

    /**
     * Este caso toca a BASE INTEIRA, e por isso restaura a base inteira.
     *
     * Aprendido de um defeito próprio: a primeira versão não restaurava, e os
     * usuários de desenvolvimento do seed ficaram com troca obrigatória acesa.
     * O efeito só apareceu depois, na suíte e2e: o login passava, a plataforma
     * conduzia à tela de troca, o shell não renderizava e SEIS testes de papéis
     * falhavam — nenhum deles com relação aparente com senha. Limpar apenas os
     * usuários descartáveis do próprio arquivo não basta quando o caso de uso,
     * por definição, alcança todo mundo.
     */
    it("em massa: alcança os ATIVOS, conta quantos, e não repete", async () => {
      const ativo = await criarDireto("Massa Ativo F23", "LEITURA");
      const inativo = await criarDireto("Massa Inativo F23", "LEITURA");
      await inativarUsuario(admin, inativo.id);

      // Quem estava livre da marca antes — é a esses que o estado será devolvido.
      const livresAntes = await prisma.usuario.findMany({
        where: { trocaSenhaObrigatoria: false },
        select: { id: true },
      });

      try {
        const { alcancados } = await exigirNovaSenhaDeTodos(admin);
        expect(alcancados).toBeGreaterThan(0);

        expect(
          (await prisma.usuario.findUniqueOrThrow({ where: { id: ativo.id } }))
            .trocaSenhaObrigatoria,
        ).toBe(true);
        // Inativo fica de fora: não acessa a plataforma, e a reativação já emite
        // credencial provisória com troca obrigatória.
        expect(
          (await prisma.usuario.findUniqueOrThrow({ where: { id: inativo.id } }))
            .trocaSenhaObrigatoria,
        ).toBe(false);

        // Rodar de novo não alcança ninguém — todos os ativos já estão marcados.
        expect((await exigirNovaSenhaDeTodos(admin)).alcancados).toBe(0);
      } finally {
        await prisma.usuario.updateMany({
          where: { id: { in: livresAntes.map((linha) => linha.id) } },
          data: { trocaSenhaObrigatoria: false },
        });
      }
    });
  });
});

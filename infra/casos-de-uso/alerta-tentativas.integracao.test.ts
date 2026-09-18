import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

import { provedorCredenciaisPrisma } from "@/infra/identidade/provedor-credenciais-prisma";
import { SISTEMA_AUTENTICACAO } from "@/infra/auditoria/usuario-de-sistema";
import { alterarPoliticaDeLogin } from "./configuracoes";
import { tentativasEmContasIsentas } from "./bloqueio-login";
import { type Ator } from "./contexto";

/**
 * A tentativa de acesso recusada passa a deixar rastro (RN49 + RN74).
 *
 * **O defeito que estes testes travam** foi verificado antes de ser corrigido:
 * o ramo de isenção do provedor devolvia a recusa sem tocar contador nenhum, e
 * o `registrarFalhaDeOrigem` que sobrava tem retorno antecipado com o bloqueio
 * por origem desligado — que é como ele nasce. Na configuração de entrega,
 * portanto, tentar senhas contra uma conta de Administrador **não deixava
 * rastro em lugar nenhum** e podia se repetir sem limite e sem prazo.
 *
 * Roda pelo **provedor de verdade**, e não pelas funções soltas: o que importa
 * aqui é o caminho que a autenticação real percorre. Fora de escopo de
 * requisição, `obterOrigemDaRequisicao` devolve `null` e a regra de origem não
 * se aplica — que é exatamente o cenário sem borda declarada.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const prisma = new PrismaClient();
const SUFIXO = "@alerta-tentativas.local";
const SENHA = "SenhaCorreta#2026";
const SENHA_ERRADA = "nao-e-a-senha";
const ID_SINGLETON = "portal";

let admin: Ator;

async function limpar() {
  const usuarios = await prisma.usuario.findMany({
    where: { OR: [{ email: { endsWith: SUFIXO } }, { email: SISTEMA_AUTENTICACAO.email }] },
    select: { id: true },
  });
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({
      where: { OR: [{ autorId: { in: ids } }, { entidadeId: { in: ids } }] },
    });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: ID_SINGLETON } });
}

async function criar(papel: "ADMIN" | "ANALISTA", nome: string) {
  return prisma.usuario.create({
    data: {
      nome,
      email: `${nome}${SUFIXO}`,
      senhaHash: await hash(SENHA, 10),
      papel,
      ativo: true,
      trocaSenhaObrigatoria: false,
    },
  });
}

/**
 * O ÚNICO alerta desta conta — falha se não houver exatamente um.
 *
 * `toHaveLength(1)` não estreita o tipo com `noUncheckedIndexedAccess`, e
 * indexar depois dele deixa `possibly undefined`. Este auxiliar afirma a
 * contagem e devolve o elemento já estreitado, em vez de espalhar `?.` pelas
 * asserções — que passariam calado se a lista viesse vazia.
 */
async function unicoAlertaDe(usuarioId: string) {
  const alertas = await alertasDe(usuarioId);
  expect(alertas).toHaveLength(1);
  const [alerta] = alertas;
  if (!alerta) throw new Error("esperado exatamente um alerta");
  return alerta;
}

/** Eventos de alerta gravados sobre esta conta, por autor de sistema. */
async function alertasDe(usuarioId: string) {
  return prisma.auditoriaEvento.findMany({
    where: { entidade: "usuario", entidadeId: usuarioId, campo: "tentativasDeAcesso" },
    orderBy: { criadoEm: "asc" },
  });
}

describe.skipIf(!temBanco)("Tentativas de acesso recusadas deixam rastro", () => {
  beforeEach(async () => {
    await limpar();
    const gestor = await prisma.usuario.findFirstOrThrow({ where: { papel: "ADMIN" } });
    admin = { id: gestor.id, papel: gestor.papel };
    // Limite baixo e explícito: o teste não pode depender do padrão vigente.
    await alterarPoliticaDeLogin(admin, { maxTentativas: 3, bloqueioMin: 15 });
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("a conta ISENTA conta as falhas e NUNCA é trancada", async () => {
    const isenta = await criar("ADMIN", "isenta-conta");

    for (let i = 0; i < 7; i += 1) {
      expect(
        await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA_ERRADA),
      ).toBeNull();
    }

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: isenta.id } });
    expect(depois.loginTentativas).toBe(7);
    // A garantia estrutural da RN74: nula, a conta isenta fica fora de toda
    // leitura de "está bloqueado" — inclusive da lista de contas a desbloquear,
    // que não filtra por isenção.
    expect(depois.loginBloqueadoAte).toBeNull();
  });

  it("e continua entrando com a senha certa, que é o ponto da isenção", async () => {
    const isenta = await criar("ADMIN", "isenta-entra");
    for (let i = 0; i < 10; i += 1) {
      await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA_ERRADA);
    }

    const sessao = await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA);
    expect(sessao).not.toBeNull();
    expect(sessao?.id).toBe(isenta.id);

    // O acesso zera o contador: é o que faz o número na tela significar
    // "falhas desde o último acesso".
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: isenta.id } });
    expect(depois.loginTentativas).toBe(0);
  });

  it("grava UM evento na travessia do limite, e não um por tentativa", async () => {
    const isenta = await criar("ADMIN", "isenta-evento");

    for (let i = 0; i < 30; i += 1) {
      await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA_ERRADA);
    }

    const alerta = await unicoAlertaDe(isenta.id);
    expect(alerta.valorNovo).toContain("isenta de bloqueio");
    // A mensagem precisa dizer que NÃO trancou — senão quem lê a trilha
    // conclui que a proteção agiu.
    expect(alerta.valorNovo).toContain("NÃO foi trancado");

    // O autor é a conta de sistema, nunca a própria vítima: atribuir a
    // autoria a ela diria, na trilha dela, que ela fez isso.
    const autor = await prisma.usuario.findUniqueOrThrow({ where: { id: alerta.autorId } });
    expect(autor.email).toBe(SISTEMA_AUTENTICACAO.email);
    expect(autor.ativo).toBe(false);
  });

  it("volta a poder gravar depois de um acesso bem-sucedido", async () => {
    const isenta = await criar("ADMIN", "isenta-rajadas");
    for (let rajada = 0; rajada < 2; rajada += 1) {
      for (let i = 0; i < 5; i += 1) {
        await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA_ERRADA);
      }
      await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA);
    }
    expect(await alertasDe(isenta.id)).toHaveLength(2);
  });

  it("a conta COMUM continua sendo trancada, e agora o bloqueio vai à trilha", async () => {
    const comum = await criar("ANALISTA", "comum-tranca");

    for (let i = 0; i < 3; i += 1) {
      await provedorCredenciaisPrisma.autenticarPorCredenciais(comum.email, SENHA_ERRADA);
    }

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: comum.id } });
    expect(depois.loginBloqueadoAte).not.toBeNull();
    // Trancada: nem a senha certa entra enquanto o prazo corre.
    expect(
      await provedorCredenciaisPrisma.autenticarPorCredenciais(comum.email, SENHA),
    ).toBeNull();

    const alerta = await unicoAlertaDe(comum.id);
    expect(alerta.valorNovo).toContain("foi trancado");
  });

  it("insistir numa conta já trancada não multiplica eventos", async () => {
    const comum = await criar("ANALISTA", "comum-insiste");
    for (let i = 0; i < 25; i += 1) {
      await provedorCredenciaisPrisma.autenticarPorCredenciais(comum.email, SENHA_ERRADA);
    }
    expect(await alertasDe(comum.id)).toHaveLength(1);
  });

  it("o número da faixa da T35 soma só as contas isentas", async () => {
    const isenta = await criar("ADMIN", "isenta-soma");
    const comum = await criar("ANALISTA", "comum-soma");

    for (let i = 0; i < 4; i += 1) {
      await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA_ERRADA);
    }
    for (let i = 0; i < 2; i += 1) {
      await provedorCredenciaisPrisma.autenticarPorCredenciais(comum.email, SENHA_ERRADA);
    }

    const soma = await tentativasEmContasIsentas();
    // A conta comum tem contador próprio e NÃO entra nesta soma — o número da
    // faixa fala só de quem nunca é trancado.
    const comumDepois = await prisma.usuario.findUniqueOrThrow({ where: { id: comum.id } });
    expect(comumDepois.loginTentativas).toBe(2);
    expect(soma).toBeGreaterThanOrEqual(4);
  });

  it("com o bloqueio DESLIGADO a conta isenta continua contando, e não há evento", async () => {
    await alterarPoliticaDeLogin(admin, { maxTentativas: 0, bloqueioMin: 15 });
    const isenta = await criar("ADMIN", "isenta-desligado");

    for (let i = 0; i < 6; i += 1) {
      await provedorCredenciaisPrisma.autenticarPorCredenciais(isenta.email, SENHA_ERRADA);
    }

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: isenta.id } });
    // O contador é o único sinal que resta com a política desligada, e ele
    // continua existindo — este é o caso em que ele mais importa.
    expect(depois.loginTentativas).toBe(6);
    // Sem limite configurado não há limite a cruzar, e inventar um aqui seria
    // escrever política em código.
    expect(await alertasDe(isenta.id)).toHaveLength(0);
  });
});

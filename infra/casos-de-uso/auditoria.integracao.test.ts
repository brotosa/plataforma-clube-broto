import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { COLUNAS_EXTRATO } from "@/dominio/auditoria/extrato";
import { consultarTrilha, eventosParaExtrato } from "@/infra/consultas/auditoria";
import type { Ator } from "./contexto";
import { exportarExtratoDeAuditoria } from "./auditoria";

/**
 * Integração da T28 (executa apenas com banco disponível): RN48 (somente
 * leitura, exportação restrita e AUDITADA — a meta-trilha) e RN49 (nenhuma
 * purga).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const prisma = new PrismaClient();
const SUFIXO = "@f13-auditoria.local";

let gestor: Ator;
let leitura: Ator;
let registroDeTeste = "";

async function criarUsuario(nome: string, papel: "GESTOR" | "LEITURA"): Promise<Ator> {
  const usuario = await prisma.usuario.upsert({
    where: { email: `${nome}${SUFIXO}` },
    update: {},
    create: {
      nome: `Perfil ${papel} (T28)`,
      email: `${nome}${SUFIXO}`,
      senhaHash: "sem-login",
      papel,
      trocaSenhaObrigatoria: false,
    },
  });
  return { id: usuario.id, papel: usuario.papel };
}

describe.skipIf(!temBanco)("T28 — consulta e extrato da auditoria (RN48, RN49)", () => {
  beforeAll(async () => {
    gestor = await criarUsuario("gestor", "GESTOR");
    leitura = await criarUsuario("leitura", "LEITURA");

    registroDeTeste = `registro-t28-${Date.now()}`;
    await prisma.auditoriaEvento.createMany({
      data: [
        {
          entidade: "empresa",
          entidadeId: registroDeTeste,
          campo: "nomeFantasia",
          valorAnterior: null,
          valorNovo: "Aliada de teste T28",
          autorId: gestor.id,
        },
        {
          entidade: "valor_regra",
          entidadeId: registroDeTeste,
          campo: "valor",
          valorAnterior: "90",
          valorNovo: "120",
          autorId: gestor.id,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: registroDeTeste } });
    await prisma.auditoriaEvento.deleteMany({
      where: { autorId: { in: [gestor.id, leitura.id] } },
    });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: SUFIXO } } });
    await prisma.$disconnect();
  });

  it("consulta paginada devolve o evento com autor, tipo e marcador de sensível", async () => {
    const pagina = await consultarTrilha({ registro: registroDeTeste });
    expect(pagina.total).toBeGreaterThanOrEqual(2);

    const parametro = pagina.eventos.find((evento) => evento.entidade === "valor_regra");
    expect(parametro?.sensivel).toBe(true);
    expect(parametro?.tipo).toBe("ALTERACAO");
    expect(parametro?.autorNome).toContain("GESTOR");

    const empresa = pagina.eventos.find((evento) => evento.entidade === "empresa");
    expect(empresa?.sensivel).toBe(false);
    expect(empresa?.tipo).toBe("CRIACAO");
  });

  it("a comparação antes → depois marca a diferença", async () => {
    const pagina = await consultarTrilha({ registro: registroDeTeste, entidade: "valor_regra" });
    const evento = pagina.eventos[0];
    expect(evento?.diferencas).toEqual([
      { rotulo: "valor", antes: "90", depois: "120", mudou: true },
    ]);
  });

  it("filtra por entidade, por tipo e por autor", async () => {
    expect(
      (await consultarTrilha({ registro: registroDeTeste, entidade: "empresa" })).total,
    ).toBe(1);
    expect(
      (await consultarTrilha({ registro: registroDeTeste, tipo: "CRIACAO" })).total,
    ).toBe(1);
    const porAutor = await consultarTrilha({ registro: registroDeTeste, autorId: gestor.id });
    expect(porAutor.total).toBeGreaterThanOrEqual(2);
    expect(
      (await consultarTrilha({ registro: registroDeTeste, autorId: leitura.id })).total,
    ).toBe(0);
  });

  // ---- RN48: exportação restrita ----
  it("recusa a exportação do extrato a quem não é Gestor nem Administrador", async () => {
    await expect(
      exportarExtratoDeAuditoria(leitura, { registro: registroDeTeste }),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });

  it("exporta o extrato com cabeçalho e a natureza do evento sensível", async () => {
    const extrato = await exportarExtratoDeAuditoria(gestor, { registro: registroDeTeste });
    const linhas = extrato.csv.trimEnd().split("\n");
    expect(linhas[0]).toBe(COLUNAS_EXTRATO.join(";"));
    expect(extrato.linhas).toBeGreaterThanOrEqual(2);
    expect(extrato.csv).toContain("PARAMETRO");
    expect(extrato.nomeArquivo).toMatch(/^extrato-auditoria-.*\.csv$/);
  });

  // ---- RN48: a meta-trilha ----
  it("a EXPORTAÇÃO gera o próprio evento de auditoria (meta-trilha)", async () => {
    const antes = await prisma.auditoriaEvento.count({
      where: { entidade: "exportacao_auditoria" },
    });

    const extrato = await exportarExtratoDeAuditoria(gestor, { registro: registroDeTeste });

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "exportacao_auditoria", entidadeId: extrato.nomeArquivo },
    });
    expect(eventos.length).toBeGreaterThan(0);
    expect(
      await prisma.auditoriaEvento.count({ where: { entidade: "exportacao_auditoria" } }),
    ).toBe(antes + eventos.length);

    // O evento diz quem, com que filtros e quantas linhas levou.
    const serializado = JSON.stringify(eventos);
    expect(eventos.every((evento) => evento.autorId === gestor.id)).toBe(true);
    expect(serializado).toContain(registroDeTeste);
    expect(serializado).toContain("auditoria externa");
  });

  it("o evento da exportação é ele próprio sensível na consulta seguinte", async () => {
    const extrato = await exportarExtratoDeAuditoria(gestor, { registro: registroDeTeste });
    const pagina = await consultarTrilha({ registro: extrato.nomeArquivo });
    expect(pagina.eventos.length).toBeGreaterThan(0);
    expect(pagina.eventos.every((evento) => evento.sensivel)).toBe(true);
    expect(pagina.eventos.every((evento) => evento.tipo === "EXPORTACAO")).toBe(true);
  });

  // ---- RN49: nada é apagado ----
  it("consultar e exportar não removem nem alteram nenhum evento", async () => {
    const antes = await prisma.auditoriaEvento.count();
    await consultarTrilha({});
    await eventosParaExtrato({ registro: registroDeTeste });
    // A consulta não mexe em nada; a exportação só ACRESCENTA o evento dela.
    expect(await prisma.auditoriaEvento.count()).toBe(antes);

    await exportarExtratoDeAuditoria(gestor, { registro: registroDeTeste });
    expect(await prisma.auditoriaEvento.count()).toBeGreaterThan(antes);
  });
});

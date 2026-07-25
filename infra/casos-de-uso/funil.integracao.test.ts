import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeValidacao } from "./contexto";
import {
  adicionarNotaRapida,
  descartarEmpresa,
  entrarNoRadar,
  handoffParaNegociacao,
  moverNoFunil,
  reativarDescartada,
  registrarNegociacao,
} from "./funil";
import {
  aplicarMapeamentoProspects,
  efetivarImportacaoProspects,
  iniciarImportacaoProspects,
} from "./carga-prospects";
import { funilDeMercado } from "@/infra/consultas/funil";

/**
 * Jornada do funil da F6 em nível de serviço (exige banco com seed):
 * entrada no radar (RN13) → assumir avaliação (RN14) → priorizar →
 * handoff com comercial designado (RN16) → registro de negociação →
 * descarte tipificado e reativação (RN17) — mais a importação de lista
 * (T9) com mapeamento configurado e deduplicação por CNPJ/nome.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("funil de mercado — casos de uso integrados (F6)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let scout: { id: string; papel: "ANALISTA_SCOUT" };
  let comercial: { id: string; papel: "COMERCIAL" };
  let leitura: { id: string; papel: "LEITURA" };
  let empresaId = "";

  async function limparDadosDeTeste() {
    await prisma.stagingEmpresa.deleteMany({});
    await prisma.importacao.deleteMany({ where: { tipo: "CARGA_PROSPECTS" } });
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-F6]" } },
    });
    const ids = empresas.map((empresa) => empresa.id);
    await prisma.notaRapida.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.registroNegociacao.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: { in: ["nota_rapida", "registro_negociacao"] } },
    });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    const porPapel = (papel: string) => {
      const usuario = usuarios.find((u) => u.papel === papel);
      if (!usuario) throw new Error(`Seed ausente: usuário ${papel}`);
      return usuario;
    };
    gestor = { id: porPapel("GESTOR").id, papel: "GESTOR" };
    scout = { id: porPapel("ANALISTA_SCOUT").id, papel: "ANALISTA_SCOUT" };
    comercial = { id: porPapel("COMERCIAL").id, papel: "COMERCIAL" };
    leitura = { id: porPapel("LEITURA").id, papel: "LEITURA" };
    await limparDadosDeTeste();
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("entrada no radar sem origem ou sem categoria é recusada (RN13)", async () => {
    const categoria = await prisma.categoria.findFirstOrThrow();
    await expect(
      entrarNoRadar(scout, {
        nomeFantasia: "[TESTE-F6] Sem Origem",
        origem: null,
        categoriaIds: [categoria.id],
      }),
    ).rejects.toThrow(/RN13/);
    await expect(
      entrarNoRadar(scout, {
        nomeFantasia: "[TESTE-F6] Sem Categoria",
        origem: "INDICACAO",
        categoriaIds: [],
      }),
    ).rejects.toThrow(/RN13/);
  });

  it("papel Leitura não inclui empresa no radar (RBAC ficha Onda 2 §2)", async () => {
    const categoria = await prisma.categoria.findFirstOrThrow();
    await expect(
      entrarNoRadar(leitura, {
        nomeFantasia: "[TESTE-F6] Bloqueada",
        origem: "INDICACAO",
        categoriaIds: [categoria.id],
      }),
    ).rejects.toThrow(/não tem permissão/);
  });

  it("scout inclui empresa no radar como Mapeada, com data e auditoria", async () => {
    const categoria = await prisma.categoria.findFirstOrThrow();
    const empresa = await entrarNoRadar(scout, {
      nomeFantasia: "[TESTE-F6] Empresa do Funil",
      site: "https://exemplo-funil.teste",
      origem: "SCOUTING_ATIVO",
      categoriaIds: [categoria.id],
    });
    empresaId = empresa.id;
    expect(empresa.estagio).toBe("MAPEADA");
    expect(empresa.dataEntradaRadar).not.toBeNull();
    expect(empresa.estagioDesde).not.toBeNull();
    const trilha = await prisma.auditoriaEvento.findMany({
      where: { entidade: "empresa", entidadeId: empresaId },
    });
    expect(trilha.some((evento) => evento.campo === "estagio")).toBe(true);
  });

  it("assumir a avaliação move para Em avaliação e atribui o responsável de scout (RN14)", async () => {
    const empresa = await moverNoFunil(scout, empresaId, "EM_AVALIACAO");
    expect(empresa.estagio).toBe("EM_AVALIACAO");
    expect(empresa.responsavelScoutId).toBe(scout.id);
  });

  it("comercial não assume avaliação (matriz da ficha §2)", async () => {
    await expect(moverNoFunil(comercial, empresaId, "MAPEADA")).rejects.toThrow(
      /não tem permissão/,
    );
  });

  it("mover fora do pipeline é recusado (sem pular estágio)", async () => {
    await expect(moverNoFunil(scout, empresaId, "EM_AVALIACAO")).rejects.toThrow(
      ErroDeValidacao,
    );
  });

  it("scout prioriza (decisão humana explícita; RN15 completa na F7)", async () => {
    const empresa = await moverNoFunil(scout, empresaId, "PRIORIZADA");
    expect(empresa.estagio).toBe("PRIORIZADA");
  });

  it("handoff sem comercial designado é recusado (RN16)", async () => {
    await expect(handoffParaNegociacao(gestor, empresaId, "")).rejects.toThrow(/RN16/);
  });

  it("scout não conclui o handoff: designação é do Gestor ou o Comercial assume (RN16)", async () => {
    await expect(
      handoffParaNegociacao(scout, empresaId, comercial.id),
    ).rejects.toThrow(/não tem permissão/);
  });

  it("comercial assume a negociação e vira responsável comercial (RN16)", async () => {
    const empresa = await handoffParaNegociacao(comercial, empresaId, comercial.id);
    expect(empresa.estagio).toBe("EM_NEGOCIACAO");
    expect(empresa.responsavelComercialId).toBe(comercial.id);
  });

  it("designado sem alçada de negociação é recusado (ficha §2)", async () => {
    const voltar = await moverNoFunil(gestor, empresaId, "PRIORIZADA");
    expect(voltar.estagio).toBe("PRIORIZADA");
    await expect(
      handoffParaNegociacao(gestor, empresaId, leitura.id),
    ).rejects.toThrow(/time Comercial/);
    await handoffParaNegociacao(gestor, empresaId, comercial.id);
  });

  it("registro de negociação e nota rápida entram no histórico com auditoria", async () => {
    const registro = await registrarNegociacao(comercial, empresaId, {
      data: new Date("2026-07-25T00:00:00Z"),
      tipo: "REUNIAO",
      nota: "[TESTE-F6] Primeira conversa registrada.",
    });
    expect(registro.tipo).toBe("REUNIAO");
    const nota = await adicionarNotaRapida(scout, empresaId, "[TESTE-F6] Nota do scout.");
    expect(nota.texto).toContain("Nota do scout");
    const eventos = await prisma.auditoriaEvento.count({
      where: {
        entidade: { in: ["registro_negociacao", "nota_rapida"] },
        entidadeId: { in: [registro.id, nota.id] },
      },
    });
    expect(eventos).toBeGreaterThanOrEqual(2);
  });

  it("descarte exige motivo tipificado; OUTRO exige descrição (RN17)", async () => {
    const outro = await prisma.motivoDescarte.findUniqueOrThrow({ where: { slug: "OUTRO" } });
    await expect(
      descartarEmpresa(comercial, empresaId, {
        motivoDescarteId: outro.id,
        descricao: null,
        comentario: null,
      }),
    ).rejects.toThrow(/descrição/);
  });

  it("comercial descarta a negociação que conduz; auditoria guarda antes/depois", async () => {
    const recusou = await prisma.motivoDescarte.findUniqueOrThrow({
      where: { slug: "RECUSOU_CONDICOES" },
    });
    const empresa = await descartarEmpresa(comercial, empresaId, {
      motivoDescarteId: recusou.id,
      descricao: null,
      comentario: "[TESTE-F6] Condições comerciais recusadas.",
    });
    expect(empresa.estagio).toBe("DESCARTADA");
    const evento = await prisma.auditoriaEvento.findFirstOrThrow({
      where: { entidade: "empresa", entidadeId: empresaId, campo: "estagio" },
      orderBy: { criadoEm: "desc" },
    });
    expect(evento.valorAnterior).toBe("EM_NEGOCIACAO");
    expect(evento.valorNovo).toBe("DESCARTADA");
  });

  it("reativação volta a Mapeada limpando motivo e responsáveis, com histórico intacto (RN17)", async () => {
    const notasAntes = await prisma.notaRapida.count({ where: { empresaId } });
    const registrosAntes = await prisma.registroNegociacao.count({ where: { empresaId } });
    const empresa = await reativarDescartada(scout, empresaId);
    expect(empresa.estagio).toBe("MAPEADA");
    expect(empresa.motivoDescarteId).toBeNull();
    expect(empresa.responsavelScoutId).toBeNull();
    expect(empresa.responsavelComercialId).toBeNull();
    expect(await prisma.notaRapida.count({ where: { empresaId } })).toBe(notasAntes);
    expect(await prisma.registroNegociacao.count({ where: { empresaId } })).toBe(registrosAntes);
  });

  it("consulta do funil agrupa por lane, conta e expõe a régua de dias", async () => {
    const { lanes, contadores, tabela } = await funilDeMercado({});
    const mapeada = lanes.find((lane) => lane.estagio === "MAPEADA");
    expect(mapeada?.cards.some((card) => card.id === empresaId)).toBe(true);
    expect(contadores.identificadas).toBeGreaterThanOrEqual(1);
    const card = tabela.find((linha) => linha.id === empresaId);
    expect(card?.score).toBeNull();
    expect(card?.rotuloDias).toBe("hoje");
  });

  it("importação T9: mapeamento configurado, deduplicação e efetivação como Mapeada", async () => {
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { slug: "TECNOLOGIA_E_SOFTWARE" },
    });
    const csv = [
      "Empresa;Site;Segmento",
      `[TESTE-F6] Prospect Novo;https://prospect-novo.teste;${categoria.nome}`,
      `[TESTE-F6] Empresa do Funil;;${categoria.nome}`, // já está no radar
      `[TESTE-F6] Sem Categoria Valida;;Segmento Desconhecido`,
      `[TESTE-F6] Prospect Novo;;${categoria.nome}`, // duplicada na lista
    ].join("\n");

    const inicio = await iniciarImportacaoProspects(
      scout,
      "prospects-teste-f6.csv",
      Buffer.from(csv, "utf-8"),
    );
    expect(inicio.totalLinhas).toBe(4);
    expect(inicio.sugestaoMapeamento["Empresa"]).toBe("NOME");

    const resumo = await aplicarMapeamentoProspects(scout, inicio.importacaoId, {
      Empresa: "NOME",
      Site: "SITE",
      Segmento: "CATEGORIA",
    });
    expect(resumo.novas).toBe(1);
    expect(resumo.jaNoRadar).toBe(1);
    expect(resumo.recusadas.map((linha) => linha.motivo).join(" ")).toMatch(/RN13/);

    const { empresasCriadas } = await efetivarImportacaoProspects(scout, inicio.importacaoId);
    expect(empresasCriadas).toBe(1);
    const criada = await prisma.empresa.findFirstOrThrow({
      where: { nomeFantasia: "[TESTE-F6] Prospect Novo" },
      include: { categorias: true },
    });
    expect(criada.estagio).toBe("MAPEADA");
    expect(criada.origem).toBe("LISTA_IMPORTADA");
    expect(criada.categorias).toHaveLength(1);
  });

  it("reimportar a mesma lista deduplica contra o que acabou de entrar", async () => {
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { slug: "TECNOLOGIA_E_SOFTWARE" },
    });
    const csv = `Empresa;Segmento\n[TESTE-F6] Prospect Novo;${categoria.nome}\n`;
    const inicio = await iniciarImportacaoProspects(
      scout,
      "prospects-teste-f6-reimportacao.csv",
      Buffer.from(csv, "utf-8"),
    );
    const resumo = await aplicarMapeamentoProspects(scout, inicio.importacaoId, {
      Empresa: "NOME",
      Segmento: "CATEGORIA",
    });
    expect(resumo.novas).toBe(0);
    expect(resumo.jaNoRadar).toBe(1);
    await expect(
      efetivarImportacaoProspects(scout, inicio.importacaoId),
    ).rejects.toThrow(/Nenhuma linha nova/);
  });
});

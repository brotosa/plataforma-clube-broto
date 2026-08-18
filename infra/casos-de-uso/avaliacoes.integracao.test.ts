import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeValidacao } from "./contexto";
import { fecharAvaliacao, iniciarAvaliacao, salvarNotas } from "./avaliacoes";
import { entrarNoRadar, moverNoFunil } from "./funil";
import { telaAvaliacao } from "@/infra/consultas/avaliacoes";

/**
 * Jornada da avaliação da F7 em nível de serviço (exige banco com seed):
 * assumir (RN14) → rascunho v1 → notas 1–5 com evidência → RN15 barra a
 * priorização sem fechada → fechamento congela score e recomenda →
 * priorização passa → nova versão pré-preenchida (RN18) → v1 imutável.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("avaliação de scout — casos de uso integrados (F7)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let scout: { id: string; papel: "ANALISTA_SCOUT" };
  let comercial: { id: string; papel: "COMERCIAL" };
  let empresaId = "";
  let avaliacaoV1Id = "";
  let presencaGeografica = { id: "", peso: 1 };
  let canaisDistribuicao = { id: "", peso: 1 };
  let culturasAtendidas = { id: "", peso: 1 };

  async function limparDadosDeTeste() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-F7]" } },
    });
    const ids = empresas.map((empresa) => empresa.id);
    const avaliacoes = await prisma.avaliacaoScout.findMany({
      where: { empresaId: { in: ids } },
    });
    const avaliacaoIds = avaliacoes.map((avaliacao) => avaliacao.id);
    await prisma.avaliacaoNota.deleteMany({ where: { avaliacaoId: { in: avaliacaoIds } } });
    await prisma.avaliacaoScout.deleteMany({ where: { id: { in: avaliacaoIds } } });
    await prisma.auditoriaEvento.deleteMany({
      where: {
        OR: [
          { entidadeId: { in: ids } },
          { entidade: "avaliacao_scout", entidadeId: { in: avaliacaoIds } },
          { entidade: "avaliacao_nota" },
        ],
      },
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

    const porSlug = async (slug: string) => {
      const indicador = await prisma.indicador.findUniqueOrThrow({ where: { slug } });
      return { id: indicador.id, peso: Number(indicador.peso) };
    };
    presencaGeografica = await porSlug("PRESENCA_GEOGRAFICA_UFS_ATENDIDAS");
    canaisDistribuicao = await porSlug("CANAIS_E_PARCERIAS_DE_DISTRIBUICAO");
    culturasAtendidas = await porSlug("CULTURAS_ATENDIDAS");

    await limparDadosDeTeste();
    const categoria = await prisma.categoria.findFirstOrThrow();
    const empresa = await entrarNoRadar(scout, {
      nomeFantasia: "[TESTE-F7] Empresa Avaliada",
      origem: "SCOUTING_ATIVO",
      categoriaIds: [categoria.id],
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("empresa Mapeada não abre avaliação: primeiro assumir (RN14)", async () => {
    await expect(iniciarAvaliacao(scout, empresaId)).rejects.toThrow(/RN14/);
  });

  it("comercial não avalia (matriz da ficha §2)", async () => {
    await moverNoFunil(scout, empresaId, "EM_AVALIACAO");
    await expect(iniciarAvaliacao(comercial, empresaId)).rejects.toThrow(
      /não tem permissão/,
    );
  });

  it("scout abre a versão 1 vazia e a reabertura devolve o mesmo rascunho", async () => {
    const rascunho = await iniciarAvaliacao(scout, empresaId);
    avaliacaoV1Id = rascunho.id;
    expect(rascunho.versao).toBe(1);
    expect(rascunho.status).toBe("RASCUNHO");
    expect(rascunho.notas).toHaveLength(0);
    const mesma = await iniciarAvaliacao(gestor, empresaId);
    expect(mesma.id).toBe(avaliacaoV1Id);
  });

  it("nota fora da escala 1–5 é recusada", async () => {
    await expect(
      salvarNotas(scout, avaliacaoV1Id, [
        { indicadorId: presencaGeografica.id, nota: 6 },
      ]),
    ).rejects.toThrow(/escala/);
    await expect(
      salvarNotas(scout, avaliacaoV1Id, [
        { indicadorId: presencaGeografica.id, nota: 0 },
      ]),
    ).rejects.toThrow(ErroDeValidacao);
  });

  it("fechar sem nenhuma nota é recusado", async () => {
    await expect(fecharAvaliacao(scout, avaliacaoV1Id, "AVANCAR")).rejects.toThrow(
      /ao menos uma nota/,
    );
  });

  it("notas com evidência são gravadas e auditadas por indicador", async () => {
    await salvarNotas(scout, avaliacaoV1Id, [
      {
        indicadorId: presencaGeografica.id,
        nota: 4,
        evidencia: "[TESTE-F7] Atende 12 UFs segundo o site institucional.",
      },
      { indicadorId: canaisDistribuicao.id, nota: 2 },
      { indicadorId: culturasAtendidas.id, nota: 5 },
    ]);
    const notas = await prisma.avaliacaoNota.findMany({
      where: { avaliacaoId: avaliacaoV1Id },
    });
    expect(notas).toHaveLength(3);
    const eventos = await prisma.auditoriaEvento.count({
      where: { entidade: "avaliacao_nota", entidadeId: { in: notas.map((n) => n.id) } },
    });
    expect(eventos).toBeGreaterThanOrEqual(3);
  });

  it("priorizar antes de fechar a avaliação é barrado (RN15)", async () => {
    await expect(moverNoFunil(scout, empresaId, "PRIORIZADA")).rejects.toThrow(/RN15/);
  });

  it("fechar sem recomendação é recusado", async () => {
    await expect(fecharAvaliacao(scout, avaliacaoV1Id, null)).rejects.toThrow(
      /recomendação/,
    );
  });

  it("fechamento congela subtotais e total e atualiza o score da empresa", async () => {
    const fechada = await fecharAvaliacao(scout, avaliacaoV1Id, "AVANCAR");
    expect(fechada.status).toBe("FECHADA");
    // Capilaridade: (4+2)/2 × 20 = 60 · Fit de Negócio: 5 × 20 = 100 →
    // total (pesos v1 = 1) = (60+100)/2 = 80.
    expect(fechada.total).toBe(80);
    expect(fechada.recomendacao).toBe("AVANCAR");
    expect(fechada.fechadaEm).not.toBeNull();

    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.scoreScouting).toBe(80);
    expect(empresa.estagio).toBe("EM_AVALIACAO"); // fechar NÃO move no funil (RN15)

    const eventoScore = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "empresa", entidadeId: empresaId, campo: "scoreScouting" },
    });
    expect(eventoScore?.valorNovo).toBe("80");
  });

  it("avaliação fechada é imutável: nota e novo fechamento são recusados (RN18)", async () => {
    await expect(
      salvarNotas(scout, avaliacaoV1Id, [{ indicadorId: presencaGeografica.id, nota: 5 }]),
    ).rejects.toThrow(/RN18/);
    await expect(fecharAvaliacao(scout, avaliacaoV1Id, "MONITORAR")).rejects.toThrow(/RN18/);
  });

  it("com avaliação fechada a priorização passa — decisão humana explícita (RN15)", async () => {
    const empresa = await moverNoFunil(scout, empresaId, "PRIORIZADA");
    expect(empresa.estagio).toBe("PRIORIZADA");
  });

  it("corrigir abre a versão 2 pré-preenchida com as notas da fechada (RN18)", async () => {
    const v2 = await iniciarAvaliacao(scout, empresaId);
    expect(v2.versao).toBe(2);
    expect(v2.status).toBe("RASCUNHO");
    expect(v2.notas).toHaveLength(3);
    const copiada = v2.notas.find((n) => n.indicadorId === presencaGeografica.id);
    expect(copiada?.nota).toBe(4);
    expect(copiada?.evidencia).toContain("12 UFs");

    await salvarNotas(scout, v2.id, [{ indicadorId: canaisDistribuicao.id, nota: 4 }]);
    const v2Fechada = await fecharAvaliacao(gestor, v2.id, "AVANCAR");
    // Capilaridade: (4+4)/2 × 20 = 80 · Fit: 100 → total 90.
    expect(v2Fechada.total).toBe(90);

    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.scoreScouting).toBe(90);

    const v1 = await prisma.avaliacaoScout.findUniqueOrThrow({
      where: { id: avaliacaoV1Id },
    });
    expect(v1.total).toBe(80); // histórico íntegro — versão 1 não re-pontua
    expect(v1.recomendacao).toBe("AVANCAR");
  });

  it("consulta da T10 agrupa por dimensão canônica e traz o histórico para comparação", async () => {
    const tela = await telaAvaliacao(empresaId);
    expect(tela).not.toBeNull();
    expect(tela!.empresa.scoreScouting).toBe(90);
    expect(tela!.podeAvaliarAgora).toBe(true);
    expect(tela!.rascunho).toBeNull();
    expect(tela!.fechadas.map((f) => f.versao)).toEqual([2, 1]);
    expect(tela!.fechadas[0]!.subtotais.length).toBeGreaterThanOrEqual(2);

    // 14 dimensões com indicadores ativos do seed (9 Empresa + 5 Produto)
    expect(tela!.dimensoes).toHaveLength(14);
    expect(tela!.dimensoes[0]!.dimensao).toBe("Capilaridade");
    const totalIndicadores = tela!.dimensoes.reduce(
      (soma, d) => soma + d.indicadores.length,
      0,
    );
    expect(totalIndicadores).toBe(23);
  });

  it("consulta de empresa inexistente devolve null (estado de erro da tela)", async () => {
    expect(await telaAvaliacao("id-inexistente")).toBeNull();
  });

  // "Não se aplica" (acréscimo pós-homologação): resposta sem nota, fora da
  // média do score. Cada teste abre sua própria empresa para não interferir
  // na jornada acima; a limpeza cobre pelo prefixo [TESTE-F7].
  async function novaEmpresaEmAvaliacao(sufixo: string) {
    const categoria = await prisma.categoria.findFirstOrThrow();
    const empresa = await entrarNoRadar(scout, {
      nomeFantasia: `[TESTE-F7] N/A ${sufixo}`,
      origem: "SCOUTING_ATIVO",
      categoriaIds: [categoria.id],
    });
    await moverNoFunil(scout, empresa.id, "EM_AVALIACAO");
    const rascunho = await iniciarAvaliacao(scout, empresa.id);
    return { empresaId: empresa.id, avaliacaoId: rascunho.id };
  }

  it("N/A é gravado com nota nula e sai da média — não é tratado como 0", async () => {
    const { empresaId: alvo, avaliacaoId } = await novaEmpresaEmAvaliacao("exclui");
    // Capilaridade: uma nota real 4 + um N/A · Fit de Negócio: dimensão só N/A.
    await salvarNotas(scout, avaliacaoId, [
      { indicadorId: presencaGeografica.id, nota: 4 },
      { indicadorId: canaisDistribuicao.id, nota: null, naoSeAplica: true },
      { indicadorId: culturasAtendidas.id, nota: null, naoSeAplica: true },
    ]);

    // Persistência: o N/A vira linha com nota NULL e naoSeAplica=true.
    const canais = await prisma.avaliacaoNota.findFirstOrThrow({
      where: { avaliacaoId, indicadorId: canaisDistribuicao.id },
    });
    expect(canais.nota).toBeNull();
    expect(canais.naoSeAplica).toBe(true);

    const fechada = await fecharAvaliacao(scout, avaliacaoId, "AVANCAR");
    // Capilaridade = só a nota real 4 → 4 × 20 = 80 (o N/A não vira 0; se
    // virasse, a média cairia para (4+0)/2 × 20 = 40). Fit de Negócio, só N/A,
    // fica fora do total. Total = 80.
    expect(fechada.total).toBe(80);

    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: alvo } });
    expect(empresa.scoreScouting).toBe(80);

    // A dimensão inteiramente N/A não aparece nos subtotais congelados.
    const tela = await telaAvaliacao(alvo);
    const dimensoesPontuadas = tela!.fechadas[0]!.subtotais.map((s) => s.dimensao);
    expect(dimensoesPontuadas).toContain("Capilaridade");
    expect(dimensoesPontuadas).not.toContain("Fit de Negócio");
  });

  it("avaliação só com N/A não fecha — sem nota real não há score (RN15)", async () => {
    const { avaliacaoId } = await novaEmpresaEmAvaliacao("so-na");
    await salvarNotas(scout, avaliacaoId, [
      { indicadorId: presencaGeografica.id, nota: null, naoSeAplica: true },
      { indicadorId: culturasAtendidas.id, nota: null, naoSeAplica: true },
    ]);
    await expect(fecharAvaliacao(scout, avaliacaoId, "MONITORAR")).rejects.toThrow(
      /ao menos uma nota/,
    );
  });

  it("o pré-preenchimento da nova versão preserva o N/A da anterior (RN18)", async () => {
    const { empresaId: alvo, avaliacaoId } = await novaEmpresaEmAvaliacao("copia");
    await salvarNotas(scout, avaliacaoId, [
      { indicadorId: presencaGeografica.id, nota: 3 },
      { indicadorId: canaisDistribuicao.id, nota: null, naoSeAplica: true },
    ]);
    await fecharAvaliacao(scout, avaliacaoId, "AVANCAR");

    const v2 = await iniciarAvaliacao(scout, alvo);
    const canaisCopiado = v2.notas.find((n) => n.indicadorId === canaisDistribuicao.id);
    expect(canaisCopiado?.naoSeAplica).toBe(true);
    expect(canaisCopiado?.nota).toBeNull();
  });
});

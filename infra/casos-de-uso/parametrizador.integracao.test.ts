import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeValidacao } from "./contexto";
import {
  alterarValorDeRegra,
  apurarUsos,
  atualizarItemDeLista,
  criarItemDeLista,
  criarMeta,
  definirEstadoDoItem,
} from "./parametrizador";
import { decidirSolicitacao, configurarRegraAprovacao } from "./aprovacoes";
import { fecharAvaliacao, iniciarAvaliacao, salvarNotas } from "./avaliacoes";
import { entrarNoRadar, moverNoFunil } from "./funil";
import { funilDeMercado } from "@/infra/consultas/funil";
import {
  invalidarCacheDeConfiguracao,
  lerRegua,
  lerValor,
} from "@/infra/configuracao/servico-configuracao";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";

/**
 * Parametrizador em nível de serviço (exige banco com seed).
 *
 * O teste central desta fase é o de regressão exigido pelo prompt: alterar
 * uma régua muda o comportamento vivo das telas SEM retroagir sobre
 * registros fechados (RN25). Junto dele, a segregação da RN23, a contagem
 * de uso da RN24, a não-sobreposição da RN28 e o ciclo completo da RN27 —
 * ligar a regra na T7, a escrita virar solicitação e a aprovação aplicar.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("Parametrizador — casos de uso integrados (F10)", () => {
  const prisma = new PrismaClient();
  const PREFIXO = "[TESTE-F10]";

  let administrador: { id: string; papel: "ADMINISTRADOR_PLATAFORMA" };
  let outroAdministrador: { id: string; papel: "ADMINISTRADOR_PLATAFORMA" };
  let gestor: { id: string; papel: "GESTOR" };
  let scout: { id: string; papel: "ANALISTA_SCOUT" };
  let aprovador: { id: string; papel: "APROVADOR" };
  let indicador = { id: "", nome: "", peso: 1 };

  /** Devolve as réguas ao estado de implantação — outras suítes as leem. */
  async function restaurarReguas() {
    for (const [chave, valor] of [
      ["FUNIL_ENVELHECIMENTO_LEVE_DIAS", 14],
      ["FUNIL_ENVELHECIMENTO_FORTE_DIAS", 30],
      ["OFERTA_SEM_RESGATE_DIAS", 90],
      ["OFERTA_VIGENCIA_A_VENCER_DIAS", 15],
      ["REAVALIACAO_MESES", 12],
      ["COMISSAO_PADRAO_PCT", 5],
    ] as const) {
      await prisma.valorRegra.update({ where: { chave }, data: { valor } });
    }
    invalidarCacheDeConfiguracao();
  }

  async function limparDadosDeTeste() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: PREFIXO } },
    });
    const ids = empresas.map((empresa) => empresa.id);
    const avaliacoes = await prisma.avaliacaoScout.findMany({ where: { empresaId: { in: ids } } });
    const avaliacaoIds = avaliacoes.map((avaliacao) => avaliacao.id);
    await prisma.avaliacaoNota.deleteMany({ where: { avaliacaoId: { in: avaliacaoIds } } });
    await prisma.avaliacaoScout.deleteMany({ where: { id: { in: avaliacaoIds } } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });

    await prisma.aprovacaoSolicitacao.deleteMany({ where: { tipoEntidade: "PARAMETRO_SENSIVEL" } });
    await prisma.metaPeriodo.deleteMany({ where: { periodo: { in: ["MENSAL", "TRIMESTRAL"] } } });
    const criadas = await prisma.cultura.findMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.cultura.deleteMany({ where: { id: { in: criadas.map((c) => c.id) } } });
    await prisma.auditoriaEvento.deleteMany({
      where: {
        OR: [
          { entidadeId: { in: ids } },
          { entidade: "valor_regra" },
          { entidade: "meta" },
          { entidade: "cultura" },
          { entidade: "indicador" },
        ],
      },
    });
    await prisma.configuracaoVersao.deleteMany({ where: { numero: { gt: 1 } } });
    await restaurarReguas();
    await configurarRegraAprovacao(gestor, "PARAMETRO_SENSIVEL", { exigida: false });
  }

  beforeAll(async () => {
    const buscar = async (email: string) =>
      prisma.usuario.findUniqueOrThrow({ where: { email }, select: { id: true, papel: true } });
    administrador = (await buscar("administrador@dev.clubebroto.local")) as typeof administrador;
    gestor = (await buscar("gestor@dev.clubebroto.local")) as typeof gestor;
    scout = (await buscar("scout@dev.clubebroto.local")) as typeof scout;
    aprovador = (await buscar("aprovador@dev.clubebroto.local")) as typeof aprovador;
    // Segundo administrador: a RN06 impede que quem solicita aprove.
    const segundo = await prisma.usuario.upsert({
      where: { email: "administrador2@dev.clubebroto.local" },
      update: { papel: "ADMINISTRADOR_PLATAFORMA" },
      create: {
        nome: `${PREFIXO} Administrador auxiliar`,
        email: "administrador2@dev.clubebroto.local",
        senhaHash: "sem-login",
        papel: "ADMINISTRADOR_PLATAFORMA",
      },
      select: { id: true, papel: true },
    });
    outroAdministrador = segundo as typeof outroAdministrador;

    const primeiro = await prisma.indicador.findFirstOrThrow({ orderBy: { ordem: "asc" } });
    indicador = { id: primeiro.id, nome: primeiro.nome, peso: Number(primeiro.peso) };
    await limparDadosDeTeste();
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    // Restaura NOME e peso: a suíte renomeia o indicador para provar que
    // renomear não versiona, e o nome original é o que a suíte e2e da F7
    // procura na T10. Deixar o nome de teste no banco quebraria a F7.
    await prisma.indicador.update({
      where: { id: indicador.id },
      data: { nome: indicador.nome, peso: indicador.peso },
    });
    await prisma.$disconnect();
  });

  it("RN23 — só o Administrador da Plataforma escreve; os demais leem", async () => {
    await expect(
      alterarValorDeRegra(gestor, "OFERTA_SEM_RESGATE_DIAS", 60),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
    await expect(criarMeta(gestor, {
      periodo: "MENSAL",
      referencia: new Date("2026-03-10T00:00:00Z"),
      categoriaId: null,
      valor: 3,
    })).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });

  it("RN25 — régua alterada muda o funil vivo sem retroagir sobre a avaliação fechada", async () => {
    // Uma empresa parada há 5 dias no estágio: com a régua de implantação
    // (14/30) ela não tem alerta nenhum.
    const categoria = await prisma.categoria.findFirstOrThrow({ orderBy: { ordem: "asc" } });
    const empresa = await entrarNoRadar(scout, {
      nomeFantasia: `${PREFIXO} Envelhecimento`,
      origem: "SCOUTING_ATIVO",
      categoriaIds: [categoria.id],
    });
    await moverNoFunil(scout, empresa.id, "EM_AVALIACAO");
    const cincoDiasAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.empresa.update({
      where: { id: empresa.id },
      data: { estagioDesde: cincoDiasAtras },
    });

    // Avaliação fechada ANTES da mudança de régua: é o registro que não
    // pode ser tocado por nada do Parametrizador.
    const rascunho = await iniciarAvaliacao(scout, empresa.id);
    await salvarNotas(scout, rascunho.id, [{ indicadorId: indicador.id, nota: 4, evidencia: null }]);
    const fechada = await fecharAvaliacao(scout, rascunho.id, "AVANCAR");
    const totalCongelado = fechada.total;
    expect(totalCongelado).not.toBeNull();

    const antes = await funilDeMercado();
    const cardAntes = antes.tabela.find((card) => card.id === empresa.id);
    expect(antes.regua).toEqual({ leveDias: 14, forteDias: 30 });
    expect(cardAntes?.envelhecimento).toBeNull();

    // O Administrador encurta a régua na T17.
    await alterarValorDeRegra(administrador, "FUNIL_ENVELHECIMENTO_LEVE_DIAS", 1);
    await alterarValorDeRegra(administrador, "FUNIL_ENVELHECIMENTO_FORTE_DIAS", 2);

    // Comportamento vivo mudou na leitura seguinte, sem deploy...
    const depois = await funilDeMercado();
    const cardDepois = depois.tabela.find((card) => card.id === empresa.id);
    expect(depois.regua).toEqual({ leveDias: 1, forteDias: 2 });
    expect(cardDepois?.envelhecimento).toBe("FORTE");
    expect(await lerRegua("FUNIL_ENVELHECIMENTO_LEVE_DIAS")).toBe(1);

    // ...e a avaliação fechada continua com o mesmo score congelado e
    // apontando para a versão de configuração sob a qual foi pontuada.
    const releitura = await prisma.avaliacaoScout.findUniqueOrThrow({
      where: { id: fechada.id },
    });
    expect(releitura.total).toBe(totalCongelado);
    expect(releitura.status).toBe("FECHADA");

    await restaurarReguas();
  });

  it("recusa régua incoerente — o grau forte vem depois do leve", async () => {
    await expect(
      alterarValorDeRegra(administrador, "FUNIL_ENVELHECIMENTO_LEVE_DIAS", 45),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
    expect(await lerRegua("FUNIL_ENVELHECIMENTO_LEVE_DIAS")).toBe(14);
  });

  it("RN25 — histórico do valor guarda autor, data e de/para", async () => {
    await alterarValorDeRegra(administrador, "OFERTA_SEM_RESGATE_DIAS", 60);
    const linha = await prisma.valorRegra.findUniqueOrThrow({
      where: { chave: "OFERTA_SEM_RESGATE_DIAS" },
      include: { historico: { orderBy: { criadoEm: "desc" }, take: 1 } },
    });
    const ultimo = linha.historico[0];
    expect(ultimo).toBeDefined();
    expect(Number(ultimo?.valorAnterior)).toBe(90);
    expect(Number(ultimo?.valorNovo)).toBe(60);
    expect(ultimo?.autorId).toBe(administrador.id);

    const auditoria = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "valor_regra", entidadeId: linha.id, campo: "valor" },
      orderBy: { criadoEm: "desc" },
    });
    expect(auditoria?.valorAnterior).toBe("90");
    expect(auditoria?.valorNovo).toBe("60");
    await restaurarReguas();
  });

  it("RN25 — mudar peso versiona a configuração; renomear, não", async () => {
    const versoesAntes = await prisma.configuracaoVersao.count();
    await atualizarItemDeLista(administrador, "indicadores", indicador.id, {
      nome: `${PREFIXO} Indicador renomeado`,
    });
    expect(await prisma.configuracaoVersao.count()).toBe(versoesAntes);

    await atualizarItemDeLista(administrador, "indicadores", indicador.id, { peso: 2.5 });
    expect(await prisma.configuracaoVersao.count()).toBe(versoesAntes + 1);

    const original = await prisma.indicador.findUniqueOrThrow({ where: { id: indicador.id } });
    expect(Number(original.peso)).toBe(2.5);
  });

  it("RN24 — inativar exige a contagem apurada e o item permanece no histórico", async () => {
    const { aplicado } = await criarItemDeLista(administrador, "culturas", {
      nome: `${PREFIXO} Cultura nova`,
    });
    expect(aplicado).toBe(true);
    const criada = await prisma.cultura.findFirstOrThrow({
      where: { nome: `${PREFIXO} Cultura nova` },
    });

    await expect(
      definirEstadoDoItem(administrador, "culturas", criada.id, false, null),
    ).rejects.toBeInstanceOf(ErroDeValidacao);

    const usos = await apurarUsos("culturas", criada.id);
    await definirEstadoDoItem(administrador, "culturas", criada.id, false, usos);

    const inativada = await prisma.cultura.findUniqueOrThrow({ where: { id: criada.id } });
    expect(inativada.ativa).toBe(false);
    // Excluir não existe: a linha continua lá, apenas fora das seleções.
    expect(inativada.nome).toBe(`${PREFIXO} Cultura nova`);
  });

  it("Abrangência não recebe item novo — a malha de UFs é fato fechado", async () => {
    await expect(
      criarItemDeLista(administrador, "cobertura", { nome: "ZZ — Terra Nova" }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it("RN28 — a segunda meta do mesmo escopo e período é recusada", async () => {
    const primeira = await criarMeta(administrador, {
      periodo: "TRIMESTRAL",
      referencia: new Date("2026-08-15T00:00:00Z"),
      categoriaId: null,
      valor: 6,
    });
    expect(primeira.aplicado).toBe(true);

    await expect(
      criarMeta(administrador, {
        periodo: "TRIMESTRAL",
        referencia: new Date("2026-09-02T00:00:00Z"),
        categoriaId: null,
        valor: 8,
      }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);

    // Outro trimestre convive sem conflito.
    const outra = await criarMeta(administrador, {
      periodo: "TRIMESTRAL",
      referencia: new Date("2026-11-02T00:00:00Z"),
      categoriaId: null,
      valor: 8,
    });
    expect(outra.aplicado).toBe(true);
  });

  it("a meta vigente de 24 novos aliados/ano está viva no produto", async () => {
    const meta = await prisma.metaPeriodo.findFirstOrThrow({
      where: { periodo: "ANUAL", categoriaId: null },
    });
    expect(meta.valor).toBe(24);
    expect(meta.inicio.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(await lerValor("COMISSAO_PADRAO_PCT")).toBe(5);
  });

  it("RN27 — ligada na T7, a escrita sensível vira solicitação e a aprovação a aplica", async () => {
    // Nasce desligada: a escrita vale na hora.
    const direta = await alterarValorDeRegra(administrador, "COMISSAO_PADRAO_PCT", 6);
    expect(direta.aplicado).toBe(true);
    expect(await lerValor("COMISSAO_PADRAO_PCT")).toBe(6);

    // O Gestor liga a regra na T7 — sem deploy, sem código novo.
    await configurarRegraAprovacao(gestor, "PARAMETRO_SENSIVEL", { exigida: true });

    const emFila = await alterarValorDeRegra(administrador, "COMISSAO_PADRAO_PCT", 9);
    expect(emFila.aplicado).toBe(false);
    // A configuração vigente segue valendo enquanto a decisão não vem.
    expect(await lerValor("COMISSAO_PADRAO_PCT")).toBe(6);

    // Uma régua comum continua valendo na hora: a exigência é da família
    // sensível, não de tudo o que o Parametrizador escreve.
    const regua = await alterarValorDeRegra(administrador, "OFERTA_VIGENCIA_A_VENCER_DIAS", 20);
    expect(regua.aplicado).toBe(true);

    await decidirSolicitacao(aprovador, emFila.solicitacaoId as string, "APROVADA", null);
    expect(await lerValor("COMISSAO_PADRAO_PCT")).toBe(9);

    // Devolução não aplica nada.
    const devolvida = await alterarValorDeRegra(administrador, "COMISSAO_PADRAO_PCT", 12);
    await decidirSolicitacao(
      aprovador,
      devolvida.solicitacaoId as string,
      "DEVOLVIDA",
      "Fora do contrato-modelo.",
    );
    expect(await lerValor("COMISSAO_PADRAO_PCT")).toBe(9);

    await configurarRegraAprovacao(gestor, "PARAMETRO_SENSIVEL", { exigida: false });
    await restaurarReguas();
  });

  it("RN27 + RN06 — quem solicita o parâmetro não decide sobre ele", async () => {
    await configurarRegraAprovacao(gestor, "PARAMETRO_SENSIVEL", { exigida: true });
    const pendente = await alterarValorDeRegra(outroAdministrador, "COMISSAO_PADRAO_PCT", 7);
    expect(pendente.aplicado).toBe(false);

    // A segregação aqui é estrutural, não circunstancial: só o
    // Administrador da Plataforma escreve parâmetro (RN23) e ele não tem
    // APROVAR_DEVOLVER, então o solicitante jamais é o decisor.
    await expect(
      decidirSolicitacao(outroAdministrador, pendente.solicitacaoId as string, "APROVADA", null),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
    expect(await lerValor("COMISSAO_PADRAO_PCT")).toBe(5);

    // Quem tem a permissão decide, e aí o valor passa a valer.
    await decidirSolicitacao(aprovador, pendente.solicitacaoId as string, "APROVADA", null);
    expect(await lerValor("COMISSAO_PADRAO_PCT")).toBe(7);

    await configurarRegraAprovacao(gestor, "PARAMETRO_SENSIVEL", { exigida: false });
    await restaurarReguas();
  });
});

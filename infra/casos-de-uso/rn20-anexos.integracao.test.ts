import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { decidirSolicitacao } from "./aprovacoes";
import { solicitarPromocao } from "./empresas";

/**
 * RN20 — o pedido de promoção leva anexados a avaliação vigente e o
 * dossiê, e o aprovador decide vendo o caso completo. Este arquivo é o
 * **teste de regressão do fluxo de aprovação da Onda 1** exigido pela F9:
 * a evolução da T6 não pode mexer no que já funcionava.
 *
 * Cobertura: pedido com os dois anexos; pedido sem nenhum (promoção não
 * exige avaliação nem dossiê); anexo congelado no instante do pedido (uma
 * avaliação nova aberta depois não troca o que o aprovador vê); aprovação
 * e devolução seguem funcionando; segregação RN06 intacta; publicação de
 * oferta — o outro tipo da fila — não é afetada.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

/** CNPJ estruturalmente válido (módulo 11) a partir de um número. */
function cnpjValido(sufixo: number): string {
  const base = String(Math.abs(Math.trunc(sufixo))).padStart(12, "7").slice(-12);
  const digito = (corpo: string): number => {
    const pesos =
      corpo.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = corpo
      .split("")
      .reduce((total, algarismo, indice) => total + Number(algarismo) * pesos[indice]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(base);
  const d2 = digito(`${base}${d1}`);
  return `${base}${d1}${d2}`;
}

describe.skipIf(!temBanco)("RN20 — anexos do pedido de promoção (F9)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let empresaId = "";

  async function limparDadosDeTeste() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-RN20]" } },
    });
    const ids = empresas.map((empresa) => empresa.id);
    const avaliacoes = await prisma.avaliacaoScout.findMany({
      where: { empresaId: { in: ids } },
      select: { id: true },
    });
    const dossies = await prisma.dossie.findMany({
      where: { empresaId: { in: ids } },
      select: { id: true },
    });
    await prisma.aprovacaoSolicitacao.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.avaliacaoNota.deleteMany({
      where: { avaliacaoId: { in: avaliacoes.map((a) => a.id) } },
    });
    await prisma.avaliacaoScout.deleteMany({ where: { id: { in: avaliacoes.map((a) => a.id) } } });
    await prisma.dossieExecucao.deleteMany({
      where: { dossieId: { in: dossies.map((d) => d.id) } },
    });
    await prisma.dossie.deleteMany({ where: { id: { in: dossies.map((d) => d.id) } } });
    await prisma.contratoComercial.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.contatoEmpresa.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  /** Empresa pronta para promoção (M2 completo), em negociação. */
  async function semearEmpresaPromovivel(sufixo: string) {
    const categoria = await prisma.categoria.findFirstOrThrow();
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: `[TESTE-RN20] ${sufixo}`,
        razaoSocial: `[TESTE-RN20] ${sufixo} LTDA`,
        cnpj: cnpjValido(920001),
        enderecoCep: "01310-100",
        enderecoLogradouro: "Avenida Paulista",
        enderecoNumero: "1000",
        enderecoBairro: "Bela Vista",
        enderecoMunicipio: "São Paulo",
        enderecoUf: "SP",
        estagio: "EM_NEGOCIACAO",
        origem: "SCOUTING_ATIVO",
        categorias: { create: [{ categoriaId: categoria.id }] },
        contatos: {
          create: [
            { papel: "COMERCIAL", nome: "Contato Comercial", email: "contato@exemplo.com" },
          ],
        },
        contratos: {
          create: [
            {
              vigenciaBase: new Date("2026-01-10"),
              status: "VIGENTE",
              comissaoPct: "5.00",
              ambientesPagamento: "DENTRO_PLATAFORMA",
              anexoS3Key: "contratos/teste-rn20.pdf",
              dataAssinatura: new Date("2026-01-10"),
            },
          ],
        },
      },
    });
    return empresa.id;
  }

  /** Avaliação fechada com uma nota, na versão informada. */
  async function semearAvaliacaoFechada(versao: number, total: number) {
    const indicador = await prisma.indicador.findFirstOrThrow({ where: { ativo: true } });
    return prisma.avaliacaoScout.create({
      data: {
        empresaId,
        versao,
        avaliadorId: gestor.id,
        status: "FECHADA",
        recomendacao: "AVANCAR",
        total,
        subtotais: [
          { dimensao: "Capilaridade", quantidadeNotas: 1, media: 4, peso: 1, subtotal: 80 },
        ],
        fechadaEm: new Date(),
        notas: { create: [{ indicadorId: indicador.id, nota: 4 }] },
      },
    });
  }

  async function semearDossiePronto(revisado: boolean) {
    return prisma.dossie.create({
      data: {
        empresaId,
        status: "PRONTO",
        origem: "INSERIDO_MANUALMENTE",
        solicitanteId: gestor.id,
        versaoTemplate: "v1@teste",
        conteudo: { resumo_executivo: "conteúdo de teste" },
        revisado,
        revisorId: revisado ? gestor.id : null,
        revisadoEm: revisado ? new Date() : null,
      },
    });
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
    await limparDadosDeTeste();
  });

  beforeEach(async () => {
    await limparDadosDeTeste();
    empresaId = await semearEmpresaPromovivel("Empresa da promoção");
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("o pedido leva a avaliação vigente e o dossiê anexados", async () => {
    const avaliacao = await semearAvaliacaoFechada(1, 78);
    const dossie = await semearDossiePronto(true);

    const resultado = await solicitarPromocao(gestor, empresaId);
    expect(resultado.resultado).toBe("SOLICITADA");

    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    expect(solicitacao.avaliacaoVigenteId).toBe(avaliacao.id);
    expect(solicitacao.dossieVigenteId).toBe(dossie.id);
  });

  it("anexa a avaliação FECHADA de maior versão, não o rascunho aberto", async () => {
    await semearAvaliacaoFechada(1, 60);
    const vigente = await semearAvaliacaoFechada(2, 82);
    await prisma.avaliacaoScout.create({
      data: { empresaId, versao: 3, avaliadorId: gestor.id, status: "RASCUNHO" },
    });

    await solicitarPromocao(gestor, empresaId);
    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    expect(solicitacao.avaliacaoVigenteId).toBe(vigente.id);
  });

  it("o anexo é congelado no pedido: avaliação nova depois não troca o que o aprovador vê", async () => {
    const noMomentoDoPedido = await semearAvaliacaoFechada(1, 70);
    await solicitarPromocao(gestor, empresaId);

    // Enquanto o pedido espera na fila, o time fecha outra versão.
    await semearAvaliacaoFechada(2, 95);

    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    expect(solicitacao.avaliacaoVigenteId).toBe(noMomentoDoPedido.id);
  });

  it("dossiê não revisado viaja assim mesmo — o aprovador precisa saber (RN19)", async () => {
    await semearAvaliacaoFechada(1, 55);
    const dossie = await semearDossiePronto(false);

    await solicitarPromocao(gestor, empresaId);
    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
      include: { dossieVigente: true },
    });
    expect(solicitacao.dossieVigenteId).toBe(dossie.id);
    expect(solicitacao.dossieVigente?.revisado).toBe(false);
  });

  it("dossiê que ainda gera ou falhou não é anexado como pronto", async () => {
    await prisma.dossie.create({
      data: {
        empresaId,
        status: "GERANDO",
        origem: "GERADO_IA",
        solicitanteId: gestor.id,
        versaoTemplate: "v1@teste",
      },
    });
    await solicitarPromocao(gestor, empresaId);
    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    expect(solicitacao.dossieVigenteId).toBeNull();
  });

  it("sem avaliação e sem dossiê o pedido é criado assim mesmo (não são pré-requisito)", async () => {
    const resultado = await solicitarPromocao(gestor, empresaId);
    expect(resultado.resultado).toBe("SOLICITADA");

    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    expect(solicitacao.avaliacaoVigenteId).toBeNull();
    expect(solicitacao.dossieVigenteId).toBeNull();
  });

  it("os anexos entram na trilha de auditoria do pedido", async () => {
    const avaliacao = await semearAvaliacaoFechada(1, 64);
    await solicitarPromocao(gestor, empresaId);

    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    const evento = await prisma.auditoriaEvento.findFirst({
      where: {
        entidade: "aprovacao_solicitacao",
        entidadeId: solicitacao.id,
        campo: "avaliacaoVigenteId",
      },
    });
    expect(evento?.valorNovo).toBe(avaliacao.id);
  });
});

/**
 * Regressão do fluxo de aprovação da Onda 1: as colunas novas da RN20 não
 * podem alterar aprovação, devolução, segregação (RN06) nem o outro tipo
 * de solicitação da fila.
 */
describe.skipIf(!temBanco)("regressão do motor de aprovação da Onda 1 (RN06) com a RN20", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let aprovador: { id: string; papel: "APROVADOR" };
  let empresaId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-RN20-REG]" } },
    });
    const ids = empresas.map((empresa) => empresa.id);
    await prisma.aprovacaoSolicitacao.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.contratoComercial.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.contatoEmpresa.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    gestor = { id: usuarios.find((u) => u.papel === "GESTOR")!.id, papel: "GESTOR" };
    aprovador = { id: usuarios.find((u) => u.papel === "APROVADOR")!.id, papel: "APROVADOR" };
    await limpar();
  });

  beforeEach(async () => {
    await limpar();
    const categoria = await prisma.categoria.findFirstOrThrow();
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-RN20-REG] Empresa",
        razaoSocial: "[TESTE-RN20-REG] Empresa LTDA",
        cnpj: cnpjValido(920002),
        enderecoCep: "01310-100",
        enderecoLogradouro: "Avenida Paulista",
        enderecoNumero: "1000",
        enderecoBairro: "Bela Vista",
        enderecoMunicipio: "São Paulo",
        enderecoUf: "SP",
        estagio: "EM_NEGOCIACAO",
        origem: "INDICACAO",
        categorias: { create: [{ categoriaId: categoria.id }] },
        contatos: {
          create: [{ papel: "COMERCIAL", nome: "Contato", email: "c@exemplo.com" }],
        },
        contratos: {
          create: [
            {
              vigenciaBase: new Date("2026-02-01"),
              status: "VIGENTE",
              comissaoPct: "5.00",
              ambientesPagamento: "AMBOS",
              anexoS3Key: "contratos/teste-rn20-regressao.pdf",
              dataAssinatura: new Date("2026-02-01"),
            },
          ],
        },
      },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("aprovação promove a empresa e fecha a solicitação (fluxo da Onda 1 intacto)", async () => {
    await solicitarPromocao(gestor, empresaId);
    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });

    await decidirSolicitacao(aprovador, solicitacao.id, "APROVADA", null);

    const decidida = await prisma.aprovacaoSolicitacao.findUniqueOrThrow({
      where: { id: solicitacao.id },
    });
    expect(decidida.estado).toBe("APROVADA");
    expect(decidida.aprovadorId).toBe(aprovador.id);

    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.estagio).toBe("ALIADA_ATIVA");
  });

  it("devolução exige comentário e traz a empresa de volta a Em negociação", async () => {
    await solicitarPromocao(gestor, empresaId);
    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });

    await expect(decidirSolicitacao(aprovador, solicitacao.id, "DEVOLVIDA", null)).rejects.toThrow();

    await decidirSolicitacao(aprovador, solicitacao.id, "DEVOLVIDA", "Faltou o contrato assinado.");
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.estagio).toBe("EM_NEGOCIACAO");
  });

  it("solicitante não decide o próprio pedido (RN06 segue valendo)", async () => {
    await solicitarPromocao(gestor, empresaId);
    const solicitacao = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    await expect(decidirSolicitacao(gestor, solicitacao.id, "APROVADA", null)).rejects.toThrow();
  });

  it("pedido duplicado continua sendo recusado", async () => {
    await solicitarPromocao(gestor, empresaId);
    await expect(solicitarPromocao(gestor, empresaId)).rejects.toThrow();
  });
});

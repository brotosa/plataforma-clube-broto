import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeEnvioDeArquivo } from "@/dominio/arquivos/arquivo-enviado";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import {
  cardsDeConsumo,
  listarPatrocinadores,
  lerPatrocinador,
} from "@/infra/consultas/patrocinadores";
import {
  ENTIDADE_MINUTA,
  ENTIDADE_PATROCINADOR,
  ENTIDADE_VINCULO,
  alterarStatusDoPatrocinador,
  criarPatrocinador,
  editarPatrocinador,
  encerrarVinculo,
  enviarMinuta,
  lerMinuta,
  removerMinuta,
  salvarContrato,
  vincularAssinante,
  vincularAssinantePorCpf,
} from "./patrocinadores";

/**
 * RN62 — patrocínio fim a fim: cadastro, contrato, minuta, vínculo,
 * derivação do saldo, auditoria e permissão.
 *
 * O que os testes de `dominio/patrocinio` não alcançam é justamente o que
 * interessa aqui: que o saldo lido pela tela vem da contagem real de
 * vínculos vigentes, que encerrar devolve a vaga sem apagar a linha, e que
 * a trilha guarda o hash da minuta anterior sem guardar o arquivo.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const PDF = (tamanho = 128, marca = "A") => {
  const conteudo = new Uint8Array(tamanho);
  conteudo.set(new TextEncoder().encode(`%PDF-1.7\n${marca}`), 0);
  return conteudo;
};
const PNG_MINIMO = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

/** CNPJ sintético com dígitos verificadores válidos (nunca de empresa real). */
const CNPJ_VALIDO = "11222333000181";
const CNPJ_VALIDO_2 = "11444777000161";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.skipIf(!temBanco)("RN62 — patrocinadores (integração)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let analista: { id: string; papel: "ANALISTA" };
  let patrocinadorId = "";
  const assinantesDeTeste: string[] = [];

  async function limparDadosDeTeste() {
    const patrocinadores = await prisma.patrocinador.findMany({
      where: { razaoSocial: { startsWith: "[TESTE-RN62]" } },
      select: { id: true, contrato: { select: { id: true } } },
    });
    const ids = patrocinadores.map((p) => p.id);
    const contratos = patrocinadores.flatMap((p) => (p.contrato ? [p.contrato.id] : []));
    await prisma.minutaContrato.deleteMany({ where: { contratoId: { in: contratos } } });
    await prisma.vinculoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.relatorioPatrocinador.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.contratoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidadeId: { in: [...ids, ...contratos] } },
    });
    await prisma.patrocinador.deleteMany({ where: { id: { in: ids } } });

    const assinantes = await prisma.assinante.findMany({
      where: { nome: { startsWith: "[TESTE-RN62]" } },
      select: { id: true },
    });
    const idsAssinantes = assinantes.map((a) => a.id);
    await prisma.vinculoPatrocinio.deleteMany({ where: { assinanteId: { in: idsAssinantes } } });
    await prisma.assinante.deleteMany({ where: { id: { in: idsAssinantes } } });
  }

  /** Assinante sintético — CPF gerado, jamais de pessoa real (CLAUDE.md). */
  async function criarAssinante(sufixo: string, cpf: string) {
    const criado = await prisma.assinante.create({
      data: {
        nome: `[TESTE-RN62] Assinante ${sufixo}`,
        cpfHash: hashCpf(cpf),
        cpfCifrado: cifrarCpf(cpf),
        marcaSintetico: true,
      },
      select: { id: true },
    });
    assinantesDeTeste.push(criado.id);
    return criado.id;
  }

  beforeAll(async () => {
    const usuarioGestor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    gestor = { id: usuarioGestor.id, papel: "GESTOR" };
    const usuarioAnalista = await prisma.usuario.findFirstOrThrow({ where: { papel: "ANALISTA" } });
    analista = { id: usuarioAnalista.id, papel: "ANALISTA" };
  });

  beforeEach(async () => {
    await limparDadosDeTeste();
    const { id } = await criarPatrocinador(gestor, {
      razaoSocial: "[TESTE-RN62] Yamer Agro",
      cnpj: CNPJ_VALIDO,
      segmento: "Insumos",
      contatoNome: "Contato de teste",
      contatoEmail: "contato@exemplo.invalido",
      contatoTelefone: null,
      responsavelComercialId: null,
      observacoes: null,
    });
    patrocinadorId = id;
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  describe("cadastro", () => {
    it("grava o CNPJ só com dígitos e audita a criação", async () => {
      const registro = await prisma.patrocinador.findUniqueOrThrow({
        where: { id: patrocinadorId },
      });
      expect(registro.cnpj).toBe(CNPJ_VALIDO);
      expect(registro.status).toBe("ATIVO");

      const eventos = await prisma.auditoriaEvento.findMany({
        where: { entidade: ENTIDADE_PATROCINADOR, entidadeId: patrocinadorId },
      });
      expect(eventos.length).toBeGreaterThan(0);
      expect(eventos.map((evento) => evento.campo)).toContain("razaoSocial");
    });

    it("recusa CNPJ inválido nomeando a causa", async () => {
      await expect(
        criarPatrocinador(gestor, {
          razaoSocial: "[TESTE-RN62] Inválida",
          cnpj: "11111111111111",
          segmento: null,
          contatoNome: null,
          contatoEmail: null,
          contatoTelefone: null,
          responsavelComercialId: null,
          observacoes: null,
        }),
      ).rejects.toThrow(/dígitos verificadores/);
    });

    it("recusa CNPJ repetido dizendo QUEM já o ocupa", async () => {
      await expect(
        criarPatrocinador(gestor, {
          razaoSocial: "[TESTE-RN62] Repetida",
          cnpj: CNPJ_VALIDO,
          segmento: null,
          contatoNome: null,
          contatoEmail: null,
          contatoTelefone: null,
          responsavelComercialId: null,
          observacoes: null,
        }),
      ).rejects.toThrow(/Já existe um patrocinador com este CNPJ: \[TESTE-RN62\] Yamer Agro/);
    });

    it("a edição não briga com o próprio CNPJ", async () => {
      await editarPatrocinador(gestor, patrocinadorId, {
        razaoSocial: "[TESTE-RN62] Yamer Agro S.A.",
        cnpj: CNPJ_VALIDO,
        segmento: "Insumos",
        contatoNome: null,
        contatoEmail: null,
        contatoTelefone: null,
        responsavelComercialId: null,
        observacoes: null,
      });
      const registro = await prisma.patrocinador.findUniqueOrThrow({
        where: { id: patrocinadorId },
      });
      expect(registro.razaoSocial).toBe("[TESTE-RN62] Yamer Agro S.A.");
    });

    it("encerrar é mudança de status — a linha e os vínculos permanecem", async () => {
      const assinanteId = await criarAssinante("encerrar", "52998224725");
      await vincularAssinante(gestor, patrocinadorId, assinanteId, dia("2026-01-01"));
      await alterarStatusDoPatrocinador(gestor, patrocinadorId, "ENCERRADO");

      const registro = await prisma.patrocinador.findUniqueOrThrow({
        where: { id: patrocinadorId },
      });
      expect(registro.status).toBe("ENCERRADO");
      // Encerrar o patrocinador NÃO encerra os vínculos: supor isso seria
      // a plataforma decidindo um fato do negócio.
      const vigentes = await prisma.vinculoPatrocinio.count({
        where: { patrocinadorId, fim: null },
      });
      expect(vigentes).toBe(1);
    });
  });

  describe("permissão (RN62)", () => {
    it("o Analista não gere patrocinador — a ficha nomeia só o Gestor", async () => {
      await expect(
        criarPatrocinador(analista, {
          razaoSocial: "[TESTE-RN62] Do analista",
          cnpj: CNPJ_VALIDO_2,
          segmento: null,
          contatoNome: null,
          contatoEmail: null,
          contatoTelefone: null,
          responsavelComercialId: null,
          observacoes: null,
        }),
      ).rejects.toThrow(ErroDeAutorizacao);
      await expect(
        salvarContrato(analista, patrocinadorId, {
          dataAssinatura: null,
          vigenciaInicio: null,
          vigenciaFim: null,
          precoUnitario: null,
          valorTotalContratado: null,
          assinaturasAdquiridas: 10,
        }),
      ).rejects.toThrow(ErroDeAutorizacao);
    });

    it("mas LÊ a minuta: a leitura é de todos os papéis", async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: null,
        vigenciaInicio: null,
        vigenciaFim: null,
        precoUnitario: null,
        valorTotalContratado: null,
        assinaturasAdquiridas: null,
      });
      await enviarMinuta(gestor, patrocinadorId, { nome: "minuta.pdf", conteudo: PDF() });
      const lida = await lerMinuta(analista, patrocinadorId);
      expect(lida?.tipoMime).toBe("application/pdf");
    });
  });

  describe("contrato e saldo derivado", () => {
    it("sem adquiridas confirmadas o saldo é ausência com motivo, nunca zero", async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: dia("2026-03-01"),
        vigenciaInicio: dia("2026-03-01"),
        vigenciaFim: dia("2027-02-28"),
        precoUnitario: null,
        valorTotalContratado: null,
        assinaturasAdquiridas: null,
      });
      const leitura = await lerPatrocinador(patrocinadorId, dia("2026-07-27"));
      expect(leitura?.saldo.estado).toBe("INDISPONIVEL");
      expect(leitura?.saldo).not.toHaveProperty("saldo");
    });

    it("o saldo cai a cada vínculo e volta quando ele é encerrado", async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: null,
        vigenciaInicio: null,
        vigenciaFim: null,
        precoUnitario: "12.50",
        valorTotalContratado: "6250.00",
        assinaturasAdquiridas: 3,
      });

      const a = await criarAssinante("A", "52998224725");
      const b = await criarAssinante("B", "15350946056");
      const vinculoA = await vincularAssinante(gestor, patrocinadorId, a, dia("2026-01-01"));
      await vincularAssinante(gestor, patrocinadorId, b, dia("2026-01-01"));

      let leitura = await lerPatrocinador(patrocinadorId);
      expect(leitura?.saldo).toMatchObject({ estado: "APURADO", adquiridas: 3, ativadas: 2, saldo: 1 });

      await encerrarVinculo(gestor, vinculoA.id, dia("2026-06-30"), "troca de titular");

      leitura = await lerPatrocinador(patrocinadorId);
      expect(leitura?.saldo).toMatchObject({ ativadas: 1, saldo: 2 });
      // A vaga voltou, mas a linha ficou: é ela que sustenta a leitura de
      // rotatividade quando o negócio decidir o que fazer com ela.
      expect(leitura?.vinculosEncerrados).toBe(1);
      const encerrado = await prisma.vinculoPatrocinio.findUniqueOrThrow({
        where: { id: vinculoA.id },
      });
      expect(encerrado.fim).toEqual(dia("2026-06-30"));
      expect(encerrado.motivoFim).toBe("troca de titular");
    });

    it("estourar as vagas é exibido, não impedido", async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: null,
        vigenciaInicio: null,
        vigenciaFim: null,
        precoUnitario: null,
        valorTotalContratado: null,
        assinaturasAdquiridas: 1,
      });
      const a = await criarAssinante("A", "52998224725");
      const b = await criarAssinante("B", "15350946056");
      await vincularAssinante(gestor, patrocinadorId, a, dia("2026-01-01"));
      await vincularAssinante(gestor, patrocinadorId, b, dia("2026-01-01"));

      const leitura = await lerPatrocinador(patrocinadorId);
      expect(leitura?.saldo).toMatchObject({ saldo: -1, excedido: true });
    });

    it("recusa vincular duas vezes o mesmo assinante enquanto vigente", async () => {
      const a = await criarAssinante("A", "52998224725");
      await vincularAssinante(gestor, patrocinadorId, a, dia("2026-01-01"));
      await expect(
        vincularAssinante(gestor, patrocinadorId, a, dia("2026-02-01")),
      ).rejects.toThrow(/já ocupa uma vaga vigente/);
    });

    it("mas permite revincular depois de encerrado — é a rotatividade", async () => {
      const a = await criarAssinante("A", "52998224725");
      const vinculo = await vincularAssinante(gestor, patrocinadorId, a, dia("2026-01-01"));
      await encerrarVinculo(gestor, vinculo.id, dia("2026-06-30"), null);
      await expect(
        vincularAssinante(gestor, patrocinadorId, a, dia("2026-07-01")),
      ).resolves.toMatchObject({ id: expect.any(String) });
    });

    it("vincula pelo CPF (com máscara) resolvendo o assinante por HMAC", async () => {
      const a = await criarAssinante("porCpf", "52998224725");
      const { id } = await vincularAssinantePorCpf(
        gestor,
        patrocinadorId,
        "529.982.247-25",
        dia("2026-01-01"),
      );
      const vinculo = await prisma.vinculoPatrocinio.findUniqueOrThrow({ where: { id } });
      expect(vinculo.assinanteId).toBe(a);
      expect(vinculo.fim).toBeNull();
    });

    it("recusa CPF sem assinante correspondente nomeando a causa", async () => {
      // CPF válido (dígitos conferem) mas sem assinante criado na base.
      await expect(
        vincularAssinantePorCpf(gestor, patrocinadorId, "153.509.460-56", dia("2026-01-01")),
      ).rejects.toThrow(/Nenhum assinante com esse CPF/);
    });

    it("recusa CPF inválido antes de tocar a base", async () => {
      await expect(
        vincularAssinantePorCpf(gestor, patrocinadorId, "111.111.111-11", dia("2026-01-01")),
      ).rejects.toThrow(/não é válido/);
    });

    it("recusa vigência com fim anterior ao início", async () => {
      await expect(
        salvarContrato(gestor, patrocinadorId, {
          dataAssinatura: null,
          vigenciaInicio: dia("2026-05-01"),
          vigenciaFim: dia("2026-04-01"),
          precoUnitario: null,
          valorTotalContratado: null,
          assinaturasAdquiridas: null,
        }),
      ).rejects.toThrow(/não pode ser anterior ao início/);
    });

    it("o selo de vigência acompanha a data de referência", async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: null,
        vigenciaInicio: dia("2025-08-01"),
        vigenciaFim: dia("2026-08-10"),
        precoUnitario: null,
        valorTotalContratado: null,
        assinaturasAdquiridas: 1,
      });
      expect((await lerPatrocinador(patrocinadorId, dia("2026-07-27")))?.vigencia).toEqual({
        estado: "VENCENDO",
        diasRestantes: 14,
      });
      expect((await lerPatrocinador(patrocinadorId, dia("2026-09-01")))?.vigencia).toMatchObject({
        estado: "VENCIDA",
      });
    });
  });

  describe("minuta — terceira generalização da infraestrutura de arquivo", () => {
    beforeEach(async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: null,
        vigenciaInicio: null,
        vigenciaFim: null,
        precoUnitario: null,
        valorTotalContratado: null,
        assinaturasAdquiridas: 10,
      });
    });

    it("grava o PDF e o serve pela leitura", async () => {
      const { hash } = await enviarMinuta(gestor, patrocinadorId, {
        nome: "contrato-yamer.pdf",
        conteudo: PDF(256, "A"),
      });
      const lida = await lerMinuta(gestor, patrocinadorId);
      expect(lida?.hash).toBe(hash);
      expect(lida?.nomeArquivo).toBe("contrato-yamer.pdf");
      expect(lida?.conteudo.length).toBe(256);
    });

    it("recusa imagem nomeando o formato — e não grava nada", async () => {
      await expect(
        enviarMinuta(gestor, patrocinadorId, { nome: "contrato.png", conteudo: PNG_MINIMO }),
      ).rejects.toThrow(ErroDeEnvioDeArquivo);
      await expect(
        enviarMinuta(gestor, patrocinadorId, { nome: "contrato.png", conteudo: PNG_MINIMO }),
      ).rejects.toThrow(/A minuta não aceita PNG/);
      expect(await lerMinuta(gestor, patrocinadorId)).toBeNull();
    });

    it("substituir não apaga a anterior da trilha (RN49)", async () => {
      const primeira = await enviarMinuta(gestor, patrocinadorId, {
        nome: "v1.pdf",
        conteudo: PDF(128, "A"),
      });
      const segunda = await enviarMinuta(gestor, patrocinadorId, {
        nome: "v2.pdf",
        conteudo: PDF(200, "B"),
      });
      expect(segunda.hash).not.toBe(primeira.hash);

      const contrato = await prisma.contratoPatrocinio.findUniqueOrThrow({
        where: { patrocinadorId },
        select: { id: true },
      });
      const eventos = await prisma.auditoriaEvento.findMany({
        where: { entidade: ENTIDADE_MINUTA, entidadeId: contrato.id },
      });
      const doHash = eventos.filter((evento) => evento.campo === "hash");
      // A troca deixa rastro com o hash anterior E o novo.
      expect(doHash.some((evento) => evento.valorAnterior === primeira.hash)).toBe(true);
      expect(doHash.some((evento) => evento.valorNovo === segunda.hash)).toBe(true);
      // E a trilha NUNCA carrega o conteúdo do arquivo.
      for (const evento of eventos) {
        expect(evento.valorNovo ?? "").not.toContain("%PDF");
        expect(evento.valorAnterior ?? "").not.toContain("%PDF");
      }
    });

    it("remover devolve a pendência, e remover duas vezes recusa com causa", async () => {
      await enviarMinuta(gestor, patrocinadorId, { nome: "v1.pdf", conteudo: PDF() });
      await removerMinuta(gestor, patrocinadorId);
      expect(await lerMinuta(gestor, patrocinadorId)).toBeNull();
      await expect(removerMinuta(gestor, patrocinadorId)).rejects.toThrow(
        /não tem minuta para remover/,
      );
    });

    it("sem contrato, a minuta recusa dizendo o que fazer antes", async () => {
      const { id: outro } = await criarPatrocinador(gestor, {
        razaoSocial: "[TESTE-RN62] Sem contrato",
        cnpj: CNPJ_VALIDO_2,
        segmento: null,
        contatoNome: null,
        contatoEmail: null,
        contatoTelefone: null,
        responsavelComercialId: null,
        observacoes: null,
      });
      await expect(
        enviarMinuta(gestor, outro, { nome: "v1.pdf", conteudo: PDF() }),
      ).rejects.toThrow(/salve os dados do contrato antes de anexar a minuta/);
    });

    it("a consulta da lista traz metadados da minuta, jamais o binário", async () => {
      await enviarMinuta(gestor, patrocinadorId, { nome: "v1.pdf", conteudo: PDF() });
      const leitura = await lerPatrocinador(patrocinadorId);
      expect(leitura?.contrato?.minuta).toMatchObject({ nomeArquivo: "v1.pdf" });
      expect(JSON.stringify(leitura)).not.toContain("%PDF");
      expect(leitura?.contrato?.minuta).not.toHaveProperty("conteudo");
    });
  });

  describe("aba Consumo (RN65)", () => {
    it("declara os seis cards, com selo e motivo em cada espera", async () => {
      const cards = await cardsDeConsumo(patrocinadorId);
      expect(cards).toHaveLength(6);
      expect(cards.map((card) => card.chave)).toEqual([
        "base",
        "resgates",
        "modalidades",
        "funil",
        "acessos",
        "solucoes",
      ]);
      for (const card of cards) {
        if (card.selo === "VIVO") {
          expect(card.motivo).toBeNull();
          expect(card.linhas.length).toBeGreaterThan(0);
        } else {
          // Nenhum número aproximado, em nenhuma hipótese — e a razão da
          // espera sempre escrita.
          expect(card.linhas).toHaveLength(0);
          expect(card.motivo).toBeTruthy();
        }
      }
    });

    it("o motivo do 'aguarda fonte' cita a requisição de 27/07, nunca 'carta pendente'", async () => {
      const cards = await cardsDeConsumo(patrocinadorId);
      const acessos = cards.find((card) => card.chave === "acessos");
      expect(acessos?.motivo).toContain("27/07");
      expect(acessos?.motivo).not.toContain("carta");
    });

    it("o card vivo conta as vagas ativadas e declara quem está sem perfil", async () => {
      const a = await criarAssinante("A", "52998224725");
      await vincularAssinante(gestor, patrocinadorId, a, dia("2026-01-01"));
      const cards = await cardsDeConsumo(patrocinadorId);
      const base = cards.find((card) => card.chave === "base");
      expect(base?.linhas).toContainEqual({ rotulo: "Vagas ativadas", valor: "1" });
      // O perfil vem do relatório da operadora (F20): até lá, o volume sem
      // perfil é DECLARADO, não distribuído nem escondido.
      expect(base?.linhas).toContainEqual({
        rotulo: "Perfil ainda não informado pela fonte",
        valor: "1",
      });
    });
  });

  describe("lista (T32)", () => {
    it("busca por razão social e por CNPJ com pontuação", async () => {
      expect(await listarPatrocinadores({ busca: "Yamer" })).toHaveLength(1);
      expect(await listarPatrocinadores({ busca: "11.222.333/0001-81" })).toHaveLength(1);
      expect(await listarPatrocinadores({ busca: "inexistente" })).toHaveLength(0);
    });

    it("filtra por status e por vigência em alerta", async () => {
      await salvarContrato(gestor, patrocinadorId, {
        dataAssinatura: null,
        vigenciaInicio: null,
        vigenciaFim: dia("2026-08-10"),
        precoUnitario: null,
        valorTotalContratado: null,
        assinaturasAdquiridas: 1,
      });
      const emAlerta = await listarPatrocinadores(
        { apenasVigenciaEmAlerta: true },
        dia("2026-07-27"),
      );
      expect(emAlerta.map((p) => p.id)).toContain(patrocinadorId);

      const semAlerta = await listarPatrocinadores(
        { apenasVigenciaEmAlerta: true },
        dia("2026-01-01"),
      );
      expect(semAlerta.map((p) => p.id)).not.toContain(patrocinadorId);

      await alterarStatusDoPatrocinador(gestor, patrocinadorId, "ENCERRADO");
      const ativos = await listarPatrocinadores({ status: "ATIVO" });
      expect(ativos.map((p) => p.id)).not.toContain(patrocinadorId);
    });

    it("audita o vínculo criado e o encerrado", async () => {
      const a = await criarAssinante("A", "52998224725");
      const vinculo = await vincularAssinante(gestor, patrocinadorId, a, dia("2026-01-01"));
      await encerrarVinculo(gestor, vinculo.id, dia("2026-06-30"), null);
      const eventos = await prisma.auditoriaEvento.findMany({
        where: { entidade: ENTIDADE_VINCULO, entidadeId: vinculo.id },
      });
      expect(eventos.map((evento) => evento.campo)).toContain("fim");
    });
  });
});

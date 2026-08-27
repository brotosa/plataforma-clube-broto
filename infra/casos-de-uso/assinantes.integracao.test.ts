import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeValidacao, type Ator } from "./contexto";
import {
  aplicarMapeamentoEnriquecimento,
  aplicarMapeamentoNucleo,
  confirmarImportacaoEnriquecimento,
  confirmarImportacaoNucleo,
  prepararImportacaoAssinantes,
} from "./assinantes-importacao";
import {
  decidirExibicaoPlena,
  exportarLista,
  lerSnapshotExportacao,
  salvarSegmento,
} from "./assinantes-segmentos";
import {
  contarAssinantes,
  listarCarteira,
  listarSegmentosComContagem,
  perfilAssinante,
} from "@/infra/consultas/assinantes";
import {
  gerarAssinantesSinteticos,
  gerarCsvEnriquecimentoSintetico,
  gerarCsvNucleoSintetico,
} from "@/infra/assinantes/fixtures-sinteticas";
import { hashDeSnapshot } from "@/infra/exportacoes/armazenador";
import { gerarModeloAssinantesXlsx } from "@/infra/assinantes/modelo-importacao-xlsx";
import ExcelJS from "exceljs";

/**
 * Integração da F11 (executa apenas com banco disponível): o fluxo
 * completo da ficha da Onda 5 — importar núcleo → derivar → enriquecer
 * com divergência → contar → segmentar → exportar com finalidade →
 * auditoria conferida — e o cenário do desastre da foto completa
 * (arquivo parcial exige confirmação mostrando quantos sairiam).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

// Chaves de proteção de CPF para o ambiente de teste (nunca de produção).
process.env.CPF_HASH_KEY ??= "chave-de-teste-integracao-hmac";
process.env.APP_ENCRYPTION_KEY ??= "chave-de-teste-integracao-cifra";

const prisma = new PrismaClient();

// Base sintética determinística (semente 7): 6 assinantes marcados.
const SINTETICOS = gerarAssinantesSinteticos(6, 7);

let gestor: Ator;
let analista: Ator;
let leitura: Ator;

async function upsertUsuario(email: string, papel: "GESTOR" | "ANALISTA" | "LEITURA") {
  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { nome: `Perfil ${papel} (teste)`, email, senhaHash: "sem-login", papel },
  });
  return { id: usuario.id, papel: usuario.papel };
}

async function limparModuloAssinantes() {
  await prisma.atributoEnriquecimento.deleteMany({});
  await prisma.assinatura.deleteMany({});
  await prisma.exportacaoLista.deleteMany({});
  await prisma.segmento.deleteMany({});
  await prisma.stagingAssinante.deleteMany({});
  // Vínculos de teste (RN63/C-A) referenciam assinantes por FK — removê-los
  // antes de apagar os assinantes; o patrocinador de teste sai por marcador.
  const patrocinadoresTeste = await prisma.patrocinador.findMany({
    where: { razaoSocial: { startsWith: "[TESTE-C-A]" } },
    select: { id: true },
  });
  await prisma.vinculoPatrocinio.deleteMany({});
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "VinculoPatrocinio" } });
  await prisma.patrocinador.deleteMany({
    where: { id: { in: patrocinadoresTeste.map((p) => p.id) } },
  });
  await prisma.assinante.deleteMany({});
  await prisma.importacao.deleteMany({
    where: { tipo: { in: ["ASSINANTES_NUCLEO", "ASSINANTES_ENRIQUECIMENTO"] } },
  });
  await prisma.auditoriaEvento.deleteMany({
    where: { entidade: { in: ["assinante", "segmento", "exportacao_lista"] } },
  });
}

describe.skipIf(!temBanco)("F11 — fluxo completo de assinantes (integração)", () => {
  beforeAll(async () => {
    gestor = await upsertUsuario("gestor.assinantes@dev.clubebroto.local", "GESTOR");
    analista = await upsertUsuario("analista.assinantes@dev.clubebroto.local", "ANALISTA");
    leitura = await upsertUsuario("leitura.assinantes@dev.clubebroto.local", "LEITURA");
    await limparModuloAssinantes();
  });

  afterAll(async () => {
    await limparModuloAssinantes();
    await prisma.$disconnect();
  });

  let importacaoNucleoId = "";

  it("passo 1-2: staging bruto com colunas, sugestão de mapeamento e prévia de 5 linhas", async () => {
    const csv = gerarCsvNucleoSintetico(SINTETICOS);
    // Duas linhas quebradas de propósito: CPF inválido e nome vazio (RN31).
    const comErros =
      csv +
      "00000000000;Nome Com Cpf Invalido;Rua A, 1 — Centro, Uberaba/MG;;x@exemplo.com.br;;agricultura\n" +
      `${SINTETICOS[0]!.cpf.slice(0, 10)}9; ;Rua B, 2 — Centro, Sorriso/MT;;;;\n`;

    const preparo = await prepararImportacaoAssinantes(analista, {
      familia: "ASSINANTES_NUCLEO",
      nomeArquivo: "assinantes-sintetico.csv",
      conteudo: Buffer.from(comErros, "utf8"),
    });
    importacaoNucleoId = preparo.importacaoId;

    expect(preparo.totalLinhas).toBe(8);
    expect(preparo.previa).toHaveLength(5);
    expect(preparo.sugestaoMapeamento["cpf_cliente"]).toBe("cpf");
    expect(preparo.sugestaoMapeamento["nome_completo"]).toBe("nome");
    expect(preparo.sugestaoMapeamento["endereco_residencial"]).toBe("endereco");
    expect(preparo.sugestaoMapeamento["e-mail"]).toBe("email");
  });

  it("leitura não importa: a permissão barra antes de qualquer staging", async () => {
    await expect(
      prepararImportacaoAssinantes(leitura, {
        familia: "ASSINANTES_NUCLEO",
        nomeArquivo: "x.csv",
        conteudo: Buffer.from("cpf\n111\n", "utf8"),
      }),
    ).rejects.toThrow(ErroDeAutorizacao);
  });

  const MAPEAMENTO_NUCLEO = {
    cpf_cliente: "cpf",
    nome_completo: "nome",
    endereco_residencial: "endereco",
    cep: "cep",
    "e-mail": "email",
    telefone: "telefone",
    preferencia: "preferencia",
  } as const;

  it("passo 3-4: dry-run incremental valida linha a linha sem tocar o cadastro (RN29/RN31)", async () => {
    const resumo = await aplicarMapeamentoNucleo(analista, importacaoNucleoId, {
      mapeamento: { ...MAPEAMENTO_NUCLEO },
      politica: "INCREMENTAL",
    });
    expect(resumo).toMatchObject({
      linhasLidas: 8,
      novos: 6,
      atualizados: 0,
      quarentena: 2,
      foraDaBase: null,
    });
    expect(await prisma.assinante.count()).toBe(0);
  });

  it("passo 5: confirmação efetiva o upsert com derivação (RN32) e auditoria", async () => {
    const resumo = await confirmarImportacaoNucleo(analista, importacaoNucleoId);
    expect(resumo.novos).toBe(6);
    expect(resumo.quarentena).toBe(2);
    expect(await prisma.assinante.count()).toBe(6);

    const primeiro = SINTETICOS[0]!;
    const assinantes = await prisma.assinante.findMany();
    const importado = assinantes.find((a) => a.nome === primeiro.nome)!;
    expect(importado.uf).toBe(primeiro.uf);
    expect(importado.municipio).toBe(primeiro.municipio);
    // CPF em claro NUNCA é persistido: só hash + cifrado.
    expect(importado.cpfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(importado.cpfCifrado.startsWith("v1:")).toBe(true);
    expect(JSON.stringify(importado)).not.toContain(primeiro.cpf);

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "assinante", campo: "importacao_nucleo" },
    });
    expect(eventos).toHaveLength(6);
    // Trilha sem dado sensível: e-mail mascarado, CPF ausente.
    expect(eventos[0]!.valorNovo).not.toContain(primeiro.cpf);

    const quarentena = await prisma.importacao.findUniqueOrThrow({
      where: { id: importacaoNucleoId },
    });
    expect(quarentena.linhasErro).toBe(2);
    expect(quarentena.relatorioQuarentena).toBeTruthy();
  });

  it("reimportar o mesmo arquivo é idempotente: nada novo, nada duplicado (RN29)", async () => {
    const csv = gerarCsvNucleoSintetico(SINTETICOS);
    const preparo = await prepararImportacaoAssinantes(analista, {
      familia: "ASSINANTES_NUCLEO",
      nomeArquivo: "assinantes-sintetico-reimportacao.csv",
      conteudo: Buffer.from(csv, "utf8"),
    });
    const dryRun = await aplicarMapeamentoNucleo(analista, preparo.importacaoId, {
      mapeamento: { ...MAPEAMENTO_NUCLEO },
      politica: "INCREMENTAL",
    });
    expect(dryRun.novos).toBe(0);
    expect(dryRun.atualizados).toBe(6);
    await confirmarImportacaoNucleo(analista, preparo.importacaoId);
    expect(await prisma.assinante.count()).toBe(6);
  });

  it("enriquecimento casa por CPF, grava proveniência e registra divergência sem sobrescrever (RN35)", async () => {
    const csvBase = gerarCsvEnriquecimentoSintetico(SINTETICOS.slice(0, 4));
    // Linha com e-mail divergente do núcleo + CPF fora da base.
    const alvo = SINTETICOS[0]!;
    const foraDaBase = gerarAssinantesSinteticos(7, 99)[6]!;
    const csv =
      "cpf;cultura;unidade produtiva;regiao da unidade produtiva;contato preferido;e-mail\n" +
      csvBase
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((linha, indice) =>
          indice === 0 ? `${linha};divergente@exemplo.com.br` : `${linha};`,
        )
        .join("\n") +
      `\n${foraDaBase.cpf};soja;Sorriso/MT;Centro-Oeste;whatsapp;\n`;

    const preparo = await prepararImportacaoAssinantes(gestor, {
      familia: "ASSINANTES_ENRIQUECIMENTO",
      nomeArquivo: "enriquecimento-sintetico.csv",
      conteudo: Buffer.from(csv, "utf8"),
    });
    const dryRun = await aplicarMapeamentoEnriquecimento(gestor, preparo.importacaoId, {
      mapeamento: {
        cpf: "cpf",
        cultura: "Cultura",
        "unidade produtiva": "Unidade Produtiva",
        "regiao da unidade produtiva": "Região da Unidade Produtiva",
        "contato preferido": "Contato Preferido",
        "e-mail": "email",
      },
    });
    expect(dryRun.assinantesEnriquecidos).toBe(4);
    expect(dryRun.naoEncontrados).toBe(1);

    const emailAntes = (await prisma.assinante.findFirstOrThrow({
      where: { nome: alvo.nome },
    })).email;

    const resumo = await confirmarImportacaoEnriquecimento(gestor, preparo.importacaoId);
    expect(resumo.assinantesEnriquecidos).toBe(4);
    expect(resumo.naoEncontrados).toBe(1);
    expect(resumo.divergencias).toBe(1);

    // Núcleo intacto (RN35): o e-mail divergente NÃO sobrescreveu.
    const depois = await prisma.assinante.findFirstOrThrow({ where: { nome: alvo.nome } });
    expect(depois.email).toBe(emailAntes);

    // Atributo gravado com proveniência (fonte + data).
    const atributos = await prisma.atributoEnriquecimento.findMany({
      where: { assinante: { nome: alvo.nome } },
      include: { catalogo: true },
    });
    const cultura = atributos.find((a) => a.catalogo.slug === "cultura")!;
    expect(cultura.valor).toBe(alvo.atributos.cultura);
    expect(cultura.fonte).toBe("enriquecimento-sintetico.csv");
    expect(cultura.dataReferencia).toBeInstanceOf(Date);

    // Catálogo alimenta o construtor (RN33).
    const slugs = await prisma.catalogoAtributo.findMany({ select: { slug: true } });
    expect(slugs.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(["cultura", "unidade-produtiva", "contato-preferido"]),
    );
  });

  it("contagem viva: SQL do compilador confere com a contagem em memória das fixtures (RN33)", async () => {
    const esperadoMT = SINTETICOS.filter((s) => s.uf === "MT").length;
    const contagem = await contarAssinantes([
      { campo: "uf", operador: "e", valor: "MT" },
    ]);
    expect(contagem).toEqual({ status: "OK", total: esperadoMT });

    const primeiros4 = SINTETICOS.slice(0, 4);
    const esperadoSoja = primeiros4.filter((s) => s.atributos.cultura === "soja").length;
    const porCultura = await contarAssinantes([
      { campo: "cultura", operador: "e", valor: "soja" },
    ]);
    expect(porCultura).toEqual({ status: "OK", total: esperadoSoja });

    const regraDeUso = await contarAssinantes([
      { campo: "uso-90-dias", operador: "e", valor: "com" },
    ]);
    expect(regraDeUso.status).toBe("AGUARDANDO_TELEMETRIA");

    await expect(
      contarAssinantes([{ campo: "fora-do-catalogo", operador: "e", valor: "x" }]),
    ).rejects.toThrow("não está no catálogo");
  });

  it("máscara é decisão do servidor (RN30): mascarado por padrão, pleno auditado", async () => {
    const semPermissao = await decidirExibicaoPlena(analista, {
      exibirPlenos: true,
      contexto: "carteira",
    });
    expect(semPermissao.dadosPlenos).toBe(false);

    const carteiraMascarada = await listarCarteira({}, { dadosPlenos: false });
    if (carteiraMascarada.status !== "OK") throw new Error("esperava OK");
    expect(carteiraMascarada.total).toBe(6);
    for (const linha of carteiraMascarada.linhas) {
      expect(linha.cpf).toMatch(/^\*\*\*\.___\.\*\*\*-\d{2}$/);
      if (linha.email) expect(linha.email).toContain("****@");
    }

    const eventosAntes = await prisma.auditoriaEvento.count({
      where: { campo: "acesso_dados_plenos" },
    });
    const comPermissao = await decidirExibicaoPlena(gestor, {
      exibirPlenos: true,
      contexto: "carteira",
    });
    expect(comPermissao.dadosPlenos).toBe(true);
    const eventosDepois = await prisma.auditoriaEvento.count({
      where: { campo: "acesso_dados_plenos" },
    });
    expect(eventosDepois).toBe(eventosAntes + 1);

    const carteiraPlena = await listarCarteira({}, { dadosPlenos: true });
    if (carteiraPlena.status !== "OK") throw new Error("esperava OK");
    const cpfsPlenos = carteiraPlena.linhas.map((linha) => linha.cpf);
    for (const sintetico of SINTETICOS) {
      const formatado = `${sintetico.cpf.slice(0, 3)}.${sintetico.cpf.slice(3, 6)}.${sintetico.cpf.slice(6, 9)}-${sintetico.cpf.slice(9)}`;
      expect(cpfsPlenos).toContain(formatado);
    }
  });

  it("perfil (T19): estados de máscara, assinatura com origem pendente e uso aguardando", async () => {
    const alvo = SINTETICOS[1]!;
    const registro = await prisma.assinante.findFirstOrThrow({ where: { nome: alvo.nome } });
    const perfil = await perfilAssinante(registro.id, { dadosPlenos: false });
    expect(perfil).not.toBeNull();
    expect(perfil!.cpf).toMatch(/^\*\*\*\.___\.\*\*\*-\d{2}$/);
    // Assinatura não veio de carga alguma (origem [A CONFIRMAR]) — seção
    // existe e fica sinalizada como pendente, sem dado inventado.
    expect(perfil!.assinatura).toBeNull();
    // Quem entra pela T20 é dado "de produção" do ambiente: a marca
    // SINTÉTICO pertence ao caminho direto de fixtures (ver teste de
    // performance) — a importação real nunca a aplica por conta própria.
    expect(perfil!.marcaSintetico).toBe(false);
  });

  it("segmento salvo guarda a regra declarativa; T21 recalcula a contagem (RN33)", async () => {
    const segmento = await salvarSegmento(gestor, {
      nome: "MT com soja",
      regras: [
        { campo: "uf", operador: "e", valor: "MT" },
        { campo: "cultura", operador: "e", valor: "soja", combinadorAnterior: "E" },
      ],
    });
    expect(segmento.regras).toEqual([
      { campo: "uf", operador: "e", valor: "MT" },
      { campo: "cultura", operador: "e", valor: "soja", combinadorAnterior: "E" },
    ]);

    await expect(
      salvarSegmento(gestor, {
        nome: "Inválido",
        regras: [{ campo: "hack", operador: "e", valor: "x" }],
      }),
    ).rejects.toThrow("não está no catálogo");

    const lista = await listarSegmentosComContagem();
    const salvo = lista.find((item) => item.nome === "MT com soja")!;
    expect(salvo.resumo).toBe("UF é MT E cultura é soja");
    const esperado = SINTETICOS.slice(0, 4).filter(
      (s) => s.uf === "MT" && s.atributos.cultura === "soja",
    ).length;
    expect(salvo.contagem).toEqual({ status: "OK", total: esperado });
  });

  it("exportação exige permissão e finalidade; snapshot com hash e auditoria (RN34)", async () => {
    await expect(
      exportarLista(analista, { regras: [], finalidade: "qualquer" }),
    ).rejects.toThrow(ErroDeAutorizacao);
    await expect(
      exportarLista(gestor, { regras: [], finalidade: "   " }),
    ).rejects.toThrow("finalidade da exportação é obrigatória");
    await expect(
      exportarLista(gestor, {
        regras: [{ campo: "uso-90-dias", operador: "e", valor: "com" }],
        finalidade: "campanha",
      }),
    ).rejects.toThrow("não é computável");

    const exportacao = await exportarLista(gestor, {
      regras: [{ campo: "uf", operador: "e", valor: "MT" }],
      finalidade: "Campanha sintética de teste de integração",
    });
    const esperadoMT = SINTETICOS.filter((s) => s.uf === "MT").length;
    expect(exportacao.contagem).toBe(esperadoMT);
    expect(exportacao.finalidade).toContain("Campanha sintética");

    const { conteudo } = await lerSnapshotExportacao(gestor, exportacao.id);
    expect(hashDeSnapshot(conteudo)).toBe(exportacao.hashArquivo);
    const texto = conteudo.toString("utf8");
    expect(texto.split("\n")[0]).toBe("nome;cpf;email;telefone;uf;municipio;preferencia");
    expect(texto.split("\n").filter(Boolean)).toHaveLength(esperadoMT + 1);

    const evento = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "exportacao_lista", entidadeId: exportacao.id },
    });
    expect(evento).not.toBeNull();
    expect(evento!.valorNovo).toContain("Campanha sintética");

    await expect(lerSnapshotExportacao(leitura, exportacao.id)).rejects.toThrow(
      ErroDeAutorizacao,
    );
  });

  it("cenário do desastre (RN29): arquivo parcial como foto completa exige confirmação mostrando quantos sairiam", async () => {
    const parcial = gerarCsvNucleoSintetico(SINTETICOS.slice(0, 1));
    const preparo = await prepararImportacaoAssinantes(gestor, {
      familia: "ASSINANTES_NUCLEO",
      nomeArquivo: "parcial-como-foto-completa.csv",
      conteudo: Buffer.from(parcial, "utf8"),
    });
    const dryRun = await aplicarMapeamentoNucleo(gestor, preparo.importacaoId, {
      mapeamento: { ...MAPEAMENTO_NUCLEO },
      politica: "FOTO_COMPLETA",
    });
    // O dry-run EXPÕE o estrago: 5 dos 6 ativos sairiam.
    expect(dryRun.foraDaBase).toBe(5);
    expect(await prisma.assinante.count({ where: { statusBase: "ATIVO" } })).toBe(6);

    // Sem o texto de confirmação, nada acontece.
    await expect(
      confirmarImportacaoNucleo(gestor, preparo.importacaoId),
    ).rejects.toThrow(ErroDeValidacao);
    await expect(
      confirmarImportacaoNucleo(gestor, preparo.importacaoId, {
        confirmacaoFotoCompleta: "CONFIRMO",
      }),
    ).rejects.toThrow('digite "FOTO COMPLETA"');
    expect(await prisma.assinante.count({ where: { statusBase: "ATIVO" } })).toBe(6);

    // Com a confirmação exata, marca fora da base com auditoria.
    const resumo = await confirmarImportacaoNucleo(gestor, preparo.importacaoId, {
      confirmacaoFotoCompleta: "foto completa",
    });
    expect(resumo.foraDaBase).toBe(5);
    expect(await prisma.assinante.count({ where: { statusBase: "ATIVO" } })).toBe(1);
    const eventos = await prisma.auditoriaEvento.count({
      where: {
        entidade: "assinante",
        campo: "statusBase",
        valorNovo: "FORA_DA_BASE",
      },
    });
    expect(eventos).toBe(5);

    // A carteira (T18) conta apenas ativos.
    const contagem = await contarAssinantes([]);
    expect(contagem).toEqual({ status: "OK", total: 1 });
  });

  it("reaparecer em carga incremental devolve o assinante à base (RN29)", async () => {
    const devolvido = SINTETICOS[2]!;
    const csv = gerarCsvNucleoSintetico([devolvido]);
    const preparo = await prepararImportacaoAssinantes(gestor, {
      familia: "ASSINANTES_NUCLEO",
      nomeArquivo: "reativacao.csv",
      conteudo: Buffer.from(csv, "utf8"),
    });
    await aplicarMapeamentoNucleo(gestor, preparo.importacaoId, {
      mapeamento: { ...MAPEAMENTO_NUCLEO },
      politica: "INCREMENTAL",
    });
    await confirmarImportacaoNucleo(gestor, preparo.importacaoId);

    const registro = await prisma.assinante.findFirstOrThrow({
      where: { nome: devolvido.nome },
    });
    expect(registro.statusBase).toBe("ATIVO");
    expect(await prisma.assinante.count({ where: { statusBase: "ATIVO" } })).toBe(2);
  });

  it("a coluna Patrocinador cria o vínculo na efetivação (RN63/C-A) — e 'Broto' não vincula", async () => {
    await limparModuloAssinantes();
    const patrocinador = await prisma.patrocinador.create({
      data: { razaoSocial: "[TESTE-C-A] Yamer Agro", cnpj: "11222333000181" },
      select: { id: true },
    });
    const comVinculo = SINTETICOS[0]!;
    const semVinculo = SINTETICOS[1]!;
    // CSV com a coluna nativa Patrocinador: uma linha aponta o patrocinador
    // cadastrado (casa por nome, com acento/caixa tolerados) e a outra traz
    // "Broto", que vira Promocional Broto e NÃO cria vínculo.
    const csv =
      "cpf;nome;patrocinador\r\n" +
      `${comVinculo.cpf};${comVinculo.nome};[teste-c-a] YAMER agro\r\n` +
      `${semVinculo.cpf};${semVinculo.nome};Broto\r\n`;
    const preparo = await prepararImportacaoAssinantes(gestor, {
      familia: "ASSINANTES_NUCLEO",
      nomeArquivo: "com-patrocinador.csv",
      conteudo: Buffer.from(csv, "utf8"),
    });
    await aplicarMapeamentoNucleo(gestor, preparo.importacaoId, {
      mapeamento: { cpf: "cpf", nome: "nome", patrocinador: "patrocinador" },
      politica: "INCREMENTAL",
    });
    await confirmarImportacaoNucleo(gestor, preparo.importacaoId);

    const vinculos = await prisma.vinculoPatrocinio.findMany({
      where: { patrocinadorId: patrocinador.id, fim: null },
      include: { assinante: { select: { nome: true } } },
    });
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]!.assinante.nome).toBe(comVinculo.nome);

    // O vínculo foi auditado com o campo desta origem.
    const auditoria = await prisma.auditoriaEvento.count({
      where: { entidade: "VinculoPatrocinio", campo: "importacao_nucleo" },
    });
    expect(auditoria).toBe(1);

    // Idempotência: reimportar o mesmo arquivo não duplica o vínculo (RN29).
    const preparo2 = await prepararImportacaoAssinantes(gestor, {
      familia: "ASSINANTES_NUCLEO",
      nomeArquivo: "com-patrocinador-2.csv",
      conteudo: Buffer.from(csv, "utf8"),
    });
    await aplicarMapeamentoNucleo(gestor, preparo2.importacaoId, {
      mapeamento: { cpf: "cpf", nome: "nome", patrocinador: "patrocinador" },
      politica: "INCREMENTAL",
    });
    await confirmarImportacaoNucleo(gestor, preparo2.importacaoId);
    expect(
      await prisma.vinculoPatrocinio.count({
        where: { patrocinadorId: patrocinador.id, fim: null },
      }),
    ).toBe(1);
  });

  it("Patrocinador informado que não existe manda a linha à quarentena com o motivo (RN63/RN55)", async () => {
    await limparModuloAssinantes();
    await prisma.patrocinador.create({
      data: { razaoSocial: "[TESTE-C-A] Yamer Agro", cnpj: "11222333000181" },
    });
    const casa = SINTETICOS[0]!;
    const naoCasa = SINTETICOS[1]!;
    // Uma linha aponta patrocinador existente; a outra, um nome fantasma.
    const csv =
      "cpf;nome;patrocinador\r\n" +
      `${casa.cpf};${casa.nome};[teste-c-a] yamer agro\r\n` +
      `${naoCasa.cpf};${naoCasa.nome};Empresa Fantasma\r\n`;
    const preparo = await prepararImportacaoAssinantes(gestor, {
      familia: "ASSINANTES_NUCLEO",
      nomeArquivo: "patrocinador-fantasma.csv",
      conteudo: Buffer.from(csv, "utf8"),
    });
    const resumo = await aplicarMapeamentoNucleo(gestor, preparo.importacaoId, {
      mapeamento: { cpf: "cpf", nome: "nome", patrocinador: "patrocinador" },
      politica: "INCREMENTAL",
    });

    // A linha do patrocinador fantasma foi para a quarentena, com o motivo
    // nomeado no detalhe do dry-run (part A) — a válida seguiu como nova.
    expect(resumo.novos).toBe(1);
    expect(resumo.quarentena).toBe(1);
    const detalhe = resumo.quarentenaDetalhe ?? [];
    expect(detalhe).toHaveLength(1);
    expect(detalhe[0]!.motivos.join(" ")).toMatch(/Patrocinador não encontrado/);

    // Efetivar só traz a linha válida; a fantasma não entra.
    await confirmarImportacaoNucleo(gestor, preparo.importacaoId);
    expect(await prisma.assinante.count()).toBe(1);
    expect((await prisma.assinante.findFirstOrThrow()).nome).toBe(casa.nome);
  });

  it("o modelo .xlsx traz as abas, o cabeçalho e o dropdown de Patrocinador com o código (RN63)", async () => {
    await limparModuloAssinantes();
    const patrocinador = await prisma.patrocinador.create({
      data: { razaoSocial: "[TESTE-C-A] Yamer Agro", cnpj: "11222333000181" },
      select: { id: true, razaoSocial: true },
    });

    const buffer = await gerarModeloAssinantesXlsx();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    expect(wb.getWorksheet("Assinantes")).toBeDefined();
    expect(wb.getWorksheet("Patrocinadores (referência)")).toBeDefined();
    const listas = wb.getWorksheet("Listas");
    expect(listas).toBeDefined();

    // O cabeçalho da aba principal traz as colunas da Onda 12.
    const cabecalho = wb
      .getWorksheet("Assinantes")!
      .getRow(1)
      .values as Array<string | undefined>;
    expect(cabecalho).toContain("Patrocinador");
    expect(cabecalho).toContain("Perfil de assinatura");

    // A lista do dropdown de Patrocinador traz "Razão Social — <id>".
    const opcoes: string[] = [];
    listas!.getColumn(1).eachCell((c) => opcoes.push(String(c.value ?? "")));
    expect(opcoes).toContain("Broto");
    expect(opcoes.some((o) => o.includes(patrocinador.id))).toBe(true);
    expect(opcoes.some((o) => o.startsWith(patrocinador.razaoSocial))).toBe(true);
  });
});

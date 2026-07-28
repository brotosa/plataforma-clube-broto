import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { gerarAssinantesSinteticos } from "@/infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import { ErroDeArquivoAusente } from "@/dominio/arquivos/artefato-derivado";
import { ErroDeEnvioDeArquivo } from "@/dominio/arquivos/arquivo-enviado";
import { criarArmazenadorPrisma } from "@/infra/exportacoes/armazenador";
import { ehFalhaConhecida, mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import { type Ator } from "./contexto";
import {
  alternarOfertaDaCampanha,
  ativarCampanha,
  atualizarCampanha,
  criarCampanha,
  gerarNovaVersaoDoKit,
  salvarPeca,
} from "./campanhas";
import { exportarLista, lerSnapshotExportacao } from "./assinantes-segmentos";

/**
 * F21 — a falha que originou a Onda 13, reproduzida antes de consertada.
 *
 * **O que acontece em produção.** A peça da campanha e o `publico.csv`
 * são gravados no disco da máquina (`var/exportacoes/`). O disco de
 * produção é efêmero e por instância: o arquivo escrito numa instância
 * não existe na seguinte, nem depois de um deploy. Quando a ativação vai
 * ler os dois para montar o kit, não acha nenhum — a exceção sobe e a
 * tela devolve a mensagem genérica da RN55, sem dizer o que houve.
 *
 * **Como se reproduz aqui.** Uma instância nova não é simulável dentro do
 * mesmo processo, mas o efeito dela é: entre gravar e ler, o conteúdo do
 * disco desaparece. `apagarODiscoInteiro()` é esse deploy — o registro no
 * banco continua de pé (a tela mostra "1 peça(s)" porque a contagem vem
 * dali), e o binário não está em lugar nenhum.
 *
 * Este arquivo é o teste de aceite da fase: enquanto o armazenamento for
 * o disco, o primeiro caso falha; com o conteúdo no banco, ele passa —
 * apagar o disco deixa de ter efeito algum sobre a ativação.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

process.env.CPF_HASH_KEY ??= "chave-de-teste-integracao-hmac";
process.env.APP_ENCRYPTION_KEY ??= "chave-de-teste-integracao-cifra";

const prisma = new PrismaClient();
const SINTETICOS = gerarAssinantesSinteticos(21, 6);

/** PNG válido pelo conteúdo — o suficiente para a régua de tipo real. */
const PNG_MINIMO = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

/** O deploy: o disco da instância anterior deixa de existir. */
async function apagarODiscoInteiro() {
  await rm(path.join(process.cwd(), "var", "exportacoes"), { recursive: true, force: true });
}

/** A porta, na única implementação que existe (RN71). */
const armazenador = criarArmazenadorPrisma();

let gestor: Ator;
let campanhaId = "";
let ofertaId = "";

async function upsertGestor(): Promise<Ator> {
  const usuario = await prisma.usuario.upsert({
    where: { email: "gestor.f21@dev.clubebroto.local" },
    update: {},
    create: {
      nome: "Perfil GESTOR (teste F21)",
      email: "gestor.f21@dev.clubebroto.local",
      senhaHash: "sem-login",
      papel: "GESTOR",
    },
  });
  return { id: usuario.id, papel: usuario.papel };
}

async function limparDadosDeTeste() {
  await prisma.arquivoArmazenado.deleteMany({ where: { chave: { contains: "TESTE-F21" } } });
  await prisma.kitCampanha.deleteMany({});
  await prisma.pecaCampanha.deleteMany({});
  await prisma.campanhaOferta.deleteMany({});
  await prisma.campanhaCesta.deleteMany({});
  await prisma.oferta.updateMany({
    data: { destinacao: "VITRINE", destinacaoCampanhaId: null, destinacaoCestaId: null },
  });
  await prisma.campanha.deleteMany({ where: { nome: { startsWith: "[TESTE-F21]" } } });
  await prisma.oferta.deleteMany({ where: { titulo: { startsWith: "[TESTE-F21]" } } });
  const solucoes = await prisma.solucao.findMany({
    where: { nome: { startsWith: "[TESTE-F21]" } },
    select: { id: true },
  });
  const ids = solucoes.map(({ id }) => id);
  await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: ids } } });
  await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: ids } } });
  await prisma.solucao.deleteMany({ where: { id: { in: ids } } });
  await prisma.empresa.deleteMany({ where: { nomeFantasia: { startsWith: "[TESTE-F21]" } } });
  await prisma.assinante.deleteMany({ where: { nome: { startsWith: "[TESTE-F21]" } } });
  await prisma.exportacaoLista.deleteMany({ where: { finalidade: { contains: "[TESTE-F21]" } } });
}

describe.skipIf(!temBanco)("RN71 — arquivo derivado sobrevive à instância", () => {
  beforeAll(async () => {
    gestor = await upsertGestor();
    await limparDadosDeTeste();

    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-F21] Aliada do armazenamento",
        estagio: "ALIADA_ATIVA",
        dataEntrada: new Date("2026-01-10T00:00:00Z"),
      },
    });
    const cultura = await prisma.cultura.findFirstOrThrow({ where: { nome: "Café" } });
    const uf = await prisma.uf.findFirstOrThrow({ where: { sigla: "MG" } });
    const solucao = await prisma.solucao.create({
      data: {
        empresaId: empresa.id,
        nome: "[TESTE-F21] Consultoria agronômica",
        descricaoCurta: "Acompanhamento técnico da lavoura, com relatório mensal.",
        coberturaNacional: false,
        culturas: { create: [{ culturaId: cultura.id }] },
        ufs: { create: [{ ufId: uf.id }] },
      },
    });
    const oferta = await prisma.oferta.create({
      data: {
        solucaoId: solucao.id,
        titulo: "[TESTE-F21] 20% na consultoria",
        natureza: "BENEFICIO",
        tipoBeneficioId: (
          await prisma.tipoBeneficio.findUniqueOrThrow({ where: { slug: "PCT_DESCONTO" } })
        ).id,
        mecanicaId: (
          await prisma.mecanica.findUniqueOrThrow({ where: { slug: "CHECKOUT_CLUBE" } })
        ).id,
        precoDe: 100,
        precoPor: 80,
        vigenciaInicio: new Date("2026-08-01T00:00:00Z"),
        status: "PUBLICADA",
      },
    });
    ofertaId = oferta.id;

    for (const [indice, sintetico] of SINTETICOS.entries()) {
      await prisma.assinante.create({
        data: {
          nome: `[TESTE-F21] ${sintetico.nome}`,
          cpfHash: hashCpf(sintetico.cpf),
          cpfCifrado: cifrarCpf(sintetico.cpf),
          uf: "MG",
          municipio: "Uberaba",
          preferencia: indice % 2 === 0 ? "AGRICULTURA" : "PECUARIA",
          statusBase: "ATIVO",
        },
      });
    }
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("ativação conclui mesmo depois de o disco da instância anterior sumir", async () => {
    const campanha = await criarCampanha(gestor, {
      nome: "[TESTE-F21] Safra do armazenamento",
      objetivo: "Provar que o arquivo sobrevive ao deploy",
    });
    campanhaId = campanha.id;
    await atualizarCampanha(gestor, campanhaId, {
      origemPublico: "REGRAS_PROPRIAS",
      regrasPublico: [{ campo: "uf", operador: "e", valor: "MG" }],
      vigenciaInicio: "2026-08-01",
      vigenciaFim: "2026-08-31",
      instrucoes: "Disparar na primeira semana.",
    });
    await alternarOfertaDaCampanha(gestor, campanhaId, ofertaId, true);

    const formato = await prisma.formatoPeca.findUniqueOrThrow({ where: { slug: "EMAIL" } });
    await salvarPeca(gestor, campanhaId, {
      formatoSlug: formato.slug,
      titulo: "Sua safra merece o Clube Broto",
      texto: "Ofertas selecionadas para quem planta e cria.",
      imagem: { nomeArquivo: "peca.png", conteudo: PNG_MINIMO },
    });

    // O deploy. Daqui em diante a instância é outra e o disco, vazio.
    await apagarODiscoInteiro();

    const resultado = await ativarCampanha(gestor, campanhaId);
    expect(resultado.resultado).toBe("ATIVA");

    const ativada = await prisma.campanha.findUniqueOrThrow({
      where: { id: campanhaId },
      include: { kits: true, publicoSnapshot: true },
    });
    expect(ativada.estado).toBe("ATIVA");
    expect(ativada.kits).toHaveLength(1);
    expect(ativada.publicoSnapshot?.contagem).toBe(SINTETICOS.length);
  });

  it("os três artefatos vão e voltam do armazenamento byte a byte", async () => {
    const campanha = await prisma.campanha.findUniqueOrThrow({
      where: { id: campanhaId },
      include: { kits: true, pecas: true, publicoSnapshot: true },
    });

    // Imagem da peça: o que volta é o que foi enviado.
    const peca = campanha.pecas[0]!;
    expect(peca.imagemChave).not.toBeNull();
    const imagem = await armazenador.ler(peca.imagemChave!);
    expect(imagem.equals(PNG_MINIMO)).toBe(true);

    // Snapshot do público: CSV legível, com a contagem do congelamento.
    const csv = await armazenador.ler(campanha.publicoSnapshot!.arquivoChave);
    const linhas = csv.toString("utf8").trim().split("\n");
    expect(linhas).toHaveLength(SINTETICOS.length + 1);

    // Kit: zip legível, e a assinatura do formato prova que não é truncado.
    const pacote = await armazenador.ler(campanha.kits[0]!.arquivoChave);
    expect(pacote.subarray(0, 2).toString("latin1")).toBe("PK");

    // O tipo gravado é o do artefato, não deduzido do nome do arquivo.
    const gravados = await prisma.arquivoArmazenado.findMany({
      where: {
        chave: {
          in: [peca.imagemChave!, campanha.publicoSnapshot!.arquivoChave, campanha.kits[0]!.arquivoChave],
        },
      },
      select: { chave: true, tipoMime: true, bytes: true },
    });
    const porChave = new Map(gravados.map((a) => [a.chave, a]));
    expect(porChave.get(peca.imagemChave!)?.tipoMime).toBe("image/png");
    expect(porChave.get(campanha.publicoSnapshot!.arquivoChave)?.tipoMime).toBe("text/csv");
    expect(porChave.get(campanha.kits[0]!.arquivoChave)?.tipoMime).toBe("application/zip");
    expect(porChave.get(peca.imagemChave!)?.bytes).toBe(PNG_MINIMO.length);
  });

  it("nova versão do kit grava o pacote novo e não toca no anterior (RN45)", async () => {
    const antes = await prisma.kitCampanha.findFirstOrThrow({
      where: { campanhaId },
      orderBy: { versao: "asc" },
    });
    const conteudoAntes = await armazenador.ler(antes.arquivoChave);

    await gerarNovaVersaoDoKit(gestor, campanhaId);

    const kits = await prisma.kitCampanha.findMany({
      where: { campanhaId },
      orderBy: { versao: "asc" },
    });
    expect(kits).toHaveLength(2);
    const v2 = await armazenador.ler(kits[1]!.arquivoChave);
    expect(v2.subarray(0, 2).toString("latin1")).toBe("PK");
    // O v1 continua exatamente como estava: chave distinta, conteúdo intacto.
    expect(kits[0]!.arquivoChave).not.toBe(kits[1]!.arquivoChave);
    expect((await armazenador.ler(kits[0]!.arquivoChave)).equals(conteudoAntes)).toBe(true);
  });

  it("exportação de lista faz ida e volta pela porta (RN34)", async () => {
    const exportacao = await exportarLista(gestor, {
      regras: [{ campo: "uf", operador: "e", valor: "MG" }],
      finalidade: "[TESTE-F21] conferência do armazenamento",
    });
    expect(exportacao.arquivoChave).toMatch(/^listas-contato\//);

    const { conteudo } = await lerSnapshotExportacao(gestor, exportacao.id);
    expect(conteudo.toString("utf8").trim().split("\n")).toHaveLength(exportacao.contagem + 1);
  });
});

describe.skipIf(!temBanco)("RN71 — chave órfã falha nomeando a causa (RN55)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cada artefato diz o que houve e o que fazer", async () => {
    const casos = [
      { chave: "pecas/TESTE-F21/nao-existe.png", remedio: "Reenvie a imagem" },
      { chave: "listas-contato/2026-07-28-TESTE-F21.csv", remedio: "Refaça a exportação" },
      { chave: "kits/TESTE-F21/v9-inexistente.zip", remedio: "Gere uma nova versão do kit" },
    ];

    for (const caso of casos) {
      await expect(armazenador.ler(caso.chave)).rejects.toBeInstanceOf(ErroDeArquivoAusente);
      const erro = await armazenador.ler(caso.chave).catch((e: unknown) => e);
      expect((erro as Error).message).toContain(caso.remedio);
      // Nem a chave nem exceção crua chegam a quem lê a tela.
      expect((erro as Error).message).not.toContain(caso.chave);
      expect((erro as Error).message).not.toMatch(/ENOENT|prisma|SELECT/i);
    }
  });

  /**
   * O que a base de demonstração exibe hoje. A falha precisa atravessar o
   * mapeador da RN55 com a própria mensagem — se cair no genérico, quem
   * está na tela lê "não foi possível" e não fica sabendo que a peça
   * precisa ser reenviada.
   */
  it("a mensagem sobe inteira pelo mapeador da RN55, sem virar genérica", async () => {
    const erro = await armazenador
      .ler("kits/TESTE-F21/v9-inexistente.zip")
      .catch((e: unknown) => e);

    expect(ehFalhaConhecida(erro)).toBe(true);
    const mensagens = mensagensDeFalha(erro, {
      operacao: "baixar o kit",
      semPermissao: "sem permissão",
      contexto: "teste",
    });
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]).toContain("Gere uma nova versão do kit");
    expect(mensagens[0]).not.toContain("log do servidor");
  });
});

describe.skipIf(!temBanco)("RN71 — os tetos, e a assimetria entre eles", () => {
  afterAll(async () => {
    await prisma.arquivoArmazenado.deleteMany({ where: { chave: { contains: "TESTE-F21" } } });
    await prisma.$disconnect();
  });

  it("imagem de peça acima de 1 MB é recusada com mensagem própria", async () => {
    const enorme = Buffer.concat([PNG_MINIMO, Buffer.alloc(1024 * 1024)]);
    const erro = await armazenador
      .salvar("pecas/TESTE-F21/enorme.png", enorme)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeEnvioDeArquivo);
    expect((erro as Error).message).toContain("A imagem da peça");
    expect((erro as Error).message).toContain("1 MB");
    // E não gravou nada.
    expect(
      await prisma.arquivoArmazenado.findUnique({ where: { chave: "pecas/TESTE-F21/enorme.png" } }),
    ).toBeNull();
  });

  it("a régua de envio da peça recusa formato que o e-mail não renderiza", async () => {
    const formato = await prisma.formatoPeca.findUniqueOrThrow({ where: { slug: "EMAIL" } });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');

    const erro = await salvarPeca(gestor, campanhaId, {
      formatoSlug: formato.slug,
      titulo: "Peça em vetor",
      imagem: { nomeArquivo: "arte.svg", conteudo: svg },
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeEnvioDeArquivo);
    expect((erro as Error).message).toContain("SVG");
  });

  /**
   * A correção que o teto de artefato gerado veio receber: ele **não**
   * trava. Recusar aqui deixaria a campanha sem poder ativar e sem remédio
   * — ninguém encolhe à mão um snapshot que a plataforma gerou.
   */
  it(
    "snapshot acima de 25 MB é gravado assim mesmo, e o sinal fica no log",
    async () => {
      const chave = "listas-contato/2026-07-28-TESTE-F21-grande.csv";
      const acimaDoTeto = Buffer.alloc(25 * 1024 * 1024 + 1, 0x2c);

      const inicio = performance.now();
      await expect(armazenador.salvar(chave, acimaDoTeto)).resolves.toBeUndefined();
      const duracao = Math.round(performance.now() - inicio);

      const gravado = await prisma.arquivoArmazenado.findUniqueOrThrow({
        where: { chave },
        select: { bytes: true, tipoMime: true },
      });
      expect(gravado.bytes).toBe(acimaDoTeto.length);
      expect(gravado.tipoMime).toBe("text/csv");

      // O número não é asserção — é evidência, e ela sustenta a condição
      // objetiva do README: guardar binário no banco é decisão defensável
      // ENQUANTO os arquivos forem pequenos. Um único artefato no teto já
      // custa segundos, e é isso que o adapter de objeto vem resolver.
      console.log(`RN71 — gravação de 25 MB no banco: ${duracao} ms`);
    },
    // Prazo próprio: os demais casos desta suíte trabalham com kilobytes e
    // o padrão de 5 s basta; este grava 25 MB de propósito.
    60_000,
  );
});

import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { gerarAssinantesSinteticos } from "@/infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import { type Ator } from "./contexto";
import { ativarCampanha, atualizarCampanha, criarCampanha, salvarPeca } from "./campanhas";
import { alternarOfertaDaCampanha } from "./campanhas";

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
});

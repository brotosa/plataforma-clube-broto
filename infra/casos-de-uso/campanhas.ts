import { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { exigeAprovacao } from "@/dominio/aprovacao/motor";
import {
  avisoDoEncerramento,
  cestaPodeEntrarEmCampanha,
  diffDoKit,
  efeitoDoEncerramento,
  ofertasPublicadasDaCampanha,
  ofertasQueBloqueiamCesta,
  proximaVersaoDoKit,
  validarAtivacao,
  type ConteudoKit,
  type DadosAtivacao,
} from "@/dominio/campanhas/regras";
import { validarEstruturaRegras } from "@/dominio/segmentacao/compilador";
import {
  criarKitAdapterGenericoZip,
  nomesDosArquivosDaPeca,
  type ManifestoKit,
  type PecaDoKit,
} from "@/infra/kits/adapter";
import { criarArmazenadorLocal, hashDeSnapshot } from "@/infra/exportacoes/armazenador";
import { logger } from "@/infra/log/logger";
import {
  montarSnapshotDoPublico,
  registrarExportacaoDentroDaTransacao,
} from "./assinantes-segmentos";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso da Onda 4 (F12): modelagem, ativação, encerramento e
 * cestas. Tudo com RBAC no início e auditoria transacional em cada
 * mutação; nenhum caminho de disparo existe (RN39) — a saída é o kit.
 *
 * A ativação (RN38) congela o público reaproveitando a exportação
 * auditada da F11: a permissão de exportar listas e a auditoria da RN34
 * são herdadas, com finalidade autopreenchida pelo nome da campanha.
 */

/** Arquivo pendente de gravação no armazenamento após o commit. */
export interface GravacaoPendente {
  chave: string;
  conteudo: Buffer;
}

const armazenador = criarArmazenadorLocal();

/** Grava no armazenamento os arquivos gerados dentro de uma transação. */
export async function gravarPendentesDoKit(pendentes: ReadonlyArray<GravacaoPendente>) {
  for (const pendente of pendentes) {
    await armazenador.salvar(pendente.chave, pendente.conteudo);
  }
}

/** Estado auditável da campanha — o que entra em valor anterior/novo. */
function estadoAuditavel(campanha: {
  nome: string;
  objetivo: string | null;
  origemPublico: string;
  segmentoId: string | null;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  instrucoes: string | null;
  estado: string;
}) {
  return {
    nome: campanha.nome,
    objetivo: campanha.objetivo,
    origemPublico: campanha.origemPublico,
    segmentoId: campanha.segmentoId,
    vigenciaInicio: campanha.vigenciaInicio?.toISOString().slice(0, 10) ?? null,
    vigenciaFim: campanha.vigenciaFim?.toISOString().slice(0, 10) ?? null,
    instrucoes: campanha.instrucoes,
    estado: campanha.estado,
  };
}

const dataDeTexto = (valor: string | null | undefined): Date | null =>
  valor ? new Date(`${valor}T00:00:00.000Z`) : null;

/** Campanha com tudo que as regras e o kit precisam ler. */
const INCLUSAO_COMPLETA = {
  segmento: true,
  publicoSnapshot: true,
  metas: { orderBy: { criadoEm: "asc" } },
  pecas: { orderBy: { ordem: "asc" }, include: { formato: true } },
  kits: { orderBy: { versao: "asc" } },
  ofertasAvulsas: {
    orderBy: { ordem: "asc" },
    include: { oferta: { include: { solucao: { include: { empresa: true } } } } },
  },
  cestas: {
    orderBy: { ordem: "asc" },
    include: {
      cesta: {
        include: {
          ofertas: {
            orderBy: { ordem: "asc" },
            include: { oferta: { include: { solucao: { include: { empresa: true } } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CampanhaInclude;

type CampanhaCompleta = Prisma.CampanhaGetPayload<{ include: typeof INCLUSAO_COMPLETA }>;

export async function lerCampanha(campanhaId: string): Promise<CampanhaCompleta> {
  return prisma.campanha.findUniqueOrThrow({
    where: { id: campanhaId },
    include: INCLUSAO_COMPLETA,
  });
}

/** Regra declarativa em vigor para o público da campanha. */
function regrasDoPublico(campanha: CampanhaCompleta): unknown {
  if (campanha.origemPublico === "SEGMENTO_SALVO") {
    return campanha.segmento?.regras ?? [];
  }
  return campanha.regrasPublico ?? [];
}

/** Conteúdo da campanha no formato que as regras puras esperam. */
function conteudoParaRegras(campanha: CampanhaCompleta) {
  return {
    ofertasAvulsas: campanha.ofertasAvulsas.map(({ oferta }) => ({
      id: oferta.id,
      titulo: oferta.titulo,
      status: oferta.status,
    })),
    cestas: campanha.cestas.map(({ cesta }) => ({
      id: cesta.id,
      nome: cesta.nome,
      ofertas: cesta.ofertas.map(({ oferta }) => ({
        id: oferta.id,
        titulo: oferta.titulo,
        status: oferta.status,
      })),
    })),
  };
}

/** Cria a campanha em rascunho (T23). */
export async function criarCampanha(
  ator: Ator,
  parametros: { nome: string; objetivo?: string | null },
) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");
  const nome = parametros.nome.trim();
  if (!nome) {
    throw new ErroDeValidacao(["O nome da campanha é obrigatório."]);
  }

  return prisma.$transaction(async (tx) => {
    const campanha = await tx.campanha.create({
      data: { nome, objetivo: parametros.objetivo?.trim() || null, autorId: ator.id },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "campanha",
      entidadeId: campanha.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(campanha),
    });
    return campanha;
  });
}

/**
 * Edita a modelagem (público, vigência, instruções). Campanha ativa ou
 * encerrada não volta à modelagem: o kit já saiu — ajuste gera nova
 * versão (RN45), nunca reescreve o que foi entregue.
 */
export async function atualizarCampanha(
  ator: Ator,
  campanhaId: string,
  parametros: {
    nome?: string;
    objetivo?: string | null;
    origemPublico?: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
    segmentoId?: string | null;
    regrasPublico?: unknown;
    vigenciaInicio?: string | null;
    vigenciaFim?: string | null;
    instrucoes?: string | null;
  },
) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.campanha.findUniqueOrThrow({ where: { id: campanhaId } });
    if (anterior.estado !== "RASCUNHO") {
      throw new ErroDeValidacao([
        "Somente campanhas em rascunho podem ser editadas; ajuste após a ativação gera nova versão do kit (RN45).",
      ]);
    }

    const dados: Prisma.CampanhaUpdateInput = {};
    if (parametros.nome !== undefined) {
      const nome = parametros.nome.trim();
      if (!nome) {
        throw new ErroDeValidacao(["O nome da campanha é obrigatório."]);
      }
      dados.nome = nome;
    }
    if (parametros.objetivo !== undefined) {
      dados.objetivo = parametros.objetivo?.trim() || null;
    }
    if (parametros.origemPublico !== undefined) {
      dados.origemPublico = parametros.origemPublico;
    }
    if (parametros.segmentoId !== undefined) {
      dados.segmento = parametros.segmentoId
        ? { connect: { id: parametros.segmentoId } }
        : { disconnect: true };
    }
    if (parametros.regrasPublico !== undefined) {
      // A regra da campanha é validada contra o mesmo catálogo do
      // construtor (RN33): campo fora do catálogo não entra.
      const regras = validarEstruturaRegras(parametros.regrasPublico);
      dados.regrasPublico = regras as unknown as Prisma.InputJsonValue;
    }
    if (parametros.vigenciaInicio !== undefined) {
      dados.vigenciaInicio = dataDeTexto(parametros.vigenciaInicio);
    }
    if (parametros.vigenciaFim !== undefined) {
      dados.vigenciaFim = dataDeTexto(parametros.vigenciaFim);
    }
    if (parametros.instrucoes !== undefined) {
      dados.instrucoes = parametros.instrucoes?.trim() || null;
    }

    const atualizada = await tx.campanha.update({ where: { id: campanhaId }, data: dados });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "campanha",
      entidadeId: campanhaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(atualizada),
    });
    return atualizada;
  });
}

/** Vincula ou desvincula uma oferta avulsa (T23 — Conteúdo). */
export async function alternarOfertaDaCampanha(
  ator: Ator,
  campanhaId: string,
  ofertaId: string,
  vincular: boolean,
) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");

  return prisma.$transaction(async (tx) => {
    const campanha = await tx.campanha.findUniqueOrThrow({ where: { id: campanhaId } });
    if (campanha.estado !== "RASCUNHO") {
      throw new ErroDeValidacao(["O conteúdo só muda com a campanha em rascunho."]);
    }
    if (vincular) {
      await tx.campanhaOferta.upsert({
        where: { campanhaId_ofertaId: { campanhaId, ofertaId } },
        update: {},
        create: { campanhaId, ofertaId },
      });
    } else {
      await tx.campanhaOferta.deleteMany({ where: { campanhaId, ofertaId } });
    }
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "campanha",
      entidadeId: campanhaId,
      autorId: ator.id,
      anterior: { ofertaAvulsa: vincular ? null : ofertaId },
      novo: { ofertaAvulsa: vincular ? ofertaId : null },
    });
  });
}

/**
 * Vincula ou desvincula uma cesta (T23 — Conteúdo). RN41: cesta com
 * oferta não publicada não entra em campanha.
 */
export async function alternarCestaDaCampanha(
  ator: Ator,
  campanhaId: string,
  cestaId: string,
  vincular: boolean,
) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");

  return prisma.$transaction(async (tx) => {
    const campanha = await tx.campanha.findUniqueOrThrow({ where: { id: campanhaId } });
    if (campanha.estado !== "RASCUNHO") {
      throw new ErroDeValidacao(["O conteúdo só muda com a campanha em rascunho."]);
    }
    if (vincular) {
      const cesta = await tx.cesta.findUniqueOrThrow({
        where: { id: cestaId },
        include: { ofertas: { include: { oferta: true } } },
      });
      const paraRegra = {
        id: cesta.id,
        nome: cesta.nome,
        ofertas: cesta.ofertas.map(({ oferta }) => ({
          id: oferta.id,
          titulo: oferta.titulo,
          status: oferta.status,
        })),
      };
      if (!cestaPodeEntrarEmCampanha(paraRegra)) {
        const bloqueiam = ofertasQueBloqueiamCesta(paraRegra).map((o) => o.titulo);
        throw new ErroDeValidacao([
          bloqueiam.length > 0
            ? `A cesta só entra em campanha com todas as ofertas publicadas (RN41). Pendentes: ${bloqueiam.join(", ")}.`
            : "A cesta está vazia — não há o que executar (RN41).",
        ]);
      }
      await tx.campanhaCesta.upsert({
        where: { campanhaId_cestaId: { campanhaId, cestaId } },
        update: {},
        create: { campanhaId, cestaId },
      });
    } else {
      await tx.campanhaCesta.deleteMany({ where: { campanhaId, cestaId } });
    }
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "campanha",
      entidadeId: campanhaId,
      autorId: ator.id,
      anterior: { cesta: vincular ? null : cestaId },
      novo: { cesta: vincular ? cestaId : null },
    });
  });
}

/** Adiciona ou substitui uma peça (T23 — Peças). A imagem vai ao armazenamento. */
export async function salvarPeca(
  ator: Ator,
  campanhaId: string,
  parametros: {
    pecaId?: string;
    formatoSlug: string;
    titulo: string;
    texto?: string | null;
    imagem?: { nomeArquivo: string; conteudo: Buffer } | null;
  },
) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");
  const titulo = parametros.titulo.trim();
  if (!titulo) {
    throw new ErroDeValidacao(["O título da peça é obrigatório."]);
  }
  const formato = await prisma.formatoPeca.findUniqueOrThrow({
    where: { slug: parametros.formatoSlug },
  });

  let pendente: GravacaoPendente | null = null;
  let imagemChave: string | null = null;
  if (parametros.imagem) {
    const extensao = parametros.imagem.nomeArquivo.includes(".")
      ? parametros.imagem.nomeArquivo.slice(parametros.imagem.nomeArquivo.lastIndexOf("."))
      : "";
    imagemChave = `pecas/${campanhaId}/${hashDeSnapshot(parametros.imagem.conteudo).slice(0, 16)}${extensao}`;
    pendente = { chave: imagemChave, conteudo: parametros.imagem.conteudo };
  }

  const peca = await prisma.$transaction(async (tx) => {
    const campanha = await tx.campanha.findUniqueOrThrow({ where: { id: campanhaId } });
    if (campanha.estado === "ENCERRADA") {
      throw new ErroDeValidacao(["Campanha encerrada não recebe peças novas."]);
    }
    const anterior = parametros.pecaId
      ? await tx.pecaCampanha.findUniqueOrThrow({ where: { id: parametros.pecaId } })
      : null;
    const ordem =
      anterior?.ordem ?? (await tx.pecaCampanha.count({ where: { campanhaId } }));

    const dados = {
      campanhaId,
      formatoId: formato.id,
      titulo,
      texto: parametros.texto?.trim() || null,
      imagemChave: imagemChave ?? anterior?.imagemChave ?? null,
      imagemNome: parametros.imagem?.nomeArquivo ?? anterior?.imagemNome ?? null,
      ordem,
    };
    const salva = anterior
      ? await tx.pecaCampanha.update({ where: { id: anterior.id }, data: dados })
      : await tx.pecaCampanha.create({ data: dados });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "peca_campanha",
      entidadeId: salva.id,
      autorId: ator.id,
      anterior: anterior
        ? { titulo: anterior.titulo, texto: anterior.texto, imagemChave: anterior.imagemChave }
        : null,
      novo: { titulo: salva.titulo, texto: salva.texto, imagemChave: salva.imagemChave },
    });
    return salva;
  });

  if (pendente) {
    await armazenador.salvar(pendente.chave, pendente.conteudo);
  }
  return peca;
}

export async function removerPeca(ator: Ator, pecaId: string) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");
  return prisma.$transaction(async (tx) => {
    const peca = await tx.pecaCampanha.findUniqueOrThrow({ where: { id: pecaId } });
    await tx.pecaCampanha.delete({ where: { id: pecaId } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "peca_campanha",
      entidadeId: pecaId,
      autorId: ator.id,
      anterior: { titulo: peca.titulo, campanhaId: peca.campanhaId },
      // Remoção: os campos vão a null e o evento fica registrado — peça
      // é conteúdo de rascunho, não entidade publicada (RN05 não se
      // aplica; o kit já gerado permanece intacto pela RN45).
      novo: { titulo: null, campanhaId: null },
    });
  });
}

/** Metas são múltiplas e opcionais; uma por tipo (T23 — Metas). */
export async function definirMeta(
  ator: Ator,
  campanhaId: string,
  parametros: {
    tipo: "RESGATES" | "CONVERSAO_PCT" | "ALIADOS_PARTICIPANTES" | "OFERTAS_ATIVAS";
    alvo: number;
  },
) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");
  if (!Number.isFinite(parametros.alvo) || parametros.alvo <= 0) {
    throw new ErroDeValidacao(["O alvo da meta precisa ser um número maior que zero."]);
  }

  return prisma.$transaction(async (tx) => {
    const meta = await tx.metaCampanha.upsert({
      where: { campanhaId_tipo: { campanhaId, tipo: parametros.tipo } },
      update: { alvo: new Prisma.Decimal(parametros.alvo) },
      create: {
        campanhaId,
        tipo: parametros.tipo,
        alvo: new Prisma.Decimal(parametros.alvo),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "meta_campanha",
      entidadeId: meta.id,
      autorId: ator.id,
      anterior: null,
      novo: { tipo: meta.tipo, alvo: meta.alvo.toString() },
    });
    return meta;
  });
}

export async function removerMeta(ator: Ator, metaId: string) {
  exigirPermissao(ator.papel, "MODELAR_CAMPANHA");
  return prisma.$transaction(async (tx) => {
    const meta = await tx.metaCampanha.findUniqueOrThrow({ where: { id: metaId } });
    await tx.metaCampanha.delete({ where: { id: metaId } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "meta_campanha",
      entidadeId: metaId,
      autorId: ator.id,
      anterior: { tipo: meta.tipo, alvo: meta.alvo.toString() },
      novo: { tipo: meta.tipo, alvo: null },
    });
  });
}

/** Retrato para as validações da RN38, com a contagem viva do público. */
export async function dadosDaAtivacao(campanhaId: string): Promise<DadosAtivacao> {
  const campanha = await lerCampanha(campanhaId);
  const snapshot = campanha.publicoSnapshot
    ? { contagem: campanha.publicoSnapshot.contagem }
    : await montarSnapshotDoPublico(regrasDoPublico(campanha));
  return {
    contagemPublico: snapshot.contagem,
    vigenciaInicio: campanha.vigenciaInicio,
    vigenciaFim: campanha.vigenciaFim,
    ...conteudoParaRegras(campanha),
  };
}

/** Monta o manifesto e as peças do kit a partir da campanha gravada. */
async function montarConteudoDoKit(
  campanha: CampanhaCompleta,
  snapshot: { contagem: number; hash: string; exportacaoId: string; finalidade: string },
) {
  const publicadas = new Set(
    ofertasPublicadasDaCampanha(conteudoParaRegras(campanha)).map((o) => o.id),
  );
  const cestaDaOferta = new Map<string, string>();
  for (const { cesta } of campanha.cestas) {
    for (const { oferta } of cesta.ofertas) {
      cestaDaOferta.set(oferta.id, cesta.nome);
    }
  }
  const ofertas = [
    ...campanha.ofertasAvulsas.map(({ oferta }) => oferta),
    ...campanha.cestas.flatMap(({ cesta }) => cesta.ofertas.map(({ oferta }) => oferta)),
  ].filter(
    (oferta, indice, lista) =>
      publicadas.has(oferta.id) && lista.findIndex((o) => o.id === oferta.id) === indice,
  );

  const pecas: PecaDoKit[] = [];
  for (const peca of campanha.pecas) {
    const imagem = peca.imagemChave
      ? {
          nomeArquivo: peca.imagemNome ?? "imagem",
          conteudo: await armazenador.ler(peca.imagemChave),
        }
      : null;
    pecas.push({ formato: peca.formato.nome, titulo: peca.titulo, texto: peca.texto, imagem });
  }

  const manifesto: ManifestoKit = {
    campanha: {
      id: campanha.id,
      nome: campanha.nome,
      objetivo: campanha.objetivo,
      vigenciaInicio: campanha.vigenciaInicio?.toISOString().slice(0, 10) ?? null,
      vigenciaFim: campanha.vigenciaFim?.toISOString().slice(0, 10) ?? null,
    },
    publico: {
      contagem: snapshot.contagem,
      finalidade: snapshot.finalidade,
      exportacaoId: snapshot.exportacaoId,
      hashArquivo: snapshot.hash,
    },
    cestas: campanha.cestas.map(({ cesta }) => ({
      id: cesta.id,
      nome: cesta.nome,
      narrativa: cesta.narrativa,
    })),
    ofertas: ofertas.map((oferta) => ({
      id: oferta.id,
      titulo: oferta.titulo,
      natureza: oferta.natureza,
      aliado: oferta.solucao.empresa.nomeFantasia,
      idExternoMinutrade: oferta.idExternoMinutrade,
      vigenciaInicio: oferta.vigenciaInicio.toISOString().slice(0, 10),
      vigenciaFim: oferta.vigenciaFim?.toISOString().slice(0, 10) ?? null,
      viaCesta: cestaDaOferta.get(oferta.id) ?? null,
    })),
    pecas: pecas.map((peca, indice) => {
      const nomes = nomesDosArquivosDaPeca(peca, indice);
      return {
        formato: peca.formato,
        titulo: peca.titulo,
        arquivoTexto: nomes.texto,
        arquivoImagem: nomes.imagem,
      };
    }),
  };

  return { manifesto, pecas };
}

/** O manifesto no formato que o diff da RN45 compara. */
function conteudoParaDiff(manifesto: ManifestoKit): ConteudoKit {
  return {
    publicoContagem: manifesto.publico.contagem,
    vigenciaInicio: manifesto.campanha.vigenciaInicio,
    vigenciaFim: manifesto.campanha.vigenciaFim,
    instrucoes: null,
    ofertas: manifesto.ofertas.map((oferta) => ({
      id: oferta.id,
      titulo: oferta.titulo,
      idExternoMinutrade: oferta.idExternoMinutrade,
    })),
    cestas: manifesto.cestas.map((cesta) => ({ id: cesta.id, nome: cesta.nome })),
    pecas: manifesto.pecas.map((peca) => ({
      formato: peca.formato,
      titulo: peca.titulo,
      temImagem: peca.arquivoImagem !== null,
    })),
  };
}

/**
 * Gera uma versão do kit dentro da transação em curso e devolve os
 * arquivos a gravar depois do commit. Usada na ativação (v1) e no ajuste
 * pós-ativação (v2+, RN45).
 */
async function gerarKitDentroDaTransacao(
  tx: Prisma.TransactionClient,
  autorId: string,
  campanha: CampanhaCompleta,
  snapshot: { contagem: number; hash: string; exportacaoId: string; finalidade: string },
  momento: Date,
): Promise<GravacaoPendente[]> {
  const { manifesto, pecas } = await montarConteudoDoKit(campanha, snapshot);
  const versao = proximaVersaoDoKit(campanha.kits.map((kit) => kit.versao));
  const anterior = campanha.kits.at(-1);
  const diff = diffDoKit(
    anterior ? conteudoParaDiff(anterior.manifesto as unknown as ManifestoKit) : null,
    conteudoParaDiff(manifesto),
  );

  const adapter = criarKitAdapterGenericoZip();
  const pacote = adapter.montar({
    campanha: {
      id: campanha.id,
      nome: campanha.nome,
      objetivo: campanha.objetivo,
      instrucoes: campanha.instrucoes,
      vigenciaInicio: manifesto.campanha.vigenciaInicio,
      vigenciaFim: manifesto.campanha.vigenciaFim,
    },
    publicoCsv: await armazenador.ler(
      (await tx.exportacaoLista.findUniqueOrThrow({ where: { id: snapshot.exportacaoId } }))
        .arquivoChave,
    ),
    manifesto,
    pecas,
    versao,
    momento,
  });

  const chave = `kits/${campanha.id}/v${versao}-${pacote.nomeArquivo}`;
  const kit = await tx.kitCampanha.create({
    data: {
      campanhaId: campanha.id,
      versao,
      adapter: adapter.nome,
      manifesto: manifesto as unknown as Prisma.InputJsonValue,
      arquivoChave: chave,
      hashArquivo: hashDeSnapshot(pacote.conteudo),
      diffTexto: diff,
      autorId,
    },
  });
  await registrarMutacao(criarGravadorPrisma(tx), {
    entidade: "kit_campanha",
    entidadeId: kit.id,
    autorId,
    anterior: null,
    novo: {
      versao: kit.versao,
      adapter: kit.adapter,
      hashArquivo: kit.hashArquivo,
      arquivoChave: kit.arquivoChave,
      diff: kit.diffTexto,
    },
  });

  return [{ chave, conteudo: pacote.conteudo }];
}

/**
 * RN38 — efetiva a ativação: congela o público (snapshot com finalidade
 * da campanha, herdando RN34), gera o kit v1 e passa a campanha a Ativa.
 * Chamada com a porta desligada e também pelo motor, quando a porta
 * estiver ligada e a solicitação for aprovada.
 */
export async function ativarCampanhaDentroDaTransacao(
  tx: Prisma.TransactionClient,
  autorId: string,
  campanhaId: string,
  snapshotDoPublico: Awaited<ReturnType<typeof montarSnapshotDoPublico>>,
  momento: Date,
): Promise<GravacaoPendente[]> {
  const campanha = await tx.campanha.findUniqueOrThrow({
    where: { id: campanhaId },
    include: INCLUSAO_COMPLETA,
  });
  if (campanha.estado !== "RASCUNHO") {
    throw new ErroDeValidacao(["Somente campanhas em rascunho podem ser ativadas."]);
  }
  const erros = validarAtivacao({
    contagemPublico: snapshotDoPublico.contagem,
    vigenciaInicio: campanha.vigenciaInicio,
    vigenciaFim: campanha.vigenciaFim,
    ...conteudoParaRegras(campanha),
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  const finalidade = `Campanha: ${campanha.nome}`;
  const exportacao = await registrarExportacaoDentroDaTransacao(tx, autorId, {
    finalidade,
    contagem: snapshotDoPublico.contagem,
    regras: snapshotDoPublico.regras,
    hash: snapshotDoPublico.hash,
    segmentoId: campanha.segmentoId,
  });

  const pendentes: GravacaoPendente[] = [
    { chave: exportacao.arquivoChave, conteudo: snapshotDoPublico.conteudo },
  ];
  // O CSV precisa estar legível para o empacotador do kit: grava antes de
  // montar o pacote — a linha auditável da exportação já existe acima.
  await armazenador.salvar(exportacao.arquivoChave, snapshotDoPublico.conteudo);

  const ativada = await tx.campanha.update({
    where: { id: campanhaId },
    data: {
      estado: "ATIVA",
      ativadaEm: momento,
      publicoSnapshotId: exportacao.id,
    },
    include: INCLUSAO_COMPLETA,
  });
  await registrarMutacao(criarGravadorPrisma(tx), {
    entidade: "campanha",
    entidadeId: campanhaId,
    autorId,
    anterior: estadoAuditavel(campanha),
    novo: estadoAuditavel(ativada),
  });

  const doKit = await gerarKitDentroDaTransacao(
    tx,
    autorId,
    ativada,
    {
      contagem: snapshotDoPublico.contagem,
      hash: snapshotDoPublico.hash,
      exportacaoId: exportacao.id,
      finalidade,
    },
    momento,
  );
  return [...pendentes, ...doKit];
}

/**
 * Ativação pedida na T23. Porta ATIVACAO_CAMPANHA ligável na T7: ligada,
 * cria solicitação e nada é congelado ainda; desligada, ativa direto.
 *
 * Exige AS DUAS permissões: ativar campanha e exportar listas de contato
 * — o kit leva a lista de assinantes, e a permissão da Onda 5 não se
 * dilui por estar dentro de outro fluxo (ficha §2).
 */
export async function ativarCampanha(ator: Ator, campanhaId: string) {
  exigirPermissao(ator.papel, "ATIVAR_ENCERRAR_CAMPANHA");
  exigirPermissao(ator.papel, "EXPORTAR_LISTAS_CONTATO");

  const campanha = await lerCampanha(campanhaId);
  if (campanha.estado !== "RASCUNHO") {
    throw new ErroDeValidacao(["Somente campanhas em rascunho podem ser ativadas."]);
  }
  const snapshot = await montarSnapshotDoPublico(regrasDoPublico(campanha));
  const erros = validarAtivacao({
    contagemPublico: snapshot.contagem,
    vigenciaInicio: campanha.vigenciaInicio,
    vigenciaFim: campanha.vigenciaFim,
    ...conteudoParaRegras(campanha),
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  const regra = await prisma.aprovacaoRegra.findUniqueOrThrow({
    where: { tipoEntidade: "ATIVACAO_CAMPANHA" },
  });
  if (exigeAprovacao({ exigida: regra.exigida, aprovadoresDesignados: [] })) {
    const jaPendente = await prisma.aprovacaoSolicitacao.findFirst({
      where: { tipoEntidade: "ATIVACAO_CAMPANHA", entidadeId: campanhaId, estado: "SOLICITADA" },
    });
    if (jaPendente) {
      throw new ErroDeValidacao(["Já existe solicitação de ativação pendente para esta campanha."]);
    }
    const solicitacao = await prisma.$transaction(async (tx) => {
      const criada = await tx.aprovacaoSolicitacao.create({
        data: {
          tipoEntidade: "ATIVACAO_CAMPANHA",
          entidadeId: campanhaId,
          solicitanteId: ator.id,
        },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "aprovacao_solicitacao",
        entidadeId: criada.id,
        autorId: ator.id,
        anterior: null,
        novo: {
          tipoEntidade: criada.tipoEntidade,
          entidadeId: criada.entidadeId,
          estado: criada.estado,
        },
      });
      return criada;
    });
    return { resultado: "SOLICITADA" as const, solicitacao };
  }

  const momento = new Date();
  const pendentes = await prisma.$transaction((tx) =>
    ativarCampanhaDentroDaTransacao(tx, ator.id, campanhaId, snapshot, momento),
  );
  await gravarPendentesDoKit(pendentes);
  logger.info({ campanhaId, contagem: snapshot.contagem }, "campanha ativada com kit v1");
  return { resultado: "ATIVA" as const, campanha: await lerCampanha(campanhaId) };
}

/** Efeito da aprovação (motor): recongela o público no momento da decisão. */
export async function ativarCampanhaAprovada(
  tx: Prisma.TransactionClient,
  autorId: string,
  campanhaId: string,
): Promise<GravacaoPendente[]> {
  const campanha = await tx.campanha.findUniqueOrThrow({
    where: { id: campanhaId },
    include: { segmento: true },
  });
  const regras =
    campanha.origemPublico === "SEGMENTO_SALVO"
      ? (campanha.segmento?.regras ?? [])
      : (campanha.regrasPublico ?? []);
  const snapshot = await montarSnapshotDoPublico(regras);
  return ativarCampanhaDentroDaTransacao(tx, autorId, campanhaId, snapshot, new Date());
}

/**
 * RN45 — ajuste após a ativação gera NOVA versão do kit, com diff
 * auditado; a versão anterior permanece intacta.
 */
export async function gerarNovaVersaoDoKit(ator: Ator, campanhaId: string) {
  exigirPermissao(ator.papel, "ATIVAR_ENCERRAR_CAMPANHA");
  exigirPermissao(ator.papel, "EXPORTAR_LISTAS_CONTATO");

  const campanha = await lerCampanha(campanhaId);
  if (campanha.estado === "RASCUNHO" || !campanha.publicoSnapshot) {
    throw new ErroDeValidacao([
      "A campanha precisa estar ativada — o kit v1 nasce da ativação (RN38).",
    ]);
  }

  const momento = new Date();
  const pendentes = await prisma.$transaction(async (tx) => {
    const atual = await tx.campanha.findUniqueOrThrow({
      where: { id: campanhaId },
      include: INCLUSAO_COMPLETA,
    });
    return gerarKitDentroDaTransacao(
      tx,
      ator.id,
      atual,
      {
        contagem: campanha.publicoSnapshot!.contagem,
        hash: campanha.publicoSnapshot!.hashArquivo,
        exportacaoId: campanha.publicoSnapshot!.id,
        finalidade: campanha.publicoSnapshot!.finalidade,
      },
      momento,
    );
  });
  await gravarPendentesDoKit(pendentes);
  return lerCampanha(campanhaId);
}

/**
 * RN40 — aviso prévio do encerramento: quais ofertas serão pausadas por
 * padrão e quais apenas se desvinculam. Consultado pela T25 antes de
 * confirmar; o encerramento aplica exatamente isto.
 */
export async function previaDoEncerramento(campanhaId: string) {
  const campanha = await lerCampanha(campanhaId);
  const vinculadas = [
    ...campanha.ofertasAvulsas.map(({ oferta }) => oferta),
    ...campanha.cestas.flatMap(({ cesta }) => cesta.ofertas.map(({ oferta }) => oferta)),
    ...(await prisma.oferta.findMany({ where: { destinacaoCampanhaId: campanhaId } })),
  ].filter((oferta, indice, lista) => lista.findIndex((o) => o.id === oferta.id) === indice);

  const efeito = efeitoDoEncerramento(
    campanhaId,
    vinculadas.map((oferta) => ({
      id: oferta.id,
      titulo: oferta.titulo,
      status: oferta.status,
      destinacao: oferta.destinacao,
      destinacaoCampanhaId: oferta.destinacaoCampanhaId,
    })),
  );
  return { efeito, aviso: avisoDoEncerramento(efeito) };
}

/**
 * RN40 — encerra a campanha: pausa as ofertas exclusivas (reversão
 * manual, pela T5/T4) e desvincula as de vitrine.
 */
export async function encerrarCampanha(ator: Ator, campanhaId: string) {
  exigirPermissao(ator.papel, "ATIVAR_ENCERRAR_CAMPANHA");
  const { efeito, aviso } = await previaDoEncerramento(campanhaId);

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.campanha.findUniqueOrThrow({ where: { id: campanhaId } });
    if (anterior.estado !== "ATIVA") {
      throw new ErroDeValidacao(["Somente campanhas ativas podem ser encerradas."]);
    }
    const gravador = criarGravadorPrisma(tx);

    for (const oferta of efeito.pausar) {
      await tx.oferta.update({ where: { id: oferta.id }, data: { status: "PAUSADA" } });
      await registrarMutacao(gravador, {
        entidade: "oferta",
        entidadeId: oferta.id,
        autorId: ator.id,
        anterior: { status: oferta.status },
        novo: { status: "PAUSADA", motivo: `encerramento da campanha ${anterior.nome} (RN40)` },
      });
    }
    for (const oferta of efeito.desvincular) {
      await tx.campanhaOferta.deleteMany({ where: { campanhaId, ofertaId: oferta.id } });
    }

    const encerrada = await tx.campanha.update({
      where: { id: campanhaId },
      data: { estado: "ENCERRADA", encerradaEm: new Date() },
    });
    await registrarMutacao(gravador, {
      entidade: "campanha",
      entidadeId: campanhaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: { ...estadoAuditavel(encerrada), aviso },
    });
    return { campanha: encerrada, aviso, pausadas: efeito.pausar.map((o) => o.titulo) };
  });
}

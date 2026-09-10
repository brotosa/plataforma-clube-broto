import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { type Acao, exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { validarTextoComentario } from "@/dominio/comentarios/regras";
import { validarAnexoComentario } from "@/dominio/comentarios/anexo";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do painel de atividades — o mesmo painel serve a ficha do
 * aliado e a do patrocinador. O comentário nasceu como "nota rápida"
 * (dormante) e aqui ganha ciclo de vida:
 *
 * - comentar (com pendência e menções opcionais) — quem opera a ficha;
 * - editar / apagar — **só o próprio autor**, apagar é soft-delete;
 * - resolver / reabrir pendência — quem opera a ficha (a equipe fecha).
 *
 * Tudo auditado (RN49): apagar some da vista, a trilha permanece. As menções
 * só destacam o nome no painel; quando a pendência está aberta, a consulta do
 * sino conta "pendências que mencionam você" — sem fila nem lido/não-lido.
 *
 * O alvo (aliado ou patrocinador) decide QUAL permissão vale e em qual coluna
 * a nota pousa — um só caminho, parametrizado, em vez de duas cópias.
 */

/** Em que ficha o comentário vive. */
export type AlvoComentario = { tipo: "aliado" | "patrocinador"; id: string };

/** A permissão de comentar correspondente ao tipo de ficha. */
function permissaoDoTipo(tipo: AlvoComentario["tipo"]): Acao {
  return tipo === "patrocinador" ? "COMENTAR_FICHA_PATROCINADOR" : "COMENTAR_FICHA_ALIADO";
}

/**
 * A permissão de uma nota já gravada, deduzida de qual ficha a possui — para
 * editar/apagar/resolver checarem a permissão da própria ficha.
 */
function permissaoDaNota(nota: { patrocinadorId: string | null }): Acao {
  return nota.patrocinadorId ? "COMENTAR_FICHA_PATROCINADOR" : "COMENTAR_FICHA_ALIADO";
}

export interface DadosComentario {
  texto: string;
  ehPendencia?: boolean;
  /** Ids de usuários mencionados (o próprio autor é ignorado). */
  mencionados?: ReadonlyArray<string>;
  /**
   * Anexo opcional (PDF ou imagem), enviado JUNTO com o comentário. Um por
   * comentário (RN54/RN60 — binário em tabela própria 1:1). Validado e
   * higienizado no servidor; some com o comentário.
   */
  anexo?: { nome: string; conteudo: Uint8Array };
}

/** SHA-256 do conteúdo — identidade de versão do anexo para o ETag da rota. */
function hashDoAnexo(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/** Confere que os ids mencionados são usuários ativos; devolve o conjunto. */
async function mencionadosValidos(
  tx: Prisma.TransactionClient,
  autorId: string,
  ids: ReadonlyArray<string> | undefined,
): Promise<string[]> {
  const unicos = [...new Set(ids ?? [])].filter((id) => id !== autorId);
  if (unicos.length === 0) {
    return [];
  }
  const usuarios = await tx.usuario.findMany({
    where: { id: { in: unicos }, ativo: true },
    select: { id: true },
  });
  if (usuarios.length !== unicos.length) {
    throw new ErroDeValidacao(["Menção a usuário inexistente ou inativo."]);
  }
  return unicos;
}

/** Comentar na ficha (opcionalmente como pendência e com menções). */
export async function adicionarComentario(
  ator: Ator,
  alvo: AlvoComentario,
  dados: DadosComentario,
) {
  exigirPermissao(ator.papel, permissaoDoTipo(alvo.tipo));
  const erros = validarTextoComentario(dados.texto);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  const texto = dados.texto.trim();
  const ehPendencia = dados.ehPendencia === true;

  // O anexo é validado FORA da transação — tipo real pelo conteúdo, teto e
  // higienização são domínio puro e não tocam o banco. Recusa aqui nomeia a
  // causa (RN55) e nada foi gravado.
  const anexoValidado = dados.anexo
    ? validarAnexoComentario(dados.anexo.conteudo, dados.anexo.nome)
    : null;
  const anexoMeta = anexoValidado
    ? {
        nomeArquivo: dados.anexo!.nome,
        tipoMime: anexoValidado.tipoMime,
        bytes: anexoValidado.bytes,
        hash: hashDoAnexo(anexoValidado.conteudo),
      }
    : null;

  return prisma.$transaction(async (tx) => {
    // A ficha alvo tem de existir; e a nota pousa na coluna do seu tipo (a
    // outra fica nula — o XOR do banco garante que é exatamente uma).
    if (alvo.tipo === "patrocinador") {
      await tx.patrocinador.findUniqueOrThrow({ where: { id: alvo.id } });
    } else {
      await tx.empresa.findUniqueOrThrow({ where: { id: alvo.id } });
    }
    const vinculo =
      alvo.tipo === "patrocinador" ? { patrocinadorId: alvo.id } : { empresaId: alvo.id };
    const mencionados = await mencionadosValidos(tx, ator.id, dados.mencionados);

    const nota = await tx.notaRapida.create({
      data: {
        ...vinculo,
        autorId: ator.id,
        texto,
        ehPendencia,
        mencoes: { create: mencionados.map((usuarioId) => ({ usuarioId })) },
        // Anexo nasce junto: 1:1, mesmo autor, dentro da mesma transação.
        ...(anexoValidado && anexoMeta
          ? {
              anexo: {
                create: {
                  conteudo: Buffer.from(anexoValidado.conteudo),
                  tipoMime: anexoMeta.tipoMime,
                  bytes: anexoMeta.bytes,
                  hash: anexoMeta.hash,
                  nomeArquivo: anexoMeta.nomeArquivo,
                  autorId: ator.id,
                },
              },
            }
          : {}),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: nota.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        ...vinculo,
        texto,
        ehPendencia,
        mencionados,
        // Só metadados na trilha — nunca o conteúdo do arquivo.
        anexo: anexoMeta,
      },
    });
    return nota;
  });
}

/**
 * Lê o anexo de um comentário para a rota que o serve — o ÚNICO lugar em que
 * o binário deixa o banco. Exige apenas ver a ficha (o feed é visível a todos
 * os papéis que operam), e devolve `null` quando a nota foi removida
 * (soft-delete) ou não tem anexo, para a rota responder 404.
 */
export async function lerAnexoDoComentario(
  ator: Ator,
  comentarioId: string,
): Promise<{ conteudo: Uint8Array; tipoMime: string; hash: string; nomeArquivo: string } | null> {
  exigirPermissao(ator.papel, "VISUALIZAR");
  const nota = await prisma.notaRapida.findUnique({
    where: { id: comentarioId },
    select: {
      removidoEm: true,
      anexo: { select: { conteudo: true, tipoMime: true, hash: true, nomeArquivo: true } },
    },
  });
  if (nota === null || nota.removidoEm !== null || nota.anexo === null) return null;
  return {
    conteudo: new Uint8Array(nota.anexo.conteudo),
    tipoMime: nota.anexo.tipoMime,
    hash: nota.anexo.hash,
    nomeArquivo: nota.anexo.nomeArquivo,
  };
}

/** Editar o próprio comentário (texto, pendência, menções). */
export async function editarComentario(
  ator: Ator,
  comentarioId: string,
  dados: DadosComentario,
) {
  const erros = validarTextoComentario(dados.texto);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  const texto = dados.texto.trim();
  const ehPendencia = dados.ehPendencia === true;

  return prisma.$transaction(async (tx) => {
    const atual = await tx.notaRapida.findUniqueOrThrow({
      where: { id: comentarioId },
      include: { mencoes: true },
    });
    // A permissão é a da ficha que possui a nota (aliado ou patrocinador).
    exigirPermissao(ator.papel, permissaoDaNota(atual));
    if (atual.removidoEm) {
      throw new ErroDeValidacao(["Comentário removido não pode ser editado."]);
    }
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao(["Só o autor pode editar o próprio comentário."]);
    }
    const mencionados = await mencionadosValidos(tx, ator.id, dados.mencionados);

    // Re-sincroniza as menções (substitui o conjunto anterior).
    await tx.notaRapidaMencao.deleteMany({ where: { notaRapidaId: comentarioId } });
    const nota = await tx.notaRapida.update({
      where: { id: comentarioId },
      data: {
        texto,
        ehPendencia,
        // Marca de edição; se deixar de ser pendência, a resolução perde sentido.
        editadoEm: new Date(),
        pendenciaResolvidaEm: ehPendencia ? atual.pendenciaResolvidaEm : null,
        mencoes: { create: mencionados.map((usuarioId) => ({ usuarioId })) },
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: comentarioId,
      autorId: ator.id,
      anterior: {
        texto: atual.texto,
        ehPendencia: atual.ehPendencia,
        mencionados: atual.mencoes.map((m) => m.usuarioId),
      },
      novo: { texto, ehPendencia, mencionados },
    });
    return nota;
  });
}

/** Apagar o próprio comentário — soft-delete (a trilha permanece). */
export async function removerComentario(ator: Ator, comentarioId: string) {
  return prisma.$transaction(async (tx) => {
    const atual = await tx.notaRapida.findUniqueOrThrow({ where: { id: comentarioId } });
    exigirPermissao(ator.papel, permissaoDaNota(atual));
    if (atual.removidoEm) {
      return atual; // idempotente: já removido
    }
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao(["Só o autor pode apagar o próprio comentário."]);
    }
    const nota = await tx.notaRapida.update({
      where: { id: comentarioId },
      data: { removidoEm: new Date() },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: comentarioId,
      autorId: ator.id,
      anterior: { removidoEm: null },
      novo: { removidoEm: nota.removidoEm },
    });
    return nota;
  });
}

/**
 * Resolver ou reabrir a pendência de um comentário. É ato da equipe (quem
 * opera a ficha), não só do autor: quem foi mencionado pode fechar a sua.
 */
export async function definirResolucaoPendencia(
  ator: Ator,
  comentarioId: string,
  resolvida: boolean,
) {
  return prisma.$transaction(async (tx) => {
    const atual = await tx.notaRapida.findUniqueOrThrow({ where: { id: comentarioId } });
    exigirPermissao(ator.papel, permissaoDaNota(atual));
    if (atual.removidoEm) {
      throw new ErroDeValidacao(["Comentário removido não tem pendência a alterar."]);
    }
    if (!atual.ehPendencia) {
      throw new ErroDeValidacao(["Este comentário não é uma pendência."]);
    }
    const pendenciaResolvidaEm = resolvida ? new Date() : null;
    const nota = await tx.notaRapida.update({
      where: { id: comentarioId },
      data: { pendenciaResolvidaEm },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: comentarioId,
      autorId: ator.id,
      anterior: { pendenciaResolvidaEm: atual.pendenciaResolvidaEm },
      novo: { pendenciaResolvidaEm },
    });
    return nota;
  });
}

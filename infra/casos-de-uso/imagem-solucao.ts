import { createHash } from "node:crypto";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { validarImagemDeCard } from "@/dominio/solucoes/imagem-card";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * RN60 — envio, troca, remoção e leitura da imagem do card da solução.
 *
 * Espelha `marca-aliado.ts` deliberadamente, e não por acaso: o que muda
 * entre as duas é a entidade e o perfil de validação, não o fluxo. A
 * permissão segue a mesma lógica da marca — escrever a imagem é editar a
 * solução (`CRIAR_EDITAR`); lê-la é ver a solução (`VISUALIZAR`). Não há
 * permissão nova: a imagem não é entidade à parte, é um campo da solução
 * que por acaso é binário.
 *
 * Troca e remoção são auditadas. A trilha guarda o hash, o tipo e o nome do
 * arquivo — nunca o conteúdo: auditoria é registro de mudança, não cópia de
 * arquivo, e um BYTEA por evento inflaria a tabela que a RN49 proíbe de
 * podar.
 */

export const ENTIDADE_AUDITORIA = "ImagemSolucao";

/** SHA-256 do conteúdo — identidade de versão da imagem para o cache. */
export function calcularHash(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

interface EstadoImagem extends Record<string, unknown> {
  arquivo: string | null;
  tipo: string | null;
  bytes: number | null;
  hash: string | null;
}

function estadoAuditavel(
  imagem: { nomeArquivo: string; tipoMime: string; bytes: number; hash: string } | null,
): EstadoImagem {
  return imagem === null
    ? { arquivo: null, tipo: null, bytes: null, hash: null }
    : {
        arquivo: imagem.nomeArquivo,
        tipo: imagem.tipoMime,
        bytes: imagem.bytes,
        hash: imagem.hash,
      };
}

/**
 * Envia (ou troca) a imagem do card. O conteúdo gravado é o que a régua do
 * domínio devolve, nunca o que chegou do navegador.
 */
export async function enviarImagemDaSolucao(
  ator: Ator,
  solucaoId: string,
  arquivo: { nome: string; conteudo: Uint8Array },
): Promise<{ hash: string }> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const solucao = await prisma.solucao.findUnique({
    where: { id: solucaoId },
    select: { id: true },
  });
  if (!solucao) {
    throw new ErroDeValidacao(["Solução não encontrada."]);
  }

  // Recusa de arquivo é erro de causa conhecida: a mensagem sobe inteira
  // até a tela (RN55), nomeando o motivo — inclusive o SVG recusado, que
  // é o caso em que o arquivo está certo e o formato é que não serve aqui.
  const validada = validarImagemDeCard(arquivo.conteudo, arquivo.nome);
  const hash = calcularHash(validada.conteudo);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.imagemSolucao.findUnique({
      where: { solucaoId },
      // Sem `conteudo`: o binário anterior não interessa para auditar.
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });

    await tx.imagemSolucao.upsert({
      where: { solucaoId },
      create: {
        solucaoId,
        conteudo: Buffer.from(validada.conteudo),
        tipoMime: validada.tipoMime,
        bytes: validada.bytes,
        hash,
        nomeArquivo: arquivo.nome,
        autorId: ator.id,
      },
      update: {
        conteudo: Buffer.from(validada.conteudo),
        tipoMime: validada.tipoMime,
        bytes: validada.bytes,
        hash,
        nomeArquivo: arquivo.nome,
        autorId: ator.id,
      },
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_AUDITORIA,
      entidadeId: solucaoId,
      autorId: ator.id,
      anterior: anterior === null ? null : estadoAuditavel(anterior),
      novo: estadoAuditavel({
        nomeArquivo: arquivo.nome,
        tipoMime: validada.tipoMime,
        bytes: validada.bytes,
        hash,
      }),
    });
  });

  return { hash };
}

/** Remove a imagem; o card volta ao tratamento neutro, nunca espaço quebrado. */
export async function removerImagemDaSolucao(ator: Ator, solucaoId: string): Promise<void> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.imagemSolucao.findUnique({
      where: { solucaoId },
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });
    if (anterior === null) {
      throw new ErroDeValidacao(["Esta solução não tem imagem para remover."]);
    }
    await tx.imagemSolucao.delete({ where: { solucaoId } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_AUDITORIA,
      entidadeId: solucaoId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(null),
    });
  });
}

/**
 * Lê a imagem para servir pela rota. Só aqui o binário sai do banco — todas
 * as outras consultas do produto selecionam a existência, não o conteúdo.
 */
export async function lerImagemDaSolucao(
  ator: Ator,
  solucaoId: string,
): Promise<{ conteudo: Uint8Array; tipoMime: string; hash: string } | null> {
  exigirPermissao(ator.papel, "VISUALIZAR");
  const imagem = await prisma.imagemSolucao.findUnique({
    where: { solucaoId },
    select: { conteudo: true, tipoMime: true, hash: true },
  });
  if (imagem === null) return null;
  return {
    conteudo: new Uint8Array(imagem.conteudo),
    tipoMime: imagem.tipoMime,
    hash: imagem.hash,
  };
}

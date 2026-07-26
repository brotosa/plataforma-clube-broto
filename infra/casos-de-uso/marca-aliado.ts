import { createHash } from "node:crypto";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { ErroDeMarca, validarMarca } from "@/dominio/marca/marca";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * RN54 — envio, troca, remoção e leitura da marca do aliado.
 *
 * A permissão espelha a do próprio aliado, como o prompt da Onda 8 pede:
 * escrever a marca é editar o cadastro (`CRIAR_EDITAR`); lê-la é ver o
 * aliado (`VISUALIZAR`). Não há permissão nova — a marca não é uma
 * entidade à parte, é um campo do aliado que por acaso é binário.
 *
 * Troca e remoção são auditadas (RN54). A trilha guarda o hash, o tipo e o
 * nome do arquivo — nunca o conteúdo: auditoria é registro de mudança, não
 * cópia de arquivo, e um BYTEA por evento inflaria a tabela que a RN49
 * proíbe de podar.
 */

export const ENTIDADE_AUDITORIA = "MarcaAliado";

/** SHA-256 do conteúdo — identidade de versão da marca para o cache. */
export function calcularHash(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

interface EstadoMarca extends Record<string, unknown> {
  arquivo: string | null;
  tipo: string | null;
  bytes: number | null;
  hash: string | null;
}

function estadoAuditavel(
  marca: { nomeArquivo: string; tipoMime: string; bytes: number; hash: string } | null,
): EstadoMarca {
  return marca === null
    ? { arquivo: null, tipo: null, bytes: null, hash: null }
    : {
        arquivo: marca.nomeArquivo,
        tipo: marca.tipoMime,
        bytes: marca.bytes,
        hash: marca.hash,
      };
}

/**
 * Envia (ou troca) a marca do aliado. O conteúdo gravado é o que a régua
 * do domínio devolve — já higienizado —, nunca o que chegou do navegador.
 */
export async function enviarMarca(
  ator: Ator,
  empresaId: string,
  arquivo: { nome: string; conteudo: Uint8Array },
): Promise<{ hash: string }> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true },
  });
  if (!empresa) {
    throw new ErroDeValidacao(["Aliado não encontrado."]);
  }

  // Recusa de arquivo é erro de causa conhecida: a mensagem sobe inteira
  // até a tela (RN55), nomeando o motivo.
  const validada = validarMarca(arquivo.conteudo, arquivo.nome);
  const hash = calcularHash(validada.conteudo);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.marcaAliado.findUnique({
      where: { empresaId },
      // Sem `conteudo`: o binário anterior não interessa para auditar.
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });

    await tx.marcaAliado.upsert({
      where: { empresaId },
      create: {
        empresaId,
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
      entidadeId: empresaId,
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

/** Remove a marca; o aliado volta ao estado sem marca (placa com inicial). */
export async function removerMarca(ator: Ator, empresaId: string): Promise<void> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.marcaAliado.findUnique({
      where: { empresaId },
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });
    if (anterior === null) {
      throw new ErroDeValidacao(["Este aliado não tem marca para remover."]);
    }
    await tx.marcaAliado.delete({ where: { empresaId } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_AUDITORIA,
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(null),
    });
  });
}

/**
 * Lê a marca para servir pela rota. Só aqui o binário sai do banco — todas
 * as outras consultas do produto selecionam a existência, não o conteúdo.
 */
export async function lerMarca(
  ator: Ator,
  empresaId: string,
): Promise<{ conteudo: Uint8Array; tipoMime: string; hash: string } | null> {
  exigirPermissao(ator.papel, "VISUALIZAR");
  const marca = await prisma.marcaAliado.findUnique({
    where: { empresaId },
    select: { conteudo: true, tipoMime: true, hash: true },
  });
  if (marca === null) return null;
  return { conteudo: new Uint8Array(marca.conteudo), tipoMime: marca.tipoMime, hash: marca.hash };
}

export { ErroDeMarca };

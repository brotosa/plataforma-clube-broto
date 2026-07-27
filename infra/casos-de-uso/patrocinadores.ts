import { createHash } from "node:crypto";
import type { Prisma, StatusPatrocinador } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { normalizarCnpj, validarCnpj } from "@/dominio/empresas/cnpj";
import { validarMinuta } from "@/dominio/patrocinio/minuta";
import { encerrar } from "@/dominio/patrocinio/saldo";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * RN62 — escrita de patrocinador, contrato, minuta e vínculo.
 *
 * Toda mutação aqui é auditada e passa por `GERIR_PATROCINADORES`, que a
 * ficha atribui ao Gestor. A leitura fica em `infra/consultas/
 * patrocinadores.ts` e exige apenas `VISUALIZAR_PATROCINADORES`.
 *
 * **Nada aqui grava saldo nem ativadas.** Os dois são derivação
 * (`dominio/patrocinio/saldo.ts`), e a cerca de arquitetura da RN62 impede
 * que voltem a ser coluna. O que este módulo grava é o que é fato: o que
 * o contrato comprou e quem ocupa vaga desde quando.
 */

export const ENTIDADE_PATROCINADOR = "Patrocinador";
export const ENTIDADE_CONTRATO = "ContratoPatrocinio";
export const ENTIDADE_MINUTA = "MinutaContrato";
export const ENTIDADE_VINCULO = "VinculoPatrocinio";

/** SHA-256 do conteúdo — identidade de versão da minuta para o cache. */
export function calcularHash(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

// ---------------------------------------------------------------------
// Patrocinador
// ---------------------------------------------------------------------

export interface DadosDoPatrocinador {
  razaoSocial: string;
  cnpj: string;
  segmento: string | null;
  contatoNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  responsavelComercialId: string | null;
  observacoes: string | null;
}

/** Régua de entrada do cadastro. Erros somam — a tela mostra todos. */
function validarDados(dados: DadosDoPatrocinador): string[] {
  const erros: string[] = [];
  if (dados.razaoSocial.trim() === "") {
    erros.push("Informe a razão social do patrocinador.");
  }
  if (dados.cnpj.trim() === "") {
    erros.push("Informe o CNPJ do patrocinador.");
  } else if (!validarCnpj(dados.cnpj)) {
    // Mesma régua da Empresa (`dominio/empresas/cnpj.ts`): é o mesmo
    // documento, e duas validações do mesmo CNPJ divergiriam.
    erros.push("O CNPJ informado não é válido — confira os dígitos verificadores.");
  }
  if (dados.contatoEmail !== null && dados.contatoEmail !== "" && !dados.contatoEmail.includes("@")) {
    erros.push("O e-mail de contato não parece um endereço válido.");
  }
  return erros;
}

function estadoDoPatrocinador(
  registro: {
    razaoSocial: string;
    cnpj: string;
    segmento: string | null;
    contatoNome: string | null;
    contatoEmail: string | null;
    contatoTelefone: string | null;
    responsavelComercialId: string | null;
    status: StatusPatrocinador;
    observacoes: string | null;
  } | null,
): Record<string, unknown> | null {
  return registro === null ? null : { ...registro };
}

export async function criarPatrocinador(
  ator: Ator,
  dados: DadosDoPatrocinador,
): Promise<{ id: string }> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  const erros = validarDados(dados);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  const cnpj = normalizarCnpj(dados.cnpj);

  const jaExiste = await prisma.patrocinador.findUnique({
    where: { cnpj },
    select: { id: true, razaoSocial: true },
  });
  if (jaExiste !== null) {
    // A mensagem nomeia quem já ocupa o CNPJ: sem isso, quem cadastra
    // fica sem saber se procura na lista ou corrige o número.
    throw new ErroDeValidacao([
      `Já existe um patrocinador com este CNPJ: ${jaExiste.razaoSocial}.`,
    ]);
  }

  return prisma.$transaction(async (tx) => {
    const criado = await tx.patrocinador.create({
      data: {
        razaoSocial: dados.razaoSocial.trim(),
        cnpj,
        segmento: dados.segmento,
        contatoNome: dados.contatoNome,
        contatoEmail: dados.contatoEmail,
        contatoTelefone: dados.contatoTelefone,
        responsavelComercialId: dados.responsavelComercialId,
        observacoes: dados.observacoes,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_PATROCINADOR,
      entidadeId: criado.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoDoPatrocinador(criado) ?? {},
    });
    return { id: criado.id };
  });
}

export async function editarPatrocinador(
  ator: Ator,
  id: string,
  dados: DadosDoPatrocinador,
): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  const erros = validarDados(dados);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  const cnpj = normalizarCnpj(dados.cnpj);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.patrocinador.findUnique({ where: { id } });
    if (anterior === null) {
      throw new ErroDeValidacao(["Patrocinador não encontrado."]);
    }
    const conflito = await tx.patrocinador.findUnique({
      where: { cnpj },
      select: { id: true, razaoSocial: true },
    });
    if (conflito !== null && conflito.id !== id) {
      throw new ErroDeValidacao([
        `Já existe outro patrocinador com este CNPJ: ${conflito.razaoSocial}.`,
      ]);
    }
    const novo = await tx.patrocinador.update({
      where: { id },
      data: {
        razaoSocial: dados.razaoSocial.trim(),
        cnpj,
        segmento: dados.segmento,
        contatoNome: dados.contatoNome,
        contatoEmail: dados.contatoEmail,
        contatoTelefone: dados.contatoTelefone,
        responsavelComercialId: dados.responsavelComercialId,
        observacoes: dados.observacoes,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_PATROCINADOR,
      entidadeId: id,
      autorId: ator.id,
      anterior: estadoDoPatrocinador(anterior),
      novo: estadoDoPatrocinador(novo) ?? {},
    });
  });
}

/**
 * Encerra (ou reativa) o patrocinador.
 *
 * **Não existe exclusão**, como em toda entidade publicável desde a RN05:
 * encerrar é mudança de status, os vínculos permanecem e o R1 de um
 * período passado continua sendo gerável. Encerrar também **não encerra os
 * vínculos automaticamente** — quem ocupa vaga hoje continua ocupando até
 * alguém dizer o contrário, e supor o encerramento em massa seria a
 * plataforma decidindo um fato do negócio.
 */
export async function alterarStatusDoPatrocinador(
  ator: Ator,
  id: string,
  status: StatusPatrocinador,
): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.patrocinador.findUnique({ where: { id }, select: { status: true } });
    if (anterior === null) {
      throw new ErroDeValidacao(["Patrocinador não encontrado."]);
    }
    if (anterior.status === status) return;
    await tx.patrocinador.update({ where: { id }, data: { status } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_PATROCINADOR,
      entidadeId: id,
      autorId: ator.id,
      anterior: { status: anterior.status },
      novo: { status },
    });
  });
}

// ---------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------

export interface DadosDoContrato {
  dataAssinatura: Date | null;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  precoUnitario: string | null;
  valorTotalContratado: string | null;
  assinaturasAdquiridas: number | null;
}

function validarContrato(dados: DadosDoContrato): string[] {
  const erros: string[] = [];
  if (
    dados.vigenciaInicio !== null &&
    dados.vigenciaFim !== null &&
    dados.vigenciaFim < dados.vigenciaInicio
  ) {
    erros.push("O fim da vigência não pode ser anterior ao início.");
  }
  if (dados.assinaturasAdquiridas !== null && dados.assinaturasAdquiridas < 0) {
    erros.push("O número de assinaturas adquiridas não pode ser negativo.");
  }
  return erros;
}

/**
 * Grava o contrato do patrocinador — **um por patrocinador nesta fase**.
 *
 * Todos os campos aceitam ausência, e isso é a ficha §7 valendo: os valores
 * do contrato Yamer são `[A CONFIRMAR — Marco]`. O contrato existe com os
 * campos vazios, a tela mostra o traço com motivo, e nada trava.
 */
export async function salvarContrato(
  ator: Ator,
  patrocinadorId: string,
  dados: DadosDoContrato,
): Promise<{ id: string }> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  const erros = validarContrato(dados);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  return prisma.$transaction(async (tx) => {
    const patrocinador = await tx.patrocinador.findUnique({
      where: { id: patrocinadorId },
      select: { id: true },
    });
    if (patrocinador === null) {
      throw new ErroDeValidacao(["Patrocinador não encontrado."]);
    }
    const anterior = await tx.contratoPatrocinio.findUnique({ where: { patrocinadorId } });
    const dadosPrisma = {
      dataAssinatura: dados.dataAssinatura,
      vigenciaInicio: dados.vigenciaInicio,
      vigenciaFim: dados.vigenciaFim,
      precoUnitario: dados.precoUnitario,
      valorTotalContratado: dados.valorTotalContratado,
      assinaturasAdquiridas: dados.assinaturasAdquiridas,
    } satisfies Prisma.ContratoPatrocinioUncheckedUpdateInput;

    const contrato = await tx.contratoPatrocinio.upsert({
      where: { patrocinadorId },
      create: { patrocinadorId, ...dadosPrisma },
      update: dadosPrisma,
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_CONTRATO,
      entidadeId: contrato.id,
      autorId: ator.id,
      anterior:
        anterior === null
          ? null
          : {
              dataAssinatura: anterior.dataAssinatura,
              vigenciaInicio: anterior.vigenciaInicio,
              vigenciaFim: anterior.vigenciaFim,
              precoUnitario: anterior.precoUnitario,
              valorTotalContratado: anterior.valorTotalContratado,
              assinaturasAdquiridas: anterior.assinaturasAdquiridas,
            },
      novo: {
        dataAssinatura: contrato.dataAssinatura,
        vigenciaInicio: contrato.vigenciaInicio,
        vigenciaFim: contrato.vigenciaFim,
        precoUnitario: contrato.precoUnitario,
        valorTotalContratado: contrato.valorTotalContratado,
        assinaturasAdquiridas: contrato.assinaturasAdquiridas,
      },
    });
    return { id: contrato.id };
  });
}

// ---------------------------------------------------------------------
// Minuta (RN62 — arquivo da plataforma, no desenho da RN54/RN60)
// ---------------------------------------------------------------------

interface EstadoDeArquivo extends Record<string, unknown> {
  arquivo: string | null;
  tipo: string | null;
  bytes: number | null;
  hash: string | null;
}

function estadoAuditavel(
  arquivo: { nomeArquivo: string; tipoMime: string; bytes: number; hash: string } | null,
): EstadoDeArquivo {
  return arquivo === null
    ? { arquivo: null, tipo: null, bytes: null, hash: null }
    : {
        arquivo: arquivo.nomeArquivo,
        tipo: arquivo.tipoMime,
        bytes: arquivo.bytes,
        hash: arquivo.hash,
      };
}

/**
 * Envia (ou substitui) a minuta. **Substituir não apaga a anterior da
 * trilha** (RN49): o evento de auditoria guarda nome, tipo, tamanho e hash
 * do que havia antes. O binário anterior, esse sim, é substituído —
 * auditoria é registro de mudança, não cópia de arquivo, e um BYTEA por
 * evento inflaria a tabela que a RN49 proíbe de podar.
 */
export async function enviarMinuta(
  ator: Ator,
  patrocinadorId: string,
  arquivo: { nome: string; conteudo: Uint8Array },
): Promise<{ hash: string }> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  const contrato = await prisma.contratoPatrocinio.findUnique({
    where: { patrocinadorId },
    select: { id: true },
  });
  if (contrato === null) {
    // Causa nomeada (RN55): a minuta é do contrato, e sem contrato não há
    // onde anexá-la. A tela oferece salvar o contrato primeiro.
    throw new ErroDeValidacao([
      "Este patrocinador ainda não tem contrato — salve os dados do contrato antes de anexar a minuta.",
    ]);
  }

  // Recusa de arquivo é erro de causa conhecida: a mensagem sobe inteira
  // até a tela (RN55), nomeando o motivo — inclusive a imagem recusada,
  // que é o caso em que o arquivo está certo e o formato é que não serve.
  const validada = validarMinuta(arquivo.conteudo, arquivo.nome);
  const hash = calcularHash(validada.conteudo);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.minutaContrato.findUnique({
      where: { contratoId: contrato.id },
      // Sem `conteudo`: o binário anterior não interessa para auditar.
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });
    const dados = {
      conteudo: Buffer.from(validada.conteudo),
      tipoMime: validada.tipoMime,
      bytes: validada.bytes,
      hash,
      nomeArquivo: arquivo.nome,
      autorId: ator.id,
    };
    await tx.minutaContrato.upsert({
      where: { contratoId: contrato.id },
      create: { contratoId: contrato.id, ...dados },
      update: dados,
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_MINUTA,
      entidadeId: contrato.id,
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

/** Remove a minuta; a aba volta a exibir "sem minuta — pendência". */
export async function removerMinuta(ator: Ator, patrocinadorId: string): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  await prisma.$transaction(async (tx) => {
    const contrato = await tx.contratoPatrocinio.findUnique({
      where: { patrocinadorId },
      select: { id: true },
    });
    if (contrato === null) {
      throw new ErroDeValidacao(["Este patrocinador não tem contrato."]);
    }
    const anterior = await tx.minutaContrato.findUnique({
      where: { contratoId: contrato.id },
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });
    if (anterior === null) {
      throw new ErroDeValidacao(["Este contrato não tem minuta para remover."]);
    }
    await tx.minutaContrato.delete({ where: { contratoId: contrato.id } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_MINUTA,
      entidadeId: contrato.id,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(null),
    });
  });
}

/**
 * Lê a minuta para servir pela rota. Só aqui o binário sai do banco — todas
 * as outras consultas do produto selecionam a existência, não o conteúdo.
 */
export async function lerMinuta(
  ator: Ator,
  patrocinadorId: string,
): Promise<{ conteudo: Uint8Array; tipoMime: string; hash: string; nomeArquivo: string } | null> {
  exigirPermissao(ator.papel, "VISUALIZAR_PATROCINADORES");
  const contrato = await prisma.contratoPatrocinio.findUnique({
    where: { patrocinadorId },
    select: { id: true },
  });
  if (contrato === null) return null;
  const minuta = await prisma.minutaContrato.findUnique({
    where: { contratoId: contrato.id },
    select: { conteudo: true, tipoMime: true, hash: true, nomeArquivo: true },
  });
  if (minuta === null) return null;
  return {
    conteudo: new Uint8Array(minuta.conteudo),
    tipoMime: minuta.tipoMime,
    hash: minuta.hash,
    nomeArquivo: minuta.nomeArquivo,
  };
}

// ---------------------------------------------------------------------
// Vínculo de patrocínio
// ---------------------------------------------------------------------

/**
 * Vincula um assinante a uma vaga do patrocinador.
 *
 * **O que a plataforma impede:** vincular duas vezes o mesmo assinante ao
 * mesmo patrocinador enquanto o primeiro vínculo estiver vigente — seria
 * consumir duas vagas com uma pessoa, o que nenhuma leitura do contrato
 * sustenta.
 *
 * **O que ela NÃO impede, de propósito:** estourar as vagas adquiridas. A
 * ficha §7 registra que a rotatividade é pergunta de negócio em aberto, e
 * o número de adquiridas pode simplesmente não estar confirmado ainda —
 * bloquear aqui seria a plataforma decidindo uma regra que ninguém
 * escreveu. O excesso aparece na T32 como saldo negativo e marcado, que é
 * informação, não silêncio.
 */
export async function vincularAssinante(
  ator: Ator,
  patrocinadorId: string,
  assinanteId: string,
  inicio: Date,
): Promise<{ id: string }> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  return prisma.$transaction(async (tx) => {
    const patrocinador = await tx.patrocinador.findUnique({
      where: { id: patrocinadorId },
      select: { id: true },
    });
    if (patrocinador === null) {
      throw new ErroDeValidacao(["Patrocinador não encontrado."]);
    }
    const assinante = await tx.assinante.findUnique({
      where: { id: assinanteId },
      select: { id: true },
    });
    if (assinante === null) {
      throw new ErroDeValidacao(["Assinante não encontrado."]);
    }
    const vigente = await tx.vinculoPatrocinio.findFirst({
      where: { patrocinadorId, assinanteId, fim: null },
      select: { id: true },
    });
    if (vigente !== null) {
      throw new ErroDeValidacao([
        "Este assinante já ocupa uma vaga vigente deste patrocinador.",
      ]);
    }
    const criado = await tx.vinculoPatrocinio.create({
      data: { patrocinadorId, assinanteId, inicio },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_VINCULO,
      entidadeId: criado.id,
      autorId: ator.id,
      anterior: null,
      novo: { patrocinadorId, assinanteId, inicio, fim: null },
    });
    return { id: criado.id };
  });
}

/**
 * Encerra o vínculo: data o fim e **devolve a vaga ao saldo**, preservando
 * o histórico. A linha nunca é apagada — é ela que sustenta a leitura de
 * rotatividade quando o negócio decidir o que fazer com ela.
 */
export async function encerrarVinculo(
  ator: Ator,
  vinculoId: string,
  fim: Date,
  motivo: string | null,
): Promise<void> {
  exigirPermissao(ator.papel, "GERIR_PATROCINADORES");

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.vinculoPatrocinio.findUnique({ where: { id: vinculoId } });
    if (anterior === null) {
      throw new ErroDeValidacao(["Vínculo não encontrado."]);
    }
    // A regra de encerramento é do domínio; aqui só se persiste o que ela
    // devolve. Recusa vira mensagem de validação, com a causa nomeada.
    let encerrado: { inicio: Date; fim: Date };
    try {
      encerrado = encerrar({ inicio: anterior.inicio, fim: anterior.fim }, fim);
    } catch (erro) {
      throw new ErroDeValidacao([(erro as Error).message]);
    }
    await tx.vinculoPatrocinio.update({
      where: { id: vinculoId },
      data: { fim: encerrado.fim, motivoFim: motivo },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_VINCULO,
      entidadeId: vinculoId,
      autorId: ator.id,
      anterior: { fim: anterior.fim, motivoFim: anterior.motivoFim },
      novo: { fim: encerrado.fim, motivoFim: motivo },
    });
  });
}

import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  estaBloqueado,
  estadoLimpo,
  minutosRestantesDeBloqueio,
  registrarFalha,
} from "@/dominio/usuarios/politica-login";
import { type PoliticaDeOrigem } from "@/dominio/usuarios/politica-origem";
import { lerPoliticaDeOrigem } from "./configuracoes";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Bloqueio de login por ORIGEM de rede — contagem, consulta e desbloqueio.
 *
 * A contagem reusa `registrarFalha` da política por conta: a mecânica é a
 * mesma (falhas consecutivas, bloqueio com prazo, janela que recomeça quando
 * o bloqueio expira), só muda o sujeito. Reescrever divergiria na primeira
 * correção.
 *
 * Lembrete do que isto NÃO é: rate limiting. Ver `dominio/usuarios/politica-origem`.
 */

/** A origem está bloqueada agora? Sem origem conhecida, nunca bloqueia. */
export async function origemEstaBloqueada(origem: string | null): Promise<boolean> {
  if (!origem) return false;
  const politica = await lerPoliticaDeOrigem();
  if (!politica.maxTentativas || politica.maxTentativas <= 0) return false;
  const linha = await prisma.bloqueioOrigem.findUnique({ where: { origem } });
  return estaBloqueado(linha?.bloqueadoAte, new Date());
}

/**
 * Registra UMA falha de login vinda desta origem.
 *
 * Chamada mesmo quando a conta alvo é de Administrador: o Administrador não é
 * BARRADO pela origem, mas as falhas contra ele CONTAM — senão bastaria mirar
 * um e-mail de Administrador para nunca acionar o bloqueio, e a regra viraria
 * enfeite.
 */
export async function registrarFalhaDeOrigem(origem: string | null): Promise<void> {
  if (!origem) return;
  const politica: PoliticaDeOrigem = await lerPoliticaDeOrigem();
  if (!politica.maxTentativas || politica.maxTentativas <= 0) return;

  const agora = new Date();
  const linha = await prisma.bloqueioOrigem.findUnique({ where: { origem } });
  const novo = registrarFalha(
    { tentativas: linha?.tentativas ?? 0, bloqueadoAte: linha?.bloqueadoAte ?? null },
    politica,
    agora,
  );
  await prisma.bloqueioOrigem.upsert({
    where: { origem },
    create: { origem, tentativas: novo.tentativas, bloqueadoAte: novo.bloqueadoAte },
    update: { tentativas: novo.tentativas, bloqueadoAte: novo.bloqueadoAte },
  });
}

/** Zera a origem após um login bem-sucedido. */
export async function limparOrigem(origem: string | null): Promise<void> {
  if (!origem) return;
  const linha = await prisma.bloqueioOrigem.findUnique({ where: { origem } });
  if (!linha || (linha.tentativas === 0 && linha.bloqueadoAte === null)) return;
  const limpo = estadoLimpo();
  await prisma.bloqueioOrigem.update({
    where: { origem },
    data: { tentativas: limpo.tentativas, bloqueadoAte: limpo.bloqueadoAte },
  });
}

/** Uma origem bloqueada, para a lista de desbloqueio. */
export interface OrigemBloqueada {
  id: string;
  origem: string;
  minutosRestantes: number;
}

/** Origens bloqueadas agora, mais recentes primeiro. */
export async function listarOrigensBloqueadas(): Promise<OrigemBloqueada[]> {
  const agora = new Date();
  const linhas = await prisma.bloqueioOrigem.findMany({
    where: { bloqueadoAte: { gt: agora } },
    orderBy: { bloqueadoAte: "desc" },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    origem: linha.origem,
    minutosRestantes: minutosRestantesDeBloqueio(linha.bloqueadoAte, agora),
  }));
}

/** Desbloqueia uma origem. Só Administrador (CONFIGURAR_PORTAL), auditado. */
export async function desbloquearOrigem(ator: Ator, id: string): Promise<void> {
  exigirPermissao(ator.papel, "CONFIGURAR_PORTAL");
  await prisma.$transaction(async (tx) => {
    const anterior = await tx.bloqueioOrigem.findUnique({ where: { id } });
    if (!anterior) {
      throw new ErroDeValidacao(["Origem não encontrada."]);
    }
    const limpo = estadoLimpo();
    await tx.bloqueioOrigem.update({
      where: { id },
      data: { tentativas: limpo.tentativas, bloqueadoAte: limpo.bloqueadoAte },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "bloqueio_origem",
      entidadeId: id,
      autorId: ator.id,
      anterior: {
        origem: anterior.origem,
        tentativas: anterior.tentativas,
        bloqueadoAte: anterior.bloqueadoAte?.toISOString() ?? null,
      },
      novo: { origem: anterior.origem, tentativas: 0, bloqueadoAte: null },
    });
  });
}

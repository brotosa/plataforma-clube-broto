import { prisma } from "@/infra/prisma/cliente";
import {
  CAMPOS_DE_CONFIGURACAO,
  type EventoDeConfiguracao,
  type GrupoDeConfiguracao,
  descreverUltimaAlteracao,
} from "@/dominio/usuarios/historico-configuracao";

/**
 * O histórico das Configurações do portal, lido da trilha de auditoria.
 *
 * **Não há tabela nova.** A F23 já grava cada alteração em `auditoria_eventos`
 * com entidade `configuracao_portal`, autor, campo, valor anterior e novo — e
 * a trilha é somente leitura por regra (RN48), o que a torna a fonte certa e
 * não apenas a disponível. Criar um histórico paralelo, como o Parametrizador
 * tem, seria gravar o mesmo fato duas vezes e abrir espaço para os dois
 * divergirem.
 */

/** A entidade sob a qual a F23 grava as mudanças de configuração. */
const ENTIDADE = "configuracao_portal";

/**
 * Quantos eventos ler. Cobre com folga a última gravação de cada um dos
 * quatro grupos — a maior delas mexe em oito campos —, e mantém a consulta
 * barata numa tela que é aberta o tempo todo.
 *
 * Se um grupo não aparecer nesta janela, a legenda dele diz "sem alteração
 * desde a implantação", o que seria **falso**. Daí a folga ser generosa: o
 * teto é 40 para uma necessidade máxima de 14 campos distintos.
 */
const TETO_DE_EVENTOS = 40;

export type HistoricoPorGrupo = Readonly<Record<GrupoDeConfiguracao, string>>;

export async function historicoDasConfiguracoes(): Promise<HistoricoPorGrupo> {
  const eventos = await prisma.auditoriaEvento.findMany({
    where: { entidade: ENTIDADE },
    orderBy: { criadoEm: "desc" },
    take: TETO_DE_EVENTOS,
    select: {
      campo: true,
      valorAnterior: true,
      valorNovo: true,
      criadoEm: true,
      autor: { select: { nome: true } },
    },
  });

  const porGrupo = new Map<GrupoDeConfiguracao, EventoDeConfiguracao[]>();
  for (const evento of eventos) {
    const definicao = CAMPOS_DE_CONFIGURACAO[evento.campo];
    // Campo que não está no mapa é ignorado em vez de exibido cru: a trilha é
    // histórica e pode carregar o nome de um campo que já não existe.
    if (!definicao) continue;
    const lista = porGrupo.get(definicao.grupo) ?? [];
    lista.push({
      campo: evento.campo,
      valorAnterior: evento.valorAnterior,
      valorNovo: evento.valorNovo,
      autorNome: evento.autor?.nome ?? "autor não identificado",
      criadoEm: evento.criadoEm,
    });
    porGrupo.set(definicao.grupo, lista);
  }

  const grupos: GrupoDeConfiguracao[] = ["SENHA", "SESSAO", "LOGIN", "ORIGEM"];
  return Object.fromEntries(
    grupos.map((grupo) => [grupo, descreverUltimaAlteracao(porGrupo.get(grupo) ?? [])]),
  ) as HistoricoPorGrupo;
}

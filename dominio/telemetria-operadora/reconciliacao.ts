/**
 * RN70 — a reconciliação de catálogo **relata e nunca corrige**.
 *
 * A plataforma é a origem do cadastro; a operadora é o espelho do que
 * está publicado. Quando divergem, quem decide é gente — no módulo de
 * origem, com auditoria, que é o que a RN07 já exige de toda mutação de
 * catálogo. Uma correção automática aqui seria pior que o problema:
 * silenciosa, sem autor, e desfazendo em segundos uma decisão que alguém
 * tomou na T5.
 *
 * Este módulo é **puro de propósito**. Ele recebe os dois lados já lidos
 * e devolve a lista de divergências — não tem cliente de banco, não
 * importa Prisma e portanto **não tem como escrever em lugar nenhum**. A
 * cerca de `infra/arquitetura/reconciliacao-nao-corrige.test.ts` prova o
 * mesmo do lado de fora, para o caminho inteiro da importação; aqui a
 * garantia é estrutural.
 */

export type TipoDivergencia =
  | "AUSENTE_NA_OPERADORA"
  | "AUSENTE_NA_PLATAFORMA"
  | "ATRIBUTO_DIVERGENTE";

export interface Divergencia {
  tipo: TipoDivergencia;
  identificador: string;
  descricao: string;
}

/** O item como a plataforma o conhece. */
export interface ItemDaPlataforma {
  idExterno: string;
  rotulo: string;
  /** Publicado/ativo aqui — é o que se espera encontrar no espelho. */
  ativo: boolean;
}

/** O item como a operadora o publica. */
export interface ItemDaOperadora {
  idExterno: string;
  rotulo: string;
  ativo: boolean;
}

/**
 * Compara os dois lados e devolve o que difere.
 *
 * As três perguntas, na ordem em que a ficha §3 as enumera:
 *
 * 1. está ativo aqui e não aparece lá? — a publicação não chegou;
 * 2. aparece lá e não existe aqui? — item que a plataforma não conhece;
 * 3. existe nos dois com atributo diferente? — o espelho está velho, ou
 *    alguém mexeu de um lado só.
 *
 * Item **inativo aqui e ausente lá não é divergência**: é exatamente o
 * que se espera. Relatá-lo encheria a tela de ruído e afogaria o que
 * importa — e uma lista de divergências que ninguém lê é o mesmo que não
 * ter lista.
 */
export function reconciliarCatalogo(parametros: {
  naPlataforma: readonly ItemDaPlataforma[];
  naOperadora: readonly ItemDaOperadora[];
  /** Como nomear o item nas descrições ("oferta", "seller"). */
  substantivo: string;
}): Divergencia[] {
  const { naPlataforma, naOperadora, substantivo } = parametros;
  const porIdNaOperadora = new Map(naOperadora.map((item) => [item.idExterno, item]));
  const porIdNaPlataforma = new Map(naPlataforma.map((item) => [item.idExterno, item]));
  const divergencias: Divergencia[] = [];

  for (const daqui of naPlataforma) {
    const la = porIdNaOperadora.get(daqui.idExterno);
    if (!la) {
      if (daqui.ativo) {
        divergencias.push({
          tipo: "AUSENTE_NA_OPERADORA",
          identificador: daqui.idExterno,
          descricao: `${substantivo} "${daqui.rotulo}" está ativa na plataforma e não aparece no arquivo da operadora.`,
        });
      }
      continue;
    }
    if (daqui.ativo !== la.ativo) {
      divergencias.push({
        tipo: "ATRIBUTO_DIVERGENTE",
        identificador: daqui.idExterno,
        descricao:
          `${substantivo} "${daqui.rotulo}": ` +
          `${daqui.ativo ? "ativa" : "inativa"} na plataforma e ` +
          `${la.ativo ? "ativa" : "inativa"} na operadora.`,
      });
    }
  }

  for (const la of naOperadora) {
    if (!porIdNaPlataforma.has(la.idExterno)) {
      divergencias.push({
        tipo: "AUSENTE_NA_PLATAFORMA",
        identificador: la.idExterno,
        descricao: `${substantivo} "${la.rotulo}" existe no arquivo da operadora e não está no cadastro da plataforma.`,
      });
    }
  }

  return divergencias;
}

/**
 * Divergência de contagem declarada — o caso do arquivo de sellers, que
 * traz "Ofertas Ativas" por seller e permite conferir contra o que a
 * plataforma tem publicado para aquele aliado.
 */
export function divergenciaDeContagem(parametros: {
  identificador: string;
  rotulo: string;
  naPlataforma: number;
  naOperadora: number;
}): Divergencia | null {
  if (parametros.naPlataforma === parametros.naOperadora) {
    return null;
  }
  return {
    tipo: "ATRIBUTO_DIVERGENTE",
    identificador: parametros.identificador,
    descricao:
      `seller "${parametros.rotulo}": ${parametros.naPlataforma} oferta(s) ativa(s) ` +
      `na plataforma e ${parametros.naOperadora} no arquivo da operadora.`,
  };
}

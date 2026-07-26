import { prisma } from "@/infra/prisma/cliente";
import { logger } from "@/infra/log/logger";
import {
  CATALOGO_VALORES_REGRA,
  type ChaveValorRegra,
  definicaoDe,
} from "@/dominio/parametrizador/valores-regra";

/**
 * Serviço de Configuração (Onda 3, F10).
 *
 * Ponto único de leitura dos valores de regra. Todo o código que antes
 * carregava constantes (réguas do funil, da vitrine, reavaliação,
 * comissão-padrão) passa por aqui — é o que faz uma régua alterada na T17
 * valer no produto sem deploy.
 *
 * A leitura é cacheada em memória e invalidada na escrita. O cache é por
 * processo: em execução com várias instâncias, cada uma se atualiza na sua
 * primeira leitura após a invalidação, e a escrita revalida as rotas que
 * exibem o valor. Não há TTL — invalidação explícita é mais honesta que
 * uma janela em que a UI mostra um número que já mudou.
 */

type MapaDeValores = ReadonlyMap<ChaveValorRegra, number | null>;

/**
 * O cache mora no globalThis, não em variável de módulo — mesmo motivo do
 * cliente Prisma em infra/prisma/cliente.ts. O empacotador do Next duplica
 * um módulo importado por rotas diferentes, então uma escrita feita na
 * server action invalidaria apenas a SUA cópia e a página continuaria
 * servindo o valor velho. Ancorado aqui, existe uma cópia por processo.
 */
interface EstadoDoCache {
  valores: MapaDeValores | null;
  /** Leituras concorrentes durante o preenchimento compartilham a ida ao banco. */
  emVoo: Promise<MapaDeValores> | null;
}

const globalComCache = globalThis as unknown as {
  configuracaoBroto?: EstadoDoCache;
};

const estado: EstadoDoCache = (globalComCache.configuracaoBroto ??= {
  valores: null,
  emVoo: null,
});

async function carregar(): Promise<MapaDeValores> {
  const linhas = await prisma.valorRegra.findMany({
    select: { chave: true, valor: true },
  });
  const mapa = new Map<ChaveValorRegra, number | null>();
  for (const linha of linhas) {
    mapa.set(linha.chave as ChaveValorRegra, linha.valor === null ? null : Number(linha.valor));
  }
  return mapa;
}

/** Descarta o cache. Chamado por toda escrita de valor de regra. */
export function invalidarCacheDeConfiguracao(): void {
  estado.valores = null;
  estado.emVoo = null;
}

async function valores(): Promise<MapaDeValores> {
  if (estado.valores) {
    return estado.valores;
  }
  if (!estado.emVoo) {
    estado.emVoo = carregar()
      .then((mapa) => {
        estado.valores = mapa;
        return mapa;
      })
      .finally(() => {
        estado.emVoo = null;
      });
  }
  return estado.emVoo;
}

/**
 * Valor vigente da chave — `null` quando o negócio ainda não o definiu
 * (é o caso dos tetos do dossiê, ficha §8).
 *
 * Se a linha não existir no banco (base sem seed), devolve o valor do
 * catálogo e registra o desvio: a plataforma segue funcionando com a régua
 * documentada em vez de quebrar a tela, mas o log denuncia a base
 * incompleta em vez de esconder o problema.
 */
export async function lerValor(chave: ChaveValorRegra): Promise<number | null> {
  const mapa = await valores();
  if (!mapa.has(chave)) {
    const definicao = definicaoDe(chave);
    logger.warn(
      { chave },
      "Valor de regra ausente no banco — usando o valor de catálogo. Rode o seed do Parametrizador.",
    );
    return definicao.valorInicial;
  }
  return mapa.get(chave) ?? null;
}

/**
 * Valor de uma régua que o código precisa ter para decidir (dias, meses).
 * Cai no valor de catálogo quando a linha existe mas está sem valor —
 * situação que só ocorre em base manipulada à mão, já que a T17 recusa
 * limpar uma régua.
 */
export async function lerRegua(chave: ChaveValorRegra): Promise<number> {
  const valor = await lerValor(chave);
  if (valor === null) {
    const definicao = definicaoDe(chave);
    if (definicao.valorInicial === null) {
      throw new Error(
        `A chave ${chave} não é uma régua com valor obrigatório — use lerValor e trate o nulo.`,
      );
    }
    logger.warn({ chave }, "Régua sem valor no banco — usando o valor de catálogo.");
    return definicao.valorInicial;
  }
  return valor;
}

/** Leitura em bloco para telas que exibem várias réguas de uma vez. */
export async function lerTodosOsValores(): Promise<
  Readonly<Record<ChaveValorRegra, number | null>>
> {
  const mapa = await valores();
  const resultado = {} as Record<ChaveValorRegra, number | null>;
  for (const definicao of CATALOGO_VALORES_REGRA) {
    resultado[definicao.chave] = mapa.has(definicao.chave)
      ? (mapa.get(definicao.chave) ?? null)
      : definicao.valorInicial;
  }
  return resultado;
}

/**
 * Régua de envelhecimento do funil (T8 e job diário). Devolve o par leve/
 * forte porque as duas pontas são sempre lidas juntas e precisam ser
 * coerentes entre si na mesma decisão.
 */
export async function lerReguaDeEnvelhecimento(): Promise<{
  leveDias: number;
  forteDias: number;
}> {
  const [leveDias, forteDias] = await Promise.all([
    lerRegua("FUNIL_ENVELHECIMENTO_LEVE_DIAS"),
    lerRegua("FUNIL_ENVELHECIMENTO_FORTE_DIAS"),
  ]);
  return { leveDias, forteDias };
}

import type { TarifaDossie, TetosDossie } from "@/dominio/dossie/custo";

/**
 * Configuração do dossiê automático — **exclusivamente por variáveis de
 * ambiente, sem nenhum default embutido**. São cinco valores, todos
 * [A CONFIRMAR TI] e nunca commitados:
 *
 * - `ANTHROPIC_API_KEY` — segredo do ambiente/CI;
 * - `DOSSIE_TETO_MENSAL_BRL` e `DOSSIE_CUSTO_MAX_UNITARIO_BRL` — os tetos;
 * - `DOSSIE_CUSTO_ENTRADA_BRL_MTOK` e `DOSSIE_CUSTO_SAIDA_BRL_MTOK` — a
 *   tarifa em reais por milhão de tokens (a tabela da Anthropic é em
 *   dólar; a conversão é decisão da TI, não do código).
 *
 * Faltando qualquer uma, o provedor automático fica **indisponível** com
 * mensagem clara e o ManualDossieProvider opera normalmente. Em
 * desenvolvimento é esse o estado esperado: não existe chave de teste
 * embutida, nem tarifa "provisória" no código — sem tarifa não há como
 * apurar custo, e sem custo o teto seria decoração.
 *
 * A partir da F10, os DOIS TETOS podem vir do Parametrizador (T17), como
 * a própria F8 previu. Quando o Administrador os define lá, aqueles
 * valores vencem os do ambiente: o teto é decisão de negócio, auditada e
 * com histórico, e não configuração de máquina. A chave e as tarifas
 * seguem exclusivamente no ambiente — são segredo e conversão cambial da
 * TI, não parâmetro de produto.
 */

export interface ConfiguracaoDossie {
  chaveApi: string;
  tarifa: TarifaDossie;
  tetos: TetosDossie;
}

export type EstadoConfiguracaoDossie =
  | { disponivel: true; configuracao: ConfiguracaoDossie }
  | { disponivel: false; faltando: ReadonlyArray<string>; mensagem: string };

export const VARIAVEIS_DO_DOSSIE = [
  "ANTHROPIC_API_KEY",
  "DOSSIE_TETO_MENSAL_BRL",
  "DOSSIE_CUSTO_MAX_UNITARIO_BRL",
  "DOSSIE_CUSTO_ENTRADA_BRL_MTOK",
  "DOSSIE_CUSTO_SAIDA_BRL_MTOK",
] as const;

/** Só as variáveis do dossiê — `process.env` se encaixa aqui. */
export type AmbienteDoDossie = Partial<
  Record<(typeof VARIAVEIS_DO_DOSSIE)[number], string | undefined>
>;

/**
 * Valor monetário positivo com ponto decimal ("1500", "0.75"). Vazio,
 * negativo, zero ou não numérico contam como ausente — a variável existe
 * mas não configura nada, e é melhor dizer isso do que gastar por engano.
 */
function lerValorPositivo(bruto: string | undefined): number | null {
  if (bruto === undefined) {
    return null;
  }
  const texto = bruto.trim();
  if (!texto) {
    return null;
  }
  const valor = Number(texto);
  if (!Number.isFinite(valor) || valor <= 0) {
    return null;
  }
  return valor;
}

/**
 * Fronteira com o processo: `NodeJS.ProcessEnv` declara apenas as chaves
 * conhecidas do Next, então a conversão para o recorte do dossiê acontece
 * aqui, num único lugar.
 */
export function ambienteDoProcesso(): AmbienteDoDossie {
  return process.env as unknown as AmbienteDoDossie;
}

/** Tetos vindos do Parametrizador; `null` = não definidos lá (ficha §8). */
export interface TetosDoParametrizador {
  mensalBrl: number | null;
  unitarioBrl: number | null;
}

/**
 * Lê o ambiente (e, quando informados, os tetos do Parametrizador) e diz
 * se a geração automática está configurada. Teto definido na T17 vence o
 * do ambiente; ausente lá, o ambiente responde; ausente nos dois, falta
 * configuração e a geração automática segue indisponível.
 */
export function lerConfiguracaoDossie(
  ambiente: AmbienteDoDossie = ambienteDoProcesso(),
  tetosDoParametrizador?: TetosDoParametrizador,
): EstadoConfiguracaoDossie {
  const chaveApi = (ambiente.ANTHROPIC_API_KEY ?? "").trim();
  const tetoMensal =
    tetosDoParametrizador?.mensalBrl ?? lerValorPositivo(ambiente.DOSSIE_TETO_MENSAL_BRL);
  const tetoUnitario =
    tetosDoParametrizador?.unitarioBrl ??
    lerValorPositivo(ambiente.DOSSIE_CUSTO_MAX_UNITARIO_BRL);
  const tarifaEntrada = lerValorPositivo(ambiente.DOSSIE_CUSTO_ENTRADA_BRL_MTOK);
  const tarifaSaida = lerValorPositivo(ambiente.DOSSIE_CUSTO_SAIDA_BRL_MTOK);

  const faltando: string[] = [];
  if (!chaveApi) faltando.push("ANTHROPIC_API_KEY");
  // Os tetos agora têm dois caminhos: o nome citado é o do ambiente, mas a
  // mensagem lembra que defini-los na T17 também resolve.
  if (tetoMensal === null) faltando.push("DOSSIE_TETO_MENSAL_BRL");
  if (tetoUnitario === null) faltando.push("DOSSIE_CUSTO_MAX_UNITARIO_BRL");
  if (tarifaEntrada === null) faltando.push("DOSSIE_CUSTO_ENTRADA_BRL_MTOK");
  if (tarifaSaida === null) faltando.push("DOSSIE_CUSTO_SAIDA_BRL_MTOK");

  if (faltando.length > 0 || tetoMensal === null || tetoUnitario === null || tarifaEntrada === null || tarifaSaida === null) {
    return {
      disponivel: false,
      faltando,
      mensagem: mensagemDeIndisponibilidade(faltando),
    };
  }

  return {
    disponivel: true,
    configuracao: {
      chaveApi,
      tarifa: {
        entradaBrlPorMilhao: tarifaEntrada,
        saidaBrlPorMilhao: tarifaSaida,
      },
      tetos: { mensalBrl: tetoMensal, unitarioBrl: tetoUnitario },
    },
  };
}

/** Mensagem institucional exibida na T11 quando falta configuração. */
export function mensagemDeIndisponibilidade(faltando: ReadonlyArray<string>): string {
  const soTetos = faltando.every(
    (nome) => nome === "DOSSIE_TETO_MENSAL_BRL" || nome === "DOSSIE_CUSTO_MAX_UNITARIO_BRL",
  );
  const ondeResolver =
    faltando.length > 0 && soTetos
      ? "no Parametrizador (Valores de regra › Tetos do dossiê) ou no ambiente"
      : "no ambiente";
  return (
    `Geração automática indisponível: falta configurar ${faltando.join(", ")} ${ondeResolver}. ` +
    "Enquanto isso, o dossiê pode ser inserido manualmente — a plataforma não embute chave nem tarifa de teste."
  );
}

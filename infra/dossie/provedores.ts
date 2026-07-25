import type { TetosDossie } from "@/dominio/dossie/custo";
import {
  type AmbienteDoDossie,
  type TetosDoParametrizador,
  ambienteDoProcesso,
  lerConfiguracaoDossie,
} from "./configuracao";
import { lerValor } from "@/infra/configuracao/servico-configuracao";
import { AnthropicDossieProvider } from "./provedor-anthropic";
import { ManualDossieProvider } from "./provedor-manual";
import type { DossieProvider } from "./provedor";

/**
 * Escolha do provedor a partir do ambiente. O manual está sempre de pé; o
 * automático só existe com a configuração completa — sem ela, a T11
 * mostra a mensagem de indisponibilidade e o botão "Gerar dossiê" fica
 * desabilitado, enquanto "Inserir manualmente" segue funcionando.
 */

export interface ProvedorAutomaticoDisponivel {
  disponivel: true;
  provedor: DossieProvider;
  tetos: TetosDossie;
}

export interface ProvedorAutomaticoIndisponivel {
  disponivel: false;
  mensagem: string;
  faltando: ReadonlyArray<string>;
}

export type EstadoDoProvedorAutomatico =
  | ProvedorAutomaticoDisponivel
  | ProvedorAutomaticoIndisponivel;

/** Provedor manual — sempre disponível, sem configuração. */
export function provedorManual(): DossieProvider {
  return new ManualDossieProvider();
}

/** Provedor automático, se e somente se o ambiente estiver configurado. */
export function provedorAutomatico(
  ambiente: AmbienteDoDossie = ambienteDoProcesso(),
  tetosDoParametrizador?: TetosDoParametrizador,
): EstadoDoProvedorAutomatico {
  const estado = lerConfiguracaoDossie(ambiente, tetosDoParametrizador);
  if (!estado.disponivel) {
    return { disponivel: false, mensagem: estado.mensagem, faltando: estado.faltando };
  }
  const { chaveApi, tarifa, tetos } = estado.configuracao;
  return {
    disponivel: true,
    provedor: new AnthropicDossieProvider({ chaveApi, tarifa }),
    tetos,
  };
}

/** Tarifa configurada — usada para apurar o custo de cada execução. */
export function tarifaConfigurada(ambiente: AmbienteDoDossie = ambienteDoProcesso()) {
  const estado = lerConfiguracaoDossie(ambiente);
  return estado.disponivel ? estado.configuracao.tarifa : null;
}

/**
 * Tetos vigentes: o Parametrizador (T17) primeiro, o ambiente como
 * retaguarda. É a ponte que a F8 antecipou ao escrever que "os valores dos
 * tetos passam a ser editáveis sem código no Parametrizador".
 */
export async function tetosVigentes(): Promise<TetosDoParametrizador> {
  const [mensalBrl, unitarioBrl] = await Promise.all([
    lerValor("DOSSIE_TETO_MENSAL_BRL"),
    lerValor("DOSSIE_CUSTO_MAXIMO_UNITARIO_BRL"),
  ]);
  return { mensalBrl, unitarioBrl };
}

/**
 * Provedor automático com os tetos vigentes. É esta a porta que o produto
 * usa; `provedorAutomatico` continua síncrona e pura para os testes e para
 * quem já tem os tetos em mãos.
 */
export async function provedorAutomaticoVigente(): Promise<EstadoDoProvedorAutomatico> {
  return provedorAutomatico(ambienteDoProcesso(), await tetosVigentes());
}

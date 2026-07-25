import { validarConteudoDossie } from "@/dominio/dossie/schema";
import {
  type DossieProvider,
  ErroDeProvedor,
  type PedidoDeDossie,
  type ResultadoDaGeracao,
} from "./provedor";

/**
 * Provedor manual (ficha §6): o analista cola o dossiê produzido fora da
 * plataforma — com o mesmo prompt do template versionado, que a T11
 * oferece para copiar. Sempre disponível: é a alternativa permanente à
 * automação e o caminho de trabalho quando a chave não está configurada.
 *
 * Colar não é gerar: não consome orçamento e o conteúdo passa pela mesma
 * validação de schema. O dossiê inserido manualmente também nasce
 * requerendo revisão — a origem muda, a RN19 não.
 */
export class ManualDossieProvider implements DossieProvider {
  readonly nome = "manual";
  readonly automatico = false;

  /** Colar não consome orçamento — nada a estimar. */
  async estimarCustoMaximo(): Promise<number> {
    return 0;
  }

  async gerar(pedido: PedidoDeDossie): Promise<ResultadoDaGeracao> {
    const bruto = (pedido.conteudoColado ?? "").trim();
    if (!bruto) {
      throw new ErroDeProvedor(
        "CONTEUDO_AUSENTE",
        "Cole o conteúdo do dossiê (JSON do schema do template) antes de salvar.",
      );
    }

    const validacao = validarConteudoDossie(bruto);
    if (!validacao.valido) {
      throw new ErroDeProvedor(
        "RESPOSTA_INVALIDA",
        "O conteúdo colado não segue o schema do template do dossiê.",
        { detalhes: validacao.erros },
      );
    }

    return {
      conteudo: validacao.conteudo,
      avisos: validacao.avisos,
      uso: { tokensEntrada: 0, tokensSaida: 0, buscasWeb: null },
      modelo: null,
    };
  }
}

import { auth } from "@/infra/auth";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import { prepararSaidaDeRelatorio } from "@/infra/casos-de-uso/relatorios";
import { tabelaParaCsv } from "@/dominio/relatorios/pivo";
import {
  FORMATOS_DE_SAIDA,
  type FormatoDeSaida,
  tabelaParaTsv,
} from "@/dominio/relatorios/saida";
import { montarDocumentoHtml } from "@/infra/relatorios/saida-html";
import { montarPlanilhaXlsx } from "@/infra/relatorios/saida-xlsx";

/**
 * A saída da T36, em qualquer formato (RN83).
 *
 * **Por POST, e não por GET com a definição na querystring.** A definição é
 * um objeto com linhas, colunas, valores, filtros e ordenação; serializada
 * na URL, ela estouraria o limite prático de comprimento num relatório com
 * meia dúzia de filtros, e o corte apareceria como erro sem causa. O corpo
 * não tem esse teto — e agora carrega também o SVG do gráfico, que é grande.
 *
 * A rota não decide nada além de traduzir a resposta: permissão, finalidade,
 * teto e trilha são do caso de uso, que é o mesmo da execução em tela — a
 * saída **não é atalho** para nada (RN76, RN83). O que ela escolhe é só o
 * renderizador, e renderizador não consulta banco.
 */

interface CorpoDaSaida {
  definicao?: unknown;
  finalidade?: string;
  relatorioId?: string;
  nome?: string;
  formato?: string;
  /** O gráfico já desenhado pela tela; higienizado antes de entrar no HTML. */
  svg?: string;
}

/** Tipo de mídia por formato. O TSV sai como texto simples, não como arquivo. */
const TIPO_POR_FORMATO: Readonly<Record<FormatoDeSaida, string>> = {
  CSV: "text/csv; charset=utf-8",
  HTML: "text/html; charset=utf-8",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  AREA_TRANSFERENCIA: "text/plain; charset=utf-8",
};

function ehFormatoConhecido(valor: unknown): valor is FormatoDeSaida {
  return typeof valor === "string" && (FORMATOS_DE_SAIDA as ReadonlyArray<string>).includes(valor);
}

export async function POST(requisicao: Request) {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }

  let corpo: CorpoDaSaida;
  try {
    corpo = (await requisicao.json()) as CorpoDaSaida;
  } catch {
    return new Response("Corpo da requisição ilegível.", { status: 400 });
  }

  // Formato ausente é CSV: é o que a rota fazia antes de existirem outros, e
  // manter isso evita quebrar qualquer chamador que já a use.
  const formato: FormatoDeSaida = corpo.formato === undefined ? "CSV" : corpo.formato as FormatoDeSaida;
  if (!ehFormatoConhecido(formato)) {
    // Nomeia a causa sem ecoar o que veio (RN55): o valor recebido é entrada
    // de fora, e devolvê-lo o refletiria de volta na resposta.
    return new Response("Formato de saída desconhecido.", { status: 422 });
  }

  try {
    const saida = await prepararSaidaDeRelatorio(
      { id: sessao.user.id, papel: sessao.user.papel },
      corpo.definicao,
      formato,
      {
        finalidade: corpo.finalidade,
        relatorioId: corpo.relatorioId,
        nome: corpo.nome,
        autor: sessao.user.name ?? sessao.user.email ?? "—",
      },
    );

    const corpoDaResposta = await renderizar(formato, saida, corpo.svg);

    const cabecalhos: Record<string, string> = {
      "Content-Type": TIPO_POR_FORMATO[formato],
      // Declarado no cabeçalho pelo mesmo motivo do extrato de auditoria: um
      // arquivo truncado em silêncio é indistinguível de um completo. Nos
      // formatos de gente o aviso vai TAMBÉM por dentro (RN85), porque
      // cabeçalho HTTP não sobrevive ao arquivo.
      "X-Relatorio-Linhas": String(saida.linhas),
      "X-Relatorio-Truncado": String(saida.truncado),
    };

    /*
     * A área de transferência não é arquivo: quem a pediu vai copiar o texto,
     * não baixá-lo. Anexar `Content-Disposition` aqui faria o navegador
     * oferecer um download que ninguém pediu.
     *
     * O HTML também não leva anexo, e por outro motivo: ele existe para ser
     * ABERTO e impresso. Forçado como download, viraria um arquivo na pasta
     * que a pessoa ainda teria de encontrar e abrir à mão.
     */
    if (formato === "CSV" || formato === "XLSX") {
      cabecalhos["Content-Disposition"] = `attachment; filename="${saida.nomeArquivo}"`;
    }

    // `Uint8Array` e não `Buffer`: é o que `BodyInit` aceita, e é como as
    // outras rotas de planilha da casa já devolvem bytes.
    const bytes =
      typeof corpoDaResposta === "string" ? corpoDaResposta : new Uint8Array(corpoDaResposta);
    return new Response(bytes, { headers: cabecalhos });
  } catch (erro) {
    const mensagens = mensagensDeFalha(erro, {
      operacao: "gerar a saída do relatório",
      semPermissao:
        "Seu papel não alcança este assunto — o Gerador de relatórios não amplia o que você já vê na plataforma (RN76).",
      contexto: "gerador-de-relatorios/exportar",
    });
    // 422 e não 500: a recusa quase sempre é da definição (campo fora do
    // catálogo, medida que não vale, finalidade ausente), e é coisa que quem
    // está na tela corrige. Só o que `mensagensDeFalha` não reconhece vira
    // genérico — e mesmo aí o detalhe fica no log, nunca no corpo (RN55).
    return new Response(mensagens.join(" "), { status: 422 });
  }
}

async function renderizar(
  formato: FormatoDeSaida,
  saida: Awaited<ReturnType<typeof prepararSaidaDeRelatorio>>,
  svg?: string,
): Promise<string | Buffer> {
  switch (formato) {
    case "CSV":
      return tabelaParaCsv(saida.tabela);
    case "AREA_TRANSFERENCIA":
      return tabelaParaTsv(saida.tabela);
    case "XLSX":
      return montarPlanilhaXlsx({
        titulo: saida.titulo,
        tabela: saida.tabela,
        procedencia: saida.procedencia,
      });
    case "HTML":
      return montarDocumentoHtml({
        titulo: saida.titulo,
        tabela: saida.tabela,
        procedencia: saida.procedencia,
        svg,
      });
  }
}

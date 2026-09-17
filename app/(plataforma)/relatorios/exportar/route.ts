import { auth } from "@/infra/auth";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import { exportarRelatorioCsv } from "@/infra/casos-de-uso/relatorios";

/**
 * "Exportar (CSV)" da T36.
 *
 * **Por POST, e não por GET com a definição na querystring.** A definição é
 * um objeto com linhas, colunas, valores, filtros e ordenação; serializada
 * na URL, ela estouraria o limite prático de comprimento num relatório com
 * meia dúzia de filtros, e o corte apareceria como erro sem causa. O corpo
 * não tem esse teto.
 *
 * A rota não decide nada além de traduzir a resposta: permissão, finalidade,
 * teto e trilha são do caso de uso, que é o mesmo da execução em tela — a
 * exportação **não é atalho** para nada (RN76).
 */
export async function POST(requisicao: Request) {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }

  let corpo: { definicao?: unknown; finalidade?: string; relatorioId?: string };
  try {
    corpo = (await requisicao.json()) as typeof corpo;
  } catch {
    return new Response("Corpo da requisição ilegível.", { status: 400 });
  }

  try {
    const resultado = await exportarRelatorioCsv(
      { id: sessao.user.id, papel: sessao.user.papel },
      corpo.definicao,
      { finalidade: corpo.finalidade, relatorioId: corpo.relatorioId },
    );

    return new Response(resultado.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${resultado.nomeArquivo}"`,
        // Declarado no cabeçalho pelo mesmo motivo do extrato de auditoria: o
        // CSV sozinho não diria que houve corte, e um arquivo truncado em
        // silêncio é indistinguível de um arquivo completo.
        "X-Relatorio-Linhas": String(resultado.linhas),
        "X-Relatorio-Truncado": String(resultado.truncado),
      },
    });
  } catch (erro) {
    const mensagens = mensagensDeFalha(erro, {
      operacao: "exportar o relatório",
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

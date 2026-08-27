import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { gerarModeloAssinantesCsv } from "@/dominio/assinantes/modelo-importacao";

/**
 * "Baixar modelo" da importação de Assinantes (T20): a planilha em branco
 * com as colunas que o importador reconhece, para conferir o formato antes
 * de subir. Mesma guarda de permissão do envio (IMPORTAR_ASSINANTES).
 */
export async function GET() {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!podeExecutar(sessao.user.papel, "IMPORTAR_ASSINANTES")) {
    return new Response("Importar assinantes exige papel Gestor ou Analista.", {
      status: 403,
    });
  }

  const csv = gerarModeloAssinantesCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-importacao-assinantes.csv"',
      "Cache-Control": "no-store",
    },
  });
}

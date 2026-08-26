import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { gerarModeloResgatesCsv } from "@/dominio/telemetria-operadora/modelo-resgates";

/**
 * "Baixar modelo de referência" do relatório de resgates/compras da
 * operadora. Não é um formulário a preencher (a Minutrade gera o arquivo) —
 * é a referência das colunas esperadas, para conferir se o arquivo recebido
 * veio no formato certo. Mesma guarda de permissão do envio (IMPORTAR_TELEMETRIA).
 */
export async function GET() {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!podeExecutar(sessao.user.papel, "IMPORTAR_TELEMETRIA")) {
    return new Response("Importar telemetria exige papel Gestor ou Analista (ficha §2).", {
      status: 403,
    });
  }

  const csv = gerarModeloResgatesCsv();
  const nome = "modelo-referencia-resgates-operadora.csv";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

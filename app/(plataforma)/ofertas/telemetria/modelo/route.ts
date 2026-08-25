import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { gerarModeloTelemetriaCsv } from "@/dominio/integracao/telemetria";

/**
 * "Baixar modelo" do importador de telemetria — o mesmo recurso que o
 * importador de soluções já oferece. Gera o `.csv` do layout-alvo (ficha
 * §6) na hora, com o cabeçalho na ordem certa e uma linha de exemplo por
 * evento reconhecido, para a pessoa ver o formato antes de montar o arquivo
 * e não cair em quarentena por engano.
 *
 * Mesma guarda de permissão da tela (IMPORTAR_TELEMETRIA): o modelo não traz
 * dado da operação, mas o download acompanha quem pode importar.
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

  const csv = gerarModeloTelemetriaCsv();
  const nome = "modelo-importacao-telemetria.csv";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

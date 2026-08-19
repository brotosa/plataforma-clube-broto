import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { gerarModeloSolucoes } from "@/infra/importacao-catalogo/modelo-solucoes";

/**
 * "Baixar modelo" do importador de soluções. Gera o `.xlsx` na hora, já
 * pré-preenchido com o catálogo atual e com o menu de categorias — assim o
 * ID de ligação e os valores de lista são administrados pela plataforma, e
 * a pessoa só preenche/edita.
 */
export async function GET() {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!podeExecutar(sessao.user.papel, "CRIAR_EDITAR")) {
    return new Response("Importar soluções exige papel Gestor ou Analista (ficha §2).", {
      status: 403,
    });
  }

  const arquivo = await gerarModeloSolucoes();
  const nome = "modelo-importacao-solucoes.xlsx";
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

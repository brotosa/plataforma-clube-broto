import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { gerarModeloOfertas } from "@/infra/importacao-catalogo/modelo-ofertas";

/**
 * "Baixar modelo" do importador de ofertas: `.xlsx` com as ofertas atuais,
 * a aba de referência das soluções (ID Solução) e os menus do Parametrizador.
 */
export async function GET() {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!podeExecutar(sessao.user.papel, "CRIAR_EDITAR")) {
    return new Response("Importar ofertas exige papel Gestor ou Analista (ficha §2).", {
      status: 403,
    });
  }

  const arquivo = await gerarModeloOfertas();
  const nome = "modelo-importacao-ofertas.xlsx";
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { gerarModeloAssinantesXlsx } from "@/infra/assinantes/modelo-importacao-xlsx";

/**
 * "Baixar modelo" da importação de Assinantes (T20): a planilha `.xlsx` com
 * as colunas que o importador reconhece e menus suspensos nas que
 * referenciam dado do sistema (Patrocinador por código, Perfil, Preferência)
 * — para escolher em vez de digitar e errar. Mesma guarda de permissão do
 * envio (IMPORTAR_ASSINANTES).
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

  const arquivo = await gerarModeloAssinantesXlsx();
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-assinantes.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

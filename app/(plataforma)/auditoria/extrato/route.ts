import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { exportarExtratoDeAuditoria } from "@/infra/casos-de-uso/auditoria";
import { filtrosDaQuerystring } from "../filtros";

/**
 * "Exportar extrato (CSV)" da T28 — RN48.
 *
 * O caso de uso é quem grava a meta-trilha; esta rota só traduz a
 * querystring nos mesmos filtros que a tela usou, para que o arquivo
 * corresponda exatamente ao que a pessoa estava vendo.
 */
export async function GET(requisicao: Request) {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!podeExecutar(sessao.user.papel, "EXPORTAR_EXTRATO_AUDITORIA")) {
    return new Response(
      "Exportar o extrato de auditoria exige papel Gestor ou Administrador (RN48).",
      { status: 403 },
    );
  }

  const parametros = new URL(requisicao.url).searchParams;
  const filtros = filtrosDaQuerystring(Object.fromEntries(parametros.entries()));

  const extrato = await exportarExtratoDeAuditoria(
    { id: sessao.user.id, papel: sessao.user.papel },
    filtros,
  );

  return new Response(extrato.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${extrato.nomeArquivo}"`,
      // Declarado no cabeçalho porque o CSV, sozinho, não diria que houve
      // corte: o teto do extrato é explícito, nunca truncamento silencioso.
      "X-Extrato-Linhas": String(extrato.linhas),
      "X-Extrato-Total": String(extrato.total),
      "X-Extrato-Truncado": String(extrato.truncado),
    },
  });
}

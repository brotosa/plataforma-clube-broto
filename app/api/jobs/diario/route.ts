import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { executarJobDiario } from "@/infra/jobs/job-diario";

/**
 * Disparo manual do job diário (RN03 + janela contratual) pelo Gestor —
 * em produção o agendador chama `pnpm job:diario`.
 */
export async function POST() {
  const sessao = await auth();
  if (!sessao?.user || !podeExecutar(sessao.user.papel, "CONFIGURAR_REGRAS_APROVACAO")) {
    return NextResponse.json({ mensagem: "Ação restrita ao Gestor do Clube." }, { status: 403 });
  }
  const resultado = await executarJobDiario();
  return NextResponse.json(resultado);
}

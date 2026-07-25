import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { contarAssinantes } from "@/infra/consultas/assinantes";
import { ErroDeSegmentoInvalido } from "@/dominio/segmentacao/compilador";

/**
 * Endpoint de contagem viva da T18 (RN33) — separado e rápido: recebe a
 * estrutura declarativa, devolve só o total (ou o estado "aguardando
 * telemetria por assinante", RN36). Contagens são abertas a todos os
 * papéis autenticados; identificação nominal fica nas consultas com
 * máscara/permissão.
 */
export async function POST(requisicao: Request) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  let corpo: unknown;
  try {
    corpo = await requisicao.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }
  const regras = (corpo as { regras?: unknown })?.regras ?? [];
  try {
    const resultado = await contarAssinantes(regras);
    return NextResponse.json(resultado);
  } catch (erro) {
    if (erro instanceof ErroDeSegmentoInvalido) {
      return NextResponse.json({ erro: erro.erros }, { status: 422 });
    }
    throw erro;
  }
}

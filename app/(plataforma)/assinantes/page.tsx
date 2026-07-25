import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { decidirExibicaoPlena } from "@/infra/casos-de-uso/assinantes-segmentos";
import {
  camposDoConstrutor,
  existeBaseImportada,
  listarCarteira,
} from "@/infra/consultas/assinantes";
import { CarteiraAssinantes } from "./carteira";

/**
 * T18 — Carteira de assinantes. Consulta paginada no servidor; máscara
 * decidida AQUI (RN30): a exibição plena só acontece com a permissão e
 * gera evento de auditoria antes de qualquer dado sair; o cliente recebe
 * o que pode ver, nunca decide.
 */
export default async function PaginaCarteira({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const parametros = await searchParams;
  const regrasBrutas = typeof parametros.regras === "string" ? parametros.regras : "[]";
  let regras: unknown = [];
  try {
    regras = JSON.parse(regrasBrutas);
  } catch {
    regras = [];
  }
  const busca = typeof parametros.busca === "string" ? parametros.busca : "";
  const pagina = Number(parametros.pagina ?? 1) || 1;
  const solicitouPlenos = parametros.plenos === "1";
  const segmentoEdicaoId =
    typeof parametros.segmento === "string" ? parametros.segmento : null;

  const ator = { id: sessao.user.id, papel: sessao.user.papel };
  const podePlenos = podeExecutar(ator.papel, "VISUALIZAR_DADOS_PESSOAIS_PLENOS");
  const { dadosPlenos } = await decidirExibicaoPlena(ator, {
    exibirPlenos: solicitouPlenos,
    contexto: "carteira",
  });

  const [campos, temBase] = await Promise.all([
    camposDoConstrutor(),
    existeBaseImportada(),
  ]);

  let carteira: Awaited<ReturnType<typeof listarCarteira>> | null = null;
  let erroConsulta = false;
  try {
    carteira = await listarCarteira({ regras, busca, pagina }, { dadosPlenos });
  } catch {
    erroConsulta = true;
  }

  return (
    <CarteiraAssinantes
      campos={[...campos.nucleo, ...campos.enriquecimento]}
      regrasIniciais={Array.isArray(regras) ? (regras as never[]) : []}
      busca={busca}
      carteira={
        carteira
          ? {
              status: carteira.status,
              motivo: carteira.motivo,
              linhas: carteira.linhas.map((linha) => ({
                ...linha,
                vencimento: linha.vencimento?.toISOString().slice(0, 10) ?? null,
                preferencia: linha.preferencia?.toLowerCase() ?? null,
              })),
              total: carteira.total,
              pagina: carteira.pagina,
              tamanhoPagina: carteira.tamanhoPagina,
            }
          : null
      }
      erroConsulta={erroConsulta}
      temBase={temBase}
      dadosPlenos={dadosPlenos}
      podePlenos={podePlenos}
      podeExportar={podeExecutar(ator.papel, "EXPORTAR_LISTAS_CONTATO")}
      podeGerirSegmentos={podeExecutar(ator.papel, "GERIR_SEGMENTOS")}
      segmentoEdicaoId={segmentoEdicaoId}
    />
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { historicoImportacoesAssinantes } from "@/infra/casos-de-uso/assinantes-importacao";
import { Importador } from "./importador";

/**
 * T20 — Importações de assinantes: fluxo em cinco passos (família →
 * arquivo → mapeamento → política → resumo), com histórico de cargas.
 * RN29/RN31: upsert idempotente por CPF, quarentena com motivo, nunca
 * tudo-ou-nada; foto completa exige confirmação digitada.
 */
export default async function PaginaImportacoes() {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const podeImportar = podeExecutar(sessao.user.papel, "IMPORTAR_ASSINANTES");
  const historico = await historicoImportacoesAssinantes();

  return (
    <Importador
      podeImportar={podeImportar}
      historico={historico.map((carga) => ({
        id: carga.id,
        arquivo: carga.nomeArquivo,
        familia:
          carga.tipo === "ASSINANTES_NUCLEO" ? "Base de assinantes" : "Enriquecimento",
        politica:
          carga.politica === "FOTO_COMPLETA"
            ? "foto completa"
            : carga.politica === "INCREMENTAL"
              ? "incremental"
              : "—",
        autor: carga.autor.nome,
        data: new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Sao_Paulo",
        }).format(carga.criadoEm),
        resultado: carga.resumo
          ? resumirResultado(carga.resumo as Record<string, unknown>)
          : "preparada — sem efetivação",
        temErros: carga.linhasErro > 0,
      }))}
    />
  );
}

function resumirResultado(resumo: Record<string, unknown>): string {
  if ("dryRun" in resumo) {
    return "conferida — aguardando confirmação";
  }
  if ("assinantesEnriquecidos" in resumo) {
    return `${resumo.assinantesEnriquecidos} enriquecidos → ${resumo.divergencias ?? 0} divergências → ${resumo.quarentena ?? 0} quarentena`;
  }
  const foraDaBase =
    resumo.foraDaBase != null ? ` → ${resumo.foraDaBase} fora da base` : "";
  return `${resumo.novos ?? 0} novos → ${resumo.atualizados ?? 0} atualizados → ${resumo.quarentena ?? 0} quarentena${foraDaBase}`;
}

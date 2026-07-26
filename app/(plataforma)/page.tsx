import type { Metadata } from "next";
import { montarPainel, periodoValido } from "@/infra/consultas/dashboard";
import { PainelDashboard } from "./painel-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * T26 — Dashboard, a HOME da plataforma (ficha Onda 6 §2): rota inicial
 * pós-login e primeiro item da sidebar.
 *
 * Visível a todos os papéis porque só exibe agregados — nenhum dado
 * pessoal, coerente com a RN33. Não há guarda de permissão aqui de
 * propósito: o que a tela mostra já é público para quem tem sessão, e
 * cada cartão leva à tela de origem, onde o RBAC de sempre decide o que a
 * pessoa pode fazer.
 */
export default async function PaginaDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const periodo = periodoValido(parametros.periodo);
  const agora = new Date();
  const painel = await montarPainel(periodo, agora);

  const hoje = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(agora);

  return (
    <PainelDashboard
      periodo={periodo}
      hoje={hoje}
      pendencias={painel.pendencias}
      blocos={painel.blocos}
      destaque={painel.destaque}
      meta={painel.meta}
      janelaVitrineEmDias={painel.janelaVitrineEmDias}
    />
  );
}

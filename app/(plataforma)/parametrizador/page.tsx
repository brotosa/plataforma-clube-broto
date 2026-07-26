import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { MENSAGEM_RN24_SEM_EXCLUSAO } from "@/dominio/parametrizador/listas";
import { TAXAS_EM_STANDBY } from "@/dominio/parametrizador/estruturais";
import {
  cartoesDasFamilias,
  estruturaisDoHub,
  regraSensivelExigida,
} from "@/infra/consultas/parametrizador";
import { AvisoDeLeitura, IconeCadeado } from "./componentes";

export const metadata: Metadata = {
  title: "Parametrizador",
};

/**
 * T15 — Hub do Parametrizador (protótipo v6.1). Cartões por família com
 * contagem e último ajuste, valores de regra, link para as regras de
 * aprovação (T7), a seção de estruturais somente leitura com justificativa
 * (RN26) e as taxas em standby. Leitura para todos os papéis (RN23): quem
 * não é Administrador vê o mesmo conteúdo com o banner de visualização.
 */
export default async function PaginaParametrizador() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  if (!podeExecutar(papel, "VISUALIZAR_PARAMETROS")) {
    redirect("/");
  }
  const ehAdmin = podeExecutar(papel, "CONFIGURAR_PARAMETROS");

  const [familias, estruturais, sensivelLigada] = await Promise.all([
    cartoesDasFamilias(),
    estruturaisDoHub(),
    regraSensivelExigida(),
  ]);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Parametrizador</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Listas de domínio e valores de regra da plataforma · toda escrita é auditada com
            valor anterior, novo, autor e data
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {ehAdmin ? (
          <span className="pill pill-ok">
            <i />
            Você pode editar
          </span>
        ) : null}
      </div>

      {ehAdmin ? null : <AvisoDeLeitura contexto="hub" />}

      <h2 className="h-el" style={{ marginBottom: 10 }}>
        Listas de domínio{" "}
        <span className="cap" style={{ fontWeight: 400 }}>
          · editáveis sem código, com integridade referencial
        </span>
      </h2>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "80ch" }}>
        {MENSAGEM_RN24_SEM_EXCLUSAO}
      </p>
      <div className="pm-grid" style={{ marginBottom: 26 }}>
        {familias.map((familia) => (
          <div key={familia.id} className="pm-card">
            <div className="pm-secao">{familia.secao}</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 6 }}>
              <h3 className="h-el" style={{ fontSize: 16, flex: 1 }}>
                {familia.rotulo}
              </h3>
              {familia.quantidade === 0 ? <span className="selo">seed pendente</span> : null}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
              <span className="kpi-n num" style={{ fontSize: 26 }}>
                {familia.quantidade === 0 ? "—" : familia.quantidade}
              </span>
              <span className="cap">{familia.unidade}</span>
              {familia.quantidadeInativos > 0 ? (
                <span className="cap">· {familia.quantidadeInativos} inativos</span>
              ) : null}
            </div>
            <div className="cap" style={{ marginTop: 8 }}>
              {familia.ultimoAjuste}
            </div>
            <Link
              href={`/parametrizador/listas/${familia.id}`}
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 14, width: "max-content", textDecoration: "none" }}
            >
              {ehAdmin ? "Abrir editor" : "Ver lista"}
            </Link>
          </div>
        ))}
      </div>

      <h2 className="h-el" style={{ marginBottom: 10 }}>
        Valores de regra e aprovações
      </h2>
      <div className="pm-grid" style={{ marginBottom: 26 }}>
        <div className="pm-card">
          <h3 className="h-el" style={{ fontSize: 16 }}>
            Valores de regra
          </h3>
          <p className="cap" style={{ margin: "8px 0 0" }}>
            Réguas do funil e da vitrine, comissão-padrão, metas por período e tetos do dossiê.
            Cada valor guarda histórico e vale prospectivamente.
          </p>
          <Link
            href="/parametrizador/valores"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, width: "max-content", textDecoration: "none" }}
          >
            {ehAdmin ? "Abrir valores de regra" : "Ver valores vigentes"}
          </Link>
        </div>
        <div className="pm-card">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <h3 className="h-el" style={{ fontSize: 16, flex: 1 }}>
              Regras de aprovação
            </h3>
            <span className={sensivelLigada ? "pill pill-ok" : "pill pill-neutra"}>
              {sensivelLigada ? "parâmetro sensível: ligado" : "parâmetro sensível: desligado"}
            </span>
          </div>
          <p className="cap" style={{ margin: "8px 0 0" }}>
            O que exige aprovação antes de valer. A família sensível — comissão, pesos, tetos e
            metas — pode passar a exigir aprovação sem código (RN27, nasce desligada).
          </p>
          <Link
            href="/aprovacoes/regras"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, width: "max-content", textDecoration: "none" }}
          >
            Abrir regras de aprovação
          </Link>
        </div>
      </div>

      <h2 className="h-el" style={{ marginBottom: 6 }}>
        Estruturais — somente leitura
      </h2>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "76ch" }}>
        Estes parâmetros carregam validações, comissão e a integração com a Minutrade: alterá-los
        é release versionado, não configuração (RN26).
      </p>
      <div className="card" style={{ marginBottom: 26 }}>
        {estruturais.map((estrutural) => (
          <div key={estrutural.chave} className="pm-ro">
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "var(--font-body-label-bold)" }}>{estrutural.rotulo}</div>
              <div className="cap" style={{ marginTop: 3 }}>
                {estrutural.justificativa}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
              <span className="cap num">{estrutural.contagem}</span>
              <span className="pill pill-neutra">
                <IconeCadeado />
                somente leitura
              </span>
            </div>
          </div>
        ))}
      </div>

      <h2 className="h-el" style={{ marginBottom: 6 }}>
        Taxas transacionais do meio de pagamento
      </h2>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "76ch" }}>
        Exibidas como referência informativa. Edição fora do escopo por decisão de 24/07.
      </p>
      <div className="card">
        <div className="pm-ro">
          <div>
            <div style={{ font: "var(--font-body-label-bold)" }}>{TAXAS_EM_STANDBY.rotulo}</div>
            <div className="cap" style={{ marginTop: 3 }}>
              {TAXAS_EM_STANDBY.descricao} <span className="selo">{TAXAS_EM_STANDBY.pendencia}</span>
            </div>
          </div>
          <span className="pill pill-pendente">{TAXAS_EM_STANDBY.etiqueta}</span>
        </div>
      </div>
    </div>
  );
}

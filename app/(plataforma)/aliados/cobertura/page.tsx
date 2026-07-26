import type { Metadata } from "next";
import Link from "next/link";
import {
  type VisaoDaCobertura,
  calcularConcentracao,
  montarPortfolio,
  ordenarPorVolume,
  resumirPortfolio,
} from "@/dominio/cobertura/cobertura";
import {
  FUNIL_IGNORA_CULTURA,
  apurarCobertura,
  culturasParaFiltro,
  matrizCategoriaCultura,
} from "@/infra/consultas/cobertura";
import {
  REGIOES,
  ROTULOS_REGIAO,
  type Regiao,
} from "@/dominio/geografia/regioes";
import { SegmentadoDaSecao, VISOES_DE_ALIADOS } from "@/app/(plataforma)/segmentado-secao";
import { PainelCobertura } from "./painel-cobertura";

export const metadata: Metadata = {
  title: "Cobertura do portfólio",
};

function regiaoValida(valor: unknown): Regiao | undefined {
  return typeof valor === "string" && (REGIOES as ReadonlyArray<string>).includes(valor)
    ? (valor as Regiao)
    : undefined;
}

/**
 * T29 — Cobertura do portfólio (ficha Onda 7 §2).
 *
 * Rota irmã da lista de aliados. Servidor: todo número chega pronto do
 * serviço único (RN51), e os filtros viajam por querystring — sem estado de
 * cliente, com histórico e link compartilhável, mesmo padrão da T1 e da T8.
 */
export default async function PaginaCobertura({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const visao: VisaoDaCobertura = parametros.visao === "solucoes" ? "SOLUCOES" : "ALIADOS";
  const culturaId = typeof parametros.cultura === "string" ? parametros.cultura : "";
  const regiao = regiaoValida(parametros.regiao);

  const [{ fatos, excluidos }, matriz, culturas] = await Promise.all([
    apurarCobertura({ culturaId: culturaId || undefined, regiao }),
    matrizCategoriaCultura(),
    culturasParaFiltro(),
  ]);

  const portfolio = montarPortfolio(fatos);
  const resumo = resumirPortfolio(portfolio);
  const linhas = ordenarPorVolume(portfolio, visao);
  const concentracao = calcularConcentracao(portfolio, visao);

  const culturaNome = culturas.find((cultura) => cultura.id === culturaId)?.nome ?? null;
  const temFiltro = Boolean(culturaId || regiao);

  const recorte = [
    culturaNome ? `cultura ${culturaNome}` : null,
    regiao ? `região ${ROTULOS_REGIAO[regiao]}` : null,
  ].filter(Boolean);
  const resumoDoRecorte =
    recorte.length > 0
      ? `Recorte: ${recorte.join(" · ")} — ${resumo.categorias} categoria(s) da vitrine`
      : `Rede inteira — ${resumo.categorias} categoria(s) da vitrine`;

  /** A querystring de um filtro, preservando os demais. */
  const comFiltro = (mudanca: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const atual: Record<string, string | undefined> = {
      visao: visao === "SOLUCOES" ? "solucoes" : undefined,
      cultura: culturaId || undefined,
      regiao: regiao ?? undefined,
      ...mudanca,
    };
    for (const [chave, valor] of Object.entries(atual)) {
      if (valor) {
        query.set(chave, valor);
      }
    }
    const texto = query.toString();
    return texto ? `/aliados/cobertura?${texto}` : "/aliados/cobertura";
  };

  return (
    <div className="tela" data-tela="T29 Cobertura do portfolio" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Cobertura do portfólio</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Onde a rede está completa, onde é frágil e onde não existe
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentadoDaSecao
          nome="Visões de Aliados &amp; Soluções"
          visoes={VISOES_DE_ALIADOS}
          ativa="COBERTURA"
        />
        <Link href="/aliados/novo" className="btn btn-azul" style={{ textDecoration: "none" }}>
          + Novo aliado
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {/* Âncoras: estas trocas mudam apenas a querystring, e o <Link> do
            App Router não confirma esse tipo de transição (ver o comentário
            em `segmentado-secao.tsx`, com a medição). */}
        <nav className="seg" aria-label="Leitura da cobertura">
          <a
            href={comFiltro({ visao: undefined })}
            className={visao === "ALIADOS" ? "on" : ""}
            aria-current={visao === "ALIADOS" ? "page" : undefined}
          >
            Aliados
          </a>
          <a
            href={comFiltro({ visao: "solucoes" })}
            className={visao === "SOLUCOES" ? "on" : ""}
            aria-current={visao === "SOLUCOES" ? "page" : undefined}
          >
            Soluções
          </a>
        </nav>

        <form method="get" action="/aliados/cobertura" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {visao === "SOLUCOES" ? <input type="hidden" name="visao" value="solucoes" /> : null}
          <label className="sr-oculto" htmlFor="filtro-cultura">
            Filtrar por cultura
          </label>
          <select
            id="filtro-cultura"
            name="cultura"
            className="select"
            style={{ width: 190 }}
            defaultValue={culturaId}
          >
            <option value="">Todas as culturas</option>
            {culturas.map((cultura) => (
              <option key={cultura.id} value={cultura.id}>
                {cultura.nome}
              </option>
            ))}
          </select>

          <label className="sr-oculto" htmlFor="filtro-regiao">
            Filtrar por região
          </label>
          <select
            id="filtro-regiao"
            name="regiao"
            className="select"
            style={{ width: 180 }}
            defaultValue={regiao ?? ""}
          >
            <option value="">Todas as regiões</option>
            {REGIOES.map((opcao) => (
              <option key={opcao} value={opcao}>
                {ROTULOS_REGIAO[opcao]}
              </option>
            ))}
          </select>

          <button type="submit" className="btn btn-ghost btn-sm">
            Aplicar
          </button>
        </form>

        {temFiltro ? (
          <a
            href={comFiltro({ cultura: undefined, regiao: undefined })}
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: "none" }}
          >
            Limpar filtros
          </a>
        ) : null}

        <div style={{ flex: 1 }} />
        <span className="cap">{resumoDoRecorte}</span>
      </div>

      <PainelCobertura
        linhas={linhas}
        resumo={resumo}
        concentracao={concentracao}
        matriz={matriz}
        excluidos={excluidos}
        visao={visao}
        culturaId={culturaId}
        culturaNome={culturaNome}
        ressalvaDoFunil={culturaId ? FUNIL_IGNORA_CULTURA : null}
      />
    </div>
  );
}

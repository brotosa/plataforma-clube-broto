import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { MENSAGEM_RN25 } from "@/dominio/parametrizador/regras";
import { ROTULOS_PERIODO, rotuloDoIntervalo } from "@/dominio/parametrizador/metas";
import type { GrupoValorRegra } from "@/dominio/parametrizador/valores-regra";
import {
  metasExibidas,
  regraSensivelExigida,
  valoresDeRegraExibidos,
} from "@/infra/consultas/parametrizador";
import { AvisoDeLeitura, AvisoNeutro } from "../componentes";
import { FormularioNovaMeta, FormularioValor } from "../formularios";

export const metadata: Metadata = {
  title: "Valores de regra",
};

const CARTOES: ReadonlyArray<{
  grupo: GrupoValorRegra;
  titulo: string;
  descricao: string;
}> = [
  {
    grupo: "REGUAS",
    titulo: "Réguas de tempo",
    descricao:
      "Valores vigentes nas Ondas 1 e 2 — envelhecimento do funil, vitrine e reavaliação.",
  },
  {
    grupo: "COMISSAO",
    titulo: "Comissão-padrão do contrato-modelo",
    descricao: "Pré-preenche o cadastro comercial do aliado; cada contrato pode ter a sua.",
  },
  {
    grupo: "TETOS_DOSSIE",
    titulo: "Tetos do dossiê automático",
    descricao: "Limites de custo da geração assíncrona de dossiês (Onda 2).",
  },
];

/**
 * T17 — Editor de valores de regra (protótipo v6.1): réguas, comissão-padrão,
 * metas com a RN28 visível e tetos do dossiê, cada valor com o seu
 * histórico e a nota de efeito prospectivo (RN25).
 */
export default async function PaginaValoresDeRegra() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  if (!podeExecutar(papel, "VISUALIZAR_PARAMETROS")) {
    redirect("/");
  }
  const ehAdmin = podeExecutar(papel, "CONFIGURAR_PARAMETROS");

  const [valores, metas, categorias, sensivelLigada] = await Promise.all([
    valoresDeRegraExibidos(),
    metasExibidas(),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    regraSensivelExigida(),
  ]);

  const hojeIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1080 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/parametrizador">Parametrizador</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Valores de regra</b>
      </div>
      <div style={{ marginBottom: 18 }}>
        <h1 className="h-page">Valores de regra</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          Réguas, comissão-padrão, metas e tetos do dossiê
        </div>
      </div>

      <AvisoNeutro icone="relogio">{MENSAGEM_RN25}</AvisoNeutro>
      {ehAdmin ? null : <AvisoDeLeitura contexto="valores" />}
      {ehAdmin && sensivelLigada ? (
        <AvisoNeutro icone="escudo">
          A exigência de aprovação para parâmetros sensíveis está ligada (RN27): alterações em
          comissão-padrão, pesos, tetos e metas entram na fila em vez de valer na hora.
        </AvisoNeutro>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {CARTOES.map((cartao) => {
          const doGrupo = valores.filter((valor) => valor.grupo === cartao.grupo);
          if (doGrupo.length === 0) {
            return null;
          }
          return (
            <div key={cartao.grupo} className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el" style={{ marginBottom: 4 }}>
                {cartao.titulo}
              </h2>
              <p className="cap" style={{ margin: "0 0 14px" }}>
                {cartao.descricao}
              </p>
              {doGrupo.map((valor) => (
                <FormularioValor
                  key={valor.chave}
                  chave={valor.chave}
                  rotulo={valor.rotulo}
                  descricao={valor.descricao}
                  tipo={valor.tipo}
                  valor={valor.valor}
                  sensivel={valor.sensivel}
                  historico={valor.historico}
                  somenteLeitura={!ehAdmin}
                />
              ))}
              {cartao.grupo === "COMISSAO" ? (
                <p className="cap" style={{ margin: "12px 0 0" }}>
                  Família sensível: pode passar a exigir aprovação sem código (RN27).
                </p>
              ) : null}
              {cartao.grupo === "TETOS_DOSSIE" ? (
                <p className="cap" style={{ margin: "12px 0 0" }}>
                  Os valores definitivos seguem pendentes com a TI — enquanto não forem
                  definidos, o campo fica vazio em vez de exibir um número plausível.
                </p>
              ) : null}
            </div>
          );
        })}

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Metas de novos aliados
          </h2>
          <p className="cap" style={{ margin: "0 0 14px" }}>
            Uma meta geral vigente por período e, no máximo, uma por categoria por período
            (RN28). Definidas somente pelo Administrador da Plataforma.
          </p>

          {metas.length === 0 ? (
            <p className="cap" style={{ margin: 0 }}>
              Nenhuma meta definida ainda.
            </p>
          ) : (
            metas.map((meta) => (
              <div key={meta.id} className="pm-val">
                <div>
                  <div style={{ font: "var(--font-body-label-bold)" }}>
                    Meta — {ROTULOS_PERIODO[meta.periodo].toLowerCase()},{" "}
                    {meta.categoriaNome ?? "geral"}
                  </div>
                  <div className="cap" style={{ marginTop: 3 }}>
                    Novos aliados em {rotuloDoIntervalo(meta.periodo, meta.inicio)} · o funil
                    compara o realizado com este valor
                  </div>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}
                >
                  <span className="num" style={{ font: "var(--font-body-label-bold)" }}>
                    {meta.valor}
                  </span>
                  <span className="cap" style={{ width: 54 }}>
                    aliados
                  </span>
                </div>
                <div className="cap pm-hist">
                  {meta.origem} · {meta.ultimoAjuste}
                </div>
              </div>
            ))
          )}

          {ehAdmin ? (
            <FormularioNovaMeta
              categorias={categorias.map((categoria) => ({
                id: categoria.id,
                nome: categoria.nome,
              }))}
              existentes={metas.map((meta) => ({
                id: meta.id,
                periodo: meta.periodo,
                inicio: meta.inicio.toISOString(),
                fim: meta.fim.toISOString(),
                categoriaId: meta.categoriaId,
              }))}
              hojeIso={hojeIso}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

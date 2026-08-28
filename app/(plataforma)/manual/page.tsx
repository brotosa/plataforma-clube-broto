import type { Metadata } from "next";
import Link from "next/link";
import type { Papel } from "@prisma/client";
import { auth } from "@/infra/auth";
import { ACOES, podeExecutar } from "@/dominio/autorizacao/permissoes";
import { ROTULOS_PAPEL } from "@/dominio/autorizacao/papeis";
import {
  INTRODUCAO,
  MANUAL_ACOES,
  ORDEM_MODULOS,
  ORDEM_PAPEIS,
  RESUMO_PAPEL,
  ROTULO_MODULO,
  type ModuloManual,
} from "@/conteudo/manual-usuario/conteudo";

/**
 * Manual do usuário — referência por papel, aberta a todos (como o Guia da
 * Plataforma, RN58): pede sessão, mas não consulta papel para permitir o
 * acesso e não lê dado da operação.
 *
 * **O que cada papel pode fazer é DERIVADO da matriz de permissões**
 * (`podeExecutar`), não escrito à mão: a mesma fonte que a aplicação usa
 * para permitir ou recusar. Assim o manual nunca diverge do que o produto
 * realmente faz — muda a permissão, muda o manual.
 */

export const metadata: Metadata = {
  title: "Manual do usuário",
  description:
    "O que cada papel pode fazer na plataforma, com o passo a passo de cada ação.",
};

/** Âncora estável por papel, para o menu de saltos e o link direto. */
function ancoraDoPapel(papel: Papel): string {
  return `papel-${papel.toLowerCase()}`;
}

/** As ações de um papel, agrupadas por módulo na ordem de exibição. */
function acoesPorModulo(papel: Papel): Array<{ modulo: ModuloManual; acoes: typeof ACOES }> {
  const permitidas = ACOES.filter((acao) => podeExecutar(papel, acao));
  return ORDEM_MODULOS.map((modulo) => ({
    modulo,
    acoes: permitidas.filter((acao) => MANUAL_ACOES[acao].modulo === modulo),
  })).filter((grupo) => grupo.acoes.length > 0);
}

export default async function PaginaManual() {
  const sessao = await auth();
  const papelAtual = sessao?.user?.papel ?? null;

  return (
    <div className="tela" style={{ padding: "26px 32px 48px", maxWidth: 980 }}>
      <header id="topo" style={{ marginBottom: 22, scrollMarginTop: 16 }}>
        <h1 className="h-page">Manual do usuário</h1>
        <p className="cap" style={{ marginTop: 6, maxWidth: "70ch" }}>
          O que cada papel pode fazer na plataforma, com o passo a passo de cada ação. A lista
          de ações de cada papel é a mesma que o produto aplica para permitir ou recusar — este
          manual não inventa nada.
          {papelAtual ? (
            <>
              {" "}O seu papel é <b>{ROTULOS_PAPEL[papelAtual]}</b>{" "}
              (<a href={`#${ancoraDoPapel(papelAtual)}`}>ir para a sua seção</a>).
            </>
          ) : null}
        </p>
      </header>

      {/* Saltos por papel — fixo no topo ao rolar, para que qualquer papel
          (e o topo) fique alcançável de qualquer ponto do manual, sem ter de
          rolar de volta. `top: 0` fixa na borda do contêiner de rolagem (o
          <main>); o fundo do .card cobre o conteúdo que passa por baixo. */}
      <nav
        aria-label="Papéis"
        className="card"
        style={{
          padding: "14px 18px",
          marginBottom: 22,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          position: "sticky",
          top: 0,
          zIndex: 5,
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        {ORDEM_PAPEIS.map((papel) => (
          <a
            key={papel}
            href={`#${ancoraDoPapel(papel)}`}
            className={papel === papelAtual ? "chip on" : "chip"}
            style={{ textDecoration: "none" }}
          >
            {ROTULOS_PAPEL[papel]}
          </a>
        ))}
      </nav>

      {/* Introdução comum */}
      <section className="card" style={{ padding: "20px 22px", marginBottom: 22 }}>
        <h2 className="h-el" style={{ marginBottom: 12 }}>
          {INTRODUCAO.titulo}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {INTRODUCAO.itens.map((item) => (
            <div key={item.titulo}>
              <div style={{ fontWeight: 600 }}>{item.titulo}</div>
              <p className="cap" style={{ margin: "2px 0 0", maxWidth: "72ch" }}>
                {item.texto}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Uma seção por papel — a lista de ações vem da matriz de permissões. */}
      {ORDEM_PAPEIS.map((papel) => {
        const grupos = acoesPorModulo(papel);
        return (
          <section
            key={papel}
            id={ancoraDoPapel(papel)}
            // Folga maior que o menu fixo (~56px), para o título da seção
            // parar abaixo dele ao saltar, e não escondido por trás.
            style={{ marginBottom: 28, scrollMarginTop: 76 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <h2 className="h-page" style={{ fontSize: 22 }}>
                {ROTULOS_PAPEL[papel]}
              </h2>
              {papel === papelAtual ? <span className="pill pill-info">o seu papel</span> : null}
            </div>
            <p style={{ margin: "0 0 4px", maxWidth: "74ch" }}>{RESUMO_PAPEL[papel].quemE}</p>
            <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
              <b>No dia a dia:</b> {RESUMO_PAPEL[papel].noDiaADia}
            </p>

            {grupos.length === 0 ? (
              <div className="card" style={{ padding: "16px 20px" }}>
                <p className="cap" style={{ margin: 0 }}>
                  Este papel é de consulta: acompanha as telas do produto sem alterar dados.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {grupos.map(({ modulo, acoes }) => (
                  <div key={modulo} className="card" style={{ padding: "18px 20px" }}>
                    <div
                      className="cap"
                      style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, marginBottom: 10 }}
                    >
                      {ROTULO_MODULO[modulo]}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {acoes.map((acao) => {
                        const item = MANUAL_ACOES[acao];
                        return (
                          <div key={acao}>
                            <div style={{ fontWeight: 600 }}>{item.titulo}</div>
                            <p style={{ margin: "2px 0 4px", maxWidth: "74ch" }}>{item.oQueE}</p>
                            <p className="cap" style={{ margin: "0 0 6px" }}>
                              <b>Onde:</b> {item.onde}
                            </p>
                            <ol className="cap" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                              {item.passos.map((passo, indice) => (
                                <li key={indice}>{passo}</li>
                              ))}
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Volta explícita ao topo — para não precisar rolar de volta
                até o menu de papéis no fim de uma seção longa. */}
            <div style={{ marginTop: 12 }}>
              <a href="#topo" className="cap" style={{ textDecoration: "none" }}>
                ↑ Voltar ao topo
              </a>
            </div>
          </section>
        );
      })}

      <p className="cap" style={{ marginTop: 8, maxWidth: "74ch" }}>
        Para os conceitos, o vocabulário e as jornadas de uso da plataforma, veja o{" "}
        <Link href="/ajuda">Guia da Plataforma</Link> (o “?” no topo).
      </p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LinhaDeAliado } from "@/infra/consultas/aliados";
import { acaoCarregarMaisAliados, type FiltrosDaRolagem } from "./acoes";
import { BarraCompletude, MarcaDoAliado, PillEstagio } from "./componentes";

/**
 * RN56 — leitura da rede de aliados por rolagem contínua.
 *
 * "A escolha é do tamanho esperado do conjunto, não de preferência de
 * tela": a rede é conjunto contido (46 hoje, algumas centenas no
 * horizonte) e lê-la inteira é gesto frequente, então os controles de
 * página saíram. Assinantes, de base ilimitada, mantêm a paginação — e
 * não são tocados aqui.
 *
 * **A consulta continua paginada no servidor.** O primeiro bloco vem
 * renderizado pelo servidor (a tela pinta com conteúdo, sem esperar
 * JavaScript); os seguintes chegam por server action, em blocos, à medida
 * que a rolagem se aproxima do fim. Nunca há um SELECT sem limite.
 *
 * **Teclado.** O botão "Carregar mais" é o caminho explícito e continua no
 * fluxo natural do Tab, depois da última linha — quem navega por teclado
 * nunca depende do gesto de rolar. A carga automática por proximidade
 * jamais move o foco; só a carga pedida pelo botão o faz, e apenas quando
 * o próprio botão desaparece por não haver mais o que carregar (aí o foco
 * vai para o texto de situação, em vez de cair no corpo do documento).
 */

/** Quantos pixels antes do fim a próxima carga começa. */
const MARGEM_DE_ANTECIPACAO = "600px";

export function ListaDeAliadosComRolagem({
  blocoInicial,
  total,
  filtros,
  tamanhoDoBloco,
}: {
  blocoInicial: LinhaDeAliado[];
  total: number;
  filtros: FiltrosDaRolagem;
  tamanhoDoBloco: number;
}) {
  const [linhas, definirLinhas] = useState<LinhaDeAliado[]>(blocoInicial);
  const [proximaPagina, definirProximaPagina] = useState(2);
  const [carregando, definirCarregando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const sentinela = useRef<HTMLDivElement | null>(null);
  const situacao = useRef<HTMLParagraphElement | null>(null);
  const focarSituacao = useRef(false);

  // O servidor pode ter devolvido um bloco novo (filtro trocado, marca
  // enviada): a lista volta ao que ele mandou, sem resíduo do anterior.
  useEffect(() => {
    definirLinhas(blocoInicial);
    definirProximaPagina(2);
    definirFalha(null);
  }, [blocoInicial]);

  const restam = total - linhas.length;
  const temMais = restam > 0;

  const carregarMais = useCallback(
    async (porBotao: boolean) => {
      if (carregando) return;
      definirCarregando(true);
      definirFalha(null);
      try {
        const bloco = await acaoCarregarMaisAliados(filtros, proximaPagina);
        definirLinhas((atuais) => {
          // Dedupe por id: se um aliado mudar de posição entre dois blocos
          // (edição concorrente reordenando por nome), a lista não duplica.
          const vistos = new Set(atuais.map((linha) => linha.id));
          return [...atuais, ...bloco.linhas.filter((linha) => !vistos.has(linha.id))];
        });
        definirProximaPagina((pagina) => pagina + 1);
        focarSituacao.current = porBotao;
      } catch {
        // RN55 vale aqui também: nomear o que houve, sem sugerir repetir
        // no vazio — o botão continua ali para quem quiser tentar.
        definirFalha(
          "Não foi possível carregar mais aliados agora. Os já exibidos continuam válidos.",
        );
      } finally {
        definirCarregando(false);
      }
    },
    [carregando, filtros, proximaPagina],
  );

  // Carga por proximidade: é o que faz a leitura ser contínua.
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo || !temMais) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          void carregarMais(false);
        }
      },
      { rootMargin: MARGEM_DE_ANTECIPACAO },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [carregarMais, temMais]);

  // Quando o botão some por esgotamento, o foco iria para o corpo do
  // documento. Levá-lo ao texto de situação mantém o lugar da leitura.
  useEffect(() => {
    if (!temMais && focarSituacao.current) {
      focarSituacao.current = false;
      situacao.current?.focus();
    }
  }, [temMais]);

  return (
    <>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl tbl-resp">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Aliado</th>
              <th>Categorias</th>
              <th>Estágio</th>
              <th style={{ textAlign: "right" }}>Soluções</th>
              <th style={{ textAlign: "right" }}>Ofertas ativas</th>
              <th style={{ textAlign: "right" }}>Vouchers 90d</th>
              <th>Completude</th>
              <th style={{ width: 36 }}>
                <span className="sr-oculto">Abrir ficha</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.id} className="click">
                {/* data-label também na primeira célula (F5): no colapso
                    mobile toda célula vira linha rotulada do card — a T4 já
                    fazia, a T1 tinha ficado sem. */}
                <td data-label="Aliado">
                  <Link
                    href={`/aliados/${linha.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <MarcaDoAliado
                      empresaId={linha.id}
                      nomeFantasia={linha.nomeFantasia}
                      hash={linha.marcaHash}
                    />
                    <span style={{ fontWeight: 600 }}>{linha.nomeFantasia}</span>
                    {linha.emJanelaNaoRenovacao ? (
                      <span className="pill pill-warn">
                        <i aria-hidden="true" />
                        janela contratual
                      </span>
                    ) : null}
                  </Link>
                </td>
                <td data-label="Categorias">
                  {linha.categorias.length === 0 ? (
                    <span className="pill pill-warn">
                      <i aria-hidden="true" />
                      obrigatório · não preenchido
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                      {linha.categorias.map((nome) => (
                        <span key={nome} className="tag-cat">
                          {nome}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td data-label="Estágio">
                  <PillEstagio estagio={linha.estagio} />
                </td>
                <td data-label="Soluções" className="num" style={{ textAlign: "right" }}>
                  {linha.quantidadeSolucoes}
                </td>
                <td data-label="Ofertas ativas" className="num" style={{ textAlign: "right" }}>
                  {linha.quantidadeOfertasAtivas}
                </td>
                <td
                  data-label="Vouchers 90d"
                  className="num"
                  style={{ textAlign: "right", color: "var(--paragrafo-aaa)" }}
                >
                  —
                </td>
                <td data-label="Completude">
                  <BarraCompletude percentual={linha.completude} />
                </td>
                <td className="chev" style={{ color: "var(--paragrafo-aaa)" }}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A sentinela fica FORA da tabela: dentro dela, um <div> entre
          linhas seria marcação inválida e o leitor de tela tropeçaria. */}
      <div ref={sentinela} aria-hidden="true" style={{ height: 1 }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <p
          ref={situacao}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="cap"
          style={{ margin: 0 }}
        >
          {total === 0
            ? "Nenhum aliado nesta seleção."
            : temMais
              ? `Mostrando ${linhas.length} de ${total} aliados.`
              : `${total} aliado(s) — lista completa.`}
        </p>
        {temMais ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void carregarMais(true)}
            disabled={carregando}
          >
            {carregando
              ? "Carregando…"
              : `Carregar mais ${Math.min(tamanhoDoBloco, restam)} aliados`}
          </button>
        ) : null}
      </div>

      {falha ? (
        <p role="alert" className="cap" style={{ color: "var(--erro-texto-aaa)", marginTop: 8 }}>
          {falha}
        </p>
      ) : null}
    </>
  );
}

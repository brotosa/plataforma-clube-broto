"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type PendenciaApurada,
  TEXTOS_INDISPONIBILIDADE,
  pendenciasAcionaveis,
  textoDoMarcador,
  totalDePendencias,
} from "@/dominio/dashboard/indicadores";

/**
 * Sino de pendências do cabeçalho (ficha Onda 7 §7).
 *
 * O botão de notificações era decorativo — tinha até um `title` prometendo
 * "alertas de vigência e janela contratual" que nunca chegariam. Agora é
 * **atalho para o que a plataforma já calcula**.
 *
 * O que ele deliberadamente NÃO é: sistema de notificação. Sem fila
 * persistente, sem lido/não-lido, sem preferências — nada disso está em
 * ficha, e inventar essa infraestrutura aqui criaria um segundo lugar onde
 * pendência mora, com estado próprio para divergir do primeiro.
 *
 * O número é a soma exata das contagens da camada 2 da HOME, pela MESMA
 * função (`totalDePendencias`). Sino e cartões discordando é o tipo de
 * defeito que faz o usuário parar de confiar nos dois.
 */

const FORMATO = new Intl.NumberFormat("pt-BR");

/** Elementos focáveis dentro do painel, na ordem do documento. */
function focaveis(painel: HTMLElement): HTMLElement[] {
  return [...painel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
}

export function SinoPendencias({
  pendencias,
  mencoesAbertas = 0,
}: {
  pendencias: ReadonlyArray<PendenciaApurada>;
  /**
   * Pendências que mencionam o usuário (painel de atividades). É uma linha
   * **pessoal**, à parte das operacionais: as da HOME continuam sendo a
   * soma exata dos cartões (o invariante do sino), e a menção entra por
   * cima como derivação própria — some sozinha quando a pendência é
   * resolvida, sem fila nem estado de lido/não-lido.
   */
  mencoesAbertas?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const painelRef = useRef<HTMLDivElement | null>(null);
  const idPainel = useId();
  const rota = usePathname();

  const totalOperacional = totalDePendencias(pendencias);
  const total = totalOperacional + mencoesAbertas;
  const linhas = pendenciasAcionaveis(pendencias);

  /** Fecha devolvendo o foco ao botão — sem isso o teclado fica órfão. */
  const fechar = (devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) {
      // No mesmo tick o painel ainda está montado; o foco só assenta depois.
      queueMicrotask(() => botaoRef.current?.focus());
    }
  };

  // Ao abrir, o foco entra no painel: painel que abre sem receber foco é
  // painel que o teclado não alcança.
  useEffect(() => {
    if (!aberto) {
      return;
    }
    const painel = painelRef.current;
    focaveis(painel!)[0]?.focus();
  }, [aberto]);

  // Navegar fecha o painel. Sem isso ele sobrevive à troca de rota e fica
  // pairando sobre a tela nova.
  useEffect(() => {
    setAberto(false);
  }, [rota]);

  const aoTeclar = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    const painel = painelRef.current;
    if (evento.key === "Escape") {
      evento.stopPropagation();
      fechar();
      return;
    }
    if (!painel) {
      return;
    }
    const itens = focaveis(painel);
    if (itens.length === 0) {
      return;
    }
    const atual = itens.indexOf(document.activeElement as HTMLElement);

    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      itens[Math.min(atual + 1, itens.length - 1)]?.focus();
      return;
    }
    if (evento.key === "ArrowUp") {
      evento.preventDefault();
      itens[Math.max(atual - 1, 0)]?.focus();
      return;
    }
    if (evento.key === "Tab") {
      // Foco contido enquanto aberto: Tab circula dentro do painel em vez de
      // escapar para trás do overlay, onde o clique não chega.
      evento.preventDefault();
      const proximo = evento.shiftKey
        ? atual <= 0
          ? itens.length - 1
          : atual - 1
        : atual === itens.length - 1
          ? 0
          : atual + 1;
      itens[proximo]?.focus();
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={botaoRef}
        type="button"
        className="btn btn-ghost"
        style={{ width: 38, height: 38, padding: 0, borderRadius: "50%" }}
        aria-label={textoDoMarcador(total)}
        aria-expanded={aberto}
        aria-controls={idPainel}
        aria-haspopup="dialog"
        onClick={() => (aberto ? fechar() : setAberto(true))}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </button>

      {/* Marcador só quando há pendência. `aria-hidden` porque o número já
          está no nome acessível do botão — anunciá-lo duas vezes é ruído. */}
      {total > 0 ? (
        <span className="badge-not" aria-hidden="true">
          {FORMATO.format(total)}
        </span>
      ) : null}

      {aberto ? (
        <>
          {/* Clique fora fecha. É um <button> de largura total sem rótulo
              visível: o leitor de tela o anuncia, e o ponteiro tem alvo. */}
          <button
            type="button"
            aria-label="Fechar o painel de pendências"
            onClick={() => fechar()}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
              border: 0,
              background: "transparent",
              cursor: "default",
            }}
          />
          <div
            ref={painelRef}
            id={idPainel}
            className="not-pop"
            role="dialog"
            aria-label="Ações pendentes"
            onKeyDown={aoTeclar}
          >
            <div className="not-h">
              Exige ação hoje
              <span className="cap" style={{ fontWeight: 400 }}>
                {total > 0 ? "· mesma fonte da faixa do Dashboard" : "· nada aguardando"}
              </span>
            </div>

            {/* Linha pessoal: pendências que mencionam você (painel de
                atividades). Fica acima das operacionais, com o mesmo desenho
                de linha, e leva à lista de aliados filtrada. */}
            {mencoesAbertas > 0 ? (
              <Link
                className="not-lin"
                href="/aliados?mencao=minhas"
                onClick={() => fechar(false)}
              >
                <span className="not-n" aria-hidden="true">
                  {FORMATO.format(mencoesAbertas)}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", font: "var(--font-body-label-bold)" }}>
                    {FORMATO.format(mencoesAbertas)} ·{" "}
                    {mencoesAbertas === 1
                      ? "pendência menciona você"
                      : "pendências mencionam você"}
                  </span>
                  <span className="cap" style={{ display: "block" }}>
                    painel de atividades do aliado
                  </span>
                </span>
              </Link>
            ) : null}

            {linhas.length === 0 ? (
              mencoesAbertas === 0 ? (
                <div className="vazio" style={{ padding: "22px 14px", borderTop: 0 }}>
                  <h3 className="h-el" style={{ margin: 0 }}>
                    Nenhuma ação pendente
                  </h3>
                  <p className="cap" style={{ maxWidth: "34ch", margin: "6px 0 0" }}>
                    Aprovações em dia, vigências saudáveis, sem quarentenas. As réguas do
                    Parametrizador seguem vigiando.
                  </p>
                </div>
              ) : null
            ) : (
              <div>
                {linhas.map((pendencia) => (
                  <Link
                    key={pendencia.chave}
                    className="not-lin"
                    href={pendencia.destino}
                    onClick={() => fechar(false)}
                  >
                    <span
                      className={pendencia.indisponivel ? "not-n ind" : "not-n"}
                      aria-hidden="true"
                    >
                      {pendencia.indisponivel ? "—" : FORMATO.format(pendencia.contagem)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", font: "var(--font-body-label-bold)" }}>
                        {pendencia.indisponivel
                          ? `${pendencia.rotulo}: contagem indisponível`
                          : `${FORMATO.format(pendencia.contagem)} · ${pendencia.rotulo}`}
                      </span>
                      <span className="cap" style={{ display: "block" }}>
                        {pendencia.indisponivel
                          ? TEXTOS_INDISPONIBILIDADE[pendencia.indisponivel]
                          : pendencia.fonte}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <div className="not-f">
              <Link href="/" onClick={() => fechar(false)}>
                Ver o Dashboard completo
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

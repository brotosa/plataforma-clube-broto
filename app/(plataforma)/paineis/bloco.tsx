"use client";

import { useEffect, useState } from "react";

import type { TabelaPivotada } from "@/dominio/relatorios/pivo";
import { rotularDimensao } from "@/dominio/relatorios/pivo";
import type { Visualizacao } from "@/dominio/relatorios/visualizacao";
import { GraficoDoRelatorio } from "../relatorios/grafico";
import { carregarBlocoAction } from "./acoes";

/**
 * Um bloco do painel (RN86–RN88).
 *
 * ## Cada bloco carrega por conta própria
 *
 * Oito blocos não podem fazer a página esperar pelo mais lento. Cada um
 * dispara a própria execução ao montar, tem o próprio estado de carregamento
 * e o próprio erro — e um que demore não segura os outros.
 *
 * ## O título do bloco é `<h2>`, e não `<h3>`
 *
 * A página tem um `<h1>` só — o nome do painel —, e um `<h3>` abaixo dele
 * pularia o nível 2. O axe pegou (`heading-order`), e a queixa é real: quem
 * navega por cabeçalhos ouviria um nível que não existe e concluiria que
 * perdeu uma seção.
 *
 * ## Os quatro estados não são um "indisponível" genérico
 *
 * `SEM_ALCANCE`, `AGUARDA_FINALIDADE` e `FALHOU` respondem perguntas
 * diferentes e pedem ações diferentes: um não tem conserto pela pessoa que
 * abriu, outro é um campo a preencher, o terceiro é um bloco a refazer.
 * Juntá-los num só esconderia justamente o que ela precisa saber para agir.
 */

export interface BlocoSerializado {
  estado: "PRONTO" | "SEM_ALCANCE" | "AGUARDA_FINALIDADE" | "FALHOU";
  titulo: string;
  largura: string;
  motivo?: string;
  assunto?: string;
  visualizacao?: Visualizacao;
  resumo?: string;
}

export function BlocoDoPainel({
  painelId,
  indice,
  bloco,
}: {
  painelId: string;
  indice: number;
  bloco: BlocoSerializado;
}) {
  const classe = `pn-bloco${bloco.largura === "INTEIRA" ? " pn-bloco-inteira" : ""}`;

  if (bloco.estado === "SEM_ALCANCE") {
    return (
      <section className={classe} aria-label={bloco.titulo}>
        <h2 className="pn-bloco-t">{bloco.titulo}</h2>
        {/*
         * RN87 — o bloco recusa sozinho, e os demais do painel carregam.
         * Não é erro: é um limite de papel, e dizer "tente novamente" seria
         * o conselho errado (RN55).
         */}
        <p className="pn-bloco-recusa">{bloco.motivo}</p>
      </section>
    );
  }

  if (bloco.estado === "FALHOU") {
    return (
      <section className={classe} aria-label={bloco.titulo}>
        <h2 className="pn-bloco-t">{bloco.titulo}</h2>
        <p className="pn-bloco-recusa">{bloco.motivo}</p>
      </section>
    );
  }

  return (
    <BlocoQueCarrega
      painelId={painelId}
      indice={indice}
      bloco={bloco}
      classe={classe}
      exigeFinalidade={bloco.estado === "AGUARDA_FINALIDADE"}
    />
  );
}

function BlocoQueCarrega({
  painelId,
  indice,
  bloco,
  classe,
  exigeFinalidade,
}: {
  painelId: string;
  indice: number;
  bloco: BlocoSerializado;
  classe: string;
  exigeFinalidade: boolean;
}) {
  const [tabela, setTabela] = useState<TabelaPivotada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [truncado, setTruncado] = useState(false);
  const [finalidade, setFinalidade] = useState("");

  async function carregar(comFinalidade?: string) {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await carregarBlocoAction(painelId, indice, comFinalidade);
      if (!resposta.ok) {
        setErro(resposta.erro ?? "Não foi possível carregar este bloco.");
        return;
      }
      setTabela(resposta.tabela ?? null);
      setTruncado(resposta.truncado ?? false);
    } finally {
      setCarregando(false);
    }
  }

  /*
   * RN88 — bloco de dado pessoal NÃO carrega sozinho.
   *
   * A condição do efeito é o ponto inteiro da regra: com `exigeFinalidade`,
   * nada dispara na montagem. A finalidade existe para atar o acesso a dado
   * pessoal a um ato deliberado, e carregar ao abrir a transformaria em
   * consequência de ter aberto uma página.
   */
  useEffect(() => {
    if (exigeFinalidade) return;
    void carregar();
    // Só na montagem: o bloco não recarrega sozinho, e recarregar a cada
    // render dispararia a consulta em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className={classe} aria-label={bloco.titulo} aria-busy={carregando}>
      <h2 className="pn-bloco-t">{bloco.titulo}</h2>

      {exigeFinalidade && tabela === null ? (
        <form
          className="pn-bloco-finalidade"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (finalidade.trim()) void carregar(finalidade.trim());
          }}
        >
          <p>
            <strong>{bloco.assunto}</strong> alcança dado pessoal. Declare a finalidade para
            carregar este bloco.
          </p>
          <label>
            <span className="sr-oculto">Finalidade do acesso</span>
            <input
              type="text"
              value={finalidade}
              onChange={(evento) => setFinalidade(evento.target.value)}
              placeholder="Ex.: conferência da carteira patrocinada"
            />
          </label>
          <button type="submit" className="btn btn-sm btn-xs" disabled={!finalidade.trim()}>
            Carregar
          </button>
        </form>
      ) : null}

      {erro ? <p className="pn-bloco-recusa">{erro}</p> : null}

      {carregando ? <p className="pn-bloco-espera">Carregando…</p> : null}

      {tabela ? (
        <>
          {bloco.visualizacao && bloco.visualizacao.tipo !== "TABELA" ? (
            <GraficoDoRelatorio
              tabela={tabela}
              visual={bloco.visualizacao}
              rotularCategoria={(linha) =>
                linha.chaves
                  .map((chave, posicao) =>
                    rotularDimensao(chave, tabela.dimensoes[posicao]?.rotulosDeValor),
                  )
                  .join(" · ")
              }
            />
          ) : (
            <TabelinhaDoBloco tabela={tabela} />
          )}
          <p className="pn-bloco-rodape">
            {bloco.resumo}
            {truncado ? " · resultado cortado no teto" : null}
          </p>
        </>
      ) : null}
    </section>
  );
}

/**
 * A tabela do bloco.
 *
 * Curta de propósito: um bloco de painel existe para ser olhado de relance,
 * ao lado de outros. Quem quiser o conjunto inteiro abre o relatório — e a
 * tabela avisa quantas linhas ficaram de fora, em vez de deixar entender que
 * são todas.
 */
const LINHAS_NO_BLOCO = 8;

function TabelinhaDoBloco({ tabela }: { tabela: TabelaPivotada }) {
  const mostradas = tabela.linhas.slice(0, LINHAS_NO_BLOCO);
  const restantes = tabela.linhas.length - mostradas.length;

  return (
    <div className="pn-bloco-tab">
      <table>
        <thead>
          <tr>
            {tabela.dimensoes.map((dimensao) => (
              <th key={dimensao.chave} scope="col">
                {dimensao.rotulo}
              </th>
            ))}
            {tabela.medidas.map((medida) => (
              <th key={medida.chave} scope="col" className="num">
                {medida.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mostradas.map((linha, indice) => (
            <tr key={indice}>
              {linha.chaves.map((chave, posicao) => (
                <td key={posicao}>
                  {rotularDimensao(chave, tabela.dimensoes[posicao]?.rotulosDeValor)}
                </td>
              ))}
              {tabela.medidas.map((medida) => {
                const valor = linha.celulas[medida.chave] ?? null;
                return (
                  <td key={medida.chave} className="num">
                    {/* Lacuna sai como traço, nunca como zero (RN53). */}
                    {valor === null ? "—" : String(valor)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {restantes > 0 ? (
        <p className="pn-bloco-mais">
          e mais {restantes} linha{restantes > 1 ? "s" : ""}
        </p>
      ) : null}
    </div>
  );
}

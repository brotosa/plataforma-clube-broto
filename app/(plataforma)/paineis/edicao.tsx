"use client";

import { useId, useState, useTransition } from "react";
import type { VisibilidadeRelatorio } from "@prisma/client";

import {
  type Movimento,
  rotuloDoMovimento,
} from "@/dominio/relatorios/edicao-painel";
import type { FiltroDoPainel } from "@/dominio/relatorios/eixos";
import { atualizarPainelAction, editarBlocoAction } from "./acoes";

/**
 * T37 — o modo de edição (RN94, ficha da Onda 18 §8.6).
 *
 * ## Os blocos NÃO executam aqui
 *
 * Quem está reordenando não precisa do dado, e disparar doze consultas a cada
 * movimento é gasto sem uso. O modo de edição mostra a **forma** do painel:
 * ordem, largura, título — e os blocos que não abrem mais, nomeados, que é
 * onde a pessoa decide removê-los.
 *
 * ## Uma gravação por ato, e não um "salvar" no fim
 *
 * Um formulário grande com botão de salvar perderia o trabalho de quem
 * fechasse a aba, e obrigaria a decidir o que fazer com uma edição
 * concorrente. Cada ato é pequeno, gravado e auditado — e o desfazer é o ato
 * inverso, que está na tela ao lado.
 *
 * Nome, visibilidade e filtro são a exceção, e por um motivo: são campos de
 * texto. Gravar a cada tecla seria uma gravação por caractere na trilha.
 *
 * ## A versão viaja em cada ato
 *
 * Os atos são por **índice**, e o índice foi escolhido contra o que a pessoa
 * viu. Com o painel aberto em duas abas, "descer o bloco 2" da aba velha
 * moveria outro bloco — com sucesso, e sem nada denunciando. A `versao` é o
 * que transforma isso em "recarregue a tela".
 */

export interface BlocoParaEditar {
  titulo: string;
  largura: string;
  /** Blocos que não abrem mais aparecem nomeados, para poderem ser removidos. */
  quebrado: boolean;
  motivo?: string;
}

export function EdicaoDoPainel({
  painelId,
  versao,
  nome,
  visibilidade,
  filtro,
  blocos,
}: {
  painelId: string;
  versao: string;
  nome: string;
  visibilidade: VisibilidadeRelatorio;
  filtro: FiltroDoPainel | null;
  blocos: ReadonlyArray<BlocoParaEditar>;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [emCurso, iniciar] = useTransition();

  function despachar(executar: () => Promise<{ ok: boolean; erro?: string }>) {
    setAviso(null);
    iniciar(async () => {
      const resposta = await executar();
      if (!resposta.ok) setAviso(resposta.erro ?? "Não foi possível concluir.");
    });
  }

  return (
    <div className="pn-ed">
      {aviso ? (
        <p className="pn-ed-erro" role="alert">
          {aviso}
        </p>
      ) : null}

      <AtributosDoPainel
        painelId={painelId}
        nome={nome}
        visibilidade={visibilidade}
        filtro={filtro}
        ocupado={emCurso}
        aoResponder={setAviso}
      />

      <h2 className="pn-ed-t">Blocos</h2>
      {blocos.length === 0 ? (
        <p className="rel-gaveta-vazia">
          Este painel está sem blocos. No Gerador de relatórios, monte um relatório e use{" "}
          <strong>Pôr no painel</strong> escolhendo este painel como destino.
        </p>
      ) : (
        <ol className="pn-ed-lista">
          {blocos.map((bloco, indice) => (
            <li key={indice} className="pn-ed-item">
              <span className="pn-ed-pos" aria-hidden="true">
                {indice + 1}
              </span>
              <span className="pn-ed-nome">
                {bloco.titulo}
                {bloco.quebrado ? (
                  <em className="pn-ed-quebrado"> — {bloco.motivo ?? "este bloco não abre mais."}</em>
                ) : null}
              </span>
              <span className="pn-ed-botoes">
                {(["SUBIR", "DESCER"] as ReadonlyArray<Movimento>).map((movimento) => {
                  const rotulo = rotuloDoMovimento(blocos, indice, movimento);
                  // Sem destino, o botão NÃO é montado: oferecer e recusar é
                  // pior que não oferecer, porque quem navega por teclado
                  // percorre um controle que nunca faz nada.
                  if (!rotulo) return null;
                  return (
                    <button
                      key={movimento}
                      type="button"
                      className="btn btn-ghost btn-sm btn-xs"
                      aria-label={rotulo}
                      disabled={emCurso}
                      onClick={() =>
                        despachar(() =>
                          editarBlocoAction(painelId, { tipo: "MOVER", indice, movimento }, versao),
                        )
                      }
                    >
                      {movimento === "SUBIR" ? "↑" : "↓"}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-xs"
                  aria-label={`Trocar a largura de ${bloco.titulo} para ${
                    bloco.largura === "METADE" ? "inteira" : "metade"
                  }`}
                  disabled={emCurso}
                  onClick={() =>
                    despachar(() => editarBlocoAction(painelId, { tipo: "LARGURA", indice }, versao))
                  }
                >
                  {bloco.largura === "METADE" ? "Metade" : "Inteira"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-xs"
                  aria-label={`Remover ${bloco.titulo} do painel`}
                  disabled={emCurso}
                  onClick={() => {
                    const confirmado = window.confirm(
                      `Remover "${bloco.titulo}" do painel? O relatório não é apagado — sai só deste painel.`,
                    );
                    if (!confirmado) return;
                    despachar(() =>
                      editarBlocoAction(painelId, { tipo: "REMOVER", indice }, versao),
                    );
                  }}
                >
                  Remover
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Nome, visibilidade e filtro — os campos de texto, gravados por botão.
 *
 * O filtro é editável a partir daqui, e **a mudança vale para todos que
 * abrem**, porque é gravada (ficha §8.5). É a resposta à pergunta que a F31
 * deixou declarada em código. Um filtro *de sessão*, que quem abre ajusta sem
 * gravar, é outra coisa — exploração temporária, outro desenho — e continua
 * fora de escopo.
 */
function AtributosDoPainel({
  painelId,
  nome,
  visibilidade,
  filtro,
  ocupado,
  aoResponder,
}: {
  painelId: string;
  nome: string;
  visibilidade: VisibilidadeRelatorio;
  filtro: FiltroDoPainel | null;
  ocupado: boolean;
  aoResponder: (mensagem: string | null) => void;
}) {
  const idNome = useId();
  const idDe = useId();
  const idAte = useId();
  const idUf = useId();

  const [rascunho, setRascunho] = useState({
    nome,
    visibilidade,
    de: filtro?.periodo?.de ?? "",
    ate: filtro?.periodo?.ate ?? "",
    uf: (filtro?.uf ?? []).join(", "),
  });
  const [gravando, setGravando] = useState(false);

  async function gravar() {
    aoResponder(null);
    setGravando(true);
    try {
      const periodo = {
        ...(rascunho.de ? { de: rascunho.de } : {}),
        ...(rascunho.ate ? { ate: rascunho.ate } : {}),
      };
      const uf = rascunho.uf
        .split(",")
        .map((parte) => parte.trim().toUpperCase())
        .filter((parte) => parte.length > 0);

      const resposta = await atualizarPainelAction(painelId, {
        nome: rascunho.nome,
        visibilidade: rascunho.visibilidade,
        // O validador do domínio devolve `null` quando nada sobra, e `null`
        // aqui é "limpar o filtro" — não "manter o que estava".
        filtro: {
          ...(Object.keys(periodo).length > 0 ? { periodo } : {}),
          ...(uf.length > 0 ? { uf } : {}),
        },
      });
      aoResponder(resposta.ok ? "Painel atualizado." : (resposta.erro ?? "Não foi possível gravar."));
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="pn-ed-atributos">
      <div className="form-grid">
        <label className="cap" htmlFor={idNome}>
          Nome do painel
        </label>
        <input
          id={idNome}
          className="rel-filtro-valor"
          value={rascunho.nome}
          onChange={(evento) => setRascunho((atual) => ({ ...atual, nome: evento.target.value }))}
        />

        <label className="cap" htmlFor={`${idNome}-vis`}>
          Quem vê
        </label>
        <select
          id={`${idNome}-vis`}
          value={rascunho.visibilidade}
          onChange={(evento) =>
            setRascunho((atual) => ({
              ...atual,
              visibilidade: evento.target.value as VisibilidadeRelatorio,
            }))
          }
        >
          <option value="PRIVADO">Só eu</option>
          <option value="TIME">Do time</option>
        </select>

        <label className="cap" htmlFor={idDe}>
          Filtro · Período de
        </label>
        <input
          id={idDe}
          type="date"
          className="rel-filtro-valor"
          value={rascunho.de}
          onChange={(evento) => setRascunho((atual) => ({ ...atual, de: evento.target.value }))}
        />

        <label className="cap" htmlFor={idAte}>
          Filtro · Período até
        </label>
        <input
          id={idAte}
          type="date"
          className="rel-filtro-valor"
          value={rascunho.ate}
          onChange={(evento) => setRascunho((atual) => ({ ...atual, ate: evento.target.value }))}
        />

        <label className="cap" htmlFor={idUf}>
          Filtro · UF
        </label>
        <input
          id={idUf}
          className="rel-filtro-valor"
          placeholder="Ex.: SP, MG"
          aria-describedby={`${idUf}-dica`}
          value={rascunho.uf}
          onChange={(evento) => setRascunho((atual) => ({ ...atual, uf: evento.target.value }))}
        />
      </div>

      <p id={`${idUf}-dica`} className="cap pn-ed-dica">
        Siglas de duas letras, separadas por vírgula. O filtro do painel age
        sobre eixos declarados — o bloco que não comporta um eixo diz que não o
        aplicou (RN89).
      </p>

      <button type="button" className="btn btn-sm" disabled={ocupado || gravando} onClick={gravar}>
        {gravando ? "Gravando…" : "Gravar nome, visibilidade e filtro"}
      </button>
    </div>
  );
}

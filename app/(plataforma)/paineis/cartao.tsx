"use client";

import { useState, useTransition } from "react";

import { apagarPainelAction } from "./acoes";

/**
 * Apagar o painel, na galeria da T37.
 *
 * ## Por que isto é um componente, e não um `<form>` dentro do cartão
 *
 * O cartão é uma âncora (`.pn-cartao`), e **botão dentro de link é HTML
 * inválido** — o clique de um seria o clique do outro. Por isso o botão fica
 * ao lado, no mesmo item da lista, e não sobreposto ao canto do cartão: nome
 * de painel é texto livre, e um nome longo colidiria com o botão sem que
 * ninguém visse, porque a colisão aconteceria no painel de outra pessoa.
 *
 * ## A confirmação diz o que some e o que fica
 *
 * Mesmo padrão do comentário das Atividades. Apagar um painel **não apaga os
 * relatórios**: o bloco carrega uma CÓPIA da definição, então o que se perde
 * é a montagem, não a pergunta. Dizer isso na confirmação é o que separa
 * "apaguei a tela que montei" de "apaguei meu trabalho".
 *
 * ## O botão só aparece para o autor, e a recusa continua sendo do servidor
 *
 * `apagarPainel` já recusa quem não é o autor — inclusive quem tem acesso
 * total. Esconder o botão é conveniência de tela; a autoridade é o caso de
 * uso, e é lá que a regra está escrita.
 */
export function ApagarPainel({ id, nome }: { id: string; nome: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, iniciar] = useTransition();

  return (
    <div className="pn-item-acoes">
      {erro ? (
        <p className="pn-item-erro" role="alert">
          {erro}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-xs"
        /* O nome acessível distingue um cartão do outro: quatro botões
           "Apagar" numa lista são indistinguíveis para quem navega por
           teclado. O texto visível continua contido nele (WCAG 2.5.3). */
        aria-label={`Apagar o painel ${nome}`}
        disabled={apagando}
        onClick={() => {
          const confirmado = window.confirm(
            `Apagar o painel "${nome}"? A montagem some. Os relatórios que ele mostra não são apagados, e o ato fica na auditoria.`,
          );
          if (!confirmado) return;
          setErro(null);
          iniciar(async () => {
            const resposta = await apagarPainelAction(id);
            // A galeria se redesenha sozinha: a action revalida `/paineis`.
            if (!resposta.ok) {
              setErro(resposta.erro ?? "Não foi possível apagar o painel.");
            }
          });
        }}
      >
        {apagando ? "Apagando…" : "Apagar"}
      </button>
    </div>
  );
}

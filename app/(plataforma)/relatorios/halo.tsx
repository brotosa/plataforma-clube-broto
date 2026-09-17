"use client";

import { useEffect } from "react";

/**
 * O halo dos cartões de assunto: escreve a posição do ponteiro em `--mx`/`--my`
 * para o gradiente do `.rel-assunto` nascer sob o cursor.
 *
 * ## O que ele NÃO faz, que é o ponto
 *
 * Não desenha nada, não decide nada e não guarda estado. A tela inteira
 * funciona sem ele: sem JavaScript o halo fica parado no centro do cartão
 * (o `50%` padrão do CSS), e o resto — a subida de 3px, a borda acesa, o
 * ícone que gira — é CSS puro e continua valendo. Se este componente falhar
 * ao montar, ninguém percebe.
 *
 * ## Um ouvinte, não cinco
 *
 * O ouvinte é **delegado no container**, e não um por cartão. Com cinco
 * assuntos a diferença é irrelevante; com os assuntos que a F26 traz, e com
 * `pointermove` disparando dezenas de vezes por segundo, registrar um ouvinte
 * por item é o tipo de coisa que envelhece mal e ninguém revisita.
 *
 * ## Por que não respeita `prefers-reduced-motion` aqui
 *
 * Porque quem respeita é o CSS, que esconde o halo inteiro nessa mídia. Fazer
 * a mesma checagem nos dois lugares criaria duas verdades sobre a mesma
 * decisão, e a do JavaScript não acompanharia o usuário trocando a
 * preferência com a tela aberta.
 */
export function SeguidorDeHalo({ alvo }: { alvo: string }) {
  useEffect(() => {
    const container = document.querySelector<HTMLElement>(alvo);
    if (!container) return;

    const aoMover = (evento: PointerEvent) => {
      const cartao = (evento.target as Element | null)?.closest<HTMLElement>(".rel-assunto");
      if (!cartao) return;
      const caixa = cartao.getBoundingClientRect();
      cartao.style.setProperty("--mx", `${((evento.clientX - caixa.left) / caixa.width) * 100}%`);
      cartao.style.setProperty("--my", `${((evento.clientY - caixa.top) / caixa.height) * 100}%`);
    };

    container.addEventListener("pointermove", aoMover);
    return () => container.removeEventListener("pointermove", aoMover);
  }, [alvo]);

  return null;
}

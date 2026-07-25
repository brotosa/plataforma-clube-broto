/**
 * Aviso de edição preferencial em desktop (F5 — responsividade).
 *
 * A política do prompt da Onda 1 separa as telas em dois grupos: T1/T4/T6
 * plenamente usáveis a 380px (colapso em cards com `data-label`) e
 * T2/T3/T5/T7 "íntegras com aviso de edição preferencial em desktop" — a
 * leitura é completa no celular, o conforto de edição é que é menor.
 *
 * O aviso é o `.aviso-mob` do protótipo v6.1 (`display:none` acima de 760px,
 * `display:flex` abaixo): não ocupa espaço nem é anunciado por leitor de tela
 * no desktop. A microcópia é a do próprio protótipo, sem reescrita.
 */

/** Texto do protótipo para as telas de cadastro/edição (T2, T3, T5). */
export const AVISO_EDICAO =
  "Edição preferencial em desktop — no celular a leitura é completa, mas o conforto de edição é menor.";

/** Texto do protótipo para a configuração do motor de aprovação (T7). */
export const AVISO_CONFIGURACAO = "Configuração preferencial em desktop.";

export function AvisoEdicaoDesktop({ texto = AVISO_EDICAO }: { texto?: string }) {
  return (
    <div className="aviso-mob">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={15}
        height={15}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ flex: "none" }}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      {texto}
    </div>
  );
}

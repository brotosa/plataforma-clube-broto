"use client";

import { useEffect, useRef, useState } from "react";
import { encerrarPorInatividade, registrarAtividade } from "./sessao-acoes";

/**
 * Contador de sessão ao lado do sino (PR B — tempo de sessão por inatividade).
 *
 * Mostra quanto falta para a sessão expirar e REINICIA a cada atividade real
 * (clique, tecla, rolagem, toque, volta do foco à aba). Fica âmbar perto do
 * fim. Ao zerar, encerra a sessão pela server action e leva ao login com o
 * aviso — mas a autoridade é o servidor: o callback `jwt` já recusa a
 * requisição seguinte quando o intervalo estoura, mesmo que este contador não
 * rode (aba em segundo plano, JS desligado).
 *
 * O relógio do servidor é mantido vivo por um heartbeat: enquanto houver
 * atividade, a cada `HEARTBEAT_MS` o cliente avisa o servidor, que reinicia a
 * marca `ultimaAtividade`. O heartbeat só dispara COM atividade — sem isso
 * seria um keep-alive que nunca deixa a sessão expirar.
 */

/** De quanto em quanto o cliente avisa o servidor (só se houve atividade). */
const HEARTBEAT_MS = 60_000;
/** A partir de quanto tempo restante o contador acende em âmbar. */
const AVISO_MS = 120_000;

function formatar(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

export function SentinelaDeSessao({ tempoSessaoMs }: { tempoSessaoMs: number }) {
  // `expiraEm` é a fonte da verdade do contador; vive em ref para não
  // reprogramar timers a cada atividade. O estado só carrega o texto exibido.
  const expiraEmRef = useRef<number>(Date.now() + tempoSessaoMs);
  const atividadePendenteRef = useRef<boolean>(false);
  const encerrandoRef = useRef<boolean>(false);
  const [restanteMs, setRestanteMs] = useState<number>(tempoSessaoMs);

  useEffect(() => {
    function marcarAtividade() {
      expiraEmRef.current = Date.now() + tempoSessaoMs;
      atividadePendenteRef.current = true;
    }

    // Sinais de atividade REAL. `mousemove` fica de fora de propósito: mexer o
    // mouse sem interagir não é uso, e ouvir isso encheria a página de eventos.
    const eventos: Array<keyof DocumentEventMap> = [
      "pointerdown",
      "keydown",
      "wheel",
      "scroll",
      "touchstart",
    ];
    for (const evento of eventos) {
      document.addEventListener(evento, marcarAtividade, { passive: true });
    }
    // Voltar o foco à aba conta como atividade (a pessoa retomou o trabalho).
    function aoVoltar() {
      if (document.visibilityState === "visible") marcarAtividade();
    }
    document.addEventListener("visibilitychange", aoVoltar);

    // Tique de 1s: atualiza o texto e, ao zerar, encerra uma única vez.
    const tique = window.setInterval(() => {
      const restante = expiraEmRef.current - Date.now();
      setRestanteMs(restante);
      if (restante <= 0 && !encerrandoRef.current) {
        encerrandoRef.current = true;
        window.clearInterval(tique);
        window.clearInterval(pulso);
        void encerrarPorInatividade();
      }
    }, 1000);

    // Heartbeat: só avisa o servidor se houve atividade desde o último pulso.
    const pulso = window.setInterval(() => {
      if (atividadePendenteRef.current && !encerrandoRef.current) {
        atividadePendenteRef.current = false;
        void registrarAtividade();
      }
    }, HEARTBEAT_MS);

    return () => {
      for (const evento of eventos) {
        document.removeEventListener(evento, marcarAtividade);
      }
      document.removeEventListener("visibilitychange", aoVoltar);
      window.clearInterval(tique);
      window.clearInterval(pulso);
    };
  }, [tempoSessaoMs]);

  const avisar = restanteMs <= AVISO_MS;
  const minutos = Math.max(0, Math.ceil(restanteMs / 60000));

  return (
    <span
      className={`sessao-contador${avisar ? " avisar" : ""}`}
      role="timer"
      // Granularidade de minuto no rótulo: o leitor de tela não precisa (nem
      // deve) ouvir cada segundo. O número visível é decorativo (aria-hidden).
      aria-label={`Sessão expira em cerca de ${minutos} minuto(s) sem atividade`}
      title="Tempo restante da sessão — reinicia com a atividade"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ flex: "none" }}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l2.5 2" />
      </svg>
      <span aria-hidden="true" style={{ fontVariantNumeric: "tabular-nums" }}>
        {formatar(restanteMs)}
      </span>
    </span>
  );
}

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
 *
 * ── A CORREÇÃO DA ABA ESQUECIDA ─────────────────────────────────────────
 *
 * Relato de produção: "deixo a aba aberta, volto horas ou dias depois e
 * continuo logado". O mecanismo:
 *
 * Navegador congela e descarta aba em segundo plano, e **timer de aba
 * congelada não roda**. O tique de 1 s que deveria perceber o vencimento
 * simplesmente não acontece enquanto ninguém olha. Quando a pessoa volta,
 * `visibilitychange` dispara PRIMEIRO — antes do próximo tique — e a versão
 * anterior deste componente tratava isso como atividade, reiniciando
 * `expiraEmRef` para "agora + 30 min". A janela era rejuvenescida por um
 * tempo em que **não houve ninguém**, e o tique nunca chegava a ver o
 * vencimento que já tinha ocorrido.
 *
 * Duas mudanças, e a ordem importa:
 *
 *  1. **Voltar a uma aba cujo prazo acabou não é atividade.** O prazo acabou
 *     enquanto ninguém estava lá; renovar seria premiar a ausência. Se a
 *     janela local já venceu, encerra em vez de renovar.
 *
 *  2. **Quem decide é o servidor, e ele é consultado na volta.** O relógio
 *     local pode estar adiantado, atrasado ou parado — é memória de uma aba
 *     que passou a noite congelada. Ao reaparecer, a sentinela pergunta ao
 *     servidor (`registrarAtividade`, que passa pelo `auth()` e portanto
 *     pela conferência de inatividade); recusa significa sessão morta, e a
 *     saída é limpa e explicada em vez de uma tela que parece viva até o
 *     primeiro clique.
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
  // Expiração por inatividade DESLIGADA (0 em Configurações): sem contador,
  // sem heartbeat e sem encerramento. O servidor também não expira — as duas
  // pontas leem a mesma política, e discordar aqui seria deslogar sem motivo.
  const ligado = tempoSessaoMs > 0;
  // `expiraEm` é a fonte da verdade do contador; vive em ref para não
  // reprogramar timers a cada atividade. O estado só carrega o texto exibido.
  const expiraEmRef = useRef<number>(Date.now() + tempoSessaoMs);
  const atividadePendenteRef = useRef<boolean>(false);
  const encerrandoRef = useRef<boolean>(false);
  const [restanteMs, setRestanteMs] = useState<number>(tempoSessaoMs);

  useEffect(() => {
    if (!ligado) return;

    /** Encerra uma única vez, desarmando os timers. */
    function encerrar() {
      if (encerrandoRef.current) return;
      encerrandoRef.current = true;
      window.clearInterval(tique);
      window.clearInterval(pulso);
      void encerrarPorInatividade();
    }

    function marcarAtividade() {
      if (encerrandoRef.current) return;
      // O prazo já tinha acabado: isto não é atividade que renova, é alguém
      // chegando depois do fim. Renovar aqui é o defeito da aba esquecida.
      if (Date.now() >= expiraEmRef.current) {
        encerrar();
        return;
      }
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
    /*
     * Voltar o foco à aba: a pessoa retomou o trabalho, mas o relógio local
     * é memória de uma aba que pode ter passado a noite congelada — então
     * quem responde se a sessão ainda vale é o SERVIDOR, não este ref.
     *
     * `registrarAtividade` passa por `auth()` e, portanto, pela conferência
     * de inatividade do callback `jwt`: se a marca do cookie já estourou o
     * intervalo, ele devolve recusa e a saída é limpa. Só depois de o
     * servidor aceitar é que a janela local se renova.
     *
     * **Sem atalho por tempo, e isso foi aprendido tentando.** A primeira
     * versão pulava a consulta quando o servidor tinha sido confirmado há
     * menos de um minuto, para poupar requisição de quem alterna muito de
     * aba. Só que esse "há menos de um minuto" é medido pelo mesmo relógio
     * que passou a noite congelado — e o atalho reabria exatamente o buraco
     * que esta função existe para fechar. O custo de perguntar sempre é uma
     * requisição por volta à aba, do tamanho de uma navegação qualquer.
     */
    async function aoVoltar() {
      if (document.visibilityState !== "visible") return;
      if (encerrandoRef.current) return;
      if (Date.now() >= expiraEmRef.current) {
        encerrar();
        return;
      }
      const resposta = await registrarAtividade();
      if (encerrandoRef.current) return;
      if (!resposta.ok) {
        encerrar();
        return;
      }
      expiraEmRef.current = Date.now() + tempoSessaoMs;
      // A marca do servidor acabou de ser reiniciada: o próximo pulso não
      // precisa repeti-la.
      atividadePendenteRef.current = false;
    }
    const aoVisibilidadeMudar = () => void aoVoltar();
    document.addEventListener("visibilitychange", aoVisibilidadeMudar);

    // Tique de 1s: atualiza o texto e, ao zerar, encerra uma única vez.
    const tique = window.setInterval(() => {
      const restante = expiraEmRef.current - Date.now();
      setRestanteMs(restante);
      if (restante <= 0) {
        encerrar();
      }
    }, 1000);

    // Heartbeat: só avisa o servidor se houve atividade desde o último pulso.
    const pulso = window.setInterval(() => {
      if (atividadePendenteRef.current && !encerrandoRef.current) {
        atividadePendenteRef.current = false;
        void registrarAtividade().then((resposta) => {
          // Recusa aqui significa que o servidor já considerou a sessão
          // morta — a saída é limpa e explicada, em vez de esperar o próximo
          // clique esbarrar num redirecionamento seco.
          if (!resposta.ok) encerrar();
        });
      }
    }, HEARTBEAT_MS);

    return () => {
      for (const evento of eventos) {
        document.removeEventListener(evento, marcarAtividade);
      }
      document.removeEventListener("visibilitychange", aoVisibilidadeMudar);
      window.clearInterval(tique);
      window.clearInterval(pulso);
    };
  }, [tempoSessaoMs, ligado]);

  if (!ligado) return null;

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

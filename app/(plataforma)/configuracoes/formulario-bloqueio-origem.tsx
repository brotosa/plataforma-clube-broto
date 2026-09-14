"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ORIGEM_BLOQUEIO_MIN_MAXIMO,
  ORIGEM_BLOQUEIO_MIN_MINIMO,
  ORIGEM_MAX_TENTATIVAS_MAXIMO,
  ORIGEM_MAX_TENTATIVAS_MINIMO,
  type PoliticaDeOrigem,
  descreverPolitica,
} from "@/dominio/usuarios/politica-origem";
import { acaoSalvarBloqueioOrigem } from "./acoes";

/** Formulário do bloqueio por origem de rede. Só Administrador; auditado. */
export function FormularioBloqueioOrigem({ inicial }: { inicial: PoliticaDeOrigem }) {
  const roteador = useRouter();
  const [politica, setPolitica] = useState<PoliticaDeOrigem>(inicial);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const idBase = useId();

  function atualizar<C extends keyof PoliticaDeOrigem>(campo: C, valor: number) {
    setPolitica((atual) => ({ ...atual, [campo]: valor }));
    setSucesso(false);
  }

  async function salvar() {
    setOcupado(true);
    setErros([]);
    const resultado = await acaoSalvarBloqueioOrigem(politica);
    setOcupado(false);
    if (resultado.ok) {
      setSucesso(true);
      roteador.refresh();
    } else {
      setErros(resultado.erros ?? ["Não foi possível salvar."]);
    }
  }

  return (
    <div className="card" style={{ padding: "20px 22px", maxWidth: 640 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label htmlFor={`${idBase}-tent`}>Falhas por endereço antes de bloquear</label>
          <input
            id={`${idBase}-tent`}
            className="input"
            type="number"
            min={0}
            max={ORIGEM_MAX_TENTATIVAS_MAXIMO}
            value={politica.maxTentativas}
            style={{ width: 120 }}
            onChange={(evento) => atualizar("maxTentativas", Number(evento.target.value))}
          />
          <span className="cap" style={{ marginTop: 4 }}>
            <b>0 desliga</b> — e é o padrão. Ligado, aceita de {ORIGEM_MAX_TENTATIVAS_MINIMO} a{" "}
            {ORIGEM_MAX_TENTATIVAS_MAXIMO} falhas consecutivas do mesmo endereço.
          </span>
        </div>

        <div className="field">
          <label htmlFor={`${idBase}-tempo`}>Tempo de bloqueio do endereço (minutos)</label>
          <input
            id={`${idBase}-tempo`}
            className="input"
            type="number"
            min={ORIGEM_BLOQUEIO_MIN_MINIMO}
            max={ORIGEM_BLOQUEIO_MIN_MAXIMO}
            value={politica.bloqueioMin}
            style={{ width: 120 }}
            onChange={(evento) => atualizar("bloqueioMin", Number(evento.target.value))}
          />
          <span className="cap" style={{ marginTop: 4 }}>
            Entre {ORIGEM_BLOQUEIO_MIN_MINIMO} e {ORIGEM_BLOQUEIO_MIN_MAXIMO} minutos.
          </span>
        </div>
      </div>

      <div className="aviso-inline" style={{ marginTop: 16 }}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ flex: "none" }}
        >
          <path d="M12 8v4l3 3" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        <span>{descreverPolitica(politica)}</span>
      </div>

      <p className="cap" style={{ marginTop: 10, maxWidth: "70ch" }}>
        <b>Atenção ao ligar:</b> o bloqueio atinge <i>todas</i> as contas que saem pelo mesmo
        endereço — um escritório com saída única tranca todo mundo junto. E isto <b>não é</b>{" "}
        limitação de requisições: protege contra tentativa e erro dirigida, não contra inundação,
        que se resolve na borda da rede.
      </p>

      {erros.length > 0 ? (
        <p className="cap" role="alert" style={{ color: "var(--erro-texto-aaa)", marginTop: 12 }}>
          {erros.join(" ")}
        </p>
      ) : null}
      {sucesso ? (
        <p className="cap" role="status" style={{ color: "var(--azul-texto-aaa)", marginTop: 12 }}>
          Bloqueio por origem salvo. Vale nas próximas tentativas.
        </p>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-azul"
          disabled={ocupado}
          onClick={() => void salvar()}
        >
          {ocupado ? "Salvando…" : "Salvar bloqueio por origem"}
        </button>
      </div>
    </div>
  );
}

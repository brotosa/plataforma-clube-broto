"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TEMPO_SESSAO_MAXIMO,
  TEMPO_SESSAO_MINIMO,
  type PoliticaDeSessao,
  descreverPolitica,
} from "@/dominio/usuarios/politica-sessao";
import { acaoSalvarTempoSessao } from "./acoes";

/**
 * Formulário do tempo de sessão por inatividade (Configurações). Estado local;
 * salva pela server action (só Administrador, auditada). A prévia mostra a
 * frase que descreve a política vigente.
 */
export function FormularioTempoSessao({ inicial }: { inicial: PoliticaDeSessao }) {
  const roteador = useRouter();
  const [politica, setPolitica] = useState<PoliticaDeSessao>(inicial);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const idBase = useId();

  async function salvar() {
    setOcupado(true);
    setErros([]);
    const resultado = await acaoSalvarTempoSessao(politica);
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
      <div className="field">
        <label htmlFor={`${idBase}-tempo`}>Tempo de sessão (minutos)</label>
        <input
          id={`${idBase}-tempo`}
          className="input"
          type="number"
          min={TEMPO_SESSAO_MINIMO}
          max={TEMPO_SESSAO_MAXIMO}
          value={politica.tempoSessaoMin}
          style={{ width: 120 }}
          onChange={(evento) => {
            setPolitica({ tempoSessaoMin: Number(evento.target.value) });
            setSucesso(false);
          }}
        />
        <span className="cap" style={{ marginTop: 4 }}>
          Entre {TEMPO_SESSAO_MINIMO} e {TEMPO_SESSAO_MAXIMO} minutos. Passado esse intervalo sem
          atividade, a sessão expira.
        </span>
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

      {erros.length > 0 ? (
        <p className="cap" role="alert" style={{ color: "var(--erro-texto-aaa)", marginTop: 12 }}>
          {erros.join(" ")}
        </p>
      ) : null}
      {sucesso ? (
        <p className="cap" role="status" style={{ color: "var(--azul-texto-aaa)", marginTop: 12 }}>
          Tempo de sessão salvo. Vale nas sessões a partir da próxima requisição.
        </p>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-azul"
          disabled={ocupado}
          onClick={() => void salvar()}
        >
          {ocupado ? "Salvando…" : "Salvar tempo de sessão"}
        </button>
      </div>
    </div>
  );
}

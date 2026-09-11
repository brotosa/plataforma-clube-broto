"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BLOQUEIO_MIN_MAXIMO,
  BLOQUEIO_MIN_MINIMO,
  MAX_TENTATIVAS_MAXIMO,
  MAX_TENTATIVAS_MINIMO,
  type PoliticaDeLogin,
  descreverPolitica,
} from "@/dominio/usuarios/politica-login";
import { acaoSalvarBloqueioLogin } from "./acoes";

/**
 * Formulário do bloqueio por tentativas de login (Configurações). Estado local;
 * salva pela server action (só Administrador, auditada). A prévia descreve a
 * política e lembra que o Administrador nunca é bloqueado.
 */
export function FormularioBloqueioLogin({ inicial }: { inicial: PoliticaDeLogin }) {
  const roteador = useRouter();
  const [politica, setPolitica] = useState<PoliticaDeLogin>(inicial);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const idBase = useId();

  function atualizar<C extends keyof PoliticaDeLogin>(campo: C, valor: number) {
    setPolitica((atual) => ({ ...atual, [campo]: valor }));
    setSucesso(false);
  }

  async function salvar() {
    setOcupado(true);
    setErros([]);
    const resultado = await acaoSalvarBloqueioLogin(politica);
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
          <label htmlFor={`${idBase}-tent`}>Tentativas antes de bloquear</label>
          <input
            id={`${idBase}-tent`}
            className="input"
            type="number"
            min={MAX_TENTATIVAS_MINIMO}
            max={MAX_TENTATIVAS_MAXIMO}
            value={politica.maxTentativas}
            style={{ width: 120 }}
            onChange={(evento) => atualizar("maxTentativas", Number(evento.target.value))}
          />
          <span className="cap" style={{ marginTop: 4 }}>
            Entre {MAX_TENTATIVAS_MINIMO} e {MAX_TENTATIVAS_MAXIMO} tentativas consecutivas.
          </span>
        </div>

        <div className="field">
          <label htmlFor={`${idBase}-tempo`}>Tempo de bloqueio (minutos)</label>
          <input
            id={`${idBase}-tempo`}
            className="input"
            type="number"
            min={BLOQUEIO_MIN_MINIMO}
            max={BLOQUEIO_MIN_MAXIMO}
            value={politica.bloqueioMin}
            style={{ width: 120 }}
            onChange={(evento) => atualizar("bloqueioMin", Number(evento.target.value))}
          />
          <span className="cap" style={{ marginTop: 4 }}>
            Entre {BLOQUEIO_MIN_MINIMO} e {BLOQUEIO_MIN_MAXIMO} minutos.
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

      {erros.length > 0 ? (
        <p className="cap" role="alert" style={{ color: "var(--erro-texto-aaa)", marginTop: 12 }}>
          {erros.join(" ")}
        </p>
      ) : null}
      {sucesso ? (
        <p className="cap" role="status" style={{ color: "var(--azul-texto-aaa)", marginTop: 12 }}>
          Bloqueio por login salvo. Vale nas próximas tentativas.
        </p>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-azul"
          disabled={ocupado}
          onClick={() => void salvar()}
        >
          {ocupado ? "Salvando…" : "Salvar bloqueio"}
        </button>
      </div>
    </div>
  );
}

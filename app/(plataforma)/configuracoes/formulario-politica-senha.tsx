"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPRIMENTO_MIN_MAXIMO,
  COMPRIMENTO_MIN_MINIMO,
  HISTORICO_MAXIMO,
  type PoliticaDeSenha,
  descreverPolitica,
} from "@/dominio/usuarios/politica-senha";
import { acaoSalvarPoliticaSenha } from "./acoes";

/**
 * Formulário da política de senha (Configurações). Estado local; salva pela
 * server action (só Administrador, auditada). A prévia mostra, em tempo real,
 * a frase de requisitos que a tela de troca de senha exibirá.
 */
export function FormularioPoliticaSenha({ inicial }: { inicial: PoliticaDeSenha }) {
  const roteador = useRouter();
  const [politica, setPolitica] = useState<PoliticaDeSenha>(inicial);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const idBase = useId();

  function atualizar<C extends keyof PoliticaDeSenha>(campo: C, valor: PoliticaDeSenha[C]) {
    setPolitica((atual) => ({ ...atual, [campo]: valor }));
    setSucesso(false);
  }

  async function salvar() {
    setOcupado(true);
    setErros([]);
    const resultado = await acaoSalvarPoliticaSenha(politica);
    setOcupado(false);
    if (resultado.ok) {
      setSucesso(true);
      roteador.refresh();
    } else {
      setErros(resultado.erros ?? ["Não foi possível salvar."]);
    }
  }

  const classes: Array<{ campo: keyof PoliticaDeSenha; rotulo: string }> = [
    { campo: "exigeMaiuscula", rotulo: "Exigir letra maiúscula" },
    { campo: "exigeMinuscula", rotulo: "Exigir letra minúscula" },
    { campo: "exigeNumero", rotulo: "Exigir número" },
    { campo: "exigeSimbolo", rotulo: "Exigir símbolo (ex.: ! @ # $ %)" },
  ];

  return (
    <div className="card" style={{ padding: "20px 22px", maxWidth: 640 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label htmlFor={`${idBase}-min`}>Comprimento mínimo</label>
          <input
            id={`${idBase}-min`}
            className="input"
            type="number"
            min={COMPRIMENTO_MIN_MINIMO}
            max={COMPRIMENTO_MIN_MAXIMO}
            value={politica.comprimentoMin}
            style={{ width: 120 }}
            onChange={(evento) => atualizar("comprimentoMin", Number(evento.target.value))}
          />
          <span className="cap" style={{ marginTop: 4 }}>
            Entre {COMPRIMENTO_MIN_MINIMO} e {COMPRIMENTO_MIN_MAXIMO} caracteres.
          </span>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: "6px 0 0" }}>
          <legend className="cap" style={{ fontWeight: 700, marginBottom: 6 }}>
            Classes de caractere exigidas
          </legend>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {classes.map(({ campo, rotulo }) => (
              <label key={campo} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={politica[campo] as boolean}
                  style={{ accentColor: "var(--azul)" }}
                  onChange={(evento) => atualizar(campo, evento.target.checked as never)}
                />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field" style={{ marginTop: 6 }}>
          <label htmlFor={`${idBase}-hist`}>Não repetir as últimas N senhas</label>
          <input
            id={`${idBase}-hist`}
            className="input"
            type="number"
            min={0}
            max={HISTORICO_MAXIMO}
            value={politica.historicoN}
            style={{ width: 120 }}
            onChange={(evento) => atualizar("historicoN", Number(evento.target.value))}
          />
          <span className="cap" style={{ marginTop: 4 }}>
            0 desliga o histórico. Até {HISTORICO_MAXIMO}.
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
        <span>
          <b>Como aparecerá na troca de senha:</b> {descreverPolitica(politica)}
        </span>
      </div>

      {erros.length > 0 ? (
        <p className="cap" role="alert" style={{ color: "var(--erro-texto-aaa)", marginTop: 12 }}>
          {erros.join(" ")}
        </p>
      ) : null}
      {sucesso ? (
        <p className="cap" role="status" style={{ color: "var(--azul-texto-aaa)", marginTop: 12 }}>
          Política de senha salva. Vale na próxima troca de senha.
        </p>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-azul"
          disabled={ocupado}
          onClick={() => void salvar()}
        >
          {ocupado ? "Salvando…" : "Salvar política"}
        </button>
      </div>
    </div>
  );
}

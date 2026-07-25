"use client";

import { useActionState } from "react";
import type { EstadoFormulario } from "./acoes";

/** Lista de erros de validação no padrão institucional. */
export function ErrosDoFormulario({ erros }: { erros?: string[] }) {
  if (!erros || erros.length === 0) return null;
  return (
    <div
      role="alert"
      className="cap"
      style={{
        color: "var(--erro-texto-aaa)",
        background: "var(--erro-claro)",
        border: "1px solid var(--erro)",
        borderRadius: "var(--r-sm)",
        padding: "10px 12px",
        margin: "0 0 14px",
      }}
    >
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {erros.map((erro) => (
          <li key={erro}>{erro}</li>
        ))}
      </ul>
    </div>
  );
}

export function MensagemDeSucesso({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p
      role="status"
      className="cap"
      style={{
        color: "var(--preto)",
        background: "var(--verde-claro)",
        border: "1px solid var(--verde)",
        borderRadius: "var(--r-sm)",
        padding: "10px 12px",
        margin: "0 0 14px",
      }}
    >
      {mensagem}
    </p>
  );
}

type AcaoDeFormulario = (
  estado: EstadoFormulario,
  dados: FormData,
) => Promise<EstadoFormulario>;

/**
 * Invólucro genérico: formulário com estado de erros/sucesso devolvido
 * pela server action (useActionState) e botão com estado de envio.
 */
export function FormularioComEstado({
  acao,
  children,
  rotuloEnviar,
  classeBotao = "btn btn-azul",
  estiloFormulario,
  confirmacao,
}: {
  acao: AcaoDeFormulario;
  children?: React.ReactNode;
  rotuloEnviar: string;
  classeBotao?: string;
  estiloFormulario?: React.CSSProperties;
  confirmacao?: string;
}) {
  const [estado, despachar, pendente] = useActionState<EstadoFormulario, FormData>(
    acao,
    {},
  );
  return (
    <form
      action={despachar}
      style={estiloFormulario}
      onSubmit={(evento) => {
        if (confirmacao && !window.confirm(confirmacao)) {
          evento.preventDefault();
        }
      }}
    >
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      {children}
      <button type="submit" className={classeBotao} disabled={pendente}>
        {pendente ? "Enviando…" : rotuloEnviar}
      </button>
    </form>
  );
}

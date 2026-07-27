"use client";

import { useActionState, useState } from "react";
import type { StatusPatrocinador } from "@prisma/client";
import { ErrosDoFormulario, MensagemDeSucesso } from "../../aliados/formularios";
import {
  acaoAlterarStatus,
  acaoGerarRelatorio,
  acaoSalvarContrato,
  type EstadoFormulario,
} from "../acoes";

/** Data para `<input type="date">`; null vira campo vazio, não "hoje". */
function paraCampoDeData(data: Date | null): string {
  return data ? data.toISOString().slice(0, 10) : "";
}

/**
 * Formulário do contrato (T33, aba Contrato).
 *
 * **Todos os campos aceitam vazio**, e isto é a ficha §7 valendo: os
 * valores do contrato Yamer são `[A CONFIRMAR — Marco]`. Deixar em branco
 * é uma resposta válida — produz o traço com motivo na leitura, jamais um
 * zero que afirmaria o que ninguém sabe.
 */
export function FormularioDoContrato({
  patrocinadorId,
  valores,
}: {
  patrocinadorId: string;
  valores: {
    dataAssinatura: Date | null;
    vigenciaInicio: Date | null;
    vigenciaFim: Date | null;
    precoUnitario: string | null;
    valorTotalContratado: string | null;
    assinaturasAdquiridas: number | null;
  };
}) {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoSalvarContrato,
    {},
  );
  return (
    <>
      <h3 className="h-el" style={{ marginBottom: 12 }}>
        Editar contrato
      </h3>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      <form action={acao}>
        <input type="hidden" name="patrocinadorId" value={patrocinadorId} />
        <div
          className="g-resp"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}
        >
          <div className="field">
            <label htmlFor="ct-assinatura">Data de assinatura</label>
            <input
              id="ct-assinatura"
              className="input"
              type="date"
              name="dataAssinatura"
              defaultValue={paraCampoDeData(valores.dataAssinatura)}
            />
          </div>
          <div className="field">
            <label htmlFor="ct-adquiridas">Assinaturas adquiridas</label>
            <input
              id="ct-adquiridas"
              className="input"
              type="number"
              min={0}
              name="assinaturasAdquiridas"
              defaultValue={valores.assinaturasAdquiridas ?? ""}
              aria-describedby="ct-adquiridas-ajuda"
            />
            <span className="hint" id="ct-adquiridas-ajuda">
              Em branco enquanto o número não estiver confirmado — sem ele o saldo aparece como
              pendência, nunca como zero.
            </span>
          </div>
          <div className="field">
            <label htmlFor="ct-inicio">Vigência — início</label>
            <input
              id="ct-inicio"
              className="input"
              type="date"
              name="vigenciaInicio"
              defaultValue={paraCampoDeData(valores.vigenciaInicio)}
            />
          </div>
          <div className="field">
            <label htmlFor="ct-fim">Vigência — fim</label>
            <input
              id="ct-fim"
              className="input"
              type="date"
              name="vigenciaFim"
              defaultValue={paraCampoDeData(valores.vigenciaFim)}
            />
          </div>
          <div className="field">
            <label htmlFor="ct-preco">Preço por assinatura/ano</label>
            <input
              id="ct-preco"
              className="input"
              name="precoUnitario"
              inputMode="decimal"
              defaultValue={valores.precoUnitario ?? ""}
              placeholder="Ex.: 120,00"
            />
          </div>
          <div className="field">
            <label htmlFor="ct-total">Valor total contratado</label>
            <input
              id="ct-total"
              className="input"
              name="valorTotalContratado"
              inputMode="decimal"
              defaultValue={valores.valorTotalContratado ?? ""}
              placeholder="Ex.: 60000,00"
            />
          </div>
        </div>
        <button type="submit" className="btn btn-azul" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar contrato"}
        </button>
      </form>
    </>
  );
}

/** Interruptor de status — encerrar não apaga nada (RN05). */
export function StatusDoPatrocinador({
  patrocinadorId,
  status,
}: {
  patrocinadorId: string;
  status: StatusPatrocinador;
}) {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoAlterarStatus,
    {},
  );
  const proximo = status === "ATIVO" ? "ENCERRADO" : "ATIVO";
  return (
    <>
      <form action={acao} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="hidden" name="patrocinadorId" value={patrocinadorId} />
        <input type="hidden" name="status" value={proximo} />
        <span className={status === "ATIVO" ? "pill pill-ok" : "pill pill-neutra"}>
          <i />
          {status === "ATIVO" ? "ativo" : "encerrado"}
        </span>
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pendente}>
          {status === "ATIVO" ? "Encerrar" : "Reativar"}
        </button>
      </form>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
    </>
  );
}

/**
 * Modal de geração do R1 (RN66): período e finalidade, ambos obrigatórios.
 *
 * A finalidade não é burocracia — é o que a trilha guarda para explicar,
 * depois, por que um relatório saiu da plataforma.
 */
export function GerarRelatorio({ patrocinadorId }: { patrocinadorId: string }) {
  const [aberto, definirAberto] = useState(false);
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoGerarRelatorio,
    {},
  );

  if (!aberto) {
    return (
      <button type="button" className="btn btn-azul" onClick={() => definirAberto(true)}>
        Gerar relatório
      </button>
    );
  }
  return (
    <div className="card" style={{ padding: "18px 20px", minWidth: 320 }}>
      <h2 className="h-el" style={{ marginBottom: 10 }}>
        Gerar relatório do patrocinador
      </h2>
      <ErrosDoFormulario erros={estado.erros} />
      <form action={acao}>
        <input type="hidden" name="patrocinadorId" value={patrocinadorId} />
        <div className="field">
          <label htmlFor="r1-inicio">Período — início</label>
          <input id="r1-inicio" className="input" type="date" name="periodoInicio" required />
        </div>
        <div className="field">
          <label htmlFor="r1-fim">Período — fim</label>
          <input id="r1-fim" className="input" type="date" name="periodoFim" required />
        </div>
        <div className="field">
          <label htmlFor="r1-finalidade">Finalidade</label>
          <input
            id="r1-finalidade"
            className="input"
            name="finalidade"
            required
            aria-describedby="r1-finalidade-ajuda"
            placeholder="Ex.: prestação de contas trimestral ao patrocinador"
          />
          <span className="hint" id="r1-finalidade-ajuda">
            Fica registrada na trilha de auditoria junto com o período.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Gerando…" : "Gerar"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => definirAberto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

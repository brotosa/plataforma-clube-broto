"use client";

import type { EstagioEmpresa } from "@prisma/client";
import {
  acaoAtualizarContato,
  acaoAtualizarContrato,
  acaoCriarContato,
  acaoCriarContrato,
  acaoEncerrarAliado,
  acaoMudarStatusContrato,
  acaoReativarAliado,
  acaoSolicitarPromocao,
  acaoSuspenderAliado,
} from "../acoes";
import { FormularioComEstado } from "../formularios";

/** Ações de mudança de estágio (visíveis conforme o estágio e o papel). */
export function AcoesDeEstagio({
  empresaId,
  estagio,
  pendenciasPromocao,
  temSolicitacaoPendente,
  motivosSuspensao,
  podeEditar,
}: {
  empresaId: string;
  estagio: EstagioEmpresa;
  pendenciasPromocao: string[];
  temSolicitacaoPendente: boolean;
  motivosSuspensao: Array<{ id: string; slug: string; nome: string }>;
  podeEditar: boolean;
}) {
  if (!podeEditar) {
    return null;
  }
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <h2 className="h-el" style={{ marginBottom: 14 }}>
        Estágio e ciclo de vida
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {estagio === "EM_APROVACAO" ? (
          // Onda 2 (pipeline da ficha §3.1): pedido pendente = Em aprovação.
          <p className="cap" style={{ margin: 0 }}>
            <span className="pill pill-info">
              <i aria-hidden="true" />
              Promoção aguardando aprovação
            </span>{" "}
            A decisão acontece na fila de Aprovações (RN06); a devolução traz a
            empresa de volta a Em negociação.
          </p>
        ) : null}
        {estagio === "EM_NEGOCIACAO" ? (
          <div>
            {temSolicitacaoPendente ? (
              <p className="cap" style={{ margin: 0 }}>
                <span className="pill pill-info">
                  <i aria-hidden="true" />
                  Promoção aguardando aprovação
                </span>{" "}
                A decisão acontece na fila de Aprovações (RN06).
              </p>
            ) : (
              <>
                {pendenciasPromocao.length > 0 ? (
                  <div style={{ marginBottom: 10 }}>
                    <p className="cap" style={{ margin: "0 0 6px", fontWeight: 700 }}>
                      Pendências para promover a Aliada ativa (M2):
                    </p>
                    <ul className="cap" style={{ margin: 0, paddingLeft: 18 }}>
                      {pendenciasPromocao.map((pendencia) => (
                        <li key={pendencia}>{pendencia}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <FormularioComEstado
                  acao={acaoSolicitarPromocao}
                  rotuloEnviar="Solicitar promoção a Aliada ativa"
                >
                  <input type="hidden" name="empresaId" value={empresaId} />
                </FormularioComEstado>
              </>
            )}
          </div>
        ) : null}

        {estagio === "ALIADA_ATIVA" ? (
          <FormularioComEstado
            acao={acaoSuspenderAliado}
            rotuloEnviar="Suspender aliado"
            classeBotao="btn btn-ghost"
          >
            <input type="hidden" name="empresaId" value={empresaId} />
            <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, marginBottom: 14 }}>
              <div className="field">
                <label htmlFor="campo-motivo-suspensao">Motivo tipificado (RN12)</label>
                <select id="campo-motivo-suspensao" className="select" name="motivoSuspensaoId" required>
                  <option value="">Selecionar…</option>
                  {motivosSuspensao.map((motivo) => (
                    <option key={motivo.id} value={motivo.id}>
                      {motivo.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="campo-descricao-suspensao">Descrição (obrigatória para “Outros”)</label>
                <input id="campo-descricao-suspensao" className="input" name="descricao" />
              </div>
            </div>
          </FormularioComEstado>
        ) : null}

        {estagio === "SUSPENSA" ? (
          <FormularioComEstado acao={acaoReativarAliado} rotuloEnviar="Reativar aliado">
            <input type="hidden" name="empresaId" value={empresaId} />
            <p className="cap" style={{ margin: "0 0 10px" }}>
              A reativação não republica ofertas automaticamente — a republicação é decisão
              manual por oferta.
            </p>
          </FormularioComEstado>
        ) : null}

        {estagio !== "ENCERRADA" ? (
          <FormularioComEstado
            acao={acaoEncerrarAliado}
            rotuloEnviar="Encerrar aliado"
            classeBotao="btn btn-ghost"
            confirmacao="Encerrar o aliado é definitivo (estado terminal) e pausa as ofertas publicadas para despublicação (RN04). Confirmar?"
          >
            <input type="hidden" name="empresaId" value={empresaId} />
          </FormularioComEstado>
        ) : (
          <p className="cap" style={{ margin: 0 }}>
            Aliado encerrado — estado terminal (RN05: histórico preservado).
          </p>
        )}
      </div>
    </div>
  );
}

/** Formulário de novo contato (aba Contatos). */
/** Valores para pré-preencher a edição de um contato. */
export interface ContatoPrefill {
  id: string;
  papel: string;
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
}

/**
 * Formulário de contato (aba Contatos). Dois modos, mesmos campos:
 *  • adicionar (sem `contato`): cria um novo contato;
 *  • editar (com `contato`): reaproveita `atualizarContato` para corrigir um
 *    contato existente. Os ids dos campos são sufixados com o id do contato
 *    para não colidirem quando vários formulários de edição coexistem na aba.
 */
export function FormularioContato({
  empresaId,
  contato,
}: {
  empresaId: string;
  contato?: ContatoPrefill;
}) {
  const editando = contato !== undefined;
  const sufixo = editando ? `-${contato.id}` : "";
  return (
    <FormularioComEstado
      acao={editando ? acaoAtualizarContato : acaoCriarContato}
      rotuloEnviar={editando ? "Salvar contato" : "Adicionar contato"}
    >
      <input type="hidden" name="empresaId" value={empresaId} />
      {editando ? <input type="hidden" name="contatoId" value={contato.id} /> : null}
      <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="field">
          <label htmlFor={`campo-contato-papel${sufixo}`}>Papel</label>
          <select
            id={`campo-contato-papel${sufixo}`}
            className="select"
            name="papel"
            required
            defaultValue={editando ? contato.papel : "COMERCIAL"}
          >
            <option value="COMERCIAL">Comercial</option>
            <option value="TECNICO">Técnico</option>
            <option value="FINANCEIRO">Financeiro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`campo-contato-nome${sufixo}`}>Nome</label>
          <input
            id={`campo-contato-nome${sufixo}`}
            className="input"
            name="nome"
            required
            defaultValue={editando ? contato.nome : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor={`campo-contato-cargo${sufixo}`}>Cargo</label>
          <input
            id={`campo-contato-cargo${sufixo}`}
            className="input"
            name="cargo"
            defaultValue={editando ? contato.cargo : undefined}
          />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor={`campo-contato-email${sufixo}`}>E-mail</label>
          <input
            id={`campo-contato-email${sufixo}`}
            className="input"
            name="email"
            type="email"
            required
            defaultValue={editando ? contato.email : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor={`campo-contato-telefone${sufixo}`}>Telefone</label>
          <input
            id={`campo-contato-telefone${sufixo}`}
            className="input"
            name="telefone"
            defaultValue={editando ? contato.telefone : undefined}
          />
        </div>
      </div>
    </FormularioComEstado>
  );
}

/** Valores já formatados (strings) para pré-preencher a edição do contrato. */
export interface ContratoPrefill {
  id: string;
  vigenciaBase: string;
  dataAssinatura: string;
  comissaoPct: string;
  ambientesPagamento: string;
  anexoS3Key: string;
  hashVerificacao: string;
}

/**
 * Formulário do contrato comercial (aba Comercial). Serve a dois modos, com
 * os mesmos campos:
 *  • registro (sem `contrato`): a comissão vem pré-preenchida com a
 *    comissão-padrão do contrato-modelo, lida do Parametrizador, e editável;
 *  • edição (com `contrato`): reaproveita `atualizarContrato` para corrigir o
 *    contrato vigente — inclusive preencher o anexo obrigatório — sem
 *    denunciá-lo. Mesma permissão (CRIAR_EDITAR) e mesma auditoria.
 */
export function FormularioContrato({
  empresaId,
  comissaoPadrao,
  contrato,
}: {
  empresaId: string;
  comissaoPadrao: number | null;
  contrato?: ContratoPrefill;
}) {
  const editando = contrato !== undefined;
  const comissaoInicial = editando
    ? contrato.comissaoPct
    : comissaoPadrao === null
      ? ""
      : String(comissaoPadrao);
  return (
    <FormularioComEstado
      acao={editando ? acaoAtualizarContrato : acaoCriarContrato}
      rotuloEnviar={editando ? "Salvar alterações" : "Registrar contrato"}
    >
      <input type="hidden" name="empresaId" value={empresaId} />
      {editando ? <input type="hidden" name="contratoId" value={contrato.id} /> : null}
      <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="field">
          <label htmlFor="campo-vigencia-base">Data-base da vigência</label>
          <input
            id="campo-vigencia-base"
            className="input"
            name="vigenciaBase"
            type="date"
            required
            defaultValue={editando ? contrato.vigenciaBase : undefined}
          />
          <span className="hint">Padrão contratual: 12 meses com renovação automática.</span>
        </div>
        <div className="field">
          <label htmlFor="campo-assinatura">Data de assinatura</label>
          <input
            id="campo-assinatura"
            className="input"
            name="dataAssinatura"
            type="date"
            defaultValue={editando ? contrato.dataAssinatura : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="campo-comissao">Comissão (%)</label>
          <input
            id="campo-comissao"
            className="input"
            name="comissaoPct"
            inputMode="decimal"
            defaultValue={comissaoInicial}
          />
          <span className="hint">
            {editando || comissaoPadrao === null
              ? "Por aliado; fonte = contrato. Incide só sobre Benefícios pagos."
              : `Pré-preenchida com a comissão-padrão do contrato-modelo (${comissaoPadrao}%) e editável por contrato. Incide só sobre Benefícios pagos.`}
          </span>
        </div>
        <div className="field">
          <label htmlFor="campo-ambientes">Ambientes de pagamento habilitados</label>
          <select
            id="campo-ambientes"
            className="select"
            name="ambientesPagamento"
            required
            defaultValue={editando ? contrato.ambientesPagamento : ""}
          >
            <option value="" disabled>
              Selecionar…
            </option>
            <option value="DENTRO_PLATAFORMA">Dentro da Plataforma</option>
            <option value="FORA_PLATAFORMA">Fora da Plataforma</option>
            <option value="AMBOS">Ambos</option>
          </select>
          <span className="hint">Condiciona as mecânicas disponíveis nas ofertas (RN11).</span>
        </div>
        <div className="field">
          <label htmlFor="campo-anexo">Anexo do contrato (chave do arquivo)</label>
          <input
            id="campo-anexo"
            className="input"
            name="anexoS3Key"
            placeholder="s3://contratos/…"
            defaultValue={editando ? contrato.anexoS3Key : undefined}
          />
          <span className="hint">
            Opcional/legado. Para anexar o PDF de verdade, use o cartão “Anexo do contrato (PDF)”
            abaixo.
          </span>
        </div>
        <div className="field">
          <label htmlFor="campo-hash">Hash/código de verificação</label>
          <input
            id="campo-hash"
            className="input"
            name="hashVerificacao"
            defaultValue={editando ? contrato.hashVerificacao : undefined}
          />
          <span className="hint">Da assinatura eletrônica.</span>
        </div>
      </div>
    </FormularioComEstado>
  );
}

/** Encerrar/denunciar contrato vigente (dispara cascata RN04). */
export function AcoesContrato({
  empresaId,
  contratoId,
}: {
  empresaId: string;
  contratoId: string;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <FormularioComEstado
        acao={acaoMudarStatusContrato}
        rotuloEnviar="Denunciar contrato"
        classeBotao="btn btn-ghost btn-sm"
        confirmacao="Denunciar o contrato pausa as ofertas publicadas em cascata (RN04). Confirmar?"
      >
        <input type="hidden" name="empresaId" value={empresaId} />
        <input type="hidden" name="contratoId" value={contratoId} />
        <input type="hidden" name="novoStatus" value="DENUNCIADO" />
      </FormularioComEstado>
      <FormularioComEstado
        acao={acaoMudarStatusContrato}
        rotuloEnviar="Encerrar contrato"
        classeBotao="btn btn-ghost btn-sm"
        confirmacao="Encerrar o contrato cancela acessos e despublica em cascata (RN04). Confirmar?"
      >
        <input type="hidden" name="empresaId" value={empresaId} />
        <input type="hidden" name="contratoId" value={contratoId} />
        <input type="hidden" name="novoStatus" value="ENCERRADO" />
      </FormularioComEstado>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { ErrosDoFormulario, MensagemDeSucesso } from "../aliados/formularios";
import {
  acaoCriarPatrocinador,
  acaoEditarPatrocinador,
  type EstadoFormulario,
} from "./acoes";

/**
 * Cadastro do patrocinador (T32 e T33).
 *
 * Um formulário só para criar e editar, com a ação passada de fora: os
 * campos são idênticos, e dois componentes divergiriam na primeira coluna
 * nova.
 */

interface Valores {
  razaoSocial?: string;
  cnpj?: string;
  segmento?: string | null;
  contatoNome?: string | null;
  contatoEmail?: string | null;
  contatoTelefone?: string | null;
  responsavelComercialId?: string | null;
  observacoes?: string | null;
}

function Campos({
  valores,
  responsaveis,
}: {
  valores: Valores;
  responsaveis: ReadonlyArray<{ id: string; nome: string }>;
}) {
  return (
    <div className="g-resp form-grid">
      <div className="field form-grid-inteiro">
        <label htmlFor="pt-razao">Razão social</label>
        <input
          id="pt-razao"
          className="input"
          name="razaoSocial"
          required
          defaultValue={valores.razaoSocial ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="pt-cnpj">CNPJ</label>
        {/* CNPJ alfanumérico (IN RFB nº 2.229/2024): sem `inputMode="numeric"`,
            que esconderia as letras da raiz no teclado do celular. */}
        <input
          id="pt-cnpj"
          className="input"
          name="cnpj"
          required
          autoCapitalize="characters"
          autoComplete="off"
          defaultValue={valores.cnpj ?? ""}
          aria-describedby="pt-cnpj-ajuda"
          style={{ textTransform: "uppercase" }}
        />
        <span className="hint" id="pt-cnpj-ajuda">
          Numérico ou alfanumérico, com ou sem pontuação — a plataforma confere os dígitos
          verificadores.
        </span>
      </div>
      <div className="field">
        <label htmlFor="pt-segmento">Segmento</label>
        <input
          id="pt-segmento"
          className="input"
          name="segmento"
          defaultValue={valores.segmento ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="pt-contato-nome">Contato — nome</label>
        <input
          id="pt-contato-nome"
          className="input"
          name="contatoNome"
          defaultValue={valores.contatoNome ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="pt-contato-email">Contato — e-mail</label>
        <input
          id="pt-contato-email"
          className="input"
          type="email"
          name="contatoEmail"
          defaultValue={valores.contatoEmail ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="pt-contato-telefone">Contato — telefone</label>
        <input
          id="pt-contato-telefone"
          className="input"
          name="contatoTelefone"
          defaultValue={valores.contatoTelefone ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="pt-responsavel">Responsável comercial interno</label>
        <select
          id="pt-responsavel"
          className="input"
          name="responsavelComercialId"
          defaultValue={valores.responsavelComercialId ?? ""}
        >
          <option value="">Sem responsável designado</option>
          {responsaveis.map((responsavel) => (
            <option key={responsavel.id} value={responsavel.id}>
              {responsavel.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="field form-grid-inteiro">
        <label htmlFor="pt-obs">Observações</label>
        <textarea
          id="pt-obs"
          className="input"
          name="observacoes"
          rows={3}
          defaultValue={valores.observacoes ?? ""}
        />
      </div>
    </div>
  );
}

/** Botão + formulário de criação, aberto na própria T32. */
export function NovoPatrocinador({
  responsaveis = [],
}: {
  responsaveis?: ReadonlyArray<{ id: string; nome: string }>;
}) {
  const [aberto, definirAberto] = useState(false);
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoCriarPatrocinador,
    {},
  );

  if (!aberto) {
    return (
      <button type="button" className="btn btn-azul" onClick={() => definirAberto(true)}>
        Novo patrocinador
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: "20px 22px", width: "100%" }}>
      <h2 className="h-el" style={{ marginBottom: 12 }}>
        Novo patrocinador
      </h2>
      <ErrosDoFormulario erros={estado.erros} />
      <form action={acao}>
        <Campos valores={{}} responsaveis={responsaveis} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Cadastrando…" : "Cadastrar"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => definirAberto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

/** Formulário de edição, na aba Contrato da T33. */
export function EditarPatrocinador({
  patrocinadorId,
  valores,
  responsaveis,
}: {
  patrocinadorId: string;
  valores: Valores;
  responsaveis: ReadonlyArray<{ id: string; nome: string }>;
}) {
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoEditarPatrocinador,
    {},
  );
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <h2 className="h-el" style={{ marginBottom: 12 }}>
        Cadastro
      </h2>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      <form action={acao}>
        <input type="hidden" name="patrocinadorId" value={patrocinadorId} />
        <Campos valores={valores} responsaveis={responsaveis} />
        <button type="submit" className="btn btn-azul" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar cadastro"}
        </button>
      </form>
    </div>
  );
}

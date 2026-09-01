"use client";

import { useActionState } from "react";
import {
  type EstadoFormulario,
  acaoAtualizarAliado,
  acaoCriarAliado,
} from "./acoes";
import { ErrosDoFormulario } from "./formularios";

interface CategoriaOpcao {
  id: string;
  nome: string;
}

export interface ValoresAliado {
  empresaId?: string;
  nomeFantasia?: string;
  razaoSocial?: string | null;
  cnpj?: string | null;
  enderecoCep?: string | null;
  enderecoLogradouro?: string | null;
  enderecoNumero?: string | null;
  enderecoComplemento?: string | null;
  enderecoBairro?: string | null;
  enderecoMunicipio?: string | null;
  enderecoUf?: string | null;
  descricaoInstitucional?: string | null;
  site?: string | null;
  categoriaIds?: string[];
}

/** Formulário de identificação do aliado (criação e edição — T1/T2). */
export function FormularioAliado({
  categorias,
  ufs,
  valores,
}: {
  categorias: CategoriaOpcao[];
  ufs: Array<{ sigla: string }>;
  valores?: ValoresAliado;
}) {
  const edicao = Boolean(valores?.empresaId);
  const [estado, despachar, pendente] = useActionState<EstadoFormulario, FormData>(
    edicao ? acaoAtualizarAliado : acaoCriarAliado,
    {},
  );

  return (
    <form action={despachar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ErrosDoFormulario erros={estado.erros} />
      {edicao ? <input type="hidden" name="empresaId" value={valores!.empresaId} /> : null}

      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 14 }}>
          Identificação
        </h2>
        <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="field">
            <label htmlFor="campo-nome-fantasia">Nome fantasia (nome de exibição)</label>
            <input
              id="campo-nome-fantasia"
              className="input"
              name="nomeFantasia"
              required
              defaultValue={valores?.nomeFantasia ?? ""}
            />
            <span className="hint">É o nome que aparece na vitrine.</span>
          </div>
          <div className="field">
            <label htmlFor="campo-razao-social">Razão social</label>
            <input
              id="campo-razao-social"
              className="input"
              name="razaoSocial"
              defaultValue={valores?.razaoSocial ?? ""}
            />
            <span className="hint">Obrigatória para promover a Aliada ativa.</span>
          </div>
          <div className="field">
            <label htmlFor="campo-cnpj">CNPJ</label>
            {/* CNPJ alfanumérico (IN RFB nº 2.229/2024): a raiz pode ter
                letras, então nada de `inputMode="numeric"` (esconderia as
                letras no teclado do celular). O texto é normalizado para
                maiúsculas na validação; `textTransform` só antecipa isso na
                tela. */}
            <input
              id="campo-cnpj"
              className="input"
              name="cnpj"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="00.000.000/0000-00 ou 12.ABC.345/01DE-35"
              defaultValue={valores?.cnpj ?? ""}
              style={{ textTransform: "uppercase" }}
            />
            <span className="hint">
              Único e validado (RN08); aceita CNPJ numérico ou alfanumérico; obrigatório na promoção.
            </span>
          </div>
          <div className="field">
            <label htmlFor="campo-site">Site</label>
            <input
              id="campo-site"
              className="input"
              name="site"
              type="url"
              placeholder="https://…"
              defaultValue={valores?.site ?? ""}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="campo-descricao">Descrição institucional</label>
            <textarea
              id="campo-descricao"
              className="textarea"
              name="descricaoInstitucional"
              rows={3}
              defaultValue={valores?.descricaoInstitucional ?? ""}
            />
            <span className="hint">
              Texto curto de apresentação; obrigatório para publicar oferta (RN09).
            </span>
          </div>
          {/* F15 (RN54) — o campo "Logo (chave do arquivo)", que pedia um
              endereço no S3 de um bucket nunca provisionado, deu lugar ao
              envio do arquivo em si. O controle mora no cartão "Marca do
              aliado", fora deste formulário: envio de arquivo precisa do
              próprio <form> e formulário aninhado não existe em HTML. */}
        </div>
      </div>

      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 4 }}>
          Endereço da sede
        </h2>
        <p className="cap" style={{ margin: "0 0 14px" }}>
          Mínimo contratual — obrigatório para promover a Aliada ativa.
        </p>
        <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "140px 1fr 120px", gap: 14 }}>
          <div className="field">
            <label htmlFor="campo-cep">CEP</label>
            <input id="campo-cep" className="input" name="enderecoCep" inputMode="numeric" defaultValue={valores?.enderecoCep ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="campo-logradouro">Logradouro</label>
            <input id="campo-logradouro" className="input" name="enderecoLogradouro" defaultValue={valores?.enderecoLogradouro ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="campo-numero">Número</label>
            <input id="campo-numero" className="input" name="enderecoNumero" defaultValue={valores?.enderecoNumero ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="campo-complemento">Complemento</label>
            <input id="campo-complemento" className="input" name="enderecoComplemento" defaultValue={valores?.enderecoComplemento ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="campo-bairro">Bairro</label>
            <input id="campo-bairro" className="input" name="enderecoBairro" defaultValue={valores?.enderecoBairro ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="campo-municipio">Município</label>
            <input id="campo-municipio" className="input" name="enderecoMunicipio" defaultValue={valores?.enderecoMunicipio ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="campo-uf">UF</label>
            <select id="campo-uf" className="select" name="enderecoUf" defaultValue={valores?.enderecoUf ?? ""}>
              <option value="">—</option>
              {ufs.map((uf) => (
                <option key={uf.sigla} value={uf.sigla}>
                  {uf.sigla}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 4 }}>
          Categorias de atuação
        </h2>
        <p className="cap" style={{ margin: "0 0 14px" }}>
          Taxonomia v1 (categorias reais da vitrine); editável no Parametrizador na Onda 3.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {categorias.map((categoria) => (
            <label
              key={categoria.id}
              className="chip"
              style={{ userSelect: "none" }}
            >
              <input
                type="checkbox"
                name="categoriaIds"
                value={categoria.id}
                defaultChecked={valores?.categoriaIds?.includes(categoria.id)}
                style={{ accentColor: "var(--azul)" }}
              />
              {categoria.nome}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-azul" disabled={pendente}>
          {pendente ? "Salvando…" : edicao ? "Salvar alterações" : "Criar aliado"}
        </button>
      </div>
    </form>
  );
}

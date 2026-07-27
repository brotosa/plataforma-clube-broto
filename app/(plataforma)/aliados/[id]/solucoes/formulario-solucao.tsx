"use client";

import { useActionState, useState } from "react";
import { calcularCompletudeCard } from "@/dominio/ofertas/regras";
import type { EstadoFormulario } from "../../acoes";
import { ErrosDoFormulario } from "../../formularios";
import { acaoAtualizarSolucao, acaoCriarSolucao } from "./acoes";

interface Opcao {
  id: string;
  nome: string;
}

export interface ValoresSolucao {
  solucaoId?: string;
  nome?: string;
  descricaoCurta?: string | null;
  descricaoCompleta?: string | null;
  categoriaId?: string | null;
  imagemCardUrl?: string | null;
  linkExterno?: string | null;
  coberturaNacional?: boolean;
  perfilCliente?: string[];
  tecnologias?: string[];
  culturaIds?: string[];
  ufIds?: string[];
}

/**
 * T3 — Cadastro/edição de solução com pré-visualização do card ao vivo e
 * régua de completude (RN09). A régua usa a MESMA função de domínio da
 * publicação — o que a tela mostra é o que a regra exige.
 */
export function FormularioSolucao({
  empresaId,
  aliado,
  categorias,
  culturas,
  ufs,
  valores,
  temImagem = false,
}: {
  empresaId: string;
  aliado: { nomeFantasia: string; temMarca: boolean; logoUrl: string | null };
  categorias: Opcao[];
  culturas: Opcao[];
  ufs: Array<{ id: string; sigla: string }>;
  valores?: ValoresSolucao;
  /**
   * F17 (RN60) — a imagem do card é arquivo da plataforma e vive fora
   * deste formulário, no cartão de envio ao lado (a solução precisa
   * existir antes de receber arquivo, como o aliado precisa existir antes
   * de receber marca). Aqui ela entra só como fato, para a régua de
   * completude e a pré-visualização não mentirem.
   */
  temImagem?: boolean;
}) {
  const edicao = Boolean(valores?.solucaoId);
  const [estado, despachar, pendente] = useActionState<EstadoFormulario, FormData>(
    edicao ? acaoAtualizarSolucao : acaoCriarSolucao,
    {},
  );

  const [nome, definirNome] = useState(valores?.nome ?? "");
  const [descricaoCurta, definirDescricaoCurta] = useState(valores?.descricaoCurta ?? "");
  const [categoriaId, definirCategoriaId] = useState(valores?.categoriaId ?? "");
  const [imagemCardUrl, definirImagemCardUrl] = useState(valores?.imagemCardUrl ?? "");
  const [coberturaNacional, definirCoberturaNacional] = useState(
    valores?.coberturaNacional ?? false,
  );
  const [culturaIds, definirCulturaIds] = useState<string[]>(valores?.culturaIds ?? []);
  const [ufIds, definirUfIds] = useState<string[]>(valores?.ufIds ?? []);

  const completude = calcularCompletudeCard({
    aliado: {
      nomeFantasia: aliado.nomeFantasia,
      temMarca: aliado.temMarca,
      logoUrl: aliado.logoUrl,
    },
    solucao: {
      nome,
      descricaoCurta,
      temCategoria: Boolean(categoriaId),
      quantidadeCulturas: culturaIds.length,
      coberturaNacional,
      quantidadeUfs: ufIds.length,
      temImagem,
      imagemCardUrl,
    },
  });

  const nomeCategoria = categorias.find((categoria) => categoria.id === categoriaId)?.nome;

  function alternar(lista: string[], id: string): string[] {
    return lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id];
  }

  return (
    <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
      <form action={despachar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ErrosDoFormulario erros={estado.erros} />
        <input type="hidden" name="empresaId" value={empresaId} />
        {edicao ? <input type="hidden" name="solucaoId" value={valores!.solucaoId} /> : null}

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Identificação da solução
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field">
              <label htmlFor="campo-sol-nome">Nome da solução</label>
              <input
                id="campo-sol-nome"
                className="input"
                name="nome"
                required
                value={nome}
                onChange={(evento) => definirNome(evento.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="campo-sol-descricao-curta">Descrição curta (texto do card)</label>
              <textarea
                id="campo-sol-descricao-curta"
                className="textarea"
                name="descricaoCurta"
                rows={2}
                maxLength={140}
                value={descricaoCurta}
                onChange={(evento) => definirDescricaoCurta(evento.target.value)}
              />
              <span className="hint">{descricaoCurta.length}/140 caracteres · obrigatória para publicar (RN09).</span>
            </div>
            <div className="field">
              <label htmlFor="campo-sol-descricao-completa">Descrição completa</label>
              <textarea
                id="campo-sol-descricao-completa"
                className="textarea"
                name="descricaoCompleta"
                rows={4}
                defaultValue={valores?.descricaoCompleta ?? ""}
              />
            </div>
            <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label htmlFor="campo-sol-categoria">Categoria</label>
                <select
                  id="campo-sol-categoria"
                  className="select"
                  name="categoriaId"
                  value={categoriaId}
                  onChange={(evento) => definirCategoriaId(evento.target.value)}
                >
                  <option value="">Selecionar…</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="campo-sol-imagem">Imagem do card (chave do arquivo)</label>
                <input
                  id="campo-sol-imagem"
                  className="input"
                  name="imagemCardUrl"
                  placeholder="s3://cards/…"
                  value={imagemCardUrl}
                  onChange={(evento) => definirImagemCardUrl(evento.target.value)}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="campo-sol-link">Link externo</label>
                <input id="campo-sol-link" className="input" name="linkExterno" type="url" defaultValue={valores?.linkExterno ?? ""} />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Culturas atendidas
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {culturas.map((cultura) => (
              <label key={cultura.id} className="chip" style={{ userSelect: "none" }}>
                <input
                  type="checkbox"
                  name="culturaIds"
                  value={cultura.id}
                  checked={culturaIds.includes(cultura.id)}
                  onChange={() => definirCulturaIds((atual) => alternar(atual, cultura.id))}
                  style={{ accentColor: "var(--azul)" }}
                />
                {cultura.nome}
              </label>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Cobertura (UFs ou nacional)
          </h2>
          <label className="chip" style={{ userSelect: "none", marginBottom: 10 }}>
            <input
              type="checkbox"
              name="coberturaNacional"
              value="1"
              checked={coberturaNacional}
              onChange={(evento) => definirCoberturaNacional(evento.target.checked)}
              style={{ accentColor: "var(--azul)" }}
            />
            Cobertura nacional
          </label>
          {!coberturaNacional ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ufs.map((uf) => (
                <button
                  key={uf.id}
                  type="button"
                  className={ufIds.includes(uf.id) ? "chip chip-uf on" : "chip chip-uf"}
                  aria-pressed={ufIds.includes(uf.id)}
                  onClick={() => definirUfIds((atual) => alternar(atual, uf.id))}
                >
                  {uf.sigla}
                </button>
              ))}
            </div>
          ) : null}
          {!coberturaNacional
            ? ufIds.map((ufId) => <input key={ufId} type="hidden" name="ufIds" value={ufId} />)
            : null}
        </div>

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Qualificação (opcional)
          </h2>
          <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ font: "var(--font-body-label-bold)", marginBottom: 6 }}>
                Perfil de cliente-alvo
              </legend>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(["PEQUENO", "MEDIO", "GRANDE"] as const).map((porte) => (
                  <label key={porte} className="chip" style={{ userSelect: "none" }}>
                    <input
                      type="checkbox"
                      name="perfilCliente"
                      value={porte}
                      defaultChecked={valores?.perfilCliente?.includes(porte)}
                      style={{ accentColor: "var(--azul)" }}
                    />
                    {porte === "PEQUENO" ? "Pequeno" : porte === "MEDIO" ? "Médio" : "Grande"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="campo-sol-tecnologias">Tecnologia/diferenciais (separar por vírgula)</label>
              <input
                id="campo-sol-tecnologias"
                className="input"
                name="tecnologias"
                placeholder="IA, satélite, IoT…"
                defaultValue={valores?.tecnologias?.join(", ") ?? ""}
              />
            </div>
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Salvando…" : edicao ? "Salvar alterações" : "Criar solução"}
          </button>
        </div>
      </form>

      <aside
        aria-label="Régua de completude e pré-visualização do card"
        style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 16 }}
      >
        <div className="kpi">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Régua de completude do card (RN09)
          </div>
          <div style={{ marginTop: 10 }}>
            <span className={completude.percentual < 50 ? "compl baixa" : "compl"}>
              <span className="trk">
                <span className="fill" style={{ width: `${completude.percentual}%`, display: "block" }} />
              </span>
              <span className="pct num">{completude.percentual}%</span>
            </span>
          </div>
          <ul className="cap" style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {completude.itens.map((item) => (
              <li key={item.rotulo} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: item.ok ? "var(--verde)" : "var(--cinza)",
                    flex: "none",
                  }}
                />
                <span style={{ color: item.ok ? "var(--preto)" : undefined }}>{item.rotulo}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, marginBottom: 8 }}>
            Pré-visualização do card
          </div>
          <div className="vcard">
            <div className="img">
              {!imagemCardUrl ? (
                <span
                  className="cap"
                  style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  imagem do card pendente
                </span>
              ) : null}
              <span className="tipo">Oferta</span>
            </div>
            <div className="corpo">
              <span className="cat">{nomeCategoria ?? "Categoria pendente"}</span>
              <p className="tit">{nome || "Nome da solução"}</p>
              <span className="vend">
                Oferecido por <b>{aliado.nomeFantasia}</b>
              </span>
              <span className="cap">{descricaoCurta || "Descrição curta do card…"}</span>
            </div>
          </div>
          <p className="cap" style={{ margin: "8px 0 0", maxWidth: 300 }}>
            O preço/benefício aparece no card quando a oferta é criada (T5).
          </p>
        </div>
      </aside>
    </div>
  );
}

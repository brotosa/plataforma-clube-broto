import {
  type ConteudoDossie,
  SECOES_DOSSIE,
  SEM_INFORMACAO_PUBLICA,
} from "@/dominio/dossie/schema";

/**
 * Leitura das dez etapas do dossiê (T11), com **fonte por afirmação** e
 * "Não foi encontrada informação pública" onde faltar. As seções são as do
 * template versionado (resumo, perfil, produtos, impacto, mercado,
 * concorrência, SWOT, gaps, roteiro, fechamento) — o protótipo v6.1 traz
 * dez seções ilustrativas marcadas "seções conforme ScoutCB — a
 * confirmar", e a ficha manda o template vencer.
 */

const AUSENTE = SEM_INFORMACAO_PUBLICA.toLocaleLowerCase("pt-BR");

/** Ausência de dado tem forma própria: itálico, sem fonte, nunca em branco. */
function Valor({ texto }: { texto: string }) {
  const ausente = texto.trim().toLocaleLowerCase("pt-BR") === AUSENTE;
  if (ausente) {
    return <span style={{ fontStyle: "italic" }}>{SEM_INFORMACAO_PUBLICA}</span>;
  }
  return <>{texto}</>;
}

function ehUrl(texto: string): boolean {
  return /^https?:\/\//i.test(texto.trim());
}

/** Fonte citada: vira link quando é URL; caso contrário, texto. */
function Fonte({ texto, prefixo = "fonte: " }: { texto: string; prefixo?: string }) {
  if (texto.trim().toLocaleLowerCase("pt-BR") === AUSENTE) {
    return <span style={{ fontStyle: "italic" }}>sem fonte pública</span>;
  }
  if (ehUrl(texto)) {
    return (
      <a href={texto} target="_blank" rel="noreferrer noopener">
        {prefixo}
        {texto}
      </a>
    );
  }
  return (
    <>
      {prefixo}
      {texto}
    </>
  );
}

function ListaDeFontes({ fontes }: { fontes: ReadonlyArray<string> }) {
  if (fontes.length === 0) {
    return <span style={{ fontStyle: "italic" }}>sem fonte citada</span>;
  }
  return (
    <>
      {fontes.map((fonte, indice) => (
        <span key={`${fonte}-${indice}`}>
          {indice > 0 ? " · " : null}
          <Fonte texto={fonte} prefixo="" />
        </span>
      ))}
    </>
  );
}

function Secao({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`secao-${numero}`}>
      <h3
        id={`secao-${numero}`}
        style={{ font: "var(--font-body-label-bold)", color: "var(--preto)", margin: 0 }}
      >
        {numero} · {titulo}
      </h3>
      <div className="cap" style={{ marginTop: 4 }}>
        {children}
      </div>
    </section>
  );
}

function ListaSimples({ itens, vazio }: { itens: ReadonlyArray<string>; vazio: string }) {
  if (itens.length === 0) {
    return <span style={{ fontStyle: "italic" }}>{vazio}</span>;
  }
  return (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
      {itens.map((item, indice) => (
        <li key={`${item}-${indice}`}>
          <Valor texto={item} />
        </li>
      ))}
    </ul>
  );
}

export function LeituraDoDossie({ conteudo }: { conteudo: ConteudoDossie }) {
  const titulo = (chave: string) =>
    SECOES_DOSSIE.find((secao) => secao.chave === chave)!;

  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2 className="h-el">Dossiê público — 10 seções</h2>
        <span className="cap">fontes citadas por afirmação, conforme o template do ScoutCB</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          fontSize: 13.5,
          maxWidth: "80ch",
        }}
      >
        <Secao {...titulo("resumo_executivo")}>
          <Valor texto={conteudo.resumo_executivo} />
        </Secao>

        <Secao {...titulo("perfil")}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp" style={{ marginTop: 6 }}>
              <caption className="sr-oculto">
                Indicadores do perfil da empresa, com valor, fonte e grau de confiança
              </caption>
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Fonte</th>
                  <th scope="col">Confiança</th>
                </tr>
              </thead>
              <tbody>
                {conteudo.perfil.map((linha, indice) => (
                  <tr key={`${linha.indicador}-${indice}`}>
                    <td data-label="Indicador">{linha.indicador}</td>
                    <td data-label="Valor">
                      <Valor texto={linha.valor} />
                    </td>
                    <td data-label="Fonte">
                      <Fonte texto={linha.fonte} prefixo="" />
                    </td>
                    <td data-label="Confiança">{linha.confianca}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao {...titulo("produtos")}>
          {conteudo.produtos.length === 0 ? (
            <span style={{ fontStyle: "italic" }}>{SEM_INFORMACAO_PUBLICA}</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {conteudo.produtos.map((produto, indice) => (
                <div
                  key={`${produto.nome}-${indice}`}
                  style={{
                    border: "1px solid var(--borda)",
                    borderRadius: "var(--r-md)",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ font: "var(--font-body-label-bold)", color: "var(--preto)" }}>
                    {produto.nome}
                  </div>
                  <dl style={{ margin: "6px 0 0", display: "grid", gap: 3 }}>
                    {(
                      [
                        ["Descrição", produto.descricao],
                        ["Problema resolvido", produto.problema],
                        ["Público-alvo", produto.publico],
                        ["Preço", produto.preco],
                        ["Modelo de cobrança", produto.cobranca],
                        ["Integrações", produto.integracoes],
                        ["Tecnologias", produto.tecnologias],
                        ["Diferenciais", produto.diferenciais],
                      ] as const
                    ).map(([rotulo, valor]) => (
                      <div key={rotulo} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <dt style={{ fontWeight: 600 }}>{rotulo}:</dt>
                        <dd style={{ margin: 0 }}>
                          <Valor texto={valor} />
                        </dd>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <dt style={{ fontWeight: 600 }}>Fontes:</dt>
                      <dd style={{ margin: 0 }}>
                        <ListaDeFontes fontes={produto.fontes} />
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </Secao>

        <Secao {...titulo("impacto_produtor")}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp" style={{ marginTop: 6 }}>
              <caption className="sr-oculto">
                Indicadores de impacto para o produtor, com valor, estudo de caso e fonte
              </caption>
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Estudo de caso</th>
                  <th scope="col">Fonte</th>
                </tr>
              </thead>
              <tbody>
                {conteudo.impacto_produtor.map((linha, indice) => (
                  <tr key={`${linha.indicador}-${indice}`}>
                    <td data-label="Indicador">{linha.indicador}</td>
                    <td data-label="Valor">
                      <Valor texto={linha.valor} />
                    </td>
                    <td data-label="Estudo de caso">
                      <Valor texto={linha.estudo_de_caso} />
                    </td>
                    <td data-label="Fonte">
                      <Fonte texto={linha.fonte} prefixo="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao {...titulo("mercado")}>
          <div style={{ display: "grid", gap: 6 }}>
            <div>
              <b>Clientes:</b>
              <ListaSimples itens={conteudo.mercado.clientes} vazio={SEM_INFORMACAO_PUBLICA} />
            </div>
            <div>
              <b>Parceiros:</b>
              <ListaSimples itens={conteudo.mercado.parceiros} vazio={SEM_INFORMACAO_PUBLICA} />
            </div>
            <div>
              <Valor texto={conteudo.mercado.observacoes} />
            </div>
            <div>
              <ListaDeFontes fontes={conteudo.mercado.fontes} />
            </div>
          </div>
        </Secao>

        <Secao {...titulo("concorrencia")}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp" style={{ marginTop: 6 }}>
              <caption className="sr-oculto">Concorrentes comparados, com fontes</caption>
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col">Comparação</th>
                  <th scope="col">Fontes</th>
                </tr>
              </thead>
              <tbody>
                {conteudo.concorrencia.map((linha, indice) => (
                  <tr key={`${linha.empresa}-${indice}`}>
                    <td data-label="Empresa">{linha.empresa}</td>
                    <td data-label="Comparação">
                      <Valor texto={linha.comparacao} />
                    </td>
                    <td data-label="Fontes">
                      <ListaDeFontes fontes={linha.fontes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao {...titulo("swot")}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
              marginTop: 4,
            }}
          >
            {(
              [
                ["Forças", conteudo.swot.forcas],
                ["Fraquezas", conteudo.swot.fraquezas],
                ["Oportunidades", conteudo.swot.oportunidades],
                ["Ameaças", conteudo.swot.ameacas],
              ] as const
            ).map(([rotulo, itens]) => (
              <div
                key={rotulo}
                style={{
                  border: "1px solid var(--borda)",
                  borderRadius: "var(--r-md)",
                  padding: "10px 12px",
                }}
              >
                <div style={{ font: "var(--font-body-label-bold)", color: "var(--preto)" }}>
                  {rotulo}
                </div>
                <ListaSimples itens={itens} vazio="sem evidência pública" />
              </div>
            ))}
          </div>
        </Secao>

        <Secao {...titulo("gaps")}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp" style={{ marginTop: 6 }}>
              <caption className="sr-oculto">
                Lacunas da pesquisa, com importância e pergunta sugerida
              </caption>
              <thead>
                <tr>
                  <th scope="col">Informação não encontrada</th>
                  <th scope="col">Importância</th>
                  <th scope="col">Pergunta sugerida</th>
                </tr>
              </thead>
              <tbody>
                {conteudo.gaps.map((linha, indice) => (
                  <tr key={`${linha.informacao}-${indice}`}>
                    <td data-label="Informação não encontrada">{linha.informacao}</td>
                    <td data-label="Importância">{linha.importancia}</td>
                    <td data-label="Pergunta sugerida">{linha.pergunta_sugerida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao {...titulo("roteiro_reuniao")}>
          <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {conteudo.roteiro_reuniao.map((pergunta, indice) => (
              <li key={`${indice}-${pergunta.slice(0, 24)}`}>{pergunta}</li>
            ))}
          </ol>
        </Secao>

        <Secao {...titulo("fechamento")}>
          <Valor texto={conteudo.fechamento} />
        </Secao>

        <section aria-labelledby="secao-fontes">
          <h3
            id="secao-fontes"
            style={{ font: "var(--font-body-label-bold)", color: "var(--preto)", margin: 0 }}
          >
            Fontes consultadas
          </h3>
          <div className="cap" style={{ marginTop: 4 }}>
            <ListaSimples
              itens={conteudo.fontes_consultadas}
              vazio="nenhuma fonte listada — confira a origem das afirmações"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

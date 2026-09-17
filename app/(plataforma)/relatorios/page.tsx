import { redirect } from "next/navigation";

import { auth } from "@/infra/auth";
import type { AssuntoRelatorio } from "@/dominio/relatorios/catalogo";
import {
  abrirRelatorio,
  assuntosVisiveis,
  listarRelatorios,
} from "@/infra/casos-de-uso/relatorios";
import { Construtor, type AssuntoSerializado } from "./construtor";
import { SeguidorDeHalo } from "./halo";
import { identidadeDoAssunto, relatoriosProntos } from "./identidade";

/**
 * T36 — Gerador de relatórios (Onda 16, ficha §4).
 *
 * Uma rota só, em dois estados: sem `?assunto=`, a abertura com os cartões
 * de assunto e as três prateleiras; com ele, o construtor.
 *
 * **A navegação entre os dois muda só a query string, então usa âncora
 * nativa** — convenção da casa, e a cerca `navegacao-por-query` cobra. Com
 * `<Link>`, o Router Cache pode servir a mesma rota sem ida ao servidor, e
 * esta página lê `searchParams` no servidor: o clique seria engolido e a URL
 * não mudaria. Está medido em outras telas; aqui se adota de saída em vez de
 * descobrir depois.
 *
 * **O que esta tela NÃO faz:** decidir o que cada pessoa alcança. Ela pede
 * `assuntosVisiveis` ao caso de uso e desenha o que voltar. Assunto fora do
 * alcance não aparece — sem cadeado e sem "peça acesso" (RN76).
 */

export const dynamic = "force-dynamic";

/**
 * O assunto atravessa para o cliente sem a parte que é do servidor: as
 * expressões SQL dos campos e as junções ficam para trás.
 *
 * **Não é otimização, é desenho.** O navegador não tem o que fazer com
 * `e.nome_fantasia`, e mandar o mapa de junções junto publicaria o esquema
 * do banco a quem abrir o inspetor — sem explorar nada, só por descuido de
 * serialização. O cliente manda chaves; quem as traduz é o compilador, no
 * servidor.
 */
function serializar(assunto: AssuntoRelatorio): AssuntoSerializado {
  return {
    slug: assunto.slug,
    rotulo: assunto.rotulo,
    descricao: assunto.descricao,
    contemDadoPessoal: assunto.contemDadoPessoal,
    campos: assunto.campos.map((campo) => ({
      slug: campo.slug,
      rotulo: campo.rotulo,
      grupo: campo.grupo,
      tipo: campo.tipo,
      operadores: [...campo.operadores],
      agregacoes: [...campo.agregacoes],
      ...(campo.valores ? { valores: campo.valores.map((opcao) => ({ ...opcao })) } : {}),
      ...(campo.indisponivel ? { indisponivel: campo.indisponivel } : {}),
    })),
    modelos: assunto.modelos.map((modelo) => ({
      slug: modelo.slug,
      nome: modelo.nome,
      descricao: modelo.descricao,
      definicao: {
        linhas: [...modelo.definicao.linhas],
        colunas: [...modelo.definicao.colunas],
        valores: modelo.definicao.valores.map((valor) => ({ ...valor })),
        filtros: modelo.definicao.filtros.map((filtro) => ({
          ...filtro,
          valores: [...filtro.valores],
        })),
      },
    })),
  };
}

export default async function PaginaDeRelatorios({
  searchParams,
}: {
  searchParams: Promise<{ assunto?: string; relatorio?: string; modelo?: string }>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const ator = { id: sessao.user.id, papel: sessao.user.papel };
  const parametros = await searchParams;
  const visiveis = assuntosVisiveis(ator.papel);

  if (visiveis.length === 0) {
    return (
      <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
        <h1 className="h-page">Gerador de relatórios</h1>
        <p className="aviso-inline" role="status" style={{ marginTop: 14 }}>
          Seu papel ainda não alcança nenhum assunto de relatório. O Gerador não amplia o que
          você já vê na plataforma — ele reorganiza.
        </p>
      </div>
    );
  }

  if (parametros.relatorio) {
    const salvo = await abrirRelatorio(ator, parametros.relatorio);
    const assunto = visiveis.find((item) => item.slug === salvo.definicao.assunto);
    if (assunto) {
      return (
        <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
          <h1 className="h-page">{salvo.nome}</h1>
          <div className="cap" style={{ margin: "4px 0 18px" }}>
            {assunto.rotulo} · <a href="/relatorios">voltar à galeria</a>
          </div>
          <Construtor
            assunto={serializar(assunto)}
            inicial={{
              linhas: salvo.definicao.linhas,
              colunas: salvo.definicao.colunas,
              valores: salvo.definicao.valores.map((valor) => ({ ...valor })),
              filtros: salvo.definicao.filtros.map((filtro) => ({
                ...filtro,
                valores: [...filtro.valores],
              })),
            }}
            relatorioAberto={{ id: salvo.id, nome: salvo.nome, meu: salvo.meu }}
          />
        </div>
      );
    }
  }

  const assuntoEscolhido = parametros.assunto
    ? visiveis.find((item) => item.slug === parametros.assunto)
    : undefined;

  if (assuntoEscolhido) {
    /*
     * `?modelo=` abre o construtor com o relatório pronto JÁ APLICADO — é o
     * que faz o cartão da abertura entregar um número em um clique, em vez de
     * levar a pessoa a uma tela onde ela ainda teria de achar o mesmo modelo.
     *
     * Slug desconhecido não é erro: abre o construtor vazio. A alternativa
     * seria uma tela de falha por causa de um link velho — e o que a pessoa
     * queria, montar um relatório daquele assunto, continua perfeitamente
     * possível.
     */
    const modelo = parametros.modelo
      ? assuntoEscolhido.modelos.find((item) => item.slug === parametros.modelo)
      : undefined;

    return (
      <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
        <h1 className="h-page">{modelo ? modelo.nome : assuntoEscolhido.rotulo}</h1>
        <div className="cap" style={{ margin: "4px 0 18px" }}>
          {modelo ? `${assuntoEscolhido.rotulo} · ${modelo.descricao}` : assuntoEscolhido.descricao}{" "}
          · <a href="/relatorios">trocar de assunto</a>
        </div>
        <Construtor
          assunto={serializar(assuntoEscolhido)}
          {...(modelo
            ? {
                inicial: {
                  linhas: [...modelo.definicao.linhas],
                  colunas: [...modelo.definicao.colunas],
                  valores: modelo.definicao.valores.map((valor) => ({ ...valor })),
                  filtros: modelo.definicao.filtros.map((filtro) => ({
                    ...filtro,
                    valores: [...filtro.valores],
                  })),
                },
              }
            : {})}
        />
      </div>
    );
  }

  const { meus, doTime } = await listarRelatorios(ator);
  const prontos = relatoriosProntos(visiveis);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <h1 className="h-page">Gerador de relatórios</h1>
      <div className="cap" style={{ margin: "4px 0 22px", maxWidth: "88ch" }}>
        Comece por um relatório pronto, ou escolha um assunto e monte a pergunta. O Gerador não
        acrescenta dado nenhum — ele reorganiza o que a plataforma já tem, com o que o seu papel
        alcança.
      </div>

      <section aria-labelledby="titulo-assuntos" style={{ marginBottom: 24 }}>
        <h2 id="titulo-assuntos" className="h-el">
          Assuntos
        </h2>
        {/* O halo vive aqui dentro; sem JavaScript, os cartões seguem inteiros. */}
        <SeguidorDeHalo alvo=".rel-assuntos" />
        <div className="rel-assuntos">
          {visiveis.map((assunto) => {
            const identidade = identidadeDoAssunto(assunto.slug);
            const usaveis = assunto.campos.filter((campo) => !campo.indisponivel).length;
            return (
              <a
                key={assunto.slug}
                className="rel-assunto"
                href={`/relatorios?assunto=${encodeURIComponent(assunto.slug)}`}
                style={
                  {
                    "--tom": identidade.cor,
                    "--tom-claro": identidade.corClara,
                  } as React.CSSProperties
                }
              >
                <span className="rel-assunto-ic" aria-hidden="true">
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={identidade.icone} />
                  </svg>
                </span>
                <h3>{assunto.rotulo}</h3>
                <p>{assunto.descricao}</p>
                {/*
                 * A contagem de campos é o dado que responde "dá para
                 * perguntar o que eu preciso com este aqui?" — a dúvida real
                 * de quem escolhe. Sai do próprio catálogo, e os
                 * indisponíveis (RN77) ficam de fora: prometer um campo que
                 * não pode ser usado seria pior que não prometer nada.
                 */}
                <span className="rel-assunto-pe">
                  <span>{usaveis} campos</span>
                  <span className="rel-assunto-seta" aria-hidden="true">
                    →
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {prontos.length > 0 ? (
        <section aria-labelledby="titulo-prontos" style={{ marginBottom: 24 }}>
          <h2 id="titulo-prontos" className="h-el">
            Relatórios prontos
          </h2>
          <div className="cap" style={{ margin: "2px 0 12px", maxWidth: "88ch" }}>
            Perguntas que a plataforma já sabe responder. Abrem no construtor com tudo montado —
            dá para mudar o que quiser depois.
          </div>
          <div className="rel-prontos">
            {prontos.map((pronto) => (
              <a
                key={`${pronto.assuntoSlug}/${pronto.modeloSlug}`}
                className="rel-pronto"
                href={`/relatorios?assunto=${encodeURIComponent(
                  pronto.assuntoSlug,
                )}&modelo=${encodeURIComponent(pronto.modeloSlug)}`}
                style={
                  {
                    "--tom": pronto.identidade.cor,
                    "--tom-claro": pronto.identidade.corClara,
                  } as React.CSSProperties
                }
              >
                <span className="rel-pronto-et">{pronto.identidade.curto}</span>
                <h3>{pronto.nome}</h3>
                <p>{pronto.descricao}</p>
              </a>
            ))}
            <a className="rel-montar" href={`/relatorios?assunto=${visiveis[0]!.slug}`}>
              + Montar do zero
            </a>
          </div>
        </section>
      ) : null}

      <Prateleira
        titulo="Meus relatórios"
        vazia="Você ainda não salvou nenhum relatório. Monte um e dê um nome a ele."
        itens={meus}
      />
      <Prateleira
        titulo="Do time"
        vazia="Ninguém compartilhou relatório com o time ainda."
        itens={doTime}
      />
    </div>
  );
}

function Prateleira({
  titulo,
  vazia,
  itens,
}: {
  titulo: string;
  vazia: string;
  itens: ReadonlyArray<{
    id: string;
    nome: string;
    assuntoRotulo: string;
    resumo: string;
    autorNome: string;
    atualizadoEm: Date;
  }>;
}) {
  return (
    <section aria-labelledby={`titulo-${titulo}`} style={{ marginBottom: 24 }}>
      <h2 id={`titulo-${titulo}`} className="h-el">
        {titulo}
      </h2>
      {itens.length === 0 ? (
        <p className="rel-gaveta-vazia">{vazia}</p>
      ) : (
        /*
         * Classe própria, e não a dos assuntos. Elas eram a mesma até aqui, e
         * a Mescla A separou os caminhos: o cartão de assunto passou a ter
         * halo, ícone e cor vinda do catálogo. Um relatório salvo não tem cor
         * nenhuma — reusar a classe deixaria `--tom` sem valor, e o
         * `border-color:var(--tom)` do hover simplesmente não aplicaria,
         * silenciosamente, como todo valor inválido em CSS.
         */
        <div className="rel-salvos">
          {itens.map((item) => (
            <a
              key={item.id}
              className="rel-salvo"
              href={`/relatorios?relatorio=${encodeURIComponent(item.id)}`}
            >
              <h3>{item.nome}</h3>
              <p>{item.resumo}</p>
              <p style={{ marginTop: 6 }}>
                {item.assuntoRotulo} · {item.autorNome} ·{" "}
                {item.atualizadoEm.toLocaleDateString("pt-BR")}
              </p>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

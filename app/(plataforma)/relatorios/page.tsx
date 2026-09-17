import { redirect } from "next/navigation";

import { auth } from "@/infra/auth";
import type { AssuntoRelatorio } from "@/dominio/relatorios/catalogo";
import {
  abrirRelatorio,
  assuntosVisiveis,
  listarRelatorios,
} from "@/infra/casos-de-uso/relatorios";
import { Construtor, type AssuntoSerializado } from "./construtor";

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
  searchParams: Promise<{ assunto?: string; relatorio?: string }>;
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
      <>
        <h1 className="h1">Gerador de relatórios</h1>
        <p className="aviso-inline" role="status">
          Seu papel ainda não alcança nenhum assunto de relatório. O Gerador não amplia o que
          você já vê na plataforma — ele reorganiza.
        </p>
      </>
    );
  }

  if (parametros.relatorio) {
    const salvo = await abrirRelatorio(ator, parametros.relatorio);
    const assunto = visiveis.find((item) => item.slug === salvo.definicao.assunto);
    if (assunto) {
      return (
        <>
          <h1 className="h1">{salvo.nome}</h1>
          <p className="sub">
            {assunto.rotulo} ·{" "}
            <a href="/relatorios">voltar à galeria</a>
          </p>
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
        </>
      );
    }
  }

  const assuntoEscolhido = parametros.assunto
    ? visiveis.find((item) => item.slug === parametros.assunto)
    : undefined;

  if (assuntoEscolhido) {
    return (
      <>
        <h1 className="h1">{assuntoEscolhido.rotulo}</h1>
        <p className="sub">
          {assuntoEscolhido.descricao} · <a href="/relatorios">trocar de assunto</a>
        </p>
        <Construtor assunto={serializar(assuntoEscolhido)} />
      </>
    );
  }

  const { meus, doTime } = await listarRelatorios(ator);

  return (
    <>
      <h1 className="h1">Gerador de relatórios</h1>
      <p className="sub">
        Escolha um assunto e monte a pergunta. O Gerador não acrescenta dado nenhum — ele
        reorganiza o que a plataforma já tem, com o que o seu papel alcança.
      </p>

      <section aria-labelledby="titulo-assuntos" style={{ marginBottom: 24 }}>
        <h2 id="titulo-assuntos" className="h2">
          Assuntos
        </h2>
        <div className="rel-assuntos">
          {visiveis.map((assunto) => (
            <a
              key={assunto.slug}
              className="rel-assunto"
              href={`/relatorios?assunto=${encodeURIComponent(assunto.slug)}`}
            >
              <h3>{assunto.rotulo}</h3>
              <p>{assunto.descricao}</p>
            </a>
          ))}
        </div>
      </section>

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
    </>
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
      <h2 id={`titulo-${titulo}`} className="h2">
        {titulo}
      </h2>
      {itens.length === 0 ? (
        <p className="rel-gaveta-vazia">{vazia}</p>
      ) : (
        <div className="rel-assuntos">
          {itens.map((item) => (
            <a
              key={item.id}
              className="rel-assunto"
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

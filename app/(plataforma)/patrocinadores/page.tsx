import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { rotularVigencia, type SaldoDePatrocinio } from "@/dominio/patrocinio/saldo";
import {
  listarPatrocinadores,
  type LeituraDoPatrocinador,
} from "@/infra/consultas/patrocinadores";
import { NovoPatrocinador } from "./formulario-patrocinador";

/**
 * T32 — Lista de patrocinadores.
 *
 * Nome, CNPJ, status, vigência com selo, adquiridas × ativadas × saldo e
 * campanhas ativas. A linha abre a T33.
 *
 * **Os três números da coluna de vagas nunca são compostos aqui**: vêm do
 * `saldo` que a consulta única já derivou (RN62). A tela formata, não
 * calcula — inclusive a ausência, que chega como estado e vira traço com
 * motivo, jamais zero.
 *
 * **Contrato visual:** a ficha da Onda 12 aponta o protótipo v11.2, que
 * não está em `docs/referencias/` (o mais recente no repositório é o
 * v10.1). Esta tela foi montada a partir da ficha §5 e reusa os
 * componentes existentes — `tbl`, `pill`, `cap`, `num` —, sem classe
 * paralela. A conferência visual contra o v11.2 é trabalho pendente.
 */

export const dynamic = "force-dynamic";

function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function classeDaVigencia(estado: string): string {
  if (estado === "VENCIDA") return "pill pill-erro";
  if (estado === "VENCENDO") return "pill pill-warn";
  if (estado === "NAO_DECLARADA") return "pill pill-pendente";
  return "pill pill-ok";
}

/**
 * A célula de vagas. Estado indisponível **não** vira zero: vira traço com
 * o motivo à vista, que é o que a RN62 manda e o que a planilha não fazia.
 */
export function CelulaDeVagas({ saldo }: { saldo: SaldoDePatrocinio }) {
  if (saldo.estado === "INDISPONIVEL") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="num" aria-hidden="true">
          —
        </span>
        <span className="cap">{saldo.motivo}</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="num">
        {saldo.adquiridas.toLocaleString("pt-BR")} × {saldo.ativadas.toLocaleString("pt-BR")} ={" "}
        <strong>{saldo.saldo.toLocaleString("pt-BR")}</strong>
      </span>
      <span className="cap">
        adquiridas × ativadas = saldo
        {saldo.excedido ? " · vínculos vigentes acima do contratado" : ""}
      </span>
    </div>
  );
}

function LinhaDoPatrocinador({ patrocinador }: { patrocinador: LeituraDoPatrocinador }) {
  return (
    <tr>
      <td data-label="Patrocinador">
        <Link
          href={`/patrocinadores/${patrocinador.id}`}
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <span style={{ fontWeight: 600 }}>{patrocinador.razaoSocial}</span>
          <span className="cap num">{formatarCnpj(patrocinador.cnpj)}</span>
        </Link>
      </td>
      <td data-label="Status">
        <span className={patrocinador.status === "ATIVO" ? "pill pill-ok" : "pill pill-neutra"}>
          <i />
          {patrocinador.status === "ATIVO" ? "ativo" : "encerrado"}
        </span>
      </td>
      <td data-label="Vigência">
        <span className={classeDaVigencia(patrocinador.vigencia.estado)}>
          <i />
          {rotularVigencia(patrocinador.vigencia)}
        </span>
      </td>
      <td data-label="Vagas">
        <CelulaDeVagas saldo={patrocinador.saldo} />
      </td>
      <td data-label="Campanhas" className="num" style={{ textAlign: "right" }}>
        {patrocinador.campanhasAtivas > 0 ? (
          <>
            {patrocinador.campanhasAtivas}
            <span className="cap"> de {patrocinador.campanhasTotais}</span>
          </>
        ) : patrocinador.campanhasTotais > 0 ? (
          <span className="cap">nenhuma ativa</span>
        ) : (
          <span className="cap">sem campanha</span>
        )}
      </td>
    </tr>
  );
}

export default async function PaginaPatrocinadores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const parametros = await searchParams;
  const busca = typeof parametros.busca === "string" ? parametros.busca : "";
  const statusBruto = typeof parametros.status === "string" ? parametros.status : "TODOS";
  const status = statusBruto === "ATIVO" || statusBruto === "ENCERRADO" ? statusBruto : "TODOS";
  const apenasAlerta = parametros.alerta === "1";

  const podeGerir = podeExecutar(sessao.user.papel, "GERIR_PATROCINADORES");

  let patrocinadores: LeituraDoPatrocinador[] = [];
  let erroConsulta = false;
  try {
    patrocinadores = await listarPatrocinadores({
      busca,
      status,
      apenasVigenciaEmAlerta: apenasAlerta,
    });
  } catch {
    erroConsulta = true;
  }

  /**
   * Os filtros são âncoras nativas, não `<Link>` — convenção do CLAUDE.md
   * para navegação que altera apenas a query string. A cerca de
   * `infra/arquitetura/navegacao-por-query.test.ts` cobre esta tela.
   */
  const comFiltro = (mudanca: Record<string, string | null>) => {
    const query = new URLSearchParams();
    const atual: Record<string, string> = {
      ...(busca === "" ? {} : { busca }),
      ...(status === "TODOS" ? {} : { status }),
      ...(apenasAlerta ? { alerta: "1" } : {}),
    };
    for (const [chave, valor] of Object.entries({ ...atual, ...mudanca })) {
      if (valor !== null && valor !== "") query.set(chave, valor);
    }
    const texto = query.toString();
    return texto === "" ? "/patrocinadores" : `/patrocinadores?${texto}`;
  };

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Patrocinadores</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Empresas que compram assinaturas do Clube para os próprios clientes
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeGerir ? <NovoPatrocinador /> : null}
      </div>

      <form
        method="get"
        action="/patrocinadores"
        className="card"
        style={{
          padding: "14px 18px",
          marginBottom: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div className="field" style={{ flex: "1 1 260px", marginBottom: 0 }}>
          <label htmlFor="busca-patrocinador">Buscar por razão social ou CNPJ</label>
          <input
            id="busca-patrocinador"
            className="input"
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Ex.: Yamer, ou 11.222.333/0001-81"
          />
        </div>
        {status !== "TODOS" ? <input type="hidden" name="status" value={status} /> : null}
        {apenasAlerta ? <input type="hidden" name="alerta" value="1" /> : null}
        <button type="submit" className="btn btn-azul">
          Buscar
        </button>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {(
            [
              { rotulo: "Todos", valor: "TODOS" },
              { rotulo: "Ativos", valor: "ATIVO" },
              { rotulo: "Encerrados", valor: "ENCERRADO" },
            ] as const
          ).map((opcao) => (
            <a
              key={opcao.valor}
              href={comFiltro({ status: opcao.valor === "TODOS" ? null : opcao.valor })}
              className={status === opcao.valor ? "chip on" : "chip"}
              aria-current={status === opcao.valor ? "true" : undefined}
            >
              {opcao.rotulo}
            </a>
          ))}
          <a
            href={comFiltro({ alerta: apenasAlerta ? null : "1" })}
            className={apenasAlerta ? "chip chip-alerta on" : "chip"}
            /* `aria-current`, não `aria-pressed`: o chip é um link de
               filtro, e `aria-pressed` não vale no papel `link` — o axe
               reprova, e o leitor de tela anuncia errado. */
            aria-current={apenasAlerta ? "true" : undefined}
          >
            Vigência em alerta
          </a>
        </div>
      </form>

      {erroConsulta ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Não foi possível carregar os patrocinadores</h2>
            <p className="cap" style={{ maxWidth: "44ch", margin: 0 }}>
              Os contratos seguem valendo — só a listagem falhou. O detalhe ficou no log do
              servidor.
            </p>
          </div>
        </div>
      ) : patrocinadores.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">
              {busca === "" && status === "TODOS" && !apenasAlerta
                ? "Nenhum patrocinador cadastrado"
                : "Nenhum patrocinador com estes filtros"}
            </h2>
            <p className="cap" style={{ maxWidth: "50ch", margin: 0 }}>
              {busca === "" && status === "TODOS" && !apenasAlerta
                ? "Um patrocinador é a empresa que compra assinaturas do Clube para dar aos próprios clientes. O contrato, a minuta e os vínculos ficam na ficha dele."
                : "Ajuste a busca ou os filtros acima."}
            </p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl tbl-resp">
            <caption className="sr-oculto">
              Patrocinadores com status, vigência do contrato, vagas adquiridas × ativadas ={" "}
              saldo e campanhas ativas
            </caption>
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Patrocinador</th>
                <th>Status</th>
                <th>Vigência</th>
                <th style={{ width: "28%" }}>Vagas</th>
                <th style={{ textAlign: "right" }}>Campanhas</th>
              </tr>
            </thead>
            <tbody>
              {patrocinadores.map((patrocinador) => (
                <LinhaDoPatrocinador key={patrocinador.id} patrocinador={patrocinador} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

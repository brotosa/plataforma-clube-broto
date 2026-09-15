"use client";

import { useActionState, useId, useMemo, useState } from "react";
import type { Papel } from "@prisma/client";
import { ROTULOS_PAPEL } from "@/dominio/autorizacao/papeis";
import { podeExecutar, temAcessoTotal } from "@/dominio/autorizacao/permissoes";
import { MENSAGEM_ULTIMO_ADMINISTRADOR } from "@/dominio/usuarios/regras";
import type { LinhaUsuario } from "@/infra/consultas/usuarios";
import { ErrosDoFormulario, MensagemDeSucesso } from "../aliados/formularios";
import {
  acaoAtualizarUsuario,
  acaoCriarUsuario,
  acaoInativarUsuario,
  acaoReativarUsuario,
  acaoExigirNovaSenha,
  acaoEncerrarSessoes,
  acaoRedefinirCredencial,
  type EstadoUsuarios,
} from "./acoes";

/**
 * T27 — Usuários, fiel ao protótipo v8.1 FINAL: tabela responsiva com
 * papel, situação e ações por linha; formulário de criação e edição; e o
 * aviso de somente leitura para quem não é Administrador.
 *
 * A RN46 aparece duas vezes de propósito. Aqui, desabilitando "Inativar" no
 * último administrador ativo com o motivo no `title` — recusar depois do
 * clique é pior experiência do que dizer antes. E no serviço, que recusa de
 * todo jeito: a UI é conveniência, não é a garantia.
 */

/*
 * Ordem do seletor de papel. `ADMIN` entra ao lado do
 * `ADMINISTRADOR_PLATAFORMA` porque os dois são de administração e a escolha
 * entre eles é a que exige comparação — o acesso total fica por último, que é
 * onde a atribuição mais pesada deve estar.
 */
const PAPEIS: ReadonlyArray<Papel> = [
  "GESTOR",
  "ANALISTA",
  "ANALISTA_SCOUT",
  "COMERCIAL",
  "APROVADOR",
  "LEITURA",
  "ADMIN",
  "ADMINISTRADOR_PLATAFORMA",
];

/**
 * A pílula da coluna Papel, em três degraus.
 *
 * `pill-neutra` para quem não administra · `pill-info` para o **Administrador**
 * · `pill-info pill-total`, com ponto e borda firme, para o **Administrador da
 * Plataforma**, que pode toda ação.
 *
 * Os dois papéis de administração ficam na mesma família de cor de propósito:
 * ambos administram, e o que os separa é **quanto** podem — grau, não espécie.
 *
 * Escrito por capacidade, e não pelo nome do papel. Antes da Onda 15 a regra
 * era `papel === "ADMINISTRADOR_PLATAFORMA" ? azul : cinza`, escrita quando
 * esse nome designava o administrador comum. A renomeação a deixou **certa por
 * coincidência** — o azul passou a marcar o acesso total, que é mesmo o que
 * merece destaque, mas por acidente — e, pior, deixou o Administrador com a
 * mesma pílula cinza de Leitura e Comercial. Comparação literal de papel é o
 * padrão que a renomeação mostrou ser frágil.
 */
function classeDaPilulaDePapel(papel: Papel): string {
  if (temAcessoTotal(papel)) {
    return "pill pill-info pill-total";
  }
  return podeExecutar(papel, "GERIR_USUARIOS") ? "pill pill-info" : "pill pill-neutra";
}

const ESTADO_INICIAL: EstadoUsuarios = {};

/*
 * Tamanhos de página, e por que o padrão é 25.
 *
 * A RN56 manda conjunto contido ler por rolagem e reserva paginação para base
 * ilimitada; usuários internos são dezenas, não milhares. Com a linha compacta
 * a equipe de hoje cabe inteira numa página — o rodapé existe para quando ela
 * crescer, e o seletor deixa quem quiser encurtar a leitura fazê-lo sem que a
 * escolha vire regra para todo mundo.
 */
const TAMANHOS_DE_PAGINA = [10, 25, 50] as const;
const POR_PAGINA_PADRAO = 25;

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return (
    ((partes[0]?.charAt(0) ?? "") + (partes[partes.length - 1]?.charAt(0) ?? "")).toUpperCase() ||
    "?"
  );
}

function Mensagens({ estado }: { estado: EstadoUsuarios }) {
  return (
    <>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      {estado.senhaProvisoria ? (
        <div className="aviso-inline" role="status">
          <span>
            Senha provisória: <b className="num">{estado.senhaProvisoria}</b> — ela não será exibida
            de novo.
          </span>
        </div>
      ) : null}
    </>
  );
}

function FormularioUsuario({
  usuario,
  aoFechar,
}: {
  usuario: LinhaUsuario | null;
  aoFechar: () => void;
}) {
  const [estado, despachar, pendente] = useActionState<EstadoUsuarios, FormData>(
    usuario ? acaoAtualizarUsuario : acaoCriarUsuario,
    ESTADO_INICIAL,
  );

  return (
    <div className="card" style={{ padding: "20px 22px", marginBottom: 18 }}>
      <h2 className="h-el" style={{ marginBottom: 12 }}>
        {usuario ? `Editar ${usuario.nome}` : "Novo usuário"}
      </h2>
      <Mensagens estado={estado} />
      <form action={despachar} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {usuario ? <input type="hidden" name="usuarioId" value={usuario.id} /> : null}
        <div className="field">
          <label htmlFor="usuario-nome">Nome completo</label>
          <input
            id="usuario-nome"
            name="nome"
            className="input"
            defaultValue={usuario?.nome ?? ""}
            required
          />
        </div>
        {usuario ? (
          <div className="field">
            <label htmlFor="usuario-email">E-mail corporativo</label>
            <input
              id="usuario-email"
              className="input"
              value={usuario.email}
              readOnly
              aria-describedby="usuario-email-nota"
            />
            <span id="usuario-email-nota" className="cap">
              O e-mail é a identidade do usuário na trilha de auditoria e não muda.
            </span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="usuario-email">E-mail corporativo</label>
            <input id="usuario-email" name="email" type="email" className="input" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="usuario-papel">Papel</label>
          <select
            id="usuario-papel"
            name="papel"
            className="select"
            aria-describedby="usuario-papel-ajuda"
            defaultValue={usuario?.papel ?? "LEITURA"}
          >
            {PAPEIS.map((papel) => (
              <option key={papel} value={papel}>
                {ROTULOS_PAPEL[papel]}
              </option>
            ))}
          </select>
          {/*
            Onda 15 — os dois papéis de administração têm nomes parecidos e
            poderes muito diferentes, e a lista os deixa vizinhos. Errar o item
            aqui concede a plataforma inteira, em silêncio e com um clique. A
            nota é a mitigação mais barata desse risco; ela é ligada ao campo
            por `aria-describedby` para que o leitor de tela a ouça junto com o
            rótulo, e não como texto solto depois dele.
          */}
          <p
            id="usuario-papel-ajuda"
            className="cap"
            style={{ margin: "6px 0 0", maxWidth: "62ch" }}
          >
            <strong>Administrador</strong> configura a plataforma — usuários, parâmetros, metas e
            auditoria — e não opera o negócio. <strong>Administrador da Plataforma</strong> é{" "}
            <strong>acesso total</strong>: pode toda ação do sistema.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Gravando…" : usuario ? "Gravar alterações" : "Criar usuário"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Fechar
          </button>
        </div>
        {usuario ? null : (
          <p className="cap" style={{ margin: 0 }}>
            O usuário nasce com credencial provisória e troca obrigatória no primeiro acesso (ficha
            §3). SSO Entra ID segue como decisão futura.
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * Ações da linha, em faixa única (Onda 15 — layout da T27).
 *
 * As cinco ações estavam empilhadas: cada linha media ~170 px e a tela passava
 * de 2.200 px com treze contas. Pior que o tamanho era a tendência — toda ação
 * nova esticava **todas** as linhas, e a fase anterior acrescentou duas.
 *
 * O corte não é por frequência de uso, é por **família**: `Editar` e
 * `Inativar/Reativar` decidem sobre a conta e ficam à vista; redefinir
 * credencial, encerrar sessões e exigir nova senha decidem sobre o **acesso**
 * dela e entram no menu. Quem procura uma das três procura a família, não o
 * botão — e ação nova cabe ali sem esticar nada.
 *
 * O menu é botão + painel controlado, e não `<details>`: `aria-expanded` é
 * explícito e o papel `button` é o mesmo em toda a plataforma. O painel fica
 * **no fluxo** — o porquê está no `dseed-admin.css`, e é medido: flutuando,
 * ele obrigaria a tirar o `overflow-x` do cartão, e a tabela passaria a
 * transbordar entre 760px e 1.080px.
 */
function AcoesDaLinha({ usuario, aoEditar }: { usuario: LinhaUsuario; aoEditar: () => void }) {
  const [estado, despachar, pendente] = useActionState<EstadoUsuarios, FormData>(
    usuario.ativo ? acaoInativarUsuario : acaoReativarUsuario,
    ESTADO_INICIAL,
  );
  const [credencial, despacharCredencial, pendenteCredencial] = useActionState<
    EstadoUsuarios,
    FormData
  >(acaoRedefinirCredencial, ESTADO_INICIAL);
  const [novaSenha, despacharNovaSenha, pendenteNovaSenha] = useActionState<
    EstadoUsuarios,
    FormData
  >(acaoExigirNovaSenha, ESTADO_INICIAL);
  const [sessoes, despacharSessoes, pendenteSessoes] = useActionState<EstadoUsuarios, FormData>(
    acaoEncerrarSessoes,
    ESTADO_INICIAL,
  );

  const [menuAberto, setMenuAberto] = useState(false);
  const painelId = useId();

  const bloqueado = usuario.ativo && usuario.unicoAdministradorAtivo;
  // A marca acesa dispensa a ação: exigir de novo não faria nada.
  const podeExigirSenha = usuario.ativo && !usuario.trocaSenhaObrigatoria;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="acoes-linha">
        <button type="button" className="btn btn-ghost btn-sm btn-xs" onClick={aoEditar}>
          Editar
        </button>
        <form action={despachar}>
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <button
            type="submit"
            className="btn btn-ghost btn-sm btn-xs"
            disabled={bloqueado || pendente}
            title={bloqueado ? MENSAGEM_ULTIMO_ADMINISTRADOR : undefined}
          >
            {usuario.ativo ? "Inativar" : "Reativar"}
          </button>
        </form>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-xs menu-acesso"
          data-aberto={menuAberto ? "sim" : "nao"}
          aria-expanded={menuAberto}
          aria-controls={painelId}
          onClick={() => setMenuAberto((aberto) => !aberto)}
        >
          Acesso
          <svg
            className="chev"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {menuAberto ? (
        <div className="menu-acesso-pop" id={painelId}>
          <form action={despacharCredencial}>
            <input type="hidden" name="usuarioId" value={usuario.id} />
            <button
              type="submit"
              disabled={pendenteCredencial}
              title="Sorteia uma senha provisória e obriga a troca no próximo acesso."
            >
              Redefinir credencial
            </button>
          </form>
          {/*
                Só para conta ATIVA: derrubar a sessão de quem já está inativo
                não faz nada — a inativação já revogou tudo pela RN47.
              */}
          {usuario.ativo ? (
            <form action={despacharSessoes}>
              <input type="hidden" name="usuarioId" value={usuario.id} />
              <button
                type="submit"
                disabled={pendenteSessoes}
                title="Derruba quem está logado agora. O acesso continua: a pessoa entra de novo com a senha atual."
              >
                Encerrar sessões
              </button>
            </form>
          ) : null}
          {podeExigirSenha ? (
            <>
              <div className="menu-acesso-sep" />
              <form action={despacharNovaSenha}>
                <input type="hidden" name="usuarioId" value={usuario.id} />
                <button
                  type="submit"
                  disabled={pendenteNovaSenha}
                  title="A senha atual continua valendo até a pessoa entrar e trocá-la."
                >
                  Exigir nova senha
                </button>
              </form>
            </>
          ) : null}
        </div>
      ) : null}
      {bloqueado ? <span className="cap">{MENSAGEM_ULTIMO_ADMINISTRADOR}</span> : null}
      <Mensagens estado={estado} />
      <Mensagens estado={credencial} />
      <Mensagens estado={novaSenha} />
      <Mensagens estado={sessoes} />
    </div>
  );
}

export function TabelaUsuarios({
  usuarios,
  podeGerir,
}: {
  usuarios: ReadonlyArray<LinhaUsuario>;
  podeGerir: boolean;
}) {
  const [emEdicao, setEmEdicao] = useState<LinhaUsuario | null>(null);
  const [criando, setCriando] = useState(false);

  // Filtros da tela — o conjunto é contido (usuários internos), então a
  // filtragem é no cliente, sobre a lista que já veio ordenada do servidor.
  const [busca, setBusca] = useState("");
  const [papelFiltro, setPapelFiltro] = useState<Papel | "TODOS">("TODOS");
  const [situacaoFiltro, setSituacaoFiltro] = useState<"TODOS" | "ATIVO" | "INATIVO">("TODOS");

  const [porPagina, setPorPagina] = useState<number>(POR_PAGINA_PADRAO);
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((usuario) => {
      if (papelFiltro !== "TODOS" && usuario.papel !== papelFiltro) return false;
      if (situacaoFiltro === "ATIVO" && !usuario.ativo) return false;
      if (situacaoFiltro === "INATIVO" && usuario.ativo) return false;
      if (
        termo !== "" &&
        !usuario.nome.toLowerCase().includes(termo) &&
        !usuario.email.toLowerCase().includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [usuarios, busca, papelFiltro, situacaoFiltro]);

  const temFiltro = busca.trim() !== "" || papelFiltro !== "TODOS" || situacaoFiltro !== "TODOS";

  /*
   * A página é grampeada na renderização, e não só reposta ao filtrar: inativar
   * o último usuário de uma página a faz desaparecer, e sem o grampo a tabela
   * ficaria vazia sem nada explicar. Filtrar repõe em 1 nos próprios controles
   * — quem busca quer o começo do resultado, não a página 3 dele.
   */
  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaAtual = Math.min(pagina, paginas);
  const primeiro = (paginaAtual - 1) * porPagina;
  const visiveis = filtrados.slice(primeiro, primeiro + porPagina);

  /** Repõe a leitura no começo — todo controle que muda o conjunto passa aqui. */
  function reiniciar(aplicar: () => void) {
    aplicar();
    setPagina(1);
  }

  return (
    <>
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
          <h1 className="h-page">Usuários</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Usuários internos da plataforma · credencial própria com troca no primeiro acesso · SSO
            é decisão futura
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeGerir ? (
          <button
            type="button"
            className="btn btn-azul"
            onClick={() => {
              setEmEdicao(null);
              setCriando((aberto) => !aberto);
            }}
          >
            + Novo usuário
          </button>
        ) : null}
      </div>

      {podeGerir ? null : (
        <div className="aviso-inline">
          <span>
            Visualização — criar, editar e inativar usuários é exclusivo do Administrador da
            Plataforma (RN46).
          </span>
        </div>
      )}

      {podeGerir && (criando || emEdicao) ? (
        <FormularioUsuario
          key={emEdicao?.id ?? "novo"}
          usuario={emEdicao}
          aoFechar={() => {
            setCriando(false);
            setEmEdicao(null);
          }}
        />
      ) : null}

      <div
        className="g-resp"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div className="field" style={{ flex: "1 1 260px", margin: 0 }}>
          <label htmlFor="filtro-usuario-busca">Buscar por nome ou e-mail</label>
          <input
            id="filtro-usuario-busca"
            className="input"
            type="search"
            placeholder="Nome ou e-mail…"
            value={busca}
            onChange={(evento) => reiniciar(() => setBusca(evento.target.value))}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="filtro-usuario-papel">Filtrar por papel</label>
          <select
            id="filtro-usuario-papel"
            className="select"
            value={papelFiltro}
            onChange={(evento) =>
              reiniciar(() => setPapelFiltro(evento.target.value as Papel | "TODOS"))
            }
          >
            <option value="TODOS">Todos os papéis</option>
            {PAPEIS.map((papel) => (
              <option key={papel} value={papel}>
                {ROTULOS_PAPEL[papel]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="filtro-usuario-situacao">Filtrar por situação</label>
          <select
            id="filtro-usuario-situacao"
            className="select"
            value={situacaoFiltro}
            onChange={(evento) =>
              reiniciar(() =>
                setSituacaoFiltro(evento.target.value as "TODOS" | "ATIVO" | "INATIVO"),
              )
            }
          >
            <option value="TODOS">Todas</option>
            <option value="ATIVO">Ativos</option>
            <option value="INATIVO">Inativos</option>
          </select>
        </div>
        {temFiltro ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              reiniciar(() => {
                setBusca("");
                setPapelFiltro("TODOS");
                setSituacaoFiltro("TODOS");
              })
            }
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      <div className="cap" style={{ marginBottom: 8 }} role="status" aria-live="polite">
        {temFiltro
          ? `${filtrados.length} de ${usuarios.length} usuário(s)`
          : `${usuarios.length} usuário(s), em ordem alfabética`}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl tbl-resp">
          <caption className="sr-oculto">Usuários internos da plataforma</caption>
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Usuário</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Situação</th>
              {/* Largura para os três botões em UMA linha: a faixa não quebra
                  (`flex-wrap:nowrap`), e coluna estreita demais devolveria a
                  linha de duas alturas que esta mudança veio desfazer. */}
              <th style={{ width: 268 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="cap"
                  style={{ textAlign: "center", padding: "22px 14px" }}
                >
                  Nenhum usuário corresponde aos filtros.
                </td>
              </tr>
            ) : (
              visiveis.map((usuario) => (
                <tr key={usuario.id}>
                  <td data-label="Usuário">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="logo-ini" style={{ width: 30, height: 30, fontSize: 11 }}>
                        {iniciaisDe(usuario.nome)}
                      </span>
                      <span style={{ fontWeight: 600 }}>{usuario.nome}</span>
                    </div>
                  </td>
                  <td data-label="E-mail" className="num">
                    {usuario.email}
                  </td>
                  <td data-label="Papel">
                    <span className={classeDaPilulaDePapel(usuario.papel)}>
                      {temAcessoTotal(usuario.papel) ? <i aria-hidden="true" /> : null}
                      {ROTULOS_PAPEL[usuario.papel]}
                    </span>
                  </td>
                  <td data-label="Situação">
                    <span className={usuario.ativo ? "pill pill-ok" : "pill pill-neutra"}>
                      <i aria-hidden="true" />
                      {usuario.ativo ? "Ativo" : "Inativo"}
                    </span>
                    {usuario.trocaSenhaObrigatoria ? (
                      <span className="cap" style={{ display: "block", marginTop: 2 }}>
                        credencial provisória
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Ações">
                    {podeGerir ? (
                      <AcoesDaLinha
                        usuario={usuario}
                        aoEditar={() => {
                          setCriando(false);
                          setEmEdicao(usuario);
                        }}
                      />
                    ) : (
                      <span className="cap">somente leitura</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <nav className="paginacao" aria-label="Paginação da lista de usuários">
          <span className="cap">
            {filtrados.length === 0
              ? "Nenhum usuário na lista"
              : `Mostrando ${primeiro + 1}–${primeiro + visiveis.length} de ${filtrados.length}`}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <label htmlFor="usuarios-por-pagina" className="cap">
                Por página
              </label>
              <select
                id="usuarios-por-pagina"
                className="select select-sm"
                value={porPagina}
                onChange={(evento) => reiniciar(() => setPorPagina(Number(evento.target.value)))}
              >
                {TAMANHOS_DE_PAGINA.map((tamanho) => (
                  <option key={tamanho} value={tamanho}>
                    {tamanho}
                  </option>
                ))}
              </select>
            </div>
            <div className="paginas">
              <button
                type="button"
                className="pg"
                disabled={paginaAtual <= 1}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                Anterior
              </button>
              {Array.from({ length: paginas }, (_, indice) => indice + 1).map((numero) => (
                <button
                  key={numero}
                  type="button"
                  className="pg num"
                  aria-current={numero === paginaAtual ? "page" : undefined}
                  aria-label={`Página ${numero}`}
                  onClick={() => setPagina(numero)}
                >
                  {numero}
                </button>
              ))}
              <button
                type="button"
                className="pg"
                disabled={paginaAtual >= paginas}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </nav>
      </div>
      <p className="cap" style={{ margin: "14px 0 0" }}>
        Não existe exclusão de usuário: quem tem histórico é inativado, e a autoria dele nos
        registros e na trilha de auditoria permanece (RN47).
      </p>
    </>
  );
}

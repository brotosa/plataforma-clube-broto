"use client";

import { type ReactNode, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EXTENSAO_POR_TIPO_DE_ARQUIVO,
  formatarTamanho,
  type PerfilDeArquivo,
  rotularFormatos,
} from "@/dominio/arquivos/arquivo-enviado";
import { ErrosDoFormulario, MensagemDeSucesso } from "./aliados/formularios";

/**
 * Cartão de envio de arquivo sob controle da plataforma (RN54, RN60, RN62).
 *
 * Nasceu como `aliados/cartao-marca.tsx` na F15, subiu para
 * `cartao-de-imagem.tsx` na F17 quando a imagem do card passou a precisar
 * exatamente da mesma tela, e sobe mais um degrau na F19, quando a minuta
 * do contrato — um PDF — passou a precisar do mesmo comportamento sem
 * precisar de nada que seja de imagem.
 *
 * O que sobrou aqui é o que não depende do tipo do arquivo: o estado único
 * das duas operações, a promessa da ação resolvida no cliente, a régua na
 * dica, o campo, os botões e a moldura. **O que é da imagem — o
 * encolhimento por canvas e a pré-visualização em `<img>` — mora em
 * `cartao-de-imagem.tsx`**, que é uma especialização deste componente e
 * mantém a API que a F17 deixou, intacta, para os dois chamadores dela.
 *
 * A moldura é preenchida pelo chamador (`previa`): a imagem mostra a
 * imagem, o documento mostra o nome e o tamanho. Nenhum dos dois mostra
 * espaço quebrado quando não há arquivo.
 */

export interface EstadoDoCartao {
  erros?: string[];
  sucesso?: string;
  /**
   * Versão do arquivo depois da ação: o hash quando gravou, `null` quando
   * removeu, ausente quando a ação não mexeu no arquivo.
   *
   * Existe porque a re-renderização do servidor também se perde quando o
   * payload é descartado — medido: em 4 de 30 envios a pré-visualização
   * continuava mostrando a imagem antiga mesmo com a confirmação certa na
   * tela. Vindo no retorno da ação, a versão chega pelo mesmo caminho que
   * a mensagem, e o que é exibido deixa de depender do roteador.
   */
  versao?: string | null;
}

/** Extensões que o seletor de arquivo sugere, a partir dos tipos do perfil. */
export function acceptDoPerfil(perfil: PerfilDeArquivo): string {
  const extensoesExtras: Partial<Record<string, string>> = { "image/jpeg": ".jpeg" };
  const extensoes = perfil.tiposAceitos.flatMap((tipo) => {
    const canonica = EXTENSAO_POR_TIPO_DE_ARQUIVO[tipo];
    const extra = extensoesExtras[tipo];
    return extra ? [canonica, extra] : [canonica];
  });
  return [...perfil.tiposAceitos, ...extensoes].join(",");
}

/** Campos ocultos extras, iguais nos dois formulários do cartão. */
function Ocultos({ campos }: { campos?: Record<string, string> }) {
  if (!campos) return null;
  return (
    <>
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
    </>
  );
}

export function CartaoDeArquivo({
  titulo,
  descricao,
  perfil,
  campo,
  nomeDoRegistro,
  idDoRegistro,
  camposOcultos,
  arquivo,
  previa,
  prepararArquivo,
  larguraDaPreview,
  alturaDaPreview,
  classeDaMoldura,
  acaoEnviar,
  acaoRemover,
  rotulos,
  rotulosDoCampo,
}: {
  titulo: string;
  descricao: string;
  perfil: PerfilDeArquivo;
  /** Nome do campo de arquivo no `FormData` — o que a ação lê. */
  campo: string;
  /** Nome do campo oculto com o id da entidade. */
  nomeDoRegistro: string;
  idDoRegistro: string;
  /**
   * Campos ocultos extras enviados nas duas ações.
   *
   * Existe porque a ação da imagem da solução precisa do `empresaId` para
   * revalidar a ficha do aliado, e ele não é a chave da entidade. Sem
   * isto o `revalidatePath` da ficha simplesmente não rodava — defeito
   * que o aviso de variável não usada denunciou.
   */
  camposOcultos?: Record<string, string>;
  /** Metadados do arquivo vigente, ou null quando não há. */
  arquivo: { hash: string; nomeArquivo: string; bytes: number } | null;
  /** O que ocupa a moldura. Recebe a versão vigente; `null` = não há arquivo. */
  previa: (versao: string | null) => ReactNode;
  /**
   * Transformação de conveniência antes de enviar (o encolhimento por
   * canvas da imagem). Ausente = envia o arquivo como veio, que é o caso
   * de todo documento.
   */
  prepararArquivo?: (arquivo: File) => Promise<File>;
  larguraDaPreview: number;
  alturaDaPreview: number;
  /** Classe extra da moldura — a T33 usa `.pt-drop` na minuta. */
  classeDaMoldura?: string;
  acaoEnviar: (estado: EstadoDoCartao, dados: FormData) => Promise<EstadoDoCartao>;
  acaoRemover: (estado: EstadoDoCartao, dados: FormData) => Promise<EstadoDoCartao>;
  /** Texto dos botões. */
  rotulos: { enviar: string; trocar: string; remover: string };
  /**
   * Texto do `<label>` do campo de arquivo, que é distinto do botão de
   * propósito: o rótulo pede a coisa ("Enviar a marca") e o botão executa
   * a ação ("Enviar marca"). Os e2e da F15 afirmam os dois separadamente.
   */
  rotulosDoCampo: { enviar: string; trocar: string };
}) {
  /**
   * UM estado para as duas operações, e não um `useActionState` por ação.
   *
   * Com dois estados, o sucesso do envio anterior continuava vivo e
   * mascarava o da remoção seguinte — a tela mostrava a mensagem errada.
   * Despachando por intenção, o resultado exibido é sempre o da última
   * operação. (Defeito achado na F15; a lição vem junto na generalização.)
   */
  const [estado, definirEstado] = useState<EstadoDoCartao>({});
  const [ocupado, definirOcupado] = useState(false);

  /**
   * **Estado próprio, e não `useActionState` — isto é correção de defeito.**
   *
   * Com `useActionState`, o resultado da ação só chega à tela pela
   * contabilidade do React em cima do payload da resposta. Medido nesta
   * tela: em ~5 de 30 envios o POST volta **200** e o payload é
   * descartado inteiro — nem o valor de retorno nem a re-renderização do
   * servidor pousam (o `src` da imagem permanecia o antigo). O usuário
   * via o arquivo gravado e nenhuma confirmação.
   *
   * É a mesma assinatura que o `CLAUDE.md` já registra para navegação
   * ("o payload RSC vinha 200 e era descartado"), cujo mecanismo continua
   * sem isolamento. Aqui a saída é não depender dele: a promessa da ação
   * resolve no cliente, então o resultado vira estado deste componente. A
   * confirmação passa a ser consequência do que ESTE código recebeu, não
   * do que o roteador conseguiu aplicar.
   *
   * O `router.refresh()` no fim é o que traz a tela nova quando a
   * re-renderização automática se perde — sem ele o cartão mostraria a
   * confirmação e o arquivo antigo.
   */
  const roteador = useRouter();

  async function executar(dados: FormData) {
    definirOcupado(true);
    definirEstado({});
    try {
      let resultado: EstadoDoCartao;
      if (dados.get("intencao") === "remover") {
        resultado = await acaoRemover({}, dados);
      } else {
        const enviado = dados.get(campo);
        // Recusa de tamanho no cliente, ANTES de chegar ao servidor: acima do
        // teto do perfil o corpo estouraria o limite da Server Action e a tela
        // cairia com "server-side exception" em vez de uma mensagem. Aqui o
        // usuario ve o motivo (tamanho obtido x permitido) e nada e enviado.
        if (enviado instanceof File && enviado.size > perfil.tamanhoMaximoEmBytes) {
          definirEstado({
            erros: [
              `${perfil.sujeito} excede o limite de ${formatarTamanho(perfil.tamanhoMaximoEmBytes)} — ` +
                `o arquivo tem ${formatarTamanho(enviado.size)}.` +
                (perfil.dicaDeReducao ? ` ${perfil.dicaDeReducao}` : ""),
            ],
          });
          return;
        }
        if (prepararArquivo && enviado instanceof File && enviado.size > 0) {
          dados.set(campo, await prepararArquivo(enviado));
        }
        resultado = await acaoEnviar({}, dados);
      }
      definirEstado(resultado);
      if (resultado.sucesso) {
        roteador.refresh();
      }
    } finally {
      definirOcupado(false);
    }
  }
  const idCampo = useId();
  const [nomeEscolhido, definirNomeEscolhido] = useState<string | null>(null);

  const erros = estado.erros ?? [];
  const higieniza = perfil.tiposAceitos.includes("image/svg+xml");

  /**
   * O que a tela mostra: a versão devolvida pela ação quando houve uma,
   * senão a que o servidor renderizou. `null` explícito é remoção.
   */
  const versaoVigente = estado.versao !== undefined ? estado.versao : (arquivo?.hash ?? null);
  const temArquivo = versaoVigente !== null;

  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <h2 className="h-el" style={{ marginBottom: 4 }}>
        {titulo}
      </h2>
      <p className="cap" style={{ margin: "0 0 14px" }}>
        {descricao}
      </p>

      <ErrosDoFormulario erros={erros.length > 0 ? erros : undefined} />
      <MensagemDeSucesso mensagem={estado.sucesso} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div
          className={classeDaMoldura}
          style={{
            width: larguraDaPreview,
            height: alturaDaPreview,
            borderRadius: "var(--r-md)",
            overflow: "hidden",
            border: "1px solid var(--borda)",
            flex: "none",
            background: "var(--branco)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {previa(versaoVigente)}
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <form action={executar} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name={nomeDoRegistro} value={idDoRegistro} />
            <Ocultos campos={camposOcultos} />
            <input type="hidden" name="intencao" value="enviar" />
            <div className="field">
              <label htmlFor={idCampo}>
                {temArquivo ? rotulosDoCampo.trocar : rotulosDoCampo.enviar}
              </label>
              <input
                id={idCampo}
                className="input"
                type="file"
                name={campo}
                aria-describedby={`${idCampo}-ajuda`}
                accept={acceptDoPerfil(perfil)}
                onChange={(evento) => definirNomeEscolhido(evento.target.files?.[0]?.name ?? null)}
                style={{ padding: 8 }}
              />
              <span className="hint" id={`${idCampo}-ajuda`}>
                {rotularFormatos(perfil.tiposAceitos)}, até{" "}
                {formatarTamanho(perfil.tamanhoMaximoEmBytes)}. A plataforma confere o tipo real do
                arquivo, não a extensão
                {higieniza ? ", e higieniza SVG antes de guardar" : ""}.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-azul btn-sm" disabled={ocupado}>
                {ocupado ? "Enviando…" : temArquivo ? rotulos.trocar : rotulos.enviar}
              </button>
              {nomeEscolhido ? (
                <span className="cap" style={{ alignSelf: "center" }}>
                  {nomeEscolhido}
                </span>
              ) : null}
            </div>
          </form>

          {temArquivo ? (
            <form action={executar} style={{ marginTop: 10 }}>
              <input type="hidden" name={nomeDoRegistro} value={idDoRegistro} />
              <Ocultos campos={camposOcultos} />
              <input type="hidden" name="intencao" value="remover" />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={ocupado}>
                {ocupado ? "Removendo…" : rotulos.remover}
              </button>
              {arquivo && estado.versao === undefined ? (
                <span className="cap" style={{ marginLeft: 10 }}>
                  {arquivo.nomeArquivo} · {formatarTamanho(arquivo.bytes)}
                </span>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

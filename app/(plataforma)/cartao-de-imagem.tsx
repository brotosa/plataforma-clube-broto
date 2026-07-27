"use client";

import { type ReactNode, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { PerfilDeImagem } from "@/dominio/imagens/imagem";
import { rotularFormatos } from "@/dominio/imagens/imagem";
import { ErrosDoFormulario, MensagemDeSucesso } from "./aliados/formularios";

/**
 * Cartão de envio de imagem sob controle da plataforma (RN54, RN60).
 *
 * Nasceu como `aliados/cartao-marca.tsx` na F15 e subiu um nível na F17,
 * quando a imagem do card da solução passou a precisar exatamente da mesma
 * tela. Mesma razão que moveu o segmentado de seção na F14: enquanto o
 * padrão vivia num lugar só, copiá-lo para o segundo uso o faria divergir —
 * e é a tela que explica ao usuário o que a régua aceita, então divergir
 * aqui é mentir para ele.
 *
 * O que o chamador informa é a calibragem (`perfil`), as duas ações e o que
 * mostrar quando não há imagem. O resto — a régua na dica, o encolhimento
 * de conveniência, o estado único das duas operações — é igual nos dois.
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
   * a mensagem, e a imagem exibida deixa de depender do roteador.
   */
  versao?: string | null;
}

/**
 * Redimensiona no navegador antes de enviar. **É conveniência de cliente, e
 * só isso**: encolhe o arquivo comum para caber no teto, poupando o usuário
 * de abrir um editor. Tamanho, tipo real e higienização são decididos pelo
 * SERVIDOR, sempre, sobre os bytes que chegarem — quem postar direto na
 * ação, com o navegador desligado ou com outro cliente, encontra a mesma
 * régua.
 *
 * **Não se aplica a SVG**, de propósito: passar um vetor por `<canvas>` o
 * rasterizaria — destruiria a qualidade que motiva usar SVG e mudaria o
 * tipo real do conteúdo, fazendo o arquivo chegar ao servidor como PNG com
 * nome .svg, que a validação recusaria. No perfil que aceita vetor (a
 * marca), SVG segue inteiro e são a higienização e o teto que cuidam dele;
 * no que não aceita (o card), o servidor recusa nomeando o formato.
 *
 * A extensão do arquivo reescrito sai do tipo REAL do blob, não do tipo
 * pedido: navegador sem suporte a WEBP devolve PNG calado, e nomear pelo
 * pedido produziria "card.webp" com bytes de PNG — que a régua de
 * coerência entre extensão e conteúdo recusaria, por um defeito nosso.
 */
async function encolherSePuder(
  arquivo: File,
  perfil: PerfilDeImagem,
  tipoDeSaida: string,
): Promise<File> {
  if (arquivo.type === "image/svg+xml" || arquivo.name.toLowerCase().endsWith(".svg")) {
    return arquivo;
  }
  if (arquivo.size <= perfil.tamanhoMaximoEmBytes) {
    return arquivo;
  }
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(
      1,
      perfil.maiorDimensaoDeUso / Math.max(bitmap.width, bitmap.height),
    );
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const contexto = tela.getContext("2d");
    if (!contexto) return arquivo;
    contexto.drawImage(bitmap, 0, 0, largura, altura);
    const blob = await new Promise<Blob | null>((resolver) => tela.toBlob(resolver, tipoDeSaida));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    const extensao =
      blob.type === "image/webp" ? ".webp" : blob.type === "image/jpeg" ? ".jpg" : ".png";
    const nomeBase = arquivo.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${nomeBase}${extensao}`, { type: blob.type });
  } catch {
    // Falhou o encolhimento? Envia o original: o servidor recusa com o
    // motivo certo, que é melhor do que uma falha muda aqui.
    return arquivo;
  }
}

/** Extensões que o seletor de arquivo sugere, a partir dos tipos do perfil. */
function acceptDoPerfil(perfil: PerfilDeImagem): string {
  const porTipo: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg,.jpeg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  const extensoes = perfil.tiposAceitos.map((tipo) => porTipo[tipo] ?? "").filter(Boolean);
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

export function CartaoDeImagem({
  titulo,
  descricao,
  perfil,
  tipoDeSaidaDoEncolhimento = "image/png",
  campo,
  nomeDoRegistro,
  idDoRegistro,
  camposOcultos,
  imagem,
  urlDaImagem,
  textoAlternativo,
  semImagem,
  larguraDaPreview,
  alturaDaPreview,
  ajustePreview = "contain",
  acaoEnviar,
  acaoRemover,
  rotulos,
  rotulosDoCampo,
}: {
  titulo: string;
  descricao: string;
  perfil: PerfilDeImagem;
  /** Tipo alvo do encolhimento de conveniência (PNG guarda transparência; WEBP comprime foto). */
  tipoDeSaidaDoEncolhimento?: string;
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
  /** Metadados da imagem vigente, ou null quando não há. */
  imagem: { hash: string; nomeArquivo: string; bytes: number } | null;
  /** Rota que serve a imagem (sem o parâmetro de versão). */
  urlDaImagem: string;
  textoAlternativo: string;
  /** O que ocupa a moldura quando não há imagem — nunca espaço quebrado. */
  semImagem: ReactNode;
  larguraDaPreview: number;
  alturaDaPreview: number;
  ajustePreview?: "contain" | "cover";
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
   * confirmação e a imagem antiga.
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
        const arquivo = dados.get(campo);
        if (arquivo instanceof File && arquivo.size > 0) {
          dados.set(campo, await encolherSePuder(arquivo, perfil, tipoDeSaidaDoEncolhimento));
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
  const versaoVigente = estado.versao !== undefined ? estado.versao : (imagem?.hash ?? null);
  const temImagem = versaoVigente !== null;

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
          {temImagem ? (
            /* Servida por rota própria com ETag pelo hash: o otimizador do
               next/image não acrescenta nada a um arquivo deste tamanho e
               atrapalharia a revalidação por ETag. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${urlDaImagem}?v=${(versaoVigente ?? "").slice(0, 12)}`}
              alt={textoAlternativo}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                width: ajustePreview === "cover" ? "100%" : undefined,
                height: ajustePreview === "cover" ? "100%" : undefined,
                objectFit: ajustePreview,
                padding: ajustePreview === "contain" ? 6 : 0,
              }}
            />
          ) : (
            semImagem
          )}
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <form action={executar} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name={nomeDoRegistro} value={idDoRegistro} />
            <Ocultos campos={camposOcultos} />
            <input type="hidden" name="intencao" value="enviar" />
            <div className="field">
              <label htmlFor={idCampo}>
                {temImagem ? rotulosDoCampo.trocar : rotulosDoCampo.enviar}
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
                {perfil.tamanhoMaximoEmBytes / 1024} KB. A plataforma confere o tipo real do
                arquivo, não a extensão
                {higieniza ? ", e higieniza SVG antes de guardar" : ""}.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-azul btn-sm" disabled={ocupado}>
                {ocupado ? "Enviando…" : temImagem ? rotulos.trocar : rotulos.enviar}
              </button>
              {nomeEscolhido ? (
                <span className="cap" style={{ alignSelf: "center" }}>
                  {nomeEscolhido}
                </span>
              ) : null}
            </div>
          </form>

          {temImagem ? (
            <form action={executar} style={{ marginTop: 10 }}>
              <input type="hidden" name={nomeDoRegistro} value={idDoRegistro} />
              <Ocultos campos={camposOcultos} />
              <input type="hidden" name="intencao" value="remover" />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={ocupado}>
                {ocupado ? "Removendo…" : rotulos.remover}
              </button>
              {imagem && estado.versao === undefined ? (
                <span className="cap" style={{ marginLeft: 10 }}>
                  {imagem.nomeArquivo} · {Math.round((imagem.bytes / 1024) * 10) / 10} KB
                </span>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

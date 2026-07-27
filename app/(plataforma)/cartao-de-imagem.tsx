"use client";

import { type ReactNode } from "react";
import type { PerfilDeImagem } from "@/dominio/imagens/imagem";
import { CartaoDeArquivo, type EstadoDoCartao } from "./cartao-de-arquivo";

/**
 * Cartão de envio de IMAGEM sob controle da plataforma (RN54, RN60).
 *
 * Nasceu como `aliados/cartao-marca.tsx` na F15 e subiu um nível na F17,
 * quando a imagem do card da solução passou a precisar exatamente da mesma
 * tela. Na F19 ele subiu de novo: tudo o que não depende de o arquivo ser
 * imagem foi para `cartao-de-arquivo.tsx`, porque a minuta do contrato
 * precisa do mesmo cartão sem precisar de nada disto aqui.
 *
 * **A API deste componente não mudou**, e é de propósito: os dois
 * chamadores da F17 (`aliados/cartao-marca.tsx` e
 * `aliados/[id]/solucoes/cartao-imagem-solucao.tsx`) não foram tocados, e
 * os e2e de marca e de imagem da solução provam que a terceira
 * generalização não regrediu a segunda.
 *
 * O que sobrou aqui é o que É de imagem: o encolhimento por canvas e a
 * pré-visualização em `<img>`.
 */

export type { EstadoDoCartao };

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
 * **Nem a documento**: um PDF não tem o que encolher por canvas, e é por
 * isso que o cartão genérico recebe esta função como parâmetro em vez de
 * embuti-la — a minuta simplesmente não passa nenhuma.
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
    const escala = Math.min(1, perfil.maiorDimensaoDeUso / Math.max(bitmap.width, bitmap.height));
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
  rotulos: { enviar: string; trocar: string; remover: string };
  rotulosDoCampo: { enviar: string; trocar: string };
}) {
  return (
    <CartaoDeArquivo
      titulo={titulo}
      descricao={descricao}
      perfil={{
        tamanhoMaximoEmBytes: perfil.tamanhoMaximoEmBytes,
        tiposAceitos: perfil.tiposAceitos,
        universoDeDeteccao: perfil.tiposAceitos,
        sujeito: perfil.sujeito,
        complementoDeSelecao: perfil.complementoDeSelecao,
        // Os dois fechos só compõem mensagem do SERVIDOR; o cartão usa do
        // perfil apenas tipos e teto. Ficam aqui para o tipo fechar, com o
        // mesmo texto que `validarImagem` usa — nunca outro.
        fechoDeFormatoRecusado: "Envie a imagem em um deles.",
        dicaDeReducao: `Reduza a imagem antes de enviar — a maior dimensão que a plataforma usa é ${perfil.maiorDimensaoDeUso} px.`,
      }}
      campo={campo}
      nomeDoRegistro={nomeDoRegistro}
      idDoRegistro={idDoRegistro}
      camposOcultos={camposOcultos}
      arquivo={imagem}
      prepararArquivo={(arquivo) =>
        encolherSePuder(arquivo, perfil, tipoDeSaidaDoEncolhimento)
      }
      larguraDaPreview={larguraDaPreview}
      alturaDaPreview={alturaDaPreview}
      previa={(versao) =>
        versao !== null ? (
          /* Servida por rota própria com ETag pelo hash: o otimizador do
             next/image não acrescenta nada a um arquivo deste tamanho e
             atrapalharia a revalidação por ETag. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${urlDaImagem}?v=${versao.slice(0, 12)}`}
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
        )
      }
      acaoEnviar={acaoEnviar}
      acaoRemover={acaoRemover}
      rotulos={rotulos}
      rotulosDoCampo={rotulosDoCampo}
    />
  );
}

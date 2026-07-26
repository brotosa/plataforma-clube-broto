"use client";

import { useActionState, useId, useState } from "react";
import {
  type EstadoFormulario,
  acaoEnviarMarca,
  acaoRemoverMarca,
} from "./acoes";
import { ErrosDoFormulario, MensagemDeSucesso } from "./formularios";
import { iniciaisDoNome } from "./componentes";
import {
  FORMATOS_ACEITOS_ROTULO,
  MAIOR_DIMENSAO_DE_USO,
  TAMANHO_MAXIMO_EM_BYTES,
} from "@/dominio/marca/marca";

/**
 * RN54 — envio, troca e remoção da marca do aliado (T2).
 *
 * Substitui o antigo campo "Logo (chave do arquivo)", que pedia um endereço
 * de objeto no S3 de um bucket nunca provisionado. Fica em cartão próprio,
 * e não dentro do formulário de identificação, por uma razão de HTML: o
 * envio precisa do seu próprio `<form>` (arquivo + submissão própria) e
 * formulário aninhado não existe. Também precisa do aliado já criado — a
 * marca é 1:1 com ele —, então só aparece na edição.
 */

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
 * nome .svg, que a validação recusaria. SVG segue inteiro, e é a
 * higienização mais o teto de 200 KB que cuidam dele.
 */
async function encolherSePuder(arquivo: File): Promise<File> {
  if (arquivo.type === "image/svg+xml" || arquivo.name.toLowerCase().endsWith(".svg")) {
    return arquivo;
  }
  if (arquivo.size <= TAMANHO_MAXIMO_EM_BYTES) {
    return arquivo;
  }
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, MAIOR_DIMENSAO_DE_USO / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const contexto = tela.getContext("2d");
    if (!contexto) return arquivo;
    contexto.drawImage(bitmap, 0, 0, largura, altura);
    // PNG preserva transparência, que marca costuma ter.
    const blob = await new Promise<Blob | null>((resolver) =>
      tela.toBlob(resolver, "image/png"),
    );
    if (!blob || blob.size >= arquivo.size) return arquivo;
    const nomeBase = arquivo.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${nomeBase}.png`, { type: "image/png" });
  } catch {
    // Falhou o encolhimento? Envia o original: o servidor recusa com o
    // motivo certo, que é melhor do que uma falha muda aqui.
    return arquivo;
  }
}

export function CartaoMarca({
  empresaId,
  nomeFantasia,
  marca,
}: {
  empresaId: string;
  nomeFantasia: string;
  /** Hash da marca vigente, ou null quando o aliado não tem marca. */
  marca: { hash: string; nomeArquivo: string; bytes: number } | null;
}) {
  /**
   * UM estado para as duas operações, e não um `useActionState` por ação.
   *
   * Com dois estados, o "Marca do aliado atualizada." do envio anterior
   * continuava vivo e mascarava o "Marca removida." da remoção seguinte —
   * a tela mostrava a mensagem errada. Despachando por intenção, o
   * resultado exibido é sempre o da última operação.
   */
  const [estado, executar, ocupado] = useActionState<EstadoFormulario, FormData>(
    async (_anterior, dados) => {
      if (dados.get("intencao") === "remover") {
        return acaoRemoverMarca({}, dados);
      }
      const arquivo = dados.get("marca");
      if (arquivo instanceof File && arquivo.size > 0) {
        dados.set("marca", await encolherSePuder(arquivo));
      }
      return acaoEnviarMarca({}, dados);
    },
    {},
  );
  const idCampo = useId();
  const [nomeEscolhido, definirNomeEscolhido] = useState<string | null>(null);

  const erros = estado.erros ?? [];
  const sucesso = estado.sucesso;

  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <h2 className="h-el" style={{ marginBottom: 4 }}>
        Marca do aliado
      </h2>
      <p className="cap" style={{ margin: "0 0 14px" }}>
        Aparece na ficha, na lista de aliados, no card do funil e nos kits de oferta e de campanha.
      </p>

      <ErrosDoFormulario erros={erros.length > 0 ? erros : undefined} />
      <MensagemDeSucesso mensagem={sucesso} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            width: 132,
            height: 76,
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
          {marca ? (
            /* A marca é servida por rota própria com ETag pelo hash: o
               otimizador do next/image não acrescenta nada a um arquivo de
               até 200 KB e atrapalharia a revalidação por ETag. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/aliados/${empresaId}/marca?v=${marca.hash.slice(0, 12)}`}
              alt={`Marca de ${nomeFantasia}`}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 6 }}
            />
          ) : (
            <span className="logo-ini" style={{ width: 44, height: 44, fontSize: 15 }}>
              {iniciaisDoNome(nomeFantasia)}
            </span>
          )}
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <form action={executar} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name="empresaId" value={empresaId} />
            <input type="hidden" name="intencao" value="enviar" />
            <div className="field">
              <label htmlFor={idCampo}>{marca ? "Trocar a marca" : "Enviar a marca"}</label>
              <input
                id={idCampo}
                className="input"
                type="file"
                name="marca"
                aria-describedby={`${idCampo}-ajuda`}
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                onChange={(evento) =>
                  definirNomeEscolhido(evento.target.files?.[0]?.name ?? null)
                }
                style={{ padding: 8 }}
              />
              <span className="hint" id={`${idCampo}-ajuda`}>
                {FORMATOS_ACEITOS_ROTULO}, até {TAMANHO_MAXIMO_EM_BYTES / 1024} KB. A plataforma
                confere o tipo real do arquivo, não a extensão, e higieniza SVG antes de guardar.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-azul btn-sm" disabled={ocupado}>
                {ocupado ? "Enviando…" : marca ? "Trocar marca" : "Enviar marca"}
              </button>
              {nomeEscolhido ? (
                <span className="cap" style={{ alignSelf: "center" }}>
                  {nomeEscolhido}
                </span>
              ) : null}
            </div>
          </form>

          {marca ? (
            <form action={executar} style={{ marginTop: 10 }}>
              <input type="hidden" name="empresaId" value={empresaId} />
              <input type="hidden" name="intencao" value="remover" />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={ocupado}>
                {ocupado ? "Removendo…" : "Remover marca"}
              </button>
              <span className="cap" style={{ marginLeft: 10 }}>
                {marca.nomeArquivo} · {Math.round((marca.bytes / 1024) * 10) / 10} KB
              </span>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

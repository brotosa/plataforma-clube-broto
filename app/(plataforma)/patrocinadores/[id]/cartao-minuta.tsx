"use client";

import { formatarTamanho } from "@/dominio/arquivos/arquivo-enviado";
import { PERFIL_MINUTA } from "@/dominio/patrocinio/minuta";
import { CartaoDeArquivo } from "../../cartao-de-arquivo";
import { acaoEnviarMinuta, acaoRemoverMinuta } from "../acoes";

/**
 * Minuta do contrato (T33, aba Contrato) — RN62.
 *
 * Usa o **mesmo** cartão da marca do aliado e da imagem do card, com o
 * perfil da minuta: o mecanismo é um só desde a F19, e o que muda é a
 * calibragem. O que a moldura mostra é o que difere — documento não tem
 * pré-visualização, tem identidade: nome, tamanho e data de envio, com o
 * link para abrir.
 *
 * A moldura recebe `.pt-drop`, o único seletor novo da Onda 12.
 */
export function CartaoDeMinuta({
  patrocinadorId,
  minuta,
  temContrato,
  podeGerir,
}: {
  patrocinadorId: string;
  minuta: { nomeArquivo: string; bytes: number; hash: string; enviadaEm: Date } | null;
  temContrato: boolean;
  podeGerir: boolean;
}) {
  /**
   * Sem permissão de escrita, o cartão vira leitura: quem só lê precisa
   * saber se há minuta e poder abri-la, mas não vê campo de envio.
   */
  if (!podeGerir) {
    return (
      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 4 }}>
          Minuta do contrato
        </h2>
        {minuta === null ? (
          <p className="aviso-inline" style={{ margin: "10px 0 0" }}>
            sem minuta — pendência
          </p>
        ) : (
          <p className="cap" style={{ margin: "10px 0 0" }}>
            <a href={`/api/patrocinadores/${patrocinadorId}/minuta`}>{minuta.nomeArquivo}</a> ·{" "}
            {formatarTamanho(minuta.bytes)}
          </p>
        )}
      </div>
    );
  }

  /**
   * Sem contrato salvo não há onde anexar — e dizer isso aqui é melhor do
   * que deixar o envio falhar depois (RN55: a falha nomeia a causa, mas a
   * tela que evita a falha é melhor ainda).
   */
  if (!temContrato) {
    return (
      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 4 }}>
          Minuta do contrato
        </h2>
        <p className="aviso-inline" style={{ margin: "10px 0 0" }}>
          Salve os dados do contrato antes de anexar a minuta — ela é do contrato, não do
          patrocinador.
        </p>
      </div>
    );
  }

  return (
    <CartaoDeArquivo
      titulo="Minuta do contrato"
      descricao="O documento assinado, guardado pela plataforma. Substituir não apaga a anterior da trilha."
      perfil={PERFIL_MINUTA}
      campo="minuta"
      nomeDoRegistro="patrocinadorId"
      idDoRegistro={patrocinadorId}
      arquivo={minuta}
      larguraDaPreview={132}
      alturaDaPreview={132}
      classeDaMoldura="pt-drop"
      previa={(versao) =>
        versao === null ? (
          <span className="cap" style={{ textAlign: "center", padding: 10 }}>
            sem minuta
            <br />
            pendência
          </span>
        ) : (
          <a
            href={`/api/patrocinadores/${patrocinadorId}/minuta?v=${versao.slice(0, 12)}`}
            className="cap"
            style={{ textAlign: "center", padding: 10, wordBreak: "break-word" }}
          >
            <span aria-hidden="true" style={{ display: "block", fontSize: 22 }}>
              PDF
            </span>
            {minuta ? minuta.nomeArquivo : "abrir a minuta"}
          </a>
        )
      }
      acaoEnviar={acaoEnviarMinuta}
      acaoRemover={acaoRemoverMinuta}
      rotulos={{ enviar: "Anexar minuta", trocar: "Substituir minuta", remover: "Remover minuta" }}
      rotulosDoCampo={{ enviar: "Anexar a minuta", trocar: "Substituir a minuta" }}
    />
  );
}

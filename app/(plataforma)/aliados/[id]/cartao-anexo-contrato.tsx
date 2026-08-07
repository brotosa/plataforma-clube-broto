"use client";

import { formatarTamanho } from "@/dominio/arquivos/arquivo-enviado";
import { PERFIL_ANEXO_CONTRATO } from "@/dominio/contratos/anexo";
import { CartaoDeArquivo } from "../../cartao-de-arquivo";
import { acaoEnviarAnexoContrato, acaoRemoverAnexoContrato } from "../acoes";

/**
 * Anexo (PDF) do contrato comercial (aba Comercial) — Nível 2 do "editar
 * contrato".
 *
 * Usa o **mesmo** cartão da marca, da imagem do card e da minuta do
 * patrocínio, com o perfil do anexo do contrato: o mecanismo é um só, e o que
 * muda é a calibragem. Documento não tem pré-visualização, tem identidade:
 * nome, tamanho e o link para abrir.
 */
export function CartaoDeAnexoContrato({
  empresaId,
  contratoId,
  anexo,
  podeEditar,
}: {
  empresaId: string;
  contratoId: string;
  anexo: { nomeArquivo: string; bytes: number; hash: string } | null;
  podeEditar: boolean;
}) {
  // Sem permissão de escrita, o cartão vira leitura: mostra se há anexo e
  // permite abri-lo, sem campo de envio.
  if (!podeEditar) {
    return (
      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 4 }}>
          Anexo do contrato (PDF)
        </h2>
        {anexo === null ? (
          <p className="aviso-inline" style={{ margin: "10px 0 0" }}>
            sem anexo — pendência
          </p>
        ) : (
          <p className="cap" style={{ margin: "10px 0 0" }}>
            <a href={`/api/aliados/${empresaId}/contrato/anexo`}>{anexo.nomeArquivo}</a> ·{" "}
            {formatarTamanho(anexo.bytes)}
          </p>
        )}
      </div>
    );
  }

  return (
    <CartaoDeArquivo
      titulo="Anexo do contrato (PDF)"
      descricao="O contrato assinado, guardado pela plataforma. Substituir não apaga o anterior da trilha."
      perfil={PERFIL_ANEXO_CONTRATO}
      campo="anexoContrato"
      nomeDoRegistro="contratoId"
      idDoRegistro={contratoId}
      camposOcultos={{ empresaId }}
      arquivo={anexo}
      larguraDaPreview={132}
      alturaDaPreview={132}
      previa={(versao) =>
        versao === null ? (
          <span className="cap" style={{ textAlign: "center", padding: 10 }}>
            sem anexo
            <br />
            pendência
          </span>
        ) : (
          <a
            href={`/api/aliados/${empresaId}/contrato/anexo?v=${versao.slice(0, 12)}`}
            className="cap"
            style={{ textAlign: "center", padding: 10, wordBreak: "break-word" }}
          >
            <span aria-hidden="true" style={{ display: "block", fontSize: 22 }}>
              PDF
            </span>
            {anexo ? anexo.nomeArquivo : "abrir o anexo"}
          </a>
        )
      }
      acaoEnviar={acaoEnviarAnexoContrato}
      acaoRemover={acaoRemoverAnexoContrato}
      rotulos={{ enviar: "Enviar anexo", trocar: "Substituir anexo", remover: "Remover anexo" }}
      rotulosDoCampo={{ enviar: "Enviar o anexo (PDF)", trocar: "Substituir o anexo (PDF)" }}
    />
  );
}

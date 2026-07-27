"use client";

import { PERFIL_MARCA } from "@/dominio/marca/marca";
import { CartaoDeImagem } from "../cartao-de-imagem";
import { acaoEnviarMarca, acaoRemoverMarca } from "./acoes";
import { iniciaisDoNome } from "./componentes";

/**
 * RN54 — envio, troca e remoção da marca do aliado (T2).
 *
 * Substitui o antigo campo "Logo (chave do arquivo)", que pedia um endereço
 * de objeto no S3 de um bucket nunca provisionado. Fica em cartão próprio,
 * e não dentro do formulário de identificação, por uma razão de HTML: o
 * envio precisa do seu próprio `<form>` (arquivo + submissão própria) e
 * formulário aninhado não existe. Também precisa do aliado já criado — a
 * marca é 1:1 com ele —, então só aparece na edição.
 *
 * A partir da F17 a tela em si mora em `../cartao-de-imagem.tsx`, dividida
 * com a imagem do card da solução. Aqui ficou o que é da marca: a
 * calibragem, os rótulos e a placa com a inicial.
 */
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
  return (
    <CartaoDeImagem
      titulo="Marca do aliado"
      descricao="Aparece na ficha, na lista de aliados, no card do funil e nos kits de oferta e de campanha."
      perfil={PERFIL_MARCA}
      // PNG preserva transparência, que marca costuma ter.
      tipoDeSaidaDoEncolhimento="image/png"
      campo="marca"
      nomeDoRegistro="empresaId"
      idDoRegistro={empresaId}
      imagem={marca}
      urlDaImagem={`/api/aliados/${empresaId}/marca`}
      textoAlternativo={`Marca de ${nomeFantasia}`}
      semImagem={
        <span className="logo-ini" style={{ width: 44, height: 44, fontSize: 15 }}>
          {iniciaisDoNome(nomeFantasia)}
        </span>
      }
      larguraDaPreview={132}
      alturaDaPreview={76}
      acaoEnviar={acaoEnviarMarca}
      acaoRemover={acaoRemoverMarca}
      rotulos={{ enviar: "Enviar marca", trocar: "Trocar marca", remover: "Remover marca" }}
      rotulosDoCampo={{ enviar: "Enviar a marca", trocar: "Trocar a marca" }}
    />
  );
}

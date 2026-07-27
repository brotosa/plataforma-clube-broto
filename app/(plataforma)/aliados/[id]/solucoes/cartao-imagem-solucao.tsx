"use client";

import { PERFIL_IMAGEM_CARD } from "@/dominio/solucoes/imagem-card";
import { CartaoDeImagem } from "../../../cartao-de-imagem";
import { acaoEnviarImagemDaSolucao, acaoRemoverImagemDaSolucao } from "./acoes";

/**
 * RN60 — envio, troca e remoção da imagem do card da solução (T3).
 *
 * Substitui o antigo campo "Imagem do card (chave do arquivo)", que pedia
 * um endereço de objeto num bucket nunca provisionado — o mesmo impasse que
 * o logotipo tinha antes da Onda 8, e por isso nenhum card de solução tinha
 * imagem.
 *
 * Cartão próprio pelas mesmas duas razões da marca: o envio precisa do seu
 * próprio `<form>` e formulário aninhado não existe; e a imagem é 1:1 com a
 * solução, que precisa existir antes de receber arquivo. Por isso só
 * aparece na edição, nunca em "nova solução".
 */
export function CartaoImagemSolucao({
  empresaId,
  solucaoId,
  nomeDaSolucao,
  imagem,
}: {
  empresaId: string;
  solucaoId: string;
  nomeDaSolucao: string;
  /** Hash da imagem vigente, ou null quando a solução não tem imagem. */
  imagem: { hash: string; nomeArquivo: string; bytes: number } | null;
}) {
  return (
    <CartaoDeImagem
      titulo="Imagem do card"
      descricao="Aparece no card da vitrine, na ficha da solução, nos cards de oferta e no kit de campanha."
      perfil={PERFIL_IMAGEM_CARD}
      /* WEBP no encolhimento: o card é foto, e aqui comprime muito melhor
         que PNG. Se o navegador não suportar, o blob volta em PNG e a
         extensão acompanha o tipo real — ver `encolherSePuder`. */
      tipoDeSaidaDoEncolhimento="image/webp"
      campo="imagem"
      nomeDoRegistro="solucaoId"
      idDoRegistro={solucaoId}
      /* A ação revalida a ficha do aliado, que não é a chave da entidade. */
      camposOcultos={{ empresaId }}
      imagem={imagem}
      urlDaImagem={`/api/solucoes/${solucaoId}/imagem`}
      textoAlternativo={`Imagem do card de ${nomeDaSolucao}`}
      semImagem={
        /* Tratamento neutro, nunca espaço quebrado (RN60): a moldura diz o
           que falta, na proporção em que a imagem vai entrar. */
        <span className="cap" style={{ padding: "0 10px", textAlign: "center" }}>
          imagem do card pendente
        </span>
      }
      /* 16/10, a proporção do `.vcard` — a pré-visualização mostra o
         recorte que a vitrine vai fazer, não outro. */
      larguraDaPreview={160}
      alturaDaPreview={100}
      ajustePreview="cover"
      acaoEnviar={acaoEnviarImagemDaSolucao}
      acaoRemover={acaoRemoverImagemDaSolucao}
      rotulos={{ enviar: "Enviar imagem", trocar: "Trocar imagem", remover: "Remover imagem" }}
      rotulosDoCampo={{ enviar: "Enviar a imagem do card", trocar: "Trocar a imagem do card" }}
    />
  );
}

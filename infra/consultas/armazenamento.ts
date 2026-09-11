import {
  ARTEFATOS_DERIVADOS,
  type ArtefatoDerivado,
  type CondicaoDeSaida,
  classificarChave,
  condicaoDeSaidaRn71,
} from "@/dominio/arquivos/artefato-derivado";
import { prisma } from "@/infra/prisma/cliente";

/**
 * Medida do armazenamento de artefatos derivados (RN71), para o painel de
 * saúde do Parametrizador.
 *
 * **Lê só metadados.** A tabela `arquivos_armazenados` guarda o binário na
 * coluna `conteudo` (Bytes); medir o armazenamento carregando o
 * armazenamento inteiro na memória seria o defeito que a medida existe para
 * vigiar. Por isso o `select` traz apenas `chave` e `bytes` — o tamanho já
 * está gravado numa coluna própria (a RN71 mede sobre ela).
 *
 * O tipo do artefato é DERIVADO do prefixo da chave (`classificarChave`), a
 * mesma fonte única que o gravador usa — nunca uma segunda tabela de-para.
 */

export interface MedidaPorArtefato {
  quantidade: number;
  totalBytes: number;
  maiorBytes: number;
}

export interface MedidaDeArmazenamento {
  totalBytes: number;
  quantidade: number;
  /** O maior kit isolado — a metade "por kit" da condição da RN71. */
  maiorKitBytes: number;
  porArtefato: Record<ArtefatoDerivado, MedidaPorArtefato>;
  /** Chaves fora dos três prefixos conhecidos — não deveria haver; se houver,
   *  entra no total e aparece à parte, nunca somada como se fosse artefato. */
  desconhecidos: MedidaPorArtefato;
  condicao: CondicaoDeSaida;
}

function medidaVazia(): MedidaPorArtefato {
  return { quantidade: 0, totalBytes: 0, maiorBytes: 0 };
}

function somar(alvo: MedidaPorArtefato, bytes: number): void {
  alvo.quantidade += 1;
  alvo.totalBytes += bytes;
  if (bytes > alvo.maiorBytes) alvo.maiorBytes = bytes;
}

export async function medirArmazenamento(): Promise<MedidaDeArmazenamento> {
  const registros = await prisma.arquivoArmazenado.findMany({
    select: { chave: true, bytes: true },
  });

  const porArtefato = Object.fromEntries(
    ARTEFATOS_DERIVADOS.map((artefato) => [artefato, medidaVazia()]),
  ) as Record<ArtefatoDerivado, MedidaPorArtefato>;
  const desconhecidos = medidaVazia();
  let totalBytes = 0;

  for (const registro of registros) {
    totalBytes += registro.bytes;
    const artefato = classificarChave(registro.chave);
    somar(artefato ? porArtefato[artefato] : desconhecidos, registro.bytes);
  }

  const maiorKitBytes = porArtefato.KIT_DE_EXECUCAO.maiorBytes;
  return {
    totalBytes,
    quantidade: registros.length,
    maiorKitBytes,
    porArtefato,
    desconhecidos,
    condicao: condicaoDeSaidaRn71({ totalBytes, maiorKitBytes }),
  };
}

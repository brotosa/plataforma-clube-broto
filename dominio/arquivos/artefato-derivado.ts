import { formatarTamanho } from "./arquivo-enviado";

/**
 * RN71 — os três artefatos derivados da plataforma, seus tetos e o que
 * acontece quando a chave não tem conteúdo.
 *
 * Derivado, aqui, quer dizer: arquivo que existe por causa de um registro
 * de negócio e não tem valor sozinho. A peça é enviada por gente, mas só
 * vive dentro de uma campanha; o snapshot e o kit a plataforma produz. Os
 * três eram gravados no disco da máquina, que é efêmero e por instância —
 * daí a onda.
 *
 * Domínio puro: nada aqui sabe de banco, de disco ou de sessão. Quem grava
 * consulta estas regras; elas não gravam nada.
 *
 * **Por que os tetos não são parâmetros do Parametrizador.** Mesmo motivo
 * que `arquivo-enviado.ts` já registra para a marca e o card: não são
 * régua de negócio, são a condição de arquitetura que torna guardar o
 * binário no banco uma decisão defensável. Afrouxá-los pela tela derrubaria
 * a premissa sem que ninguém revisse a decisão.
 */

export const ARTEFATOS_DERIVADOS = [
  "IMAGEM_DE_PECA",
  "SNAPSHOT_DE_EXPORTACAO",
  "KIT_DE_EXECUCAO",
] as const;

export type ArtefatoDerivado = (typeof ARTEFATOS_DERIVADOS)[number];

/**
 * Prefixo de chave por artefato — o formato das chaves que a plataforma
 * escreve desde a F11/F12, e que esta fase não muda:
 *
 *   `pecas/{campanhaId}/{hash}{ext}` · `listas-contato/{data}-{id}.csv` ·
 *   `kits/{campanhaId}/v{n}-{nome}`
 */
export const PREFIXO_POR_ARTEFATO: Record<ArtefatoDerivado, string> = {
  IMAGEM_DE_PECA: "pecas/",
  SNAPSHOT_DE_EXPORTACAO: "listas-contato/",
  KIT_DE_EXECUCAO: "kits/",
};

/** Nome do artefato nas mensagens — sujeito da frase, sempre com artigo. */
const SUJEITO_POR_ARTEFATO: Record<ArtefatoDerivado, string> = {
  IMAGEM_DE_PECA: "A imagem da peça",
  SNAPSHOT_DE_EXPORTACAO: "O arquivo da exportação",
  KIT_DE_EXECUCAO: "O pacote do kit",
};

/**
 * Tetos da RN71, por arquivo.
 *
 * A imagem da peça é a menor porque é a única que alguém envia: 1 MB é
 * folgado para arte de e-mail e aperta o suficiente para ninguém subir um
 * TIFF exportado sem pensar. Os outros dois são o que a plataforma produz
 * — 25 MB de CSV é uma lista de centenas de milhares de linhas, e 50 MB de
 * kit é o zip inteiro com peças e marcas dentro.
 */
export const TETO_POR_ARTEFATO: Record<ArtefatoDerivado, number> = {
  IMAGEM_DE_PECA: 1 * 1024 * 1024,
  SNAPSHOT_DE_EXPORTACAO: 25 * 1024 * 1024,
  KIT_DE_EXECUCAO: 50 * 1024 * 1024,
};

/**
 * Tipo do que se grava, quando a plataforma é quem produziu o arquivo.
 *
 * A imagem da peça fica de fora porque ela tem tipo REAL, apurado pelo
 * conteúdo na hora do envio (`dominio/campanhas/imagem-peca.ts`) — deduzir
 * o tipo dela pelo prefixo da chave seria justamente confiar no nome, que é
 * o que a régua de arquivo existe para não fazer.
 */
export const TIPO_MIME_DO_ARTEFATO_GERADO: Record<
  "SNAPSHOT_DE_EXPORTACAO" | "KIT_DE_EXECUCAO",
  string
> = {
  SNAPSHOT_DE_EXPORTACAO: "text/csv",
  KIT_DE_EXECUCAO: "application/zip",
};

/**
 * De qual artefato é esta chave. `null` quando o prefixo não é de nenhum
 * dos três — caso que não deveria existir, e por isso não é tratado como
 * erro aqui: quem grava decide o que fazer com o desconhecido.
 */
export function classificarChave(chave: string): ArtefatoDerivado | null {
  for (const artefato of ARTEFATOS_DERIVADOS) {
    if (chave.startsWith(PREFIXO_POR_ARTEFATO[artefato])) return artefato;
  }
  return null;
}

// ---------------------------------------------------------------------
// Chave órfã — RN55
// ---------------------------------------------------------------------

/**
 * A chave existe no registro e o conteúdo não existe em lugar nenhum.
 *
 * Classe própria, e não `Error` cru, porque a RN55 distingue por CLASSE:
 * é isto que faz a mensagem subir até a tela em vez de virar o genérico.
 * E classe própria em vez de reusar `ErroDeArquivo` porque a causa é
 * outra — ali é arquivo recusado por formato ou limite, aqui é arquivo que
 * a plataforma deveria ter e não tem.
 */
export class ErroDeArquivoAusente extends Error {
  readonly artefato: ArtefatoDerivado | null;

  constructor(mensagem: string, artefato: ArtefatoDerivado | null) {
    super(mensagem);
    this.name = "ErroDeArquivoAusente";
    this.artefato = artefato;
  }
}

/** O que fazer, por artefato — a segunda metade do que a RN55 exige. */
const REMEDIO_POR_ARTEFATO: Record<ArtefatoDerivado, string> = {
  IMAGEM_DE_PECA: "Reenvie a imagem na aba Peças da campanha e gere o kit outra vez.",
  SNAPSHOT_DE_EXPORTACAO: "Refaça a exportação da lista para gerar um snapshot novo.",
  KIT_DE_EXECUCAO: "Gere uma nova versão do kit na tela da campanha.",
};

/**
 * Mensagem da chave órfã: nomeia o artefato, a causa e o remédio.
 *
 * **A chave nunca entra no texto.** Ela carrega identificador interno de
 * campanha e de exportação, e a RN55 proíbe os dois na interface — o
 * artefato já diz o suficiente para a pessoa saber onde agir. A chave fica
 * no log do servidor, onde só a TI alcança.
 */
export function mensagemDeArquivoAusente(chave: string): string {
  const artefato = classificarChave(chave);
  if (artefato === null) {
    return (
      "O arquivo referenciado por este registro não está no armazenamento da plataforma. " +
      "Refaça a operação que o gerou — o registro continua íntegro, é o arquivo que falta."
    );
  }
  return (
    `${SUJEITO_POR_ARTEFATO[artefato]} não está no armazenamento da plataforma. ` +
    "Isso acontece com o que foi gerado antes desta versão, quando o arquivo ficava no disco " +
    "da máquina e não sobrevivia a um novo deploy. " +
    REMEDIO_POR_ARTEFATO[artefato]
  );
}

/** A falha pronta, para quem lê uma chave e não encontra conteúdo. */
export function erroDeArquivoAusente(chave: string): ErroDeArquivoAusente {
  return new ErroDeArquivoAusente(mensagemDeArquivoAusente(chave), classificarChave(chave));
}

// ---------------------------------------------------------------------
// Teto — e o que a ultrapassagem faz depende de quem produziu o arquivo
// ---------------------------------------------------------------------

export interface ExcessoDeTeto {
  artefato: ArtefatoDerivado;
  bytes: number;
  teto: number;
  /**
   * `true` recusa a gravação; `false` grava assim mesmo e sinaliza.
   *
   * **A distinção é quem produziu o arquivo.** Arquivo enviado por gente
   * recusa, porque quem enviou troca o arquivo e segue em frente. Artefato
   * que a própria plataforma gerou não pode recusar: travaria a ativação da
   * campanha sem remédio nenhum ao alcance de quem está na tela — o kit
   * grande não tem como ser "reduzido" por ela. Então o teto vira sinal, e
   * o sinal é o da condição objetiva da RN71.
   */
  recusa: boolean;
  mensagem: string;
}

/** Excesso sobre o teto do artefato desta chave, ou `null` se couber. */
export function excessoDeTeto(chave: string, bytes: number): ExcessoDeTeto | null {
  const artefato = classificarChave(chave);
  if (artefato === null) return null;

  const teto = TETO_POR_ARTEFATO[artefato];
  if (bytes <= teto) return null;

  const medida = `${formatarTamanho(bytes)} e o teto é ${formatarTamanho(teto)}`;
  if (artefato === "IMAGEM_DE_PECA") {
    return {
      artefato,
      bytes,
      teto,
      recusa: true,
      mensagem:
        `${SUJEITO_POR_ARTEFATO[artefato]} tem ${medida}. ` +
        "Reduza a imagem antes de enviar — exportar em WEBP ou diminuir a largura resolve na " +
        "maioria dos casos.",
    };
  }
  return {
    artefato,
    bytes,
    teto,
    recusa: false,
    mensagem:
      `${SUJEITO_POR_ARTEFATO[artefato]} tem ${medida}. O arquivo foi gravado assim mesmo: ` +
      "recusá-lo deixaria a operação sem saída, porque quem está na tela não tem como encolher " +
      "um artefato que a plataforma gerou. Este é o sinal da condição objetiva da RN71 — o " +
      "adapter de armazenamento de objetos precisa entrar em fase própria.",
  };
}

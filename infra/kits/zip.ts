import { crc32, deflateRawSync } from "node:zlib";

/**
 * Escritor mínimo de ZIP (formato PKZIP, método deflate) para empacotar o
 * kit de campanha. É deliberadamente pequeno e sem dependência nova: o
 * pacote tem CSV, JSON, markdown e imagens — nada que peça um empacotador
 * completo, e o formato definitivo de entrega à Minutrade ainda está
 * [A CONFIRMAR] (ver KitAdapter).
 *
 * A saída é determinística: mesma entrada e mesma data ⇒ mesmos bytes,
 * o que mantém o hash do kit verificável (RN45).
 */

export interface ArquivoDoZip {
  /** Caminho dentro do pacote (usa "/" como separador). */
  nome: string;
  conteudo: Buffer;
}

/** Data/hora no formato MS-DOS usado pelo ZIP. */
function dataDos(data: Date): { hora: number; dia: number } {
  const ano = Math.max(1980, data.getUTCFullYear());
  return {
    hora:
      (data.getUTCHours() << 11) |
      (data.getUTCMinutes() << 5) |
      Math.floor(data.getUTCSeconds() / 2),
    dia: ((ano - 1980) << 9) | ((data.getUTCMonth() + 1) << 5) | data.getUTCDate(),
  };
}

/**
 * Monta o pacote. `momento` entra nos cabeçalhos e é passado
 * explicitamente para o resultado ser reproduzível.
 */
export function criarZip(arquivos: ReadonlyArray<ArquivoDoZip>, momento: Date): Buffer {
  const { hora, dia } = dataDos(momento);
  const locais: Buffer[] = [];
  const central: Buffer[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, "utf8");
    const comprimido = deflateRawSync(arquivo.conteudo);
    const verificacao = crc32(arquivo.conteudo);

    const cabecalhoLocal = Buffer.alloc(30);
    cabecalhoLocal.writeUInt32LE(0x04034b50, 0);
    cabecalhoLocal.writeUInt16LE(20, 4); // versão necessária
    cabecalhoLocal.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    cabecalhoLocal.writeUInt16LE(8, 8); // método: deflate
    cabecalhoLocal.writeUInt16LE(hora, 10);
    cabecalhoLocal.writeUInt16LE(dia, 12);
    cabecalhoLocal.writeUInt32LE(verificacao, 14);
    cabecalhoLocal.writeUInt32LE(comprimido.length, 18);
    cabecalhoLocal.writeUInt32LE(arquivo.conteudo.length, 22);
    cabecalhoLocal.writeUInt16LE(nome.length, 26);
    cabecalhoLocal.writeUInt16LE(0, 28); // sem campo extra

    locais.push(cabecalhoLocal, nome, comprimido);

    const entradaCentral = Buffer.alloc(46);
    entradaCentral.writeUInt32LE(0x02014b50, 0);
    entradaCentral.writeUInt16LE(20, 4); // versão de origem
    entradaCentral.writeUInt16LE(20, 6); // versão necessária
    entradaCentral.writeUInt16LE(0x0800, 8);
    entradaCentral.writeUInt16LE(8, 10);
    entradaCentral.writeUInt16LE(hora, 12);
    entradaCentral.writeUInt16LE(dia, 14);
    entradaCentral.writeUInt32LE(verificacao, 16);
    entradaCentral.writeUInt32LE(comprimido.length, 20);
    entradaCentral.writeUInt32LE(arquivo.conteudo.length, 24);
    entradaCentral.writeUInt16LE(nome.length, 28);
    entradaCentral.writeUInt32LE(deslocamento, 42);

    central.push(entradaCentral, nome);
    deslocamento += cabecalhoLocal.length + nome.length + comprimido.length;
  }

  const corpoCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(corpoCentral.length, 12);
  fim.writeUInt32LE(deslocamento, 16);

  return Buffer.concat([...locais, corpoCentral, fim]);
}

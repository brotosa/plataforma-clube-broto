/**
 * Armazenamento dos snapshots de exportação (RN34): o arquivo CSV
 * materializado vai para o armazenamento de objetos e a linha de
 * exportacoes_lista guarda chave + hash.
 *
 * O destino de produção é o S3 (prompt da Onda 5); as credenciais/bucket
 * ainda não existem no ambiente — pendência isolada atrás desta porta,
 * como manda o CLAUDE.md. A implementação local grava em
 * var/exportacoes/ (fora do controle de versão) e serve desenvolvimento,
 * testes e e2e; o adapter S3 entra aqui sem tocar domínio nem telas.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ArmazenadorSnapshots {
  salvar(chave: string, conteudo: Buffer): Promise<void>;
  ler(chave: string): Promise<Buffer>;
}

const RAIZ_LOCAL = path.join(process.cwd(), "var", "exportacoes");

function caminhoSeguro(chave: string): string {
  const caminho = path.normalize(path.join(RAIZ_LOCAL, chave));
  if (!caminho.startsWith(RAIZ_LOCAL + path.sep)) {
    throw new Error("Chave de snapshot fora do diretório de exportações.");
  }
  return caminho;
}

/** Implementação local (desenvolvimento/CI); produção usará o adapter S3. */
export function criarArmazenadorLocal(): ArmazenadorSnapshots {
  return {
    async salvar(chave, conteudo) {
      const caminho = caminhoSeguro(chave);
      await mkdir(path.dirname(caminho), { recursive: true });
      await writeFile(caminho, conteudo);
    },
    async ler(chave) {
      return readFile(caminhoSeguro(chave));
    },
  };
}

/** Hash SHA-256 (hex) do snapshot — gravado na exportação (RN34). */
export function hashDeSnapshot(conteudo: Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

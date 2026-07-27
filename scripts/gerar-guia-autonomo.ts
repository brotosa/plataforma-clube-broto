import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMINHO_DO_AUTONOMO,
  montarDocumentoAutonomo,
} from "@/conteudo/guia-plataforma/autonomo";

/**
 * Gera o documento autônomo do Guia da Plataforma (Onda 9, ficha §1.6).
 *
 *     pnpm guia:gerar
 *
 * Rode depois de qualquer mudança em `conteudo/guia-plataforma` ou no
 * `dseed-admin.css`. Esquecer não passa despercebido: o teste de sincronia
 * em `infra/arquitetura/guia-fonte-unica.test.ts` regenera e compara, e
 * reprova quando o arquivo commitado ficou para trás.
 */

const documento = montarDocumentoAutonomo();
const destino = join(process.cwd(), CAMINHO_DO_AUTONOMO);
writeFileSync(destino, documento, "utf8");

const tamanho = (Buffer.byteLength(documento, "utf8") / 1024).toFixed(0);
process.stdout.write(`Guia da Plataforma gerado em ${CAMINHO_DO_AUTONOMO} (${tamanho} KB)\n`);

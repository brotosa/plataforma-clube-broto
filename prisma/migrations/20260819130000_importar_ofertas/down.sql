-- Reversão de 20260819130000_importar_ofertas.
-- Derruba a tabela de staging e recria TipoImportacao sem IMPORTA_OFERTAS
-- (mantendo IMPORTA_SOLUCOES, adicionado pela migration anterior).

ALTER TABLE "staging_ofertas_importadas" DROP CONSTRAINT "staging_ofertas_importadas_importacao_id_fkey";
DROP TABLE "staging_ofertas_importadas";

-- AlterEnum (remove IMPORTA_OFERTAS)
BEGIN;
CREATE TYPE "TipoImportacao_new" AS ENUM ('TELEMETRIA', 'CARGA_SELLERS', 'CARGA_OFERTAS', 'CARGA_PROSPECTS', 'ASSINANTES_NUCLEO', 'ASSINANTES_ENRIQUECIMENTO', 'IMPORTA_SOLUCOES');
ALTER TABLE "importacoes" ALTER COLUMN "tipo" TYPE "TipoImportacao_new" USING ("tipo"::text::"TipoImportacao_new");
ALTER TYPE "TipoImportacao" RENAME TO "TipoImportacao_old";
ALTER TYPE "TipoImportacao_new" RENAME TO "TipoImportacao";
DROP TYPE "TipoImportacao_old";
COMMIT;

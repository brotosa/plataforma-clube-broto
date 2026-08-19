-- Reversão de 20260819120000_importar_solucoes.
-- Aditiva na ida; a volta derruba a tabela e o enum novo, e recria
-- TipoImportacao sem o valor IMPORTA_SOLUCOES (Postgres não remove valor
-- de enum diretamente — mesmo padrão usado nas migrations da Onda 2).

-- DropForeignKey + DropTable (o índice e a FK caem com a tabela)
ALTER TABLE "staging_solucoes_importadas" DROP CONSTRAINT "staging_solucoes_importadas_importacao_id_fkey";
DROP TABLE "staging_solucoes_importadas";

-- DropEnum
DROP TYPE "AcaoImportacaoCatalogo";

-- AlterEnum (remove IMPORTA_SOLUCOES recriando o tipo sem ele)
BEGIN;
CREATE TYPE "TipoImportacao_new" AS ENUM ('TELEMETRIA', 'CARGA_SELLERS', 'CARGA_OFERTAS', 'CARGA_PROSPECTS', 'ASSINANTES_NUCLEO', 'ASSINANTES_ENRIQUECIMENTO');
ALTER TABLE "importacoes" ALTER COLUMN "tipo" TYPE "TipoImportacao_new" USING ("tipo"::text::"TipoImportacao_new");
ALTER TYPE "TipoImportacao" RENAME TO "TipoImportacao_old";
ALTER TYPE "TipoImportacao_new" RENAME TO "TipoImportacao";
DROP TYPE "TipoImportacao_old";
COMMIT;

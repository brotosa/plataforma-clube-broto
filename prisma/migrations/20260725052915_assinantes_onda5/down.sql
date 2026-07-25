-- AlterEnum
BEGIN;
CREATE TYPE "TipoImportacao_new" AS ENUM ('TELEMETRIA', 'CARGA_SELLERS', 'CARGA_OFERTAS');
ALTER TABLE "importacoes" ALTER COLUMN "tipo" TYPE "TipoImportacao_new" USING ("tipo"::text::"TipoImportacao_new");
ALTER TYPE "TipoImportacao" RENAME TO "TipoImportacao_old";
ALTER TYPE "TipoImportacao_new" RENAME TO "TipoImportacao";
DROP TYPE "TipoImportacao_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "assinaturas" DROP CONSTRAINT "assinaturas_assinante_id_fkey";

-- DropForeignKey
ALTER TABLE "atributos_enriquecimento" DROP CONSTRAINT "atributos_enriquecimento_assinante_id_fkey";

-- DropForeignKey
ALTER TABLE "atributos_enriquecimento" DROP CONSTRAINT "atributos_enriquecimento_catalogo_id_fkey";

-- DropForeignKey
ALTER TABLE "atributos_enriquecimento" DROP CONSTRAINT "atributos_enriquecimento_importacao_id_fkey";

-- DropForeignKey
ALTER TABLE "segmentos" DROP CONSTRAINT "segmentos_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "exportacoes_lista" DROP CONSTRAINT "exportacoes_lista_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "exportacoes_lista" DROP CONSTRAINT "exportacoes_lista_segmento_id_fkey";

-- DropForeignKey
ALTER TABLE "staging_assinantes" DROP CONSTRAINT "staging_assinantes_importacao_id_fkey";

-- AlterTable
ALTER TABLE "importacoes" DROP COLUMN "mapeamento_colunas",
DROP COLUMN "politica",
DROP COLUMN "resumo";

-- DropTable
DROP TABLE "assinantes";

-- DropTable
DROP TABLE "assinaturas";

-- DropTable
DROP TABLE "catalogo_atributos";

-- DropTable
DROP TABLE "atributos_enriquecimento";

-- DropTable
DROP TABLE "segmentos";

-- DropTable
DROP TABLE "exportacoes_lista";

-- DropTable
DROP TABLE "staging_assinantes";

-- DropEnum
DROP TYPE "PoliticaImportacao";

-- DropEnum
DROP TYPE "PreferenciaAssinante";

-- DropEnum
DROP TYPE "StatusBaseAssinante";

-- DropEnum
DROP TYPE "PlanoAssinatura";


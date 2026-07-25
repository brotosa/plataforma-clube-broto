-- AlterEnum
BEGIN;
CREATE TYPE "Papel_new" AS ENUM ('GESTOR', 'ANALISTA', 'APROVADOR', 'LEITURA');
ALTER TABLE "usuarios" ALTER COLUMN "papel" TYPE "Papel_new" USING ("papel"::text::"Papel_new");
ALTER TYPE "Papel" RENAME TO "Papel_old";
ALTER TYPE "Papel_new" RENAME TO "Papel";
DROP TYPE "Papel_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "EstagioEmpresa_new" AS ENUM ('EM_NEGOCIACAO', 'ALIADA_ATIVA', 'SUSPENSA', 'ENCERRADA');
ALTER TABLE "empresas" ALTER COLUMN "estagio" DROP DEFAULT;
ALTER TABLE "empresas" ALTER COLUMN "estagio" TYPE "EstagioEmpresa_new" USING ("estagio"::text::"EstagioEmpresa_new");
ALTER TYPE "EstagioEmpresa" RENAME TO "EstagioEmpresa_old";
ALTER TYPE "EstagioEmpresa_new" RENAME TO "EstagioEmpresa";
DROP TYPE "EstagioEmpresa_old";
ALTER TABLE "empresas" ALTER COLUMN "estagio" SET DEFAULT 'EM_NEGOCIACAO';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TipoImportacao_new" AS ENUM ('TELEMETRIA', 'CARGA_SELLERS', 'CARGA_OFERTAS');
ALTER TABLE "importacoes" ALTER COLUMN "tipo" TYPE "TipoImportacao_new" USING ("tipo"::text::"TipoImportacao_new");
ALTER TYPE "TipoImportacao" RENAME TO "TipoImportacao_old";
ALTER TYPE "TipoImportacao_new" RENAME TO "TipoImportacao";
DROP TYPE "TipoImportacao_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "empresas" DROP CONSTRAINT "empresas_motivo_descarte_id_fkey";

-- DropForeignKey
ALTER TABLE "empresas" DROP CONSTRAINT "empresas_responsavel_scout_id_fkey";

-- DropForeignKey
ALTER TABLE "empresas" DROP CONSTRAINT "empresas_responsavel_comercial_id_fkey";

-- DropForeignKey
ALTER TABLE "notas_rapidas" DROP CONSTRAINT "notas_rapidas_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "notas_rapidas" DROP CONSTRAINT "notas_rapidas_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "registros_negociacao" DROP CONSTRAINT "registros_negociacao_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "registros_negociacao" DROP CONSTRAINT "registros_negociacao_responsavel_id_fkey";

-- DropForeignKey
ALTER TABLE "staging_empresas" DROP CONSTRAINT "staging_empresas_importacao_id_fkey";

-- DropIndex
DROP INDEX "empresas_estagio_idx";

-- AlterTable
ALTER TABLE "empresas" DROP COLUMN "data_entrada_radar",
DROP COLUMN "estagio_desde",
DROP COLUMN "motivo_descarte_comentario",
DROP COLUMN "motivo_descarte_descricao",
DROP COLUMN "motivo_descarte_id",
DROP COLUMN "origem",
DROP COLUMN "responsavel_comercial_id",
DROP COLUMN "responsavel_scout_id";

-- AlterTable
ALTER TABLE "importacoes" DROP COLUMN "configuracao_mapeamento";

-- DropTable
DROP TABLE "motivos_descarte";

-- DropTable
DROP TABLE "notas_rapidas";

-- DropTable
DROP TABLE "registros_negociacao";

-- DropTable
DROP TABLE "staging_empresas";

-- DropEnum
DROP TYPE "OrigemEmpresa";

-- DropEnum
DROP TYPE "TipoRegistroNegociacao";


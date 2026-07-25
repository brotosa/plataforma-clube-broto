-- Reversão completa da onda2_f8_dossie_assistido: remove o dossiê de due
-- diligence (execuções, dossiês) e seus enums. Aplicar manualmente
-- (psql -f down.sql) e remover o registro de _prisma_migrations,
-- conforme o LEIA-ME.

-- DropForeignKey
ALTER TABLE "dossie_execucoes" DROP CONSTRAINT "dossie_execucoes_dossie_id_fkey";

-- DropForeignKey
ALTER TABLE "dossies" DROP CONSTRAINT "dossies_revisor_id_fkey";

-- DropForeignKey
ALTER TABLE "dossies" DROP CONSTRAINT "dossies_solicitante_id_fkey";

-- DropForeignKey
ALTER TABLE "dossies" DROP CONSTRAINT "dossies_empresa_id_fkey";

-- DropTable
DROP TABLE "dossie_execucoes";

-- DropTable
DROP TABLE "dossies";

-- DropEnum
DROP TYPE "OrigemDossie";

-- DropEnum
DROP TYPE "StatusDossie";

-- Reversão completa da onda2_f9_metas_periodo: remove as metas de
-- período e seu enum. Aplicar manualmente (psql -f down.sql) e remover o
-- registro de _prisma_migrations, conforme o LEIA-ME.

-- DropForeignKey
ALTER TABLE "metas_periodo" DROP CONSTRAINT "metas_periodo_categoria_id_fkey";

-- DropTable (leva junto índices parciais e CHECKs da RN28)
DROP TABLE "metas_periodo";

-- DropEnum
DROP TYPE "PeriodoMeta";

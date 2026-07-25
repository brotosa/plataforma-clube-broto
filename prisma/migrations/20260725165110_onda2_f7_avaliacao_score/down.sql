-- Reversão completa da onda2_f7_avaliacao_score: remove avaliação de
-- scout (notas, avaliações, indicadores), enums e a marca de reavaliação
-- da empresa. Aplicar manualmente (psql -f down.sql) e remover o registro
-- de _prisma_migrations, conforme o LEIA-ME.

-- DropForeignKey
ALTER TABLE "avaliacao_notas" DROP CONSTRAINT "avaliacao_notas_indicador_id_fkey";

-- DropForeignKey
ALTER TABLE "avaliacao_notas" DROP CONSTRAINT "avaliacao_notas_avaliacao_id_fkey";

-- DropForeignKey
ALTER TABLE "avaliacoes_scout" DROP CONSTRAINT "avaliacoes_scout_avaliador_id_fkey";

-- DropForeignKey
ALTER TABLE "avaliacoes_scout" DROP CONSTRAINT "avaliacoes_scout_empresa_id_fkey";

-- DropTable
DROP TABLE "avaliacao_notas";

-- DropTable
DROP TABLE "avaliacoes_scout";

-- DropTable
DROP TABLE "indicadores";

-- AlterTable
ALTER TABLE "empresas" DROP COLUMN "reavaliacao_pendente";

-- DropEnum
DROP TYPE "RecomendacaoAvaliacao";

-- DropEnum
DROP TYPE "StatusAvaliacao";

-- DropEnum
DROP TYPE "GrupoIndicador";

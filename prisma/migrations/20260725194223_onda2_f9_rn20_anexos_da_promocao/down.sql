-- Reversão da onda2_f9_rn20_anexos_da_promocao: remove os anexos do
-- pedido de promoção (avaliação vigente e dossiê). Aplicar manualmente
-- (psql -f down.sql) e remover o registro de _prisma_migrations,
-- conforme o LEIA-ME.

-- DropForeignKey
ALTER TABLE "aprovacao_solicitacoes" DROP CONSTRAINT "aprovacao_solicitacoes_dossie_vigente_id_fkey";

-- DropForeignKey
ALTER TABLE "aprovacao_solicitacoes" DROP CONSTRAINT "aprovacao_solicitacoes_avaliacao_vigente_id_fkey";

-- AlterTable
ALTER TABLE "aprovacao_solicitacoes" DROP COLUMN "dossie_vigente_id";
ALTER TABLE "aprovacao_solicitacoes" DROP COLUMN "avaliacao_vigente_id";

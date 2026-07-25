-- Reversão da onda3_f10_payload_de_solicitacao. Aplicar manualmente
-- (psql -f down.sql) e remover o registro de _prisma_migrations, conforme
-- o LEIA-ME.

-- AlterTable
ALTER TABLE "aprovacao_solicitacoes" DROP COLUMN "payload";

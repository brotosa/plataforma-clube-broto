-- Reversão da F30.
ALTER TABLE "execucoes_relatorio" DROP CONSTRAINT "execucoes_relatorio_painel_id_fkey";
DROP INDEX "execucoes_relatorio_painel_id_criado_em_idx";
ALTER TABLE "execucoes_relatorio" DROP COLUMN "painel_id";
DROP TABLE "paineis";

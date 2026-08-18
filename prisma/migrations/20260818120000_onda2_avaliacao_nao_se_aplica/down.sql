-- Reversão de 20260818120000_onda2_avaliacao_nao_se_aplica.
--
-- Pré-condição: nenhuma linha em estado N/A (nota NULL / nao_se_aplica=true).
-- Como a coluna volta a ser NOT NULL, a reversão só é segura antes de o
-- recurso ser usado — se houver N/A gravado, remova ou converta essas linhas
-- primeiro (decisão de negócio, não de schema).
ALTER TABLE "avaliacao_notas" DROP CONSTRAINT "avaliacao_notas_nota_ou_nao_se_aplica";
ALTER TABLE "avaliacao_notas" DROP COLUMN "nao_se_aplica";
ALTER TABLE "avaliacao_notas" ALTER COLUMN "nota" SET NOT NULL;

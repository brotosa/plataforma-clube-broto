-- Reversão da migration 20260914180000_validade_senha_e_teto_sessao.
-- Aditiva: só acrescentou colunas com default / anuláveis.
ALTER TABLE "configuracao_portal" DROP COLUMN "senha_validade_dias";
ALTER TABLE "configuracao_portal" DROP COLUMN "sessao_teto_min";
ALTER TABLE "usuarios" DROP COLUMN "senha_alterada_em";

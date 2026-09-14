-- Reversão da migration 20260911210000_configuracoes_bloqueio_login.
-- Aditiva: só acrescentou colunas com default / anuláveis.
ALTER TABLE "usuarios" DROP COLUMN "login_tentativas";
ALTER TABLE "usuarios" DROP COLUMN "login_bloqueado_ate";
ALTER TABLE "configuracao_portal" DROP COLUMN "login_max_tentativas";
ALTER TABLE "configuracao_portal" DROP COLUMN "login_bloqueio_min";

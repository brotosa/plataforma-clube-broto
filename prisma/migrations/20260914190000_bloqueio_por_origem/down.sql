-- Reversão da migration 20260914190000_bloqueio_por_origem.
DROP TABLE "bloqueios_origem";
ALTER TABLE "configuracao_portal" DROP COLUMN "origem_max_tentativas";
ALTER TABLE "configuracao_portal" DROP COLUMN "origem_bloqueio_min";

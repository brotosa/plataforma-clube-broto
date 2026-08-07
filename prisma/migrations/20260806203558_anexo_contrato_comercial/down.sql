-- Reversão da migration 20260806203558_anexo_contrato_comercial.
-- Aditiva: só criou a tabela anexos_contrato (1:1 com contratos_comerciais).
-- As FKs caem junto com a tabela.
DROP TABLE "anexos_contrato";

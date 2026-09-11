-- Reversão da migration 20260911200000_configuracoes_tempo_sessao.
-- Aditiva: só acrescentou uma coluna com default à tabela configuracao_portal.
ALTER TABLE "configuracao_portal" DROP COLUMN "tempo_sessao_min";

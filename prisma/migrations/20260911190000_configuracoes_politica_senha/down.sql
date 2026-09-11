-- Reversão da migration 20260911190000_configuracoes_politica_senha.
-- Aditiva: só criou duas tabelas novas (senhas_historico e configuracao_portal).
-- Nenhuma coluna foi tocada em tabela existente; as FKs caem com a tabela.
DROP TABLE "senhas_historico";
DROP TABLE "configuracao_portal";

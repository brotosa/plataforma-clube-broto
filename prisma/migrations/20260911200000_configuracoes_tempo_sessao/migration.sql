-- AlterTable (aditivo): novo campo com DEFAULT, seguro sobre linha existente.
ALTER TABLE "configuracao_portal" ADD COLUMN "tempo_sessao_min" INTEGER NOT NULL DEFAULT 30;

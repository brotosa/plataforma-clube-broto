-- AlterTable (aditivo): parâmetros do bloqueio por origem, DESLIGADO por
-- padrão (0). Subir não muda o comportamento de ninguém.
ALTER TABLE "configuracao_portal" ADD COLUMN "origem_max_tentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "configuracao_portal" ADD COLUMN "origem_bloqueio_min" INTEGER NOT NULL DEFAULT 15;

-- CreateTable: uma linha por endereço de rede visto falhando.
CREATE TABLE "bloqueios_origem" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_ate" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bloqueios_origem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bloqueios_origem_origem_key" ON "bloqueios_origem"("origem");
CREATE INDEX "bloqueios_origem_bloqueado_ate_idx" ON "bloqueios_origem"("bloqueado_ate");

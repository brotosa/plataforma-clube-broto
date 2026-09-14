-- AlterTable (aditivo): contadores de bloqueio por usuário. Coluna com DEFAULT
-- e coluna anulável — seguras sobre linhas existentes (base povoada).
ALTER TABLE "usuarios" ADD COLUMN "login_tentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "usuarios" ADD COLUMN "login_bloqueado_ate" TIMESTAMP(3);

-- AlterTable (aditivo): parâmetros do bloqueio no singleton de configuração.
ALTER TABLE "configuracao_portal" ADD COLUMN "login_max_tentativas" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "configuracao_portal" ADD COLUMN "login_bloqueio_min" INTEGER NOT NULL DEFAULT 15;

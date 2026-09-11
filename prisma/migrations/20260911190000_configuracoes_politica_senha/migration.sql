-- CreateTable
CREATE TABLE "senhas_historico" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senhas_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "senhas_historico_usuario_id_criado_em_idx" ON "senhas_historico"("usuario_id", "criado_em");

-- AddForeignKey
ALTER TABLE "senhas_historico" ADD CONSTRAINT "senhas_historico_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "configuracao_portal" (
    "id" TEXT NOT NULL,
    "senha_comprimento_min" INTEGER NOT NULL DEFAULT 10,
    "senha_exige_maiuscula" BOOLEAN NOT NULL DEFAULT false,
    "senha_exige_minuscula" BOOLEAN NOT NULL DEFAULT false,
    "senha_exige_numero" BOOLEAN NOT NULL DEFAULT false,
    "senha_exige_simbolo" BOOLEAN NOT NULL DEFAULT false,
    "senha_historico_n" INTEGER NOT NULL DEFAULT 5,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_portal_pkey" PRIMARY KEY ("id")
);

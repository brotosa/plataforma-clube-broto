-- Painel de atividades da ficha do aliado. A "nota rápida" (dormante desde a
-- Onda 2) passa a ser o comentário da equipe: editável/removível pelo autor
-- (soft-delete), marcável como pendência (aberta/resolvida) e com menção de
-- usuários. Totalmente aditiva sobre a base povoada — nenhuma coluna exigida
-- sobre linha existente, nenhum tipo estreitado.

-- AlterTable
ALTER TABLE "notas_rapidas" ADD COLUMN     "editado_em" TIMESTAMP(3),
ADD COLUMN     "eh_pendencia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendencia_resolvida_em" TIMESTAMP(3),
ADD COLUMN     "removido_em" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "nota_rapida_mencoes" (
    "id" TEXT NOT NULL,
    "nota_rapida_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_rapida_mencoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nota_rapida_mencoes_usuario_id_idx" ON "nota_rapida_mencoes"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "nota_rapida_mencoes_nota_rapida_id_usuario_id_key" ON "nota_rapida_mencoes"("nota_rapida_id", "usuario_id");

-- CreateIndex
CREATE INDEX "notas_rapidas_empresa_id_criado_em_idx" ON "notas_rapidas"("empresa_id", "criado_em");

-- AddForeignKey
ALTER TABLE "nota_rapida_mencoes" ADD CONSTRAINT "nota_rapida_mencoes_nota_rapida_id_fkey" FOREIGN KEY ("nota_rapida_id") REFERENCES "notas_rapidas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_rapida_mencoes" ADD CONSTRAINT "nota_rapida_mencoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

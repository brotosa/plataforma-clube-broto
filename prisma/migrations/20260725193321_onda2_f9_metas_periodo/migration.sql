-- CreateEnum
CREATE TYPE "PeriodoMeta" AS ENUM ('MENSAL', 'TRIMESTRAL', 'ANUAL');

-- CreateTable
CREATE TABLE "metas_periodo" (
    "id" TEXT NOT NULL,
    "periodo" "PeriodoMeta" NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "categoria_id" TEXT,
    "valor" INTEGER NOT NULL,
    "origem" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metas_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metas_periodo_inicio_fim_idx" ON "metas_periodo"("inicio", "fim");

-- AddForeignKey
ALTER TABLE "metas_periodo" ADD CONSTRAINT "metas_periodo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RN28 no banco (a edição chega na T17 da Onda 3, mas a garantia é do
-- modelo): uma meta GERAL vigente por período e, no máximo, uma por
-- categoria por período. São dois índices parciais porque, em Postgres,
-- NULLs não colidem num índice único comum — sem eles, duas metas gerais
-- do mesmo período passariam.
CREATE UNIQUE INDEX "metas_periodo_geral_unica" ON "metas_periodo" ("periodo", "inicio") WHERE "categoria_id" IS NULL;
CREATE UNIQUE INDEX "metas_periodo_categoria_unica" ON "metas_periodo" ("periodo", "inicio", "categoria_id") WHERE "categoria_id" IS NOT NULL;

-- Janela coerente e meta positiva: fim é exclusivo e sempre posterior ao início.
ALTER TABLE "metas_periodo" ADD CONSTRAINT "metas_periodo_janela_coerente" CHECK ("fim" > "inicio");
ALTER TABLE "metas_periodo" ADD CONSTRAINT "metas_periodo_valor_positivo" CHECK ("valor" > 0);

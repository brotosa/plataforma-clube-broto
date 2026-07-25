-- CreateEnum
CREATE TYPE "GrupoIndicador" AS ENUM ('EMPRESA', 'PRODUTO');

-- CreateEnum
CREATE TYPE "StatusAvaliacao" AS ENUM ('RASCUNHO', 'FECHADA');

-- CreateEnum
CREATE TYPE "RecomendacaoAvaliacao" AS ENUM ('AVANCAR', 'MONITORAR', 'DESCARTAR');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "reavaliacao_pendente" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "indicadores" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "grupo" "GrupoIndicador" NOT NULL,
    "dimensao" TEXT NOT NULL,
    "peso" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "indicadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_scout" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "avaliador_id" TEXT NOT NULL,
    "status" "StatusAvaliacao" NOT NULL DEFAULT 'RASCUNHO',
    "recomendacao" "RecomendacaoAvaliacao",
    "subtotais" JSONB,
    "total" INTEGER,
    "fechada_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_scout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacao_notas" (
    "id" TEXT NOT NULL,
    "avaliacao_id" TEXT NOT NULL,
    "indicador_id" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "evidencia" TEXT,

    CONSTRAINT "avaliacao_notas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indicadores_slug_key" ON "indicadores"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "indicadores_nome_key" ON "indicadores"("nome");

-- CreateIndex
CREATE INDEX "avaliacoes_scout_empresa_id_status_idx" ON "avaliacoes_scout"("empresa_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_scout_empresa_id_versao_key" ON "avaliacoes_scout"("empresa_id", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacao_notas_avaliacao_id_indicador_id_key" ON "avaliacao_notas"("avaliacao_id", "indicador_id");

-- AddForeignKey
ALTER TABLE "avaliacoes_scout" ADD CONSTRAINT "avaliacoes_scout_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_scout" ADD CONSTRAINT "avaliacoes_scout_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_notas" ADD CONSTRAINT "avaliacao_notas_avaliacao_id_fkey" FOREIGN KEY ("avaliacao_id") REFERENCES "avaliacoes_scout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_notas" ADD CONSTRAINT "avaliacao_notas_indicador_id_fkey" FOREIGN KEY ("indicador_id") REFERENCES "indicadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Faixas da ficha §3.2/§3.3 também no banco (reforço das validações de
-- domínio): nota na escala 1–5 e total na escala 0–100.
ALTER TABLE "avaliacao_notas" ADD CONSTRAINT "avaliacao_notas_nota_na_escala_1_a_5" CHECK ("nota" BETWEEN 1 AND 5);
ALTER TABLE "avaliacoes_scout" ADD CONSTRAINT "avaliacoes_scout_total_na_escala_0_a_100" CHECK ("total" IS NULL OR ("total" >= 0 AND "total" <= 100));

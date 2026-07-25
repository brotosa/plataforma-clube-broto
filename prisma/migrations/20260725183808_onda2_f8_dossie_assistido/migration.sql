-- CreateEnum
CREATE TYPE "StatusDossie" AS ENUM ('GERANDO', 'PRONTO', 'FALHA');

-- CreateEnum
CREATE TYPE "OrigemDossie" AS ENUM ('GERADO_IA', 'INSERIDO_MANUALMENTE');

-- CreateTable
CREATE TABLE "dossies" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "status" "StatusDossie" NOT NULL DEFAULT 'GERANDO',
    "origem" "OrigemDossie" NOT NULL,
    "conteudo" JSONB,
    "versao_template" TEXT,
    "solicitante_id" TEXT NOT NULL,
    "contexto_adicional" TEXT,
    "revisado" BOOLEAN NOT NULL DEFAULT false,
    "revisor_id" TEXT,
    "revisado_em" TIMESTAMP(3),
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dossies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossie_execucoes" (
    "id" TEXT NOT NULL,
    "dossie_id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "modelo" TEXT,
    "tentativa" INTEGER NOT NULL,
    "iniciada_em" TIMESTAMP(3) NOT NULL,
    "concluida_em" TIMESTAMP(3),
    "duracao_ms" INTEGER,
    "tokens_entrada" INTEGER,
    "tokens_saida" INTEGER,
    "buscas_web" INTEGER,
    "custo_brl" DECIMAL(12,4),
    "sucesso" BOOLEAN NOT NULL DEFAULT false,
    "erro" TEXT,
    "versao_template" TEXT NOT NULL,

    CONSTRAINT "dossie_execucoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dossies_empresa_id_idx" ON "dossies"("empresa_id");

-- CreateIndex
CREATE INDEX "dossie_execucoes_iniciada_em_idx" ON "dossie_execucoes"("iniciada_em");

-- CreateIndex
CREATE UNIQUE INDEX "dossie_execucoes_dossie_id_tentativa_key" ON "dossie_execucoes"("dossie_id", "tentativa");

-- AddForeignKey
ALTER TABLE "dossies" ADD CONSTRAINT "dossies_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossies" ADD CONSTRAINT "dossies_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossies" ADD CONSTRAINT "dossies_revisor_id_fkey" FOREIGN KEY ("revisor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossie_execucoes" ADD CONSTRAINT "dossie_execucoes_dossie_id_fkey" FOREIGN KEY ("dossie_id") REFERENCES "dossies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RN19 também no banco (reforço das validações de domínio): a marca de
-- revisão só existe com autoria e data humanas — não há dossiê "revisado"
-- sem revisor. E o conteúdo das dez etapas só é exigido quando pronto.
ALTER TABLE "dossies" ADD CONSTRAINT "dossies_revisao_exige_autor_e_data" CHECK ("revisado" = false OR ("revisor_id" IS NOT NULL AND "revisado_em" IS NOT NULL));
ALTER TABLE "dossies" ADD CONSTRAINT "dossies_pronto_exige_conteudo" CHECK ("status" <> 'PRONTO' OR "conteudo" IS NOT NULL);

-- Telemetria de consumo: grandezas de execução nunca são negativas.
ALTER TABLE "dossie_execucoes" ADD CONSTRAINT "dossie_execucoes_grandezas_nao_negativas" CHECK (
  "tentativa" >= 1
  AND ("duracao_ms" IS NULL OR "duracao_ms" >= 0)
  AND ("tokens_entrada" IS NULL OR "tokens_entrada" >= 0)
  AND ("tokens_saida" IS NULL OR "tokens_saida" >= 0)
  AND ("buscas_web" IS NULL OR "buscas_web" >= 0)
  AND ("custo_brl" IS NULL OR "custo_brl" >= 0)
);

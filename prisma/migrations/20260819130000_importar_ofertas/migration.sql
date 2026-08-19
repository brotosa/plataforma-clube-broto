-- Importador self-service de ofertas (planilha → conferência → efetivação).
-- Estritamente ADITIVA: adiciona um valor a TipoImportacao e cria a tabela
-- de staging. Nenhuma alteração em tabela já povoada.

-- AlterEnum
ALTER TYPE "TipoImportacao" ADD VALUE 'IMPORTA_OFERTAS';

-- CreateTable
CREATE TABLE "staging_ofertas_importadas" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "linha_origem" INTEGER NOT NULL,
    "dados_originais" JSONB NOT NULL,
    "acao" "AcaoImportacaoCatalogo",
    "solucao_id_resolvida" TEXT,
    "oferta_id_resolvida" TEXT,
    "estado" "EstadoStaging" NOT NULL DEFAULT 'PENDENTE',
    "mensagem_erro" TEXT,
    "oferta_id_efetivada" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_ofertas_importadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staging_ofertas_importadas_importacao_id_idx" ON "staging_ofertas_importadas"("importacao_id");

-- AddForeignKey
ALTER TABLE "staging_ofertas_importadas" ADD CONSTRAINT "staging_ofertas_importadas_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

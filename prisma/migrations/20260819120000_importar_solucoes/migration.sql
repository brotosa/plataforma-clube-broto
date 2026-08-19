-- Importador self-service de soluções (planilha → conferência → efetivação).
-- Estritamente ADITIVA: cria enum novo, adiciona um valor a TipoImportacao e
-- cria a tabela de staging. Nenhuma alteração em tabela já povoada.

-- CreateEnum
CREATE TYPE "AcaoImportacaoCatalogo" AS ENUM ('CRIAR', 'ENRIQUECER');

-- AlterEnum
ALTER TYPE "TipoImportacao" ADD VALUE 'IMPORTA_SOLUCOES';

-- CreateTable
CREATE TABLE "staging_solucoes_importadas" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "linha_origem" INTEGER NOT NULL,
    "dados_originais" JSONB NOT NULL,
    "cnpj" TEXT,
    "nome_solucao" TEXT,
    "descricao_curta" TEXT,
    "descricao_completa" TEXT,
    "categoria_texto" TEXT,
    "link_externo" TEXT,
    "culturas_texto" TEXT,
    "cobertura_texto" TEXT,
    "acao" "AcaoImportacaoCatalogo",
    "empresa_id_resolvida" TEXT,
    "solucao_id_resolvida" TEXT,
    "estado" "EstadoStaging" NOT NULL DEFAULT 'PENDENTE',
    "mensagem_erro" TEXT,
    "solucao_id_efetivada" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_solucoes_importadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staging_solucoes_importadas_importacao_id_idx" ON "staging_solucoes_importadas"("importacao_id");

-- AddForeignKey
ALTER TABLE "staging_solucoes_importadas" ADD CONSTRAINT "staging_solucoes_importadas_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

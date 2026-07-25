-- CreateEnum
CREATE TYPE "PoliticaImportacao" AS ENUM ('INCREMENTAL', 'FOTO_COMPLETA');

-- CreateEnum
CREATE TYPE "PreferenciaAssinante" AS ENUM ('AGRICULTURA', 'PECUARIA', 'AMBOS');

-- CreateEnum
CREATE TYPE "StatusBaseAssinante" AS ENUM ('ATIVO', 'FORA_DA_BASE');

-- CreateEnum
CREATE TYPE "PlanoAssinatura" AS ENUM ('MENSAL', 'ANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoImportacao" ADD VALUE 'ASSINANTES_NUCLEO';
ALTER TYPE "TipoImportacao" ADD VALUE 'ASSINANTES_ENRIQUECIMENTO';

-- AlterTable
ALTER TABLE "importacoes" ADD COLUMN     "mapeamento_colunas" JSONB,
ADD COLUMN     "politica" "PoliticaImportacao",
ADD COLUMN     "resumo" JSONB;

-- CreateTable
CREATE TABLE "assinantes" (
    "id" TEXT NOT NULL,
    "cpf_hash" TEXT NOT NULL,
    "cpf_cifrado" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco_bruto" TEXT,
    "cep" TEXT,
    "uf" TEXT,
    "municipio" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "preferencia" "PreferenciaAssinante",
    "status_base" "StatusBaseAssinante" NOT NULL DEFAULT 'ATIVO',
    "marca_sintetico" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "assinante_id" TEXT NOT NULL,
    "plano" "PlanoAssinatura",
    "status" TEXT,
    "vencimento" DATE,
    "origem_dado" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo_atributos" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogo_atributos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atributos_enriquecimento" (
    "id" TEXT NOT NULL,
    "assinante_id" TEXT NOT NULL,
    "catalogo_id" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "data_referencia" DATE NOT NULL,
    "importacao_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atributos_enriquecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmentos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "regras" JSONB NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segmentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exportacoes_lista" (
    "id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "contagem" INTEGER NOT NULL,
    "regras" JSONB NOT NULL,
    "segmento_id" TEXT,
    "arquivo_chave" TEXT NOT NULL,
    "hash_arquivo" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exportacoes_lista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_assinantes" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "linha_origem" INTEGER NOT NULL,
    "dados_originais" JSONB NOT NULL,
    "campos_mapeados" JSONB,
    "cpf_hash" TEXT,
    "cpf_cifrado" TEXT,
    "estado" "EstadoStaging" NOT NULL DEFAULT 'PENDENTE',
    "mensagem_erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staging_assinantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinantes_cpf_hash_key" ON "assinantes"("cpf_hash");

-- CreateIndex
CREATE INDEX "assinantes_uf_idx" ON "assinantes"("uf");

-- CreateIndex
CREATE INDEX "assinantes_municipio_idx" ON "assinantes"("municipio");

-- CreateIndex
CREATE INDEX "assinantes_preferencia_idx" ON "assinantes"("preferencia");

-- CreateIndex
CREATE INDEX "assinantes_status_base_idx" ON "assinantes"("status_base");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_assinante_id_key" ON "assinaturas"("assinante_id");

-- CreateIndex
CREATE INDEX "assinaturas_vencimento_idx" ON "assinaturas"("vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_atributos_slug_key" ON "catalogo_atributos"("slug");

-- CreateIndex
CREATE INDEX "atributos_enriquecimento_catalogo_id_valor_idx" ON "atributos_enriquecimento"("catalogo_id", "valor");

-- CreateIndex
CREATE INDEX "atributos_enriquecimento_assinante_id_idx" ON "atributos_enriquecimento"("assinante_id");

-- CreateIndex
CREATE INDEX "staging_assinantes_importacao_id_idx" ON "staging_assinantes"("importacao_id");

-- CreateIndex
CREATE INDEX "staging_assinantes_importacao_id_cpf_hash_idx" ON "staging_assinantes"("importacao_id", "cpf_hash");

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atributos_enriquecimento" ADD CONSTRAINT "atributos_enriquecimento_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atributos_enriquecimento" ADD CONSTRAINT "atributos_enriquecimento_catalogo_id_fkey" FOREIGN KEY ("catalogo_id") REFERENCES "catalogo_atributos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atributos_enriquecimento" ADD CONSTRAINT "atributos_enriquecimento_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmentos" ADD CONSTRAINT "segmentos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exportacoes_lista" ADD CONSTRAINT "exportacoes_lista_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exportacoes_lista" ADD CONSTRAINT "exportacoes_lista_segmento_id_fkey" FOREIGN KEY ("segmento_id") REFERENCES "segmentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_assinantes" ADD CONSTRAINT "staging_assinantes_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

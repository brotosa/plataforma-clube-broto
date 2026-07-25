-- CreateEnum
CREATE TYPE "OrigemEmpresa" AS ENUM ('SCOUTING_ATIVO', 'INDICACAO', 'PROCURA_ESPONTANEA', 'LISTA_IMPORTADA');

-- CreateEnum
CREATE TYPE "TipoRegistroNegociacao" AS ENUM ('REUNIAO', 'PROPOSTA_ENVIADA', 'FOLLOW_UP', 'OUTRO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstagioEmpresa" ADD VALUE 'MAPEADA';
ALTER TYPE "EstagioEmpresa" ADD VALUE 'EM_AVALIACAO';
ALTER TYPE "EstagioEmpresa" ADD VALUE 'PRIORIZADA';
ALTER TYPE "EstagioEmpresa" ADD VALUE 'EM_APROVACAO';
ALTER TYPE "EstagioEmpresa" ADD VALUE 'DESCARTADA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Papel" ADD VALUE 'ANALISTA_SCOUT';
ALTER TYPE "Papel" ADD VALUE 'COMERCIAL';

-- AlterEnum
ALTER TYPE "TipoImportacao" ADD VALUE 'CARGA_PROSPECTS';

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "data_entrada_radar" DATE,
ADD COLUMN     "estagio_desde" TIMESTAMP(3),
ADD COLUMN     "motivo_descarte_comentario" TEXT,
ADD COLUMN     "motivo_descarte_descricao" TEXT,
ADD COLUMN     "motivo_descarte_id" TEXT,
ADD COLUMN     "origem" "OrigemEmpresa",
ADD COLUMN     "responsavel_comercial_id" TEXT,
ADD COLUMN     "responsavel_scout_id" TEXT;

-- AlterTable
ALTER TABLE "importacoes" ADD COLUMN     "configuracao_mapeamento" JSONB;

-- CreateTable
CREATE TABLE "motivos_descarte" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivos_descarte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_rapidas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_rapidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_negociacao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "responsavel_id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "TipoRegistroNegociacao" NOT NULL,
    "nota" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_negociacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_empresas" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "linha_origem" INTEGER NOT NULL,
    "dados_originais" JSONB NOT NULL,
    "nome_fantasia" TEXT,
    "site" TEXT,
    "cnpj" TEXT,
    "categorias_texto" TEXT,
    "duplicata_de_empresa_id" TEXT,
    "estado" "EstadoStaging" NOT NULL DEFAULT 'PENDENTE',
    "mensagem_erro" TEXT,
    "empresa_id_efetivada" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_empresas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "motivos_descarte_slug_key" ON "motivos_descarte"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_descarte_nome_key" ON "motivos_descarte"("nome");

-- CreateIndex
CREATE INDEX "notas_rapidas_empresa_id_idx" ON "notas_rapidas"("empresa_id");

-- CreateIndex
CREATE INDEX "registros_negociacao_empresa_id_idx" ON "registros_negociacao"("empresa_id");

-- CreateIndex
CREATE INDEX "staging_empresas_importacao_id_idx" ON "staging_empresas"("importacao_id");

-- CreateIndex
CREATE INDEX "empresas_estagio_idx" ON "empresas"("estagio");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_motivo_descarte_id_fkey" FOREIGN KEY ("motivo_descarte_id") REFERENCES "motivos_descarte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_responsavel_scout_id_fkey" FOREIGN KEY ("responsavel_scout_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_responsavel_comercial_id_fkey" FOREIGN KEY ("responsavel_comercial_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_rapidas" ADD CONSTRAINT "notas_rapidas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_rapidas" ADD CONSTRAINT "notas_rapidas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_negociacao" ADD CONSTRAINT "registros_negociacao_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_negociacao" ADD CONSTRAINT "registros_negociacao_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_empresas" ADD CONSTRAINT "staging_empresas_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

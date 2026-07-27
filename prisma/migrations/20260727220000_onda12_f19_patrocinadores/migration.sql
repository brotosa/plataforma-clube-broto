-- Onda 12 (F19) — Patrocinadores (RN62–RN66): ficha-onda12-patrocinadores.md.
--
-- PRIMEIRA MIGRATION FUNCIONAL DESDE A F13, e a base já está povoada
-- (aliados e ofertas reais, 46 prospects, 2.000 assinantes, 597 eventos de
-- telemetria). Por isso ela é ESTRITAMENTE ADITIVA, item por item:
--
--   * três enums NOVOS — nenhum valor acrescentado a enum existente, que
--     em PostgreSQL não roda dentro de transação em todas as versões;
--   * seis tabelas NOVAS;
--   * dez colunas novas, TODAS anuláveis e SEM default — em PostgreSQL
--     um ADD COLUMN nulo é alteração de catálogo, não reescrita de
--     tabela, então `assinantes` (2.000 linhas) e `campanhas` não são
--     varridas e o lock é momentâneo;
--   * nenhum DROP, nenhum RENAME, nenhum ALTER TYPE, nenhum NOT NULL
--     sobre linha existente.
--
-- Não há, portanto, condição de execução a verificar antes: não existe
-- linha que possa recusar esta migration.
--
-- POR QUE `assinantes.perfil_assinatura` NASCE NULO (RN63). O perfil vem
-- da coluna nativa `Patrocinador` do relatório da operadora, que só a F20
-- ingere. Preencher as 2.000 linhas com um default seria inventar dado de
-- negócio — nulo é o estado honesto, e a tela exibe "pendente", com o
-- motivo escrito.
--
-- POR QUE NÃO EXISTE COLUNA DE `ativadas` NEM DE `saldo` (RN62). Saldo é
-- `adquiridas − vínculos vigentes`, derivado em `dominio/patrocinio/
-- saldo.ts` e lido por T32, T33, R1 e Dashboard pela mesma consulta.
-- Persistido, envelheceria calado no primeiro vínculo encerrado. A cerca
-- de `infra/arquitetura/saldo-derivado.test.ts` quebra o build se a coluna
-- reaparecer no schema.
--
-- POR QUE O BINÁRIO DA MINUTA E DA EVIDÊNCIA FICA EM TABELA PRÓPRIA. Mesma
-- razão da F15 e da F17 (RN54, RN60): o Prisma seleciona escalares por
-- padrão, e um BYTEA em `contratos_patrocinio` ou em `campanhas` faria a
-- lista de patrocinadores, o R1 e o kit carregarem o arquivo em toda
-- consulta. É 1:1 pela própria chave, sem id redundante.

-- CreateEnum
CREATE TYPE "StatusPatrocinador" AS ENUM ('ATIVO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "PerfilAssinatura" AS ENUM ('PATROCINADA', 'PROMOCIONAL_BROTO', 'AUTOASSINATURA');

-- CreateEnum
CREATE TYPE "EstadoUsuarioAssinante" AS ENUM ('CADASTRADO', 'FREEMIUM', 'ASSINANTE');

-- AlterTable
ALTER TABLE "assinantes" ADD COLUMN     "estado_usuario" "EstadoUsuarioAssinante",
ADD COLUMN     "perfil_assinatura" "PerfilAssinatura";

-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "metodo_pagamento" TEXT,
ADD COLUMN     "periodicidade" TEXT,
ADD COLUMN     "preco" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "campanhas" ADD COLUMN     "aprovacao_aprovador" TEXT,
ADD COLUMN     "aprovacao_data" DATE,
ADD COLUMN     "aprovacao_registrada_em" TIMESTAMP(3),
ADD COLUMN     "aprovacao_registrada_por" TEXT,
ADD COLUMN     "patrocinador_id" TEXT;

-- CreateTable
CREATE TABLE "patrocinadores" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "segmento" TEXT,
    "contato_nome" TEXT,
    "contato_email" TEXT,
    "contato_telefone" TEXT,
    "responsavel_comercial_id" TEXT,
    "status" "StatusPatrocinador" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrocinadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos_patrocinio" (
    "id" TEXT NOT NULL,
    "patrocinador_id" TEXT NOT NULL,
    "data_assinatura" DATE,
    "vigencia_inicio" DATE,
    "vigencia_fim" DATE,
    "preco_unitario" DECIMAL(12,2),
    "valor_total_contratado" DECIMAL(14,2),
    "assinaturas_adquiridas" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_patrocinio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minutas_contrato" (
    "contrato_id" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "minutas_contrato_pkey" PRIMARY KEY ("contrato_id")
);

-- CreateTable
CREATE TABLE "vinculos_patrocinio" (
    "id" TEXT NOT NULL,
    "patrocinador_id" TEXT NOT NULL,
    "assinante_id" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "motivo_fim" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vinculos_patrocinio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias_aprovacao_campanha" (
    "campanha_id" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidencias_aprovacao_campanha_pkey" PRIMARY KEY ("campanha_id")
);

-- CreateTable
CREATE TABLE "relatorios_patrocinador" (
    "id" TEXT NOT NULL,
    "patrocinador_id" TEXT NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fim" DATE NOT NULL,
    "finalidade" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relatorios_patrocinador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patrocinadores_cnpj_key" ON "patrocinadores"("cnpj");

-- CreateIndex
CREATE INDEX "patrocinadores_status_idx" ON "patrocinadores"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_patrocinio_patrocinador_id_key" ON "contratos_patrocinio"("patrocinador_id");

-- CreateIndex
CREATE INDEX "vinculos_patrocinio_patrocinador_id_fim_idx" ON "vinculos_patrocinio"("patrocinador_id", "fim");

-- CreateIndex
CREATE INDEX "vinculos_patrocinio_assinante_id_idx" ON "vinculos_patrocinio"("assinante_id");

-- CreateIndex
CREATE INDEX "relatorios_patrocinador_patrocinador_id_criado_em_idx" ON "relatorios_patrocinador"("patrocinador_id", "criado_em");

-- CreateIndex
CREATE INDEX "assinantes_perfil_assinatura_idx" ON "assinantes"("perfil_assinatura");

-- CreateIndex
CREATE INDEX "campanhas_patrocinador_id_idx" ON "campanhas"("patrocinador_id");

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_patrocinador_id_fkey" FOREIGN KEY ("patrocinador_id") REFERENCES "patrocinadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrocinadores" ADD CONSTRAINT "patrocinadores_responsavel_comercial_id_fkey" FOREIGN KEY ("responsavel_comercial_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_patrocinio" ADD CONSTRAINT "contratos_patrocinio_patrocinador_id_fkey" FOREIGN KEY ("patrocinador_id") REFERENCES "patrocinadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutas_contrato" ADD CONSTRAINT "minutas_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos_patrocinio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutas_contrato" ADD CONSTRAINT "minutas_contrato_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_patrocinio" ADD CONSTRAINT "vinculos_patrocinio_patrocinador_id_fkey" FOREIGN KEY ("patrocinador_id") REFERENCES "patrocinadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_patrocinio" ADD CONSTRAINT "vinculos_patrocinio_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_aprovacao_campanha" ADD CONSTRAINT "evidencias_aprovacao_campanha_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_aprovacao_campanha" ADD CONSTRAINT "evidencias_aprovacao_campanha_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_patrocinador" ADD CONSTRAINT "relatorios_patrocinador_patrocinador_id_fkey" FOREIGN KEY ("patrocinador_id") REFERENCES "patrocinadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_patrocinador" ADD CONSTRAINT "relatorios_patrocinador_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


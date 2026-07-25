-- Onda 4 (F12) — Campanhas e Cestas: ficha-onda4-campanhas-cestas.md.
-- Campanha (público congelado na ativação), cestas reutilizáveis, peças
-- com formato de lista de domínio nova, metas múltiplas e kits
-- versionados/imutáveis (RN45). Inclui a extensão RETROATIVA da Onda 1:
-- destinação da oferta (vitrine · campanha · cesta), sem tocar na
-- publicação Minutrade — a vitrine continua sendo uma só.

-- CreateEnum
CREATE TYPE "DestinacaoOferta" AS ENUM ('VITRINE', 'CAMPANHA', 'CESTA');

-- CreateEnum
CREATE TYPE "EstadoCampanha" AS ENUM ('RASCUNHO', 'ATIVA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "OrigemPublicoCampanha" AS ENUM ('SEGMENTO_SALVO', 'REGRAS_PROPRIAS');

-- CreateEnum
CREATE TYPE "TipoMetaCampanha" AS ENUM ('RESGATES', 'CONVERSAO_PCT', 'ALIADOS_PARTICIPANTES', 'OFERTAS_ATIVAS');

-- CreateEnum
CREATE TYPE "NivelAtribuicao" AS ENUM ('POR_OFERTA', 'POR_PUBLICO');

-- AlterEnum
ALTER TYPE "TipoEntidadeAprovacao" ADD VALUE 'ATIVACAO_CAMPANHA';

-- AlterTable
ALTER TABLE "ofertas" ADD COLUMN     "destinacao" "DestinacaoOferta" NOT NULL DEFAULT 'VITRINE',
ADD COLUMN     "destinacao_campanha_id" TEXT,
ADD COLUMN     "destinacao_cesta_id" TEXT;

-- CreateTable
CREATE TABLE "formatos_peca" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formatos_peca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanhas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "objetivo" TEXT,
    "origemPublico" "OrigemPublicoCampanha" NOT NULL DEFAULT 'SEGMENTO_SALVO',
    "segmento_id" TEXT,
    "regras_publico" JSONB,
    "publico_snapshot_id" TEXT,
    "vigencia_inicio" DATE,
    "vigencia_fim" DATE,
    "instrucoes" TEXT,
    "estado" "EstadoCampanha" NOT NULL DEFAULT 'RASCUNHO',
    "ativada_em" TIMESTAMP(3),
    "encerrada_em" TIMESTAMP(3),
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cestas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "narrativa" TEXT,
    "origemPerfil" "OrigemPublicoCampanha" NOT NULL DEFAULT 'SEGMENTO_SALVO',
    "segmento_id" TEXT,
    "regras_perfil" JSONB,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cestas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cesta_ofertas" (
    "cesta_id" TEXT NOT NULL,
    "oferta_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cesta_ofertas_pkey" PRIMARY KEY ("cesta_id","oferta_id")
);

-- CreateTable
CREATE TABLE "campanha_cestas" (
    "campanha_id" TEXT NOT NULL,
    "cesta_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanha_cestas_pkey" PRIMARY KEY ("campanha_id","cesta_id")
);

-- CreateTable
CREATE TABLE "campanha_ofertas" (
    "campanha_id" TEXT NOT NULL,
    "oferta_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanha_ofertas_pkey" PRIMARY KEY ("campanha_id","oferta_id")
);

-- CreateTable
CREATE TABLE "pecas_campanha" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "formato_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT,
    "imagem_chave" TEXT,
    "imagem_nome" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pecas_campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas_campanha" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "tipo" "TipoMetaCampanha" NOT NULL,
    "alvo" DECIMAL(12,2) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metas_campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kits_campanha" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "adapter" TEXT NOT NULL,
    "manifesto" JSONB NOT NULL,
    "arquivo_chave" TEXT NOT NULL,
    "hash_arquivo" TEXT NOT NULL,
    "diff_texto" TEXT,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kits_campanha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formatos_peca_slug_key" ON "formatos_peca"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "campanhas_publico_snapshot_id_key" ON "campanhas"("publico_snapshot_id");

-- CreateIndex
CREATE INDEX "campanhas_estado_idx" ON "campanhas"("estado");

-- CreateIndex
CREATE INDEX "cesta_ofertas_oferta_id_idx" ON "cesta_ofertas"("oferta_id");

-- CreateIndex
CREATE INDEX "campanha_cestas_cesta_id_idx" ON "campanha_cestas"("cesta_id");

-- CreateIndex
CREATE INDEX "campanha_ofertas_oferta_id_idx" ON "campanha_ofertas"("oferta_id");

-- CreateIndex
CREATE INDEX "pecas_campanha_campanha_id_idx" ON "pecas_campanha"("campanha_id");

-- CreateIndex
CREATE UNIQUE INDEX "metas_campanha_campanha_id_tipo_key" ON "metas_campanha"("campanha_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "kits_campanha_campanha_id_versao_key" ON "kits_campanha"("campanha_id", "versao");

-- CreateIndex
CREATE INDEX "ofertas_destinacao_campanha_id_idx" ON "ofertas"("destinacao_campanha_id");

-- CreateIndex
CREATE INDEX "ofertas_destinacao_cesta_id_idx" ON "ofertas"("destinacao_cesta_id");

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_destinacao_campanha_id_fkey" FOREIGN KEY ("destinacao_campanha_id") REFERENCES "campanhas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_destinacao_cesta_id_fkey" FOREIGN KEY ("destinacao_cesta_id") REFERENCES "cestas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_segmento_id_fkey" FOREIGN KEY ("segmento_id") REFERENCES "segmentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_publico_snapshot_id_fkey" FOREIGN KEY ("publico_snapshot_id") REFERENCES "exportacoes_lista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cestas" ADD CONSTRAINT "cestas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cestas" ADD CONSTRAINT "cestas_segmento_id_fkey" FOREIGN KEY ("segmento_id") REFERENCES "segmentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cesta_ofertas" ADD CONSTRAINT "cesta_ofertas_cesta_id_fkey" FOREIGN KEY ("cesta_id") REFERENCES "cestas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cesta_ofertas" ADD CONSTRAINT "cesta_ofertas_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_cestas" ADD CONSTRAINT "campanha_cestas_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_cestas" ADD CONSTRAINT "campanha_cestas_cesta_id_fkey" FOREIGN KEY ("cesta_id") REFERENCES "cestas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_ofertas" ADD CONSTRAINT "campanha_ofertas_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_ofertas" ADD CONSTRAINT "campanha_ofertas_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pecas_campanha" ADD CONSTRAINT "pecas_campanha_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pecas_campanha" ADD CONSTRAINT "pecas_campanha_formato_id_fkey" FOREIGN KEY ("formato_id") REFERENCES "formatos_peca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas_campanha" ADD CONSTRAINT "metas_campanha_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kits_campanha" ADD CONSTRAINT "kits_campanha_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kits_campanha" ADD CONSTRAINT "kits_campanha_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


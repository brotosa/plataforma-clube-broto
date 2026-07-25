-- =====================================================================
-- Onda 3 · F10 — Parametrizador
--
-- Última da cadeia por convergência com a F9: aquela fase criou
-- `metas_periodo`, o enum `PeriodoMeta` e a garantia da RN28 por índices
-- parciais, já no formato que este editor espera. A T17 escreve NAQUELA
-- tabela — nada é duplicado aqui. Esta migration traz apenas o que a F9
-- não criou.
-- =====================================================================

-- CreateEnum
CREATE TYPE "TipoValorRegra" AS ENUM ('DIAS', 'MESES', 'PERCENTUAL', 'MONETARIO');

-- AlterEnum
ALTER TYPE "Papel" ADD VALUE 'ADMINISTRADOR_PLATAFORMA';

-- AlterEnum
ALTER TYPE "TipoEntidadeAprovacao" ADD VALUE 'PARAMETRO_SENSIVEL';

-- AlterTable
ALTER TABLE "avaliacoes_scout" ADD COLUMN     "configuracao_versao_id" TEXT;

-- CreateTable
CREATE TABLE "perfis_cliente" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "perfis_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valores_regra" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoValorRegra" NOT NULL,
    "valor" DECIMAL(14,4),
    "sensivel" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "valores_regra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valores_regra_historico" (
    "id" TEXT NOT NULL,
    "valor_regra_id" TEXT NOT NULL,
    "valor_anterior" DECIMAL(14,4),
    "valor_novo" DECIMAL(14,4),
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valores_regra_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao_versoes" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "autor_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracao_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfis_cliente_slug_key" ON "perfis_cliente"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_cliente_nome_key" ON "perfis_cliente"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "valores_regra_chave_key" ON "valores_regra"("chave");

-- CreateIndex
CREATE INDEX "valores_regra_grupo_idx" ON "valores_regra"("grupo");

-- CreateIndex
CREATE INDEX "valores_regra_historico_valor_regra_id_criado_em_idx" ON "valores_regra_historico"("valor_regra_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "configuracao_versoes_numero_key" ON "configuracao_versoes"("numero");

-- AddForeignKey
ALTER TABLE "avaliacoes_scout" ADD CONSTRAINT "avaliacoes_scout_configuracao_versao_id_fkey" FOREIGN KEY ("configuracao_versao_id") REFERENCES "configuracao_versoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valores_regra_historico" ADD CONSTRAINT "valores_regra_historico_valor_regra_id_fkey" FOREIGN KEY ("valor_regra_id") REFERENCES "valores_regra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valores_regra_historico" ADD CONSTRAINT "valores_regra_historico_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracao_versoes" ADD CONSTRAINT "configuracao_versoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Faixa coerente também no banco, como na F7 (reforço das validações de
-- domínio, não substituto delas).
ALTER TABLE "valores_regra" ADD CONSTRAINT "valores_regra_valor_nao_negativo"
    CHECK ("valor" IS NULL OR "valor" >= 0);

-- RN25 — Versão-seed da configuração que afeta o score. Congela os
-- indicadores, dimensões e pesos como estão AGORA, para que toda avaliação
-- fechada antes da F10 aponte para a configuração sob a qual foi
-- pontuada. Em banco novo a tabela de indicadores ainda está vazia (o seed
-- roda depois): a versão nasce com snapshot vazio e o seed a completa.
INSERT INTO "configuracao_versoes" ("id", "numero", "snapshot", "motivo", "autor_id", "criado_em")
SELECT
    'cfgv_seed_f10_indicadores_v1',
    1,
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'indicadorId', i."id",
                'slug', i."slug",
                'nome', i."nome",
                'grupo', i."grupo",
                'dimensao', i."dimensao",
                'peso', i."peso",
                'ativo', i."ativo"
            )
            ORDER BY i."ordem"
        ),
        '[]'::jsonb
    ),
    'carga inicial — indicadores do ScoutCB com os pesos v1',
    NULL,
    CURRENT_TIMESTAMP
FROM "indicadores" i
WHERE NOT EXISTS (SELECT 1 FROM "configuracao_versoes");

-- Backfill: avaliações da F7 passam a apontar para a versão-seed. Sem
-- isto, uma avaliação fechada ficaria sem a configuração que a produziu e
-- a RN25 seria indemonstrável para o histórico existente.
UPDATE "avaliacoes_scout"
   SET "configuracao_versao_id" = 'cfgv_seed_f10_indicadores_v1'
 WHERE "configuracao_versao_id" IS NULL;

-- Tetos do dossiê: a ficha §8 mantém [A CONFIRMAR TI] sobre os valores
-- definitivos. Por isso `valores_regra.valor` é NULO para eles e a T17
-- exibe o campo vazio com etiqueta de pendência — nenhum número plausível
-- entra no lugar de um dado que o negócio ainda não fechou.

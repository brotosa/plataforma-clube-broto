-- Onda 12 (F20) — Telemetria da operadora (RN67–RN70):
-- ficha-onda12-patrocinadores.md v0.4, §3.
--
-- ESTRITAMENTE ADITIVA, no mesmo padrão da F19 e pela mesma razão: a base
-- está povoada (aliados e ofertas reais, 46 prospects, 2.000 assinantes,
-- 597 eventos de telemetria da Onda 1). Item por item:
--
--   * dois enums NOVOS — nenhum valor acrescentado a enum existente, que
--     em PostgreSQL não roda dentro de transação em todas as versões;
--   * quatro tabelas NOVAS;
--   * NENHUMA coluna nova em tabela existente, nenhum DROP, nenhum
--     RENAME, nenhum ALTER TYPE, nenhum NOT NULL sobre linha existente.
--
-- As chaves estrangeiras apontam para `ofertas`, `assinantes` e
-- `usuarios`, mas ADD CONSTRAINT ... REFERENCES em tabela NOVA (vazia)
-- valida apenas a tabela nova: as existentes não são varridas.
--
-- Não há, portanto, condição de execução a verificar antes: não existe
-- linha que possa recusar esta migration.
--
-- POR QUE A IDENTIDADE DA IMPORTAÇÃO É O HASH DO CONTEÚDO (RN67). O nome
-- do arquivo traz sufixo aleatório da operadora ("Lista_de_Ofertas_3"),
-- então dois arquivos idênticos chegam com nomes diferentes e o mesmo
-- arquivo pode voltar com outro nome. `UNIQUE(hash_conteudo, tipo_layout)`
-- é o que sustenta a idempotência — sem ela, a reimportação diária de um
-- relatório ACUMULADO multiplicaria contagem em silêncio.
--
-- POR QUE `contadores_oferta_telemetria.oferta_id` É ÚNICO. A tabela
-- guarda o ÚLTIMO RETRATO por oferta; série histórica é fora de escopo
-- (ficha §6). O único é o que faz a reimportação ATUALIZAR o retrato em
-- vez de empilhar linhas.
--
-- POR QUE `eventos_resgate_telemetria.oferta_id` É ANULÁVEL. A operadora
-- ainda não envia o id da oferta no extrato nominal (item 2 da requisição
-- de 27/07). Perder o fato por falta de um vínculo que a origem não manda
-- seria pior que guardá-lo sem ele. Sem ASSINANTE resolvido, ao contrário,
-- o evento não entra — é a recusa nomeada da RN69.
--
-- POR QUE EXISTE `chave_natural` E O QUE ELA NÃO RESOLVE. A fonte é
-- acumulada e será reimportada todo dia; sem id de evento na origem, a
-- identidade possível é o SHA-256 de (assinante, data, produto, seller).
-- Limite conhecido e declarado: dois resgates genuínos do mesmo produto,
-- no mesmo seller, no mesmo dia, pelo mesmo assinante COLAPSAM em um só.
-- É o item 2 da requisição que resolve; até lá, subcontar é o erro menos
-- danoso que superconstar a cada reimportação.
--
-- POR QUE NÃO HÁ COLUNA DE `saldo`, DE `ativadas` NEM DE TOTAL SOMADO
-- (RN62/RN68). Saldo continua derivado (`dominio/patrocinio/saldo.ts`), e
-- o contador de catálogo NUNCA é somado ao extrato nominal: eles medem
-- coisas diferentes e divergem hoje (227 × 38). Uma coluna de "total"
-- aqui seria exatamente a soma que a RN68 proíbe.

-- CreateEnum
CREATE TYPE "TipoLayoutTelemetria" AS ENUM ('USUARIOS', 'RESGATES', 'SELLERS', 'OFERTAS');

-- CreateEnum
CREATE TYPE "TipoDivergenciaCatalogo" AS ENUM ('AUSENTE_NA_OPERADORA', 'AUSENTE_NA_PLATAFORMA', 'ATRIBUTO_DIVERGENTE');

-- CreateTable
CREATE TABLE "importacoes_telemetria" (
    "id" TEXT NOT NULL,
    "tipo_layout" "TipoLayoutTelemetria" NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "data_geracao_declarada" DATE,
    "hash_conteudo" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "lidas" INTEGER NOT NULL,
    "aplicadas" INTEGER NOT NULL,
    "recusadas" INTEGER NOT NULL,
    "recusas_por_causa" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacoes_telemetria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contadores_oferta_telemetria" (
    "id" TEXT NOT NULL,
    "oferta_id" TEXT NOT NULL,
    "resgates" INTEGER NOT NULL,
    "compras" INTEGER NOT NULL,
    "data_arquivo" DATE,
    "importacao_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contadores_oferta_telemetria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divergencias_catalogo" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "tipo" "TipoDivergenciaCatalogo" NOT NULL,
    "identificador" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "divergencias_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_resgate_telemetria" (
    "id" TEXT NOT NULL,
    "assinante_id" TEXT NOT NULL,
    "data_evento" DATE NOT NULL,
    "produto" TEXT NOT NULL,
    "tipo_oferta" TEXT,
    "seller" TEXT,
    "oferta_id" TEXT,
    "chave_natural" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_resgate_telemetria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "importacoes_telemetria_tipo_layout_criado_em_idx" ON "importacoes_telemetria"("tipo_layout", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "importacoes_telemetria_hash_conteudo_tipo_layout_key" ON "importacoes_telemetria"("hash_conteudo", "tipo_layout");

-- CreateIndex
CREATE UNIQUE INDEX "contadores_oferta_telemetria_oferta_id_key" ON "contadores_oferta_telemetria"("oferta_id");

-- CreateIndex
CREATE INDEX "contadores_oferta_telemetria_importacao_id_idx" ON "contadores_oferta_telemetria"("importacao_id");

-- CreateIndex
CREATE INDEX "divergencias_catalogo_importacao_id_tipo_idx" ON "divergencias_catalogo"("importacao_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_resgate_telemetria_chave_natural_key" ON "eventos_resgate_telemetria"("chave_natural");

-- CreateIndex
CREATE INDEX "eventos_resgate_telemetria_assinante_id_data_evento_idx" ON "eventos_resgate_telemetria"("assinante_id", "data_evento");

-- CreateIndex
CREATE INDEX "eventos_resgate_telemetria_oferta_id_idx" ON "eventos_resgate_telemetria"("oferta_id");

-- CreateIndex
CREATE INDEX "eventos_resgate_telemetria_importacao_id_idx" ON "eventos_resgate_telemetria"("importacao_id");

-- AddForeignKey
ALTER TABLE "importacoes_telemetria" ADD CONSTRAINT "importacoes_telemetria_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contadores_oferta_telemetria" ADD CONSTRAINT "contadores_oferta_telemetria_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contadores_oferta_telemetria" ADD CONSTRAINT "contadores_oferta_telemetria_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes_telemetria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divergencias_catalogo" ADD CONSTRAINT "divergencias_catalogo_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes_telemetria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_resgate_telemetria" ADD CONSTRAINT "eventos_resgate_telemetria_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_resgate_telemetria" ADD CONSTRAINT "eventos_resgate_telemetria_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_resgate_telemetria" ADD CONSTRAINT "eventos_resgate_telemetria_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes_telemetria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


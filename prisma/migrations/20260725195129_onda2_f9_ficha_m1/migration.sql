-- CreateEnum
CREATE TYPE "NaturezaPublico" AS ENUM ('PF', 'PJ', 'AMBAS');

-- CreateEnum
CREATE TYPE "StatusOfertaPretendida" AS ENUM ('RASCUNHO', 'CONVERTIDA');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "diferenciais" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "modelo_negocio" TEXT,
ADD COLUMN     "publico_natureza" "NaturezaPublico",
ADD COLUMN     "publico_porte" "PorteProdutor"[];

-- CreateTable
CREATE TABLE "indicadores_declarados" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "data_declaracao" DATE NOT NULL,
    "ticket_medio" DECIMAL(12,2),
    "nps" INTEGER,
    "churn_mensal_pct" DECIMAL(5,2),
    "numero_clientes" INTEGER,
    "ano_fundacao" INTEGER,
    "registrado_por_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicadores_declarados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ofertas_pretendidas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "natureza" "NaturezaOferta" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_beneficio_id" TEXT,
    "mecanica_id" TEXT,
    "preco_de" DECIMAL(12,2),
    "preco_por" DECIMAL(12,2),
    "instrucoes_resgate" TEXT,
    "vigencia_inicio" DATE,
    "vigencia_fim" DATE,
    "status" "StatusOfertaPretendida" NOT NULL DEFAULT 'RASCUNHO',
    "solucao_id" TEXT,
    "oferta_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ofertas_pretendidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "indicadores_declarados_empresa_id_idx" ON "indicadores_declarados"("empresa_id");

-- CreateIndex
CREATE INDEX "ofertas_pretendidas_empresa_id_idx" ON "ofertas_pretendidas"("empresa_id");

-- AddForeignKey
ALTER TABLE "indicadores_declarados" ADD CONSTRAINT "indicadores_declarados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicadores_declarados" ADD CONSTRAINT "indicadores_declarados_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas_pretendidas" ADD CONSTRAINT "ofertas_pretendidas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas_pretendidas" ADD CONSTRAINT "ofertas_pretendidas_tipo_beneficio_id_fkey" FOREIGN KEY ("tipo_beneficio_id") REFERENCES "tipos_beneficio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas_pretendidas" ADD CONSTRAINT "ofertas_pretendidas_mecanica_id_fkey" FOREIGN KEY ("mecanica_id") REFERENCES "mecanicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas_pretendidas" ADD CONSTRAINT "ofertas_pretendidas_solucao_id_fkey" FOREIGN KEY ("solucao_id") REFERENCES "solucoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas_pretendidas" ADD CONSTRAINT "ofertas_pretendidas_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Faixas da Ficha Cadastral v1 (seção D) também no banco: NPS na escala
-- oficial, churn em percentual e grandezas nunca negativas.
ALTER TABLE "indicadores_declarados" ADD CONSTRAINT "indicadores_declarados_faixas" CHECK (
  ("nps" IS NULL OR ("nps" BETWEEN -100 AND 100))
  AND ("churn_mensal_pct" IS NULL OR ("churn_mensal_pct" >= 0 AND "churn_mensal_pct" <= 100))
  AND ("ticket_medio" IS NULL OR "ticket_medio" >= 0)
  AND ("numero_clientes" IS NULL OR "numero_clientes" >= 0)
  AND ("ano_fundacao" IS NULL OR ("ano_fundacao" BETWEEN 1800 AND 2200))
);

-- Seção F: Recompensa é gratuidade (definição contratual) — preços
-- pretendidos ficam vazios ou zerados. A mesma regra vale na oferta real.
ALTER TABLE "ofertas_pretendidas" ADD CONSTRAINT "ofertas_pretendidas_recompensa_gratuita" CHECK (
  "natureza" <> 'RECOMPENSA'
  OR (COALESCE("preco_de", 0) = 0 AND COALESCE("preco_por", 0) = 0)
);

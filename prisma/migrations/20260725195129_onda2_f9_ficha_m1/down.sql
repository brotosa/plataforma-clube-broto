-- Reversão da onda2_f9_ficha_m1: remove as seções D e F da Ficha
-- Cadastral (indicadores declarados e ofertas pretendidas) e os campos de
-- classificação da seção B. Aplicar manualmente (psql -f down.sql) e
-- remover o registro de _prisma_migrations, conforme o LEIA-ME.

-- DropForeignKey
ALTER TABLE "ofertas_pretendidas" DROP CONSTRAINT "ofertas_pretendidas_oferta_id_fkey";
ALTER TABLE "ofertas_pretendidas" DROP CONSTRAINT "ofertas_pretendidas_solucao_id_fkey";
ALTER TABLE "ofertas_pretendidas" DROP CONSTRAINT "ofertas_pretendidas_mecanica_id_fkey";
ALTER TABLE "ofertas_pretendidas" DROP CONSTRAINT "ofertas_pretendidas_tipo_beneficio_id_fkey";
ALTER TABLE "ofertas_pretendidas" DROP CONSTRAINT "ofertas_pretendidas_empresa_id_fkey";
ALTER TABLE "indicadores_declarados" DROP CONSTRAINT "indicadores_declarados_registrado_por_id_fkey";
ALTER TABLE "indicadores_declarados" DROP CONSTRAINT "indicadores_declarados_empresa_id_fkey";

-- DropTable
DROP TABLE "ofertas_pretendidas";
DROP TABLE "indicadores_declarados";

-- AlterTable
ALTER TABLE "empresas" DROP COLUMN "publico_porte";
ALTER TABLE "empresas" DROP COLUMN "publico_natureza";
ALTER TABLE "empresas" DROP COLUMN "modelo_negocio";
ALTER TABLE "empresas" DROP COLUMN "diferenciais";

-- DropEnum
DROP TYPE "StatusOfertaPretendida";
DROP TYPE "NaturezaPublico";

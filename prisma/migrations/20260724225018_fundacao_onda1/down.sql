-- DropForeignKey
ALTER TABLE "public"."empresas" DROP CONSTRAINT "empresas_motivo_suspensao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."empresa_categorias" DROP CONSTRAINT "empresa_categorias_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."empresa_categorias" DROP CONSTRAINT "empresa_categorias_categoria_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."contatos_empresa" DROP CONSTRAINT "contatos_empresa_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."contratos_comerciais" DROP CONSTRAINT "contratos_comerciais_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."solucoes" DROP CONSTRAINT "solucoes_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."solucoes" DROP CONSTRAINT "solucoes_categoria_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."solucao_culturas" DROP CONSTRAINT "solucao_culturas_solucao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."solucao_culturas" DROP CONSTRAINT "solucao_culturas_cultura_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."solucao_ufs" DROP CONSTRAINT "solucao_ufs_solucao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."solucao_ufs" DROP CONSTRAINT "solucao_ufs_uf_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ofertas" DROP CONSTRAINT "ofertas_solucao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ofertas" DROP CONSTRAINT "ofertas_tipo_beneficio_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ofertas" DROP CONSTRAINT "ofertas_mecanica_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."telemetria_eventos" DROP CONSTRAINT "telemetria_eventos_oferta_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."telemetria_eventos" DROP CONSTRAINT "telemetria_eventos_importacao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."telemetria_acumulados_iniciais" DROP CONSTRAINT "telemetria_acumulados_iniciais_oferta_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."telemetria_acumulados_iniciais" DROP CONSTRAINT "telemetria_acumulados_iniciais_importacao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."publicacoes" DROP CONSTRAINT "publicacoes_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."importacoes" DROP CONSTRAINT "importacoes_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."staging_sellers" DROP CONSTRAINT "staging_sellers_importacao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."staging_ofertas" DROP CONSTRAINT "staging_ofertas_importacao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."staging_ofertas" DROP CONSTRAINT "staging_ofertas_agrupamento_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."staging_agrupamentos" DROP CONSTRAINT "staging_agrupamentos_importacao_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."aprovacao_regra_aprovadores" DROP CONSTRAINT "aprovacao_regra_aprovadores_regra_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."aprovacao_regra_aprovadores" DROP CONSTRAINT "aprovacao_regra_aprovadores_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."aprovacao_solicitacoes" DROP CONSTRAINT "aprovacao_solicitacoes_solicitante_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."aprovacao_solicitacoes" DROP CONSTRAINT "aprovacao_solicitacoes_aprovador_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."auditoria_eventos" DROP CONSTRAINT "auditoria_eventos_autor_id_fkey";

-- DropTable
DROP TABLE "public"."usuarios";

-- DropTable
DROP TABLE "public"."categorias";

-- DropTable
DROP TABLE "public"."culturas";

-- DropTable
DROP TABLE "public"."ufs";

-- DropTable
DROP TABLE "public"."tipos_beneficio";

-- DropTable
DROP TABLE "public"."mecanicas";

-- DropTable
DROP TABLE "public"."motivos_suspensao";

-- DropTable
DROP TABLE "public"."empresas";

-- DropTable
DROP TABLE "public"."empresa_categorias";

-- DropTable
DROP TABLE "public"."contatos_empresa";

-- DropTable
DROP TABLE "public"."contratos_comerciais";

-- DropTable
DROP TABLE "public"."solucoes";

-- DropTable
DROP TABLE "public"."solucao_culturas";

-- DropTable
DROP TABLE "public"."solucao_ufs";

-- DropTable
DROP TABLE "public"."ofertas";

-- DropTable
DROP TABLE "public"."telemetria_eventos";

-- DropTable
DROP TABLE "public"."telemetria_acumulados_iniciais";

-- DropTable
DROP TABLE "public"."publicacoes";

-- DropTable
DROP TABLE "public"."importacoes";

-- DropTable
DROP TABLE "public"."staging_sellers";

-- DropTable
DROP TABLE "public"."staging_ofertas";

-- DropTable
DROP TABLE "public"."staging_agrupamentos";

-- DropTable
DROP TABLE "public"."aprovacao_regras";

-- DropTable
DROP TABLE "public"."aprovacao_regra_aprovadores";

-- DropTable
DROP TABLE "public"."aprovacao_solicitacoes";

-- DropTable
DROP TABLE "public"."auditoria_eventos";

-- DropEnum
DROP TYPE "public"."Papel";

-- DropEnum
DROP TYPE "public"."EstagioEmpresa";

-- DropEnum
DROP TYPE "public"."PapelContato";

-- DropEnum
DROP TYPE "public"."StatusContrato";

-- DropEnum
DROP TYPE "public"."AmbientePagamento";

-- DropEnum
DROP TYPE "public"."StatusSolucao";

-- DropEnum
DROP TYPE "public"."PorteProdutor";

-- DropEnum
DROP TYPE "public"."NaturezaOferta";

-- DropEnum
DROP TYPE "public"."ModalidadePagamento";

-- DropEnum
DROP TYPE "public"."StatusOferta";

-- DropEnum
DROP TYPE "public"."TipoEventoTelemetria";

-- DropEnum
DROP TYPE "public"."TipoImportacao";

-- DropEnum
DROP TYPE "public"."EstadoStaging";

-- DropEnum
DROP TYPE "public"."TipoEntidadeAprovacao";

-- DropEnum
DROP TYPE "public"."EstadoSolicitacao";


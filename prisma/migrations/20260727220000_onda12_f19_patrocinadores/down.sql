-- Reversão da Onda 12 (F19) — Patrocinadores. Aplicar manualmente
-- (ver LEIA-ME.md).
--
-- Reverter DESTRÓI dado que só existe aqui:
--
--   * as minutas de contrato e as evidências de aprovação — o binário não
--     tem cópia em lugar nenhum. Antes de aplicar em ambiente com uso
--     real, extrair (por exemplo `\copy (SELECT contrato_id, nome_arquivo,
--     encode(conteudo, 'base64') FROM minutas_contrato) TO 'minutas.csv'
--     CSV`); depois do DROP não há de onde recuperar;
--   * os patrocinadores, contratos e vínculos — e com os vínculos vai
--     embora a própria base do saldo derivado;
--   * o perfil de assinatura e o estado de usuário já preenchidos, e os
--     três campos de autoassinatura.
--
-- O que NÃO se perde: os eventos de auditoria de todas essas mutações
-- permanecem gravados, porque a RN49 vale também na reversão. A trilha
-- continua sabendo que um patrocinador existiu, quem o criou e o que foi
-- alterado nele — é o registro, não o registro apagado.
--
-- A ordem abaixo é a que o `prisma migrate diff` gerou e é a única segura:
-- as chaves estrangeiras caem antes das tabelas que elas apontam, e os
-- enums por último, depois que a última coluna que os usa deixou de
-- existir.

-- DropForeignKey
ALTER TABLE "public"."campanhas" DROP CONSTRAINT "campanhas_patrocinador_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."patrocinadores" DROP CONSTRAINT "patrocinadores_responsavel_comercial_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."contratos_patrocinio" DROP CONSTRAINT "contratos_patrocinio_patrocinador_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."minutas_contrato" DROP CONSTRAINT "minutas_contrato_contrato_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."minutas_contrato" DROP CONSTRAINT "minutas_contrato_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."vinculos_patrocinio" DROP CONSTRAINT "vinculos_patrocinio_patrocinador_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."vinculos_patrocinio" DROP CONSTRAINT "vinculos_patrocinio_assinante_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."evidencias_aprovacao_campanha" DROP CONSTRAINT "evidencias_aprovacao_campanha_campanha_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."evidencias_aprovacao_campanha" DROP CONSTRAINT "evidencias_aprovacao_campanha_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."relatorios_patrocinador" DROP CONSTRAINT "relatorios_patrocinador_patrocinador_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."relatorios_patrocinador" DROP CONSTRAINT "relatorios_patrocinador_autor_id_fkey";

-- DropIndex
DROP INDEX "public"."assinantes_perfil_assinatura_idx";

-- DropIndex
DROP INDEX "public"."campanhas_patrocinador_id_idx";

-- AlterTable
ALTER TABLE "public"."assinantes" DROP COLUMN "estado_usuario",
DROP COLUMN "perfil_assinatura";

-- AlterTable
ALTER TABLE "public"."assinaturas" DROP COLUMN "metodo_pagamento",
DROP COLUMN "periodicidade",
DROP COLUMN "preco";

-- AlterTable
ALTER TABLE "public"."campanhas" DROP COLUMN "aprovacao_aprovador",
DROP COLUMN "aprovacao_data",
DROP COLUMN "aprovacao_registrada_em",
DROP COLUMN "aprovacao_registrada_por",
DROP COLUMN "patrocinador_id";

-- DropTable
DROP TABLE "public"."patrocinadores";

-- DropTable
DROP TABLE "public"."contratos_patrocinio";

-- DropTable
DROP TABLE "public"."minutas_contrato";

-- DropTable
DROP TABLE "public"."vinculos_patrocinio";

-- DropTable
DROP TABLE "public"."evidencias_aprovacao_campanha";

-- DropTable
DROP TABLE "public"."relatorios_patrocinador";

-- DropEnum
DROP TYPE "public"."StatusPatrocinador";

-- DropEnum
DROP TYPE "public"."PerfilAssinatura";

-- DropEnum
DROP TYPE "public"."EstadoUsuarioAssinante";


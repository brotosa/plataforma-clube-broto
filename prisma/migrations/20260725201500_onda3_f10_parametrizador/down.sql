-- Reversão completa da onda3_f10_parametrizador: remove valores de regra,
-- versões de configuração e a lista de perfil de cliente; devolve
-- avaliacoes_scout ao estado da F7 e apaga o enum da fase. Aplicar
-- manualmente (psql -f down.sql) e remover o registro de
-- _prisma_migrations, conforme o LEIA-ME.
--
-- `metas_periodo` NÃO é tocada aqui: ela é da F9, e reverter a F10 devolve
-- as metas à leitura da T14 sem perder nenhuma.
--
-- Os valores ADMINISTRADOR_PLATAFORMA (Papel) e PARAMETRO_SENSIVEL
-- (TipoEntidadeAprovacao) não são removidos: o PostgreSQL não suporta
-- DROP VALUE em enum. A reversão os deixa órfãos e inertes — nenhum
-- usuário ou regra restante os referencia depois dos DELETE abaixo.

-- Remove usuários e regras que só existem por causa da F10, para que os
-- valores de enum remanescentes fiquem sem uso.
DELETE FROM "aprovacao_solicitacoes" WHERE "tipo_entidade" = 'PARAMETRO_SENSIVEL';
DELETE FROM "aprovacao_regra_aprovadores" WHERE "regra_id" IN (
    SELECT "id" FROM "aprovacao_regras" WHERE "tipo_entidade" = 'PARAMETRO_SENSIVEL'
);
DELETE FROM "aprovacao_regras" WHERE "tipo_entidade" = 'PARAMETRO_SENSIVEL';
DELETE FROM "usuarios" WHERE "papel" = 'ADMINISTRADOR_PLATAFORMA';

-- DropForeignKey
ALTER TABLE "configuracao_versoes" DROP CONSTRAINT "configuracao_versoes_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "valores_regra_historico" DROP CONSTRAINT "valores_regra_historico_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "valores_regra_historico" DROP CONSTRAINT "valores_regra_historico_valor_regra_id_fkey";

-- DropForeignKey
ALTER TABLE "avaliacoes_scout" DROP CONSTRAINT "avaliacoes_scout_configuracao_versao_id_fkey";

-- DropTable
DROP TABLE "valores_regra_historico";

-- DropTable
DROP TABLE "valores_regra";

-- DropTable
DROP TABLE "configuracao_versoes";

-- DropTable
DROP TABLE "perfis_cliente";

-- AlterTable
ALTER TABLE "avaliacoes_scout" DROP COLUMN "configuracao_versao_id";

-- DropEnum
DROP TYPE "TipoValorRegra";

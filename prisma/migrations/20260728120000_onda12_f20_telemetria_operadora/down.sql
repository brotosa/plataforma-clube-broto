-- Reversão da Onda 12 (F20) — Telemetria da operadora. Aplicar
-- manualmente (ver LEIA-ME.md).
--
-- Reverter DESTRÓI dado que só existe aqui:
--
--   * o histórico de importações, com a procedência de cada uma (arquivo,
--     data de geração declarada, hash, autor) e o resultado por causa.
--     Sem ele não há como saber o que já entrou, e a idempotência da RN67
--     — que é justamente o UNIQUE sobre o hash — deixa de existir: a
--     próxima importação de um arquivo já ingerido volta a ser aceita;
--   * os contadores por oferta e os eventos nominais de resgate;
--   * as divergências de catálogo já relatadas (RN70).
--
-- O que NÃO se perde, e é o ponto: **o cadastro**. Aliados, soluções e
-- ofertas não são tocados por esta migration nem pelo caminho de
-- importação (RN70, com cerca em `infra/arquitetura/
-- reconciliacao-nao-corrige.test.ts`), então reverter a F20 não desfaz
-- nada do catálogo da plataforma. Também permanecem gravados os eventos
-- de auditoria de cada importação, porque a RN49 vale na reversão.
--
-- O que se RECUPERA sem perda: todos os dados destruídos acima são
-- derivados de arquivos que a operadora entrega e reentrega. Reimportar
-- os mesmos arquivos reconstrói contadores, eventos e divergências. O que
-- não volta é o registro de QUANDO e POR QUEM cada carga foi feita.
--
-- ATENÇÃO — o que a reversão NÃO desfaz, e precisa ser desfeito à mão se
-- for o caso: o perfil de assinatura, o estado do usuário, os campos de
-- assinatura e os VÍNCULOS DE PATROCÍNIO que a importação de usuários
-- gravou. Eles moram nas tabelas da F19 (`assinantes`, `assinaturas`,
-- `vinculos_patrocinio`), que esta migration não criou e portanto não
-- remove — apagá-los aqui destruiria também o que foi cadastrado à mão
-- pela T32. Quem precisar reverter o efeito da ingestão nesses campos
-- decide caso a caso, com a trilha de auditoria em mãos.
--
-- A ordem abaixo é a que o `prisma migrate diff` gerou e é a única
-- segura: as chaves estrangeiras caem antes das tabelas que elas
-- apontam, e os enums por último, depois que a última coluna que os usa
-- deixou de existir.

-- DropForeignKey
ALTER TABLE "public"."importacoes_telemetria" DROP CONSTRAINT "importacoes_telemetria_autor_id_fkey";
-- DropForeignKey
ALTER TABLE "public"."contadores_oferta_telemetria" DROP CONSTRAINT "contadores_oferta_telemetria_oferta_id_fkey";
-- DropForeignKey
ALTER TABLE "public"."contadores_oferta_telemetria" DROP CONSTRAINT "contadores_oferta_telemetria_importacao_id_fkey";
-- DropForeignKey
ALTER TABLE "public"."divergencias_catalogo" DROP CONSTRAINT "divergencias_catalogo_importacao_id_fkey";
-- DropForeignKey
ALTER TABLE "public"."eventos_resgate_telemetria" DROP CONSTRAINT "eventos_resgate_telemetria_assinante_id_fkey";
-- DropForeignKey
ALTER TABLE "public"."eventos_resgate_telemetria" DROP CONSTRAINT "eventos_resgate_telemetria_oferta_id_fkey";
-- DropForeignKey
ALTER TABLE "public"."eventos_resgate_telemetria" DROP CONSTRAINT "eventos_resgate_telemetria_importacao_id_fkey";
-- DropTable
DROP TABLE "public"."importacoes_telemetria";
-- DropTable
DROP TABLE "public"."contadores_oferta_telemetria";
-- DropTable
DROP TABLE "public"."divergencias_catalogo";
-- DropTable
DROP TABLE "public"."eventos_resgate_telemetria";
-- DropEnum
DROP TYPE "public"."TipoLayoutTelemetria";
-- DropEnum
DROP TYPE "public"."TipoDivergenciaCatalogo";

-- Reversão da Onda 4 (F12). Aplicar manualmente (ver LEIA-ME.md).
-- A regra de aprovação semeada para a ativação de campanha usa o valor
-- novo do enum: ela sai antes de o enum voltar ao conjunto anterior — que
-- preserva o PARAMETRO_SENSIVEL da Onda 3.
DELETE FROM "aprovacao_solicitacoes" WHERE "tipo_entidade" = 'ATIVACAO_CAMPANHA';
DELETE FROM "aprovacao_regras" WHERE "tipo_entidade" = 'ATIVACAO_CAMPANHA';

-- AlterEnum
BEGIN;
CREATE TYPE "TipoEntidadeAprovacao_new" AS ENUM ('PROMOCAO_ALIADA_ATIVA', 'PUBLICACAO_OFERTA', 'PARAMETRO_SENSIVEL');
ALTER TABLE "aprovacao_regras" ALTER COLUMN "tipo_entidade" TYPE "TipoEntidadeAprovacao_new" USING ("tipo_entidade"::text::"TipoEntidadeAprovacao_new");
ALTER TABLE "aprovacao_solicitacoes" ALTER COLUMN "tipo_entidade" TYPE "TipoEntidadeAprovacao_new" USING ("tipo_entidade"::text::"TipoEntidadeAprovacao_new");
ALTER TYPE "TipoEntidadeAprovacao" RENAME TO "TipoEntidadeAprovacao_old";
ALTER TYPE "TipoEntidadeAprovacao_new" RENAME TO "TipoEntidadeAprovacao";
DROP TYPE "TipoEntidadeAprovacao_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "ofertas" DROP CONSTRAINT "ofertas_destinacao_campanha_id_fkey";

-- DropForeignKey
ALTER TABLE "ofertas" DROP CONSTRAINT "ofertas_destinacao_cesta_id_fkey";

-- DropForeignKey
ALTER TABLE "campanhas" DROP CONSTRAINT "campanhas_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "campanhas" DROP CONSTRAINT "campanhas_segmento_id_fkey";

-- DropForeignKey
ALTER TABLE "campanhas" DROP CONSTRAINT "campanhas_publico_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "cestas" DROP CONSTRAINT "cestas_autor_id_fkey";

-- DropForeignKey
ALTER TABLE "cestas" DROP CONSTRAINT "cestas_segmento_id_fkey";

-- DropForeignKey
ALTER TABLE "cesta_ofertas" DROP CONSTRAINT "cesta_ofertas_cesta_id_fkey";

-- DropForeignKey
ALTER TABLE "cesta_ofertas" DROP CONSTRAINT "cesta_ofertas_oferta_id_fkey";

-- DropForeignKey
ALTER TABLE "campanha_cestas" DROP CONSTRAINT "campanha_cestas_campanha_id_fkey";

-- DropForeignKey
ALTER TABLE "campanha_cestas" DROP CONSTRAINT "campanha_cestas_cesta_id_fkey";

-- DropForeignKey
ALTER TABLE "campanha_ofertas" DROP CONSTRAINT "campanha_ofertas_campanha_id_fkey";

-- DropForeignKey
ALTER TABLE "campanha_ofertas" DROP CONSTRAINT "campanha_ofertas_oferta_id_fkey";

-- DropForeignKey
ALTER TABLE "pecas_campanha" DROP CONSTRAINT "pecas_campanha_campanha_id_fkey";

-- DropForeignKey
ALTER TABLE "pecas_campanha" DROP CONSTRAINT "pecas_campanha_formato_id_fkey";

-- DropForeignKey
ALTER TABLE "metas_campanha" DROP CONSTRAINT "metas_campanha_campanha_id_fkey";

-- DropForeignKey
ALTER TABLE "kits_campanha" DROP CONSTRAINT "kits_campanha_campanha_id_fkey";

-- DropForeignKey
ALTER TABLE "kits_campanha" DROP CONSTRAINT "kits_campanha_autor_id_fkey";

-- DropIndex
DROP INDEX "ofertas_destinacao_campanha_id_idx";

-- DropIndex
DROP INDEX "ofertas_destinacao_cesta_id_idx";

-- AlterTable
ALTER TABLE "ofertas" DROP COLUMN "destinacao",
DROP COLUMN "destinacao_campanha_id",
DROP COLUMN "destinacao_cesta_id";

-- DropTable
DROP TABLE "formatos_peca";

-- DropTable
DROP TABLE "campanhas";

-- DropTable
DROP TABLE "cestas";

-- DropTable
DROP TABLE "cesta_ofertas";

-- DropTable
DROP TABLE "campanha_cestas";

-- DropTable
DROP TABLE "campanha_ofertas";

-- DropTable
DROP TABLE "pecas_campanha";

-- DropTable
DROP TABLE "metas_campanha";

-- DropTable
DROP TABLE "kits_campanha";

-- DropEnum
DROP TYPE "DestinacaoOferta";

-- DropEnum
DROP TYPE "EstadoCampanha";

-- DropEnum
DROP TYPE "OrigemPublicoCampanha";

-- DropEnum
DROP TYPE "TipoMetaCampanha";

-- DropEnum
DROP TYPE "NivelAtribuicao";


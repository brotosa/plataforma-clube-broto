-- AlterTable
ALTER TABLE "aprovacao_solicitacoes" ADD COLUMN     "avaliacao_vigente_id" TEXT,
ADD COLUMN     "dossie_vigente_id" TEXT;

-- AddForeignKey
ALTER TABLE "aprovacao_solicitacoes" ADD CONSTRAINT "aprovacao_solicitacoes_avaliacao_vigente_id_fkey" FOREIGN KEY ("avaliacao_vigente_id") REFERENCES "avaliacoes_scout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao_solicitacoes" ADD CONSTRAINT "aprovacao_solicitacoes_dossie_vigente_id_fkey" FOREIGN KEY ("dossie_vigente_id") REFERENCES "dossies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

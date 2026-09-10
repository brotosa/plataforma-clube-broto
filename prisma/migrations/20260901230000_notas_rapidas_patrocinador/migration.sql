-- Painel de atividades também na ficha do Patrocinador. A "nota rápida" que já
-- serve o aliado passa a servir o patrocinador: a nota vincula a UMA ficha —
-- aliado (empresa_id) OU patrocinador (patrocinador_id), nunca as duas nem
-- nenhuma. Totalmente aditiva sobre a base povoada: nenhum tipo estreitado
-- (empresa_id apenas RELAXA de NOT NULL para anulável) e nenhum valor exigido
-- sobre linha existente (as linhas atuais têm empresa_id e satisfazem o XOR).

-- AlterTable: empresa_id deixa de ser obrigatório (o vínculo agora é exclusivo
-- entre aliado e patrocinador) e entra o vínculo com o patrocinador.
ALTER TABLE "notas_rapidas" ALTER COLUMN "empresa_id" DROP NOT NULL;
ALTER TABLE "notas_rapidas" ADD COLUMN "patrocinador_id" TEXT;

-- Exatamente uma das duas fichas é o dono da nota (XOR). Válido para as linhas
-- existentes, que têm empresa_id preenchido e patrocinador_id nulo.
ALTER TABLE "notas_rapidas" ADD CONSTRAINT "notas_rapidas_dono_exclusivo"
  CHECK (("empresa_id" IS NOT NULL) <> ("patrocinador_id" IS NOT NULL));

-- CreateIndex
CREATE INDEX "notas_rapidas_patrocinador_id_idx" ON "notas_rapidas"("patrocinador_id");

-- CreateIndex
CREATE INDEX "notas_rapidas_patrocinador_id_criado_em_idx" ON "notas_rapidas"("patrocinador_id", "criado_em");

-- AddForeignKey
ALTER TABLE "notas_rapidas" ADD CONSTRAINT "notas_rapidas_patrocinador_id_fkey" FOREIGN KEY ("patrocinador_id") REFERENCES "patrocinadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

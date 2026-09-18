-- F30 (RN86) — o painel: vários relatórios lado a lado.
--
-- ESTRITAMENTE ADITIVA sobre base povoada: uma tabela nova e uma coluna
-- anulável. Nenhuma linha existente é tocada, e não há backfill.
--
-- A coluna `painel_id` em `execucoes_relatorio` existe para a trilha poder
-- ser LIDA. Sem ela, abrir um painel de oito blocos aparece como oito
-- consultas soltas no mesmo segundo, indistinguível de alguém varrendo a
-- plataforma à mão. Anulável porque execução vinda da T36 não tem painel —
-- e é a maior parte delas.
CREATE TABLE "paineis" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "blocos" JSONB NOT NULL,
    "filtro" JSONB,
    "autor_id" TEXT NOT NULL,
    "visibilidade" "VisibilidadeRelatorio" NOT NULL DEFAULT 'PRIVADO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paineis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "paineis_autor_id_atualizado_em_idx" ON "paineis"("autor_id", "atualizado_em");
CREATE INDEX "paineis_visibilidade_atualizado_em_idx" ON "paineis"("visibilidade", "atualizado_em");

ALTER TABLE "paineis" ADD CONSTRAINT "paineis_autor_id_fkey"
    FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "execucoes_relatorio" ADD COLUMN "painel_id" TEXT;

CREATE INDEX "execucoes_relatorio_painel_id_criado_em_idx"
    ON "execucoes_relatorio"("painel_id", "criado_em");

-- SET NULL e não CASCADE: apagar um painel NÃO pode apagar a trilha do que
-- foi consultado por ele. A auditoria não se apaga (RN49), e a execução
-- continua sendo um fato mesmo depois de o painel deixar de existir.
ALTER TABLE "execucoes_relatorio" ADD CONSTRAINT "execucoes_relatorio_painel_id_fkey"
    FOREIGN KEY ("painel_id") REFERENCES "paineis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

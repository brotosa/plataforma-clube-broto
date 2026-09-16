-- Onda 16 (F24) — Gerador de relatórios: relatórios salvos e trilha de execução.
--
-- ESTRITAMENTE ADITIVA, e sobre base povoada (aliados e ofertas reais, 46
-- prospects, 2.000 assinantes): dois tipos novos e duas tabelas novas.
-- Nenhuma coluna removida, nenhum tipo estreitado, nenhuma linha existente
-- tocada — a única alteração em tabela antiga seria uma chave estrangeira, e
-- ela aponta PARA `usuarios`, não altera `usuarios`.
--
-- O módulo nasce sem nenhum relatório salvo. Não há seed, e é decisão: os
-- "Modelos da plataforma" da galeria vivem em código
-- (`dominio/relatorios/catalogo.ts`), como os assuntos — modelo semeado em
-- tabela viraria dado que alguém edita e que a próxima carga sobrescreve.

CREATE TYPE "VisibilidadeRelatorio" AS ENUM ('PRIVADO', 'TIME');

CREATE TABLE "relatorios_salvos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "assunto_slug" TEXT NOT NULL,
    "definicao" JSONB NOT NULL,
    "autor_id" TEXT NOT NULL,
    "visibilidade" "VisibilidadeRelatorio" NOT NULL DEFAULT 'PRIVADO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relatorios_salvos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execucoes_relatorio" (
    "id" TEXT NOT NULL,
    "relatorio_id" TEXT,
    "assunto_slug" TEXT NOT NULL,
    "definicao" JSONB NOT NULL,
    "linhas" INTEGER NOT NULL,
    "truncado" BOOLEAN NOT NULL DEFAULT false,
    "duracao_ms" INTEGER NOT NULL,
    "finalidade" TEXT,
    "erro" TEXT,
    "autor_id" TEXT NOT NULL,
    "exportou" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execucoes_relatorio_pkey" PRIMARY KEY ("id")
);

-- A galeria lê por autor (prateleira "Meus") e por visibilidade ("Do time").
CREATE INDEX "relatorios_salvos_autor_id_atualizado_em_idx" ON "relatorios_salvos"("autor_id", "atualizado_em");
CREATE INDEX "relatorios_salvos_visibilidade_atualizado_em_idx" ON "relatorios_salvos"("visibilidade", "atualizado_em");

CREATE INDEX "execucoes_relatorio_autor_id_criado_em_idx" ON "execucoes_relatorio"("autor_id", "criado_em");
CREATE INDEX "execucoes_relatorio_relatorio_id_criado_em_idx" ON "execucoes_relatorio"("relatorio_id", "criado_em");
CREATE INDEX "execucoes_relatorio_criado_em_idx" ON "execucoes_relatorio"("criado_em");

ALTER TABLE "relatorios_salvos" ADD CONSTRAINT "relatorios_salvos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL e não CASCADE: apagar um relatório salvo não pode apagar o
-- registro de que ele foi executado. A trilha operacional responde "o que
-- rodou neste banco", e a resposta não muda porque alguém arrumou a galeria.
ALTER TABLE "execucoes_relatorio" ADD CONSTRAINT "execucoes_relatorio_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "relatorios_salvos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "execucoes_relatorio" ADD CONSTRAINT "execucoes_relatorio_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

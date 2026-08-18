-- Reversão de 20260818190000_painel_atividades_aliado.
-- Aditiva: derruba a tabela de menções e as colunas novas de notas_rapidas.
-- As FKs caem com a tabela; o índice de notas_rapidas cai com a coluna? Não —
-- índice sobre coluna que permanece, então é removido explicitamente.
DROP TABLE "nota_rapida_mencoes";
DROP INDEX "notas_rapidas_empresa_id_criado_em_idx";
ALTER TABLE "notas_rapidas"
  DROP COLUMN "editado_em",
  DROP COLUMN "eh_pendencia",
  DROP COLUMN "pendencia_resolvida_em",
  DROP COLUMN "removido_em";

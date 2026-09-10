-- Reversão da migration 20260910180000_anexo_nota_rapida.
-- Aditiva: só criou a tabela nota_rapida_anexos (1:1 com notas_rapidas).
-- As FKs caem junto com a tabela; nenhuma coluna foi tocada em tabela
-- existente, então a base povoada volta ao estado anterior sem perda.
DROP TABLE "nota_rapida_anexos";

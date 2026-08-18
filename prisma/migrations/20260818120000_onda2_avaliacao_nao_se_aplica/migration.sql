-- "Não se aplica" na avaliação de scout (Onda 2, acréscimo pós-homologação).
-- Um indicador que não faz sentido para o aliado passa a ter uma resposta
-- própria — N/A —, distinta de "sem nota". Ela conta como respondida, mas
-- sai da média do score (nunca vira 0 nem 5).
--
-- Aditiva/relaxante sobre base povoada: `nota` deixa de ser obrigatória
-- (NULL = N/A) e ganha a coluna `nao_se_aplica` com DEFAULT. As linhas
-- existentes têm nota 1–5 e nao_se_aplica=false, satisfazendo o novo CHECK
-- de coerência — nenhuma exige backfill.

-- 1) A nota deixa de ser obrigatória; NULL representa "não se aplica".
ALTER TABLE "avaliacao_notas" ALTER COLUMN "nota" DROP NOT NULL;

-- 2) Marca de "não se aplica".
ALTER TABLE "avaliacao_notas" ADD COLUMN "nao_se_aplica" BOOLEAN NOT NULL DEFAULT false;

-- 3) Coerência (XOR): ou é nota 1–5 (nao_se_aplica=false), ou é N/A
--    (nota NULL, nao_se_aplica=true) — nunca ambos, nunca nenhum. O CHECK
--    antigo `nota BETWEEN 1 AND 5` permanece válido: NULL o atravessa por
--    semântica SQL, então nota nula continua consistente.
ALTER TABLE "avaliacao_notas"
  ADD CONSTRAINT "avaliacao_notas_nota_ou_nao_se_aplica"
  CHECK (
    ("nota" IS NOT NULL AND "nao_se_aplica" = false)
    OR ("nota" IS NULL AND "nao_se_aplica" = true)
  );

-- Reversão da adição do valor de enum.
--
-- O PostgreSQL não suporta DROP VALUE em enum, então 'ADMIN' não é removido: a
-- reversão o deixa órfão e inerte. Quem devolve as contas ao valor anterior é o
-- down da migration seguinte (20260915130000), que roda ANTES desta na ordem de
-- reversão. O UPDATE abaixo é rede de segurança para o caso de alguma linha ter
-- ficado com 'ADMIN' — promove em vez de apagar, porque numa base povoada
-- apagar conta destruiria dado real e tudo o que dela depende por chave
-- estrangeira.
UPDATE "usuarios" SET "papel" = 'ADMINISTRADOR_PLATAFORMA' WHERE "papel" = 'ADMIN';

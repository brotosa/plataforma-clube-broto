-- Desfaz a renomeação: quem está como Administrador volta a Administrador da
-- Plataforma, que é o nome anterior do mesmo papel.
--
-- ATENÇÃO ao reverter com a base em uso: se alguém tiver sido promovido ao
-- ACESSO TOTAL depois da migration, esta reversão o torna indistinguível dos
-- demais — os dois grupos voltam ao mesmo valor de enum. É inerente a desfazer
-- um desdobramento, e o registro de quem recebeu o quê permanece na trilha de
-- auditoria (RN49), que não se apaga.
UPDATE "usuarios" SET "papel" = 'ADMINISTRADOR_PLATAFORMA' WHERE "papel" = 'ADMIN';

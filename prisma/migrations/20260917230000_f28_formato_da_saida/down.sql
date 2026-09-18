-- Reversão da F28. Descarta o registro de FORMATO das saídas; o registro de
-- que houve saída (`exportou`) permanece, porque é de outra migration.
ALTER TABLE "execucoes_relatorio" DROP COLUMN "formato";

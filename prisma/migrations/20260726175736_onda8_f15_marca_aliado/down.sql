-- Reversão da Onda 8 (F15) — marca do aliado. Aplicar manualmente (ver
-- LEIA-ME.md).
--
-- Reverter DESTRÓI as marcas enviadas: o binário só existe nesta tabela.
-- Antes de aplicar em ambiente com uso real, extrair o conteúdo (por
-- exemplo `\copy (SELECT empresa_id, nome_arquivo, encode(conteudo,
-- 'base64') FROM marcas_aliado) TO 'marcas.csv' CSV`) — depois do DROP
-- não há de onde recuperar.
--
-- O schema volta inteiro ao estado da F14: `empresas.logo_url` nunca foi
-- tocada pela ida, então não há o que restaurar nela. Os eventos de
-- auditoria de envio, troca e remoção da marca permanecem gravados — é a
-- RN49 valendo também na reversão, o mesmo que a F13 já fazia.

-- DropTable
DROP TABLE "marcas_aliado";

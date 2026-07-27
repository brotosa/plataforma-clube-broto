-- Reversão da Onda 10 (F17) — imagem do card da solução. Aplicar
-- manualmente (ver LEIA-ME.md).
--
-- Reverter DESTRÓI as imagens enviadas: o binário só existe nesta tabela.
-- Antes de aplicar em ambiente com uso real, extrair o conteúdo (por
-- exemplo `\copy (SELECT solucao_id, nome_arquivo, encode(conteudo,
-- 'base64') FROM imagens_solucao) TO 'imagens-solucao.csv' CSV`) — depois
-- do DROP não há de onde recuperar.
--
-- O schema volta inteiro ao estado da F16: `solucoes.imagem_card_url`
-- nunca foi tocada pela ida, então não há o que restaurar nela, e as
-- soluções que ainda tiverem valor lá voltam a ser a única fonte. Os
-- eventos de auditoria de envio, troca e remoção permanecem gravados — é a
-- RN49 valendo também na reversão.

-- DropTable
DROP TABLE "imagens_solucao";

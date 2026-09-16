-- Validade da credencial provisória (fila de acabamento da Onda 15, item 1).
--
-- Estritamente aditiva, e sobre base POVOADA: as duas colunas são opcionais ou
-- têm padrão, e nenhuma linha existente precisa ser tocada.
--
-- `credencial_emitida_em` nasce NULA de propósito, inclusive para quem hoje
-- está com `troca_senha_obrigatoria = true`. Preenchê-la num backfill daria a
-- essas contas um prazo que ninguém combinou com elas — e, com a proteção
-- ligada em seguida, expiraria credencial que está em uso agora. Quem já tem
-- credencial provisória sem data continua sem prazo até a próxima emissão.
--
-- `credencial_provisoria_horas` nasce 0 (desligado), como toda proteção desta
-- tela: ligar é decisão do Administrador, nunca efeito de deploy.
ALTER TABLE "usuarios" ADD COLUMN "credencial_emitida_em" TIMESTAMP(3);

ALTER TABLE "configuracao_portal"
  ADD COLUMN "credencial_provisoria_horas" INTEGER NOT NULL DEFAULT 0;

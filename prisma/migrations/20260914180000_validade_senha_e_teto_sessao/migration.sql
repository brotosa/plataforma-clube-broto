-- AlterTable (aditivo): validade da senha e teto absoluto de sessão, ambos
-- com DEFAULT 0 = DESATIVADO. Subir esta migration não muda o comportamento
-- de ninguém; ligar é ato do Administrador na tela de Configurações.
ALTER TABLE "configuracao_portal" ADD COLUMN "senha_validade_dias" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "configuracao_portal" ADD COLUMN "sessao_teto_min" INTEGER NOT NULL DEFAULT 0;

-- AlterTable (aditivo): quando a senha foi trocada pela última vez.
-- ANULÁVEL de propósito, e SEM backfill: nulo significa "nunca vence".
-- Preencher com criado_em/atualizado_em mandaria a base inteira para a tela
-- de troca de senha no primeiro deploy — o oposto de uma migration segura
-- sobre base povoada.
ALTER TABLE "usuarios" ADD COLUMN "senha_alterada_em" TIMESTAMP(3);

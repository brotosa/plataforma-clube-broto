-- Onda 6 (F13) — Dashboard, Usuários e Auditoria:
-- ficha-onda6-dashboard-usuarios-auditoria.md.
--
-- Onda de consolidação: nenhuma entidade nova. A trilha de auditoria, os
-- usuários e todas as fontes de indicador já existem desde a F1 — o que
-- entra aqui é (a) o que a RN47 exige para revogar acesso de verdade e
-- (b) os índices que fazem a HOME agregar em menos de 1s.
--
-- RN49 — NENHUMA PURGA. Não existe DELETE de auditoria_eventos nesta
-- migration, nem rotina de expurgo em lugar nenhum da plataforma, e a
-- exportação do extrato (RN48) só lê. A política formal de retenção é
-- [A CONFIRMAR — jurídico/compliance]: até que o jurídico da Broto a
-- defina, a premissa é retenção integral. Quando vier, ela entra como
-- migration própria com o prazo declarado — nunca como limpeza silenciosa
-- embutida em outra mudança.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "sessao_epoca" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "troca_senha_obrigatoria" BOOLEAN NOT NULL DEFAULT true;

-- As duas colunas acima nascem no padrão seguro: toda credencial emitida
-- daqui em diante é provisória até o dono trocar a senha. As linhas que já
-- existem, porém, são anteriores à T27 — ninguém as emitiu por lá, e
-- marcá-las forçaria uma troca de senha que o negócio não pediu (incluindo
-- a do usuário de rotina do job diário, que não autentica). Ficam
-- desmarcadas, explicitamente.
UPDATE "usuarios" SET "troca_senha_obrigatoria" = false;

-- CreateIndex
CREATE INDEX "auditoria_eventos_criado_em_idx" ON "auditoria_eventos"("criado_em");

-- CreateIndex
CREATE INDEX "auditoria_eventos_entidade_criado_em_idx" ON "auditoria_eventos"("entidade", "criado_em");

-- CreateIndex
CREATE INDEX "auditoria_eventos_autor_id_criado_em_idx" ON "auditoria_eventos"("autor_id", "criado_em");

-- CreateIndex
CREATE INDEX "contratos_comerciais_status_em_janela_nao_renovacao_idx" ON "contratos_comerciais"("status", "em_janela_nao_renovacao");

-- CreateIndex
CREATE INDEX "empresas_estagio_reavaliacao_pendente_idx" ON "empresas"("estagio", "reavaliacao_pendente");

-- CreateIndex
CREATE INDEX "importacoes_criado_em_idx" ON "importacoes"("criado_em");

-- CreateIndex
CREATE INDEX "ofertas_status_vigencia_fim_idx" ON "ofertas"("status", "vigencia_fim");

-- CreateIndex
CREATE INDEX "telemetria_eventos_tipo_data_evento_idx" ON "telemetria_eventos"("tipo", "data_evento");

-- CreateIndex
CREATE INDEX "telemetria_eventos_oferta_id_tipo_data_evento_idx" ON "telemetria_eventos"("oferta_id", "tipo", "data_evento");

-- CreateIndex
CREATE INDEX "telemetria_eventos_cpf_hash_data_evento_idx" ON "telemetria_eventos"("cpf_hash", "data_evento");

-- CreateIndex
CREATE INDEX "usuarios_papel_ativo_idx" ON "usuarios"("papel", "ativo");

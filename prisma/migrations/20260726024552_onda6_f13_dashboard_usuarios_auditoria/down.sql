-- Reversão da Onda 6 (F13). Aplicar manualmente (ver LEIA-ME.md).
--
-- Reverter a F13 devolve o schema, não o histórico: os eventos de auditoria
-- gravados enquanto a fase esteve aplicada permanecem — é a RN49 valendo
-- também na reversão. Nada de auditoria_eventos é apagado aqui.
--
-- A sessão dos usuários logados no momento da reversão sobrevive: sem a
-- coluna de época, o callback do Auth.js volta a não conferir revogação e
-- o token vigente continua válido até expirar. Quem tiver sido inativado
-- durante a vigência da F13 continua barrado pelo `ativo = false`, que é
-- anterior a esta fase.

-- DropIndex
DROP INDEX "usuarios_papel_ativo_idx";

-- DropIndex
DROP INDEX "telemetria_eventos_cpf_hash_data_evento_idx";

-- DropIndex
DROP INDEX "telemetria_eventos_oferta_id_tipo_data_evento_idx";

-- DropIndex
DROP INDEX "telemetria_eventos_tipo_data_evento_idx";

-- DropIndex
DROP INDEX "ofertas_status_vigencia_fim_idx";

-- DropIndex
DROP INDEX "importacoes_criado_em_idx";

-- DropIndex
DROP INDEX "empresas_estagio_reavaliacao_pendente_idx";

-- DropIndex
DROP INDEX "contratos_comerciais_status_em_janela_nao_renovacao_idx";

-- DropIndex
DROP INDEX "auditoria_eventos_autor_id_criado_em_idx";

-- DropIndex
DROP INDEX "auditoria_eventos_entidade_criado_em_idx";

-- DropIndex
DROP INDEX "auditoria_eventos_criado_em_idx";

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "troca_senha_obrigatoria",
DROP COLUMN "sessao_epoca";

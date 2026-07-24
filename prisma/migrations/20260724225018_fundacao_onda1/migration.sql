-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('GESTOR', 'ANALISTA', 'APROVADOR', 'LEITURA');

-- CreateEnum
CREATE TYPE "EstagioEmpresa" AS ENUM ('EM_NEGOCIACAO', 'ALIADA_ATIVA', 'SUSPENSA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "PapelContato" AS ENUM ('COMERCIAL', 'TECNICO', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "StatusContrato" AS ENUM ('VIGENTE', 'DENUNCIADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "AmbientePagamento" AS ENUM ('DENTRO_PLATAFORMA', 'FORA_PLATAFORMA', 'AMBOS');

-- CreateEnum
CREATE TYPE "StatusSolucao" AS ENUM ('ATIVA', 'INATIVA');

-- CreateEnum
CREATE TYPE "PorteProdutor" AS ENUM ('PEQUENO', 'MEDIO', 'GRANDE');

-- CreateEnum
CREATE TYPE "NaturezaOferta" AS ENUM ('RECOMPENSA', 'BENEFICIO', 'CUPOM_DESCONTO');

-- CreateEnum
CREATE TYPE "ModalidadePagamento" AS ENUM ('UNICA', 'RECORRENTE');

-- CreateEnum
CREATE TYPE "StatusOferta" AS ENUM ('RASCUNHO', 'PUBLICADA', 'PAUSADA', 'ENCERRADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "TipoEventoTelemetria" AS ENUM ('EMISSAO_VOUCHER', 'RESGATE_VOUCHER', 'COMPRA_CONFIRMADA');

-- CreateEnum
CREATE TYPE "TipoImportacao" AS ENUM ('TELEMETRIA', 'CARGA_SELLERS', 'CARGA_OFERTAS');

-- CreateEnum
CREATE TYPE "EstadoStaging" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'EFETIVADA');

-- CreateEnum
CREATE TYPE "TipoEntidadeAprovacao" AS ENUM ('PROMOCAO_ALIADA_ATIVA', 'PUBLICACAO_OFERTA');

-- CreateEnum
CREATE TYPE "EstadoSolicitacao" AS ENUM ('SOLICITADA', 'APROVADA', 'DEVOLVIDA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "culturas" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "culturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ufs" (
    "id" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ufs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_beneficio" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_beneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mecanicas" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mecanicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivos_suspensao" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivos_suspensao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT,
    "nome_fantasia" TEXT NOT NULL,
    "cnpj" TEXT,
    "endereco_cep" TEXT,
    "endereco_logradouro" TEXT,
    "endereco_numero" TEXT,
    "endereco_complemento" TEXT,
    "endereco_bairro" TEXT,
    "endereco_municipio" TEXT,
    "endereco_uf" TEXT,
    "logo_url" TEXT,
    "descricao_institucional" TEXT,
    "site" TEXT,
    "data_entrada" DATE,
    "estagio" "EstagioEmpresa" NOT NULL DEFAULT 'EM_NEGOCIACAO',
    "motivo_suspensao_id" TEXT,
    "motivo_suspensao_descricao" TEXT,
    "score_scouting" INTEGER,
    "id_externo_minutrade" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresa_categorias" (
    "empresa_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,

    CONSTRAINT "empresa_categorias_pkey" PRIMARY KEY ("empresa_id","categoria_id")
);

-- CreateTable
CREATE TABLE "contatos_empresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "papel" "PapelContato" NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatos_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos_comerciais" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "anexo_s3_key" TEXT,
    "data_assinatura" DATE,
    "hash_verificacao" TEXT,
    "vigencia_base" DATE NOT NULL,
    "status" "StatusContrato" NOT NULL DEFAULT 'VIGENTE',
    "comissao_pct" DECIMAL(5,2),
    "ambientes_pagamento" "AmbientePagamento" NOT NULL,
    "em_janela_nao_renovacao" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_comerciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solucoes" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao_curta" TEXT,
    "descricao_completa" TEXT,
    "categoria_id" TEXT,
    "perfil_cliente" "PorteProdutor"[],
    "tecnologias" TEXT[],
    "imagem_card_url" TEXT,
    "link_externo" TEXT,
    "status" "StatusSolucao" NOT NULL DEFAULT 'ATIVA',
    "cobertura_nacional" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solucoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solucao_culturas" (
    "solucao_id" TEXT NOT NULL,
    "cultura_id" TEXT NOT NULL,

    CONSTRAINT "solucao_culturas_pkey" PRIMARY KEY ("solucao_id","cultura_id")
);

-- CreateTable
CREATE TABLE "solucao_ufs" (
    "solucao_id" TEXT NOT NULL,
    "uf_id" TEXT NOT NULL,

    CONSTRAINT "solucao_ufs_pkey" PRIMARY KEY ("solucao_id","uf_id")
);

-- CreateTable
CREATE TABLE "ofertas" (
    "id" TEXT NOT NULL,
    "solucao_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "natureza" "NaturezaOferta" NOT NULL,
    "tipo_beneficio_id" TEXT NOT NULL,
    "preco_de" DECIMAL(12,2),
    "preco_por" DECIMAL(12,2),
    "cupom_codigo_regras" TEXT,
    "modalidade_pagamento" "ModalidadePagamento",
    "mecanica_id" TEXT NOT NULL,
    "url_resgate_externo" TEXT,
    "instrucoes_resgate" TEXT,
    "vigencia_inicio" DATE NOT NULL,
    "vigencia_fim" DATE,
    "limite_resgates" INTEGER,
    "status" "StatusOferta" NOT NULL DEFAULT 'RASCUNHO',
    "pendente_republicacao" BOOLEAN NOT NULL DEFAULT false,
    "id_externo_minutrade" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetria_eventos" (
    "id" TEXT NOT NULL,
    "id_voucher" TEXT NOT NULL,
    "tipo" "TipoEventoTelemetria" NOT NULL,
    "cpf_hash" TEXT,
    "valor" DECIMAL(12,2),
    "data_evento" TIMESTAMP(3) NOT NULL,
    "canal" TEXT,
    "id_seller_externo" TEXT,
    "id_oferta_externo" TEXT,
    "oferta_id" TEXT,
    "arquivo_origem" TEXT,
    "importacao_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetria_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetria_acumulados_iniciais" (
    "id" TEXT NOT NULL,
    "oferta_id" TEXT NOT NULL,
    "resgates" INTEGER,
    "compras" INTEGER,
    "data_corte" DATE NOT NULL,
    "importacao_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetria_acumulados_iniciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publicacoes" (
    "id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "pacote" JSONB NOT NULL,
    "diff" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publicacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes" (
    "id" TEXT NOT NULL,
    "tipo" "TipoImportacao" NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "linhas_ok" INTEGER NOT NULL DEFAULT 0,
    "linhas_erro" INTEGER NOT NULL DEFAULT 0,
    "relatorio_quarentena" JSONB,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_sellers" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "linha_origem" INTEGER NOT NULL,
    "dados_originais" JSONB NOT NULL,
    "nome_seller" TEXT,
    "id_seller_externo" TEXT,
    "data_entrada" DATE,
    "estado" "EstadoStaging" NOT NULL DEFAULT 'PENDENTE',
    "mensagem_erro" TEXT,
    "empresa_id_efetivada" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_ofertas" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "linha_origem" INTEGER NOT NULL,
    "dados_originais" JSONB NOT NULL,
    "produto" TEXT,
    "checkout" TEXT,
    "preco" TEXT,
    "desconto" TEXT,
    "preco_final" TEXT,
    "status_oferta" TEXT,
    "resgates" INTEGER,
    "compras" INTEGER,
    "id_seller_externo" TEXT,
    "agrupamento_id" TEXT,
    "estado" "EstadoStaging" NOT NULL DEFAULT 'PENDENTE',
    "mensagem_erro" TEXT,
    "solucao_id_efetivada" TEXT,
    "oferta_id_efetivada" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_agrupamentos" (
    "id" TEXT NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "chave_heuristica" TEXT NOT NULL,
    "nome_solucao_proposto" TEXT NOT NULL,
    "estado" "EstadoStaging" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_agrupamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aprovacao_regras" (
    "id" TEXT NOT NULL,
    "tipo_entidade" "TipoEntidadeAprovacao" NOT NULL,
    "exigida" BOOLEAN NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aprovacao_regras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aprovacao_regra_aprovadores" (
    "regra_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,

    CONSTRAINT "aprovacao_regra_aprovadores_pkey" PRIMARY KEY ("regra_id","usuario_id")
);

-- CreateTable
CREATE TABLE "aprovacao_solicitacoes" (
    "id" TEXT NOT NULL,
    "tipo_entidade" "TipoEntidadeAprovacao" NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "estado" "EstadoSolicitacao" NOT NULL DEFAULT 'SOLICITADA',
    "comentario" TEXT,
    "aprovador_id" TEXT,
    "decidido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aprovacao_solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_eventos" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor_anterior" TEXT,
    "valor_novo" TEXT,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "categorias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "culturas_slug_key" ON "culturas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "culturas_nome_key" ON "culturas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "ufs_sigla_key" ON "ufs"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "ufs_nome_key" ON "ufs"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_beneficio_slug_key" ON "tipos_beneficio"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_beneficio_nome_key" ON "tipos_beneficio"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "mecanicas_slug_key" ON "mecanicas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "mecanicas_nome_key" ON "mecanicas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_suspensao_slug_key" ON "motivos_suspensao"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_suspensao_nome_key" ON "motivos_suspensao"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_id_externo_minutrade_key" ON "empresas"("id_externo_minutrade");

-- CreateIndex
CREATE INDEX "contatos_empresa_empresa_id_idx" ON "contatos_empresa"("empresa_id");

-- CreateIndex
CREATE INDEX "contratos_comerciais_empresa_id_idx" ON "contratos_comerciais"("empresa_id");

-- CreateIndex
CREATE INDEX "solucoes_empresa_id_idx" ON "solucoes"("empresa_id");

-- CreateIndex
CREATE INDEX "ofertas_solucao_id_idx" ON "ofertas"("solucao_id");

-- CreateIndex
CREATE INDEX "ofertas_status_idx" ON "ofertas"("status");

-- CreateIndex
CREATE INDEX "telemetria_eventos_oferta_id_idx" ON "telemetria_eventos"("oferta_id");

-- CreateIndex
CREATE UNIQUE INDEX "telemetria_eventos_id_voucher_tipo_key" ON "telemetria_eventos"("id_voucher", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "telemetria_acumulados_iniciais_oferta_id_data_corte_key" ON "telemetria_acumulados_iniciais"("oferta_id", "data_corte");

-- CreateIndex
CREATE INDEX "staging_sellers_importacao_id_idx" ON "staging_sellers"("importacao_id");

-- CreateIndex
CREATE INDEX "staging_ofertas_importacao_id_idx" ON "staging_ofertas"("importacao_id");

-- CreateIndex
CREATE INDEX "staging_agrupamentos_importacao_id_idx" ON "staging_agrupamentos"("importacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "aprovacao_regras_tipo_entidade_key" ON "aprovacao_regras"("tipo_entidade");

-- CreateIndex
CREATE INDEX "aprovacao_solicitacoes_estado_idx" ON "aprovacao_solicitacoes"("estado");

-- CreateIndex
CREATE INDEX "aprovacao_solicitacoes_tipo_entidade_entidade_id_idx" ON "aprovacao_solicitacoes"("tipo_entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "auditoria_eventos_entidade_entidade_id_idx" ON "auditoria_eventos"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "auditoria_eventos_autor_id_idx" ON "auditoria_eventos"("autor_id");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_motivo_suspensao_id_fkey" FOREIGN KEY ("motivo_suspensao_id") REFERENCES "motivos_suspensao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_categorias" ADD CONSTRAINT "empresa_categorias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_categorias" ADD CONSTRAINT "empresa_categorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contatos_empresa" ADD CONSTRAINT "contatos_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_comerciais" ADD CONSTRAINT "contratos_comerciais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucoes" ADD CONSTRAINT "solucoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucoes" ADD CONSTRAINT "solucoes_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucao_culturas" ADD CONSTRAINT "solucao_culturas_solucao_id_fkey" FOREIGN KEY ("solucao_id") REFERENCES "solucoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucao_culturas" ADD CONSTRAINT "solucao_culturas_cultura_id_fkey" FOREIGN KEY ("cultura_id") REFERENCES "culturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucao_ufs" ADD CONSTRAINT "solucao_ufs_solucao_id_fkey" FOREIGN KEY ("solucao_id") REFERENCES "solucoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucao_ufs" ADD CONSTRAINT "solucao_ufs_uf_id_fkey" FOREIGN KEY ("uf_id") REFERENCES "ufs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_solucao_id_fkey" FOREIGN KEY ("solucao_id") REFERENCES "solucoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_tipo_beneficio_id_fkey" FOREIGN KEY ("tipo_beneficio_id") REFERENCES "tipos_beneficio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_mecanica_id_fkey" FOREIGN KEY ("mecanica_id") REFERENCES "mecanicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetria_eventos" ADD CONSTRAINT "telemetria_eventos_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetria_eventos" ADD CONSTRAINT "telemetria_eventos_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetria_acumulados_iniciais" ADD CONSTRAINT "telemetria_acumulados_iniciais_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetria_acumulados_iniciais" ADD CONSTRAINT "telemetria_acumulados_iniciais_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_sellers" ADD CONSTRAINT "staging_sellers_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_ofertas" ADD CONSTRAINT "staging_ofertas_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_ofertas" ADD CONSTRAINT "staging_ofertas_agrupamento_id_fkey" FOREIGN KEY ("agrupamento_id") REFERENCES "staging_agrupamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_agrupamentos" ADD CONSTRAINT "staging_agrupamentos_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao_regra_aprovadores" ADD CONSTRAINT "aprovacao_regra_aprovadores_regra_id_fkey" FOREIGN KEY ("regra_id") REFERENCES "aprovacao_regras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao_regra_aprovadores" ADD CONSTRAINT "aprovacao_regra_aprovadores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao_solicitacoes" ADD CONSTRAINT "aprovacao_solicitacoes_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao_solicitacoes" ADD CONSTRAINT "aprovacao_solicitacoes_aprovador_id_fkey" FOREIGN KEY ("aprovador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

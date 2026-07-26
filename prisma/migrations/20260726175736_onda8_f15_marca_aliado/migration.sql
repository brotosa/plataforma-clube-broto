-- Onda 8 (F15) — Marca do aliado (RN54): ficha-onda8-marca-listas-erros.md.
--
-- SEGURANÇA SOBRE BASE POVOADA. Esta migration é ESTRITAMENTE ADITIVA:
-- cria uma tabela nova e não toca em nenhuma linha, coluna, tipo ou
-- restrição existente. Roda sobre a produção (aliados e ofertas reais, 46
-- prospects, 2.000 assinantes, 597 eventos de telemetria) sem reescrever
-- nada e sem lock de tabela grande — o CREATE TABLE só bloqueia a tabela
-- que ele mesmo está criando, e as duas FKs travam apenas o catálogo.
--
-- `empresas.logo_url` NÃO É DERRUBADA aqui, de propósito. Ela guarda o
-- endereço S3 do logotipo de um bucket que nunca foi provisionado, e a
-- decisão é deixá-la obsoleta em vez de removê-la: a queda é irreversível
-- e não é exigida pela ficha. A dívida está registrada no README com a
-- condição objetiva de execução — nenhum aliado com valor na coluna — e
-- sairá em migration própria e reversível numa fase futura.
--
-- O binário vive em tabela PRÓPRIA, 1:1 com a empresa, nunca como coluna
-- de `empresas` (ficha §1, nota de modelagem obrigatória): o Prisma
-- seleciona escalares por padrão, e um BYTEA em `empresas` faria toda
-- consulta que lê aliado — a lista, o funil, o mapa, o painel — carregar
-- o arquivo junto.

-- CreateTable
CREATE TABLE "marcas_aliado" (
    "empresa_id" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marcas_aliado_pkey" PRIMARY KEY ("empresa_id")
);

-- AddForeignKey
ALTER TABLE "marcas_aliado" ADD CONSTRAINT "marcas_aliado_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas_aliado" ADD CONSTRAINT "marcas_aliado_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

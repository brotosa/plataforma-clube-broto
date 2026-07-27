-- Onda 10 (F17) — Imagem do card da solução (RN60): ficha-onda10-imagem-solucao.md.
--
-- SEGURANÇA SOBRE BASE POVOADA. Esta migration é ESTRITAMENTE ADITIVA:
-- cria uma tabela nova e não toca em nenhuma linha, coluna, tipo ou
-- restrição existente. Roda sobre a produção sem reescrever nada e sem
-- lock de tabela grande — o CREATE TABLE só bloqueia a tabela que ele
-- mesmo está criando, e as duas FKs travam apenas o catálogo.
--
-- `solucoes.imagem_card_url` NÃO É DERRUBADA aqui, de propósito, e pelo
-- mesmo motivo que a F15 não derrubou `empresas.logo_url`: ela guarda o
-- endereço de um objeto num bucket que nunca foi provisionado, a queda é
-- irreversível e não é exigida pela ficha. A coluna deixa de ser escrita;
-- a leitura prefere a imagem nova e usa a antiga como retaguarda enquanto
-- houver valor. A dívida está no README com a condição objetiva de
-- execução — nenhuma solução com valor na coluna — e sairá em migration
-- própria e reversível numa fase futura.
--
-- O binário vive em tabela PRÓPRIA, 1:1 com a solução, nunca como coluna
-- de `solucoes` (ficha §1 e prompt §2): o Prisma seleciona escalares por
-- padrão, e um BYTEA em `solucoes` faria toda consulta que lê solução — a
-- lista, a vitrine, o painel, o kit — carregar o arquivo junto.

-- CreateTable
CREATE TABLE "imagens_solucao" (
    "solucao_id" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imagens_solucao_pkey" PRIMARY KEY ("solucao_id")
);

-- AddForeignKey
ALTER TABLE "imagens_solucao" ADD CONSTRAINT "imagens_solucao_solucao_id_fkey" FOREIGN KEY ("solucao_id") REFERENCES "solucoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_solucao" ADD CONSTRAINT "imagens_solucao_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

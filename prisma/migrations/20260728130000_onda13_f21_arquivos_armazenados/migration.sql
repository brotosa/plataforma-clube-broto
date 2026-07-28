-- Onda 13 (F21) — Armazenamento persistente de arquivos (RN71):
-- ficha-onda13-armazenamento.md.
--
-- SEGURANÇA SOBRE BASE POVOADA. Esta migration é ESTRITAMENTE ADITIVA:
-- cria UMA tabela nova e não toca em nenhuma linha, coluna, tipo ou
-- restrição existente. Não há FK aqui — nem para `pecas_campanha`, nem
-- para `exportacoes_lista`, nem para `kits_campanha` —, então o único
-- lock é o da própria tabela que está nascendo. Roda sobre a produção sem
-- reescrever nada.
--
-- `pecas_campanha.imagem_chave`, `exportacoes_lista.arquivo_chave` e
-- `kits_campanha.arquivo_chave` NÃO SÃO TOCADAS, de propósito: elas
-- continuam guardando exatamente a mesma chave que guardavam antes. O que
-- esta fase muda é onde o CONTEÚDO daquela chave vive — o disco da
-- máquina, que é efêmero e por instância, passa a ser o banco.
--
-- SEM FK PORQUE A CHAVE É OPACA. A porta `ArmazenadorSnapshots` recebe uma
-- string e não sabe de que entidade ela veio; amarrar a tabela a uma das
-- três exigiria três tabelas ou uma coluna discriminadora, e nenhuma das
-- duas coisas o armazenador consultaria. O preço declarado é que a
-- integridade referencial entre chave e conteúdo não é imposta pelo banco:
-- ela é responsabilidade da ordem de gravação (conteúdo primeiro,
-- referência depois) e a ausência dela é falha nomeada em tempo de
-- leitura, nunca erro genérico.
--
-- ESTA MIGRATION NÃO MIGRA CONTEÚDO ANTIGO, e isso é decisão da ficha §6:
-- o que está no disco da instância em produção já não existe. Os registros
-- que apontam para chaves sem conteúdo — a campanha "Teste" da base de
-- demonstração é um deles — passam a falhar com causa nomeada e o que
-- fazer ("reenviar a peça", "reexportar a lista", "regerar o kit"). O
-- conserto os faz falhar com clareza; não os recupera.

-- CreateTable
CREATE TABLE "arquivos_armazenados" (
    "chave" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arquivos_armazenados_pkey" PRIMARY KEY ("chave")
);

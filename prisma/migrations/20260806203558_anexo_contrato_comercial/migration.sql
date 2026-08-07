-- CreateTable
CREATE TABLE "anexos_contrato" (
    "contrato_id" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anexos_contrato_pkey" PRIMARY KEY ("contrato_id")
);

-- AddForeignKey
ALTER TABLE "anexos_contrato" ADD CONSTRAINT "anexos_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos_comerciais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos_contrato" ADD CONSTRAINT "anexos_contrato_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

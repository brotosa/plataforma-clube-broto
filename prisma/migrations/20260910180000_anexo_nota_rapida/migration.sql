-- CreateTable
CREATE TABLE "nota_rapida_anexos" (
    "nota_rapida_id" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_rapida_anexos_pkey" PRIMARY KEY ("nota_rapida_id")
);

-- AddForeignKey
ALTER TABLE "nota_rapida_anexos" ADD CONSTRAINT "nota_rapida_anexos_nota_rapida_id_fkey" FOREIGN KEY ("nota_rapida_id") REFERENCES "notas_rapidas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_rapida_anexos" ADD CONSTRAINT "nota_rapida_anexos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

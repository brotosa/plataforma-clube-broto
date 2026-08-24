-- Percentual de desconto na oferta (Tipo de benefício = Percentual de desconto).
-- Estritamente ADITIVA: adiciona uma coluna NULLABLE, sem default sobre linha
-- existente. Ofertas Percentual anteriores permanecem com preço de/por e este
-- campo vazio (decisão de 24/08) — nenhuma linha povoada é reescrita.

-- AlterTable
ALTER TABLE "ofertas" ADD COLUMN "percentual_desconto" INTEGER;

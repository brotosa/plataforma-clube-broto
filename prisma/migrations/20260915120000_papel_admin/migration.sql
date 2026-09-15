-- Onda 15 — acrescenta o valor de enum do papel renomeado.
--
-- Primeira de duas migrations. Esta APENAS cria o valor `ADMIN`; quem move as
-- contas existentes para ele é a seguinte (20260915130000). A separação é
-- obrigatória: o PostgreSQL recusa usar um valor de enum na mesma transação em
-- que ele foi criado, e o Prisma roda cada migration em transação.
--
-- Contexto, para quem ler isto isolado: o papel que se chamava "Administrador
-- da Plataforma" passa a se chamar "Administrador" (valor `ADMIN`) e mantém as
-- mesmas atribuições; o nome "Administrador da Plataforma" (valor
-- `ADMINISTRADOR_PLATAFORMA`, que já existia) passa a designar o ACESSO TOTAL.
--
-- Estritamente aditiva: acrescenta um valor ao enum e não toca em linha alguma.
-- Segue o precedente da F10, que acrescentou o próprio ADMINISTRADOR_PLATAFORMA
-- a este mesmo enum.

-- AlterEnum
ALTER TYPE "Papel" ADD VALUE 'ADMIN';

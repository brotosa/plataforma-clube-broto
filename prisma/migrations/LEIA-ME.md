# Migrations — convenção de reversibilidade

Cada pasta de migration contém:

- `migration.sql` — aplicado pelo Prisma (`pnpm db:migrate`).
- `down.sql` — reversão completa da migration, gerada com
  `prisma migrate diff` e verificada contra um banco limpo
  (aplicar `migration.sql` + `down.sql` deve resultar em zero objetos).

O Prisma não executa `down.sql` automaticamente. Para reverter em um
ambiente, aplicar o arquivo manualmente com `psql -f down.sql` e remover o
registro correspondente de `_prisma_migrations`.

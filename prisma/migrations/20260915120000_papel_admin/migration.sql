-- Onda 15 — desdobramento do papel de administração em dois.
--
-- O `ADMINISTRADOR_PLATAFORMA` passa a ser o papel de acesso total, e o novo
-- `ADMIN` recebe exatamente as permissões que aquele tinha até aqui
-- (configuração, metas, usuários, auditoria, dados pessoais e leitura).
--
-- Estritamente aditiva: acrescenta um valor ao enum e não toca em linha
-- alguma. NENHUM usuário existente muda de papel — quem é
-- ADMINISTRADOR_PLATAFORMA hoje continua sendo, e passa a poder tudo. Mover
-- pessoas para o ADMIN é ato humano na T27, auditado, e não trabalho de
-- migration: rebaixar alguém em silêncio no deploy seria mudança de acesso
-- sem autor na trilha.
--
-- Segue o precedente da F10, que acrescentou o próprio
-- ADMINISTRADOR_PLATAFORMA a este mesmo enum.

-- AlterEnum
ALTER TYPE "Papel" ADD VALUE 'ADMIN';

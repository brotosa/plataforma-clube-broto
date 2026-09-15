import type { Papel } from "@prisma/client";

/**
 * Rótulos institucionais dos papéis, conforme as fichas §2 (Ondas 1 a 3) e o
 * desdobramento da Onda 15.
 *
 * **Os dois papéis de administração têm nomes parecidos e poderes bem
 * diferentes**, e o rótulo do mais forte precisa carregar isso: quem lê a
 * lista de papéis tem de conseguir dizer qual é qual sem consultar a ficha.
 * Daí "Administrador da Plataforma (acesso total)" — o nome institucional
 * permanece, e o parêntese é o que a interface acrescenta para desfazer a
 * ambiguidade com o "Admin", que é o papel de administração SEM operação.
 */
export const ROTULOS_PAPEL: Readonly<Record<Papel, string>> = {
  GESTOR: "Gestor do Clube",
  ANALISTA: "Analista de Aliados",
  ANALISTA_SCOUT: "Analista de Scout",
  COMERCIAL: "Comercial",
  APROVADOR: "Aprovador",
  LEITURA: "Leitura",
  ADMINISTRADOR_PLATAFORMA: "Administrador da Plataforma (acesso total)",
  ADMIN: "Admin",
};

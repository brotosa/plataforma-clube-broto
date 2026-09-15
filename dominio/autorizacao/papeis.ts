import type { Papel } from "@prisma/client";

/**
 * Rótulos institucionais dos papéis, conforme as fichas §2 (Ondas 1 a 3) e o
 * desdobramento da Onda 15.
 *
 * **O papel que se chamava "Administrador da Plataforma" passou a se chamar
 * "Administrador", com as MESMAS atribuições** — é uma renomeação, e é por
 * isso que o valor de enum dele (`ADMIN`) não tem paralelo com o rótulo
 * antigo. Quem detinha o papel continua exatamente com o que tinha.
 *
 * O nome "Administrador da Plataforma" passou a designar o **acesso total**,
 * que é papel novo e nasce sem ninguém.
 *
 * **Os dois nomes são parecidos e os poderes não são**, e isso é risco de
 * atribuição: errar o item da lista concede tudo. A tela de Usuários explica
 * a diferença ao lado do seletor — ver `tabela-usuarios.tsx`.
 */
export const ROTULOS_PAPEL: Readonly<Record<Papel, string>> = {
  GESTOR: "Gestor do Clube",
  ANALISTA: "Analista de Aliados",
  ANALISTA_SCOUT: "Analista de Scout",
  COMERCIAL: "Comercial",
  APROVADOR: "Aprovador",
  LEITURA: "Leitura",
  ADMIN: "Administrador",
  ADMINISTRADOR_PLATAFORMA: "Administrador da Plataforma",
};

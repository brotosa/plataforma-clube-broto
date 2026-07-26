import type { Papel } from "@prisma/client";

/** Rótulos institucionais dos papéis, conforme as fichas §2 (Ondas 1 a 3). */
export const ROTULOS_PAPEL: Readonly<Record<Papel, string>> = {
  GESTOR: "Gestor do Clube",
  ANALISTA: "Analista de Aliados",
  ANALISTA_SCOUT: "Analista de Scout",
  COMERCIAL: "Comercial",
  APROVADOR: "Aprovador",
  LEITURA: "Leitura",
  ADMINISTRADOR_PLATAFORMA: "Administrador da Plataforma",
};

import type { Papel } from "@prisma/client";

/** Rótulos institucionais dos papéis, conforme a ficha §2. */
export const ROTULOS_PAPEL: Readonly<Record<Papel, string>> = {
  GESTOR: "Gestor do Clube",
  ANALISTA: "Analista de Aliados",
  APROVADOR: "Aprovador",
  LEITURA: "Leitura",
};

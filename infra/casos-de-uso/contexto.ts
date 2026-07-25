import type { Papel } from "@prisma/client";

/** Quem executa a ação — extraído da sessão pelos server actions. */
export interface Ator {
  id: string;
  papel: Papel;
}

/**
 * Erro de validação de negócio: carrega a lista de mensagens
 * institucionais que a UI exibe ao usuário.
 */
export class ErroDeValidacao extends Error {
  readonly erros: ReadonlyArray<string>;

  constructor(erros: ReadonlyArray<string>) {
    super(erros.join(" "));
    this.name = "ErroDeValidacao";
    this.erros = erros;
  }
}

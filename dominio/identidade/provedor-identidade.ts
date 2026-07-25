import type { Papel } from "@prisma/client";

/** Usuário autenticado, na forma que circula em sessão. */
export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
}

/**
 * Interface de identidade da plataforma.
 *
 * A autenticação própria (credenciais + sessão, Auth.js) fica atrás desta
 * interface para permitir plugar o Microsoft Entra ID sem refação: uma
 * futura implementação OIDC resolve o usuário corporativo para o mesmo
 * `UsuarioAutenticado` sem tocar domínio nem telas.
 */
export interface ProvedorIdentidade {
  /** Resolve credenciais para um usuário ativo, ou null se inválidas. */
  autenticarPorCredenciais(
    email: string,
    senha: string,
  ): Promise<UsuarioAutenticado | null>;
}

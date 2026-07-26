import type { Papel } from "@prisma/client";

/** Usuário autenticado, na forma que circula em sessão. */
export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  /**
   * Onda 6 (RN47) — época vigente no momento do login. Vai para o token e
   * é reconferida a cada leitura de sessão: divergir derruba o acesso.
   * Um provedor OIDC futuro (Entra ID) devolve a época do MESMO registro
   * local, então a revogação continua sendo ato da plataforma.
   */
  sessaoEpoca: number;
  /** Credencial provisória: exige troca no primeiro acesso (ficha §3). */
  trocaSenhaObrigatoria: boolean;
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

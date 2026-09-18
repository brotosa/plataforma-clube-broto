import { prisma } from "@/infra/prisma/cliente";

/**
 * Autores de sistema da trilha de auditoria.
 *
 * `AuditoriaEvento.autorId` é **chave estrangeira obrigatória** para `Usuario`:
 * todo evento tem autor, e não há como gravar "ninguém". Só que existem atos
 * auditáveis sem gente por trás — a rotina diária que expira ofertas, e agora a
 * tentativa de acesso recusada, que por definição não tem autor autenticado.
 *
 * A plataforma já resolvia isso desde a F13, com uma conta inativa criada sob
 * demanda pelo job diário. Esta função **generaliza aquele padrão em vez de
 * duplicá-lo**: a segunda cópia de um upsert de usuário divergiria da primeira
 * na primeira correção — uma ganharia um campo novo do modelo e a outra não, e
 * a diferença só apareceria como erro de escrita muito depois.
 *
 * **Nenhuma migration.** A linha nasce na primeira gravação que precisar dela.
 *
 * ## Por que contas separadas, e não uma só
 *
 * A trilha é filtrável por autor (índice `[autorId, criadoEm]`, usado pela T27
 * e pela T28). Uma conta de sistema única misturaria a expiração de oferta com
 * a tentativa de acesso, e quem filtrasse por uma veria a outra. São assuntos
 * diferentes, e separá-los custa uma linha de tabela.
 */

/** Um autor de sistema: o e-mail é a identidade, o nome é o que aparece. */
interface PerfilDeSistema {
  email: string;
  nome: string;
}

/**
 * A rotina diária (F13). **O e-mail é o mesmo de antes desta generalização** —
 * trocá-lo criaria uma segunda conta e partiria a trilha já gravada em duas.
 */
export const SISTEMA_ROTINA: PerfilDeSistema = {
  email: "rotina@sistema.clubebroto.local",
  nome: "Rotina da plataforma (job diário)",
};

/** As tentativas de acesso recusadas (RN74). */
export const SISTEMA_AUTENTICACAO: PerfilDeSistema = {
  email: "autenticacao@sistema.clubebroto.local",
  nome: "Tentativas de acesso (sistema)",
};

/**
 * Devolve (criando se preciso) a conta de sistema do perfil pedido.
 *
 * `ativo: false` é o que garante que ela **nunca autentica** — o provedor de
 * identidade recusa conta inativa antes de qualquer outra coisa. O papel é
 * irrelevante para quem não entra; fica `GESTOR` porque era o valor já gravado
 * na base pela conta da rotina, e mudá-lo agora seria alterar linha existente
 * sem motivo.
 */
export async function usuarioDeSistema(perfil: PerfilDeSistema) {
  return prisma.usuario.upsert({
    where: { email: perfil.email },
    update: {},
    create: {
      nome: perfil.nome,
      email: perfil.email,
      senhaHash: "sem-login",
      papel: "GESTOR",
      ativo: false,
      // F13: a marca de credencial provisória não faz sentido em quem não tem
      // login — sem isto a conta apareceria na T27 como "credencial
      // provisória", sugerindo uma senha a trocar que não existe.
      trocaSenhaObrigatoria: false,
    },
  });
}

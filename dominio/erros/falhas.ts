/**
 * RN55 — as classes de falha que faltavam ao vocabulário do domínio.
 *
 * A regra é distinguir por CLASSE, nunca por texto solto: só o que é
 * instância de uma classe conhecida propaga a própria mensagem até a
 * interface. Duas categorias que a ficha nomeia — configuração ausente e
 * layout/limite de arquivo — vinham sendo lançadas como `Error` cru, e
 * `Error` cru precisa continuar caindo no genérico (senão a mensagem de
 * qualquer exceção inesperada vaza). Daí estas duas classes.
 */

/**
 * Configuração ausente no ambiente. Foi o caso que originou a regra: o
 * serviço já falhava com o texto certo ("CPF_HASH_KEY ausente no
 * ambiente…"), e a mensagem se perdia no caminho até a tela, virando
 * "Tente novamente" — conselho errado, porque tentar de novo nunca
 * resolveria. Custou meia hora de homologação.
 *
 * O construtor recebe o NOME da variável e nunca o valor: nomear a
 * variável ausente é desejável, imprimir o conteúdo dela é proibido, e
 * aqui isso é garantido pela forma — não há por onde o valor entrar.
 */
export class ErroDeConfiguracao extends Error {
  readonly variavel: string;

  constructor(variavel: string, oQueDependeDela: string) {
    super(`${variavel} ausente no ambiente: ${oQueDependeDela}`);
    this.name = "ErroDeConfiguracao";
    this.variavel = variavel;
  }
}

/**
 * Arquivo recusado por formato, layout ou limite — o que o usuário pode
 * corrigir sozinho reexportando ou dividindo o arquivo. Mensagem sempre
 * diz o que está errado E o que fazer.
 */
export class ErroDeArquivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeArquivo";
  }
}

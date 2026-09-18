import { headers } from "next/headers";

import { logger } from "@/infra/log/logger";

/**
 * Endereço de origem da requisição, para o bloqueio por origem (RN74).
 *
 * ## O problema que este módulo resolve (Onda 21, F32)
 *
 * `x-forwarded-for` é uma LISTA que cresce da esquerda para a direita: cada
 * salto **acrescenta ao fim** o endereço de quem falou com ele. Logo, o
 * primeiro elemento é o que o cliente mandou — e cliente manda o que quiser.
 *
 * Ler o primeiro elemento é ler exatamente o que o atacante escreveu. Sem
 * borda nenhuma isso era degradação declarada (quem forja só evade o próprio
 * bloqueio). **Com balanceador na frente vira defeito**, porque a informação
 * correta passa a existir no fim da lista e a aplicação continuaria ignorando:
 * uma linha de `curl` com `x-forwarded-for: 1.2.3.4` bastaria para escapar do
 * bloqueio por origem, e para trocar de "origem" a cada tentativa.
 *
 * ## A leitura correta é DA DIREITA PARA A ESQUERDA
 *
 * Com `saltos` bordas confiáveis à frente, o endereço do cliente real está na
 * posição `tamanho - saltos`: a última borda acrescentou o endereço de quem
 * falou com ela, a anterior o de quem falou com a anterior, e assim por
 * diante. Tudo à esquerda disso é texto do cliente e **não se lê**.
 *
 * Topologia confirmada em 18/09/2026 — `admclube.broto.com.br` resolve para os
 * mesmos dois endereços do balanceador `broto-clube-alb`, que responde
 * `server: awselb/2.0` sem nenhum cabeçalho de CDN: **um salto**. Ainda assim o
 * número é parâmetro, não constante: pôr uma CDN na frente é mudança de
 * configuração, e não pode exigir deploy de código novo.
 *
 * ## Lista mais curta que a topologia é ausência, nunca queda para o primeiro
 *
 * Se a lista tem menos elementos do que os saltos declarados, alguém está
 * falando com a aplicação por fora da borda — ou a borda não acrescentou.
 * Cair para o primeiro elemento aí seria voltar a ler o valor forjado
 * justamente no caso suspeito. Devolvemos `null`, e sem origem conhecida a
 * regra não se aplica (RN74: origem irreconhecível **nunca** significa
 * "bloqueia todos").
 *
 * ## E com borda declarada o `x-real-ip` deixa de valer
 *
 * O balanceador da aplicação não escreve `x-real-ip`; qualquer cliente
 * escreve. Aceitá-lo como queda reabriria o buraco que este módulo fecha. Ele
 * só continua valendo no modo sem borda, que é o comportamento de hoje.
 */

/** Nome da variável de ambiente que declara a topologia da borda. */
export const VARIAVEL_DE_SALTOS = "SALTOS_CONFIAVEIS_NA_BORDA";

/**
 * Teto de sanidade para o número de saltos.
 *
 * Não existe topologia legítima desta plataforma com oito bordas encadeadas.
 * Um valor absurdo só poderia vir de erro de digitação — e um número grande
 * demais faria toda lista parecer "mais curta que a topologia", desligando o
 * bloqueio por origem em silêncio.
 */
export const SALTOS_MAXIMO = 8;

/** Endereço IPv4/IPv6 cabe folgado em 45 caracteres; mais que isso é lixo. */
const TAMANHO_MAXIMO_DE_ENDERECO = 45;

/**
 * Alfabeto de endereço: dígitos, letras de IPv6, ponto, dois-pontos e o
 * separador de zona. Recusa qualquer outra coisa em vez de gravar.
 *
 * Estreito de propósito, e **anterior a esta fase**: uma zona NOMEADA
 * (`%eth0`) não passa, porque `t` e `h` estão fora de `a–f`. Endereço de
 * enlace local não chega por balanceador, então a estreiteza não custa nada
 * em uso — e alargá-la seria decisão de outra fase.
 */
const ALFABETO_DE_ENDERECO = /^[0-9a-fA-F.:%]+$/;

/*
 * Os avisos abaixo são de CONFIGURAÇÃO, não de requisição: repeti-los a cada
 * login encheria o log sem acrescentar nada. Uma vez por processo basta — e
 * um processo novo (deploy, reinício) avisa de novo.
 */
let avisouSemBordaDeclarada = false;
let avisouListaCurta = false;

/**
 * Quantos saltos confiáveis há à frente da aplicação.
 *
 * Ausente, vazio ou ilegível ⇒ `0`, que é o comportamento anterior a esta
 * fase. A queda é deliberada: um valor ilegível não pode derrubar o login.
 * Mas ela **nomeia a variável** no log (RN55 — nomear é desejável, imprimir o
 * valor jamais).
 */
export function lerSaltosConfiaveis(
  bruto: string | undefined = process.env[VARIAVEL_DE_SALTOS],
): number {
  const texto = (bruto ?? "").trim();
  if (!texto) return 0;

  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 0 || numero > SALTOS_MAXIMO) {
    logger.warn(
      { variavel: VARIAVEL_DE_SALTOS, maximo: SALTOS_MAXIMO },
      "valor ilegível de saltos confiáveis; lendo origem sem borda declarada",
    );
    return 0;
  }
  return numero;
}

/**
 * Extrai a origem dos cabeçalhos já lidos. **Função pura** — é ela que os
 * testes exercitam, com 0, 1 e 2 saltos, sem precisar de requisição.
 */
export function extrairOrigem(
  encaminhado: string | null,
  realIp: string | null,
  saltos: number,
): string | null {
  if (saltos <= 0) {
    // Modo sem borda declarada: comportamento de antes da F32, com a
    // limitação que ele sempre teve.
    const lista = separar(encaminhado);
    if (lista.length > 0 && !avisouSemBordaDeclarada) {
      avisouSemBordaDeclarada = true;
      logger.warn(
        { variavel: VARIAVEL_DE_SALTOS },
        "há cadeia de encaminhamento e nenhuma borda declarada: a origem está sendo lida do valor enviado pelo cliente",
      );
    }
    return normalizar(lista[0] ?? realIp);
  }

  const lista = separar(encaminhado);
  // Sem cabeçalho de encaminhamento atrás de uma borda que sempre o escreve,
  // não há origem confiável — e `x-real-ip` não serve de queda aqui.
  if (lista.length === 0) return null;

  const indice = lista.length - saltos;
  if (indice < 0) {
    if (!avisouListaCurta) {
      avisouListaCurta = true;
      // Só as CONTAGENS: o conteúdo do cabeçalho vem do cliente, e texto de
      // cliente não entra em linha de log.
      logger.warn(
        { recebidos: lista.length, esperados: saltos },
        "cadeia de encaminhamento menor que a topologia declarada: origem desconsiderada",
      );
    }
    return null;
  }

  return normalizar(lista[indice] ?? null);
}

/** Quebra a lista, apara e descarta elementos vazios. */
function separar(cabecalho: string | null): string[] {
  if (!cabecalho) return [];
  return cabecalho
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);
}

/** Apara, confere tamanho e alfabeto. Qualquer desvio devolve `null`. */
function normalizar(bruto: string | null | undefined): string | null {
  const limpo = (bruto ?? "").trim();
  if (!limpo) return null;
  if (limpo.length > TAMANHO_MAXIMO_DE_ENDERECO) return null;
  if (!ALFABETO_DE_ENDERECO.test(limpo)) return null;
  return limpo;
}

/**
 * Origem da requisição em curso.
 *
 * Devolve `null` quando não há como saber — e sem origem conhecida a regra
 * simplesmente não se aplica, em vez de bloquear no escuro.
 */
export async function obterOrigemDaRequisicao(): Promise<string | null> {
  try {
    const cabecalhos = await headers();
    return extrairOrigem(
      cabecalhos.get("x-forwarded-for"),
      cabecalhos.get("x-real-ip"),
      lerSaltosConfiaveis(),
    );
  } catch {
    // Fora de escopo de requisição (não deveria acontecer no caminho de
    // login). Sem origem, a regra não se aplica.
    return null;
  }
}

/** Só para teste: zera os avisos de uma vez por processo. */
export function reiniciarAvisosDeOrigem(): void {
  avisouSemBordaDeclarada = false;
  avisouListaCurta = false;
}

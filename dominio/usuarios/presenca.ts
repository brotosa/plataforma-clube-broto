/**
 * Presença — o indicador On-line/Offline da T27.
 *
 * Domínio puro: nada aqui sabe de banco nem de sessão. A consulta lê a marca
 * `ultimoAcessoEm` e estas funções a traduzem; a tela só escolhe a cor.
 *
 * **O que "on-line" significa aqui, e o que NÃO significa.** Não existe
 * conexão aberta para observar: a plataforma é HTTP, e cada requisição é um
 * instante isolado. O que se sabe é quando a conta foi vista pela última vez
 * — então "on-line" é uma **inferência declarada**: atividade dentro de uma
 * janela curta. Chamar isso de "conectado agora" seria prometer o que não se
 * mede, e por isso a pílula carrega sempre o tempo decorrido ao lado do
 * rótulo — "Offline · há 3 dias": o dado observado fica visível junto com a
 * conclusão tirada dele.
 *
 * **Por que a janela é de 5 minutos.** O cliente avisa o servidor a cada 60 s
 * enquanto houver atividade real. Uma janela de 5 min dá folga para três
 * pulsos perdidos — aba trocada, rede instável, requisição lenta — sem
 * declarar ausente quem está trabalhando. Menor que isso pisca; muito maior
 * chamaria de on-line quem saiu para almoçar.
 */

/** Janela de tolerância, em minutos, para considerar a conta on-line. */
export const JANELA_ONLINE_MIN = 5;

export type Presenca = "ONLINE" | "OFFLINE" | "NUNCA";

/**
 * Classifica a presença a partir da última atividade registrada.
 *
 * `NUNCA` é estado de primeira classe, e não um "offline muito antigo": para
 * quem administra, a conta criada e jamais usada é uma pergunta em aberto —
 * a pessoa recebeu a credencial? ela chegou? —, e apagá-la dentro de
 * "offline" esconderia justamente o caso que pede ação.
 */
export function classificarPresenca(
  ultimoAcessoEm: Date | null | undefined,
  agora: Date,
): Presenca {
  if (!(ultimoAcessoEm instanceof Date) || Number.isNaN(ultimoAcessoEm.getTime())) {
    return "NUNCA";
  }
  const decorridoMs = agora.getTime() - ultimoAcessoEm.getTime();
  // Marca no futuro (relógio do banco adiantado, ou registro recém-gravado
  // na mesma requisição) conta como agora — nunca como ausência.
  if (decorridoMs <= JANELA_ONLINE_MIN * 60_000) {
    return "ONLINE";
  }
  return "OFFLINE";
}

/**
 * Há quanto tempo, em unidade legível — "agora", "há 12 min", "ontem".
 *
 * Sem o prefixo "visto", de propósito: o trecho entra **dentro da pílula**,
 * ao lado do rótulo ("Offline · há 3 dias"), e ali a palavra sobraria. A
 * pílula é o lugar porque uma legenda em linha própria custava 24px de altura
 * em TODAS as linhas da tabela — informação nova não pode desfazer, numa
 * tela, o aperto que a faixa única de ações acabou de conquistar.
 *
 * Arredonda para baixo e nunca inventa precisão: 90 minutos vira "1 h", não
 * "1,5 h". Quem precisa do instante exato tem a trilha de auditoria.
 */
export function descreverUltimoAcesso(
  ultimoAcessoEm: Date | null | undefined,
  agora: Date,
): string {
  if (!(ultimoAcessoEm instanceof Date) || Number.isNaN(ultimoAcessoEm.getTime())) {
    return "nunca acessou";
  }
  const minutos = Math.floor((agora.getTime() - ultimoAcessoEm.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return horas === 1 ? "há 1 h" : `há ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias < 30) return dias === 1 ? "ontem" : `há ${dias} dias`;

  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

/** Rótulo curto da pílula. */
export function rotuloDePresenca(presenca: Presenca): string {
  if (presenca === "ONLINE") return "On-line";
  if (presenca === "OFFLINE") return "Offline";
  return "Nunca acessou";
}

/**
 * Folga entre gravações da marca, em milissegundos.
 *
 * A marca é escrita no caminho de autenticação, que roda a **cada requisição
 * autenticada** — sem folga, cada clique viraria uma escrita no banco, e o
 * indicador custaria mais que tudo o que ele mostra. Um minuto é a mesma
 * cadência do pulso do cliente: mais fino que isso não muda nada na tela,
 * porque a janela de on-line é de cinco minutos.
 */
export const FOLGA_ENTRE_MARCAS_MS = 60_000;

/** Vale a pena regravar a marca agora? */
export function deveRegistrarAcesso(
  ultimoAcessoEm: Date | null | undefined,
  agora: Date,
): boolean {
  if (!(ultimoAcessoEm instanceof Date) || Number.isNaN(ultimoAcessoEm.getTime())) {
    return true;
  }
  return agora.getTime() - ultimoAcessoEm.getTime() >= FOLGA_ENTRE_MARCAS_MS;
}

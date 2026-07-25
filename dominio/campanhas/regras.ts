import type { DestinacaoOferta, EstadoCampanha, StatusOferta } from "@prisma/client";

/**
 * Regras da Onda 4 (ficha §4) como serviços puros: RN38 (portas da
 * ativação), RN40 (encerramento e ofertas exclusivas), RN41 (cesta só
 * entra com tudo publicado) e RN45 (kit imutável e versionado).
 *
 * RN42 (matching assistivo) e RN43/RN44 (atribuição da medição) têm
 * módulos próprios — `matching.ts` e `atribuicao.ts`. O que depende do
 * ator (RBAC, auditoria, transação) vive nos casos de uso e se apoia
 * nestas funções.
 */

/** Estados da campanha na ordem do ciclo de vida (ficha §3). */
export const ESTADOS_CAMPANHA: ReadonlyArray<EstadoCampanha> = [
  "RASCUNHO",
  "ATIVA",
  "ENCERRADA",
];

/** Rótulos institucionais dos estados (protótipo v7.1, T22/T25). */
export const ROTULOS_ESTADO_CAMPANHA: Readonly<Record<EstadoCampanha, string>> = {
  RASCUNHO: "Rascunho",
  ATIVA: "Ativa",
  ENCERRADA: "Encerrada",
};

/** Rótulos da destinação da oferta (ficha §3, T5). */
export const ROTULOS_DESTINACAO: Readonly<Record<DestinacaoOferta, string>> = {
  VITRINE: "Vitrine — permanente",
  CAMPANHA: "Criada para uma campanha",
  CESTA: "Criada para uma cesta",
};

/**
 * Transições válidas do estado da campanha. Rascunho → Ativa passa pela
 * porta de aprovação quando ela estiver ligada na T7 (ATIVACAO_CAMPANHA);
 * a porta é verificada no caso de uso, não aqui.
 */
export function transicoesValidasDe(estado: EstadoCampanha): EstadoCampanha[] {
  switch (estado) {
    case "RASCUNHO":
      return ["ATIVA"];
    case "ATIVA":
      return ["ENCERRADA"];
    case "ENCERRADA":
      return [];
  }
}

/** Uma oferta candidata ao conteúdo da campanha, do ponto de vista da regra. */
export interface OfertaDoConteudo {
  id: string;
  titulo: string;
  status: StatusOferta;
}

/** Cesta vinculada à campanha, com as ofertas que a compõem. */
export interface CestaDoConteudo {
  id: string;
  nome: string;
  ofertas: ReadonlyArray<OfertaDoConteudo>;
}

/** Retrato do que a campanha tem quando a ativação é pedida (RN38). */
export interface DadosAtivacao {
  contagemPublico: number;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  ofertasAvulsas: ReadonlyArray<OfertaDoConteudo>;
  cestas: ReadonlyArray<CestaDoConteudo>;
}

/** Uma porta da ativação, do jeito que a T23 explica ao usuário. */
export interface PortaAtivacao {
  chave: "publico" | "conteudo" | "vigencia";
  atendida: boolean;
  texto: string;
}

/**
 * RN41 — Uma cesta só entra em campanha com TODAS as suas ofertas ativas
 * publicadas. Retorna as ofertas que impedem a entrada (vazio = liberada).
 * Cesta sem oferta nenhuma também não entra: não há o que executar.
 */
export function ofertasQueBloqueiamCesta(
  cesta: CestaDoConteudo,
): OfertaDoConteudo[] {
  return cesta.ofertas.filter((oferta) => oferta.status !== "PUBLICADA");
}

/** RN41 — a cesta está liberada para entrar em campanha? */
export function cestaPodeEntrarEmCampanha(cesta: CestaDoConteudo): boolean {
  return cesta.ofertas.length > 0 && ofertasQueBloqueiamCesta(cesta).length === 0;
}

/**
 * Ofertas publicadas que a campanha efetivamente leva: as avulsas
 * publicadas mais as das cestas liberadas pela RN41. Sem repetição — a
 * mesma oferta pode estar avulsa e dentro de uma cesta.
 */
export function ofertasPublicadasDaCampanha(
  dados: Pick<DadosAtivacao, "ofertasAvulsas" | "cestas">,
): OfertaDoConteudo[] {
  const porId = new Map<string, OfertaDoConteudo>();
  for (const oferta of dados.ofertasAvulsas) {
    if (oferta.status === "PUBLICADA") {
      porId.set(oferta.id, oferta);
    }
  }
  for (const cesta of dados.cestas) {
    if (!cestaPodeEntrarEmCampanha(cesta)) {
      continue;
    }
    for (const oferta of cesta.ofertas) {
      porId.set(oferta.id, oferta);
    }
  }
  return [...porId.values()];
}

/**
 * RN38 — as três portas da ativação, cada uma com o texto que a T23
 * mostra ao lado do seu marcador. A ordem é a da tela.
 */
export function portasDaAtivacao(dados: DadosAtivacao): PortaAtivacao[] {
  const publicadas = ofertasPublicadasDaCampanha(dados);
  const vigenciaOk =
    dados.vigenciaInicio !== null &&
    (dados.vigenciaFim === null || dados.vigenciaFim >= dados.vigenciaInicio);

  return [
    {
      chave: "publico",
      atendida: dados.contagemPublico > 0,
      texto:
        dados.contagemPublico > 0
          ? `Público com ${dados.contagemPublico} assinantes — será congelado na ativação.`
          : "O público precisa alcançar ao menos um assinante (RN38).",
    },
    {
      chave: "conteudo",
      atendida: publicadas.length > 0,
      texto:
        publicadas.length > 0
          ? `${publicadas.length} oferta(s) publicada(s) vinculada(s), direta ou por cesta.`
          : "A campanha precisa de ao menos uma oferta publicada, direta ou por cesta (RN38).",
    },
    {
      chave: "vigencia",
      atendida: vigenciaOk,
      texto: vigenciaOk
        ? "Vigência definida."
        : "A campanha precisa de vigência definida, com fim não anterior ao início (RN38).",
    },
  ];
}

/** RN38 — a campanha pode ser ativada? */
export function podeAtivar(dados: DadosAtivacao): boolean {
  return portasDaAtivacao(dados).every((porta) => porta.atendida);
}

/** RN38 — erros da ativação, no vocabulário das mensagens de serviço. */
export function validarAtivacao(dados: DadosAtivacao): string[] {
  return portasDaAtivacao(dados)
    .filter((porta) => !porta.atendida)
    .map((porta) => porta.texto);
}

/** Oferta vinculada à campanha que está sendo encerrada (RN40). */
export interface OfertaVinculadaAoEncerramento {
  id: string;
  titulo: string;
  status: StatusOferta;
  destinacao: DestinacaoOferta;
  destinacaoCampanhaId: string | null;
}

/** O que o encerramento propõe fazer com cada oferta vinculada (RN40). */
export interface EfeitoEncerramento {
  pausar: OfertaVinculadaAoEncerramento[];
  desvincular: OfertaVinculadaAoEncerramento[];
}

/**
 * RN40 — Ao encerrar a campanha, as ofertas com destinação EXCLUSIVA a
 * ela são pausadas por padrão (aviso prévio lista quais; a reversão é
 * manual); as ofertas de vitrine apenas se desvinculam.
 *
 * Só entra em "pausar" a oferta que ainda está publicada: pausar o que já
 * está encerrado, expirado ou em rascunho não descreve efeito nenhum.
 */
export function efeitoDoEncerramento(
  campanhaId: string,
  ofertas: ReadonlyArray<OfertaVinculadaAoEncerramento>,
): EfeitoEncerramento {
  const pausar: OfertaVinculadaAoEncerramento[] = [];
  const desvincular: OfertaVinculadaAoEncerramento[] = [];

  for (const oferta of ofertas) {
    const exclusivaDestaCampanha =
      oferta.destinacao === "CAMPANHA" && oferta.destinacaoCampanhaId === campanhaId;
    if (exclusivaDestaCampanha) {
      if (oferta.status === "PUBLICADA") {
        pausar.push(oferta);
      }
      continue;
    }
    desvincular.push(oferta);
  }

  return { pausar, desvincular };
}

/**
 * Aviso prévio do encerramento (T25/T22): frase única listando as ofertas
 * que serão pausadas. Sem exclusivas, o encerramento não pausa nada.
 */
export function avisoDoEncerramento(efeito: EfeitoEncerramento): string {
  if (efeito.pausar.length === 0) {
    return "Nenhuma oferta será pausada — as vinculadas são de vitrine e apenas se desvinculam (RN40).";
  }
  const titulos = efeito.pausar.map((oferta) => oferta.titulo).join(", ");
  return `Serão pausadas por padrão, com reversão manual: ${titulos} (RN40).`;
}

/** Conteúdo do manifesto que identifica uma versão do kit (RN45). */
export interface ConteudoKit {
  publicoContagem: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  instrucoes: string | null;
  ofertas: ReadonlyArray<{ id: string; titulo: string; idExternoMinutrade: string | null }>;
  cestas: ReadonlyArray<{ id: string; nome: string }>;
  pecas: ReadonlyArray<{ formato: string; titulo: string; temImagem: boolean }>;
}

/**
 * RN45 — o kit é imutável: nada é editado depois de gravado. A versão
 * seguinte é sempre a anterior + 1, contada a partir das que existem.
 */
export function proximaVersaoDoKit(versoesExistentes: ReadonlyArray<number>): number {
  return versoesExistentes.reduce((maior, versao) => Math.max(maior, versao), 0) + 1;
}

/** Linhas legíveis do manifesto, na ordem em que o diff as compara. */
function linhasDoConteudo(conteudo: ConteudoKit): string[] {
  return [
    `público: ${conteudo.publicoContagem} assinantes`,
    `vigência: ${conteudo.vigenciaInicio ?? "—"} a ${conteudo.vigenciaFim ?? "—"}`,
    `instruções: ${conteudo.instrucoes?.trim() || "—"}`,
    ...conteudo.cestas.map((cesta) => `cesta: ${cesta.nome}`),
    ...conteudo.ofertas.map(
      (oferta) =>
        `oferta: ${oferta.titulo} (id externo: ${oferta.idExternoMinutrade ?? "pendente"})`,
    ),
    ...conteudo.pecas.map(
      (peca) =>
        `peça: ${peca.formato} · ${peca.titulo}${peca.temImagem ? " · com imagem" : " · sem imagem"}`,
    ),
  ];
}

/**
 * RN45 — diff textual entre duas versões do kit, linha a linha do
 * manifesto: o que saiu ("−") e o que entrou ("+"). A v1 não tem anterior
 * e nasce sem diff.
 */
export function diffDoKit(
  anterior: ConteudoKit | null,
  novo: ConteudoKit,
): string | null {
  if (!anterior) {
    return null;
  }
  const antes = linhasDoConteudo(anterior);
  const depois = linhasDoConteudo(novo);
  const conjuntoAntes = new Set(antes);
  const conjuntoDepois = new Set(depois);

  const removidas = antes.filter((linha) => !conjuntoDepois.has(linha)).map((l) => `− ${l}`);
  const incluidas = depois.filter((linha) => !conjuntoAntes.has(linha)).map((l) => `+ ${l}`);

  const linhas = [...removidas, ...incluidas];
  return linhas.length > 0 ? linhas.join("\n") : "Sem mudanças no manifesto.";
}

/**
 * Importador self-service de SOLUÇÕES — domínio puro (sem Prisma).
 *
 * A planilha tem uma aba só: cada linha é uma solução, identificada pelo
 * **CNPJ do aliado** (chave de verdade — RN08) + nome da solução. Este
 * módulo mapeia e valida a linha crua; quem lê o banco (aliados ativos,
 * soluções já existentes, listas do Parametrizador) é a camada de infra,
 * que injeta tudo aqui como contexto. Assim a regra fica testável sem I/O.
 *
 * O que NÃO se decide aqui: criar/enriquecer de fato (isso é `criarSolucao`/
 * `atualizarSolucao`, que já aplicam RN01 e auditoria). Aqui só se resolve
 * o que a linha PRETENDE fazer e se ela pode — nomeando cada pendência.
 */

import { normalizarCnpj, validarCnpj } from "@/dominio/empresas/cnpj";

/** Cabeçalhos canônicos da aba "Soluções" (o gerador do modelo os imprime). */
export const COLUNAS_SOLUCAO = {
  cnpj: "CNPJ do Aliado",
  nome: "Nome da Solução",
  descricaoCurta: "Descrição Curta",
  descricaoCompleta: "Descrição Completa",
  categoria: "Categoria",
  linkExterno: "Link Externo",
  culturas: "Culturas Atendidas",
  cobertura: "Cobertura",
} as const;

/** Palavra reservada da coluna Cobertura para "todo o país". */
export const COBERTURA_NACIONAL = "Nacional";

/** Linha crua: valores de texto por cabeçalho (já lidos do arquivo). */
export interface LinhaSolucaoCrua {
  linha: number;
  valores: Record<string, string>;
}

/** Item de lista de domínio (categoria/cultura), casado por nome. */
export interface ItemDominio {
  id: string;
  nome: string;
}
/** UF é casada por sigla (SP) ou nome (São Paulo). */
export interface ItemUf {
  id: string;
  sigla: string;
  nome: string;
}

/** Aliado encontrado por CNPJ, com o estágio que a RN01 consulta. */
export interface AliadoDoContexto {
  id: string;
  ativo: boolean;
}

export interface ContextoValidacaoSolucao {
  categorias: ItemDominio[];
  culturas: ItemDominio[];
  ufs: ItemUf[];
  /** CNPJ normalizado (só dígitos) → aliado. Ausente = não cadastrado. */
  aliadoPorCnpj: Map<string, AliadoDoContexto>;
  /** `${cnpj}::${nomeNormalizado}` → id da solução já existente. */
  solucaoPorChave: Map<string, string>;
}

/** Causa de pendência bloqueante, sempre atrelada a uma coluna. */
export interface PendenciaSolucao {
  coluna: string;
  motivo: string;
}

/** Campos prontos para `criarSolucao`/`atualizarSolucao` (DadosSolucao). */
export interface CamposSolucaoMapeados {
  nome: string;
  descricaoCurta: string | null;
  descricaoCompleta: string | null;
  categoriaId: string | null;
  linkExterno: string | null;
  coberturaNacional: boolean;
  culturaIds: string[];
  ufIds: string[];
}

export interface ResultadoLinhaSolucao {
  linha: number;
  campos: CamposSolucaoMapeados;
  cnpjNormalizado: string | null;
  empresaId: string | null;
  solucaoId: string | null;
  acao: "CRIAR" | "ENRIQUECER" | null;
  pendencias: PendenciaSolucao[];
}

/** Normaliza para casamento: minúsculas, sem acento, sem espaço nas bordas. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function limpar(valor: string | undefined): string {
  return (valor ?? "").trim();
}

function vazioParaNulo(valor: string): string | null {
  return valor === "" ? null : valor;
}

/** Quebra "Soja; Milho, Café" em ["Soja","Milho","Café"] sem vazios. */
export function separarLista(valor: string): string[] {
  return valor
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Chave estável de uma solução: CNPJ (dígitos) + nome normalizado. */
export function chaveSolucao(cnpjNormalizado: string, nome: string): string {
  return `${cnpjNormalizado}::${normalizarTexto(nome)}`;
}

/**
 * Mapeia e valida uma linha da aba "Soluções".
 *
 * Regras de pendência (bloqueiam a efetivação, nomeando coluna e causa):
 * CNPJ ausente/ inválido; aliado não cadastrado; aliado não ativo (RN01);
 * nome ausente; categoria/cultura/UF fora das listas do Parametrizador.
 * Descrição e cobertura vazias NÃO bloqueiam — apenas deixam a régua de
 * completude (RN09) incompleta, exatamente como no cadastro manual.
 */
export function validarLinhaSolucao(
  crua: LinhaSolucaoCrua,
  ctx: ContextoValidacaoSolucao,
): ResultadoLinhaSolucao {
  const pendencias: PendenciaSolucao[] = [];
  const v = crua.valores;

  const categoriaPorNome = new Map(ctx.categorias.map((c) => [normalizarTexto(c.nome), c]));
  const culturaPorNome = new Map(ctx.culturas.map((c) => [normalizarTexto(c.nome), c]));
  const ufPorChave = new Map<string, ItemUf>();
  for (const uf of ctx.ufs) {
    ufPorChave.set(normalizarTexto(uf.sigla), uf);
    ufPorChave.set(normalizarTexto(uf.nome), uf);
  }

  // --- Aliado por CNPJ ---
  const cnpjBruto = limpar(v[COLUNAS_SOLUCAO.cnpj]);
  let cnpjNormalizado: string | null = null;
  let empresaId: string | null = null;
  if (cnpjBruto === "") {
    pendencias.push({ coluna: COLUNAS_SOLUCAO.cnpj, motivo: "CNPJ do aliado é obrigatório." });
  } else if (!validarCnpj(cnpjBruto)) {
    pendencias.push({ coluna: COLUNAS_SOLUCAO.cnpj, motivo: `CNPJ inválido: "${cnpjBruto}".` });
  } else {
    cnpjNormalizado = normalizarCnpj(cnpjBruto);
    const aliado = ctx.aliadoPorCnpj.get(cnpjNormalizado);
    if (!aliado) {
      pendencias.push({ coluna: COLUNAS_SOLUCAO.cnpj, motivo: "Aliado não cadastrado para este CNPJ." });
    } else if (!aliado.ativo) {
      pendencias.push({
        coluna: COLUNAS_SOLUCAO.cnpj,
        motivo: "Aliado não está ativo — RN01 não permite criar/editar solução.",
      });
    } else {
      empresaId = aliado.id;
    }
  }

  // --- Nome (obrigatório, como em criarSolucao) ---
  const nome = limpar(v[COLUNAS_SOLUCAO.nome]);
  if (nome === "") {
    pendencias.push({ coluna: COLUNAS_SOLUCAO.nome, motivo: "Nome da solução é obrigatório." });
  }

  // --- Categoria (lista fechada; vazia é permitida) ---
  let categoriaId: string | null = null;
  const categoriaTexto = limpar(v[COLUNAS_SOLUCAO.categoria]);
  if (categoriaTexto !== "") {
    const achada = categoriaPorNome.get(normalizarTexto(categoriaTexto));
    if (!achada) {
      pendencias.push({
        coluna: COLUNAS_SOLUCAO.categoria,
        motivo: `Categoria "${categoriaTexto}" não existe no Parametrizador.`,
      });
    } else {
      categoriaId = achada.id;
    }
  }

  // --- Culturas (lista fechada, multivalor) ---
  const culturaIds: string[] = [];
  for (const nomeCultura of separarLista(limpar(v[COLUNAS_SOLUCAO.culturas]))) {
    const achada = culturaPorNome.get(normalizarTexto(nomeCultura));
    if (!achada) {
      pendencias.push({
        coluna: COLUNAS_SOLUCAO.culturas,
        motivo: `Cultura "${nomeCultura}" não existe no Parametrizador.`,
      });
    } else if (!culturaIds.includes(achada.id)) {
      culturaIds.push(achada.id);
    }
  }

  // --- Cobertura ("Nacional" ou lista de UFs; vazia é permitida) ---
  let coberturaNacional = false;
  const ufIds: string[] = [];
  const coberturaTexto = limpar(v[COLUNAS_SOLUCAO.cobertura]);
  if (coberturaTexto !== "") {
    if (normalizarTexto(coberturaTexto) === normalizarTexto(COBERTURA_NACIONAL)) {
      coberturaNacional = true;
    } else {
      for (const sigla of separarLista(coberturaTexto)) {
        const achada = ufPorChave.get(normalizarTexto(sigla));
        if (!achada) {
          pendencias.push({
            coluna: COLUNAS_SOLUCAO.cobertura,
            motivo: `UF "${sigla}" não reconhecida (use a sigla, o nome, ou "${COBERTURA_NACIONAL}").`,
          });
        } else if (!ufIds.includes(achada.id)) {
          ufIds.push(achada.id);
        }
      }
    }
  }

  // --- Ação: enriquecer se já existe (CNPJ + nome), senão criar ---
  let solucaoId: string | null = null;
  let acao: "CRIAR" | "ENRIQUECER" | null = null;
  if (cnpjNormalizado && nome !== "" && empresaId) {
    const existente = ctx.solucaoPorChave.get(chaveSolucao(cnpjNormalizado, nome));
    if (existente) {
      solucaoId = existente;
      acao = "ENRIQUECER";
    } else {
      acao = "CRIAR";
    }
  }

  return {
    linha: crua.linha,
    campos: {
      nome,
      descricaoCurta: vazioParaNulo(limpar(v[COLUNAS_SOLUCAO.descricaoCurta])),
      descricaoCompleta: vazioParaNulo(limpar(v[COLUNAS_SOLUCAO.descricaoCompleta])),
      categoriaId,
      linkExterno: vazioParaNulo(limpar(v[COLUNAS_SOLUCAO.linkExterno])),
      coberturaNacional,
      culturaIds,
      ufIds,
    },
    cnpjNormalizado,
    empresaId,
    solucaoId,
    acao,
    pendencias,
  };
}

/**
 * Valida o lote inteiro: cada linha por `validarLinhaSolucao` e, depois, a
 * disciplina que só o conjunto enxerga — **a mesma solução (CNPJ + nome)
 * não pode aparecer em duas linhas**. Ambiguidade não se resolve por
 * adivinhação: todas as linhas repetidas viram pendência.
 */
export function validarLoteSolucoes(
  linhas: LinhaSolucaoCrua[],
  ctx: ContextoValidacaoSolucao,
): ResultadoLinhaSolucao[] {
  const resultados = linhas.map((linha) => validarLinhaSolucao(linha, ctx));

  const ocorrenciasPorChave = new Map<string, number>();
  for (const r of resultados) {
    if (r.cnpjNormalizado && r.campos.nome !== "") {
      const chave = chaveSolucao(r.cnpjNormalizado, r.campos.nome);
      ocorrenciasPorChave.set(chave, (ocorrenciasPorChave.get(chave) ?? 0) + 1);
    }
  }
  for (const r of resultados) {
    if (r.cnpjNormalizado && r.campos.nome !== "") {
      const chave = chaveSolucao(r.cnpjNormalizado, r.campos.nome);
      if ((ocorrenciasPorChave.get(chave) ?? 0) > 1) {
        r.pendencias.push({
          coluna: COLUNAS_SOLUCAO.nome,
          motivo: "Solução repetida no arquivo (mesmo CNPJ + nome em mais de uma linha).",
        });
      }
    }
  }
  return resultados;
}

/** Verdadeiro quando a linha pode ser efetivada (sem pendências). */
export function linhaPronta(resultado: ResultadoLinhaSolucao): boolean {
  return resultado.pendencias.length === 0;
}

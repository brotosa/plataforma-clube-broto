import type { EstagioEmpresa, OrigemDossie, StatusDossie } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { formatarBrl, type TetosDossie } from "@/dominio/dossie/custo";
import { podeTerDossieNoEstagio } from "@/dominio/dossie/regras";
import { type ConteudoDossie, validarConteudoDossie } from "@/dominio/dossie/schema";
import { ROTULOS_ESTAGIO_FUNIL } from "@/dominio/funil/regras";
import { gastoDoMes } from "@/infra/casos-de-uso/dossies";
import { provedorAutomatico } from "@/infra/dossie/provedores";
import { prepararPrompt } from "@/infra/dossie/template";

/**
 * Consulta de leitura da T11 (dossiê): a empresa, o dossiê vigente com o
 * conteúdo já validado, o histórico de execuções com custo e duração, e o
 * estado da configuração do provedor automático — a tela precisa saber se
 * pode oferecer o botão "Gerar dossiê" ou só a inserção manual.
 */

export interface ExecucaoDaTela {
  tentativa: number;
  provedor: string;
  modelo: string | null;
  iniciadaEm: Date;
  duracaoMs: number | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  buscasWeb: number | null;
  custoBrl: number | null;
  sucesso: boolean;
  erro: string | null;
  versaoTemplate: string;
}

export interface DossieDaTela {
  id: string;
  status: StatusDossie;
  origem: OrigemDossie;
  /** Conteúdo validado; null quando ainda não há (gerando/falha). */
  conteudo: ConteudoDossie | null;
  /** Preenchido quando o conteúdo gravado não passa mais na validação. */
  conteudoInvalido: ReadonlyArray<string>;
  revisado: boolean;
  revisorNome: string | null;
  revisadoEm: Date | null;
  solicitanteNome: string;
  contextoAdicional: string | null;
  erro: string | null;
  criadoEm: Date;
  versaoTemplate: string | null;
  execucoes: ExecucaoDaTela[];
}

export interface OrcamentoDaTela {
  tetos: TetosDossie;
  gastoNoMesBrl: number;
  restanteNoMesBrl: number;
  gastoNoMesFormatado: string;
  tetoMensalFormatado: string;
}

export interface TelaDossie {
  empresa: {
    id: string;
    nomeFantasia: string;
    site: string | null;
    estagio: EstagioEmpresa;
    rotuloEstagio: string;
    scoreScouting: number | null;
    responsavelScout: string | null;
    categorias: string[];
  };
  estagioAceitaDossie: boolean;
  dossie: DossieDaTela | null;
  /** Dossiês anteriores (mais recentes primeiro), sem conteúdo. */
  anteriores: Array<{ id: string; status: StatusDossie; criadoEm: Date; revisado: boolean }>;
  geracaoAutomatica:
    | { disponivel: true; orcamento: OrcamentoDaTela }
    | { disponivel: false; mensagem: string };
  /** Prompt montado do template — o analista copia para gerar por fora. */
  promptParaCopiar: { sistema: string; usuario: string; versao: string };
}

function execucaoParaTela(execucao: {
  tentativa: number;
  provedor: string;
  modelo: string | null;
  iniciadaEm: Date;
  duracaoMs: number | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  buscasWeb: number | null;
  custoBrl: unknown;
  sucesso: boolean;
  erro: string | null;
  versaoTemplate: string;
}): ExecucaoDaTela {
  return {
    tentativa: execucao.tentativa,
    provedor: execucao.provedor,
    modelo: execucao.modelo,
    iniciadaEm: execucao.iniciadaEm,
    duracaoMs: execucao.duracaoMs,
    tokensEntrada: execucao.tokensEntrada,
    tokensSaida: execucao.tokensSaida,
    buscasWeb: execucao.buscasWeb,
    custoBrl: execucao.custoBrl === null ? null : Number(execucao.custoBrl),
    sucesso: execucao.sucesso,
    erro: execucao.erro,
    versaoTemplate: execucao.versaoTemplate,
  };
}

export async function telaDossie(empresaId: string): Promise<TelaDossie | null> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      nomeFantasia: true,
      site: true,
      estagio: true,
      scoreScouting: true,
      responsavelScout: { select: { nome: true } },
      categorias: { select: { categoria: { select: { nome: true } } } },
    },
  });
  if (!empresa) {
    return null;
  }

  const dossies = await prisma.dossie.findMany({
    where: { empresaId },
    orderBy: { criadoEm: "desc" },
    include: {
      solicitante: { select: { nome: true } },
      revisor: { select: { nome: true } },
      execucoes: { orderBy: { tentativa: "asc" } },
    },
  });

  const vigente = dossies[0] ?? null;
  let conteudo: ConteudoDossie | null = null;
  let conteudoInvalido: string[] = [];
  if (vigente?.conteudo) {
    const validacao = validarConteudoDossie(vigente.conteudo);
    if (validacao.valido) {
      conteudo = validacao.conteudo;
    } else {
      conteudoInvalido = [...validacao.erros];
    }
  }

  const estadoProvedor = provedorAutomatico();
  let geracaoAutomatica: TelaDossie["geracaoAutomatica"];
  if (estadoProvedor.disponivel) {
    const gasto = await gastoDoMes(new Date());
    geracaoAutomatica = {
      disponivel: true,
      orcamento: {
        tetos: estadoProvedor.tetos,
        gastoNoMesBrl: gasto,
        restanteNoMesBrl: Math.max(estadoProvedor.tetos.mensalBrl - gasto, 0),
        gastoNoMesFormatado: formatarBrl(gasto),
        tetoMensalFormatado: formatarBrl(estadoProvedor.tetos.mensalBrl),
      },
    };
  } else {
    geracaoAutomatica = { disponivel: false, mensagem: estadoProvedor.mensagem };
  }

  const prompt = prepararPrompt({
    nome_empresa: empresa.nomeFantasia,
    site: empresa.site,
    contexto_adicional: vigente?.contextoAdicional ?? null,
  });

  return {
    empresa: {
      id: empresa.id,
      nomeFantasia: empresa.nomeFantasia,
      site: empresa.site,
      estagio: empresa.estagio,
      rotuloEstagio: ROTULOS_ESTAGIO_FUNIL[empresa.estagio],
      scoreScouting: empresa.scoreScouting,
      responsavelScout: empresa.responsavelScout?.nome ?? null,
      categorias: empresa.categorias.map((vinculo) => vinculo.categoria.nome),
    },
    estagioAceitaDossie: podeTerDossieNoEstagio(empresa.estagio),
    dossie: vigente
      ? {
          id: vigente.id,
          status: vigente.status,
          origem: vigente.origem,
          conteudo,
          conteudoInvalido,
          revisado: vigente.revisado,
          revisorNome: vigente.revisor?.nome ?? null,
          revisadoEm: vigente.revisadoEm,
          solicitanteNome: vigente.solicitante.nome,
          contextoAdicional: vigente.contextoAdicional,
          erro: vigente.erro,
          criadoEm: vigente.criadoEm,
          versaoTemplate: vigente.versaoTemplate,
          execucoes: vigente.execucoes.map(execucaoParaTela),
        }
      : null,
    anteriores: dossies.slice(1).map((dossie) => ({
      id: dossie.id,
      status: dossie.status,
      criadoEm: dossie.criadoEm,
      revisado: dossie.revisado,
    })),
    geracaoAutomatica,
    promptParaCopiar: {
      sistema: prompt.sistema,
      usuario: prompt.usuario,
      versao: prompt.versaoTemplate,
    },
  };
}

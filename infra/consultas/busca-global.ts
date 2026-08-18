import { Prisma, type EstagioEmpresa, type StatusOferta } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";

/**
 * Busca global do cabeçalho — "Buscar aliados, soluções e ofertas…".
 *
 * O campo do cabeçalho existia desde o protótipo, mas nunca fora ligado a
 * nada (o formulário só chamava `preventDefault`). Aqui ele passa a valer:
 * uma consulta única sobre as três entidades, case-insensitive, com teto por
 * grupo. É leitura (VISUALIZAR, todos os papéis) e não toca dado pessoal.
 */

const LIMITE_POR_GRUPO = 25;

export interface BuscaAliado {
  id: string;
  nome: string;
  estagio: EstagioEmpresa;
}

export interface BuscaSolucao {
  id: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
}

export interface BuscaOferta {
  id: string;
  titulo: string;
  status: StatusOferta;
  empresaId: string;
  empresaNome: string;
  solucaoNome: string;
}

export interface ResultadoBuscaGlobal {
  termo: string;
  aliados: BuscaAliado[];
  solucoes: BuscaSolucao[];
  ofertas: BuscaOferta[];
  total: number;
}

export async function buscaGlobal(termoBruto: string): Promise<ResultadoBuscaGlobal> {
  const termo = termoBruto.trim();
  if (termo.length === 0) {
    return { termo: "", aliados: [], solucoes: [], ofertas: [], total: 0 };
  }
  const contem = { contains: termo, mode: "insensitive" as const };
  const somenteDigitos = termo.replace(/\D/g, "");

  // O CNPJ é gravado só com dígitos; só entra na busca com massa suficiente
  // para não casar o mundo inteiro num "1".
  const orEmpresa: Prisma.EmpresaWhereInput[] = [
    { nomeFantasia: contem },
    { razaoSocial: contem },
  ];
  if (somenteDigitos.length >= 3) {
    orEmpresa.push({ cnpj: { contains: somenteDigitos } });
  }

  const [aliados, solucoes, ofertas] = await Promise.all([
    prisma.empresa.findMany({
      where: { OR: orEmpresa },
      orderBy: { nomeFantasia: "asc" },
      take: LIMITE_POR_GRUPO,
      select: { id: true, nomeFantasia: true, estagio: true },
    }),
    prisma.solucao.findMany({
      where: { nome: contem },
      orderBy: { nome: "asc" },
      take: LIMITE_POR_GRUPO,
      select: {
        id: true,
        nome: true,
        empresaId: true,
        empresa: { select: { nomeFantasia: true } },
      },
    }),
    prisma.oferta.findMany({
      where: { titulo: contem },
      orderBy: { titulo: "asc" },
      take: LIMITE_POR_GRUPO,
      select: {
        id: true,
        titulo: true,
        status: true,
        solucao: {
          select: { nome: true, empresaId: true, empresa: { select: { nomeFantasia: true } } },
        },
      },
    }),
  ]);

  const aliadosOut: BuscaAliado[] = aliados.map((empresa) => ({
    id: empresa.id,
    nome: empresa.nomeFantasia,
    estagio: empresa.estagio,
  }));
  const solucoesOut: BuscaSolucao[] = solucoes.map((solucao) => ({
    id: solucao.id,
    nome: solucao.nome,
    empresaId: solucao.empresaId,
    empresaNome: solucao.empresa.nomeFantasia,
  }));
  const ofertasOut: BuscaOferta[] = ofertas.map((oferta) => ({
    id: oferta.id,
    titulo: oferta.titulo,
    status: oferta.status,
    empresaId: oferta.solucao.empresaId,
    empresaNome: oferta.solucao.empresa.nomeFantasia,
    solucaoNome: oferta.solucao.nome,
  }));

  return {
    termo,
    aliados: aliadosOut,
    solucoes: solucoesOut,
    ofertas: ofertasOut,
    total: aliadosOut.length + solucoesOut.length + ofertasOut.length,
  };
}

import type { GrupoIndicador, Prisma, PrismaClient } from "@prisma/client";
import type { FamiliaLista } from "@/dominio/parametrizador/listas";
import type { UsoDeItem } from "@/dominio/parametrizador/listas";

/**
 * Ponte entre as famílias de lista da ficha §3.1 e as tabelas que já
 * existem desde a F1. Cada família tem a sua tabela, a sua flag de ativo
 * (`ativa`/`ativo`, herdadas do schema da Onda 1) e as suas frentes de uso.
 *
 * As contagens de uso são sempre consultas vivas (RN24): a ficha proíbe
 * desnormalizar contadores, então nada aqui guarda total em coluna.
 */

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export interface ItemDeLista {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  /** Só indicadores — o caso rico do editor (ficha §3.1). */
  grupo?: GrupoIndicador;
  dimensao?: string;
  peso?: number;
  descricao?: string;
}

/** Nome lógico da entidade na trilha de auditoria. */
export const ENTIDADE_AUDITORIA: Readonly<Record<FamiliaLista, string>> = {
  indicadores: "indicador",
  categorias: "categoria",
  culturas: "cultura",
  cobertura: "uf",
  "motivos-suspensao": "motivo_suspensao",
  "motivos-descarte": "motivo_descarte",
  "tipos-beneficio": "tipo_beneficio",
  "perfil-cliente": "perfil_cliente",
};

export async function listarItens(
  cliente: ClientePrisma,
  familia: FamiliaLista,
): Promise<ItemDeLista[]> {
  switch (familia) {
    case "indicadores": {
      const linhas = await cliente.indicador.findMany({ orderBy: { ordem: "asc" } });
      return linhas.map((i) => ({
        id: i.id,
        nome: i.nome,
        ativo: i.ativo,
        ordem: i.ordem,
        grupo: i.grupo,
        dimensao: i.dimensao,
        peso: Number(i.peso),
        descricao: i.descricao,
      }));
    }
    case "categorias": {
      const linhas = await cliente.categoria.findMany({ orderBy: { ordem: "asc" } });
      return linhas.map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativa, ordem: c.ordem }));
    }
    case "culturas": {
      const linhas = await cliente.cultura.findMany({ orderBy: { ordem: "asc" } });
      return linhas.map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativa, ordem: c.ordem }));
    }
    case "cobertura": {
      const linhas = await cliente.uf.findMany({ orderBy: { sigla: "asc" } });
      return linhas.map((u, indice) => ({
        id: u.id,
        nome: `${u.sigla} — ${u.nome}`,
        ativo: u.ativa,
        ordem: indice,
      }));
    }
    case "motivos-suspensao": {
      const linhas = await cliente.motivoSuspensao.findMany({ orderBy: { ordem: "asc" } });
      return linhas.map((m) => ({ id: m.id, nome: m.nome, ativo: m.ativa, ordem: m.ordem }));
    }
    case "motivos-descarte": {
      const linhas = await cliente.motivoDescarte.findMany({ orderBy: { ordem: "asc" } });
      return linhas.map((m) => ({ id: m.id, nome: m.nome, ativo: m.ativa, ordem: m.ordem }));
    }
    case "tipos-beneficio": {
      const linhas = await cliente.tipoBeneficio.findMany({ orderBy: { ordem: "asc" } });
      return linhas.map((t) => ({ id: t.id, nome: t.nome, ativo: t.ativa, ordem: t.ordem }));
    }
    case "perfil-cliente": {
      const linhas = await cliente.perfilCliente.findMany({ orderBy: { ordem: "asc" } });
      return linhas.map((p) => ({ id: p.id, nome: p.nome, ativo: p.ativo, ordem: p.ordem }));
    }
  }
}

/** RN24 — frentes de uso do item, apuradas na hora. */
export async function contarUsos(
  cliente: ClientePrisma,
  familia: FamiliaLista,
  itemId: string,
): Promise<UsoDeItem[]> {
  switch (familia) {
    case "indicadores": {
      const notas = await cliente.avaliacaoNota.count({ where: { indicadorId: itemId } });
      return [{ singular: "nota de avaliação", plural: "notas de avaliação", quantidade: notas }];
    }
    case "categorias": {
      const [solucoes, aliados, metas] = await Promise.all([
        cliente.solucao.count({ where: { categoriaId: itemId } }),
        cliente.empresaCategoria.count({ where: { categoriaId: itemId } }),
        cliente.metaPeriodo.count({ where: { categoriaId: itemId } }),
      ]);
      return [
        { singular: "solução", plural: "soluções", quantidade: solucoes },
        { singular: "aliado", plural: "aliados", quantidade: aliados },
        { singular: "meta", plural: "metas", quantidade: metas },
      ];
    }
    case "culturas": {
      const solucoes = await cliente.solucaoCultura.count({ where: { culturaId: itemId } });
      return [{ singular: "solução", plural: "soluções", quantidade: solucoes }];
    }
    case "cobertura": {
      const solucoes = await cliente.solucaoUf.count({ where: { ufId: itemId } });
      return [{ singular: "solução", plural: "soluções", quantidade: solucoes }];
    }
    case "motivos-suspensao": {
      const empresas = await cliente.empresa.count({ where: { motivoSuspensaoId: itemId } });
      return [{ singular: "aliado suspenso", plural: "aliados suspensos", quantidade: empresas }];
    }
    case "motivos-descarte": {
      const empresas = await cliente.empresa.count({ where: { motivoDescarteId: itemId } });
      return [
        { singular: "empresa descartada", plural: "empresas descartadas", quantidade: empresas },
      ];
    }
    case "tipos-beneficio": {
      const ofertas = await cliente.oferta.count({ where: { tipoBeneficioId: itemId } });
      return [{ singular: "oferta", plural: "ofertas", quantidade: ofertas }];
    }
    case "perfil-cliente":
      // A lista nasce vazia e ainda não é consumida por nenhuma entidade —
      // o vínculo chega com a Onda 5 (Assinantes).
      return [];
  }
}

export interface CamposDeItem {
  nome?: string;
  ativo?: boolean;
  grupo?: GrupoIndicador;
  dimensao?: string;
  peso?: number;
}

/**
 * Atualiza o item na tabela da família. Renomear é update simples: todo o
 * schema referencia os itens por id, então a propagação é automática
 * (RN24) — não há nada a reescrever nos registros históricos.
 */
export async function atualizarItem(
  cliente: ClientePrisma,
  familia: FamiliaLista,
  itemId: string,
  campos: CamposDeItem,
): Promise<ItemDeLista> {
  const nome = campos.nome?.trim();
  switch (familia) {
    case "indicadores": {
      await cliente.indicador.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativo: campos.ativo }),
          ...(campos.grupo === undefined ? {} : { grupo: campos.grupo }),
          ...(campos.dimensao === undefined ? {} : { dimensao: campos.dimensao }),
          ...(campos.peso === undefined ? {} : { peso: campos.peso }),
        },
      });
      break;
    }
    case "categorias":
      await cliente.categoria.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativa: campos.ativo }),
        },
      });
      break;
    case "culturas":
      await cliente.cultura.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativa: campos.ativo }),
        },
      });
      break;
    case "cobertura":
      // O nome exibido é "SIGLA — Nome"; só o nome da UF é editável, a
      // sigla é a chave pública da malha.
      await cliente.uf.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativa: campos.ativo }),
        },
      });
      break;
    case "motivos-suspensao":
      await cliente.motivoSuspensao.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativa: campos.ativo }),
        },
      });
      break;
    case "motivos-descarte":
      await cliente.motivoDescarte.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativa: campos.ativo }),
        },
      });
      break;
    case "tipos-beneficio":
      await cliente.tipoBeneficio.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativa: campos.ativo }),
        },
      });
      break;
    case "perfil-cliente":
      await cliente.perfilCliente.update({
        where: { id: itemId },
        data: {
          ...(nome === undefined ? {} : { nome }),
          ...(campos.ativo === undefined ? {} : { ativo: campos.ativo }),
        },
      });
      break;
  }
  const itens = await listarItens(cliente, familia);
  const atualizado = itens.find((item) => item.id === itemId);
  if (!atualizado) {
    throw new Error(`Item ${itemId} não encontrado na família ${familia} após a atualização.`);
  }
  return atualizado;
}

/** Slug estável a partir do nome — mesma regra do seed da F1. */
export function slugDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export interface NovoItem {
  nome: string;
  grupo?: GrupoIndicador;
  dimensao?: string;
  peso?: number;
  descricao?: string;
}

export async function criarItem(
  cliente: ClientePrisma,
  familia: FamiliaLista,
  novo: NovoItem,
): Promise<ItemDeLista> {
  const nome = novo.nome.trim();
  const slug = slugDe(nome);
  const existentes = await listarItens(cliente, familia);
  const ordem = existentes.length;

  switch (familia) {
    case "indicadores": {
      if (!novo.grupo || !novo.dimensao || novo.peso === undefined) {
        throw new Error("Indicador exige grupo, dimensão e peso.");
      }
      const criado = await cliente.indicador.create({
        data: {
          slug,
          nome,
          descricao: novo.descricao?.trim() ?? "",
          grupo: novo.grupo,
          dimensao: novo.dimensao,
          peso: novo.peso,
          ordem,
        },
      });
      return {
        id: criado.id,
        nome: criado.nome,
        ativo: criado.ativo,
        ordem: criado.ordem,
        grupo: criado.grupo,
        dimensao: criado.dimensao,
        peso: Number(criado.peso),
        descricao: criado.descricao,
      };
    }
    case "categorias": {
      const criado = await cliente.categoria.create({ data: { slug, nome, ordem } });
      return { id: criado.id, nome: criado.nome, ativo: criado.ativa, ordem: criado.ordem };
    }
    case "culturas": {
      const criado = await cliente.cultura.create({ data: { slug, nome, ordem } });
      return { id: criado.id, nome: criado.nome, ativo: criado.ativa, ordem: criado.ordem };
    }
    case "motivos-suspensao": {
      const criado = await cliente.motivoSuspensao.create({ data: { slug, nome, ordem } });
      return { id: criado.id, nome: criado.nome, ativo: criado.ativa, ordem: criado.ordem };
    }
    case "motivos-descarte": {
      const criado = await cliente.motivoDescarte.create({ data: { slug, nome, ordem } });
      return { id: criado.id, nome: criado.nome, ativo: criado.ativa, ordem: criado.ordem };
    }
    case "tipos-beneficio": {
      const criado = await cliente.tipoBeneficio.create({ data: { slug, nome, ordem } });
      return { id: criado.id, nome: criado.nome, ativo: criado.ativa, ordem: criado.ordem };
    }
    case "perfil-cliente": {
      const criado = await cliente.perfilCliente.create({ data: { slug, nome, ordem } });
      return { id: criado.id, nome: criado.nome, ativo: criado.ativo, ordem: criado.ordem };
    }
    case "cobertura":
      throw new Error(
        "A malha de UFs é fato público e fechado — a Abrangência não recebe itens novos.",
      );
  }
}

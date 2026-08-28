import type { Papel } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { eAdministradorEfetivo } from "@/dominio/usuarios/regras";
import { classificarSensibilidade } from "@/dominio/auditoria/extrato";

/**
 * Leitura da T27 (Onda 6, ficha §3): a lista de usuários internos e a
 * "atividade recente" da ficha — a trilha de auditoria filtrada por autor.
 */

export interface LinhaUsuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  trocaSenhaObrigatoria: boolean;
  /**
   * RN46 na UI: este usuário é o ÚNICO administrador ativo? A tela usa isso
   * para desabilitar "Inativar" e explicar o porquê antes de a pessoa
   * tentar — a API recusa de todo jeito, mas recusar depois do clique é
   * pior experiência do que dizer antes.
   */
  unicoAdministradorAtivo: boolean;
}

export async function listarUsuarios(): Promise<LinhaUsuario[]> {
  const usuarios = await prisma.usuario.findMany({
    // Ordem alfabética por nome, com o e-mail como desempate — assim os
    // registros de mesma pessoa (ex.: conta ativa nova + conta antiga
    // inativada de outro domínio) ficam LADO A LADO, e não separados em
    // blocos de ativo/inativo. A situação vira coluna e filtro, não ordem.
    orderBy: [{ nome: "asc" }, { email: "asc" }],
    select: {
      id: true,
      nome: true,
      email: true,
      papel: true,
      ativo: true,
      trocaSenhaObrigatoria: true,
    },
  });

  const administradoresAtivos = usuarios.filter(eAdministradorEfetivo);

  return usuarios.map((usuario) => ({
    ...usuario,
    unicoAdministradorAtivo:
      administradoresAtivos.length === 1 && administradoresAtivos[0]?.id === usuario.id,
  }));
}

export async function buscarUsuario(usuarioId: string) {
  return prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      nome: true,
      email: true,
      papel: true,
      ativo: true,
      trocaSenhaObrigatoria: true,
      criadoEm: true,
    },
  });
}

export interface EventoRecente {
  id: string;
  entidade: string;
  entidadeId: string;
  campo: string;
  criadoEm: Date;
  sensivel: boolean;
}

/**
 * Atalho "atividade recente" da ficha do usuário (ficha §3): a trilha
 * filtrada por autor. Só os últimos eventos — a consulta completa, com
 * filtros e antes → depois, é a T28.
 */
export async function atividadeRecente(
  usuarioId: string,
  limite = 10,
): Promise<EventoRecente[]> {
  const eventos = await prisma.auditoriaEvento.findMany({
    where: { autorId: usuarioId },
    orderBy: { criadoEm: "desc" },
    take: limite,
    select: {
      id: true,
      entidade: true,
      entidadeId: true,
      campo: true,
      criadoEm: true,
    },
  });
  return eventos.map((evento) => ({
    ...evento,
    sensivel: classificarSensibilidade(evento) !== null,
  }));
}

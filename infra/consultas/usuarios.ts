import type { Papel } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { eAdministradorEfetivo } from "@/dominio/usuarios/regras";
import { minutosAteExpirarCredencial } from "@/dominio/usuarios/politica-senha";
import { lerPoliticaDeSenha } from "@/infra/casos-de-uso/configuracoes";
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
  /**
   * Minutos até a credencial provisória expirar — negativo já expirou, e
   * `null` significa **sem prazo** (proteção desligada, ou senha escolhida
   * pela própria pessoa).
   *
   * Vem calculado da consulta, e não da tela, para que a lista e a
   * autenticação leiam a mesma função do domínio. Uma tela que refizesse a
   * conta poderia dizer "expira em 2 h" para uma conta que o login já recusa.
   */
  minutosAteExpirarCredencial: number | null;
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
      credencialEmitidaEm: true,
    },
  });

  const administradoresAtivos = usuarios.filter(eAdministradorEfetivo);
  const politica = await lerPoliticaDeSenha();
  const agora = new Date();

  return usuarios.map(({ credencialEmitidaEm, ...usuario }) => ({
    ...usuario,
    unicoAdministradorAtivo:
      administradoresAtivos.length === 1 && administradoresAtivos[0]?.id === usuario.id,
    minutosAteExpirarCredencial: usuario.trocaSenhaObrigatoria
      ? minutosAteExpirarCredencial(credencialEmitidaEm, agora, politica)
      : null,
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

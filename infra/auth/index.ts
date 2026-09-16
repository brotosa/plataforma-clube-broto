import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { configBase } from "./config-base";
import { prisma } from "@/infra/prisma/cliente";
import { provedorCredenciaisPrisma } from "@/infra/identidade/provedor-credenciais-prisma";
import type { ProvedorIdentidade } from "@/dominio/identidade/provedor-identidade";
import { lerPoliticaDeSenha, lerPoliticaDeSessao } from "@/infra/casos-de-uso/configuracoes";
import { revisarTokenDeSessao } from "./revisao-de-sessao";
import { deveRegistrarAcesso } from "@/dominio/usuarios/presenca";
import { logger } from "@/infra/log/logger";

const esquemaCredenciais = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

/** Provedor de identidade em uso (troca única quando o Entra ID entrar). */
const provedorIdentidade: ProvedorIdentidade = provedorCredenciaisPrisma;

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...configBase,
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const analise = esquemaCredenciais.safeParse(credentials);
        if (!analise.success) {
          return null;
        }
        const usuario = await provedorIdentidade.autenticarPorCredenciais(
          analise.data.email,
          analise.data.senha,
        );
        if (!usuario) {
          return null;
        }
        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          nome: usuario.nome,
          papel: usuario.papel,
          sessaoEpoca: usuario.sessaoEpoca,
          trocaSenhaObrigatoria: usuario.trocaSenhaObrigatoria,
        };
      },
    }),
  ],
  callbacks: {
    ...configBase.callbacks,
    /**
     * RN47 — a revogação acontece AQUI.
     *
     * Com `strategy: "jwt"` não existe tabela de sessão para apagar: o
     * token vive no cookie assinado e valeria até expirar. O Auth.js chama
     * este callback a cada leitura de sessão (@auth/core, lib/actions/
     * session.ts) e trata `null` como sessão inválida — descartando o
     * cookie. Conferir a época do token contra a coluna do usuário é,
     * portanto, o que transforma "inativar" em revogação imediata, e não em
     * "bloqueia o próximo login".
     *
     * O preço é uma leitura de `usuarios` por requisição autenticada. Numa
     * plataforma de back-office isso é barato; e é o custo de a inativação
     * significar o que diz que significa.
     *
     * O middleware não faz esta conferência de propósito: ele roda no
     * runtime edge, sem Prisma. Não precisa — a guarda da camada (o layout
     * de (plataforma) chama `auth()`) roda antes de qualquer conteúdo ser
     * renderizado, e a partir do momento em que o cookie é limpo o próprio
     * middleware volta a barrar.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? "";
        token.papel = user.papel;
        token.nome = user.nome;
        token.sessaoEpoca = user.sessaoEpoca;
        token.trocaSenhaObrigatoria = user.trocaSenhaObrigatoria;
        // Nasce com a atividade zerada em "agora" — o relógio da inatividade
        // (PoliticaDeSessao) começa a contar do login. `inicioSessao` marca o
        // mesmo instante mas NUNCA é reiniciado: é o relógio do teto absoluto.
        token.ultimaAtividade = Date.now();
        token.inicioSessao = Date.now();
        return token;
      }

      if (!token.id) {
        return token;
      }

      // Uma leitura por requisição autenticada, como a RN47 já cobra: o
      // usuário (época/papel/nome) e a política de sessão vigente. A política
      // é lida aqui, e não gravada no token, para que apertar o tempo em
      // Configurações valha para as sessões abertas na requisição seguinte.
      const [atual, politicaSessao, politicaSenha] = await Promise.all([
        prisma.usuario.findUnique({
          where: { id: token.id },
          select: {
            ativo: true,
            papel: true,
            nome: true,
            sessaoEpoca: true,
            trocaSenhaObrigatoria: true,
            senhaAlteradaEm: true,
            ultimoAcessoEm: true,
          },
        }),
        lerPoliticaDeSessao(),
        // A validade periódica da senha é lida aqui, e não gravada no token,
        // pelo mesmo motivo do tempo de sessão: ligar a troca periódica vale
        // para as sessões abertas já na requisição seguinte.
        lerPoliticaDeSenha(),
      ]);

      // A decisão (revogação por época + expiração por inatividade, nessa
      // ordem) vive em `revisarTokenDeSessao`, fora daqui, porque dentro da
      // chamada do NextAuth nenhum teste a alcançava. Aqui fica só o IO e o
      // log; a regra é testada isoladamente.
      //
      // Cada chamada deste callback nasce de atividade real — navegação,
      // server action ou o heartbeat do cliente, que só dispara com
      // atividade —, então decidir pela marca ANTERIOR e reiniciá-la para
      // "agora" implementa a janela deslizante sem keep-alive: sem
      // atividade, sem chamada, e a requisição seguinte encontra o intervalo
      // estourado.
      //
      // QUEM PERSISTE A MARCA É O HEARTBEAT, não esta linha. Server Component
      // não escreve cookie no Next.js: numa navegação o token é atualizado
      // em memória e o cookie continua com o valor antigo. Só um contexto que
      // pode emitir Set-Cookie — a server action `registrarAtividade`, via
      // `unstable_update` — grava a marca nova. Por isso o heartbeat é
      // estrutural, e não um enfeite: sem ele a janela contaria desde o
      // login. Medido pelo e2e que lê e forja o próprio cookie
      // (`e2e/sessao-inatividade.spec.ts`).
      const agora = Date.now();
      const revisao = revisarTokenDeSessao({
        token,
        usuarioAtual: atual,
        politica: politicaSessao,
        politicaSenha,
        agora,
      });

      if (!revisao.token) {
        if (revisao.motivo === "teto") {
          logger.info(
            { usuarioId: token.id, desdeLoginMs: agora - (token.inicioSessao ?? agora) },
            "sessão encerrada pelo teto absoluto",
          );
        } else if (revisao.motivo === "inatividade") {
          logger.info(
            { usuarioId: token.id, inativoMs: agora - (token.ultimaAtividade ?? agora) },
            "sessão expirada por inatividade",
          );
        } else {
          logger.info(
            { usuarioId: token.id, epocaDoToken: token.sessaoEpoca },
            "sessão revogada (RN47)",
          );
        }
        return null;
      }

      /*
       * MARCA DE PRESENÇA (indicador On-line/Offline da T27).
       *
       * Aqui, e não numa rota própria, porque este é o único ponto por onde
       * passa **toda** requisição autenticada — navegação, server action e o
       * pulso do cliente. Uma rota separada mediria só quem a chamasse.
       *
       * Três disciplinas, e nenhuma é detalhe:
       *
       *  • **Com folga.** Sem ela, cada clique viraria um `UPDATE`. A folga é
       *    de um minuto e cabe com sobra na janela de cinco da tela, então
       *    economizar aqui não faz o indicador mentir.
       *  • **Depois da revisão, nunca antes.** Sessão revogada ou vencida não
       *    deixa rastro de presença: marcar quem acabou de ser recusado
       *    mostraria "on-line" para quem foi posto para fora.
       *  • **Sem auditoria e sem quebrar a requisição.** Presença é telemetria
       *    de uso, não ato de negócio — a trilha da RN49 não se polui com
       *    isso, no mesmo espírito da rota de saúde (RN61). E se a escrita
       *    falhar, o acesso segue: ninguém fica de fora da plataforma porque
       *    um indicador não pôde ser atualizado.
       */
      // `atual` não é nulo aqui — a revisão devolve token nulo quando o
      // usuário sumiu, e nesse caso já retornamos acima. A guarda é para o
      // compilador, e serve de lembrete de que a ordem é o que garante isso.
      if (atual && deveRegistrarAcesso(atual.ultimoAcessoEm, new Date(agora))) {
        try {
          await prisma.usuario.update({
            where: { id: token.id },
            data: { ultimoAcessoEm: new Date(agora) },
          });
        } catch (erro) {
          logger.warn({ usuarioId: token.id, erro }, "falha ao registrar presença");
        }
      }

      return revisao.token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.papel = token.papel;
      session.user.nome = token.nome;
      session.user.trocaSenhaObrigatoria = token.trocaSenhaObrigatoria;
      return session;
    },
  },
});

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  gerarAssinantesSinteticos,
  gerarCsvNucleoSintetico,
} from "../infra/assinantes/fixtures-sinteticas";

/**
 * Estado inicial determinístico para a suíte e2e: as regras do motor
 * voltam ao estado de nascimento da RN06 (promoção LIGADA, publicação de
 * oferta DESLIGADA), mesmo que uma execução anterior tenha sido
 * interrompida no meio de um toggle da T7. A F11 acrescenta: módulo de
 * assinantes zerado e arquivos sintéticos de carga gerados em e2e/.tmp
 * (mesma semente da spec — contagens conferíveis sem número inventado).
 */
export default async function configuracaoGlobal() {
  // Identificador de execução ESTÁVEL, fixado uma única vez aqui. Os workers
  // herdam este env do processo principal (inclusive após reinício por
  // timeout), então o sufixo dos nomes/CNPJs não muda no meio da suíte — a
  // causa-raiz da flakiness herdada (SUFIXO = Date.now() no topo do módulo,
  // que dessincronizava cadeias serial ao recarregar). Numérico, 6 dígitos.
  process.env.E2E_RUN_ID = process.env.E2E_RUN_ID || String(Date.now()).slice(-6);

  if (!process.env.DATABASE_URL) {
    // Fora do CI a URL vive no .env (carregado pelo Next, não pelo Playwright)
    try {
      const env = readFileSync(".env", "utf8");
      const linha = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
      if (linha) {
        process.env.DATABASE_URL = linha.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
      }
    } catch {
      return; // sem banco acessível: os próprios testes falharão com contexto
    }
  }
  const prisma = new PrismaClient();
  try {
    // Remove os dados criados por execuções anteriores da própria suíte
    // (prefixo "Aliado E2E") — evita acúmulo e paginação instável na T1.
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "Aliado E2E" } },
      include: { solucoes: { include: { ofertas: { select: { id: true } } } } },
    });
    for (const empresa of empresas) {
      const solucaoIds = empresa.solucoes.map((solucao) => solucao.id);
      const ofertaIds = empresa.solucoes.flatMap((solucao) =>
        solucao.ofertas.map((oferta) => oferta.id),
      );
      await prisma.aprovacaoSolicitacao.deleteMany({
        where: { entidadeId: { in: [empresa.id, ...solucaoIds, ...ofertaIds] } },
      });
      await prisma.auditoriaEvento.deleteMany({
        where: { entidadeId: { in: [empresa.id, ...solucaoIds, ...ofertaIds] } },
      });
      await prisma.ofertaPretendida.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.indicadorDeclarado.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.oferta.deleteMany({ where: { id: { in: ofertaIds } } });
      await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
      await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
      await prisma.solucao.deleteMany({ where: { id: { in: solucaoIds } } });
      await prisma.contratoComercial.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.contatoEmpresa.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.empresaCategoria.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.empresa.delete({ where: { id: empresa.id } });
    }
    if (empresas.length > 0) {
      console.log(`[e2e] ${empresas.length} aliado(s) de execuções anteriores removido(s)`);
    }

    // Dados da suíte do funil (F6): empresas do radar ("Radar E2E"/"Prospect
    // E2E") e o staging da importação de prospects.
    const empresasFunil = await prisma.empresa.findMany({
      where: {
        OR: [
          { nomeFantasia: { startsWith: "Radar E2E" } },
          { nomeFantasia: { startsWith: "Prospect E2E" } },
        ],
      },
      select: { id: true },
    });
    const idsFunil = empresasFunil.map((empresa) => empresa.id);
    if (idsFunil.length > 0) {
      const avaliacaoIdsFunil = (
        await prisma.avaliacaoScout.findMany({
          where: { empresaId: { in: idsFunil } },
          select: { id: true },
        })
      ).map((avaliacao) => avaliacao.id);
      const dossieIdsFunil = (
        await prisma.dossie.findMany({
          where: { empresaId: { in: idsFunil } },
          select: { id: true },
        })
      ).map((dossie) => dossie.id);
      // F9: uma empresa do funil pode ter chegado a Aliada ativa (percurso
      // ponta a ponta), então carrega também soluções, ofertas, contrato,
      // contatos e a ficha M1. O pedido de promoção sai primeiro: a RN20
      // faz dele o dono das referências à avaliação e ao dossiê.
      const solucoesFunil = await prisma.solucao.findMany({
        where: { empresaId: { in: idsFunil } },
        include: { ofertas: { select: { id: true } } },
      });
      const solucaoIdsFunil = solucoesFunil.map((solucao) => solucao.id);
      const ofertaIdsFunil = solucoesFunil.flatMap((solucao) =>
        solucao.ofertas.map((oferta) => oferta.id),
      );
      await prisma.aprovacaoSolicitacao.deleteMany({
        where: { entidadeId: { in: [...idsFunil, ...solucaoIdsFunil, ...ofertaIdsFunil] } },
      });
      await prisma.avaliacaoNota.deleteMany({
        where: { avaliacaoId: { in: avaliacaoIdsFunil } },
      });
      await prisma.avaliacaoScout.deleteMany({ where: { id: { in: avaliacaoIdsFunil } } });
      await prisma.dossieExecucao.deleteMany({ where: { dossieId: { in: dossieIdsFunil } } });
      await prisma.dossie.deleteMany({ where: { id: { in: dossieIdsFunil } } });
      await prisma.notaRapida.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.registroNegociacao.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.auditoriaEvento.deleteMany({
        where: {
          entidadeId: {
            in: [
              ...idsFunil,
              ...solucaoIdsFunil,
              ...ofertaIdsFunil,
              ...avaliacaoIdsFunil,
              ...dossieIdsFunil,
            ],
          },
        },
      });
      await prisma.ofertaPretendida.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.indicadorDeclarado.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.telemetriaEvento.deleteMany({ where: { ofertaId: { in: ofertaIdsFunil } } });
      await prisma.telemetriaAcumuladoInicial.deleteMany({
        where: { ofertaId: { in: ofertaIdsFunil } },
      });
      await prisma.oferta.deleteMany({ where: { id: { in: ofertaIdsFunil } } });
      await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: solucaoIdsFunil } } });
      await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: solucaoIdsFunil } } });
      await prisma.solucao.deleteMany({ where: { id: { in: solucaoIdsFunil } } });
      await prisma.contratoComercial.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.contatoEmpresa.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.stagingEmpresa.deleteMany({
        where: { empresaIdEfetivada: { in: idsFunil } },
      });
      await prisma.empresa.deleteMany({ where: { id: { in: idsFunil } } });
      console.log(`[e2e] ${idsFunil.length} empresa(s) do funil de execuções anteriores removida(s)`);
    }
    await prisma.stagingEmpresa.deleteMany({ where: { estado: { not: "EFETIVADA" } } });

    // Telemetria/publicações da própria suíte (fixtures SINTÉTICAS): vouchers
    // com prefixo E2E- e todas as publicações (só a feature/testes as criam no
    // banco de teste) — mantém a idempotência e o baseline do diff a cada run.
    await prisma.telemetriaEvento.deleteMany({ where: { idVoucher: { startsWith: "E2E-" } } });
    await prisma.importacao.deleteMany({
      where: { tipo: "TELEMETRIA", nomeArquivo: { contains: "SINTETICO" } },
    });
    await prisma.publicacao.deleteMany({});

    await prisma.aprovacaoRegra.update({
      where: { tipoEntidade: "PROMOCAO_ALIADA_ATIVA" },
      data: { exigida: true },
    });
    await prisma.aprovacaoRegra.update({
      where: { tipoEntidade: "PUBLICACAO_OFERTA" },
      data: { exigida: false },
    });
    // F10 (RN27): a família sensível nasce DESLIGADA.
    await prisma.aprovacaoRegra.updateMany({
      where: { tipoEntidade: "PARAMETRO_SENSIVEL" },
      data: { exigida: false },
    });
    console.log(
      "[e2e] regras do motor no estado de nascimento: promoção ON, oferta OFF, parâmetro sensível OFF",
    );

    // F10: parâmetros de volta ao estado de implantação — a suíte altera
    // réguas para provar o efeito vivo e precisa de um baseline estável.
    for (const [chave, valor] of [
      ["FUNIL_ENVELHECIMENTO_LEVE_DIAS", 14],
      ["FUNIL_ENVELHECIMENTO_FORTE_DIAS", 30],
      ["OFERTA_SEM_RESGATE_DIAS", 90],
      ["OFERTA_VIGENCIA_A_VENCER_DIAS", 15],
      ["REAVALIACAO_MESES", 12],
      ["COMISSAO_PADRAO_PCT", 5],
    ] as const) {
      await prisma.valorRegra.updateMany({ where: { chave }, data: { valor } });
    }
    await prisma.valorRegraHistorico.deleteMany({});
    const culturasE2E = await prisma.cultura.findMany({
      where: { nome: { startsWith: "Cultura E2E" } },
      select: { id: true },
    });
    if (culturasE2E.length > 0) {
      await prisma.cultura.deleteMany({ where: { id: { in: culturasE2E.map((c) => c.id) } } });
    }
    await prisma.meta.deleteMany({ where: { periodo: { in: ["MENSAL", "TRIMESTRAL"] } } });
    console.log("[e2e] parâmetros no estado de implantação (F10)");

    // F11 — módulo de assinantes zerado (a spec importa tudo pela T20).
    await prisma.atributoEnriquecimento.deleteMany({});
    await prisma.assinatura.deleteMany({});
    await prisma.exportacaoLista.deleteMany({});
    await prisma.segmento.deleteMany({});
    await prisma.stagingAssinante.deleteMany({});
    await prisma.assinante.deleteMany({});
    await prisma.importacao.deleteMany({
      where: { tipo: { in: ["ASSINANTES_NUCLEO", "ASSINANTES_ENRIQUECIMENTO"] } },
    });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: { in: ["assinante", "segmento", "exportacao_lista"] } },
    });

    // Arquivos sintéticos da carga (semente 21 — a mesma da spec).
    const sinteticos = gerarAssinantesSinteticos(12, 21);
    const pastaTemporaria = path.join(process.cwd(), "e2e", ".tmp");
    mkdirSync(pastaTemporaria, { recursive: true });
    writeFileSync(
      path.join(pastaTemporaria, "assinantes-nucleo.csv"),
      gerarCsvNucleoSintetico(sinteticos),
      "utf8",
    );
    writeFileSync(
      path.join(pastaTemporaria, "assinantes-parcial.csv"),
      gerarCsvNucleoSintetico(sinteticos.slice(0, 2)),
      "utf8",
    );
    console.log("[e2e] módulo de assinantes zerado e arquivos sintéticos gerados");
  } finally {
    await prisma.$disconnect();
  }
}

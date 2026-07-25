import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

/**
 * Estado inicial determinístico para a suíte e2e: as regras do motor
 * voltam ao estado de nascimento da RN06 (promoção LIGADA, publicação de
 * oferta DESLIGADA), mesmo que uma execução anterior tenha sido
 * interrompida no meio de um toggle da T7.
 */
export default async function configuracaoGlobal() {
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
      await prisma.notaRapida.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.registroNegociacao.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: idsFunil } } });
      await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: idsFunil } } });
      await prisma.stagingEmpresa.deleteMany({
        where: { empresaIdEfetivada: { in: idsFunil } },
      });
      await prisma.empresa.deleteMany({ where: { id: { in: idsFunil } } });
      console.log(`[e2e] ${idsFunil.length} empresa(s) do funil de execuções anteriores removida(s)`);
    }
    await prisma.stagingEmpresa.deleteMany({ where: { estado: { not: "EFETIVADA" } } });

    await prisma.aprovacaoRegra.update({
      where: { tipoEntidade: "PROMOCAO_ALIADA_ATIVA" },
      data: { exigida: true },
    });
    await prisma.aprovacaoRegra.update({
      where: { tipoEntidade: "PUBLICACAO_OFERTA" },
      data: { exigida: false },
    });
    console.log("[e2e] regras do motor no estado de nascimento (RN06): promoção ON, oferta OFF");
  } finally {
    await prisma.$disconnect();
  }
}

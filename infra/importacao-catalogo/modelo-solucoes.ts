/**
 * Gerador do modelo `.xlsx` do importador de SOLUÇÕES (opção B).
 *
 * O arquivo já vem **pré-preenchido com o catálogo atual** — cada solução
 * existente é uma linha, com CNPJ do aliado e os campos de hoje —, mais
 * linhas em branco para novas. Uma aba "Listas" traz os valores válidos do
 * Parametrizador (categorias, culturas, UFs) para consulta, e a coluna
 * Categoria ganha um menu suspenso apontando para essa aba. Assim o valor
 * fora da lista (que a importação recusaria) é evitado na origem.
 *
 * Só LEITURA do banco — não escreve nada. É a infra que injeta o catálogo.
 */

import ExcelJS from "exceljs";
import { prisma } from "@/infra/prisma/cliente";
import { formatarCnpj } from "@/dominio/empresas/cnpj";
import { COBERTURA_NACIONAL, COLUNAS_SOLUCAO } from "@/dominio/importacao-catalogo/solucoes";

const LINHAS_EM_BRANCO = 50;
const LINHAS_COM_VALIDACAO = 1000;

export async function gerarModeloSolucoes(): Promise<Buffer> {
  const [solucoes, categorias, culturas, ufs] = await Promise.all([
    prisma.solucao.findMany({
      where: { empresa: { cnpj: { not: null } } },
      orderBy: [{ empresa: { nomeFantasia: "asc" } }, { nome: "asc" }],
      select: {
        nome: true,
        descricaoCurta: true,
        descricaoCompleta: true,
        linkExterno: true,
        coberturaNacional: true,
        categoria: { select: { nome: true } },
        empresa: { select: { cnpj: true } },
        culturas: { select: { cultura: { select: { nome: true } } } },
        ufs: { select: { uf: { select: { sigla: true } } } },
      },
    }),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" }, select: { nome: true } }),
    prisma.cultura.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" }, select: { nome: true } }),
    prisma.uf.findMany({ where: { ativa: true }, orderBy: { sigla: "asc" }, select: { sigla: true, nome: true } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de gestão do Clube";

  // --- Aba principal ---
  const aba = wb.addWorksheet("Soluções");
  const colunas = [
    { header: COLUNAS_SOLUCAO.cnpj, key: "cnpj", width: 22 },
    { header: COLUNAS_SOLUCAO.nome, key: "nome", width: 42 },
    { header: COLUNAS_SOLUCAO.descricaoCurta, key: "descricaoCurta", width: 42 },
    { header: COLUNAS_SOLUCAO.descricaoCompleta, key: "descricaoCompleta", width: 52 },
    { header: COLUNAS_SOLUCAO.categoria, key: "categoria", width: 30 },
    { header: COLUNAS_SOLUCAO.linkExterno, key: "linkExterno", width: 30 },
    { header: COLUNAS_SOLUCAO.culturas, key: "culturas", width: 34 },
    { header: COLUNAS_SOLUCAO.cobertura, key: "cobertura", width: 24 },
  ];
  aba.columns = colunas;
  aba.getRow(1).font = { bold: true };
  aba.views = [{ state: "frozen", ySplit: 1 }];

  for (const s of solucoes) {
    aba.addRow({
      cnpj: s.empresa.cnpj ? formatarCnpj(s.empresa.cnpj) : "",
      nome: s.nome,
      descricaoCurta: s.descricaoCurta ?? "",
      descricaoCompleta: s.descricaoCompleta ?? "",
      categoria: s.categoria?.nome ?? "",
      linkExterno: s.linkExterno ?? "",
      culturas: s.culturas.map((c) => c.cultura.nome).join("; "),
      cobertura: s.coberturaNacional
        ? COBERTURA_NACIONAL
        : s.ufs.map((u) => u.uf.sigla).join("; "),
    });
  }
  for (let i = 0; i < LINHAS_EM_BRANCO; i += 1) {
    aba.addRow({});
  }

  // --- Aba de listas (referência + fonte do dropdown de categoria) ---
  const listas = wb.addWorksheet("Listas");
  listas.columns = [
    { header: "Categorias", key: "categoria", width: 34 },
    { header: "Culturas", key: "cultura", width: 28 },
    { header: "UFs", key: "uf", width: 28 },
  ];
  listas.getRow(1).font = { bold: true };
  const maxLinhas = Math.max(categorias.length, culturas.length, ufs.length);
  for (let i = 0; i < maxLinhas; i += 1) {
    const uf = ufs[i];
    listas.addRow({
      categoria: categorias[i]?.nome ?? "",
      cultura: culturas[i]?.nome ?? "",
      uf: uf ? `${uf.sigla} — ${uf.nome}` : "",
    });
  }

  // Dropdown de Categoria (coluna 5) apontando para a lista de categorias.
  if (categorias.length > 0) {
    const faixaCategorias = `Listas!$A$2:$A$${categorias.length + 1}`;
    for (let linha = 2; linha <= LINHAS_COM_VALIDACAO + 1; linha += 1) {
      aba.getCell(linha, 5).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [faixaCategorias],
        showErrorMessage: true,
        errorStyle: "warning",
        error: "Escolha uma categoria da lista do Parametrizador.",
      };
    }
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

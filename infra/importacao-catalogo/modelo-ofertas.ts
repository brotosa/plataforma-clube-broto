/**
 * Gerador do modelo `.xlsx` do importador de OFERTAS (opção B).
 *
 * Três abas:
 * - "Ofertas": as ofertas atuais como linhas (com `ID Oferta` e `ID Solução`
 *   preenchidos) + linhas em branco. `ID Oferta` vazio = nova; preenchido =
 *   enriquecer. Menus para Natureza, Tipo de benefício, Mecânica e Modalidade.
 * - "Soluções (referência)": ID Solução + Aliado + Nome, para achar o ID.
 * - "Listas": valores válidos do Parametrizador (fonte dos menus).
 *
 * Só LEITURA do banco.
 */

import ExcelJS from "exceljs";
import { prisma } from "@/infra/prisma/cliente";
import {
  COLUNAS_OFERTA,
  ROTULO_MODALIDADE,
  ROTULO_NATUREZA,
} from "@/dominio/importacao-catalogo/ofertas";

const LINHAS_EM_BRANCO = 50;
const LINHAS_COM_VALIDACAO = 1000;

function dataBr(data: Date | null): string {
  if (!data) return "";
  const iso = new Date(data);
  const d = String(iso.getUTCDate()).padStart(2, "0");
  const m = String(iso.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${iso.getUTCFullYear()}`;
}

function numeroBr(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const n = Number(valor);
  return Number.isFinite(n) ? String(n).replace(".", ",") : "";
}

export async function gerarModeloOfertas(): Promise<Buffer> {
  const [ofertas, solucoes, tipos, mecanicas] = await Promise.all([
    prisma.oferta.findMany({
      orderBy: { criadoEm: "asc" },
      select: {
        id: true,
        solucaoId: true,
        titulo: true,
        natureza: true,
        precoDe: true,
        precoPor: true,
        cupomCodigoRegras: true,
        modalidadePagamento: true,
        instrucoesResgate: true,
        vigenciaInicio: true,
        vigenciaFim: true,
        limiteResgates: true,
        tipoBeneficio: { select: { nome: true } },
        mecanica: { select: { nome: true } },
      },
    }),
    prisma.solucao.findMany({
      orderBy: [{ empresa: { nomeFantasia: "asc" } }, { nome: "asc" }],
      select: { id: true, nome: true, empresa: { select: { nomeFantasia: true } } },
    }),
    prisma.tipoBeneficio.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.mecanica.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de gestão do Clube";

  // --- Aba principal ---
  const aba = wb.addWorksheet("Ofertas");
  aba.columns = [
    { header: COLUNAS_OFERTA.idOferta, key: "idOferta", width: 26 },
    { header: COLUNAS_OFERTA.idSolucao, key: "idSolucao", width: 26 },
    { header: COLUNAS_OFERTA.titulo, key: "titulo", width: 40 },
    { header: COLUNAS_OFERTA.natureza, key: "natureza", width: 18 },
    { header: COLUNAS_OFERTA.tipoBeneficio, key: "tipoBeneficio", width: 22 },
    { header: COLUNAS_OFERTA.mecanica, key: "mecanica", width: 22 },
    { header: COLUNAS_OFERTA.precoDe, key: "precoDe", width: 12 },
    { header: COLUNAS_OFERTA.precoPor, key: "precoPor", width: 12 },
    { header: COLUNAS_OFERTA.cupomCodigoRegras, key: "cupom", width: 24 },
    { header: COLUNAS_OFERTA.modalidade, key: "modalidade", width: 20 },
    { header: COLUNAS_OFERTA.instrucoes, key: "instrucoes", width: 40 },
    { header: COLUNAS_OFERTA.vigenciaInicio, key: "vigenciaInicio", width: 16 },
    { header: COLUNAS_OFERTA.vigenciaFim, key: "vigenciaFim", width: 16 },
    { header: COLUNAS_OFERTA.limiteResgates, key: "limiteResgates", width: 16 },
  ];
  aba.getRow(1).font = { bold: true };
  aba.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];

  for (const o of ofertas) {
    aba.addRow({
      idOferta: o.id,
      idSolucao: o.solucaoId,
      titulo: o.titulo,
      natureza: ROTULO_NATUREZA[o.natureza],
      tipoBeneficio: o.tipoBeneficio.nome,
      mecanica: o.mecanica.nome,
      precoDe: numeroBr(o.precoDe),
      precoPor: numeroBr(o.precoPor),
      cupom: o.cupomCodigoRegras ?? "",
      modalidade: o.modalidadePagamento ? ROTULO_MODALIDADE[o.modalidadePagamento] : "",
      instrucoes: o.instrucoesResgate ?? "",
      vigenciaInicio: dataBr(o.vigenciaInicio),
      vigenciaFim: dataBr(o.vigenciaFim),
      limiteResgates: o.limiteResgates ?? "",
    });
  }
  for (let i = 0; i < LINHAS_EM_BRANCO; i += 1) aba.addRow({});

  // --- Aba de referência de soluções ---
  const ref = wb.addWorksheet("Soluções (referência)");
  ref.columns = [
    { header: "ID Solução", key: "id", width: 28 },
    { header: "Aliado", key: "aliado", width: 30 },
    { header: "Nome da Solução", key: "nome", width: 46 },
  ];
  ref.getRow(1).font = { bold: true };
  for (const s of solucoes) {
    ref.addRow({ id: s.id, aliado: s.empresa.nomeFantasia, nome: s.nome });
  }

  // --- Aba de listas (fonte dos menus) ---
  const listas = wb.addWorksheet("Listas");
  listas.columns = [
    { header: "Natureza", key: "natureza", width: 20 },
    { header: "Tipo de Benefício", key: "tipo", width: 24 },
    { header: "Mecânica", key: "mecanica", width: 24 },
    { header: "Modalidade", key: "modalidade", width: 18 },
  ];
  listas.getRow(1).font = { bold: true };
  const naturezas = Object.values(ROTULO_NATUREZA);
  const modalidades = Object.values(ROTULO_MODALIDADE);
  const maxLinhas = Math.max(naturezas.length, tipos.length, mecanicas.length, modalidades.length);
  for (let i = 0; i < maxLinhas; i += 1) {
    listas.addRow({
      natureza: naturezas[i] ?? "",
      tipo: tipos[i]?.nome ?? "",
      mecanica: mecanicas[i]?.nome ?? "",
      modalidade: modalidades[i] ?? "",
    });
  }

  // Menus suspensos (coluna → faixa em "Listas").
  const menus: Array<{ col: number; faixa: string; erro: string }> = [
    { col: 4, faixa: `Listas!$A$2:$A$${naturezas.length + 1}`, erro: "Escolha uma natureza da lista." },
    { col: 5, faixa: `Listas!$B$2:$B$${tipos.length + 1}`, erro: "Escolha um tipo de benefício da lista." },
    { col: 6, faixa: `Listas!$C$2:$C$${mecanicas.length + 1}`, erro: "Escolha uma mecânica da lista." },
    { col: 10, faixa: `Listas!$D$2:$D$${modalidades.length + 1}`, erro: "Escolha uma modalidade da lista." },
  ];
  for (const menu of menus) {
    for (let linha = 2; linha <= LINHAS_COM_VALIDACAO + 1; linha += 1) {
      aba.getCell(linha, menu.col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [menu.faixa],
        showErrorMessage: true,
        errorStyle: "warning",
        error: menu.erro,
      };
    }
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

/**
 * Gerador do modelo `.xlsx` da importação de Assinantes (T20, núcleo).
 *
 * Substitui o CSV plano por uma planilha com **menus suspensos** nas
 * colunas que referenciam dado do sistema — do jeito que o modelo de
 * ofertas já faz —, para o operador escolher em vez de digitar e errar:
 * - **Patrocinador**: "Razão Social — <id>" (o parser casa pelo ID, RN63),
 *   mais `Broto`; a aba de referência lista ID + Razão Social + CNPJ.
 * - **Perfil de assinatura**: os valores que o de-para reconhece.
 * - **Preferência**: agricultura · pecuária · ambos.
 *
 * A linha de exemplo é **SINTÉTICA** (CPF algoritmicamente válido, nunca de
 * pessoa real — regra de PF do CLAUDE.md). Só LEITURA do banco.
 */

import ExcelJS from "exceljs";
import { prisma } from "@/infra/prisma/cliente";
import { CABECALHO_MODELO_ASSINANTES, EXEMPLO_SINTETICO_ASSINANTE } from "@/dominio/assinantes/modelo-importacao";

const LINHAS_EM_BRANCO = 100;
const LINHAS_COM_VALIDACAO = 2000;

/** Perfis que o de-para reconhece (RN63). Vazio também é válido. */
const PERFIS = ["Assinatura Patrocinada", "Assinatura Paga"];
const PREFERENCIAS = ["agricultura", "pecuária", "ambos"];

export async function gerarModeloAssinantesXlsx(): Promise<Buffer> {
  const patrocinadores = await prisma.patrocinador.findMany({
    where: { status: "ATIVO" },
    orderBy: { razaoSocial: "asc" },
    select: { id: true, razaoSocial: true, cnpj: true },
  });

  // Opções do dropdown de Patrocinador: "Razão Social — <id>" (o parser
  // extrai o ID) mais "Broto". A referência com o ID fica na aba própria.
  const opcoesPatrocinador = ["Broto", ...patrocinadores.map((p) => `${p.razaoSocial} — ${p.id}`)];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de gestão do Clube";

  // --- Aba principal ---
  const aba = wb.addWorksheet("Assinantes");
  aba.columns = CABECALHO_MODELO_ASSINANTES.map((header) => ({ header, width: 26 }));
  aba.getRow(1).font = { bold: true };
  aba.views = [{ state: "frozen", ySplit: 1 }];

  // Linha de exemplo SINTÉTICA (a coluna Patrocinador mostra o formato).
  aba.addRow([...EXEMPLO_SINTETICO_ASSINANTE]);
  for (let i = 0; i < LINHAS_EM_BRANCO; i += 1) aba.addRow([]);

  // --- Aba de referência dos patrocinadores (para achar o ID) ---
  const ref = wb.addWorksheet("Patrocinadores (referência)");
  ref.columns = [
    { header: "Código (ID)", key: "id", width: 30 },
    { header: "Razão Social", key: "razao", width: 40 },
    { header: "CNPJ", key: "cnpj", width: 22 },
  ];
  ref.getRow(1).font = { bold: true };
  for (const p of patrocinadores) {
    ref.addRow({ id: p.id, razao: p.razaoSocial, cnpj: p.cnpj });
  }

  // --- Aba de listas (fonte dos menus) ---
  const listas = wb.addWorksheet("Listas");
  listas.columns = [
    { header: "Patrocinador", key: "patrocinador", width: 60 },
    { header: "Perfil de assinatura", key: "perfil", width: 26 },
    { header: "Preferência", key: "preferencia", width: 18 },
  ];
  listas.getRow(1).font = { bold: true };
  const maxLinhas = Math.max(opcoesPatrocinador.length, PERFIS.length, PREFERENCIAS.length);
  for (let i = 0; i < maxLinhas; i += 1) {
    listas.addRow({
      patrocinador: opcoesPatrocinador[i] ?? "",
      perfil: PERFIS[i] ?? "",
      preferencia: PREFERENCIAS[i] ?? "",
    });
  }

  // Menus suspensos por coluna da aba principal (1-indexado).
  // CAMPOS_NUCLEO: 7=Preferência, 8=Perfil de assinatura, 9=Patrocinador.
  const menus: Array<{ col: number; faixa: string; erro: string }> = [
    {
      col: 7,
      faixa: `Listas!$C$2:$C$${PREFERENCIAS.length + 1}`,
      erro: "Escolha agricultura, pecuária ou ambos (ou deixe em branco).",
    },
    {
      col: 8,
      faixa: `Listas!$B$2:$B$${PERFIS.length + 1}`,
      erro: "Escolha um perfil da lista (ou deixe em branco).",
    },
    {
      col: 9,
      faixa: `Listas!$A$2:$A$${opcoesPatrocinador.length + 1}`,
      erro: "Escolha um patrocinador da lista (ou deixe em branco).",
    },
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

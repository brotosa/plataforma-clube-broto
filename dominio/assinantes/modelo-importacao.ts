/**
 * Modelo de REFERÊNCIA da importação de Assinantes (T20, família núcleo) —
 * domínio puro.
 *
 * É a planilha em branco que o operador baixa para saber quais colunas o
 * importador reconhece antes de subir o arquivo do comprador. O mapeador do
 * passo 3 tolera variações de cabeçalho (o dicionário real é
 * `[A CONFIRMAR]`), então este modelo mostra os **rótulos canônicos** —
 * inclusive as colunas da Onda 12 (`Perfil de assinatura` e `Patrocinador`),
 * que criam o perfil e o vínculo de patrocínio na efetivação (RN63).
 *
 * A linha de exemplo é **SINTÉTICA** (CPF algoritmicamente válido, com
 * dígitos formados, nunca de pessoa real — regra de PF do CLAUDE.md).
 */

import { CAMPOS_NUCLEO, ROTULOS_CAMPO_NUCLEO } from "./importacao";

/** Cabeçalho do modelo, na ordem dos campos do núcleo. */
export const CABECALHO_MODELO_ASSINANTES = CAMPOS_NUCLEO.map(
  (campo) => ROTULOS_CAMPO_NUCLEO[campo],
);

/**
 * CSV de referência com uma linha de exemplo sintética. `Patrocinador` traz
 * um nome de exemplo para ilustrar o vínculo; na carga real, o valor precisa
 * bater com um patrocinador já cadastrado (o valor `Broto` vira Promocional
 * Broto, sem vínculo).
 */
export function gerarModeloAssinantesCsv(): string {
  // CPF SINTÉTICO válido (dígitos verificadores conferem) — jamais real.
  const exemplo: Record<(typeof CAMPOS_NUCLEO)[number], string> = {
    cpf: "111.444.777-35",
    nome: "Maria Exemplo (SINTÉTICO)",
    endereco: "Rodovia BR-163, km 100, Zona Rural",
    cep: "78550-000",
    email: "exemplo.sintetico@exemplo.com",
    telefone: "(66) 99999-0000",
    preferencia: "agricultura",
    perfilAssinatura: "Assinatura Patrocinada",
    patrocinador: "Nome do Patrocinador (ou Broto)",
  };
  const linha = CAMPOS_NUCLEO.map((campo) => exemplo[campo]);
  return [CABECALHO_MODELO_ASSINANTES.join(";"), linha.join(";")].join("\r\n") + "\r\n";
}

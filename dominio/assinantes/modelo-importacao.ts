/**
 * Modelo de REFERÊNCIA da importação de Assinantes (T20, família núcleo) —
 * domínio puro.
 *
 * Fornece os **rótulos canônicos** das colunas e uma linha de exemplo
 * SINTÉTICA. O gerador do arquivo em si vive em
 * `infra/assinantes/modelo-importacao-xlsx.ts` (é `.xlsx` com menus
 * suspensos, e precisa do banco para listar patrocinadores) — aqui fica só
 * o que é puro e testável sem banco.
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
 * Valores de exemplo por campo. `patrocinador` mostra o formato do dropdown
 * do `.xlsx` ("Razão Social — código"); na carga real o valor precisa bater
 * com um patrocinador cadastrado (o valor `Broto` vira Promocional Broto,
 * sem vínculo).
 */
const EXEMPLO_POR_CAMPO: Record<(typeof CAMPOS_NUCLEO)[number], string> = {
  // CPF SINTÉTICO válido (dígitos verificadores conferem) — jamais real.
  cpf: "111.444.777-35",
  nome: "Maria Exemplo (SINTÉTICO)",
  endereco: "Rodovia BR-163, km 100, Zona Rural",
  cep: "78550-000",
  email: "exemplo.sintetico@exemplo.com",
  telefone: "(66) 99999-0000",
  preferencia: "agricultura",
  perfilAssinatura: "Assinatura Patrocinada",
  patrocinador: "Escolha da lista (ou Broto)",
};

/** Linha de exemplo, na ordem do cabeçalho. */
export const EXEMPLO_SINTETICO_ASSINANTE = CAMPOS_NUCLEO.map((campo) => EXEMPLO_POR_CAMPO[campo]);

/**
 * CSV de referência com uma linha de exemplo sintética. Mantido para uso
 * fora da tela (testes, referência textual); a tela serve o `.xlsx`.
 */
export function gerarModeloAssinantesCsv(): string {
  return (
    [CABECALHO_MODELO_ASSINANTES.join(";"), EXEMPLO_SINTETICO_ASSINANTE.join(";")].join("\r\n") +
    "\r\n"
  );
}

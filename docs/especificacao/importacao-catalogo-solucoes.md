# Importação de catálogo — Soluções (PR 1)

Importador self-service de **soluções** em massa por planilha, na página
**Aliados & Soluções** (`/aliados` → botão "Importar soluções"). Nasceu de
pedido de uso real: evitar cadastrar solução a solução no formulário.

> **PR 2 (planejado, ainda não implementado):** "Importar oferta" em
> `/ofertas`, referenciando soluções já existentes. Este documento cobre só
> o PR 1.

## Decisões (fechadas com a TI Broto)

- **Chave do aliado = CNPJ** (RN08, único e sempre presente em aliado ativo).
  A oferta não entra aqui; a solução carrega o CNPJ do aliado dono.
- **RN01 preservada:** solução só é criada/editada para aliado em
  `ALIADA_ATIVA`. A efetivação **reaproveita** `criarSolucao`/
  `atualizarSolucao` — nada de regra duplicada, e a auditoria vem de graça.
- **Enriquece o que já existe:** solução casada por CNPJ + nome é atualizada
  (não duplicada). Solução nova é criada.
- **Recusa o arquivo inteiro** quando há qualquer pendência; a conferência
  sinaliza **linha + coluna** e permite **correção leve** ali mesmo.
- **Modelo gerado pela plataforma** (`/aliados/importar-solucoes/modelo`):
  `.xlsx` pré-preenchido com o catálogo atual, com menu de categorias e as
  colunas prontas — o valor de lista é escolhido, não digitado.
- **Sem alteração em tabela povoada:** a migration
  `20260819120000_importar_solucoes` só cria a tabela de staging e um valor
  de enum (`IMPORTA_SOLUCOES`) — estritamente aditiva e reversível.

## Colunas da planilha (aba única)

`CNPJ do Aliado` · `Nome da Solução` · `Descrição Curta` · `Descrição
Completa` · `Categoria` · `Link Externo` · `Culturas Atendidas` (separadas
por `;`) · `Cobertura` (`Nacional` ou lista de UFs por sigla/nome).

## Comportamento por linha

| Situação | Resultado |
|---|---|
| CNPJ ausente / inválido (dígito verificador) | Pendência na coluna CNPJ |
| CNPJ não cadastrado | Pendência "aliado não cadastrado" |
| CNPJ de aliado **não ativo** | Pendência citando a RN01 |
| Nome ausente | Pendência na coluna Nome |
| Categoria / Cultura / UF fora do Parametrizador | Pendência na coluna, nomeando o valor |
| Solução (CNPJ + nome) já existe | **Enriquecer** (atualiza, auditado) |
| Solução nova | **Criar** |
| Mesma solução em duas linhas do arquivo | Pendência "repetida" nas duas |
| Descrição / cobertura vazias | **Não** bloqueiam (régua RN09 fica incompleta) |

## Arquivos

- Domínio puro: `dominio/importacao-catalogo/solucoes.ts` (+ teste).
- Aplicação: `infra/casos-de-uso/importar-solucoes.ts` (importar, conferência
  ao vivo, correção leve, efetivar) (+ teste de integração).
- Modelo `.xlsx`: `infra/importacao-catalogo/modelo-solucoes.ts`.
- UI: `app/(plataforma)/aliados/importar-solucoes/` (`page`, `conferencia`,
  `acoes`, `modelo/route`).
- Schema/migration: `staging_solucoes_importadas` + enum `IMPORTA_SOLUCOES`.

## Fora de escopo

- Não cria **aliado** (ficha e aprovação próprias).
- Não **publica** ofertas nem cria ofertas (PR 2).
- Não altera a Carga inicial nem a importação de telemetria.

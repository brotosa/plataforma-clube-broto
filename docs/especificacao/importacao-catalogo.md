# Importação de catálogo — Soluções e Ofertas

Dois importadores self-service em massa por planilha, para não cadastrar
item a item no formulário:

- **Soluções** — página **Aliados & Soluções** (`/aliados` → "Importar
  soluções"). Cobre as seções abaixo até "Fora de escopo".
- **Ofertas** — página **Ofertas** (`/ofertas` → "Importar ofertas"). Ver a
  seção "Importador de ofertas (PR 2)" ao final.

Ambos seguem o mesmo ritual (baixar modelo pré-preenchido → enviar →
conferência com correção leve → efetivar), reaproveitam os casos de uso do
cadastro manual (auditoria e regras de graça) e recusam o arquivo inteiro
quando há pendência, sinalizando linha + coluna.

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

## Fora de escopo (soluções)

- Não cria **aliado** (ficha e aprovação próprias).
- Não altera a Carga inicial nem a importação de telemetria.

---

# Importador de ofertas (PR 2)

Cria/atualiza **ofertas** em massa na página **Ofertas** (`/ofertas` →
"Importar ofertas"). A oferta **sempre aponta uma solução existente**.

## Formato (aba única + referência)

Colunas da oferta: `ID Oferta` (vazio = nova; preenchido = enriquecer) ·
`ID Solução` (obrigatório) · `Título` · `Natureza` · `Tipo de Benefício` ·
`Mecânica de Resgate` · `Preço De` · `Preço Por` · `Percentual de Desconto (%)` ·
`Código/Regras do Cupom` · `Modalidade de Pagamento` · `Instruções Pós-Voucher` ·
`Vigência Início` · `Vigência Fim` · `Limite de Resgates` ·
`Id Externo (Minutrade)`.

`Percentual de Desconto (%)` (inteiro 1–100) vale para o Tipo "% de desconto"
e substitui os preços. `Id Externo (Minutrade)` é a chave que liga a telemetria
importada à oferta (a coluna `id_oferta` do arquivo casa com ela); a
duplicidade — contra ofertas existentes e entre linhas da própria planilha — é
detectada na conferência, antes de gravar.

O modelo (`/ofertas/importar/modelo`) traz três abas: **Ofertas** (atuais +
em branco, com menus de Natureza/Tipo/Mecânica/Modalidade), **Soluções
(referência)** (ID Solução + Aliado + Nome) e **Listas**. Os IDs são
administrados pela plataforma — o usuário nunca os inventa.

## Comportamento

- **Solução (`ID Solução`) inexistente** → pendência (não cria a oferta).
- **`ID Oferta` preenchido** → enriquecer a oferta (via `atualizarOferta`);
  vazio → criar via `criarOferta`, entrando como **rascunho** (status
  default). **Publicar segue o fluxo normal** (RN02/RN09 + aprovação).
- **Consistência natureza × preço × cupom × modalidade** reusa
  `validarNatureza` — a mesma regra do formulário manual.
- Datas em `dd/mm/aaaa`; preços aceitam `11,90` ou `11.90`.

## Migration

`20260819130000_importar_ofertas` — aditiva: tabela
`staging_ofertas_importadas` + valor de enum `IMPORTA_OFERTAS`. Reversível.

## Arquivos (ofertas)

- Domínio: `dominio/importacao-catalogo/ofertas.ts` (+ teste).
- Aplicação: `infra/casos-de-uso/importar-ofertas.ts` (+ integração).
- Modelo: `infra/importacao-catalogo/modelo-ofertas.ts`.
- UI: `app/(plataforma)/ofertas/importar/`.

## Fora de escopo (ofertas)

- Não cria **solução** nem **aliado** (a solução vem do importador de
  soluções ou do cadastro).
- Não **publica** — a oferta entra como rascunho.

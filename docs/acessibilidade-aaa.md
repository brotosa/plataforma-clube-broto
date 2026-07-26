# Acessibilidade AAA — auditoria da F5

Registro da auditoria de acessibilidade feita no endurecimento (F5) da Onda 1:
o que foi medido, o que foi corrigido, e a única pendência que **não** se
resolve no código.

## Como a auditoria roda

A política do projeto é **AAA**. O `AxeBuilder` padrão cobre A e AA, então a
varredura declara as tags explicitamente e **liga nome a nome as três regras
AAA que o axe-core traz desabilitadas por padrão** — sem isso a suíte
"passava" sem nunca ter testado AAA:

| Regra AAA | Critério | Estado no axe-core |
|---|---|---|
| `color-contrast-enhanced` | 1.4.6 — contraste 7:1 | desabilitada por padrão |
| `identical-links-same-purpose` | 2.4.9 | desabilitada por padrão |
| `meta-refresh-no-exceptions` | 3.2.5 | desabilitada por padrão |

A varredura vive em `semViolacoesAxe` (`e2e/ajudantes.ts`) e é a mesma para
todas as suítes. Ela espera a animação de entrada `.tela` terminar antes de
medir: durante o fade a opacidade ainda não é 1, o navegador **compõe** a cor
do texto com o fundo e o axe mede um valor que não é o que o usuário enxerga
(observado: `#1632F2` lido como `#203af2`). Medir no meio da animação produzia
resultado instável — o critério vale para a tela assentada.

### Cobertura

| Suíte | Telas |
|---|---|
| `fundacao.spec.ts` | `/entrar` e o shell autenticado |
| `fluxo-principal.spec.ts` | T1, T2 (as **sete** abas), T3 (formulário e ficha), T5 (formulário, ficha e edição), T4, T6, T7 e a edição do aliado |
| `carga-inicial.spec.ts` | tela de conferência |
| `integracao.spec.ts` | `/ofertas`, publicação e telemetria |
| `funil-radar.spec.ts` | T8 (kanban e tabela) e T9 |
| `responsividade.spec.ts` | T1/T4/T6 **a 380px** |

Antes da F5 a varredura cobria um subconjunto: as abas da T2 e os formulários
de T3/T5 nunca tinham passado pelo axe.

## O que foi corrigido

### 1. Tokens de texto derivados (contraste 1.4.6)

Os tokens AAA da rodada 2 foram calibrados em ≥7:1 **sobre branco puro**. O
produto, porém, quase nunca pinta texto sobre `#fff`: o fundo real é `--off`
(`#faf9f9`), os fundos de pill (`#f9f7ff`, `#fff7f7`) e a lane do kanban
(`#f0efee`). Nesses fundos os mesmos tokens caíam abaixo do limiar — 130+ nós
reprovados. Foram escurecidos mantendo o matiz da marca:

| Token | Antes | Depois | Pior fundo | Antes → depois |
|---|---|---|---|---|
| `--paragrafo-aaa` | `#5C5950` | `#524F47` | `#f0efee` | 6,10 → 7,12 |
| `--azul-texto-aaa` | `#1735FF` | `#1632F2` | `#f9f7ff` | 6,61 → 7,13 |
| `--erro-texto-aaa` | `#B00000` | `#AE0000` | `#fff7f7` | 6,99 → 7,11 |

Token novo: `--azul-texto-aaa-forte` (`#132BCF`), usado só onde há texto azul
sobre a superfície `--azul-claro` (`#dbe0ff`) — as iniciais do avatar do
header. Ali o token comum ficava em 5,39:1 e, mesmo escurecido, chegaria só a
5,81:1; o token forte alcança 7,09:1.

### 2. Landmarks distinguíveis (`landmark-unique`)

As telas com painel lateral (régua da T3, pré-visualização da T5) têm **dois**
landmarks `complementary`. Sem nome acessível eles ficam indistinguíveis na
navegação por landmarks. Cada um recebeu `aria-label`: "Menu lateral",
"Régua de completude e pré-visualização do card" e "Pré-visualização do card".

### 3. Colapso mobile completo

`data-label` na primeira célula de T1 e do histórico da T6 — a T4 já fazia,
essas duas tinham ficado sem, e no colapso em cards a linha aparecia sem
rótulo. Ver `docs/` do prompt, §Interface, item 1.

## Exceção decidida: o azul institucional

> **Decisão (F5, revisão da TI Broto).** Mantida a **exceção documentada**. O
> produto declara **AAA integral com uma exceção nomeada e justificada — o
> azul institucional da marca, que atende AA**. O DSeed é patrimônio do grupo:
> repintar a superfície interativa inteira não é mudança de engenharia, é
> mudança de identidade visual, e não se faz por *replace* de CSS. A questão
> segue para a próxima revisão do DSeed como item de acessibilidade.

**Superfícies em azul puro da marca (`--azul` `#465EFF`) ficam em 4,87:1.**

Onde aparece: fundo da sidebar com texto branco, botões primários
(`.btn-azul`) com texto branco, e o item ativo da sidebar (azul sobre o pill
branco).

- Passa em **AA** (≥4,5:1) com folga.
- Reprova em **AAA** (≥7:1).
- Elevar para 7:1 **exige escurecer o azul da marca** em toda a superfície do
  produto — sidebar e todo botão primário de todas as telas. Isso é decisão de
  identidade visual, não ajuste de CSS, e por isso **não foi feito**.

> Nota: o comentário original em `dseed-admin.css` justificava o azul puro
> tratando "label 14px bold" como texto grande. Pelo WCAG, texto grande é
> ≥18,66px em negrito (14pt) ou ≥24px normal — 14px em negrito **não** se
> qualifica, então a isenção não se sustenta. O critério aplicável é o de
> texto normal.

A exceção fica **isolada e visível**, no mesmo padrão dos `[A CONFIRMAR]` do
projeto: a constante `AZUL_PURO_DA_MARCA` em `e2e/ajudantes.ts` filtra da
varredura **apenas** os nós cuja assinatura de cor seja esse azul, e **apenas**
para `color-contrast-enhanced`. Qualquer outra regra, e qualquer outro par de
cores, continua reprovando a suíte — o gate não deixou de existir, ele declara
o que foi decidido conscientemente.

### Se a marca decidir AAA pleno: a saída já existe dentro do sistema

O Design derivou, na Onda 6, um azul de superfície que atende AAA:
**`--azul-superficie-aaa` `#3242C4`**. Medido nesta auditoria:

| Par | Razão | AAA (≥7:1) |
|---|---|---|
| branco sobre `#3242C4` (sidebar, `.btn-azul`) | **7,74:1** | ✅ |
| `#3242C4` sobre branco (item ativo da sidebar) | **7,74:1** | ✅ |
| `#3242C4` sobre `--off` `#faf9f9` | **7,37:1** | ✅ |

Ou seja: **é troca de um token, não redesenho**. Quando o dono da marca
decidir, o caminho é apontar o alias `--azul` das *superfícies interativas*
para `#3242C4` em `dseed-admin.css` e remover a exceção
`AZUL_PURO_DA_MARCA` — a suíte AAA passa a cobrir também esses nós, sem
nenhuma outra alteração de código ou de layout.

Encaminhamento: item de acessibilidade na próxima revisão do DSeed.

## Navegação por teclado

`e2e/teclado.spec.ts` cobre o que faltava das telas da Onda 1: abas da T2,
ações da T4, radio-cards de natureza e mecânica da T5 (com os campos
condicionais reagindo às setas) e a fila da T6 (dossiê expansível + decisão).
O interruptor da T7 e o kanban da T8 já tinham prova desde F2/F6. Todos os
testes chegam ao controle só com Tab/Shift+Tab e acionam com
Enter/Espaço/setas — nenhum clique de mouse.

---

# Aferições da Onda 7 (F14)

A F14 acrescentou duas telas (T29, T30), ligou o sino do cabeçalho e mudou a
área de marca do shell. As medições abaixo foram feitas **sobre os fundos
reais de cada elemento**, com a mesma fórmula WCAG 2.x da auditoria da F5, e
não sobre branco puro.

## Estado dos tokens de texto: nada mudou, e isso é o achado

O prompt da Onda 7 §8 previa adotar da entrega do Design quatro derivações
AAA remediadas. Ao conferir, os quatro valores **já estavam idênticos** no
`dseed-admin.css`: a F5 (tokens de texto) e a F13 (superfície do hero)
haviam chegado aos mesmos números por medição independente.

| Token | Valor no repo | Valor na entrega v9.1 | Ação |
|---|---|---|---|
| `--paragrafo-aaa` | `#524F47` | `#524F47` | nenhuma — já adotado (F5) |
| `--azul-texto-aaa` | `#1632F2` | `#1632F2` | nenhuma — já adotado (F5) |
| `--erro-texto-aaa` | `#AE0000` | `#AE0000` | nenhuma — já adotado (F5) |
| `--azul-texto-aaa-forte` | `#132BCF` | `#132BCF` | nenhuma — já adotado (F5) |
| `--azul-superficie-aaa` | `#3242C4` | `#3242C4` | nenhuma — já adotado (F13) |
| `--azul-superficie-hover` | `#2A38A8` | `#2A38A8` | nenhuma — já adotado (F13) |

O cartão do hero que "clareava a superfície azul para uma faixa onde o branco
reprova" também já havia sido corrigido na F13, e o comentário com a medição
está preservado no CSS. A §8 da Onda 7, portanto, virou **conferência**, não
troca — e `tokens.css` seguiu intocado, como sempre.

## Correções novas da F14

### 1. Marcador do sino — `--erro` puro reprovava até em AA

O `.badge-not` nasceu na F1 com `background: var(--erro)` (`#FF0000`) e
**nunca chegou a ser exibido**: o sino era decorativo e não tinha marcador.
Ao ligá-lo (ficha Onda 7 §7), o valor herdado apareceria pela primeira vez.

| Par | Razão | AA (≥4,5:1) | AAA (≥7:1) |
|---|---|---|---|
| branco sobre `--erro` `#FF0000` (antes) | **4,00:1** | ❌ | ❌ |
| branco sobre `--erro-texto-aaa` `#AE0000` (depois) | **7,50:1** | ✅ | ✅ |

O mesmo token já é usado no numeral das linhas do painel (`.not-n`), medido
em 7,50:1 sobre `--branco`.

### 2. Matriz Categoria × cultura — não ampliar a exceção da marca de graça

Os cinco degraus de intensidade da matriz da T29 precisavam de dois fundos
escuros. O protótipo usa `--azul` puro no penúltimo degrau, o que cairia sob
a exceção nomeada da F5 (4,87:1, AA). A exceção existe para as superfícies
que **já nasceram com ela**; ampliá-la sem necessidade seria dívida nova.
Os dois degraus escuros reusam as superfícies AAA que a F13 já derivou:

| Degrau | Fundo | Texto | Razão | AAA |
|---|---|---|---|---|
| `n0` | `--off` `#FAF9F9` | `--paragrafo-aaa` | **7,78:1** | ✅ |
| `n1` | `--azul-lightest` `#F9F7FF` | `--azul-texto-aaa` | **7,13:1** | ✅ |
| `n2` | `--azul-claro` `#DBE0FF` | `--preto` | **12,03:1** | ✅ |
| `n3` | `--azul-superficie-aaa` `#3242C4` | branco | **7,74:1** | ✅ |
| `n4` | `--azul-superficie-hover` `#2A38A8` | branco | **9,42:1** | ✅ |

### 3. Célula de alerta da faixa da T29

`.kpi-cel.alerta .v` usa `--erro-texto-aaa` sobre `--branco`: **7,50:1**.
O `--erro` puro (4,00:1) não é usado como cor de texto em lugar nenhum — a
regra da rodada 2 continua valendo.

## O descritivo da marca sobre o azul da lateral

A ficha §5 manda verificar o contraste do descritivo "Plataforma de
administração" sobre o azul institucional, agora que a área de marca perdeu
o fundo branco.

| Par | Razão | Situação |
|---|---|---|
| `--azul-claro` `#DBE0FF` sobre `--azul` `#465EFF` (o que o protótipo pinta) | **3,74:1** | reprova em AA |
| branco sobre `--azul` `#465EFF` (adotado) | **4,88:1** | exceção nomeada da F5 |

Branco é o **maior contraste possível** sobre este fundo, e é o mesmo par que
o rodapé institucional e os itens da barra lateral já usavam desde a F1. O
descritivo entra, portanto, na exceção decidida do azul institucional — não
cria caso novo. A saída, se a marca decidir AAA pleno, continua sendo a
mesma: apontar o alias das superfícies para `#3242C4`, onde o branco mede
7,74:1.

O valor do protótipo (`--azul-claro`) **não** foi adotado: reprova até em AA,
e a decisão de contraste é do produto, não do arquivo de referência.

## Defeito de teclado encontrado a 380px

A varredura da F14 no viewport de 380px acusou `scrollable-region-focusable`
(impacto *serious*): abaixo de 760px, `.tbl:not(.tbl-resp)` vira
`display:block; overflow-x:auto` — a **tabela** passa a ser a região rolável,
e região que rola precisa ser alcançável por teclado. Sem isso, quem não usa
ponteiro não chega às colunas da direita.

Atingia a matriz Categoria × cultura da T29 (nova) e a matriz de cobertura da
T13 (**pré-existente**, nunca varrida a 380px porque a T13 não estava na
suíte responsiva). As duas receberam `tabIndex={0}`; o nome acessível vem da
`<caption>` que ambas já tinham. Nenhuma mudança de comportamento no ponteiro.

## Cobertura acrescentada

| Suíte | Telas |
|---|---|
| `cobertura-mapa.spec.ts` | T29, T30, shell corrigido, HOME em três camadas e o painel do sino **aberto** |
| `responsividade.spec.ts` | T29 e T30 **a 380px**, mais o painel do sino no estreito |

O painel do sino é varrido com o `role="dialog"` aberto de propósito: um
painel só existe quando está aberto, e varrer a tela com ele fechado mediria
o que ninguém vê.

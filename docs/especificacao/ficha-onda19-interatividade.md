# Ficha de Módulo — Onda 19: Interatividade do Gerador
**Plataforma de Administração e Gestão do Clube Broto** · v0.2 para validação · 18/09/2026

O resultado do Gerador passa a **responder ao clique**: clicar num ponto filtra o resto, descer de nível troca a dimensão por uma mais fina, e o agregado abre nas linhas que o compõem. Regras **RN91–RN93**, duas fases (**F33** e **F34**), **sem tela nova**. Sobre a versão **1.5.0**.

> **Ficha antes do código.** A numeração **RN91–RN93** é proposta, e recusá-la não custa retrabalho.
>
> **A v0.2 registra o que a implementação da RN91 encontrou e a v0.1 não previa:** uma **quarta recusa** (dimensão de data), a decisão de prender o clique à **tabela** e não às marcas do gráfico, e o que ficou de fora da F33. A RN92 e a RN93 seguem sem código.

> **Esta é a terceira das três metades do pedido de "um BI de verdade"** que a TI fez em 17/09. A §7 da ficha da Onda 17 distribuiu o pedido em quatro linhas: escolher o desenho (Onda 17, entregue), painel com vários blocos (Onda 18, entregue), **clicar para filtrar, descer de nível, ver as linhas por trás (esta)**, e distribuir (Onda 20, F28 entregue). É a última que falta, e a única que ainda não tinha ficha.

---

## 1. Por que existe

O Gerador hoje responde **uma** pergunta por vez. Quem vê "São Paulo: 48 ofertas" e quer saber *quais* recomeça: volta ao construtor, arrasta um filtro de UF, roda de novo. A resposta já estava na tela — o que falta é o caminho dela até a próxima pergunta.

É a diferença entre **consultar** e **investigar**, e é o que as pessoas de fato fazem num Power BI: não montam um relatório e o contemplam; clicam, estreitam, descem, voltam.

---

## 2. O que a medição do catálogo mudou nesta ficha

**Antes de escrever a regra, os nove assuntos foram medidos.** A F31 já tinha ensinado que vale a pena: lá, a intenção era um "filtro global" por nome de campo, e a medição mostrou que ele não teria em que pegar — daí a RN89 e os eixos declarados. Aqui aconteceu o mesmo, três vezes.

| O que a §7 da Onda 17 prometeu | O que o catálogo diz | O que esta ficha faz |
| --- | --- | --- |
| Clicar para filtrar | **71 de 71** dimensões usáveis declaram o operador de igualdade | Viável por inteiro (RN91) |
| Clicar numa **lacuna** | **34 de 71** não declaram operador de vazio | Só onde declarado, **dizendo por que não** (RN91) |
| Descer de nível | **Nenhum** dos 9 assuntos declara hierarquia | Exige declaração no catálogo (RN92) |
| Ver as linhas por trás | **5 de 9** têm junção que multiplica linha; **2 de 9** alcançam dado pessoal | Outra consulta, outra contagem, outro alcance (RN93) |

As duas últimas linhas são o motivo de a onda ter **duas fases** e não uma.

---

## 3. Regras

### RN91 — Clicar filtra pelo catálogo, nunca pelo texto que está na tela

Clicar numa barra, numa fatia ou numa célula **acrescenta um filtro** à definição vigente e reexecuta. Três partes, e a terceira é a que a medição obrigou a escrever.

**(a) O que viaja é a chave do campo e o valor bruto, não o rótulo.** O que aparece na tela passou por `rotularDimensao` — "Benefício" na tela é `BENEFICIO` na coluna, e `ROTULOS_RECOMENDACAO` traduz mais meia dúzia. Filtrar pelo texto exibido não acharia nada, e **acharia zero em silêncio**, que é pior: o relatório voltaria vazio e pareceria uma resposta.

**(b) O filtro é montado pelo mesmo caminho do construtor, e revalidado.** A chave do campo e o operador são procurados no catálogo como qualquer filtro digitado; o valor viaja como parâmetro de bind. **Nada aqui é exceção à RN75** — o clique é um atalho para o que a pessoa poderia ter montado à mão, e não uma segunda porta para a consulta. Chave que não esteja no catálogo é **recusada, não ignorada**.

**(c) Lacuna só é clicável onde o campo declara o operador de vazio, e onde não declara a recusa é visível.** A RN53 manda a lacuna aparecer como traço, e ela aparece: metade das dimensões pode ter célula "—". Clicar nela pede *"onde este campo está vazio"*, que é o operador `vazio` — e **34 das 71 dimensões não o declaram**. Onde não houver, o ponto **não responde ao clique e diz por quê**; jamais filtra por texto vazio, que é outra pergunta e devolveria outro número com a mesma cara.

**Quarta recusa, achada na implementação: dimensão de data.** O compilador trata `igual` sobre data como *"naquele dia"*, e deliberadamente — num `timestamp`, `= '18/09'` só casaria com a meia-noite exata. Só que a célula do pivô pode ser um **instante**, e aí o clique alargaria a seleção de um instante para um dia **sem dizer**: o número voltaria diferente do que estava na célula clicada, que é exatamente o que a parte (a) existe para impedir. O catálogo não distingue coluna de data de coluna de instante, então a recusa vale para as duas — conservadora de propósito, e alargá-la depois é aditivo.

**O filtro que o clique acrescenta é removível e visível**, na mesma lista dos filtros digitados. Um filtro que se acumula sem aparecer é como se perde a noção do que se está olhando — e, três cliques depois, ninguém sabe mais que recorte tem na frente.

### RN92 — Descer de nível segue hierarquia declarada, e onde não há, não desce

**Nenhum dos nove assuntos declara hierarquia hoje.** O catálogo tem `grupo`, que é agrupamento do painel de campos ("Oferta", "Aliado", "Sede") e **não** relação de pai e filho: a ordem dentro do grupo é arbitrária, e nada ali diz que UF contém cidade.

Adivinhar a hierarquia a partir do grupo é o defeito que esta regra existe para impedir. Ela pareceria funcionar em "Sede" (UF → cidade) e produziria bobagem em "Oferta", onde status e natureza convivem sem nenhum conter o outro.

**Então a hierarquia é declarada no catálogo, por assunto, como a RN89 fez com os eixos**: uma lista ordenada de campos, do mais grosso ao mais fino, com nome próprio. Descer troca a dimensão pela seguinte **e acrescenta o filtro do valor de onde se desceu** — descer em "São Paulo" e não filtrar por São Paulo mostraria as cidades do país inteiro.

**Campo sem hierarquia declarada não desce, e o ponto não finge que desce.** Assunto sem nenhuma hierarquia não perde nada do que já fazia.

### RN93 — Ver as linhas por trás é outra consulta, com outra contagem e outro alcance

O pivô é agregado. "As linhas por trás" é uma **segunda consulta**, sobre o mesmo assunto e os mesmos filtros, sem agregação. Três consequências, e nenhuma é detalhe.

**(a) A contagem do detalhe pode não bater com o agregado, e quando não bater tem de dizer.** Cinco dos nove assuntos têm junção que **multiplica a linha da raiz** (`aliados`, `funil`, `campanhas`, `patrocinadores`). O agregado já sabe disso — conta pela identidade do assunto, que é o que a marca `multiplica` existe para garantir. O detalhe, não: uma aliada com três soluções sai em três linhas. Uma célula que diz "12 aliados" abrindo em 30 linhas **sem explicação** é a forma mais direta de destruir a confiança no módulo inteiro. O detalhe declara a identidade que o agregado contou e quantas linhas ela ocupa.

**(b) O detalhe é uma escalada de acesso, e a finalidade não se herda.** Dois assuntos alcançam dado pessoal (`assinantes`, `telemetria-resgates`). No agregado, a pessoa é uma unidade dentro de um número; no detalhe, é uma linha com nome. A finalidade declarada para o agregado (RN78) **não vale** para o detalhe: é outro ato, e pede declaração própria — pela mesma razão que fez a RN88 recusar declarar finalidade uma vez na porta do painel. A execução do detalhe é **evento próprio** na trilha, nunca uma nota de rodapé da execução que a originou.

**(c) O detalhe respeita tudo o que o agregado respeita.** O alcance por papel (RN76), o teto de linhas (RN79) e o filtro obrigatório de período da Auditoria valem idênticos — e o último com mais razão, não menos: o teto limita o que volta, e só o filtro limita o que o banco visita.

**O detalhe não é exportável nesta onda.** Os formatos da F28 saem do pivô; fazer o detalhe sair por eles é decisão de outra rodada, e no caso dos dois assuntos de dado pessoal é decisão que não é só técnica.

---

## 4. Tela

**Nenhuma tela nova.** Tudo acontece na T36, sobre o resultado que já existe:

- **O ponto clicável se anuncia.** Cursor, foco visível e nome acessível dizendo o que o clique faz — "filtrar por São Paulo", não "São Paulo". Um gráfico que reage ao clique sem avisar que reage é um gráfico em que ninguém clica.
- **O clique mora na TABELA, e não nas marcas do gráfico.** Decisão da implementação, e a razão é de acessibilidade: o gráfico é `role="img"` com um resumo em `aria-label`, e **filhos de `role="img"` ficam fora da árvore de acessibilidade** — tornar as marcas acionáveis exigiria refazer o modelo que a F27 entregou e testou. A tabela está sempre visível abaixo do desenho (é o que a própria F27 garante ao dizer "a tabela continua abaixo"), é navegável por teclado de graça, e ali cada célula de dimensão vira `<button>`. **Nenhuma função fica só no gráfico**, que é a disciplina da RN57. Clicar na barra fica para quando alguém decidir refazer a a11y do desenho — e isso é troca, não acréscimo.
- **A recusa não desabilita o botão.** Botão desabilitado não recebe foco, e aí o motivo — que é o que a pessoa precisa ler — fica inalcançável por teclado. Ele continua acionável e **responde com a explicação** (RN55), em vez de não acontecer nada.
- **Tudo que o clique faz, o teclado faz.** Mesma disciplina da RN57: nenhuma função existe só no ponteiro. Cada ponto é alcançável por tabulação e acionável por Enter, e descer de nível e abrir o detalhe têm caminho por menu.
- **Os filtros vindos de clique aparecem junto dos digitados**, com origem indicada e removíveis um a um.
- **Voltar um nível** desfaz o último passo, e não a investigação inteira.
- **O detalhe abre abaixo do resultado**, não no lugar dele: perder o agregado de vista tira justamente a referência contra a qual se está conferindo.

---

## 5. Fases

| Fase | O que entrega | Muda o catálogo? | Migration |
| --- | --- | --- | --- |
| **F33** | Clicar para filtrar (RN91) e descer de nível (RN92) | Sim — hierarquias declaradas | Não |

**A F33 foi partida na entrega, e a razão está na pendência 1.** A **RN91 está entregue**; a **RN92 não**, porque descer de nível **exige que alguém diga quais hierarquias existem**, e construir o mecanismo sem nenhuma declarada seria entregar caminho que nunca dispara. Assim que a pendência 1 for respondida, a RN92 é trabalho pequeno: declaração no catálogo mais a troca de dimensão, sobre o mesmo clique que já existe.
| **F34** | Ver as linhas por trás (RN93) | Não | Não |

**São duas porque a segunda tem superfície de risco que a primeira não tem.** A F33 reorganiza a consulta que já roda — mesmo alcance, mesma contagem, mesmo teto. A F34 abre uma consulta **nova**, que devolve linha identificável e, em dois assuntos, gente com nome. Juntá-las numa revisão só faria a parte que precisa de atenção viajar de carona na parte que não precisa.

A F33 exige a F27 e a F31 na main (o pivô e o desenho que respondem ao clique). A F34 exige a F33 — o detalhe abre a partir de um ponto, e é o clique que diz qual.

---

## 6. Pendências declaradas

1. **`[A CONFIRMAR — TI/Superintendência]` Quais hierarquias declarar, e com que nome.** A ficha fixa o mecanismo (RN92), não o conteúdo. As candidatas naturais da medição são geografia (UF → cidade) em `aliados` e `assinantes`, e portfólio (categoria → solução → oferta) em `ofertas`. Hierarquia é decisão de quem usa o relatório, não de quem o programa — e declarar a errada é pior que não declarar nenhuma, porque ela passa a parecer oficial.
2. **`[A CONFIRMAR — Superintendência/jurídico]` O detalhe dos dois assuntos de dado pessoal deve existir?** A RN93 o permite com finalidade própria e trilha própria. A alternativa — o agregado abrir só nos assuntos operacionais — é defensável e mais restritiva. **Enquanto não houver resposta, a F34 entrega o detalhe apenas para os sete assuntos sem dado pessoal**, e os dois exibem o motivo em vez do botão. Recuar depois de liberar seria retirar algo em uso.
3. **Exportar o detalhe fica de fora**, e a decisão é do item anterior antes de ser de engenharia.
4. **Sem limite declarado de profundidade de investigação.** Cada clique acrescenta um filtro, e nada impede dez. Não é risco de banco — os filtros só estreitam —, mas é risco de alguém se perder no próprio recorte. "Voltar um nível" e a lista visível de filtros são o remédio proposto; se não bastarem no uso real, o conserto é de interface e não de regra.

---

## 7. Fora de escopo

Cruzar assuntos diferentes pelo clique (um clique em Ofertas filtrando um bloco de Campanhas) — os assuntos não compartilham campo, que é a medição que gerou a RN89, e fazer o clique atravessar assunto reintroduziria em silêncio exatamente o que aquela regra evitou. Filtro por seleção de área no gráfico. Ordenar por clique no cabeçalho, que é ajuste de tabela e não investigação. E **escrever a própria consulta a partir do detalhe** — é a RN75, e a §7 da ficha da Onda 17 já a recusou por extenso.

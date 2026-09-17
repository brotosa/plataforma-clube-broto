# Ficha de Módulo — Onda 20 (antecipada): Saída do relatório
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 17/09/2026

Extensão da **T36**, sem tela nova. O resultado que hoje só sai em CSV passa a sair também em **HTML calibrado para impressão**, em **XLSX** e pela **área de transferência**. Onda de duas fases: a **F28** entrega os formatos, e a **F29** — que **não** tem via livre — trataria do agendamento e do envio. Sobre a versão **1.7.0**.

> **Ficha antes do código.** Nada foi implementado. A numeração **RN83–RN85** é proposta: a Superintendência pode recusá-la ou renomeá-la sem custo de retrabalho.

> **Onda antecipada, e o número é o de origem.** A §7 da ficha da Onda 17 distribuiu o pedido de "um BI de verdade" entre as Ondas 18 (painel), 19 (interatividade) e 20 (distribuição). Esta é a **20**, trazida para a frente porque foi o que a TI pediu com todas as letras — "quero outros formatos, tipo pdf, html" —, e porque nada nela depende das outras duas: exportar um relatório não precisa de painel nem de clique-para-filtrar. O repositório já tem precedente: a **Onda 5 foi antecipada** e executada na F11, antes da Onda 4. O número é o de origem; a ordem de execução é outra coisa.

---

## 1. Por que existe

O Gerador responde perguntas dentro da plataforma. Mas boa parte do trabalho de quem pergunta acontece **fora** dela: a reunião com o patrocinador, a apresentação para a Superintendência, a planilha que alguém cruza com outra coisa. Hoje o único caminho para fora é o CSV, e CSV é o menor denominador comum — perde o tipo do dado, perde o desenho, perde a pergunta que o originou.

**Nada aqui acrescenta dado.** É o princípio da Onda 16 aplicado uma terceira vez: o mesmo resultado, renderizado de outro jeito.

### O que ele NÃO é

Não é um editor de documento, não é um gerador de apresentação e não é uma segunda porta para o banco. Cada formato é uma **renderização do resultado que a tela já produziu**, pelo mesmo caminho, com as mesmas conferências (RN83).

---

## 2. Entidades

**Nenhuma nova.** Uma coluna acrescida a `ExecucaoRelatorio`:

```
formato  String?   // "CSV" | "HTML" | "XLSX" | "AREA_TRANSFERENCIA", nulo em execução de tela
```

**Estritamente aditiva**, coluna anulável sobre base povoada — o dever de migration da F15 vale integralmente. A coluna `exportou` **permanece**: ela responde "saiu da plataforma?", que continua sendo a pergunta de auditoria, e estreitá-la para caber num enum seria trocar um dado bom por um mais bonito. `formato` responde "saiu **como**?".

Nenhuma linha existente é tocada: execução anterior a esta onda fica com `formato` nulo, e nulo com `exportou = true` significa **CSV**, que era o único que havia.

---

## 3. Regras

### RN83 — O formato é uma renderização, nunca um segundo caminho até o dado

Todo formato passa pelo **mesmo caso de uso** da execução em tela, com a mesma conferência de permissão (RN76), a mesma exigência de finalidade (RN78), o mesmo teto (RN79) e a mesma trilha. É o desenho que a exportação em CSV já tem, e a razão de tê-lo é direta: **cada formato novo é uma chance nova de contornar as três**.

O defeito que esta regra existe para impedir tem nome: uma rota de XLSX que monte a própria consulta "porque a planilha precisa de todas as linhas". No dia em que isso acontecer, o alcance por papel deixa de valer para quem souber pedir em `.xlsx`.

**Cerca de arquitetura**: nenhum caminho de formato importa o compilador, o Prisma ou a consulta diretamente. Formato recebe uma **tabela pronta** e devolve bytes.

### RN84 — O que sai é registrado com o formato, e a cópia conta como saída

Toda geração grava evento com o formato, as linhas, se houve corte e a finalidade quando o assunto a exige.

**A cópia para a área de transferência é saída de dado e conta como tal.** Ela não gera arquivo, não passa por download e não aparece na pasta de ninguém — e é exatamente por isso que a tentação de não registrá-la existe. Do ponto de vista de quem pergunta "o que saiu da plataforma", colar dois mil assinantes numa planilha pessoal é indistinguível de baixá-los. **O que conta é o dado ter saído, não o formato em que saiu.**

Consequência declarada: a cópia **exige finalidade** nos assuntos que a exigem, como qualquer outra saída. Ela é mais rápida, não mais permissiva.

### RN85 — Arquivo cortado diz que foi cortado, por dentro

Estourado o teto da RN79, o arquivo sai **com o aviso dentro dele**, não apenas num cabeçalho HTTP que ninguém vê depois:

- **HTML** — faixa no topo do documento, e ela **imprime** (não é `@media screen`).
- **XLSX** — linha de aviso acima do cabeçalho, na primeira aba, e a aba de procedência com o mesmo dado.
- **CSV** — mantém o comportamento atual (cabeçalho HTTP), porque acrescentar linha de aviso a um CSV quebra quem o consome por máquina. O CSV é o formato de máquina; os outros dois são de gente.

O motivo é o de sempre nesta casa: **arquivo truncado em silêncio é indistinguível de arquivo completo** — e, ao contrário da tela, ele é aberto uma semana depois, por outra pessoa, sem o contexto.

Todo arquivo carrega ainda a **procedência**: o assunto, os filtros aplicados em texto, quem gerou, quando, e a finalidade declarada quando houve. Relatório sem a pergunta que o originou é um monte de número solto.

---

## 4. Os formatos

### HTML — o documento que se imprime

Documento autônomo, com o CSS embutido, no padrão que `scripts/gerar-guia-autonomo.ts` já usa para o Guia da Plataforma. Traz o cabeçalho de procedência, **o gráfico como SVG em linha** (a F27 já o desenha assim — não há renderizador envolvido) e a tabela abaixo.

Calibrado para impressão: a `@media print` da casa já existe em várias telas, e aqui ela define quebra de página entre blocos, repetição do cabeçalho da tabela e supressão do que é de tela.

### PDF — pelo navegador, e a recusa está escrita

**Não há geração de PDF no servidor**, e isso é decisão, não omissão. Gerar PDF no servidor exige um navegador sem cabeça dentro da imagem de contêiner — a mesma imagem que a F18 constrói, testa e publica a cada entrega. Acrescentar Chromium a ela multiplica o tamanho e o tempo da esteira para produzir o que o navegador de quem pede já faz de graça, com melhor resultado, a partir do HTML acima.

**Saída declarada, se um dia for preciso:** PDF no servidor só se justifica quando algo **não humano** precisar do arquivo — anexo de envio automático, por exemplo. Isso é da F29, e entra com ela ou não entra.

### XLSX — a planilha de verdade

O que o CSV perde e esta ganha: **número continua número e data continua data** (sem a reinterpretação que o Excel faz ao abrir CSV), cabeçalho congelado, largura de coluna calculada, aba de procedência separada.

Custo baixo por um motivo apurado, não suposto: **`exceljs` já é dependência do repositório** e já é usada para *escrever* planilha em `infra/assinantes/modelo-importacao-xlsx.ts`, além de ser lida em mais de meia dúzia de pontos. Não há dependência nova, nem padrão novo.

**O gráfico não vai no XLSX.** ExcelJS embute imagem, não SVG, e converter exigiria rasterizador — o mesmo custo do PDF, pelo mesmo motivo, com menos retorno. Planilha é dado; quem quer o desenho usa o HTML. É a frase que a ficha da Onda 17 §4 já aplicava ao CSV.

### Área de transferência — o formato sem arquivo

Copia o resultado como **TSV**, que cola direto em Excel, Sheets e no corpo de um e-mail com a estrutura preservada. É o caminho mais curto entre a pergunta e a planilha de quem perguntou, e não deixa arquivo em lugar nenhum.

Sujeito à RN84 como qualquer outra saída.

---

## 5. Telas

### T36 — o que muda

O botão **"Exportar (CSV)"** vira um **menu de saída** com quatro itens: Abrir para impressão (HTML) · Planilha (XLSX) · Copiar · CSV. O CSV permanece, com o mesmo comportamento, e continua sendo o primeiro da lista para quem já o usa.

O estado de "gerando" é o que já existe hoje.

**Nada muda** na galeria, nas gavetas, nos filtros, no gráfico ou no alternador.

---

## 6. Fases

### F28 — os três formatos

HTML, XLSX, cópia, a coluna `formato`, a cerca da RN83 e os avisos da RN85. Pré-requisito: F24–F27 na main.

**É a primeira fase funcional com migration desde a F19**, e a migration é de uma coluna anulável. O dever de migration estritamente aditiva sobre base povoada vale integralmente.

### F29 — agendar e enviar: **NÃO tem via livre, e esta ficha não a abre**

Dois bloqueios, e nenhum deles é técnico de resolver aqui:

**1. Não existe infraestrutura de e-mail na plataforma.** Verificado: não há `nodemailer`, não há cliente de SES, não há remetente configurado, não há nada. `[A CONFIRMAR — TI]`: qual provedor, qual domínio remetente, o que se faz com devolução e com marcação de spam. Nada disso é decisão de código.

**2. Enviar relatório por e-mail é decisão de negócio, não funcionalidade.** Um relatório agendado de Assinantes **carrega dado pessoal para fora da plataforma, periodicamente, sem ninguém apertando nada** — e a finalidade da RN78, que hoje é declarada por uma pessoa no momento em que pede, passaria a ser declarada uma vez e repetida indefinidamente por uma rotina. Isso muda a natureza do controle, não a sua forma. `[A CONFIRMAR — Superintendência/jurídico]`.

A infraestrutura de agendamento, essa sim, já existe: o job diário roda por rota própria (`app/api/jobs/diario/route.ts`) e é o lugar natural. Mas ter onde pendurar não é motivo para pendurar.

---

## 7. Pendências declaradas — o que esta ficha NÃO resolve

1. **O teto da RN79 na saída.** 5.000 linhas por padrão, 50.000 no máximo. Para HTML, 50.000 linhas é um documento que trava o navegador ao imprimir; para XLSX, é confortável. **Teto por formato** é proposta desta ficha e precisa de número: sugerido 5.000 para HTML, o teto cheio para XLSX e CSV. Não implementar nada até haver número validado.
2. **Cópia em navegador sem permissão de área de transferência.** A API exige contexto seguro e, em alguns navegadores, gesto do usuário. Havendo recusa, a saída é oferecer o TSV num campo selecionável — nunca falhar em silêncio (RN55).
3. **Nome do arquivo.** Hoje é `relatorio-<assunto>-<data>`. Relatório salvo poderia usar o próprio nome, que é mais útil para quem recebe — e mais revelador, porque nome de arquivo viaja em anexo e em pasta compartilhada. Decisão da Superintendência.
4. **O HTML não é acessível offline ao leitor de tela da mesma forma que a rota.** O documento autônomo do Guia já resolveu isso uma vez; convém reusar a mesma abordagem, não inventar outra.

---

## 8. Fora de escopo

Envio por e-mail e agendamento (F29, bloqueada acima). Geração de PDF no servidor. Exportação do gráfico como imagem. Apresentação em slides. Integração com Google Sheets ou OneDrive. Marca d'água. Assinatura digital de documento.

E, explicitamente: **exportação que não passe pelo caso de uso** — em nenhuma hipótese, por nenhum formato, por nenhuma pressa (RN83).

# Ficha de Módulo — Onda 17: Visualização do Gerador
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 17/09/2026

Extensão da **T36**, sem tela nova e **sem migration**. O resultado que hoje só sai em tabela passa a poder ser desenhado: sete tipos de visualização, ajustes por tipo, e as recusas que impedem o desenho de afirmar o que o número não sustenta. Onda de **uma fase (F27)**. Sobre a versão **1.6.0**.

> **Ficha antes do código, como manda o rito da casa.** Nada foi implementado. A numeração **RN80–RN82** é proposta: a Superintendência pode recusá-la ou renomeá-la sem custo de retrabalho.

> **O pedido de origem foi maior que esta ficha.** A TI pediu, em 17/09, que o Gerador se comparasse a um Power BI. A resposta honesta está na §7: parte disso é alcançável e está distribuída entre esta onda e as três seguintes; parte é **deliberadamente recusada**, porque desfaria as garantias que fazem o módulo poder tocar a carteira de assinantes.

---

## 1. Por que existe

A F24 entregou tabela, e tabela responde à maioria das perguntas. Mas há uma classe de pergunta em que a tabela responde mal: **comparação de grandeza**. "Qual aliado tem mais ofertas" é uma coluna de números que a pessoa lê linha a linha e compara de cabeça; em barras, a resposta é imediata e não exige leitura.

O Gerador já tem tudo de que um gráfico precisa. A prévia produz uma tabela pivotada — linhas, colunas e medidas. **Gráfico não é dado novo: é a mesma tabela desenhada de outro jeito.** É exatamente o princípio da Onda 16, aplicado uma vez mais: não acrescenta, reorganiza.

### O que ele NÃO é

Não é um editor de gráficos. Não há canvas livre, não há eixo secundário, não há linha de tendência, não há anotação sobre o desenho, não há cor escolhida ponto a ponto. **O tipo e os ajustes saem de uma lista fechada**, pelo mesmo motivo que os campos saem do catálogo (RN75): o que se oferece é composição, não uma linguagem.

E não é um substituto da tabela. A tabela **continua sempre visível** — ver §3, RN81.

---

## 2. Entidades

**Nenhuma.** A definição do relatório já é JSONB (`RelatorioSalvo.definicao`), e o bloco de visualização entra nela. É a razão de esta onda não ter migration, e é uma boa razão para ela vir antes das outras três.

O bloco proposto, dentro da definição:

```
visualizacao: {
  tipo: "TABELA" | "BARRAS" | "COLUNAS" | "LINHA" | "AREA" | "ROSCA" | "NUMERO",
  ajustes: { ... }   // só as chaves que o tipo admite
}
```

Ausente = `TABELA`. **Todo relatório salvo antes desta onda continua abrindo igual**, sem migração de dados e sem backfill.

---

## 3. Regras

### RN80 — O tipo é escolhido de uma lista fechada, e a lista depende da forma

Sete tipos, e nenhum deles é livre. O que está montado nas gavetas decide quais fazem sentido:

| Forma montada | Tipos que servem |
| --- | --- |
| 1 dimensão + 1 medida | Barras, Colunas, Rosca, Tabela |
| 1 dimensão de **data** + 1 medida | Linha, Área, Colunas, Tabela |
| Linhas × colunas + 1 medida | Colunas agrupadas, Colunas empilhadas, Tabela |
| Nenhuma dimensão + 1 medida | Número grande, Tabela |
| 2+ medidas | Tabela, Colunas (uma série por medida) |

**Tipo que não serve aparece apagado, com o motivo** — a mesma disciplina do campo indisponível da RN77, aplicada ao desenho. Sumir seria pior: quem não vê o tipo conclui que ele não existe.

Os ajustes são por tipo, e cada tipo mostra só os seus: orientação e ordenação e Top-N em barras; empilhado e 100% em colunas cruzadas; marcadores e acumulado em linha; limite de fatias em rosca; formato e comparação em número grande; rótulos de dado em todos.

### RN81 — O gráfico entra ACIMA da tabela, nunca no lugar dela

A tabela permanece visível abaixo do desenho, com os mesmos números. Três razões, e a terceira sozinha bastaria:

1. **Acessibilidade sai de graça.** A alternativa textual de um gráfico é uma tabela de dados — e ela já está ali. Sem isso, cada tipo novo exigiria uma descrição textual própria, que envelheceria separada do desenho.
2. **Gráfico não dá para copiar.** Quem precisa do número exato o lê na tabela; quem precisa da forma olha o desenho.
3. **Gráfico convence antes de ser lido.** A tabela ao lado é o contrapeso: ela deixa conferir o que a forma sugeriu.

Cor **nunca é o único canal**: série se distingue também por rótulo, e ausência por hachura (RN82).

### RN82 — O desenho não afirma o que o número não sustenta (herda RN50, RN53 e RN43)

Quatro recusas, cada uma com a causa escrita (RN55):

**Lacuna não é zero.** Cruzamento sem registro é desenhado como **hachura vazia com um traço**, nunca como barra de altura zero. Zero afirma "nenhum"; a verdade é "não há registro". A tabela já faz isso com o "—" (RN53); o gráfico passa a fazer o equivalente visual.

**Resultado truncado não vira gráfico.** Estourado o teto da RN79, o desenho é recusado e a tabela permanece. Um gráfico sobre resultado cortado é mentira visual: a barra mais alta pode nem estar no desenho, e ninguém vê o que ficou de fora. A mensagem oferece o caminho — estreitar o filtro ou exportar.

**Níveis de atribuição diferentes não dividem eixo** (RN43). "Resgates · por oferta" e "Conversão % · por público" medem coisas diferentes; lado a lado na mesma escala viram um número só. Na tabela convivem porque o rótulo está colado em cada valor; num eixo comum, não há onde colar.

**Rosca tem teto de fatias.** Acima de seis categorias ela deixa de ser legível e a fatia pequena some. O tipo é recusado com o número de categorias encontradas, e a sugestão é Top-N em barras.

---

## 4. Telas

### T36 — o que muda

**Um alternador no cabeçalho do painel de prévia:** Tabela · Barras · Colunas · Linha · Área · Rosca · Número. O tipo vigente fica marcado; os indisponíveis, apagados com o motivo no `title`.

**Um painel de ajustes**, à direita do desenho, com os controles do tipo escolhido. Fechado por padrão em telas estreitas.

**O desenho, e a tabela abaixo dele.** A 380px o gráfico ocupa a largura inteira e o painel de ajustes vira uma linha acima dele.

**Nada muda na galeria, nas gavetas, nos filtros ou na exportação em CSV.**

### O que o gráfico faz na exportação

Na exportação em CSV, nada — CSV é dado, não desenho. Quando a Onda 20 trouxer a saída em HTML/impressão, o gráfico vai junto, acima da tabela, como está na tela.

---

## 5. Fase

**F27 — a onda inteira.** Sem migration, sem entidade, sem tela nova, e sem decisão de negócio pendente. É a razão de ela vir antes das Ondas 18, 19 e 20.

Pré-requisito: F24–F26 na main (o motor, os nove assuntos e o pivô).

**O grosso do esforço é o desenho em SVG escrito à mão.** O `CLAUDE.md` proíbe biblioteca de componentes de terceiros, e a proibição vale aqui: seis tipos de gráfico desenhados à mão, com eixos, escala e rótulos que não colidem. Não há risco conceitual nesta onda — há trabalho.

---

## 6. Pendências declaradas — o que esta ficha NÃO resolve

1. **A paleta das séries.** A proposta reusa as cores de assunto da F25/F26, que são escuras o bastante para receber texto. Se Design quiser paleta própria para séries, é decisão dele e não muda o resto.
2. **Rosca é a única forma de parte-do-todo proposta, e pizza fica fora.** Pizza com muitas fatias mente, e a fatia ausente é invisível — o oposto da RN53. Se a Superintendência quiser pizza, entra com o mesmo teto de fatias da rosca.
3. **Não há exportação do gráfico como imagem.** Quem precisar, imprime (Onda 20) ou captura a tela. PNG no servidor exigiria renderizador em produção, e o custo não se justifica por um botão.
4. **Ordenação do eixo em campo de lista fechada.** Hoje o compilador ordena pela medida; para "Situação" ou "Estágio", a ordem natural é a do funil, não a do número. Fica como ajuste manual nesta onda; ordem canônica por enum é assunto do catálogo, em outra.

---

## 7. O pedido de "um BI de verdade" — o que cabe e o que não cabe

A TI pediu, em 17/09, que o Gerador se compare a um Power BI. A resposta tem duas metades, e as duas são honestas.

### O que é alcançável, e onde está

| Capacidade | Onda |
| --- | --- |
| Escolher o tipo de gráfico, ajustar o desenho | **17 (esta)** |
| Painel com vários blocos, filtro global, compartilhar | 18 |
| Clicar para filtrar, descer de nível, ver as linhas por trás | 19 |
| Agendar, enviar, exportar em HTML/PDF, XLSX e cópia | 20 |

Isso é o grosso do que a maioria das pessoas de fato usa num Power BI.

### O que é recusado, e por quê

**Modelo semântico livre, DAX, importar planilha de fora, juntar qualquer tabela com qualquer tabela.** Não é limitação técnica — é a **RN75**, e é o que faz o módulo ser seguro. No dia em que alguém puder escrever a própria consulta, o alcance por papel (RN76), a finalidade obrigatória (RN78) e a trilha (RN78) param de valer, porque as três dependem de a consulta ser montada pelo catálogo.

### O que o Gerador já faz melhor

Num Power BI, quem monta o relatório enxerga o conjunto inteiro, e a governança é um segundo produto que alguém precisa configurar e manter. Aqui, **cada consulta já roda com a permissão de quem abre**, dado pessoal **já exige finalidade declarada**, e toda execução **já está na trilha**. Não é acessório: é o motivo de o módulo poder tocar a carteira de assinantes sem virar um problema jurídico.

O Gerador não é um Power BI mais fraco. É **BI governado por dentro do produto**, onde o número já nasce certo e o acesso já nasce registrado.

---

## 8. Fora de escopo

Canvas livre, eixo secundário, linha de tendência, previsão, anotação sobre o desenho, cor ponto a ponto, mapa geográfico, e qualquer visualização que exija dado que o catálogo não tenha. Os quatro primeiros são editor de gráficos; o mapa já existe na T30, com regra própria (RN52), e trazê-lo para cá duplicaria a definição de cobertura que a RN51 mantém em fonte única.

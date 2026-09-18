# Ficha de Módulo — Onda 18: Painel de relatórios
**Plataforma de Administração e Gestão do Clube Broto** · v0.2 para validação · 18/09/2026

Tela nova (**T37**): vários relatórios lado a lado, numa página que se abre de uma vez. Três fases — a **F30** entrega o painel e os blocos; a **F31**, o filtro que atravessa os blocos; a **F35**, a edição do painel. Sobre a versão **1.5.0**.

> **Ficha antes do código.** A numeração **RN86–RN89** é proposta: a Superintendência pode recusá-la ou renomeá-la sem custo de retrabalho. A **RN94**, acrescentada na v0.2, também.

> **A v0.2 nasce de uma semana de uso, e acrescenta a §8.** A F30 e a F31 estão entregues. O que o uso mostrou é que "Pôr no painel" criando **painel novo de um bloco** — decisão declarada e correta na F30 — produz, na mão de quem usa, **quatro painéis de um bloco** em vez de um painel de quatro: o oposto do que a §1 diz que esta onda existe para fazer. A §8 fecha isso, e a §8.1 registra dois defeitos da F30 corrigidos antes dela.

> **Uma descoberta do levantamento muda o desenho desta onda, e está na §3.1.** O "filtro global" que um Power BI oferece **não tem em que pegar aqui**: os nove assuntos quase não compartilham campo — `aliado-uf` aparece em dois, `solucao-nome` em dois, e é só. Um filtro global por nome de campo se aplicaria a quase nada e, pior, **se aplicaria em silêncio a uns blocos e não a outros**. A solução proposta é outra, e é a mesma disciplina da RN51 e da RN63: **eixo declarado**, não coincidência de nome.

---

## 1. Por que existe

O Gerador responde uma pergunta por vez. Mas a maior parte do trabalho de acompanhamento é **um conjunto de perguntas que se olha junto, sempre as mesmas**: quantas ofertas publicadas, quantos prospects em cada estágio, quantas campanhas ativas. Hoje isso são seis abas abertas à mão, toda segunda-feira.

**Nada aqui acrescenta dado nem indicador.** O painel **compõe relatórios que a pessoa já podia executar**, e nenhum bloco mostra número que ela não alcançasse sozinha. É o princípio da Onda 16 aplicado uma quarta vez.

### O que ele NÃO é, e esta distinção é a mais importante da ficha

**O painel não é o Dashboard (T26), e não o substitui.**

| | Dashboard (T26) | Painel (T37) |
| --- | --- | --- |
| De quem é | Da instituição | De quem o montou, ou do time |
| O que mostra | Indicadores **de ficha validada** (RN50) | Relatórios que a pessoa já podia executar |
| Quem decide o conteúdo | A Superintendência, por ficha | Quem monta |
| Indicador novo | Exige ficha antes do código | Não existe: só recompõe o que há |

**A RN50 continua valendo integralmente**, e o painel não é uma porta para contorná-la: ele não pode exibir um indicador que não seja o resultado de um relatório do catálogo. Se alguém quiser um número novo na HOME, o caminho continua sendo ficha validada — não um painel pessoal que vire hábito e depois vire pedido.

---

## 2. Entidades

### `Painel`

```
id, nome, autorId, visibilidade (PRIVADO | TIME), criadoEm, atualizadoEm
blocos  Json   // a lista de blocos, na ordem em que aparecem
filtro  Json?  // o filtro do painel (F31); ausente antes dela
```

### O bloco, dentro do JSONB

```
{ titulo, definicao, visualizacao, largura: "INTEIRA" | "METADE" }
```

**O bloco guarda a própria definição, e não uma referência ao relatório salvo.** Três razões, e a terceira é a que decide:

1. **Previsibilidade.** Com referência, editar um relatório mudaria calado todo painel que o usa — inclusive painéis de outras pessoas.
2. **Simetria com o que já existe.** `RelatorioSalvo.definicao` já é JSONB revalidado a cada leitura; o bloco é a mesma coisa, no mesmo lugar.
3. **Visibilidade.** Um painel compartilhado com o time que referenciasse um relatório **privado** do autor quebraria para todos os outros — `abrirRelatorio` recusa relatório privado alheio, e com razão. Copiar a definição resolve isso sem afrouxar nada: o que continua sendo conferido, a cada abertura e por bloco, é o **alcance do assunto** (RN76).

**Consequência declarada:** "Pôr no painel" **copia**. Mudar o relatório depois não muda o bloco, e a tela diz isso ao copiar.

### `ExecucaoRelatorio` ganha uma coluna

```
painelId String?  // de qual painel veio esta execução
```

**Estritamente aditiva**, anulável, sem backfill. Existe para a trilha poder ser lida: sem ela, abrir um painel de oito blocos aparece como **oito consultas soltas** feitas no mesmo segundo, e quem for reconstituir um acesso não consegue distinguir isso de alguém varrendo a plataforma à mão.

---

## 3. Regras

### RN86 — O painel compõe; ele não consulta, não calcula e não inventa indicador

Cada bloco é **uma execução de relatório**, pelo mesmo caso de uso, com a mesma conferência de permissão (RN76), a mesma exigência de finalidade (RN78), o mesmo teto (RN79) e a mesma trilha. O painel não tem consulta própria, não soma bloco com bloco e não deriva nada de dois blocos juntos.

Herda a RN83 na forma: **o painel é uma renderização**, não um segundo caminho até o dado.

### RN87 — Bloco fora do alcance recusa sozinho; o painel não cai junto

Um painel compartilhado com o time pode conter bloco de assunto que quem abre **não alcança**. Nesse caso:

- o **bloco** exibe a recusa com a mensagem que a plataforma já usa (RN76);
- os **demais blocos carregam normalmente**;
- o painel **não** é escondido, e **não** falha inteiro.

Esconder o painel ensinaria que ele não existe; falhar inteiro tiraria de quem abre os blocos que ele legitimamente alcança. A conferência é **por bloco, na abertura, com a permissão de quem abre** — nunca a de quem montou.

### RN88 — Bloco de dado pessoal NÃO carrega sozinho

Este é o ponto onde um painel destruiria a RN78 sem que ninguém percebesse.

Se um bloco alcança dado pessoal (hoje, Assinantes), ele **não executa ao abrir o painel**. Exibe o estado "declare a finalidade para carregar", e só então roda — **por bloco, a cada abertura**, nunca uma declaração única na entrada do painel.

**O motivo é o que a finalidade significa.** Ela existe para atar o acesso a dado pessoal a um ato deliberado de uma pessoa, registrado. Um painel que a pedisse uma vez na porta a transformaria em cerimônia de entrada, repetida sem leitura toda manhã — e cerimônia sem proteção **ensina a ignorá-la**, que é o argumento que a própria ficha da Onda 16 usou para *não* exigir finalidade nos assuntos operacionais.

E num painel compartilhado seria pior: quem abre declararia finalidade para a pergunta de outra pessoa.

### RN89 — O filtro do painel se aplica por EIXO DECLARADO, e onde não se aplica, diz (F31)

Os assuntos não compartilham campo — está medido: dos nove, `aliado-uf` aparece em dois e `solucao-nome` em dois. Um filtro por nome de campo se aplicaria a quase nada.

**O filtro do painel age sobre um conjunto fechado de eixos**, e cada assunto declara **no catálogo** qual campo seu responde a cada eixo:

| Eixo | Exemplo de declaração |
| --- | --- |
| **Período** | Funil → `empresa-entrada-radar` · Auditoria → `au-data` · Campanhas → `campanha-vigencia-inicio` |
| **UF** | Ofertas → `aliado-uf` · Funil → `empresa-uf` · Assinantes → `as-uf` |

**Assunto que não declara o eixo não é filtrado, e o bloco DIZ isso** — uma linha no cabeçalho do bloco: "o período do painel não se aplica a este bloco". Nunca em silêncio.

O silêncio é o defeito que esta regra existe para impedir, e ele é grave: dois blocos lado a lado, um filtrado e outro não, **parecem** responder à mesma pergunta. Quem olha compara os dois números e tira uma conclusão que nenhum deles sustenta.

**Assinantes é o caso que prova a necessidade do eixo declarado.** A única data dela é `as-vencimento`, que é **futura** — quando a assinatura vence. Amarrá-la a um eixo "período" que, na Auditoria, significa "quando aconteceu" produziria dois filtros com o mesmo rótulo e sentidos opostos. A proposta é que Assinantes **não declare o eixo Período**, e o bloco diga.

---

## 4. Telas

### T37 — Painel

**Galeria de painéis**, no mesmo padrão da galeria de relatórios: "Meus" e "Do time".

**O painel aberto:** título, o filtro (F31) e os blocos em grade de duas colunas — cada bloco com título, o desenho ou a tabela, e o rodapé com a procedência curta. Largura por bloco: inteira ou metade.

**Cada bloco carrega por conta própria.** Oito blocos não podem fazer a página esperar pelo mais lento: cada um tem o próprio estado de carregamento, e o painel é usável enquanto os demais chegam.

**Montar** é escolher relatórios salvos e ordená-los. Entrada contextual na T36: "Pôr no painel", que **copia** a definição e avisa que copia.

**A 380px** a grade vira coluna única, e o filtro vira uma linha acima dos blocos.

**O painel aberto tem um segundo estado, o de edição (F35)** — mesma rota, segunda chave de query. Está na §8.

### T36 — o que muda

Só a entrada "Pôr no painel". Nada mais — até a F35, em que ela passa a **perguntar o destino** (§8.4).

---

## 5. Fases

### F30 — o painel e os blocos

Entidade, galeria, montagem, execução por bloco, RN86, RN87, RN88, a coluna `painelId` e a cerca de arquitetura. **Sem o filtro**: cada bloco usa os filtros que já tem na própria definição.

Pré-requisito: F24–F28 na main.

### F31 — o filtro do painel

Os eixos no catálogo (declaração por assunto), a aplicação e — a parte que mais importa — **o aviso de não aplicação**, por bloco.

Vem depois de propósito: a F30 é útil sozinha, e a F31 carrega toda a decisão conceitual desta onda. Separadas, uma recusa na F31 não devolve a F30.

### F35 — a edição do painel

A §8 inteira. Pré-requisito: F30 e F31 na main. **Sem migration** — o que muda é o conteúdo do JSONB que já existe, e nenhuma coluna nova.

Vem separada das duas porque nasceu de uso, e não de escopo planejado: as duas primeiras responderam "o painel existe e filtra"; esta responde "o painel muda de forma depois de pronto".

---

## 6. Pendências declaradas

> **As duas que bloqueavam a F31 foram fechadas em 18/09.** Restam as duas de baixo, que não bloqueiam nada.

1. ~~**Quantos blocos no máximo.**~~ **FECHADA em 18/09 pela TI: teto de 12.** Cada bloco é uma consulta, e a recusa nomeia o número (RN55). É constante nomeada — apertar ou afrouxar depois não é migration.
2. ~~**Os eixos da F31.**~~ **FECHADA em 18/09 pela TI: dois eixos — Período e UF.** "Aliado" e "Categoria" ficam de fora desta onda. Acrescentar um eixo depois custa **uma declaração por assunto** e nenhuma mudança de estrutura, o que é justamente o motivo de o desenho ser por eixo declarado e não por nome de campo.
3. **Atualização automática.** O painel não se atualiza sozinho: recarregar é da pessoa. Auto-refresh transformaria cada painel aberto e esquecido numa aba disparando consultas indefinidamente.
4. **Exportar o painel inteiro.** A F28 exporta um relatório. Exportar um painel em HTML é natural e **não está nesta onda** — entra quando alguém pedir, e é pequeno.

---

## 7. Fora de escopo

Bloco de texto livre, imagem ou vídeo no painel. Bloco que combine dois assuntos. Alerta por limiar. Comentário sobre bloco. Painel público sem autenticação. Atualização automática. Qualquer indicador que não venha de um relatório do catálogo — isso é RN50, e o caminho dela é ficha validada.

---

## 8. Edição do painel (F35) — acrescentado na v0.2

### 8.1 Errata sobre a F30: dois defeitos que o uso encontrou

Os dois foram corrigidos antes desta fase, e ficam registrados porque nenhum dos dois é erro de digitação — os dois são fio que a F30 deixou solto ao entregar a criação sem a edição.

**(a) O painel nascia sempre privado.** O seletor de visibilidade da T36 fica ao lado dos dois botões e governava só o "Salvar": "Pôr no painel" não passava a escolha adiante, e a gravação caía no padrão `PRIVADO`. Quem escolhia **Do time** recebia um painel privado, **e nada na tela dizia isso** — a galeria, que exibe a visibilidade corretamente, mostrava "Só eu" para todos. O aviso de criação passou a **declarar quem vê**: a escolha errada aqui é silenciosa nos dois sentidos, e publicar para o time sem querer é tão ruim quanto montar um painel que ninguém mais abre.

**(b) Não havia como apagar.** A regra estava escrita — só o autor apaga, inclusive contra quem tem acesso total, com evento de ato na trilha antes da exclusão — e **nenhuma tela a chamava**. O botão entrou na galeria.

### 8.2 RN94 — O painel se edita, e quem edita é quem o montou

**A edição é do autor, e só dele — inclusive num painel Do time, e inclusive para quem tem acesso total.** É a mesma decisão que a exclusão do painel e a do relatório salvo já tomaram, e pelo mesmo motivo: o painel é a pergunta de uma pessoa, e um painel do time que mudasse de forma sob os pés de quem o abre produziria a situação em que alguém volta na segunda-feira e o painel é outro, sem nada na tela explicando.

**Fechado até haver pedido, e não aberto até haver objeção.** Liberar a edição compartilhada depois não custa nada a ninguém; recuar depois de liberar seria retirar algo já em uso. É o mesmo raciocínio da RN93 sobre os assuntos de dado pessoal.

**Editar grava, e a gravação é auditada** com valor anterior e novo, como a criação já é. Os blocos inteiros vão para a trilha, e não a contagem deles: é a definição de cada um que diz o que aquele painel dava a ver.

**Cada bloco é revalidado contra o alcance de quem grava (RN76), a cada gravação — não só na criação.** Sem isso, bastaria montar o painel enquanto se tinha o papel e editá-lo depois de perdê-lo: a leitura continuaria protegida, mas o painel viraria um jeito de saber **que assuntos existem** fora do próprio alcance, que é justamente o que a RN76 esconde.

**O teto de 12 blocos vale na edição**, com a recusa nomeando o número (RN55). Um teto que só valesse na criação não é um teto.

**Remover bloco não apaga execução.** A trilha da RN86 continua apontando para o painel: o que foi consultado foi consultado, e a RN49 não se apaga por edição de tela.

**Painel pode ficar sem bloco nenhum, e a tela diz que está vazio.** Recusar a remoção do último prenderia quem quer trocar todos os blocos — teria de apagar o painel e refazê-lo, perdendo nome, visibilidade e filtro. A galeria já sabe exibir "0 blocos".

### 8.3 Ordenar é por botão, não por arrasto

**A lição da RN57 aplicada na ordem certa.** Lá, o arrasto foi acrescentado a um menu que já existia, e a regra que sobrou foi: *nenhuma função existe apenas no arrasto*. Aqui o caminho por teclado **nasce primeiro** — subir e descer, com nome acessível dizendo o destino —, e o arrasto, se um dia vier, é acréscimo.

O inverso teria custado uma fase de acessibilidade para consertar.

### 8.4 "Pôr no painel" passa a perguntar o destino

Painel novo, **ou um dos painéis do próprio autor**. Não os painéis do time de outras pessoas: ele não pode editá-los, e oferecer um destino para depois recusar a gravação é pior que não oferecer.

É esta a metade que resolve os quatro cartões repetidos. A outra — reordenar e dar largura ao que se acrescentou — é a tela de edição, e as duas entram juntas porque uma sem a outra não serve: acrescentar sem poder ordenar produz painel que cresce só para baixo.

### 8.5 O filtro do painel passa a ser editável, e isso fecha a pergunta da F31

A F31 exibiu o filtro **sem deixar editar**, com a pergunta declarada em código: *a mudança vale só para esta sessão ou para todo mundo que abre?*

**Resposta: para todo mundo, porque é gravada.** O filtro é atributo do painel, como o nome e a visibilidade, e quem o muda é o autor, no mesmo ato auditado das demais mudanças.

**A outra leitura da pergunta não é recusada — é outra coisa.** Um filtro **de sessão**, que quem abre ajusta sem gravar, é exploração temporária e tem outro desenho (não persiste, não audita, não altera o que os outros veem). Ele continua fora de escopo até alguém o pedir por esse nome.

### 8.6 A tela

**Mesma rota, segundo estado:** `/paineis?painel=<id>&editar=1`. Troca só de query string, então **âncora nativa** — convenção da casa, cobrada pela cerca `navegacao-por-query`.

O modo de edição mostra a mesma grade, e em cada bloco: **subir**, **descer**, **largura** (metade ↔ inteira) e **remover**. Acima da grade: **nome**, **visibilidade** e **filtro**. Os blocos **não executam consulta no modo de edição** — quem está reordenando não precisa do dado, e disparar doze consultas a cada movimento é gasto sem uso.

**Uma gravação por ato, e não um "salvar" no fim.** Um formulário grande com botão de salvar perderia o trabalho de quem fechasse a aba, e obrigaria a decidir o que fazer com uma edição concorrente. Cada ato é pequeno, gravado e auditado — e o desfazer é o ato inverso, que está na tela.

O botão de edição só aparece para o autor. Esconder é conveniência de tela; a autoridade é o caso de uso, e é lá que a RN94 está escrita.

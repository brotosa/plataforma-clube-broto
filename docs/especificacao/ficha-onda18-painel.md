# Ficha de Módulo — Onda 18: Painel de relatórios
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 18/09/2026

Tela nova (**T37**): vários relatórios lado a lado, numa página que se abre de uma vez. Duas fases — a **F30** entrega o painel e os blocos; a **F31**, o filtro que atravessa os blocos. Sobre a versão **1.5.0**.

> **Ficha antes do código.** Nada foi implementado. A numeração **RN86–RN89** é proposta: a Superintendência pode recusá-la ou renomeá-la sem custo de retrabalho.

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

### T36 — o que muda

Só a entrada "Pôr no painel". Nada mais.

---

## 5. Fases

### F30 — o painel e os blocos

Entidade, galeria, montagem, execução por bloco, RN86, RN87, RN88, a coluna `painelId` e a cerca de arquitetura. **Sem o filtro**: cada bloco usa os filtros que já tem na própria definição.

Pré-requisito: F24–F28 na main.

### F31 — o filtro do painel

Os eixos no catálogo (declaração por assunto), a aplicação e — a parte que mais importa — **o aviso de não aplicação**, por bloco.

Vem depois de propósito: a F30 é útil sozinha, e a F31 carrega toda a decisão conceitual desta onda. Separadas, uma recusa na F31 não devolve a F30.

---

## 6. Pendências declaradas

1. **`[A CONFIRMAR]` Quantos blocos no máximo.** Cada bloco é uma consulta. Oito parece confortável e doze já é um painel que demora a fechar. Proposta: **teto de 12**, com a recusa nomeando o número — não implementar sem número validado.
2. **`[A CONFIRMAR]` Os eixos da F31.** A proposta é **dois**: Período e UF. Acrescentar "Aliado" e "Categoria" é possível e cada um custa uma declaração por assunto. Decidir **antes** da F31, porque eixo é contrato de catálogo.
3. **Atualização automática.** O painel não se atualiza sozinho: recarregar é da pessoa. Auto-refresh transformaria cada painel aberto e esquecido numa aba disparando consultas indefinidamente.
4. **Exportar o painel inteiro.** A F28 exporta um relatório. Exportar um painel em HTML é natural e **não está nesta onda** — entra quando alguém pedir, e é pequeno.

---

## 7. Fora de escopo

Bloco de texto livre, imagem ou vídeo no painel. Bloco que combine dois assuntos. Alerta por limiar. Comentário sobre bloco. Painel público sem autenticação. Atualização automática. Qualquer indicador que não venha de um relatório do catálogo — isso é RN50, e o caminho dela é ficha validada.

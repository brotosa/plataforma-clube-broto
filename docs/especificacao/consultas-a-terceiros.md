# Consultas a terceiros — mensagens prontas
**Plataforma de Administração e Gestão do Clube Broto** · redigido em 17/09/2026

As 26 pendências de `pendencias-consolidadas.md` que dependem de gente de fora, escritas como **mensagens que se pode enviar**, não como lista de tópicos. Uma por destinatário.

> **Por que assim.** Pendência que vive numa ficha técnica não sai de lá: quem precisa respondê-la não lê ficha técnica. Cada mensagem abaixo é autossuficiente — diz o que a plataforma faz hoje sem a resposta, o que muda com ela, e pergunta uma coisa de cada vez.

> **Nada aqui contém dado pessoal.** Onde é preciso falar de arquivo da operadora, o texto descreve o **cabeçalho** e nunca o conteúdo, conforme a regra de dados do `CLAUDE.md`.

---

## 1 · Para a Minutrade

**Assunto sugerido:** Clube Broto — nove pontos de integração para fechar

Olá,

Estamos com a plataforma de administração do Clube Broto em produção e chegamos a um conjunto de pontos que só vocês podem esclarecer. Nenhum deles nos impede de operar — a plataforma está desenhada para exibir "aguardando" em vez de estimar —, mas cada resposta destrava uma leitura que hoje não conseguimos entregar.

Separei por ordem de impacto.

### 1. Telemetria por assinante

**A pergunta:** existe, ou está previsto, um relatório de consumo **por titular**? Se sim, em que prazo e com que chave de identificação?

**Por que importa mais que as outras:** sem ela, três indicadores do painel ficam em branco com a etiqueta "aguarda telemetria", a taxa de conversão das campanhas não pode ser atribuída a pessoas, e o relatório que entregamos a cada patrocinador mostra a estrutura sem os números de consumo. É a única pendência da lista que deixa telas visivelmente incompletas.

### 2. As duas contagens de resgate divergem

Recebemos de vocês dois números que medem resgate e não batem: o **contador agregado por oferta**, no arquivo de catálogo, e os **eventos nominais** do extrato. Na base atual, 227 contra 38.

**A pergunta:** qual é a regra de contagem de cada um? O que entra e o que não entra em cada número?

**O que fazemos hoje:** exibimos os dois lado a lado, cada um com a origem e a data do arquivo, e **nunca os somamos**. Preferimos mostrar a divergência a reconciliá-la por conta própria e acertar por acaso.

### 3. "Resgates" na base atual

**A pergunta:** o campo representa **emissão de voucher** ou **resgate efetivo**?

São coisas diferentes para quem lê, e hoje o rótulo do campo está em espera justamente por isso.

### 4. A coluna de CPF

Passamos a receber CPF do titular nos relatórios nominais. Precisamos confirmar três coisas:

- o **nome exato** da coluna no cabeçalho;
- se o valor vem **com ou sem máscara**;
- se ela vem preenchida em **todas as linhas** ou só em parte.

Nosso leitor já detecta a coluna pelo cabeçalho e aceita as duas formas — foi escrito assim porque não chegamos a observar um arquivo completo. É confirmação, não bloqueio.

### 5. Arquivo de importação do catálogo

**A pergunta:** qual o layout e o meio de entrega do arquivo que a plataforma deve produzir para publicar ofertas em vocês?

Hoje geramos um pacote em formato próprio e a publicação tem etapa manual. Com o layout de vocês, ela passa a ser automática.

### 6. Eventos de telemetria

**A pergunta:** qual o cardápio de eventos disponíveis e com que periodicidade podem ser entregues? Nossa proposta é **diária**.

### 7. Limite de resgates por oferta

**A pergunta:** vocês suportam um limite de resgates por oferta?

Hoje o campo existe só do nosso lado, como alerta interno, e não viaja na publicação.

### 8. Export completo do catálogo

**A pergunta:** é possível obter um dump completo do catálogo, com categoria, descrição, imagem e tipo por oferta?

Reduziria drasticamente nossa fila de curadoria manual.

### 9. Kit de campanha

**A pergunta:** qual canal de entrega e qual formato vocês preferem receber para executar um disparo?

Hoje geramos um pacote compactado para download.

Obrigado — qualquer uma dessas respostas já ajuda, não precisam vir juntas.

---

## 2 · Para a Superintendência

**Assunto sugerido:** Clube Broto — oito decisões de negócio pendentes

Olá,

A plataforma está em produção e operando. Há oito pontos em que ela está funcionando com uma escolha **de engenharia**, tomada para não travar a entrega, onde a decisão correta é de negócio. Estão registrados como pendência desde que nasceram; nenhum é urgente, e três são de segurança.

### Os três de segurança, primeiro

**1. Não existe uma política de uso da plataforma.** Hoje o papel de cada pessoa é atribuído caso a caso, sem documento por trás. O Guia da Plataforma referencia essa política na seção 5 e ela não existe. É o documento que define, na prática, quem alcança a carteira de assinantes.

**2. A conta de Administrador não pode ser bloqueada, e não há contrapartida.** A isenção existe por um motivo bom — quem desbloqueia os outros não pode se trancar fora —, mas ela deixa essa conta sem a proteção que todas as outras têm. Opções levantadas: segundo fator, lista de origens de rede permitidas, ou alerta na auditoria após N tentativas falhas. Nenhuma foi decidida.

**3. Os valores da política de senha e de sessão são de engenharia, não recomendação.** Hoje: 10 caracteres mínimos, sessão caindo por 30 minutos de inatividade, 5 tentativas erradas bloqueando por 15 minutos, e três proteções adicionais **desligadas** (validade da senha, teto absoluto de sessão, bloqueio por origem de rede). Foram escolhidos para **preservar o comportamento anterior**, não para recomendar um nível de segurança.

### Os cinco de operação

**4. Vaga de patrocínio encerrada pode ser reocupada?** O modelo comporta rotatividade — encerrar devolve a vaga ao saldo e preserva o histórico —, mas não decidimos se ela é permitida.

**5. O kit de campanha sai carimbado quando a aprovação do patrocinador não foi registrada na plataforma.** Ele sai, com a pendência visível no documento. A alternativa — bloquear a geração — nos pareceu mais destrutiva e menos reversível, mas é escolha que cabe a vocês.

**6. Existe um papel de marketing a criar?** Hoje campanha é modelada e ativada por Gestor e Analista.

**7. Encerrar uma campanha deve pausar automaticamente as ofertas exclusivas dela?** Está implementado assim, aguardando validação.

**8. Os dados bancários do aliado ficam na Broto ou apenas na operadora?** Hoje a plataforma **não os guarda**. Se passarem a ficar conosco, entram como dado sensível com permissão própria.

---

## 3 · Para o jurídico

**Assunto sugerido:** Clube Broto — duas questões sobre dado pessoal e retenção

Olá,

Duas questões da plataforma de administração do Clube Broto. A primeira já está em curso e precisa de definição; a segunda é uma funcionalidade que **não construímos** justamente por não ter essa definição.

### 1. Retenção da trilha de auditoria

A plataforma registra toda alteração de dado de negócio — quem mudou, o quê, de que valor para qual, e quando. **Nenhum evento é apagado**, e a trilha é somente leitura por regra: nem a interface da plataforma consegue escrever nela.

A premissa em vigor é **retenção integral por tempo indeterminado**, adotada por ausência de definição. Ela cresce continuamente e é a única pendência desta lista cujo custo aumenta com o tempo.

**A pergunta:** por quanto tempo esses registros devem ser mantidos? Há categorias com prazos diferentes?

### 2. Envio automático de relatório contendo dado pessoal

A plataforma tem um gerador de relatórios. Quando o relatório alcança dado de assinante, ela **exige que quem o executa declare a finalidade**, e grava essa declaração junto com a execução — é o controle que temos hoje, e ele funciona porque uma pessoa declara a finalidade a cada vez que pede.

Foi solicitado que relatórios possam ser **agendados e enviados por e-mail**. Isso muda a natureza do controle: a finalidade passaria a ser declarada **uma vez** e repetida por uma rotina, indefinidamente, com o dado saindo da plataforma sem ninguém acionar nada.

**Não construímos essa funcionalidade**, e ela está registrada como bloqueada até haver posição.

**A pergunta:** o envio periódico automático de relatório contendo dado pessoal é admissível? Se sim, sob que condições — prazo de validade da autorização, destinatários restritos, renovação periódica da declaração de finalidade?

---

## 4 · Para a TI (interno)

Sete itens que não precisam de mensagem porque a TI Broto é quem responde. Estão em `pendencias-consolidadas.md` §4:

| | O que decidir | Estado hoje |
| --- | --- | --- |
| 4.1 | Registro da imagem de contêiner | GHCR; trocar é configuração |
| 4.2 | **Proteção por taxa na borda (WAF)** | **não existe** — a única de infraestrutura pura |
| 4.3 | Tetos do dossiê | em espera |
| 4.4 | Provedor de e-mail e domínio remetente | nada configurado |
| 4.5 | Dicionário do arquivo de assinantes e ritmo de carga | mapeador tolerante |
| 4.6 | Formato das listas de prospects | em espera |
| 4.7 | Carga inicial do portfólio de soluções | cobertura reflete só o cadastrado, e declara isso |

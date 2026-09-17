# Pendências consolidadas — todas as perguntas abertas
**Plataforma de Administração e Gestão do Clube Broto** · levantado em 17/09/2026 · versão 1.5.0

Levantamento de **todo** `[A CONFIRMAR]` das 18 fichas, agrupado por **quem responde**. Cada item traz o que acontece **hoje**, sem a resposta — porque nenhuma delas está travando a plataforma: todas têm comportamento definido e declarado. Responder melhora; não responder não quebra.

> **Como este documento se relaciona com as fichas.** Ele não substitui nenhuma: a ficha da onda continua sendo a fonte da verdade. Este é um índice para que as perguntas possam ser levadas às reuniões certas sem alguém ter de varrer dezoito documentos. Respondida uma pergunta, a resposta vai **para a ficha de origem**, e a linha aqui é riscada.

---

## 0. Já fechadas, e as fichas de origem não foram atualizadas

Achado deste levantamento. Duas perguntas foram respondidas em **24/07** e registradas na ficha da Onda 3 (§ "Fechadas em 24/07"), mas continuam escritas como abertas nas fichas onde nasceram:

| Pergunta | Resposta dada | Onde ficou pendurada |
| --- | --- | --- |
| Take rate de 5% é padrão do contrato-modelo ou negociado caso a caso? | **Padrão, 5%** | `ficha-cadastral-aliado-v1.md` §69 |
| Valor da meta de novos aliados por período | **24 novos aliados/ano (geral)** | `ficha-onda2-mercado-scout.md` §14 e §101 |

**Não estão sendo perguntadas de novo.** Ficam aqui só para que a limpeza das fichas de origem seja feita por alguém que saiba que a resposta existe.

---

## 1. Minutrade — a maior parte é uma conversa só

Oito perguntas, e sete delas cabem numa reunião. É o bloco que mais destrava coisa: dele dependem o nível de atribuição das campanhas (RN43), os selos de consumo do patrocinador (RN65) e a reconciliação das duas contagens (RN68).

**1.1 · O significado de "Resgates" na base atual: emissão de voucher ou resgate efetivo?**
*Hoje:* o rótulo do campo está em espera e a telemetria é exibida com a origem nomeada, sem interpretação.
*Destrava:* o rótulo correto em T5 e no Dashboard.
*Origem:* Onda 1 §107, §165.

**1.2 · As duas contagens divergem — 227 no catálogo, 38 no extrato. Qual é a regra de contagem de cada uma?**
*Hoje:* a RN68 manda **exibir a divergência como divergência**; os dois números aparecem lado a lado, cada um com a origem e a data do arquivo, e nunca são somados.
*Destrava:* a reconciliação. Sem a regra, reconciliar por conta própria seria inventar.
*Origem:* Onda 12 §44.

**1.3 · Nome exato da coluna de CPF, se vem com máscara e se cobre todas as linhas.**
*Hoje:* o parser detecta a coluna pelo cabeçalho e tolera as duas formas — foi escrito assim justamente por não termos observado arquivo real.
*Destrava:* nada; é conferência. A primeira importação real é o teste.
*Origem:* Onda 12 §14, §70.

**1.4 · Existe telemetria por assinante? Quando?**
*Hoje:* é a pergunta mais cara da lista. Sem ela, "uso por assinante" fica em `aguarda telemetria`, a conversão % das campanhas não tem nível de atribuição por pessoa (RN43) e os selos de consumo do patrocinador não acendem (RN65).
*Destrava:* três indicadores do Dashboard e a metade nominal do R1.
*Origem:* Onda 16 §78, Onda 4 §63.

**1.5 · Layout e meio de entrega do arquivo de importação do catálogo.**
*Hoje:* JSON/CSV atrás do `ExportAdapter`, isolado como manda a regra de pendências.
*Destrava:* a publicação automática deixar de ser manual.
*Origem:* Onda 1 §144, §183.

**1.6 · Cardápio de eventos de telemetria e periodicidade (proposta: diária).**
*Origem:* Onda 1 §150, §152.

**1.7 · A Minutrade suporta limite de resgates por oferta?**
*Hoje:* o campo é interno, com alerta ao atingir, e não viaja na publicação.
*Origem:* Onda 1 §105.

**1.8 · O export completo do catálogo está disponível?**
*Hoje:* a curadoria é manual. Com o dump, a fila encolhe drasticamente.
*Origem:* Onda 1 §166.

**1.9 · Canal de entrega e formato do kit de campanha preferidos.**
*Hoje:* pacote zip para download, gerado pela plataforma.
*Origem:* Onda 4 §14, §63.

---

## 2. Superintendência — decisões de negócio

**2.1 · Política de uso da plataforma: quem recebe qual papel.**
*Hoje:* o papel é atribuído caso a caso, sem documento por trás. A §5 do Guia a referencia e ela não existe.
*Peso:* alto. É o documento que define quem alcança a carteira de assinantes.
*Origem:* Onda 9 §71.

**2.2 · A conta de Administrador é isenta dos dois bloqueios (RN74). Qual a contrapartida?**
*Hoje:* nenhuma. A isenção existe para que quem desbloqueia não se tranque — e o custo dela está declarado, não coberto. Opções levantadas: segundo fator, lista de origens permitidas, alerta em auditoria após N falhas.
*Peso:* alto, e é de segurança.
*Origem:* Onda 15 §193.

**2.3 · Valores de política de senha e sessão para produção.**
*Hoje:* 10 caracteres, 30 min de inatividade, 5 tentativas/15 min, e as três proteções novas **desligadas**. São escolhas de engenharia que preservam o comportamento anterior — não são recomendação de segurança.
*Origem:* Onda 15 §194.

**2.4 · Vaga de patrocínio encerrada pode ser reocupada (rotatividade)?**
*Hoje:* o modelo **comporta** rotatividade — encerrar devolve a vaga ao saldo e preserva o histórico — mas a plataforma não decide se ela é permitida.
*Origem:* Onda 12, herdada da F19.

**2.5 · O kit de campanha sai carimbado quando a aprovação externa não foi registrada. Está certo?**
*Hoje:* sai, com a pendência carimbada. Bloquear seria a escolha mais destrutiva e menos reversível, e a premissa está declarada.
*Origem:* Onda 12 §72.

**2.6 · Existe papel interno de marketing a criar?**
*Hoje:* modelagem e ativação de campanha são de Gestor e Analista.
*Origem:* Onda 4 §18, §63.

**2.7 · Encerrar uma campanha deve pausar as ofertas exclusivas dela (RN40)?**
*Hoje:* implementado como a regra descreve, aguardando validação.
*Origem:* Onda 4 §63.

**2.8 · Onde residem os dados bancários do aliado — na Broto ou só na operadora/meio de pagamento?**
*Hoje:* a plataforma **não os guarda**. Se passar a guardar, são dado sensível com permissão específica.
*Origem:* Onda 1 §66.

---

## 3. Jurídico

**3.1 · Política de retenção da trilha de auditoria.**
*Hoje:* **retenção integral** — nenhum evento é apagado (RN49), por premissa declarada até haver definição.
*Peso:* cresce com o tempo, literalmente. A trilha só aumenta.
*Origem:* Onda 6 §38, §47.

**3.2 · Relatório agendado por e-mail pode carregar dado pessoal?**
*Hoje:* não existe envio. A pergunta é se a finalidade da RN78 — hoje declarada por uma pessoa a cada pedido — pode passar a ser declarada uma vez e repetida por uma rotina, indefinidamente, sem ninguém apertando nada.
*Bloqueia:* a F29 inteira.
*Origem:* Onda 20 §126.

---

## 4. TI — respondíveis por você

**4.1 · Registro final da imagem de contêiner: GHCR ou registro corporativo?**
*Hoje:* GHCR, porque não exige provisionamento. Trocar depois é mudança de configuração, não de arquitetura.
*Origem:* Onda 11 §48.

**4.2 · Proteção por taxa na borda (WAF/balanceador).**
*Hoje:* **não existe**, e nenhuma configuração da T35 a substitui. O bloqueio por origem conta falhas de senha, não requisições por tempo — cada tentativa ainda custa consulta e gravação, então inundação não é contida.
*Peso:* alto, e é a única pendência desta lista que é de infraestrutura pura.
*Origem:* Onda 15 §195.

**4.3 · Valores definitivos dos tetos do dossiê.**
*Origem:* Onda 3 §59.

**4.4 · Provedor de e-mail, domínio remetente e tratamento de devolução.**
*Hoje:* nada — sem `nodemailer`, sem cliente de SES, sem remetente.
*Bloqueia:* a F29, junto com a 3.2.
*Origem:* Onda 20 §124.

**4.5 · Dicionário real do arquivo de assinantes, ritmo de carga e política (foto completa × incremental).**
*Hoje:* o mapeador de colunas absorve variações; a política é escolhida na importação.
*Origem:* Onda 5 §14, §53, §65.

**4.6 · Formato das listas de prospects existentes.**
*Origem:* Onda 2 §89, §101.

**4.7 · Carga inicial do portfólio de soluções.**
*Hoje:* a distribuição de cobertura reflete **apenas o cadastrado**, e as telas declaram isso. Não é defeito; é ausência informada (RN53).
*Destrava:* a T29 e o mapa passarem a refletir o portfólio real.
*Origem:* Onda 7 §94.

---

## 5. Decisões sobre o que já foi entregue — custo zero agora, retrabalho depois

Estas não dependem de ninguém de fora. São do autor das fichas e da Superintendência, e responder **agora** não custa nada porque nada foi construído em cima delas.

**5.1 · Validar as fichas das Ondas 16, 17 e 20 e as numerações RN75–RN85.**
Todas propostas. Recusar ou renumerar agora não custa retrabalho; depois, custa.

**5.2 · A divergência de layout da F27.**
A ficha da Onda 17 §4 propôs o painel de ajustes **à direita** do gráfico; foi construído **abaixo**, em qualquer largura. Está declarado na ficha e no teste. Preferindo o lateral: mudança de CSS e de um teste.

**5.3 · O relato "não consigo gerar relatório".**
Nunca reproduzido. Testado com o papel de acesso total, clicando no cartão e não por URL: a tela monta, a tabela vem com dado, sem erro de console nem HTTP de falha. A hipótese é que o layout quebrado da T36 — corrigido desde então — tenha impedido o uso. **Segue em aberto**, e o que falta é o ponto exato em que a tela para.

**5.4 · O vermelho no selo Offline da T27.**
Pedido e implementado; a ressalva levantada não foi fechada.

**5.5 · Nome do arquivo exportado.**
Hoje `relatorio-<assunto>-<data>`. Relatório salvo poderia usar o próprio nome — mais útil para quem recebe, e mais revelador, porque nome de arquivo viaja em anexo e em pasta compartilhada.
*Origem:* Onda 20 §7.3.

**5.6 · Teto de linhas por formato de exportação.**
A RN79 dá 5.000 por padrão e 50.000 no máximo. Para HTML, 50.000 linhas travam o navegador na impressão; para XLSX é confortável. Proposta: **5.000 para HTML, teto cheio para XLSX e CSV**. Precisa de número validado antes de a F28 começar.
*Origem:* Onda 20 §7.1.

---

## 6. O que este levantamento NÃO cobre

Pendências técnicas internas sem pergunta de negócio por trás — o protótipo v11.2 ausente do repositório (conferência visual da T32, T33 e R1), a ordenação do eixo em campo de lista fechada, e a ausência de isolamento da causa do defeito de navegação por query. Estão registradas nos lugares próprios e não dependem de ninguém responder nada.

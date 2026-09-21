# Pendências consolidadas — todas as perguntas abertas
**Plataforma de Administração e Gestão do Clube Broto** · levantado em 17/09/2026 · versão 1.5.0

**Atualizado em 17/09 à noite:** quatro itens da §5 foram fechados pela TI.

**Atualizado em 18/09:** a §4.2 (proteção na borda) ganhou ficha própria — `ficha-onda21-protecao-na-borda.md` —, e a metade de aplicação dela foi entregue; a topologia de produção está confirmada e a §6.1 daquela ficha traz um achado novo, o endereço público do banco (§4.8, acrescentada aqui). A §2.2 continua aberta, mas deixou de ser invisível: leia o que mudou antes de decidi-la.

**Atualizado em 18/09 à noite:** a **§5.3 fechou**, por observação da TI em uso — e com isso **toda pendência restante depende de terceiros**. Nenhuma delas se resolve aqui dentro: as mensagens estão prontas em `consultas-a-terceiros.md`, e o que falta é enviá-las.

> **A contagem foi refeita item a item, e não batia.** O cabeçalho dizia 27; contando as linhas numeradas que não estão riscadas eram **29**. O número anterior era anterior à §4.8 e ao desdobramento da §1, e ninguém o recontou. Fica o registro de que **o número deste cabeçalho é derivado da lista, não o contrário**: quem acrescentar uma linha recontará.

> **Depois dos fechamentos de 18/09 à noite — a §4.9 acrescentada, a §5.4 e a §5.5 decididas —, eram 28:** 9 da Minutrade, 8 da Superintendência, 2 do jurídico e 9 da TI. A §5 acabou ali.

> **Em 21/09 caíram mais nove, todas por DECISÃO e nenhuma por implantação** — 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2 e 4.1. **Restam 19:** 9 da Minutrade, 2 da Superintendência (a 2.1, que virou documento a escrever, e a 2.3, que é digitar valores na T35), nenhuma do jurídico e 8 da TI — **o jurídico saiu da lista inteiro**.

> **Ainda em 21/09 caíram mais duas, e com elas acabou o que era só decisão:** a **4.3** (dossiê assistido fica desligado) e a **metade decidível da 4.5** (política de carga mantém-se a atual). **Restam 18**, e **nenhuma delas se resolve decidindo**: 9 são perguntas à Minutrade, 2 dependem da Superintendência (a 2.1 aguarda validação do rascunho, a 2.3 é digitar valores), e 7 da TI são infraestrutura, provisionamento, arquivo ou trabalho operacional.
>
> **O que mudou de natureza:** até aqui havia sempre algo a decidir. A partir de agora, avançar depende de **alguém de fora responder**, de **infraestrutura ser provisionada** ou de **dado ser carregado**. Não há mais item que uma conversa feche.
>
> **O que sobrou tem outra natureza.** As nove de 21/09 se respondiam lendo e decidindo; o que resta são **perguntas a terceiros** (as 9 da Minutrade), **ações de infraestrutura** (WAF, endereço público do banco, `terraform apply`, provedor de e-mail) e **dado ou trabalho operacional** (dicionário do arquivo de assinantes, formato das listas de prospects, carga do portfólio). Nenhuma delas se fecha numa conversa.
>
> **Duas ficaram decididas pela metade, de propósito:** a **2.1** foi decidida *escrever* a política de uso — e decidir escrever não é ter escrito, então segue aberta até o documento existir; a **4.3** (tetos do dossiê) não foi decidida porque não é número solto: teto nulo mantém a geração assistida **desligada**, falhando seguro, e ligá-la exige também a chave da API e as duas tarifas.

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

Nove perguntas, e a maior parte cabe numa reunião só. É o bloco que mais destrava coisa: dele dependem o nível de atribuição das campanhas (RN43), os selos de consumo do patrocinador (RN65) e a reconciliação das duas contagens (RN68).

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

**2.1 · Política de uso da plataforma: quem recebe qual papel.** `[RASCUNHO ESCRITO em 21/09 — aguarda validação]`
*Decidido em 21/09:* **escrever, e curta.** O rascunho existe em [`politica-de-uso-da-plataforma.md`](../politica-de-uso-da-plataforma.md) e deriva da matriz de permissões; **segue aberta** até a Superintendência validar, porque dois pontos só ela responde: **quem aprova** as quatro concessões nomeadas e **com que periodicidade** se faz a varredura.
*Achado ao escrever:* o `perfis-de-acesso.md` estava inteiro no sentido **anterior** à renomeação da Onda 15 — chamava de "Administrador da Plataforma" o papel de 12 ações. Quem o lesse concederia acreditando dar configuração e daria **acesso total**. Corrigido no mesmo PR.
*Peso:* alto. É o documento que define quem alcança a carteira de assinantes.
*Origem:* Onda 9 §71.

**2.2 · ~~A conta de Administrador é isenta dos dois bloqueios (RN74). Qual a contrapartida?~~ FECHADA em 21/09: o REGISTRO que passou a existir.**
*Decidido:* **nada além do registro** — e era a terceira saída da lista abaixo, legítima desde sempre. O que a tornou suficiente foi 18/09: é que a isenção deixou de ser **invisível**, que era o pior dela: a conta isenta agora **conta as falhas sem nunca ser trancada**, o número aparece na faixa da T35, e dois momentos vão à trilha (limite atingido em conta isenta; conta comum trancada agora) — nunca um evento por tentativa, senão quem ataca escolheria o volume de uma tabela que a RN49 não deixa apagar.
*Antes disso:* falha contra conta isenta não incrementava contador nenhum, a contagem por origem tem retorno antecipado com a política desligada (que é como ela nasce), e **nenhuma falha de login, de conta nenhuma, gravava auditoria**. Tentar senhas contra um Administrador podia se repetir sem limite, sem prazo e sem rastro.
*O segundo fator não foi recusado, foi adiado:* é uma onda inteira para proteger **uma conta**, e a ameaça que ele endereçaria — volume de tentativas — se resolve na borda (§4.2). **Condição de reabertura, proposta e não decidida:** quando houver mais de uma conta com `CONFIGURAR_PORTAL`.
*Peso:* alto, e é de segurança.
*Mensagem pronta:* `consultas-a-terceiros.md` §2, item 2 (reescrito em 18/09).
*Origem:* Onda 15 §6.1 (v0.6).

**2.3 · Valores de política de senha e sessão para produção.**
*Hoje:* 10 caracteres, 30 min de inatividade, 5 tentativas/15 min, e as três proteções novas **desligadas**. São escolhas de engenharia que preservam o comportamento anterior — não são recomendação de segurança.
*Origem:* Onda 15 §194.

**2.4 · ~~Vaga de patrocínio encerrada pode ser reocupada (rotatividade)?~~ FECHADA em 21/09: PERMITIDA.**
*Decidido:* **permitida**. O patrocinador comprou assinaturas, não pessoas — recusar obrigaria a comprar vaga nova a cada troca de funcionário. O modelo já comportava, e **nada muda no código**: o abuso possível fica **visível no histórico** em vez de impossível.
*Origem:* Onda 12, herdada da F19.

**2.5 · ~~O kit de campanha sai carimbado quando a aprovação externa não foi registrada.~~ FECHADA em 21/09: está certo, MANTÉM.**
*Decidido:* **mantém como está**. Bloquear não impediria nada — a aprovação acontece fora da plataforma de qualquer forma — e só empurraria a execução para um canal sem registro. O carimbo torna a lacuna visível para quem executa. A premissa da RN64 passa de declarada a confirmada.
*Origem:* Onda 12 §72.

**2.6 · ~~Existe papel interno de marketing a criar?~~ FECHADA em 21/09: NÃO se cria agora.**
*Decidido:* **não se cria agora**. Papel se justifica quando alguém é impedido do que precisa ou alcança o que não deveria, e nenhum dos dois acontece. **Reabre** se entrar alguém de marketing que não deva alcançar a carteira de assinantes.
*Origem:* Onda 4 §18, §63.

**2.7 · ~~Encerrar uma campanha deve pausar as ofertas exclusivas dela (RN40)?~~ FECHADA em 21/09: SIM, validada como está.**
*Decidido:* **sim, como está**. A oferta exclusiva existe por causa da campanha; mantê-la publicada depois deixaria o Clube exibindo oferta que ninguém mede e que o aliado não concordou em manter. Deixa de estar aguardando validação.
*Origem:* Onda 4 §63.

**2.8 · ~~Onde residem os dados bancários do aliado?~~ FECHADA em 21/09: FORA da plataforma.**
*Decidido:* **ficam fora da plataforma**. Nenhuma função existente precisa deles — o pagamento corre pela operadora —, e guardá-los criaria uma classe de dado sensível com permissão, auditoria e exposição próprias, por zero ganho. Se um dia for necessário, é onda com ficha.
*Origem:* Onda 1 §66.

---

## 3. Jurídico

**3.1 · ~~Política de retenção da trilha de auditoria.~~ FECHADA em 21/09: INTEGRAL, com gatilho medido.**
*Decidido:* **integral, com condição objetiva de revisão — não prazo arbitrário**. Escolher um prazo hoje seria escolher no escuro; segue-se a disciplina da RN71, e a conversa reabre com número medido na mão. O gatilho exato é de medição (TI), não de política.
*Peso:* cresce com o tempo, literalmente. A trilha só aumenta.
*Origem:* Onda 6 §38, §47.

**3.2 · ~~Relatório agendado por e-mail pode carregar dado pessoal?~~ FECHADA em 21/09: NÃO.**
*Decidido:* **não**. A finalidade da RN78 continua sendo declaração de uma pessoa a cada pedido, e não se converte em rotina.
*Bloqueia:* a F29 **nesta forma** — deixa de ser pergunta aberta e passa a ser recusa registrada.
*Proposto e NÃO decidido:* agendamento restrito aos sete assuntos **sem** dado pessoal. A pergunta respondida foi sobre dado pessoal; esta não chegou a ser feita.
*Origem:* Onda 20 §126.

---

## 4. TI — respondíveis por você

**4.1 · ~~Registro final da imagem de contêiner: GHCR ou registro corporativo?~~ FECHADA em 21/09: é o ECR — e já era.**
*Decidido:* **ECR** — e a pergunta já estava respondida pelo código. O `buildspec.yml` publica em `373945090777.dkr.ecr.sa-east-1`, mesma conta e região do ECS que puxa a imagem; **não há GHCR em ponto algum da esteira**. A ficha da Onda 11 descrevia uma intenção que a implementação não seguiu, e foi corrigida.
*Origem:* Onda 11 §48.

**4.2 · Proteção por taxa na borda (WAF/balanceador).**
*Hoje:* **não existe**, e nenhuma configuração da T35 a substitui. O bloqueio por origem conta falhas de senha, não requisições por tempo — cada tentativa ainda custa consulta e gravação, então inundação não é contida.
*Ganhou ficha própria* — `ficha-onda21-protecao-na-borda.md`, com a RN90 e as três partes dela, das quais a segunda é a que evita quebrar a plataforma em silêncio. A **metade de aplicação foi entregue**; a de borda segue com a TI.
*E a conferência de 18/09 mostrou que ela será obrigatória:* a aplicação não é alcançável por fora do balanceador, então não há caminho paralelo que a contorne.
*Peso:* alto, e é a única pendência desta lista que é de infraestrutura pura.
*Origem:* Onda 15 §195.

**4.8 · O banco de produção tem endereço público, e essa porta não deixa trilha.** `[NOVA — 18/09]`
*Hoje:* a instância `broto-clube-db` está com `PubliclyAccessible: true`. Não é "o banco aberto para a internet" — o grupo de segurança barra tudo menos a aplicação e um `/32` —, mas o endpoint resolve para endereço público, e a única coisa entre ele e a internet é uma regra de grupo de segurança.
*O que mais pesa:* **acesso direto por `psql` não grava evento**. A garantia de que toda alteração registra valor anterior, novo e autor vale para quem entra pela aplicação; por essa porta ela nem chega a existir — inclusive para alterações na própria tabela de auditoria, que a RN49 diz que não se apaga.
*Encaminhamento proposto:* `PubliclyAccessible: false` com acesso por encaminhamento de porta via SSM Session Manager — dispensa host bastião, não depende de endereço fixo e registra cada sessão. **Duas ressalvas declaradas:** é um `modify-db-instance` que pode interromper conexões (quer janela), e não foi verificado se o subnet group é público.
*Peso:* alto, e é de segurança.
*Mensagem pronta:* `consultas-a-terceiros.md` §4.1.

**4.9 · `terraform apply` reverteria a versão da aplicação em produção.** `[NOVA — 18/09, à noite]`
*Hoje:* o `aws_ecs_service.app` aponta `task_definition = aws_ecs_task_definition.app.arn` **sem** `lifecycle { ignore_changes = [task_definition] }`. Só que quem troca a revisão em produção é a esteira (`buildspec.yml`), por fora do Terraform, a cada push na main.
*A consequência:* um `terraform apply` hoje tentaria devolver o serviço à revisão que o próprio Terraform gerencia — que carrega `var.imagem_tag`, e **não** a imagem que está no ar. Na prática, um rollback de versão disparado por um comando que ninguém associa a isso.
*Provavelmente é por isso que ninguém o roda*, e essa é a parte ruim: a fonte da verdade declarada deixou de ser executável, e a divergência só cresce.
*Encaminhamento:* acrescentar o `ignore_changes` é o padrão para exatamente este arranjo (esteira dona da revisão, Terraform dono do resto). É mudança de comportamento do Terraform, então é decisão de infraestrutura — não foi feita aqui.
*Peso:* médio hoje, alto no dia em que alguém precisar aplicar Terraform às pressas.
*Origem:* achado ao acrescentar `SALTOS_CONFIAVEIS_NA_BORDA` ao `terraform/aws/ecs.tf`, em 18/09.
*Origem:* Onda 21 §6.6 (achado da conferência de rede).

**4.3 · ~~Valores definitivos dos tetos do dossiê.~~ FECHADA em 21/09: não se define — o dossiê assistido fica DESLIGADO.**
*Decidido:* a pergunta parecia ser sobre dois números e não era. **Teto nulo mantém a geração assistida indisponível**, falhando seguro, com a tela dizendo o que falta — não é exposição de custo, é funcionalidade que não roda. Ligá-la exigiria os tetos **e mais** a chave da API e as duas tarifas; enquanto isso não for decidido, os nulos ficam **de propósito** e a inserção manual segue sendo o caminho.
*Quando for ligar:* o número se mede, não se escolhe — custo real de um dossiê em tokens para o unitário, e unitário × volume para o mensal.
*Origem:* Onda 3 §59.

**4.4 · Provedor de e-mail, domínio remetente e tratamento de devolução.**
*Hoje:* nada — sem `nodemailer`, sem cliente de SES, sem remetente.
*Bloqueia:* a F29, junto com a 3.2.
*Origem:* Onda 20 §124.

**4.5 · Dicionário real do arquivo de assinantes e ritmo de carga.** `[a POLÍTICA foi decidida em 21/09]`
*Decidido — política padrão de carga:* **mantém-se a atual**. `INCREMENTAL` é o padrão da tela, e `FOTO_COMPLETA` continua exigindo que a pessoa **digite "FOTO COMPLETA"**. A fricção é deliberada e fica: só a foto completa remove assinante que sumiu do arquivo, e é a operação que não se desfaz. Nada muda no código.
*Segue aberto:* o dicionário real e o ritmo de carga — que são **informação de terceiro**, não decisão. O mapeador de colunas absorve variações até lá.
*Origem:* Onda 5 §14, §53, §65.

**4.6 · Formato das listas de prospects existentes.**
*Origem:* Onda 2 §89, §101.

**4.7 · Carga inicial do portfólio de soluções.**
*Hoje:* a distribuição de cobertura reflete **apenas o cadastrado**, e as telas declaram isso. Não é defeito; é ausência informada (RN53).
*Destrava:* a T29 e o mapa passarem a refletir o portfólio real.
*Origem:* Onda 7 §94.

---

## 5. Decisões sobre o que já foi entregue — custo zero agora, retrabalho depois

> **ENCERRADA em 18/09.** As seis foram decididas, e nenhuma delas dependia de alguém de fora — eram do autor das fichas. A seção fica inteira, com as decisões e os motivos, porque o registro de **por que** se escolheu é o que evita a discussão recomeçar do zero daqui a um ano. Pendência interna nova entra aqui.

Estas não dependiam de ninguém de fora. Eram do autor das fichas e da Superintendência, e responder **na hora** não custou nada porque nada foi construído em cima delas — que era exatamente o ponto de listá-las separadas.

**5.1 · ~~Validar as fichas das Ondas 16, 17 e 20 e as numerações RN75–RN85.~~ FECHADA em 17/09.**
Adotadas pela TI Broto. Permanecem sujeitas à Superintendência, e isso não é ressalva de fachada: **renomear uma RN é edição de documento, não retrabalho de código** — as regras são referenciadas por nome no texto e por comportamento nos testes, nunca por número em identificador. A numeração vigente vai da **RN01 à RN85**.

**5.2 · ~~A divergência de layout da F27.~~ FECHADA em 17/09 — vale o que foi construído.**
Os ajustes ficam **abaixo** do gráfico, em qualquer largura. A §4 da ficha da Onda 17 foi corrigida para descrever o que existe, e a divergência ficou **registrada e não apagada**: quem ler a ficha daqui a um ano precisa saber que houve escolha, não descuido.

**5.3 · ~~O relato "não consigo gerar relatório".~~ FECHADA em 18/09 — por observação, e não por dedução.**
A TI relatou, em uso: *"consegui gerar o relatório perfeitamente"*. É exatamente o que esta linha pedia para ser fechada, e é por isso que ela se fecha agora e não antes.

**Fecha como "não reproduz mais", não como "causa encontrada", e a distinção é o ponto.** A hipótese registrada era o layout quebrado da T36 — corrigido desde então —, e ela **continua sendo hipótese**: nunca foi provada, porque o defeito nunca chegou a ser reproduzido. Dar-lhe status de causa aqui seria inventar um diagnóstico a partir de uma coincidência de datas, e é o tipo de conclusão que a próxima pessoa leria como fato.

O que fica registrado, para o caso de o relato voltar: nunca foi reproduzido pelo lado do código; foi testado com o papel de acesso total, clicando no cartão e não por URL, com a tela montando, a tabela vindo com dado, sem erro de console nem HTTP de falha. Se reaparecer, começa daí — e o que destrava continua sendo o mesmo: em que ponto exatamente a tela para, a URL, e o que sai no console do navegador.

**Era a única pendência desta lista que não era falta de decisão, e sim falta de observação.** A lista volta a ser inteiramente dependente de terceiros.

**5.4 · ~~O vermelho no selo Offline da T27.~~ FECHADA em 18/09 pela TI: passa a ser NEUTRO.**
A ressalva de desenho era que o vermelho da plataforma é reservado a **falha**, e estar offline não é falha — é o estado normal de quem não está usando o sistema agora.

**O que fechou a decisão foi a tela de produção, não o argumento.** Com a base real, **11 das 13 linhas** apareciam vermelhas, todas dizendo "nada aconteceu". E o dano não era o excesso de cor: era o que ele encobria — na mesma tela existe um vermelho que é problema de verdade, o `expirada — emita outra` da credencial provisória, e ele competia por atenção com onze selos sem conteúdo.

`pill-erro` → `pill-neutra`, uma palavra. O On-line continua verde, e a distinção fica **mais** legível: um verde no meio de cinzas salta, um verde no meio de vermelhos não. O "visto há" e o "nunca acessou" não se mexem. A escolha está presa em teste, dos dois lados — neutro presente e vermelho ausente —, para não voltar por hábito.

**5.5 · ~~Nome do arquivo exportado.~~ FECHADA em 18/09 pela TI: permanece `relatorio-<assunto>-<data>`.**
A alternativa era o relatório salvo sair com o **próprio nome** — mais útil para quem recebe o anexo, e **mais revelador**, porque nome de arquivo viaja em e-mail e em pasta compartilhada.

**Decidido pelo conservador, e o motivo é de divulgação, não de estética.** O padrão atual não conta o recorte que a pessoa montou; passar a contar é escolha que precisa ser feita de propósito, não herdada de uma conveniência. Um anexo chamado "assinantes inadimplentes SP" é uma divulgação que ninguém decidiu fazer — e ela aconteceria na pasta de quem recebe, fora do alcance da RN78 e da trilha.

**Se um dia for reaberta, o desenho proposto é parcial**: nome próprio só nos assuntos **sem dado pessoal**, mantendo o genérico nos dois que o alcançam. Fica registrado para não se recomeçar a discussão do zero.
*Origem:* Onda 20 §7.3.

**5.6 · ~~Teto de linhas por formato de exportação.~~ FECHADA em 17/09 pela TI.**
**5.000 linhas para HTML; o teto cheio da RN79 para XLSX e CSV.** O HTML é o único que precisa de número próprio, porque é o único que um navegador precisa paginar para imprimir — os outros dois são consumidos por programa. Reversível: é uma constante nomeada. **A F28 deixa de estar bloqueada.**
*Origem:* Onda 20 §7.1.

---

## 6. O que este levantamento NÃO cobre

Pendências técnicas internas sem pergunta de negócio por trás — o protótipo v11.2 ausente do repositório (conferência visual da T32, T33 e R1), a ordenação do eixo em campo de lista fechada, e a ausência de isolamento da causa do defeito de navegação por query. Estão registradas nos lugares próprios e não dependem de ninguém responder nada.

### 6.1 · O e2e depende do estado da base entre specs, e isso não estava escrito em lugar nenhum

**Registrado em 21/09, e o motivo de registrar é o próprio fato de ter levado até aqui.**

A suíte de e2e reprovou na CI ao menos duas vezes por um defeito que **não é da mudança que a disparou**: um spec que conta registros lê um número diferente do esperado porque **outro spec, rodando antes dele, deixou a base em outro estado**. As duas vezes a reexecução passou **sem uma linha de código mudar**, e as duas vezes o caso passava localmente.

O caso de que ficou a identidade é o `e2e/campanhas.spec.ts:236` — a asserção de *público congelado: 5*, que localmente passou 7 de 7 e na CI reprovou uma vez e passou na seguinte. Da outra ocorrência **não ficou registro de qual spec era**, o que é exatamente o sintoma que esta seção existe para corrigir: sem lugar para anotar, cada episódio se resolve com um "roda de novo" e não deixa rastro, e o terceiro começa do zero.

**Por que não se conserta com um `retries`.** Reexecutar esconde a dependência em vez de removê-la, e o dia em que ela virar falha de verdade — dois specs que não podem coexistir — a suíte vai dizer "instável" em vez de "quebrado". O que o defeito pede é **isolamento de dados por spec** (prefixo próprio, como o `configuracao-global.ts` já faz com "Aliado E2E" na T1) ou contagem relativa em vez de absoluta.

**Não é pendência de terceiro nem de negócio**, e por isso está aqui e não na §1–§4: não depende de ninguém responder nada. O que ela precisa é de uma fase com tempo para separar as bases, e enquanto isso não acontece o comportamento conhecido é: **reprovou um caso de contagem e a mudança não toca nele, reexecute — e anote aqui qual foi.**

| Quando | Spec | O que a asserção contava | Desfecho |
|---|---|---|---|
| 09/2026 | `e2e/campanhas.spec.ts:236` | público congelado: 5 | passou na reexecução, sem mudança de código |
| 09/2026 | *não registrado na ocasião* | contagem | passou na reexecução, sem mudança de código |

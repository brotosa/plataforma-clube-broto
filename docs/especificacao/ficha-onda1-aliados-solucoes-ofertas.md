# Ficha de Módulo — Onda 1: Aliados, Soluções e Ofertas
**Plataforma de Administração e Gestão do Clube Broto** · v0.6 — natureza da oferta com três valores (decisão de 24/07) e política de acessibilidade AAA registrada

Mudanças v0.5 → v0.6: Natureza da oferta passa a três valores (Recompensa · Benefício · Cupom de desconto), por decisão de consistência com a plataforma operacional; campo condicional de código/regras do cupom; regra de comissão do cupom em confirmação; nota de governança: o contrato-modelo (Anexo I) prevê duas categorias — recomendar alinhamento do contrato na próxima revisão jurídica. Acessibilidade elevada a AAA via tokens de texto derivados (extensão de design, ver prompt da rodada 2), responsividade priorizada em T1/T4/T6.

Mudanças v0.4 → v0.5 (print da vitrine real): taxonomia v1 de categorias ancorada nas categorias reais da vitrine; carga inicial prevê dump completo do catálogo Minutrade (categoria, descrição, imagem, tipo), reduzindo a fila de curadoria; de-para dos tipos públicos da vitrine (Ofertas · Recompensas · Cupom de desconto) registrado como pendência semântica.

Mudanças v0.3 → v0.4: endereço da sede e contatos com papel tipado no Aliado; campo "Instruções de resgate pós-voucher" na Oferta (fluxos de lead/contato observados na prática); formulário de captura do pré-onboarding formalizado como tela da Onda 2, alimentando os campos desta onda.

Mudanças v0.2 → v0.3: bloco comercial definitivo (comissão por aliado, ambientes de pagamento, vigência contratual); vocabulário contratual adotado (Recompensa, Benefício, Voucher); campos novos na Oferta (natureza e modalidade de pagamento); RN11 (compatibilidade mecânica × ambiente habilitado) e RN12 (suspensão com motivo tipificado); funil de telemetria refinado em três degraus (voucher emitido → resgatado → pago); processo de conciliação de comissão registrado como candidato a módulo próprio.

---

## 1. Objetivo do módulo

Ser o cadastro-mestre da rede do Clube: quem são os aliados, o que oferecem (soluções) e em que condições (ofertas) — com qualidade de dado suficiente para gerar os cards da vitrine, alimentar filtros, cestas e campanhas, e publicar o catálogo na plataforma operacional (Minutrade, a "Operadora" contratual). O módulo também recebe de volta a telemetria de uso e a expõe por oferta e por aliado, transformando a vitrine cheia em vitrine gerida.

### 1.1 Vocabulário oficial (definições do contrato-padrão — a UI usa estes termos)

**Recompensa**: produto/serviço do aliado ofertado gratuitamente para o assinante testar ou experimentar. **Benefício**: produto/serviço adquirido pelo assinante com desconto, vantagem ou condição especial. **Voucher**: o meio universal de obtenção — toda Recompensa ou Benefício é obtido mediante emissão e resgate de voucher; voucher emitido mas não resgatado não computa venda. **Ambiente de pagamento**: *dentro da Plataforma* (pagamento intermediado, processado pelo meio de pagamento da Operadora) ou *fora da Plataforma* (pagamento direto entre assinante e aliado); o aliado habilita um ou ambos. **Comissão**: percentual pago mensalmente pelo aliado ao Broto sobre o valor efetivamente pago pelos assinantes.

## 2. Usuários e permissões (papéis provisórios — consolidar na onda de Usuários)

| Ação | Gestor do Clube | Analista de Aliados | Aprovador | Leitura |
|---|---|---|---|---|
| Visualizar aliados, soluções e ofertas | ● | ● | ● | ● |
| Criar/editar aliado, solução, oferta | ● | ● | — | — |
| Solicitar promoção a **Aliada ativa** | ● | ● | — | — |
| Aprovar/devolver itens na fila de aprovação | ● | — | ● | — |
| Configurar regras de aprovação (motor) | ● | — | — | — |
| Publicar/pausar/encerrar oferta | ● | ● | — | — |
| Gerar exportação de catálogo (publicação) | ● | — | — | — |
| Importar telemetria | ● | ● | — | — |

Segregação de funções: quem solicita não aprova o próprio item (RN06). Dados pessoais de assinantes não circulam neste módulo.

## 3. Entidades e campos

### 3.1 Aliado (entidade `Empresa`, estágio ≥ Aliada ativa)

| Campo | Tipo | Obrig. | Observações |
|---|---|---|---|
| Razão social | texto | ● | |
| Nome fantasia (nome de exibição) | texto | ● | É o nome que aparece na vitrine |
| CNPJ | texto validado | ● | Único; validação de dígito (RN08) |
| Endereço da sede | texto estruturado | ● p/ aliada ativa | Mínimo contratual; ausente no documento de pré-onboarding antigo |
| Logo | imagem | ○¹ | Formatos e proporção definidos no Design; direito de uso confirmado no aceite |
| Descrição institucional | texto curto | ○¹ | |
| Site | URL | ○ | |
| Categorias de atuação | multi-seleção (taxonomia) | ● | Lista fixa na v1; editável no Parametrizador (Onda 3) |
| Contatos | lista (papel: comercial · técnico · financeiro; nome, cargo, e-mail, telefone) | ● ≥1 | Financeiro recomendado ao ativar (recebe o ciclo de conciliação) |
| Data de entrada | data | ● | Preenchida na promoção; na carga inicial vem da planilha |
| Estágio | enum | ● | Máquina de estados da `Empresa`; suspensão exige motivo tipificado (RN12) |
| Score de scouting | número (somente leitura) | — | Exibido aqui; calculado na Onda 2 |
| `id_externo_minutrade` | texto | — | Preenchido na primeira publicação; na carga inicial vem da planilha ("Id do Seller") |

**Bloco comercial (estrutura definitiva, derivada do contrato-padrão):**

| Campo | Tipo | Obrig. | Observações |
|---|---|---|---|
| Contrato vigente | anexo (PDF) + metadados | ● p/ aliada ativa | Data de assinatura, hash/código de verificação (assinatura eletrônica) |
| Vigência | data-base + regra | ● | Padrão contratual: 12 meses com renovação automática; alerta da **janela de não-renovação** (30 dias antes do aniversário) em T1/T2 |
| Status contratual | enum: vigente · denunciado · encerrado | ● | Encerramento cancela acessos e despublica (cascata RN04) |
| Comissão (%) | percentual | ● | Sobre o valor efetivamente pago pelos assinantes; **por aliado, fonte = contrato** (exemplo real: 5% no contrato Agromove). Incide apenas sobre Benefícios pagos; Recompensas não geram comissão |
| Ambientes de pagamento habilitados | dentro da Plataforma · fora da Plataforma · ambos | ● | Escolha do aliado, alterável por solicitação; condiciona as mecânicas disponíveis nas ofertas (RN11) |
| Dados bancários | — | — | **[A CONFIRMAR]** onde residem (Broto ou somente Operadora/meio de pagamento); se a Broto guardar, tratar como dado sensível com permissão específica |

¹ Opcional para salvar; obrigatório para publicar oferta do aliado (RN09 — régua de completude).

### 3.2 Solução

| Campo | Tipo | Obrig. | Observações |
|---|---|---|---|
| Aliado | vínculo | ● | Somente aliados em estágio Aliada ativa (RN01) |
| Nome da solução | texto | ● | |
| Descrição curta | texto ~140c | ○ | Texto do card. **Opcional (errata de 25/08):** conta no percentual da régua RN09 (sem ela, 88%), mas **não** trava a publicação — mesmo tratamento da imagem do card |
| Descrição completa | texto longo | ○ | |
| Categoria | seleção (taxonomia) | ●² | Taxonomia v1 = categorias reais da vitrine (Consultorias e Serviços Profissionais, Formação e Capacitação, Saúde e Bem-estar no Campo, Regularização e Documentação, Certificações e ESG, Mercado e Inteligência Comercial, Agricultura e Pecuária de Precisão, Máquinas e Equipamentos, Tecnologia e Software, Armazenagem e Pós-Colheita, Logística e Transporte) |
| Culturas atendidas | multi-seleção | ●² | Inclui "todas" |
| Cobertura (UFs/regiões) | multi-seleção | ●² | Inclui "nacional" |
| Perfil de cliente-alvo | multi-seleção (pequeno/médio/grande) | ○ | Alimenta recomendação e cestas |
| Tecnologia/diferenciais | texto/tags | ○ | Herda o vocabulário do scouting (IA, satélite, IoT…) |
| Imagem do card | imagem | ○ | **Opcional (errata de 24/08):** aparece na régua RN09 e **não** trava a publicação. **Errata de 25/08:** passa a contar no **percentual** de preenchimento (7 de 8 itens = 88%; com a imagem, 100%) — opcional é "não obrigatório para publicar", não "fora da conta". Continua **sem** bloquear a publicação. Ausência mantém o tratamento neutro do card (RN60) |
| Link externo | URL | ○ | |
| Status | ativa / inativa | ● | Inativar solução pausa suas ofertas publicadas (RN04) |

² Obrigatório para publicar oferta desta solução (RN09). Deixaram de ser exigidos: a **imagem do card** (24/08) e a **descrição curta** (25/08) — ambos seguem na régua como itens opcionais, contando no percentual mas sem travar a publicação.

### 3.3 Oferta

| Campo | Tipo | Obrig. | Observações |
|---|---|---|---|
| Solução | vínculo | ● | |
| Título comercial | texto | ● | Ex.: "15% de desconto na pós-graduação em…" |
| **Natureza** | enum: Recompensa · Benefício · Cupom de desconto | ● | Decisão de 24/07 (consistência com a operação). **Rótulos revistos em 24/08 (só exibição, enum inalterado):** Benefício → **"Benefício (Checkout Broto)"**, Cupom de desconto → **"Desconto (Checkout Externo)"**. Recompensa: gratuita, não comissiona. Benefício: pago dentro do Clube, comissiona sobre valor efetivamente pago. Desconto: desconto percentual para uso no canal do aliado; comissão **[A CONFIRMAR]** |
| Tipo de benefício | enum: % desconto · valor fixo · gratuidade · condição especial | ● | **Habilitação por natureza (errata de 24/08):** Recompensa → só Gratuidade; **Benefício → Valor fixo e Condição especial** (com preço); **Desconto → só "% desconto"** (com o campo Percentual). Ofertas legadas com combinação fora dessa régua são toleradas, mas a edição exige trocar o tipo. Lista fixa na v1 |
| Preço de / preço por | moeda / moeda | condicional | Exigido conforme o tipo; Recompensa exige valor zero; Benefício usa preço. **Não se aplica ao Desconto** (usa Percentual — ver linha abaixo) |
| Percentual de desconto | inteiro 1–100 | condicional | Natureza **Desconto (Checkout Externo)** (tipo "% desconto"). **Substitui preço de/por**: some o preço, fica só o %. Errata de 24/08 — o campo não existia; ofertas Percentual anteriores permanecem com preço de/por e este vazio, sem recálculo. Card exibe "X% de desconto" |
| Código/regras do cupom | texto | opcional | Coluna mantida no banco e na importação, mas **saiu da tela de cadastro em 24/08** (a natureza Desconto usa só o %). Valor legado é preservado na edição; nunca foi obrigatório (errata anterior) |
| **Modalidade de pagamento** | enum: única · recorrente | condicional | Somente Benefícios; recorrente para prestação continuada (definição contratual) |
| Mecânica de resgate | enum: checkout no clube · checkout externo · recompensa gratuita | ● | Mapeamento contratual: checkout no clube = pagamento *dentro da Plataforma*; checkout externo = *fora da Plataforma*; recompensa gratuita = Recompensa. Toda mecânica emite voucher |
| URL de resgate externo | URL | condicional | Obrigatória se mecânica = checkout externo com resgate por link |
| **Instruções de resgate pós-voucher** | texto | condicional | Fluxo operacional quando o resgate não é automático (contato, lead direcionado ao aliado — caso real Viasat); recomendado para checkout externo; previsto no contrato ("assinante é orientado a contatar o aliado") |
| Vigência início / fim | data / data | ● / ○ | Fim vazio = prazo indeterminado; fim < hoje → **Expirada** automática (RN03) |
| Limite de resgates | número | ○ | **[A CONFIRMAR]** se a Minutrade suporta limite; se não, campo fica interno (alerta ao atingir) |
| Status | enum: Rascunho · Publicada · Pausada · Encerrada · Expirada | ● | Porta de aprovação controlada pelo **motor de aprovação** — nasce desligada para Oferta, ligável em T7 sem código |
| Vouchers emitidos / resgatados / Compras | números (somente leitura) | — | Telemetria; jamais editáveis (RN07). "Resgates" da base atual: **[A CONFIRMAR]** se representa emissão ou resgate efetivo |
| Pendente de republicação | flag automática | — | Ligada quando uma oferta publicada é alterada após o último export (RN10) |
| `id_externo_minutrade` | texto | — | Vínculo com a oferta na operacional |

A comissão **não** é campo da oferta: vem do bloco comercial do aliado e é aplicada no cálculo de receita (seção 6). Taxas transacionais do meio de pagamento (hoje: cartão 3,5% + R$0,40; PIX 1%) são parâmetros globais do Clube — entram no Parametrizador (Onda 3) para cálculo de receita líquida estimada, não no cadastro do aliado.

## 4. Regras de negócio

1. **RN01** — Soluções só podem ser criadas para empresas em estágio *Aliada ativa*.
2. **RN02** — Oferta só pode ser publicada se a solução estiver ativa e o aliado em estágio *Aliada ativa* com contrato vigente.
3. **RN03** — Vigência fim anterior à data corrente muda o status para *Expirada* automaticamente (job diário).
4. **RN04** — Suspender/inativar um aliado, encerrar seu contrato ou inativar uma solução pausa em cascata todas as ofertas publicadas afetadas e as marca para despublicação no próximo export.
5. **RN05** — Nada é excluído após a primeira publicação: apenas inativado/encerrado, preservando trilha de auditoria.
6. **RN06** — Aprovações passam pelo **motor genérico de aprovação** (Onda 1): regra por tipo de entidade, ligável/desligável sem código, com designação de aprovadores; nasce com *promoção a Aliada ativa* ligada e *publicação de Oferta* desligada. Fluxo: Solicitada → Aprovada | Devolvida (comentário obrigatório). Solicitante ≠ aprovador.
7. **RN07** — Telemetria (vouchers, compras) é somente leitura, com origem, data e arquivo de importação rastreáveis.
8. **RN08** — CNPJ único e validado.
9. **RN09** — Régua de completude: publicar oferta exige o conjunto mínimo do card (nome de exibição e logo do aliado; nome, categoria, culturas e cobertura da solução — **seis itens obrigatórios**). São itens **opcionais** a **imagem do card** (errata de 24/08) e a **descrição curta** (errata de 25/08): aparecem na régua como orientação, mas não bloqueiam a publicação — ausência da imagem mantém o tratamento neutro do card (RN60). **Errata de 25/08 — duas medidas distintas:** o **percentual** mede o preenchimento e conta **todos** os oito itens, inclusive os opcionais (falta um → 88%; faltam os dois opcionais → 75%; completo → 100%); a **publicabilidade** (`completa`) conta só os seis obrigatórios, então a oferta é publicável mesmo abaixo de 100%. "Opcional" quer dizer "não obrigatório para publicar", não "não conta na régua".
10. **RN10** — Alterar campos publicáveis de uma oferta *Publicada* liga a flag *Pendente de republicação*; o export seguinte a limpa. Sem versionamento formal na v1 (a auditoria guarda o histórico).
11. **RN11** — Compatibilidade mecânica × ambiente: *checkout no clube* exige ambiente **dentro da Plataforma** habilitado no bloco comercial do aliado; *checkout externo* exige **fora da Plataforma**; *recompensa gratuita* independe. A UI desabilita a mecânica incompatível e explica o porquê.
12. **RN12** — Suspensão de aliado exige motivo tipificado (ex.: *inadimplência de comissão >30 dias* — hipótese contratual; *decisão de curadoria* — prerrogativa contratual do Broto; *outros*, com descrição), registrado na auditoria.

## 5. Telas (insumo para o Claude Design)

| # | Tela | Conteúdo essencial |
|---|---|---|
| T1 | **Lista de aliados** | Tabela: nome, categorias, estágio, nº soluções, ofertas ativas, vouchers 90d, completude; busca e filtros (categoria, estágio, "sem oferta ativa"); alerta de janela contratual de não-renovação; ação "novo aliado" |
| T2 | **Ficha do aliado** | Cabeçalho de identidade (logo, nome, categorias, estágio, score) + abas: Visão geral · Soluções · Ofertas · Comercial (contrato, vigência e alerta de janela, comissão %, ambientes de pagamento) · Scouting (Onda 2, placeholder) · Contatos · Integração |
| T3 | **Cadastro/edição de solução** | Formulário com **pré-visualização do card ao vivo** e régua de completude |
| T4 | **Lista de ofertas (transversal)** | Todas as ofertas: título, aliado, natureza, mecânica, benefício, vigência, status, vouchers emitidos/resgatados, compras. Filtros; destaques: **ofertas sem resgate há 90+ dias** e **vigências a vencer em 15 dias**; KPI "vitrine viva" |
| T5 | **Cadastro/edição de oferta** | Natureza, tipo de benefício (condiciona preços), modalidade única/recorrente, mecânica (com RN11 aplicada — incompatíveis desabilitadas com explicação), vigência, limite; pré-visualização; publicar/pausar |
| T6 | **Fila de aprovação** | Pendências com dossiê resumido expansível; aprovar / devolver com comentário; histórico |
| T7 | **Regras de aprovação (motor)** | Por tipo de entidade: ligar/desligar exigência e designar aprovadores; alterações auditadas |

Estados obrigatórios em todas as telas: vazio, carregando, erro e filtro sem resultados. Padrão visual: DSeed claro + extensões da LP (D8).

## 6. Integração Minutrade (batch, v1) e economia da oferta

**Exportação de catálogo (Broto → Minutrade).** Cada publicação gera um pacote com os itens publicáveis no formato de importação da Minutrade — **[A CONFIRMAR: layout e meio de entrega]** (até lá, JSON/CSV genérico). Cada publicação é registrada (autor, data, conteúdo, diff) e limpa as flags *Pendente de republicação*.

**Importação de telemetria (Minutrade → Broto) — layout-alvo a requisitar** (LGPD tratada em paralelo; contingência agregada mantida):

- Arquivo `telemetria_uso_AAAAMMDD.csv`, uma linha por evento:
  `data_hora_evento; cpf_assinante; id_seller; id_oferta; id_voucher; tipo_evento; valor_transacao; canal`
- `tipo_evento` reflete o funil contratual em três degraus: `emissao_voucher` | `resgate_voucher` | `compra_confirmada` (pagamento processado, disponível quando *dentro da Plataforma*). **[A CONFIRMAR]** o cardápio real de eventos da Minutrade — e o que o campo "Resgates" da base atual representa (emissões × resgates efetivos).
- Para vendas **fora da Plataforma**, o valor pago não transita pela Operadora: ele só chega via **conciliação mensal** (abaixo). O Dashboard deve distinguir "venda confirmada" de "voucher resgatado aguardando conciliação".
- Receita Broto = valor efetivamente pago × comissão % do aliado (Benefícios apenas). Periodicidade proposta: diária. **[A CONFIRMAR]** capacidade da Minutrade.

**Processo contratual de conciliação de comissão (fora da Plataforma)** — registrado como **candidato a módulo próprio ("Comissões e conciliação")**, fora da Onda 1: relatório gerencial ao aliado até o 5º dia útil (vouchers emitidos em 30 dias) → manifestação do aliado em 5 dias úteis (vouchers resgatados + valores pagos) → NF da comissão → boleto via Operadora. **[A CONFIRMAR]** quem produz esse relatório hoje e se a plataforma deve absorver o ciclo (ela terá todos os dados para isso).

## 7. Carga inicial (seed a partir das planilhas atuais)

| Origem (planilha) | Destino (modelo) | Regra |
|---|---|---|
| Lista de Sellers → linha | `Empresa` (estágio *Aliada ativa*) | "Seller" → nome de exibição; "Data de Entrada" → data de entrada; "Id do Seller" → `id_externo_minutrade` |
| Lista de Ofertas → linha | `Solução` + `Oferta` | "Produto" → nome da solução e título da oferta; heurística: mesmo seller + mesmo texto de produto = mesma solução |
| "CheckOut" | Mecânica + Natureza | checkout no clube/externo → Benefício; recompensa gratuita → Recompensa |
| "Preço/Desconto/Preço Final" | Preço de / benefício / preço por | Tipo inferido; preço final 0 + recompensa → gratuidade |
| "Status da Oferta" | Status | Ativa → Publicada; Inativa → Encerrada |
| "Resgates"/"Compras" | Telemetria inicial | Carga única "acumulado histórico até a data da carga"; rótulo do campo aguarda o [A CONFIRMAR] emissão × resgate |
| Dump do catálogo Minutrade (a solicitar) | Categoria, descrição, imagem e tipo por oferta | Reduz drasticamente a fila de curadoria; **[A CONFIRMAR]** disponibilidade do export completo |
| Contratos vigentes (PDFs) | Bloco comercial | Anexar contrato, data, comissão % e ambientes por aliado — esforço de levantamento junto ao jurídico/comercial |

A carga passa por **tela de conferência** antes de efetivar. Campos inexistentes na origem ficam **pendentes** e viram fila de curadoria com régua visível (RN09).

## 8. Métricas de sucesso do módulo

Percentual de aliados com cadastro completo; tempo mediano do rascunho à publicação; percentual de ofertas ativas com resgate em 90 dias (vitrine viva); cobertura de categorias; e, com o bloco comercial povoado, **receita de comissão estimada por aliado/oferta** (valor pago × comissão %).

## 9. Fora de escopo da Onda 1

Avaliação e score de scouting, incluindo o **formulário de captura do pré-onboarding** (Ficha Cadastral do Aliado v1 — tela do estágio *Em negociação*, Onda 2; os campos que ele alimenta já existem nesta onda e são editáveis em T2/T3/T5); edição de taxonomias e parâmetros globais como taxas transacionais (Onda 3); campanhas, cestas e negociação de benefícios por campanha (Onda 4); dados pessoais de assinantes (Onda 5); **conciliação de comissões e emissão de relatório gerencial** (candidata a onda própria); execução automática de integração (v1 é batch manual).

## 10. Premissas de trabalho e pendências

**Premissa de stack (a validar pela TI Broto):** React + TypeScript (Next.js), PostgreSQL em Amazon RDS, arquivos em S3, deploy containerizado (ECS Fargate ou App Runner). A substituição pela stack padrão da TI não altera esta ficha; altera apenas o prompt do Code.

**[A CONFIRMAR] consolidado:** layout e meio de entrega do arquivo de importação da Minutrade; cardápio de eventos de telemetria e periodicidade; significado de "Resgates" na base atual (emissão × resgate efetivo); a comissão varia por aliado ou é padrão 5% no contrato-modelo; onde residem os dados bancários dos aliados; quem produz o relatório gerencial de conciliação hoje e se a plataforma absorve o ciclo; suporte da Minutrade a limite de resgates por oferta; disponibilidade de dump completo do catálogo publicado (categorias, descrições, imagens, tipos); tag "Recompensa" em cards pagos na vitrine (erro de categorização ou regra — esclarecer antes de a plataforma publicar); regra de comissão do Cupom de desconto; validação da definição operacional do cupom; alinhamento do contrato-modelo (Anexo I prevê duas categorias; a operação pratica três) na próxima revisão jurídica.

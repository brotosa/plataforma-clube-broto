# Ficha Cadastral do Aliado — versão para a plataforma (v1)
**Substitui o documento "Ficha de cadastro de Recompensas e Benefícios — Aliado Clube Broto (Pré-Onboarding)"** · proposta para validação · 24/07/2026

## Diagnóstico do documento atual (resumo)

| Problema observado | Consequência | Solução na versão plataforma |
|---|---|---|
| Todos os campos em texto livre | Nada filtrável; redigitação na Minutrade e em análises | Campos tipados com taxonomias (categoria, cobertura, público, modelo de negócio) |
| Confusão conceitual: desconto registrado como "Recompensa" no exemplo real | Cadastro em desacordo com as definições do próprio contrato | Definições embutidas no formulário + validação (Recompensa exige gratuidade) |
| Ofertas descritas em parágrafo | Oferta precisa ser reconstruída manualmente depois | Cada oferta pretendida nasce como **rascunho estruturado de Solução + Oferta** |
| Sem CNPJ, razão social, endereço | Mínimo contratual ausente; retrabalho jurídico | Seção de identificação completa |
| "Usará checkout?" binário | Não captura os dois ambientes contratuais nem o fluxo de resgate real | Ambientes (dentro · fora · ambos) + **instruções de resgate pós-voucher** |
| Indicadores (ticket, NPS, churn) soltos em "informações adicionais" | Valor de qualificação se perde | Seção própria, datada e marcada "autodeclarado", alimentando o dossiê de scouting |
| Sem data, autor ou versão | Não se sabe quando/quem preencheu | Metadados automáticos da plataforma + trilha de auditoria |
| Um documento Word por aliado | Informação presa em arquivo | Formulário da plataforma; o Word morre |

## Princípio da obrigatoriedade progressiva

Três momentos, três réguas — o formulário nunca exige na negociação o que só importa na publicação:

**M1 · Pré-onboarding** (estágio *Em negociação*): seções A parcial, B, C (1 contato), D, E parcial, F. **M2 · Promoção a Aliada ativa**: A completa (CNPJ validado, endereço), C completo, E completo (contrato anexado, comissão, ambientes). **M3 · Publicação de oferta**: régua de completude do card (RN09 da ficha da Onda 1).

## Estrutura proposta

### Seção A — Identificação
Razão social · Nome fantasia (nome de exibição na vitrine) · CNPJ (validação de dígito; obrigatório em M2) · Endereço da sede · Site · Logo (asset separado: SVG ou PNG fundo transparente, especificação definida no Design) · Apresentação institucional (texto de card, até ~400 caracteres) · Diferenciais (até 5 itens curtos, um por linha — substitui o parágrafo livre).

### Seção B — Classificação (tudo tipado)
Setor/categoria (taxonomia do Clube) · Culturas atendidas · Cobertura (UFs ou nacional) · Público-alvo em dois eixos: porte do produtor (pequeno · médio · grande) e natureza (PF · PJ · ambas) — o exemplo Viasat mostrou que um eixo só não basta · Modelo de negócio (taxonomia herdada do scouting: SaaS, serviço, contrato a prazo, marketplace…).

### Seção C — Contatos com papel
Lista de contatos com **papel tipado**: comercial · técnico · financeiro (nome, cargo, e-mail, telefone). Mínimo 1 em M1; recomendado comercial + financeiro em M2 (o financeiro recebe o ciclo de conciliação de comissão).

### Seção D — Indicadores declarados (qualificação)
Ticket médio · NPS · Churn mensal · Nº de clientes · Ano de fundação — cada um com **data da declaração** e etiqueta **"autodeclarado"** (grau de confiança distinto do apurado em pesquisa). Destino: dossiê de scouting/qualificação (Onda 2); exibidos na aba Scouting da ficha do aliado, nunca no card público.

### Seção E — Comercial Clube
Comissão % (take rate) sobre valor efetivamente pago · Ambientes de pagamento habilitados (dentro da Plataforma · fora da Plataforma · ambos) · Contrato (anexo, data, vigência — obrigatório em M2) · Observações da negociação. Espelha o bloco comercial da ficha da Onda 1 (v0.4).

### Seção F — Ofertas pretendidas (estruturadas)
Para cada oferta pretendida, os campos mínimos do modelo de Oferta: **Natureza** (Recompensa · Benefício — com as definições contratuais exibidas no formulário) · Descrição/título · Tipo de benefício e valores · Mecânica de resgate · **Instruções de resgate pós-voucher** (texto operacional: URL, ou fluxo de contato/lead — ex.: "voucher direciona o assinante ao administrador comercial do aliado") · Vigência pretendida.

**Validações embutidas (o formulário ensina):** natureza = Recompensa exige valor zero — se houver preço ou desconto, a plataforma bloqueia e explica: "Desconto é Benefício; Recompensa é gratuidade para experimentar (definição contratual)". Mecânica × ambientes segue a RN11.

**Aproveitamento automático:** ao promover a empresa a Aliada ativa, as seções A/B/C/E gravam o cadastro-mestre, a D grava o dossiê de qualificação e **cada linha da F vira um rascunho de Solução + Oferta** pendente de curadoria — completude visível, zero redigitação.

## Onde isso vive na plataforma

O formulário é a materialização do estágio *Em negociação* do pipeline (tela da **Onda 2 — Mercado & Scout**); os campos que ele alimenta já existem todos na **Onda 1** e são editáveis nas telas T2/T3/T5. Evolução prevista (v2, decisão futura): link externo seguro para o próprio aliado preencher M1, com revisão do analista antes de gravar.

## De-para com o documento atual

| Campo do Word | Destino na plataforma |
|---|---|
| Nome da empresa e logomarca | A: Nome fantasia + Logo (asset separado) |
| Ponto-focal (contato) | C: contatos com papel tipado |
| Setor principal e categoria | B: categoria (taxonomia) |
| Modelo de negócio | B: modelo de negócio (taxonomia) |
| Público-alvo | B: porte × natureza (dois eixos tipados) |
| Área de atuação | B: cobertura (UFs/nacional) |
| Diferenciais / Apresentação | A: diferenciais (5 itens) + apresentação (card) |
| Ticket médio · NPS · Churn (info adicionais) | D: indicadores declarados, datados |
| Recompensa / Benefício Clube Broto | F: ofertas pretendidas estruturadas, com validação de natureza |
| Modelo de comissionamento (take rate) | E: comissão % |
| "Usará checkout Clube Broto?" + modelo acordado | E: ambientes de pagamento + F: instruções de resgate pós-voucher |

## Pendências desta proposta

**[A CONFIRMAR]**: o take rate de 5% apareceu no contrato Agromove e na ficha Viasat — é o padrão do contrato-modelo ou é negociado caso a caso? (Se padrão, o campo nasce pré-preenchido com 5%, editável.) · O preenchimento externo pelo aliado (link seguro) entra na v1 da Onda 2 ou fica para v2?

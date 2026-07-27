# Ficha de Módulo — Onda 12: Patrocinadores e telemetria da operadora
**Plataforma de Administração e Gestão do Clube Broto** · v0.2 para validação · 27/07/2026

Onda funcional em duas fases (**F19** e **F20**). Origem: fechar o escopo da versão 1 com a gestão de patrocinadores e com a entrada regrada da telemetria da Minutrade. Continuidade: regras **RN62–RN69**. Contrato visual: protótipo **v11.2** (T32 · T33 · R1), aprovado em 27/07 — congelado.

---

## 1. O problema que esta onda resolve

Dois problemas com a mesma raiz: dado que existe e não tem casa.

**O patrocinador** — empresa que compra assinaturas do Clube para dar aos próprios clientes PF — é invisível à plataforma. O primeiro contrato real (Yamer) vive em pasta; saldo em planilha; relatório à mão. Enquanto isso, a operadora já entrega quatro relatórios (layouts reais de 27/07) que ninguém ingere: catálogo, contadores por oferta, extrato de resgates e a base de usuários com a tipologia de assinatura completa — inclusive a coluna `Patrocinador`, nativa da fonte.

**A telemetria chega incompleta e ambígua.** Falta a chave de junção (CPF, requisitado formalmente em 27/07), faltam duas fontes (acessos e consumo de soluções) e há duas contagens divergentes para o mesmo assunto (contador agregado por oferta somando 227 · extrato nominal com 38 eventos). A onda não espera a resposta da operadora para começar: constrói a esteira completa agora, com as regras que tornam a ambiguidade visível em vez de silenciosa, e a junção nominal acende sozinha quando a coluna chegar — **sem mudança de código**.

## 2. O que a onda entrega

**F19 — Patrocinador (dado próprio da plataforma).** Entidade, contrato com minuta anexada, vínculo com vigência, perfil de assinatura, campanha etiquetada com registro de aprovação externa, telas T32/T33, relatório R1, seção 4.7 do Guia, ajustes em Assinantes e na importação. Não depende da operadora. Fecha em **1.1.0**.

**F20 — Esteira de telemetria.** Importação dos quatro layouts reais, idempotente e com procedência; contadores agregados e catálogo entram já (não carregam dado pessoal); a junção nominal é implementada por completo e permanece **inerte por falta de chave**, contando as linhas recusadas com causa nomeada. Acessos e consumo de soluções permanecem em `aguarda fonte`. Card de Patrocinadores no Dashboard. Fecha em **1.2.0**.

**Por que duas fases e não uma:** o PR precisa caber num red team humano. F19 é entidade nova com migration; F20 é ingestão com parser. Juntas dariam um PR que ninguém audita de verdade.

## 3. Modelo

**Patrocinador** — razão social, CNPJ, segmento, contato (nome, e-mail, telefone), responsável comercial interno, status (`ativo` · `encerrado`), observações.

**Contrato** — minuta (arquivo PDF; data, autor; substituição auditada), data de assinatura, vigência início/fim, preço unitário por assinatura/ano, valor total contratado, assinaturas adquiridas. *Ativadas* e *saldo* são derivados, nunca colunas.

**Vínculo de patrocínio** — patrocinador, assinante, **início e fim** (fim nulo = vigente). É o registro que sustenta a derivação e a rotatividade (§4, RN62).

**Assinante (ajuste)** — perfil de assinatura (`Patrocinada` · `Promocional Broto` · `Autoassinatura`), plano/periodicidade/método/preço quando autoassinatura, estado do usuário (`cadastrado` · `freemium` · `assinante`) para o funil.

**Campanha (ajuste)** — patrocinador opcional (etiqueta) + aprovação externa (aprovador, data, evidência anexada).

**Importação de telemetria** — arquivo, tipo de layout, data de geração declarada, hash do conteúdo, resultado (linhas lidas, aplicadas, recusadas por causa).

Campo sem valor = traço com motivo. Nunca zero silencioso, nunca estimativa.

## 4. Regras

**62. RN62 — Patrocinador, contrato e saldo derivado.** Gestor cria, edita e inativa; leitura para todos os papéis; a célula do Administrador da Plataforma é explicitada na matriz (padrão RN46). **Saldo = adquiridas − vínculos vigentes**, sempre derivado, nunca digitado nem persistido; sem adquiridas confirmadas não há saldo (traço com motivo, jamais zero). O vínculo tem início e fim: encerrar um vínculo devolve a vaga ao saldo e **preserva o histórico** — o modelo comporta rotatividade de vaga sem que a plataforma decida se ela é permitida. Minuta anexada com data e autor; substituir não apaga a anterior da trilha (RN49).

**63. RN63 — Perfil de assinatura, com de-para da fonte.** `Patrocinada` ← "Assinatura Patrocinada" (vínculo obrigatório; o valor `Broto` na coluna nativa `Patrocinador` mapeia para `Promocional Broto`) · `Autoassinatura` ← "Assinatura Paga" (plano, periodicidade, método e preço da fonte). `Usuário Cadastrado` e `Usuário Freemium` são **estados do usuário**, não perfis — alimentam o funil de ativação. Semântica final presa ao dicionário requisitado (`[A CONFIRMAR — Minutrade]`); até lá, o funil exibe a estrutura com o motivo escrito.

**64. RN64 — Campanha de patrocinador.** Sob medida = recorte de público (base do patrocinador) + etiqueta. A aprovação pode ocorrer fora da plataforma: registra-se **quem aprovou, quando e a evidência anexada** — decisão sempre humana, sem workflow novo. Sem registro, a campanha exibe "pendente de registro" e **o kit é gerado assim mesmo, carimbado com a pendência** (premissa de trabalho — §7).

**65. RN65 — Três motivos de traço no consumo.** Cada card da aba Consumo (T33) e do R1 declara sua origem no selo: **vivo** (dado próprio: base por perfil e ativação) · **aguarda chave** (resgates, compras, funil — a fonte existe, falta o CPF) · **aguarda fonte** (acessos, consumo de soluções — relatório requisitado). Nenhum número aproximado em nenhuma hipótese; os cards acendem **sem mudança de layout** quando cada camada chegar.

**66. RN66 — R1 agregado.** O Relatório do Patrocinador não carrega dado pessoal identificável; listagem nominal só pela exportação com finalidade (Onda 5). Toda geração de R1 é auditada com período e finalidade.

**67. RN67 — Importação por snapshot, com procedência.** Os relatórios da operadora são acumulados, não incrementais: a importação é **idempotente** — reimportar o mesmo arquivo não duplica nada e não altera contagem. Toda importação grava procedência (arquivo, data de geração declarada, hash do conteúdo) e devolve resultado com linhas lidas, aplicadas e recusadas **por causa nomeada** (padrão RN55). Higienes de layout são aplicadas no parser e declaradas: coluna de índice sem nome, emoji no status do seller, apóstrofo à esquerda em telefone, `'-` como vazio. **Dado da operadora é somente leitura na plataforma** — correção se faz na origem, nunca por edição local, sob pena de a próxima importação desfazê-la em silêncio.

**68. RN68 — Duas contagens, uma verdade.** O contador agregado por oferta (lista de ofertas) e os eventos nominais (extrato de resgates) medem coisas diferentes e divergem hoje (227 × 38). **Nunca são somados, nunca são apresentados como o mesmo número**: cada um aparece com a origem nomeada — "catálogo" e "extrato" — e com a data do arquivo. Enquanto a operadora não documentar a regra de contagem de cada um (`[A CONFIRMAR — Minutrade]`), a divergência é exibida como divergência, não reconciliada por conta própria.

**69. RN69 — Junção nominal só por CPF.** Todo vínculo entre linha da operadora e assinante da plataforma se faz exclusivamente por **CPF-HMAC** (RN36). Linha sem CPF não entra na base nominal e é contada no resultado da importação com a causa "sem chave de junção". **Não há junção por e-mail, nome ou telefone** — decisão registrada, não omissão. Quando a operadora incluir a coluna, a mesma esteira passa a ligar sem alteração de código.

## 5. Contrato visual

Protótipo **v11.2**, aprovado e congelado: T32 (lista), T33 (detalhe — contrato, base, consumo com os três motivos da RN65, campanhas), R1 (relatório imprimível, agregado), ajustes em Assinantes e importação, seção 4.7 do Guia. Yamer é o caso real, rotulado, com os valores do contrato em `[A CONFIRMAR]` visível.

**CSS — atenção na implementação:** a camada canônica é a **do repositório**. O `dseed-admin.css` da entrega do Design está sem os patches F16/F17 (quatro seletores: `gd-volta`, `kb-arrasto-aviso`, `kb-descarte`, `mapa-caixa`). Partir do repo e **acrescentar apenas** o bloco `Extensão (Onda 12 · Patrocinadores)` — seis linhas, seletor único `.pt-drop`. Não copiar o arquivo da entrega por cima.

## 6. Fora de escopo

Portal externo do patrocinador (relatório é entregue, não acessado); cobrança e processamento de pagamento (operadora); junção por e-mail (RN69 — decisão registrada); telemetria de acessos e consumo de soluções (depende da operadora); reconciliação automática das duas contagens (RN68).

## 7. Pendências

**Premissas de trabalho adotadas** (avançam a implementação; derrubá-las depois é barato):
- **Rotatividade de vaga** — o modelo a comporta sem decidi-la (RN62): se a minuta proibir substituição, basta nunca encerrar vínculo, e nada no código muda. **A pergunta permanece de negócio**, mas deixou de bloquear a fase.
- **Kit de campanha sem aprovação registrada** — gera com carimbo de pendência, não bloqueia (RN64). Escolha reversível e menos destrutiva. `[A CONFIRMAR — Superintendência]`.
- **Valores do contrato Yamer** — são dado, entram pela tela; não bloqueiam código. `[A CONFIRMAR — Marco]`.

**[A CONFIRMAR — Minutrade]:** os sete itens da requisição de 27/07 — CPF retroativo, IDs no extrato, acessos e uso, dicionário de estados, regra de contagem (RN68), periodicidade, canal autenticado.

**[A CONFIRMAR — Marco]:** adotar o `.skip` (atalho "pular para o conteúdo") que o Design criou e o repositório nunca recebeu — ganho de acessibilidade barato, hoje fora do escopo da F19.

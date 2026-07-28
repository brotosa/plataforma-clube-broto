# Prompt para o Claude Code — Onda 12: Telemetria da operadora · Fase F20

> **Mesmo repositório.** Pré-requisito: **F1–F19 mergeadas na main** (verifique e reporte se algo faltar). Fase **funcional com migration**, de ingestão. O produto está em produção: nada aqui altera comportamento existente, exceto os ajustes declarados na lista de Ofertas, no Dashboard e no Guia. Anexos na main: `docs/especificacao/ficha-onda12-patrocinadores.md` (**v0.4**) e este prompt.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — ficha v0.3 nas fontes da verdade, F20 no mapa de fases, **RN67–RN70** entre as regras.

## 1. O princípio que organiza a fase

A esteira é construída **inteira**, e a fase assume — como **premissa declarada na ficha §1** — que a base da operadora passa a trazer o **CPF do titular**. O que **não** foi observado em arquivo real é o nome exato da coluna, se vem com máscara e se cobre todas as linhas. Por isso o parser **detecta a coluna pelo cabeçalho**, tolera as duas formas e continua sabendo recusar com causa nomeada quando a coluna faltar — arquivo histórico não deve derrubar a importação.

Não invente junção alternativa. Não deduza CPF a partir de outro campo. Não case por e-mail, nome ou telefone: a RN69 é decisão registrada, não omissão.

## 2. Migration e modelo

Migration aditiva, com `down.sql` verificado, no padrão da F19 (que documenta a perda antes de executá-la).

- **ImportacaoTelemetria** — tipo de layout (enum `USUARIOS` · `RESGATES` · `SELLERS` · `OFERTAS`), nome do arquivo, data de geração declarada, **hash do conteúdo** (índice único por hash + tipo, que é o que sustenta a idempotência), autor, momento, e o resultado: lidas, aplicadas, recusadas, com contagem por causa.
- **ContadorDeOfertaTelemetria** — oferta, resgates, compras, data do arquivo, importação de origem. Último retrato por oferta.
- **DivergenciaDeCatalogo** — importação, tipo, identificador, descrição do que difere.
- **EventoDeResgateTelemetria** — assinante, data do evento, produto, tipo de oferta, seller, `ofertaId` **anulável**. Chave natural para deduplicação, porque a fonte é acumulada e será reimportada todo dia.

## 3. Parser e higienes — os layouts reais

Os arquivos de catálogo entram em `dados/` e são amostra real. As higienes abaixo foram observadas neles e **precisam de teste próprio**, cada uma: coluna de índice sem nome na primeira posição; **emoji no campo de status do seller**; apóstrofo à esquerda em telefone (artefato de planilha); `'-` significando vazio. Trate-as no parser, nunca na origem.

Detecte o layout pelo cabeçalho, não pelo nome do arquivo — o nome traz sufixo aleatório da operadora.

## 4. Idempotência e procedência (RN67)

Reimportar o mesmo arquivo **não duplica nada e não altera contagem** — reconhecido pelo hash do conteúdo, com o resultado informando que já havia sido importado. Arquivo diferente do mesmo tipo atualiza o retrato. Toda importação grava procedência e é auditada (RN49).

**Dado da operadora é somente leitura.** Nenhuma tela permite editar contador, evento ou divergência. Se a implementação exigir um caminho de escrita, ele é da importação e de mais ninguém.

## 5. Reconciliação (RN70)

Compare o catálogo da operadora com o cadastro da plataforma e **registre as divergências**: oferta ativa aqui e ausente lá; item presente lá e desconhecido aqui; atributo divergente. **Não corrija nada, em nenhuma hipótese** — nem "só o nome", nem "só o status". Acrescente uma **cerca de arquitetura** (teste que quebra o build) provando que o caminho de importação não escreve nas tabelas de cadastro de aliado, solução e oferta, exceto nas colunas de contador que a fase cria.

## 6. Caminho nominal, inerte hoje (RN69)

**A coluna de chave.** Detectada pelo cabeçalho (aceite as grafias prováveis — `CPF`, `CPF do Cliente`, `CPF Titular` — e registre no PR qual encontrou); aceita com ou sem máscara; **dígito verificador conferido** antes de qualquer uso. O CPF **nunca é gravado em claro**: entra pelo caminho de cifra e HMAC da Onda 5 (`infra/assinantes/protecao-cpf`), e não aparece em log, mensagem de erro nem no resultado da importação.

**Três causas de recusa distintas**, porque respondem perguntas diferentes: *sem coluna de CPF* (layout incompleto), *CPF inválido* (dado sujo na origem) e *CPF sem assinante correspondente* (base desalinhada). Contá-las juntas esconderia justamente o que a operação precisa saber.

**Usuários:** resolve o assinante por CPF-HMAC (`infra/assinantes/protecao-cpf`, RN36) e atualiza perfil de assinatura, estado do usuário, plano, periodicidade, método e preço; a coluna `Patrocinador` alimenta o **vínculo de patrocínio** da F19, com `Broto` mapeando para `Promocional Broto` (RN63). Vínculo já existente não é duplicado.

**Resgates:** cria evento por assinante resolvido, deduplicado pela chave natural.

Os testes cobrem **os dois estados**, e ambos importam: contra **fixture sintética com CPF** (junção acontece, vínculo criado, perfil atualizado, evento gravado) e contra **fixture sem a coluna** (todas as linhas recusadas com a causa certa, nada gravado, nenhuma exceção) — o segundo caso não é hipotético: arquivos anteriores à mudança não têm a coluna, e a importação deles precisa falhar bem.

## 6-a. Os selos do Consumo passam a ser derivados do dado

A F19 gravou os selos da aba Consumo **fixos no código** — `selo: "AGUARDA_CHAVE"` literal em `infra/consultas/patrocinadores.ts` para resgates, compras e funil. Com dado apurado no banco, esses cards precisam acender, e hoje não acendem.

Torne o selo **derivado da existência do dado**: com apuração, `VIVO`, o número e a data do retrato; sem apuração, `AGUARDA_CHAVE` ou `AGUARDA_FONTE` com o motivo que já existe. Acessos e consumo de soluções permanecem em `AGUARDA_FONTE` — não há fonte para eles, e derivar não inventa dado. O mesmo vale para o **R1**, que espelha os selos. Teste os dois estados de cada card. **Sem este item, a promessa da RN65 — "acende sem mudança de layout" — é falsa**, e a chegada do dado exigiria uma fase só para trocar constantes.

## 7. Amostras — restrição de LGPD, inegociável

Os arquivos de **usuários e resgates reais trazem nome, e-mail, telefone e agora CPF de mais de mil titulares — e não entram no repositório em nenhuma hipótese**, nem como fixture. Com a chegada do CPF a restrição fica mais dura, não menos. O caminho nominal é exercitado por **fixture sintética** com a mesma estrutura e dados fabricados (CPF válido de teste), no padrão dos `*-SINTETICO-homologacao.csv`. Se precisar de amostra real para conferir formato, descreva o cabeçalho no PR — não o commite.

## 8. Telas

**T34 — Telemetria da operadora** (nova): envio com detecção de layout, histórico de importações com resultado e causas, relatório de divergências. **Não há protótipo**: reuse o padrão das telas de importação existentes (carga inicial, importação de assinantes) e os componentes do `dseed-admin.css` — **nenhuma classe nova**. Se concluir que uma é indispensável, pare e reporte em vez de inventá-la.

**Ajustes:** lista de Ofertas ganha resgates e compras com a data do retrato e a origem **"catálogo"** explícita na coluna (RN68 — nunca somar com evento nominal); Dashboard ganha card de telemetria (última importação e sua data); Guia ganha a seção pela fonte única, no padrão que a F19 estabeleceu para seção nascida depois da referência.

**Permissões:** `IMPORTAR_TELEMETRIA` para **Gestor e Analista**; leitura do histórico e das divergências para todos os papéis; célula do `ADMINISTRADOR_PLATAFORMA` explicitada na matriz.

## 9. Qualidade e encerramento

Testes: idempotência por hash (reimportar não muda nada), cada higiene isoladamente, detecção de layout por cabeçalho, detecção da coluna de CPF com e sem máscara, as **três causas de recusa** contadas separadamente, CPF nunca em claro (varredura de log e do resultado), junção completa sobre fixture sintética, **os dois estados de cada card do Consumo e do R1**, reconciliação relatando sem corrigir, cerca de arquitetura da RN70, permissões. E2e com axe-core AAA e 380px na T34. **Suíte F1–F19 integralmente verde.** PR aberto **sem merge**, declarando: o que a migration cria, quais higienes foram necessárias além das quatro previstas, e o que fica pendente da resposta da operadora.

## Mensagem para abrir a sessão (colar como está)

Verifique que **F1–F19 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 12 (**v0.4**) em `docs/especificacao/`. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda12-f20.md` e a ficha, nesta ordem. Esta é fase **funcional com migration**, de ingestão de dado da operadora. Quatro pontos de atenção declarados: a junção nominal é **exclusivamente por CPF-HMAC**, com a coluna detectada pelo cabeçalho e três causas de recusa distintas — sem junção alternativa por e-mail, nome ou telefone; os **selos do Consumo, hoje fixos no código, passam a ser derivados do dado**, na T33 e no R1; a reconciliação de catálogo **relata e nunca corrige**, com cerca de arquitetura provando; e **arquivo real com dado pessoal não entra no repositório**, nem como fixture. Apresente o plano da F20 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F20 — Telemetria da operadora"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.

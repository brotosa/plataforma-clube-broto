# Ficha de Módulo — Onda 12: Patrocinadores e telemetria da operadora
**Plataforma de Administração e Gestão do Clube Broto** · v0.4 para validação · 27/07/2026

Onda funcional em duas fases. **F19 — Patrocinador: mergeada** (RN62–RN66, versão 1.1.0). **F20 — Esteira de telemetria da operadora:** esta atualização a especifica por completo (RN67–RN70). Contrato visual: protótipo **v11.2**.

*v0.4 adota como **premissa de trabalho** que a base da operadora passa a trazer o CPF do titular, torna os selos do Consumo derivados do dado (não escritos no código) e detalha o tratamento da coluna de chave.*

---

## 1. O problema que a F20 resolve

A operadora entrega quatro relatórios que ninguém ingere. Dois deles — **sellers** e **ofertas** — são catálogo: não têm dado pessoal e trazem, por oferta, os **contadores acumulados de resgates e compras**. Os outros dois — **usuários** e **resgates nominais** — trazem a base e os eventos, e passam a trazer o **CPF do titular** requisitado em 27/07.

**Premissa de trabalho declarada:** a especificação assume o CPF presente na fonte. O nome exato da coluna, a presença ou não de máscara e a cobertura (todas as linhas ou parte) **não foram observados em arquivo real** — são `[A CONFIRMAR]` (§8), e por isso o parser detecta a coluna pelo cabeçalho e tolera as duas formas, em vez de fixar um formato.

A fase constrói a esteira inteira. O caminho de catálogo produz indicador desde a primeira importação. O caminho nominal liga base, vínculo e eventos por CPF-HMAC — e continua sabendo se comportar quando um arquivo vier sem a coluna (arquivos históricos, por exemplo), recusando a linha com a causa nomeada em vez de falhar.

## 2. O que a F20 entrega

- **Importação dos quatro layouts**, idempotente e com procedência (arquivo, data de geração declarada, hash, autor), devolvendo resultado com linhas lidas, aplicadas e recusadas por causa.
- **Contadores por oferta** (resgates e compras) vindos do catálogo, exibidos na tela de Ofertas e no Dashboard — **por oferta, nunca por patrocinador** (a atribuição a patrocinador depende da junção nominal).
- **Reconciliação de catálogo** (RN70): compara o que a plataforma publicou com o que a operadora tem no ar e **reporta as divergências**, sem corrigir nada.
- **Caminho nominal completo**: usuários e resgates ligam por CPF-HMAC, alimentando perfil de assinatura, vínculo de patrocínio e eventos de resgate. Linha sem CPF — ou com CPF inválido — não entra e é contada com a causa nomeada.
- **Selos do Consumo derivados do dado** (RN65): a F19 os gravou fixos no código; passam a refletir o que existe no banco, e é isso que faz os cards acenderem sem retrabalho.
- **Tela de telemetria** (T34): envio do arquivo, histórico das importações com seus resultados, e o relatório de divergências.
- Fecha em **1.2.0**.

## 3. Modelo (acréscimos da F20)

**ImportacaoTelemetria** — tipo de layout (`USUARIOS` · `RESGATES` · `SELLERS` · `OFERTAS`), nome do arquivo, data de geração declarada, **hash do conteúdo**, autor, momento, e resultado (lidas, aplicadas, recusadas) com a contagem por causa.

**ContadorDeOfertaTelemetria** — oferta, resgates, compras, data do arquivo de origem, importação que o produziu. Guarda o **último retrato por oferta**; série histórica é fora de escopo (§6).

**DivergenciaDeCatalogo** — importação, tipo (ausente na operadora · ausente na plataforma · atributo divergente), identificador, o que difere. É relato, não correção.

**EventoDeResgateTelemetria** — assinante, data do evento, produto, tipo de oferta, seller, e `ofertaId` **anulável** (a operadora ainda não o envia; o item 2 da requisição o pede). Sem assinante resolvido por CPF, o evento não entra.

Os campos de assinante que a F19 criou (perfil, estado do usuário, plano, periodicidade, método, preço) e o **vínculo de patrocínio** passam a ter origem na importação — a coluna `Patrocinador` da fonte alimenta o vínculo, com `Broto` mapeando para `Promocional Broto` (RN63).

## 4. Regras

**67. RN67 — Importação por snapshot, com procedência.** Os relatórios são acumulados, não incrementais: a importação é **idempotente** — reimportar o mesmo arquivo não duplica nada nem altera contagem, e é reconhecido pelo hash. Toda importação grava procedência e devolve resultado com linhas lidas, aplicadas e recusadas **por causa nomeada** (padrão RN55). Higienes aplicadas no parser e declaradas: coluna de índice sem nome, emoji no status do seller, apóstrofo à esquerda em telefone, `'-` como vazio. **Dado da operadora é somente leitura na plataforma** — correção se faz na origem, nunca por edição local, sob pena de a próxima importação desfazê-la em silêncio.

**68. RN68 — Duas contagens, uma verdade.** O contador agregado por oferta e os eventos nominais medem coisas diferentes e divergem hoje (227 × 38). **Nunca são somados nem apresentados como o mesmo número**: cada um aparece com a origem nomeada — "catálogo" e "extrato" — e com a data do arquivo. Enquanto a operadora não documentar a regra de contagem de cada um (`[A CONFIRMAR — Minutrade]`), a divergência é exibida como divergência, não reconciliada por conta própria.

**69. RN69 — Junção nominal só por CPF.** Todo vínculo entre linha da operadora e assinante se faz exclusivamente por **CPF-HMAC** (RN36). A coluna é detectada pelo cabeçalho e aceita com ou sem máscara; **dígito verificador é conferido** antes de qualquer uso. Linha sem CPF, com CPF inválido ou com CPF que não corresponde a assinante conhecido não entra e é contada com **essas três causas distintas** — que respondem perguntas diferentes: layout incompleto, dado sujo na origem, ou base desalinhada. **Não há junção por e-mail, nome ou telefone** — decisão registrada, não omissão. O CPF vindo da operadora nunca é gravado em claro: entra pelo mesmo caminho de cifra e HMAC da Onda 5.

**65-a. Complemento operacional da RN65.** O selo de cada card do Consumo é **derivado da existência do dado**, nunca escrito no código: com apuração, `vivo` e o número, com a data do retrato; sem apuração, `aguarda chave` ou `aguarda fonte` com o motivo. É a condição para a promessa de "acender sem mudança de layout" ser verdadeira.

**70. RN70 — Reconciliação relata, não corrige.** A plataforma é a origem do cadastro; a operadora é o espelho do que está publicado. Quando divergirem — oferta ativa aqui e ausente lá, atributo diferente, item presente lá e desconhecido aqui —, a importação **registra a divergência e a exibe**, e **em nenhuma hipótese altera o cadastro**. Corrigir se faz no módulo de origem, por decisão humana, com auditoria — que é o que a RN07 já exige de toda mutação de catálogo.

## 5. Telas

**T34 — Telemetria da operadora** (nova): envio do arquivo com detecção do layout, histórico de importações com resultado e causas, relatório de divergências da RN70. **Não há protótipo para ela** — é tela utilitária e deve reusar o padrão das telas de importação já existentes (carga inicial e importação de assinantes), sem componente novo. Acabamento pelo Design em onda futura, se necessário.

**Ajustes:** a lista de Ofertas ganha as colunas de resgates e compras com a data do retrato e a origem "catálogo"; o Dashboard ganha o card de telemetria (contagem e data da última importação). Guia ganha a seção correspondente pela fonte única.

## 6. Fora de escopo

Série histórica dos contadores (guarda-se o último retrato; manter todos os retratos é decisão de outra onda); correção automática de cadastro (RN70); junção por e-mail (RN69); telemetria de acessos e consumo de soluções, que continuam em `aguarda fonte` até a operadora entregar; reconciliação automática das duas contagens (RN68).

## 7. Política de amostras — restrição de LGPD

Os arquivos de **catálogo** (sellers e ofertas) não têm dado pessoal e entram no repositório em `dados/`, como já ocorre com as versões anteriores — servem de amostra real ao parser.

Os arquivos de **usuários e resgates nominais** trazem nome, e-mail, telefone e **agora também CPF** de mais de mil titulares — a restrição fica mais dura, não menos. **Não podem ser commitados em nenhuma hipótese**, nem como amostra de teste. O caminho nominal é exercitado por **fixture sintética** com a mesma estrutura e dados fabricados — inclusive CPF válido de teste —, no padrão dos arquivos `*-SINTETICO-homologacao.csv` que a homologação já usa.

## 8. Pendências

**[A CONFIRMAR — Minutrade]:** **nome exato da coluna de CPF, presença de máscara e cobertura** (todas as linhas ou parte) — não observados em arquivo real; o parser é escrito tolerante por causa disso, e a primeira importação real é o teste de verdade. Seguem abertos os itens 2 (IDs no extrato), 3 (acessos e uso), 4 (dicionário e regra de contagem da RN68), 5, 6 e 7 da requisição de 27/07.

**[A CONFIRMAR — Marco]:** revisão editorial da §4.7 do Guia (F19); adotar ou não o `.skip` do Design; e, herdadas da F19, a rotatividade de vaga na minuta Yamer e o carimbo do kit sem aprovação registrada.

**Permissões:** `IMPORTAR_TELEMETRIA` — Gestor e Analista. Demais papéis leem o histórico e as divergências.

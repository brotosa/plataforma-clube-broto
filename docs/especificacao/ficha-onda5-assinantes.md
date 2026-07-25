# Ficha de Módulo — Onda 5 (antecipada): Assinantes
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 24/07/2026

Decisões incorporadas (24/07): **inversão de ondas** — Assinantes antes de Campanhas, porque o simulador de alcance exige base carregada; **exportação de listas de contato confirmada como conforme à LGPD**, mantidos os controles de permissão, snapshot e auditoria; o **motor de segmentação nasce nesta onda** (filtros declarativos + contagem viva) e é reutilizado pela Onda 4 no simulador, sem código novo de filtro. Continuidade: telas T18–T21, regras RN29–RN37.

---

## 1. Objetivo do módulo

Ser o cadastro vivo da base patrocinada: importar os assinantes do comprador, derivar e enriquecer o perfil, dar visibilidade de vencimentos, ligar o uso (telemetria) a cada assinante e permitir análise de carteira com segmentação e contagem em tempo real — a resposta com dados à pergunta "meu cliente vai usar?" e a fundação direta do simulador de campanhas.

### 1.1 Mapa de fontes de dados

(a) **Arquivo do comprador** (base patrocinada): CPF, nome, endereço, e-mail, telefone, preferência (agricultura · pecuária · ambos) — os seis campos confirmados; dicionário real do arquivo **[A CONFIRMAR]** e absorvido pelo mapeador de colunas. (b) **Telemetria Minutrade** (uso por assinante — layout-alvo da Onda 1; granularidade por CPF **[A CONFIRMAR]** com a Minutrade). (c) **Enriquecimento** (cultura detalhada, porte/hectares, produtos do comprador — atributos e fonte **[A CONFIRMAR]**). (d) **Assinatura/vencimento** (plano mensal/anual, status, data) — origem **[A CONFIRMAR: arquivo do comprador × extrato Minutrade]**.

## 2. Permissões

Permissões específicas sobre a permissão de dados PF já existente: **"visualizar dados pessoais plenos"** (sem ela, CPF/contato aparecem mascarados) e a nova **"exportar listas de contato"** (v1: Gestor e Administrador). Contagens e análises agregadas: todos os papéis. Todo acesso pleno e toda exportação geram evento de auditoria.

## 3. Entidades e campos

**Assinante** — núcleo importado: CPF (validado, armazenado cifrado, exibido mascarado por padrão), nome, endereço estruturado (UF/município **derivados automaticamente** para segmentação), e-mail, telefone, preferência. **Atributos de enriquecimento** — extensíveis, cada um com **proveniência** (origem e data); nunca sobrescrevem o núcleo. **Assinatura** — plano, status, vencimento (origem pendente; a seção existe no modelo e no perfil, marcada). **Importação** — duas famílias (núcleo · enriquecimento), com staging, mapeador de colunas e quarentena. **Segmento** — filtro declarativo salvo e nomeável (campo/operador/valor, combinadores E/OU) sobre o catálogo de atributos; é a semente do público de campanha. **Exportação de lista** — snapshot materializado com autor, data, contagem e finalidade registrada.

## 4. Regras de negócio

29. **RN29** — Importação por **upsert idempotente por CPF**: novo cria, existente atualiza o núcleo; ausência no arquivo **não inativa** por padrão — a carga declara sua política (*foto completa* × *incremental*) e só a foto completa marca ausentes como "fora da base", com confirmação explícita.
30. **RN30** — CPF com validação de dígito, cifrado em repouso, mascarado por padrão; exibição plena e exportação exigem as permissões específicas e são auditadas.
31. **RN31** — Importação nunca é tudo-ou-nada: linhas inválidas vão para **quarentena com motivo**; cada carga gera relatório (totais, novos, atualizados, quarentena, download dos erros).
32. **RN32** — UF e município derivam do endereço na importação e alimentam a segmentação.
33. **RN33** — Segmentos são declarativos sobre o catálogo de atributos; **contagem é aberta a todos os papéis**; identificação (lista nominal) só com permissão.
34. **RN34** — Exportar lista materializa snapshot auditável com finalidade; a regra que gerou a lista fica gravada junto.
35. **RN35** — Enriquecimento entra por importação própria, casando por CPF, com proveniência por atributo; conflito com o núcleo nunca sobrescreve — registra divergência.
36. **RN36** — Com telemetria por CPF, o perfil exibe e a segmentação filtra **recência, frequência e valor de uso** (vouchers/compras). Sem a granularidade da Minutrade, a seção fica visível com estado "aguardando telemetria por assinante" — nunca com número inventado.
37. **RN37** — Vencimento é visibilidade e filtro ("vence em 30/60/90 dias"); nenhuma ação de cobrança ou disparo na v1.

## 5. Telas

| # | Tela | Conteúdo essencial |
|---|---|---|
| T18 | **Carteira de assinantes** | Tabela server-side com busca; **construtor de filtros inline** (o motor de segmentação) com **contagem viva no topo** atualizando a cada regra — o proto-simulador; colunas núcleo mascaradas por padrão; ações: salvar segmento, exportar lista (com permissão e registro de finalidade) |
| T19 | **Perfil do assinante** | Núcleo (mascarado/pleno por permissão), assinatura e vencimento (origem pendente sinalizada), uso — vouchers e compras da telemetria (ou estado "aguardando telemetria por assinante"), atributos de enriquecimento com proveniência |
| T20 | **Importações** | Upload núcleo × enriquecimento; mapeador de colunas; escolha da política (foto completa × incremental) com explicação; resumo da carga com quarentena e download de erros; histórico de cargas |
| T21 | **Segmentos salvos** | Lista com contagem atual de cada segmento, editar/duplicar/renomear; nota visível: "segmentos alimentam os públicos de campanha (próxima onda)" |

Estados completos; AAA vigente; T18 consultável no celular (contagens e filtros), exportação preferencial em desktop.

## 6. Ponte com a Onda 4 (registrada como requisito, não promessa)

O construtor de filtros, a contagem viva e os segmentos salvos desta onda são exatamente o **simulador de alcance**: a criação de campanha embute a T18/T21 na seleção de público e adiciona apenas o congelamento do público na ativação (snapshot, já padrão da RN34).

## 7. Carga inicial e volumetria

Primeiro arquivo real do comprador (dicionário **[A CONFIRMAR]** — o mapeador de colunas absorve variações); volume de projeto: dezenas de milhares (D4) — índices nas colunas de segmentação, contagem em milissegundos no PostgreSQL, sem componente novo.

## 8. Métricas de sucesso

Percentual da base com e-mail/telefone válidos; cobertura de enriquecimento por atributo; percentual de assinantes com uso em 90 dias (a contraparte, do lado do cliente, da "vitrine viva"); distribuição por UF e preferência; assinantes a vencer em 30/60/90.

## 9. Fora de escopo

Cobrança ou qualquer ação automática sobre vencimento; disparo de campanhas (Onda 4 modela, canal externo dispara); deduplicação probabilística (dedupe é determinística por CPF); histórico de interações além da telemetria de uso.

## 10. Pendências

**[A CONFIRMAR]**: dicionário real do arquivo de assinantes (ou exemplo anonimizado); ritmo de carga e política padrão (foto completa × incremental); atributos e fonte do enriquecimento; origem do vencimento (arquivo × Minutrade); granularidade por CPF na telemetria (pendência Minutrade da Onda 1 — agora crítica para a RN36).

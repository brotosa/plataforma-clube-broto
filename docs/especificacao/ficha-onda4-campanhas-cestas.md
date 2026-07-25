# Ficha de Módulo — Onda 4: Campanhas e Cestas
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 24/07/2026

Decisões incorporadas (24/07): a execução é da **Minutrade** — a plataforma modela e entrega um **kit de campanha** (CSV do público + peças + manifesto de ofertas + instruções); criativos (texto e/ou imagem) são guardados por campanha; **ofertas podem ser criadas com destinação** a campanha ou cesta — impacto retroativo no cadastro da Onda 1; metas múltiplas opcionais (resgates · conversão · nº de aliados · nº de ofertas); **medição em dois níveis de atribuição**, sempre com o nível declarado. Continuidade: T22–T25 (+ ajuste da T5), RN38–RN45.

---

## 1. Objetivo do módulo

Modelar campanhas de ponta a ponta — público simulado e congelado, conteúdo (cestas e ofertas), peças criativas e metas — e entregar à Minutrade o kit de execução, medindo o resultado com atribuição honesta. É a onda que dá destino comercial a tudo que as anteriores construíram.

### 1.1 Modelo operacional

Time Broto modela e ativa; **Minutrade executa** o disparo a partir do kit. Handoff em batch na v1 (kit gerado para download/envio); canal de entrega e formato preferido pela Minutrade **[A CONFIRMAR]** (padrão v1: pacote zip com CSV do público, imagens das peças e manifesto). A mesma Minutrade devolve a telemetria — o ciclo de medição fecha com uma única contraparte.

## 2. Permissões

Modelagem e ativação: Gestor e Analista (**[A CONFIRMAR]** se existe papel de marketing a criar); porta de aprovação de campanha **ligável** na T7 (nasce desligada). Geração/download do kit inclui a exportação de lista da Onda 5 — herda a permissão "exportar listas de contato" e a auditoria (RN34), com finalidade autopreenchida pelo nome da campanha.

## 3. Entidades e campos

**Campanha** — nome, objetivo, público (vínculo a um segmento da Onda 5; **congelado na ativação** via snapshot RN34), vigência, instruções à operação, estado (*Rascunho → Ativa → Encerrada*), metas (N), peças (N), conteúdo (cestas e/ou ofertas avulsas). **Cesta** — conjunto nomeado e reutilizável de ofertas, com narrativa e indicação de perfil. **Peça** — formato (lista de domínio nova no Parametrizador: e-mail, banner, push, WhatsApp…), título, texto, imagem (asset S3), ordem. **Meta de campanha** — tipo (resgates · conversão % · aliados participantes · ofertas ativas) e alvo; múltiplas e opcionais. **Kit** — pacote versionado e imutável da ativação (CSV do público, manifesto de ofertas/cestas, peças, instruções), com autor, data e hash.

**Extensão retroativa na Oferta (Onda 1)** — campo **Destinação**: *vitrine (permanente)* · *criada para a campanha X* · *criada para a cesta Y*. Quando vinculada a campanha, a vigência é sugerida igual à da campanha (editável). O cadastro (T5) e o modelo ganham o campo; a publicação Minutrade segue inalterada — a vitrine é uma só; o vínculo serve à gestão e à medição.

## 4. Regras de negócio

38. **RN38** — Ativar exige: público com contagem > 0, ao menos uma oferta publicada vinculada (direta ou via cesta) e vigência definida. A ativação congela o público (snapshot RN34, finalidade = campanha) e gera o kit v1.
39. **RN39** — Peças pertencem à campanha e viajam no kit; a plataforma **não dispara nada** (D6 mantida).
40. **RN40** *(proposta a validar)* — Ao encerrar a campanha, ofertas com destinação exclusiva a ela são **pausadas por padrão**, com aviso e reversão manual; ofertas de vitrine vinculadas apenas se desvinculam.
41. **RN41** — Cesta só entra em campanha com todas as suas ofertas ativas publicadas; oferta encerrada sai da cesta com aviso ao dono da cesta.
42. **RN42** — Recomendação de ofertas/cestas por perfil do segmento é **assistiva** (matching de taxonomias: categoria, cultura, cobertura, perfil-alvo × preferência e UF do público); a decisão é sempre humana — mesmo princípio das RN15/RN19.
43. **RN43** — Medição em **dois níveis, com o nível declarado no painel**: (a) **por oferta** — vouchers e compras das ofertas da campanha dentro da vigência (disponível desde já); (b) **por público** — cruzamento do snapshot com a telemetria por CPF (quando a Minutrade entregar a granularidade). Os dois nunca se misturam sem rótulo.
44. **RN44** — Realizado das metas calculado no nível disponível; **conversão % exige o nível público** — sem ele, exibe "indisponível — aguarda telemetria por CPF", nunca um número aproximado.
45. **RN45** — O kit é imutável; ajuste após ativação gera nova versão com diff, auditada.

## 5. Telas

| # | Tela | Conteúdo essencial |
|---|---|---|
| T22 | **Lista de campanhas** | Estado, vigência, tamanho do público congelado, resumo metas × realizado (com o nível de atribuição), versão do kit |
| T23 | **Criação/edição de campanha** | Seções: Público (**componente do construtor da Onda 5 embutido, com contagem viva — o simulador de alcance**, e seleção de segmento salvo); Conteúdo (cestas/ofertas com a assistência RN42 e busca); Peças (texto + upload de imagem com pré-visualização); Metas (adicionar por tipo); Revisão e ativação (resumo do kit + validações RN38 explicadas) |
| T24 | **Cestas** | Lista e edição com assistência de recomendação, validação RN41 visível e pré-visualização dos cards |
| T25 | **Painel da campanha** | Metas × realizado com o **nível de atribuição declarado** em cada número; desempenho por oferta (vouchers/compras); linha do tempo; kit para download e histórico de versões |
| T5* | **Ajuste retroativo (Onda 1)** | Campo Destinação no cadastro de oferta, com vigência sugerida quando vinculada |

Estados completos; AAA vigente; T22/T25 consultáveis no celular; modelagem (T23/T24) preferencial em desktop.

## 6. Parametrizador (integração)

Nova lista de domínio **"Formatos de peça"** editável na T16 (seed: e-mail · banner · push · WhatsApp).

## 7. Métricas de sucesso do módulo

Campanhas ativas; taxa de campanhas com meta atingida; tempo mediano modelagem → ativação; reuso de cestas; percentual de ofertas de campanha com resgate na vigência.

## 8. Fora de escopo

Disparo por qualquer canal; acesso da Minutrade à plataforma (v1 é kit); automação de convite a aliados (o vínculo de ofertas é manual — decisão 4); testes A/B; atribuição probabilística.

## 9. Pendências

**[A CONFIRMAR]**: canal de entrega e formato do kit preferidos pela Minutrade; papel interno de marketing (existe?); validação da RN40 (pausar exclusivas ao encerrar); telemetria por CPF (recorrente — condiciona o nível público da RN43 e a conversão da RN44).

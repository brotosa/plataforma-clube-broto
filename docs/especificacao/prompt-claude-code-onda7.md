# Prompt para o Claude Code — Onda 7: Cobertura e Mapa da Rede · Fase F14

> **Mesmo repositório.** Pré-requisito: **F1–F13 mergeadas na main** (o escopo original está completo; verifique e reporte se algo faltar). Primeira fase posterior à conclusão do escopo — o produto está em produção, então **nada aqui pode regredir o que existe**: a suíte completa verde é critério de aceite, não formalidade. Anexos: `docs/especificacao/ficha-onda7-cobertura-e-mapa.md` (fonte funcional) deve estar na main; o **protótipo v9.1 chega anexado à mensagem desta sessão** (upload web de HTML bloqueado na rede do operador) — commite-o em `docs/referencias/` no primeiro commit.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — referência visual v9.1 vigente (v8.1 vira histórico), ficha da Onda 7 nas fontes da verdade, e a fase F14 no mapa de fases.

## 1. Serviço único de cobertura (RN51) — a peça central, fazer primeiro

Hoje `infra/consultas/cobertura-metas.ts` calcula a cobertura da T13. **Extraia a definição de cobertura para um serviço único** (domínio puro onde a regra couber; consulta única onde depender de agregação), com uma API que sirva às três lentes: matriz categoria × situação (T13), profundidade do portfólio (T29) e os indicadores agregados que o Dashboard já consome. **A T13 passa a consumir o serviço** — decisão da Superintendência de 26/07 — com **teste de regressão obrigatório** provando que os números dela não mudaram. Se algum número mudar, pare e reporte antes de prosseguir: pode ser correção legítima de divergência ou defeito novo, e a diferença é decisão de negócio.

Conceitos a definir uma vez só, nomeados e testados: **coberta** (categoria com ao menos um aliado ativo e solução publicada), **frágil** (critério explícito, derivado da ficha — declare o que adotou), **sem cobertura**, **descoberta no funil** (categoria sem aliado mas com empresa em prospecção). Categoria sem aliado nunca é zero silencioso (RN53).

## 2. T29 — Cobertura do portfólio

Rota irmã em `app/(plataforma)/aliados/cobertura`, com o segmentado **Lista · Cobertura · Mapa da rede** extraído para componente compartilhado do cabeçalho da seção (a lista atual passa a usá-lo, sem reorganizar a página). Conteúdo integral da ficha §2: faixa de 4 indicadores com célula de alerta, distribuição por categoria em barra dupla com critério de ordenação declarado, **"Onde faltam"** com o botão **"Buscar no radar" navegando para a T8 filtrada pela categoria** (mesma navegação da célula da T13 — reutilize o padrão, não duplique), concentração nas três maiores, e a matriz Categoria × cultura com as duas notas obrigatórias da ficha. Filtros de cultura e região com resumo do recorte. Estado positivo explícito quando não houver vazios.

**Estado vazio da T8 (ajuste na tela existente):** quando o funil filtrado por categoria não tiver empresa alguma, o estado vazio oferece **"+ Entrar no radar"** com a categoria pré-preenchida na T9. Ajuste mínimo, sem reorganizar a T8; teste de regressão do funil obrigatório.

## 3. T30 — Distribuição geográfica

Rota `app/(plataforma)/aliados/mapa`. **RN52 é o eixo:** alternador **Sede do aliado × Abrangência declarada** com o modo ativo sempre visível e o volume não declarado informado quando houver — nunca inferir cobertura a partir da sede. Mapa do Brasil com **geometria real de domínio público (Natural Earth) projetada por biblioteca** — o protótipo traz `brasil-mapa.js` como prova de caminho (d3-geo + topojson-client); avalie e proponha no plano a forma de integração ao Next (componente cliente com as dependências como pacotes npm, geometria servida como asset estático versionado no repositório — **não** buscada de CDN em runtime). Se preferir SVG pré-projetado sem dependência nova, apresente o trade-off no plano e decidirei. Marcadores proporcionais com rótulos nos maiores, legenda, nota de proveniência da geometria, ranking por região, **leitura do mapa derivada do recorte ativo** (nunca texto fixo) e tabela por UF com colapso mobile rotulado.

## 4. Rodapé institucional versionado

Em `app/(plataforma)/shell-plataforma.tsx` (o rótulo atual está na linha ~212): substituir por **"Elaborado por Broto S.A. · v{versão}"**, com a versão vinda do `version` do `package.json` exposto por variável pública no build — **jamais literal digitado**. Em ambiente não-produção, segunda linha discreta com ambiente e commit curto. Elevar o `package.json` a **1.0.0** e documentar no README a convenção de versionamento adotada.

## 5. Correção de fidelidade do cabeçalho (ficha §5)

No shell da plataforma, a marca divergiu do protótipo aprovado: hoje há uma faixa branca atravessando o topo com o logo na variante azul/verde e a busca em largura total. A entrega do Design ofereceu duas variantes (`topoClaro` e `topoAzul`) — **implemente apenas a azul**; a variante clara não entra, sem alternador e sem código morto. Corrigir para o desenho aprovado — **o azul institucional da barra lateral sobe até o topo**, envolvendo a área da marca, com o logo na variante **amarelo/verde** (`design/logo-broto-amarelo-verde.svg`, já no repositório) e o descritivo "Plataforma de administração"; a busca passa a viver na área de conteúdo, à direita da lateral. Confira o v9.1 anexado como referência. Exigências: contraste AAA do descritivo e do logo sobre o azul (ajuste apenas no CSS canônico, tokens intocados), o alternador de recolher a lateral preservado, comportamento a 380px preservado, e **teste de regressão do shell** (navegação, foco por teclado, marco de landmark) — o cabeçalho é a moldura de todas as 32 rotas, então nada além do desenho da marca pode mudar de comportamento.


## 6. Correção da HOME — panorama do Dashboard (ficha §6)

**Divergência confirmada em produção:** o hero da T26 usa as células (`dash-stats`) para as pendências e **não existe o panorama de oito indicadores**. A causa é de especificação (a ficha da Onda 6 §2 não enumerou as células), não de execução — a estrutura correta está agora na ficha §6, em três camadas: **hero** (número-tese "Vitrine viva" com etiqueta de atribuição + seletor de período + **panorama de 8 células clicáveis** com rótulo, número e nota de procedência), **"Pendências · exige ação hoje"** como cartões próprios **fora do hero**, e os **quatro blocos por domínio** já existentes, preservados integralmente — incluindo a meta × realizado no bloco de Mercado.

Cada célula do panorama lê o mesmo serviço que já alimenta os blocos: **nenhuma consulta nova de negócio, nenhum indicador fora da ficha** (RN50). Célula sem base de cálculo exibe traço com o motivo, jamais zero ou aproximação (RN53), e **valor indisponível não entra em soma alguma** — incluindo a contagem do sino. Os números do protótipo são ilustrativos: o contrato é o conjunto de indicadores, rótulos e notas. Teste de regressão obrigatório dos quatro blocos: os números deles não podem mudar com a reorganização.

## 7. Sino de pendências (ficha §7)

O botão de notificações do cabeçalho passa de decorativo a atalho do que já se calcula — **sem fila persistente, sem lido/não-lido, sem preferências**: nada disso está em ficha. Marcador numérico apenas quando houver pendências, com valor igual à **soma das contagens da camada 2 da HOME** lendo o **mesmo serviço** (se sino e cartões divergirem, os dois perdem credibilidade — teste cobrindo a igualdade). Painel ancorado ao botão com as mesmas linhas navegando para a origem, caminho para o Dashboard ao pé, e estado positivo quando vazio. Acessibilidade como critério de aceite, não acabamento: estado de expansão declarado, texto acessível no marcador, **Esc fechando e devolvendo o foco ao botão**, clique fora fechando, foco contido no painel enquanto aberto, AAA no marcador, largura útil a 380px. Remover o `title` atual, que promete alertas inexistentes.

## 8. Paleta AAA remedida (adotar da entrega do Design)

A entrega da Onda 7 remediu quatro derivações AAA **nos fundos reais** (não sobre branco) e corrigiu o cartão do hero, que clareava a superfície azul para uma faixa onde o branco reprova, passando a escurecer. Adote os valores da entrega — `--paragrafo-aaa`, `--azul-texto-aaa`, `--erro-texto-aaa` e o novo `--azul-texto-aaa-forte` — **integralmente dentro do `dseed-admin.css`, com `tokens.css` intocado**, preservando os comentários de medição, e atualize `docs/acessibilidade-aaa.md` com a tabela de aferições. Revalide o axe AAA no produto inteiro após a troca: são tokens de texto usados em todas as telas.

## 9. Qualidade e encerramento

Testes de unidade das RN51–RN53 (positivos e negativos), teste de regressão dos números da T13, e2e das duas telas (filtros, alternador de modo, "Buscar no radar" chegando à T8 filtrada, estado vazio levando à T9 com categoria), **axe-core AAA limpo e 380px** nas duas telas novas (o job do gate cobre ambos), suíte **F1–F13 integralmente verde**, com regressão explícita dos quatro blocos do Dashboard e da igualdade sino × pendências. Dados de exemplo: apenas o que o cadastro real sustenta; recortes sem base exibem estado explícito (RN53). README com seção da Onda 7 e as pendências herdadas atualizadas.

## Mensagem para abrir a sessão (colar como está, anexando o protótipo v9.1)

Verifique que **F1–F13 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 7 em `docs/especificacao/`; o protótipo **v9.1 está anexado a esta mensagem** — commite-o em `docs/referencias/` no primeiro commit. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda7.md` e a ficha da Onda 7, nesta ordem. Atenção: **o produto está em produção** — nenhuma regressão é aceitável, e a extração do serviço único de cobertura exige teste provando que os números da T13 não mudaram (se mudarem, pare e reporte). Apresente o plano da F14 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F14 — Cobertura e Mapa da rede"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.

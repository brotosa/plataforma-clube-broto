# Ficha de Módulo — Onda 7: Cobertura do Portfólio e Mapa da Rede
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 26/07/2026

Primeira onda posterior à conclusão do escopo original (F1–F13). Origem: versionamento do protótipo conduzido pela Superintendência, com duas telas novas na seção **Aliados & Soluções**. Continuidade: telas **T29–T30**, regras **RN51–RN53**, mais quatro correções transversais (rodapé versionado, fidelidade do cabeçalho, panorama da HOME e sino de pendências). Referência visual: protótipo **v9.1** (a validar no red team da entrega do Design).

---

## 1. Objetivo do módulo

Responder, com o cadastro que já existe, três perguntas que hoje só se responde por planilha: **o que a rede cobre**, **onde ela é frágil ou inexistente**, e **onde ela está no mapa**. As duas telas transformam o cadastro de aliados e soluções — hoje consultável apenas como lista — em instrumento de decisão de scouting e de conversa com patrocinadores.

Princípio que governa a onda: **nenhum número novo nasce aqui**. Tudo é releitura do que o cadastro declara, e a definição de cobertura passa a ter fonte única compartilhada com a T13 (Mercado & Scout), decisão da Superintendência de 26/07.

## 2. T29 — Cobertura do portfólio

Rota irmã da lista de aliados, alcançada pelo segmentado **Lista · Cobertura · Mapa da rede** no cabeçalho da seção. Título: *"Cobertura do portfólio"*; subtítulo: *"Onde a rede está completa, onde é frágil e onde não existe"*.

**Filtros:** cultura, região, e alternância da leitura entre **Aliados** e **Soluções**. Botão de limpar quando houver filtro ativo, com resumo textual do recorte.

**Faixa de indicadores (4 células regradas, sem cartão por número):** categorias cobertas sobre o total da vitrine · aliados ativos no recorte · soluções publicadas no recorte · categorias sem cobertura (célula em estado de alerta quando > 0). Cada célula com nota de leitura curta.

**Distribuição por categoria:** barra dupla — aliados sobre soluções — ordenada por volume, com o critério de ordenação declarado em texto. Categoria sem cobertura aparece na lista com marcação própria (**não é omitida** — a ausência é a informação).

**Onde faltam:** vazios e fragilidades do recorte, cada linha com o botão **"Buscar no radar"**, que abre a **T8 (funil) filtrada pela categoria** — verificar antes de prospectar é regra, para não duplicar esforço comercial (RN51). Estado positivo explícito quando não houver vazios.

**Concentração:** percentual do portfólio nas três maiores categorias, com as três nomeadas e posicionadas — leitura de risco de dependência.

**Categoria × cultura:** matriz das soluções declaradas por cultura no cadastro, com duas notas obrigatórias: (a) uma solução pode servir mais de uma cultura, então a linha soma mais que o total da categoria; (b) a matriz **independe do filtro de região** — é característica declarada da solução, não da sede do aliado. Lista de culturas mantida no Parametrizador.

## 3. T30 — Distribuição geográfica (Mapa da rede)

Título: *"Distribuição geográfica"*; subtítulo: *"Onde a rede existe no mapa — e onde o Clube ainda não chegou"*.

**Alternador de modo, decisão de primeira classe (RN52):** **Sede do aliado** × **Abrangência declarada**. São leituras distintas e a tela **sempre declara qual está ativa** — plotar sede não é plotar cobertura de atendimento, e a confusão entre as duas produziria decisão errada de scouting. Quando a abrangência não estiver declarada para parte da base, o modo exibe o volume não declarado em vez de omiti-lo.

**Mapa:** geometria real do Brasil (Natural Earth, domínio público) com projeção geográfica — nunca contorno desenhado à mão. Marcadores proporcionais, rótulos nos maiores, legenda de leitura e nota de proveniência da geometria.

**Painéis laterais:** ranking **por região** (volume e participação) e **leitura do mapa** — três a quatro observações derivadas do recorte ativo, não texto fixo.

**Tabela por UF:** UF · aliados · soluções · participação na rede · região, com colapso mobile rotulado.

**Filtros:** cultura e categoria, coerentes com a T29.

## 4. Rodapé institucional versionado

O rodapé da barra lateral deixa de exibir o rótulo de desenvolvimento ("Ondas 1–2 · Aliados, Ofertas e Mercado" — factualmente incorreto desde a Onda 3 e impróprio para usuário final) e passa a exibir **"Elaborado por Broto S.A. · v{versão}"**. A versão **é lida do build**, nunca digitada: `version` do `package.json` como fonte única, exposta ao cliente por variável de ambiente pública. Em ambiente não-produção, segunda linha discreta com ambiente e commit curto, para que ninguém apresente uma preview acreditando estar na plataforma no ar. `package.json` passa a **1.0.0** — o escopo especificado (F1–F13) está completo.

## 5. Correção de fidelidade — cabeçalho e marca

A implementação divergiu do protótipo aprovado na região da marca, e a correção é de identidade visual, não de preferência. **Como está em produção:** faixa branca atravessando o topo, com o logo na variante azul/verde e a busca ocupando toda a largura. **Como o protótipo aprovado define:** o **azul institucional da barra lateral sobe até o topo**, envolvendo a área da marca; sobre ele, o logo na variante **amarelo/verde** (`design/logo-broto-amarelo-verde.svg`, já presente no repositório) com o descritivo "Plataforma de administração"; a busca vive na área de conteúdo, à direita da lateral, não atravessando a tela.

Racional: a variante amarelo/verde existe justamente para fundo azul — usar a variante azul exige fundo claro, e foi essa troca que produziu a faixa branca. A correção restitui a leitura de marca desenhada no DSeed e elimina uma inconsistência que aparece na primeira tela que qualquer pessoa vê ao entrar. A entrega do Design ofereceu duas variantes de topo (clara e azul); **decisão da Superintendência: apenas a azul permanece** — a variante clara sai, sem alternador e sem código morto. Verificar contraste AAA do descritivo sobre o azul e ajustar dentro do CSS canônico se necessário; o alternador de recolher a lateral e o comportamento a 380px devem permanecer intactos.


## 6. Correção da HOME — panorama do Dashboard (T26)

Divergência identificada em produção: o **panorama de oito indicadores do hero não existe** no implementado. A causa é de especificação — a ficha da Onda 6 §2 descreveu "faixa Exige ação hoje + quatro blocos por domínio" e não enumerou as células do hero; a implementação seguiu a ficha e usou as células do hero para as pendências. Esta seção fecha a lacuna. A estrutura correta da HOME, conforme protótipo aprovado, tem **três camadas**:

**Camada 1 — Hero "O Clube hoje"** (azul institucional): data corrente, a nota de escopo ("agregados visíveis a todos os papéis — nenhum dado pessoal"), o seletor de **período** e, à esquerda, o número-tese em escala de display: **Vitrine viva** — percentual das ofertas ativas com resgate na janela, com a leitura ("~N das M ofertas ativas com resgate em 90 dias — a tese do Clube em métrica") e a **etiqueta de atribuição**. À direita, o **panorama de oito células** clicáveis, cada uma com rótulo, número e nota curta de procedência:

| Célula | Número | Nota |
|---|---|---|
| Aliados | aliados na rede | completude média do cadastro |
| Soluções | contagem | procedência: depende da carga inicial do portfólio |
| Ofertas | ativas sobre o total | vitrine viva do período |
| Campanhas | ativas | versão do kit vigente |
| Cestas | reutilizáveis | quantas com pendência de RN41 |
| Assinantes | base patrocinada | natureza da base (ilustrativa até a carga real) |
| Resgates de benefícios | na campanha ativa | nível de atribuição; total da base aguarda telemetria |
| Resgates de cupons | contagem | aguarda telemetria; regra de comissão do cupom em confirmação |

**Camada 2 — "Pendências · exige ação hoje"**: cartões próprios, **fora do hero**, um por tipo (cadastros incompletos, vigências a vencer, janelas contratuais, reavaliações vencidas, quarentena de importação, aprovações pendentes), cada um com a contagem, a explicação em uma linha citando a régua aplicada e o exemplo concreto quando houver, e navegação para a tela de origem. Estado positivo explícito quando não houver nenhuma.

**Camada 3 — Quatro blocos por domínio** (Rede e Aliados · Mercado e Funil · Assinantes e Uso · Campanhas), como já implementados: preservar integralmente, incluindo a meta × realizado no bloco de Mercado.

**Regra que atravessa as três camadas (RN50/RN53):** indicador sem base de cálculo exibe o **traço de indisponibilidade com o motivo**, jamais zero nem aproximação — e o valor indisponível **não entra em soma alguma**, inclusive na contagem do sino. Os números do protótipo são ilustrativos; o que este documento contrata é **o conjunto de indicadores, seus rótulos e suas notas**, não valores.

## 7. Sino de pendências no cabeçalho

O botão de notificações deixa de ser decorativo e passa a ser **atalho para o que a plataforma já calcula**, sem criar sistema de notificação (sem fila persistente, sem lido/não-lido, sem preferências — nada disso entra). **Contador:** marcador numérico exibido apenas quando houver pendências, igual à **soma exata das contagens da camada 2 da HOME**; pendência indisponível não contribui. **Painel:** o clique abre painel ancorado ao botão com as mesmas linhas e contagens, cada uma navegando para a tela de origem, e um caminho ao pé para o Dashboard completo; sem pendências, exibe o estado positivo. **Acessibilidade:** estado de expansão declarado, texto acessível no marcador ("N ações pendentes"), Esc fecha devolvendo o foco ao botão, clique fora fecha, foco preso ao painel enquanto aberto, AAA no marcador, e largura útil da tela a 380px.

## 8. Regras de negócio

51. **RN51 — Fonte única de cobertura.** A definição de cobertura, gap e categoria descoberta vive em **um único serviço**, consumido pela T13 (Mercado & Scout), pela T29 e pelo Dashboard. Duas telas não podem contar lacunas por caminhos diferentes. A T13 mantém sua lente (pipeline: o que está no funil para preencher) e a T29 a sua (ativo: profundidade do portfólio) — lentes diferentes, fonte idêntica. O "Buscar no radar" da T29 abre a T8 filtrada pela categoria, mesma navegação que a célula da T13; quando o funil estiver vazio para aquela categoria, o estado vazio da T8 oferece a entrada no radar já com a categoria pré-preenchida.
52. **RN52 — Modo geográfico sempre declarado.** O mapa exibe *sede* ou *abrangência declarada*, nunca a mistura, com o modo ativo visível e o volume não declarado informado quando houver. Abrangência é atributo da ficha do aliado; a plataforma não infere cobertura a partir da sede.
53. **RN53 — Nenhum indicador sem lastro no cadastro.** Categoria sem aliado é exibida como **sem cobertura**, não como zero silencioso; aliados ou soluções sem categoria ficam **fora** da distribuição e o volume excluído é declarado na tela; recortes cuja base ainda não entrou (carga de portfólio, abrangência não declarada) exibem o estado explícito, jamais uma aproximação. Herda a disciplina da RN50.

## 9. Fora de escopo

Edição de categoria, cultura ou abrangência a partir destas telas (a origem permanece o cadastro do aliado e o Parametrizador); mapa por município; cruzamento com base de assinantes ou com telemetria (a cobertura aqui é de oferta, não de demanda); exportação das visões — que, se desejada, entra pela onda de import/export.

## 10. Pendências

**[A CONFIRMAR]:** nenhuma nova de negócio. Herdadas, com efeito visível nestas telas: a **carga inicial do portfólio de soluções** (enquanto não entrar, a distribuição reflete apenas o cadastrado, e a tela declara isso) e a **abrangência declarada** por aliado (preenchimento operacional; sem ela, o modo correspondente do mapa exibe o volume não declarado).

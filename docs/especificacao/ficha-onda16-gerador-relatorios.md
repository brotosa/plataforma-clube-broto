# Ficha de Módulo — Onda 16: Gerador de relatórios
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 16/09/2026

Módulo novo (**T36**), acessível a **todos os papéis**, com o que cada um alcança limitado ao que já alcança hoje. Construtor visual de consultas sobre **assuntos pré-modelados**: a pessoa escolhe um assunto, arrasta campos para três gavetas e vê o resultado. Onda de **três fases**; esta ficha detalha a **F24** e esboça F25 e F26. Migrations **estritamente aditivas**. Sobre a versão **1.5.0**.

> **Esta ficha nasce antes do código, e isso importa registrar** — a Onda 15 foi retroativa por força das circunstâncias, e a casa voltou ao rito normal aqui. Nada foi implementado. A numeração **RN75–RN79** é proposta e a Superintendência pode recusá-la ou renomeá-la sem custo de retrabalho.

---

## 1. Por que existe

A plataforma responde bem às perguntas que alguém previu. O Dashboard traz oito indicadores fixos; cada módulo tem sua lista com filtros próprios; o R1 do patrocinador tem forma congelada. **Pergunta não prevista não tem caminho** — vira pedido por e-mail para quem sabe consultar o banco, e a resposta chega em planilha, sem procedência e sem repetibilidade.

O Gerador de relatórios é o caminho para a pergunta não prevista. Ele não acrescenta dado algum: reorganiza o que já existe.

### O que ele NÃO é

Não é um console de SQL. A distinção é de segurança e está no §3 (RN75): a base carrega dado pessoal de mais de dois mil assinantes, e uma caixa de texto onde se escreve consulta livre é ao mesmo tempo uma porta de exportação irrestrita e a forma mais fácil de derrubar o banco de produção.

Também não é lugar de **criar métrica**. Métrica nova nasce no catálogo, revisada, e aparece pronta para todos — é o que garante que "ofertas publicadas" signifique a mesma coisa no relatório de todo mundo. A RN50 já diz isto para o Dashboard; aqui ela ganha o dente que faltava.

## 2. Entidades

**`AssuntoRelatorio`** — **não é tabela**. É definição em código, no padrão do catálogo de segmentos da RN33 (`dominio/segmentacao/catalogo.ts`), de onde este módulo herda o desenho inteiro. Cada assunto declara:

| Parte | O que é |
|---|---|
| `slug`, `rotulo`, `descricao` | identidade e o texto que a tela mostra |
| `permissao` | a `Acao` do RBAC que o assunto exige |
| `raiz` e `juncoes` | a tabela base e as ligações **pré-autorizadas** |
| `campos[]` | slug, rótulo, tipo, operadores, e a **classificação de sensibilidade** |
| `modelos[]` | relatórios prontos daquele assunto |

Nenhum pedaço de SQL nasce de entrada da pessoa: o texto vem exclusivamente destas definições, e valores viajam como parâmetros de bind. É a mesma garantia que o compilador de segmentos já tem testada.

**`RelatorioSalvo`** — guarda a **definição declarativa**, jamais o resultado.

| Campo | Observação |
|---|---|
| `id`, `nome`, `assuntoSlug` | |
| `definicao` (JSONB) | filtros, linhas, colunas, valores, ordenação, visualização |
| `autorId` | quem criou |
| `visibilidade` | `PRIVADO` (padrão) ou `TIME` |
| `criadoEm`, `atualizadoEm` | |

Guardar a definição e não o resultado é a mesma decisão da RN33 para segmentos, e pelo mesmo motivo: **resultado guardado envelhece em silêncio**. Recalcula-se a cada abertura.

**`ExecucaoRelatorio`** — append-only, a trilha operacional do módulo: quem executou, qual definição, quantas linhas, quanto tempo, e a finalidade quando o assunto exigir. Não substitui a trilha da RN49 — a acompanha, no mesmo desenho de `relatorios_patrocinador` (Onda 12).

## 3. Regras

### RN75 — A composição é livre; a linguagem, não

Filtro, agrupamento, coluna e agregação saem **exclusivamente da allowlist do assunto**. Campo, operador e função são validados contra o catálogo; valores viajam como parâmetro de bind. Campo fora do catálogo é **recusado, não ignorado**.

**Não existe campo de SQL livre, nem fórmula escrita pela pessoa, nem junção escolhida por ela** — as três são a mesma coisa vista de ângulos diferentes: uma linguagem de programação na mão de quem não pediu para programar, com acesso à base de produção. Junção livre é ainda onde nasce o produto cartesiano que trava o banco.

A cerca de `infra/arquitetura/relatorio-sem-sql-livre.test.ts` quebra o build se o caminho do gerador interpolar texto vindo de fora no SQL.

### RN76 — O gerador não alarga o que ninguém já alcança

Toda consulta roda com as permissões de **quem executa**. Assunto que a pessoa não pode ver **não aparece na tela** — sem cadeado e sem "peça acesso", porque oferecer o que não se pode abrir só produz pedido de suporte.

**Relatório compartilhado roda com a permissão de quem ABRE, nunca de quem criou.** É o ponto onde relatório compartilhado costuma virar vazamento: o caminho contrário — executar com a credencial do autor — é como um relatório inocente acaba entregando a base de assinantes a quem não deveria.

Quando falta permissão para parte do que a definição pede, a tela **declara o que ficou de fora** ("3 colunas não exibidas: sem permissão") em vez de devolver um número menor. **Número silenciosamente reduzido é pior que um erro**, porque parece certo.

Exportar segue a permissão que o assunto já exige hoje. O gerador não é atalho.

### RN77 — Ausência continua sendo informação (herda RN50 e RN53)

Campo cujo dado a fonte não sustenta **aparece no catálogo, apagado, com o motivo** — e não pode ser arrastado para nenhuma gaveta. Some da lista seria pior: quem não o vê pede ao suporte; quem o vê entende.

Num construtor livre esta disciplina vale mais do que em tela fixa, e a razão é assimétrica: **na tela fixa quem programou sabia que o dado não existe; aqui quem monta não sabe**. Um campo que devolvesse zero silenciosamente produziria um relatório errado entregue à diretoria sem ninguém perceber.

Três casos já conhecidos e nomeados:

- **uso por assinante** — aguarda telemetria por assinante (`[A CONFIRMAR — Minutrade]`);
- **contadores de telemetria** — o agregado por oferta e os eventos nominais **divergem** (RN68) e **não podem ser somados nem apresentados como a mesma coisa**; no gerador, são campos distintos que nenhuma agregação reúne;
- **números de campanha** — viajam com a etiqueta do nível de atribuição (RN65), e valores de níveis diferentes não se somam.

### RN78 — Toda execução é auditada, e a que toca dado pessoal exige finalidade

Executar grava evento com autor, definição, contagem e duração. **Assunto marcado como contendo dado pessoal exige finalidade declarada antes de abrir** — o caminho que a RN35 já criou para a exportação de assinantes, reusado e não duplicado. CPF nunca sai em claro, em nenhuma coluna, em nenhuma exportação (RN36, RN69).

A trilha da RN49 continua sendo a trilha; `ExecucaoRelatorio` é o histórico operacional que a tela mostra.

### RN79 — Resultado tem teto, e o teto tem remédio

A prévia é **amostra** e recalcula a cada mudança. O resultado completo tem teto de linhas e tempo; estourado, a mensagem **nomeia a causa** (RN55) e oferece o caminho — estreitar o filtro ou pedir a exportação, que segue o armazenamento da RN71 com os tetos de lá.

Consulta sem teto sobre a trilha de auditoria — tabela que só cresce — é a forma mais provável de alguém derrubar a produção sem má intenção.

## 4. Telas

### T36 — Gerador de relatórios

Item na lateral **entre Aprovações e Parametrizador**, fechando o bloco de operação e antes do bloco de administração. Três passos numa tela só:

**Escolher o assunto.** Cartões com linguagem de negócio, não de banco. Só os que a pessoa alcança.

**Montar.** Painel de campos à esquerda (agrupados por origem, com tipo e cadeado quando indisponível); três gavetas — **Linhas**, **Colunas**, **Valores** — e a barra de **Filtros**; painel de visualização à direita. Ao soltar um campo em Valores, a agregação óbvia é escolhida sozinha (número → média; registro → quantos); a pessoa troca se quiser, e nunca precisa saber que existe `AVG`.

**Ver.** Prévia sobre amostra, recalculada a cada mudança, com o total do resultado completo no rodapé.

Salvar, exportar e agendar ficam no topo. Três prateleiras: **Meus relatórios**, **Do time** e **Modelos da plataforma**.

### Entrada contextual

Na lista de Ofertas e na de Aliados, um botão **Analisar** abre o gerador já no assunto certo, com os filtros que a pessoa acabou de aplicar. É o ponto de entrada que mais importa: ninguém acorda querendo "fazer um relatório" — a pessoa está olhando uma lista e quer cruzar aquilo com outra coisa.

## 5. Fases

**F24 — motor + dois assuntos.** Catálogo, compilador, gavetas, prévia, tabela, CSV, salvar/compartilhar, permissões, teto, auditoria, galeria. Assuntos **Ofertas do Clube** e **Rede de Aliados**: são os de menor risco (sem dado pessoal), os de maior alcance (todos os papéis chegam neles) e os que exercitam junção de verdade (Oferta → Solução → Aliado).

**F25 — Funil, Campanhas, Patrocinadores.** Com o vocabulário já corrigido pelo uso real. Campanhas traz a etiqueta de atribuição (RN65); Patrocinadores lê o saldo da fonte única (RN62) e não o recalcula.

**F26 — Telemetria, Assinantes, Auditoria.** Os três sensíveis, cada um com sua cerca: divergência que não se soma, dado pessoal com finalidade, e volume que exige teto.

**A ordem é deliberada.** O motor é a maior parte do esforço e é pago uma vez; cada assunto depois é pequeno. O que a ordem protege não é o custo de construir — é o **custo de descobrir tarde**. Um construtor não acerta o vocabulário de primeira ("Situação" ou "Status"? categoria é uma ou várias?), e isso só aparece com gente usando. Errar com dois catálogos custa dois ajustes; com oito, custa oito.

## 6. Pendências declaradas — o que esta ficha NÃO resolve

1. **A posição na lateral, o ícone e a divisória são proposta, não decisão.** A ordem e os ícones vieram do protótipo v2.1, que é contrato visual; acrescentar item é de Design. Medido: "Gerador de relatórios" ocupa 138 px no espaço de ~160 px da lateral, em uma linha, sem cortar.
2. **O nome.** "Gerador" sugere produzir documento, e a tela explora mais do que gera. O nome da casa venceu o palpite de quem escreve — mas se o uso apelidar de outro jeito, renomear é barato e deve ser feito.
3. **Gráficos** ficam para a F25. A F24 entrega tabela, que é o que responde à maioria das perguntas e é o que se exporta.
4. **Agendamento e envio** ficam para a F26, e dependem de decisão sobre canal (e-mail? qual remetente?) que a plataforma ainda não tomou.
5. **Cruzar assuntos diferentes** num mesmo relatório está fora de escopo das três fases. Se virar necessidade, é onda própria — e provavelmente significa que faltou um assunto no catálogo.
6. **Qual papel pode compartilhar para o time** — a ficha propõe que todos possam, com a proteção da RN76 fazendo o trabalho. Se a Superintendência quiser restringir, é uma `Acao` nova e não muda o resto.

## 7. Fora de escopo

SQL livre, fórmulas da pessoa, junções escolhidas na tela, criação de métrica fora do catálogo, e qualquer caminho que entregue dado além do que o papel já alcança. Os cinco estão no §3 como regra, não como omissão.

# Perfis de acesso — quem pode o quê na plataforma

Este documento descreve, papel a papel, o que cada usuário da Plataforma
Clube Broto enxerga e consegue fazer. **Fonte da verdade**: a tabela de
permissões em `dominio/autorizacao/permissoes.ts` (ação × papel, uma linha
por ação de negócio, direto das tabelas §2 de cada ficha) e os rótulos em
`dominio/autorizacao/papeis.ts`. Este arquivo é uma leitura organizada
daquela tabela — se um dia divergirem, o código vence.

Existem **8 papéis**. Todo usuário tem exatamente um.

> **Correção de 21/09/2026 — a renomeação da Onda 15 não havia chegado aqui.**
> Até então este documento chamava de **Administrador da Plataforma** o papel de
> configuração. Esse nome passou a designar **outro** papel, de **acesso total**,
> e o de configuração passou a se chamar **Administrador** (`ADMIN`). O texto
> descrevia a coisa certa pelo nome errado — e o erro era do tipo que engana no
> sentido perigoso: quem lesse concederia "Administrador da Plataforma"
> acreditando dar configuração, e daria **tudo**.

## Como funciona, em uma frase

Cada ação de negócio (ex.: "aprovar solicitação", "configurar parâmetros",
"gerir usuários") é liberada para uma lista fixa de papéis. **Ver** é quase
sempre mais aberto do que **fazer**: praticamente todo módulo é visível a
todos os papéis (transparência é o padrão), mas só quem está na lista da
ação consegue de fato criar, editar, aprovar ou configurar.

## Resumo por papel

| Papel | O que faz, em uma linha |
|---|---|
| **Gestor do Clube** | Opera quase tudo — cadastro, aprovação, campanhas, patrocinadores. Só fica de fora do que é exclusivo do Administrador. |
| **Analista de Aliados** | Cadastra e mantém aliados, ofertas, campanhas, importações. Não aprova, não configura. |
| **Analista de Scout** | Roda o funil de prospecção: radar, avaliação, priorização, dossiê. Não mexe em cadastro publicado. |
| **Comercial** | Negocia com prospects: solicita promoção, lê dossiê, assume negociação. Não avalia nem aprova. |
| **Aprovador** | Só aprova ou devolve solicitações — nunca as próprias. Não cria, não edita. |
| **Leitura** | Enxerga tudo, não muda nada. Nenhuma ação de escrita em lugar nenhum. |
| **Administrador** | Configura o produto (parâmetros, metas, usuários, portal) e vê dado pessoal pleno. Não opera o negócio do dia a dia (não cadastra, não aprova, não roda campanha). |
| **Administrador da Plataforma** | **Acesso total**: pode toda ação da plataforma, inclusive as criadas depois. Nasce sem detentores. |

## Detalhamento por papel

### Gestor do Clube (`GESTOR`)

O papel mais amplo em ações operacionais. Consegue:

- Ver e editar Aliados, Soluções e Ofertas; publicar, pausar e encerrar
  ofertas; gerar exportações; importar telemetria (Minutrade e operadora).
- Solicitar promoção de prospect a aliado, aprovar ou devolver solicitações
  (menos as que ele mesmo abriu — RN06, abaixo), e configurar as regras do
  motor de aprovação.
- Tudo do funil de Mercado & Scout: incluir no radar, assumir e avaliar,
  priorizar, gerar/revisar dossiê, ver dossiê, assumir negociação, designar
  responsáveis.
- Ver dado pessoal pleno de assinante e exportar listas de contato.
- Importar assinantes e gerir segmentos.
- Modelar, ativar e encerrar campanhas; gerir cestas.
- Ver e exportar o extrato de auditoria.
- Gerir patrocinadores, contratos e vínculos; gerar o Relatório do
  Patrocinador (R1).

**Não** consegue: definir metas oficiais, configurar parâmetros da
plataforma (Serviço de Configuração) nem gerir usuários — as três coisas
que são exclusivas do Administrador, por desenho (quem
configura o produto não pode ser quem opera nele).

### Analista de Aliados (`ANALISTA`)

Foco operacional em cadastro e execução, sem poder de aprovação:

- Cria e edita Aliados, Soluções e Ofertas; publica, pausa e encerra
  ofertas; importa telemetria.
- Solicita promoção de prospect a aliado (mas não avalia nem prioriza —
  isso é do Scout).
- Importa assinantes e gerir segmentos.
- Modela, ativa e encerra campanhas; gerir cestas.
- Vê (não edita) Mercado & Scout, Parametrizador, Auditoria e
  Patrocinadores.

**Não** consegue: aprovar/devolver solicitações, gerar exportação de
catálogo, mexer no funil de scout (radar/avaliação/dossiê), ver dado
pessoal pleno de assinante, gerir patrocinadores, gerir usuários.

### Analista de Scout (`ANALISTA_SCOUT`)

Dono do funil de prospecção — nada de cadastro publicado:

- Inclui empresa no radar, assume e avalia (score do ScoutCB), prioriza,
  gera e revisa o dossiê de due diligence, vê o dossiê.
- Vê (não edita) Aliados/Ofertas, Assinantes, Campanhas, Parametrizador,
  Auditoria, Patrocinadores.

**Não** consegue: editar cadastro de aliado/oferta, solicitar promoção
(isso é do Gestor/Analista/Comercial), aprovar nada, assumir negociação
comercial, tocar em assinantes, campanhas ou patrocinadores.

### Comercial (`COMERCIAL`)

Fase de negociação do funil, depois que o Scout avaliou:

- Solicita promoção de prospect a aliado.
- Vê o dossiê (não gera nem revisa — isso é do Scout).
- Assume a negociação comercial.
- Vê o resto da plataforma em modo leitura.

**Não** consegue: avaliar/priorizar no radar, editar cadastro, aprovar
nada, tocar em assinantes, campanhas, parametrização ou usuários.

### Aprovador (`APROVADOR`)

O papel mais estreito depois de Leitura — uma função só:

- Aprova ou devolve solicitações pendentes (RN06: nunca a que ele mesmo
  solicitou — ver "Segregação de funções" abaixo).
- Vê a plataforma inteira em modo leitura.

**Não** consegue nenhuma outra ação de escrita — nem cadastro, nem
campanha, nem configuração.

### Leitura (`LEITURA`)

Acesso de visualização total, escrita nenhuma:

- Vê Aliados/Ofertas, funil de Mercado & Scout, Parametrizador, Auditoria,
  Patrocinadores — tudo que existe.

**Não** consegue criar, editar, aprovar, importar, exportar ou configurar
absolutamente nada. É o papel certo para quem precisa acompanhar sem
operar (ex.: diretoria, auditoria externa, consultor pontual).

### Administrador (`ADMIN`)

Configura o produto — não opera o negócio do dia a dia:

- **Exclusivo dele**: definir as metas oficiais (ex.: meta de novos
  aliados/ano), configurar os parâmetros do Serviço de Configuração
  (réguas, tetos, comissão-padrão — RN23), gerir usuários (criar, trocar
  papel, inativar/reativar — RN46/RN47) e configurar o portal (senha,
  sessão e bloqueios — RN72/RN73/RN74).
- Ver dado pessoal pleno de assinante e exportar listas de contato (junto
  com o Gestor).
- Ver e exportar o extrato de auditoria.
- Vê o resto da plataforma (funil, ofertas, campanhas, patrocinadores) em
  modo leitura.

**Não** consegue: criar/editar Aliados ou Ofertas, aprovar solicitações,
mexer no funil de scout, modelar ou ativar campanha, gerir patrocinadores
ou gerar o Relatório do Patrocinador. Essa exclusão é proposital — o
mesmo papel que define as regras não pode ser quem as opera.

### Administrador da Plataforma (`ADMINISTRADOR_PLATAFORMA`)

**Acesso total.** Pode **toda** ação da plataforma — as 35 de hoje e as que
vierem depois, sem ninguém precisar lembrar de concedê-las.

**Não é uma lista de permissões: é uma regra.** Ele vive em
`PAPEIS_COM_ACESSO_TOTAL`, e por isso não aparece como coluna na matriz
abaixo — repeti-lo em 35 linhas só criaria a chance de esquecer uma e furar o
total em silêncio. A cerca `acesso-total-cobre-todas-as-acoes` quebra o build
se isso deixar de valer.

**Nasce sem detentores**, e é a concessão de maior consequência da T27 — por
isso ela exige confirmação explícita na tela.

**A RN06 continua valendo para ele, e não é contradição:** a segregação
solicitante ≠ aprovador é verificada **por registro**, comparando quem pediu
com quem decide. Poder aprovar não é poder aprovar o que se pediu — ele aprova
o pedido dos outros e continua barrado no próprio.

## Regras que atravessam todos os papéis

- **Segregação de funções (RN06)** — quem solicita uma promoção ou
  publicação nunca pode aprovar o próprio pedido, mesmo tendo permissão de
  aprovar em geral. Isso vale para Gestor e Aprovador igual — a regra é
  sobre a pessoa e o pedido, não sobre o papel.
- **Proteção do último Administrador (RN46)** — o sistema recusa rebaixar
  ou inativar a única conta ativa capaz de **gerir usuários**. É preciso
  designar outra antes. A regra é por **capacidade** (`GERIR_USUARIOS`), não
  por nome de papel: a renomeação da Onda 15 mostrou que comparar com o
  literal faria a proteção valer para ninguém, em silêncio.
- **Revogação imediata (RN47)** — trocar o papel de alguém ou inativá-lo
  derruba a sessão dela na próxima requisição (não espera o token
  expirar). Reativar não força nova sessão — não há o que revogar em quem
  já estava fora.
- **Auditoria é só leitura para todos, inclusive o Administrador (RN48)**
  — ninguém edita a trilha pela interface, nem o papel mais amplo. Exportar
  o extrato é ação exclusiva de Gestor e Administrador, e a própria
  exportação vira um evento auditado.
- **O Guia da Plataforma (`/ajuda`) é aberto a todos os papéis, sem
  exceção** — não exige nenhuma permissão específica e não mostra dado
  nenhum da operação (RN58/RN59), então nem entra na tabela de ações.

## Matriz completa (ação × papel)

Fonte: `dominio/autorizacao/permissoes.ts`. "✓" = o papel pode.

**O Administrador da Plataforma não tem coluna aqui, e isso é deliberado**: ele
pode todas, por regra, e uma coluna de 35 vistos convidaria alguém a "corrigir"
uma célula e furar o acesso total sem perceber.

| Ação | Gestor | Analista | Scout | Comercial | Aprovador | Leitura | Administrador |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Visualizar (geral) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Criar/editar Aliado, Solução, Oferta | ✓ | ✓ | | | | | |
| Solicitar promoção a aliado | ✓ | ✓ | | ✓ | | | |
| Aprovar/devolver solicitação | ✓ | | | | ✓ | | |
| Configurar regras de aprovação | ✓ | | | | | | |
| Publicar/pausar/encerrar oferta | ✓ | ✓ | | | | | |
| Gerar exportação (catálogo) | ✓ | | | | | | |
| Importar telemetria (Minutrade/operadora) | ✓ | ✓ | | | | | |
| Visualizar funil (Mercado & Scout) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Incluir no radar | ✓ | | ✓ | | | | |
| Assumir e avaliar (score) | ✓ | | ✓ | | | | |
| Priorizar | ✓ | | ✓ | | | | |
| Gerar/revisar dossiê | ✓ | | ✓ | | | | |
| Ver dossiê | ✓ | | ✓ | ✓ | | | |
| Assumir negociação | ✓ | | | ✓ | | | |
| Designar responsáveis | ✓ | | | | | | |
| Definir metas oficiais | | | | | | | ✓ |
| Visualizar parâmetros | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Configurar parâmetros | | | | | | | ✓ |
| Ver dado pessoal pleno (assinante) | ✓ | | | | | | ✓ |
| Exportar listas de contato | ✓ | | | | | | ✓ |
| Importar assinantes | ✓ | ✓ | | | | | |
| Gerir segmentos | ✓ | ✓ | | | | | |
| Modelar campanha | ✓ | ✓ | | | | | |
| Ativar/encerrar campanha | ✓ | ✓ | | | | | |
| Gerir cestas | ✓ | ✓ | | | | | |
| Gerir usuários | | | | | | | ✓ |
| Visualizar auditoria | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Exportar extrato de auditoria | ✓ | | | | | | ✓ |
| Visualizar patrocinadores | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gerir patrocinadores/contratos/vínculos | ✓ | | | | | | |
| Gerar Relatório do Patrocinador (R1) | ✓ | | | | | | |
| Comentar/pendência na ficha do aliado | ✓ | ✓ | ✓ | ✓ | | | |

## Onde isso é gerenciado

Papel de cada usuário: tela **Usuários** (`/usuarios`), exclusiva do
**Administrador** (e, por acesso total, do Administrador da Plataforma).
Criação de credencial nasce sempre com troca de senha obrigatória — o
Administrador nunca sabe a senha final de ninguém.

## A mesma informação, dentro do produto

O **Manual do usuário** (`/manual`) traz esta matriz em forma de passo a
passo: uma seção por papel, as ações que ele alcança agrupadas por módulo,
com o que é cada uma, onde fica e como se faz. Ele não é escrito à mão —
a lista de ações de cada papel sai da mesma `permissoes.ts` citada no topo
deste documento, e duas cercas de arquitetura reprovam o build se uma ação
ou um papel novo ficar sem lugar nele. É aberto a todos os papéis, como o
Guia da Plataforma (`/ajuda`).

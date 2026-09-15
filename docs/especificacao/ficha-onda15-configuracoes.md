# Ficha de Módulo — Onda 15: Configurações do portal
**Plataforma de Administração e Gestão do Clube Broto** · v0.5 para validação · 15/09/2026

Fase **F23**, única da onda. Módulo novo (**T35**), restrito ao **Administrador** e ao **Administrador da Plataforma**: política de senha, tempo de sessão e os dois bloqueios de acesso — por conta e por origem de rede. Migrations **estritamente aditivas**. Sobre a versão **1.5.0**.

> **Esta ficha é retroativa, e isso é uma ressalva, não um detalhe.**
>
> O rito da casa é ficha validada **antes** do código. Aqui a ordem se inverteu: o módulo nasceu de um pedido direto em conversa ("um botão de configuração… por exemplo critério de senha… mas apenas o administrador"), foi implementado em entregas sucessivas e **já está em produção** desde 14/09. Este documento descreve o que **existe**, para que passe a existir também como especificação — e para que as decisões tomadas no caminho fiquem passíveis de contestação.
>
> Em consequência: **a numeração RN72–RN74 é proposta**, não consagrada, e qualquer divergência entre o que está aqui e o que a Superintendência entende como regra **vence esta ficha** e vira trabalho de correção. O mesmo vale para os pontos do §6.

> **O que a v0.2 muda em relação à v0.1, e por quê.**
>
> A v0.1 foi escrita depois dos PRs #59, #60 e #61 e listava no §6 três lacunas conscientes: sem vencimento periódico de senha, sem teto absoluto de sessão e sem bloqueio por origem. As três foram **pedidas e implementadas na sequência** (PRs #65 e #66), sob a diretriz adicional de que *"tudo precisa ser configurado e possível desativar caso necessário"*. Esta versão incorpora as três ao corpo da ficha, fecha a pendência §6.1 (o guia ganhou a seção 4.9) e registra a lacuna que **permanece** — proteção por taxa na borda, que não é da aplicação.
>
> Nenhuma RN nova foi criada: as três funcionalidades cabem dentro de RN72, RN73 e RN74, porque são a mesma regra com um eixo a mais. Criar RN75–RN77 inflaria a numeração sem separar assunto algum.

> **O que a v0.3 muda.** Só a **§4**: a tela ganhou **abas** e a **faixa de panorama**, depois de a própria tela ficar longa demais para rolar. **Nenhuma regra mudou**, nenhum parâmetro novo, nenhuma migration — as quatro proteções, seus valores, suas faixas e seu comportamento são exatamente os da v0.2. A rodada também fechou uma lacuna antiga que não era de escopo: a T35 **nunca tivera teste a 380px**, nem quando nasceu, e agora tem.

> **O que a v0.4 muda.** Acrescenta a **§5.1**: o papel de administração foi **renomeado** para **Administrador** (valor `ADMIN`), mantendo as mesmas 12 atribuições e os mesmos detentores, e o nome **Administrador da Plataforma** passou a designar um papel **novo, de acesso total**, que nasce sem ninguém. É a primeira mudança de RBAC da ficha e a única desta onda com **migration** — duas, e a separação entre elas é obrigatória por restrição do PostgreSQL.
>
> **Como é renomeação, nada muda para quem já usa** — mesmas permissões, mesma isenção de bloqueio, mesmo peso na RN46. Garantir isso obrigou a rever duas regras que identificavam o administrador pelo nome literal e teriam passado a valer para ninguém; a §5.1 explica.

> **O que a v0.5 muda.** Acrescenta ao §3 (RN72) a ação **exigir nova senha no próximo acesso** — por usuário na T27 e em massa na T35. Ela existe porque ligar a validade de senha **não alcança quem já está na base**: `senhaAlteradaEm` nasce nula e nulo significa "nunca vence", então a política ficava acesa e sem morder até cada pessoa trocar por conta própria. **Sem migration e sem parâmetro novo** — é ato, não configuração.

---

## 1. Por que existe

A plataforma já tinha o **Parametrizador** (Onda 3), que cuida de parâmetro de **negócio** — régua, teto, comissão, meta. Não tinha onde ajustar o que é **técnico e de segurança do portal**, e essas regras viviam como constante em código: o mínimo de senha era `10` escrito na tela de troca, a sessão não expirava por inatividade e não havia bloqueio por tentativa de login.

Configurações é o **irmão de segurança do Parametrizador**: mesma disciplina (escrita só de quem administra, sempre auditada, efeito prospectivo), assunto diferente.

## 2. Entidades

**`ConfiguracaoPortal`** — singleton, id fixo `"portal"`. Uma linha só, criada na primeira gravação. **Ausência de linha = padrões do domínio**, e é isso que preserva o comportamento anterior sem depender de seed.

| Campo | Padrão | Faixa | Desligável |
|---|---|---|---|
| `senhaComprimentoMin` | 10 | 8–64 | não (é sempre um mínimo) |
| `senhaExigeMaiuscula` / `Minuscula` / `Numero` / `Simbolo` | false | — | nasce desligado |
| `senhaHistoricoN` | 5 | 0–24 | **0** |
| `senhaValidadeDias` | **0** | 30–730 | **0** (padrão) |
| `tempoSessaoMin` | 30 | 5–480 | **0** |
| `sessaoTetoMin` | **0** | 30–10 080 | **0** (padrão) |
| `loginMaxTentativas` | 5 | 3–20 | **0** |
| `loginBloqueioMin` | 15 | 1–1440 | — |
| `origemMaxTentativas` | **0** | 5–100 | **0** (padrão) |
| `origemBloqueioMin` | 15 | 1–1440 | — |

**Toda proteção tem `0` como desligamento explícito**, e a faixa válida é *"0 ou entre mínimo e máximo"* — não um contínuo a partir de 1. A diretriz veio do pedido e é deliberada: uma proteção que não se possa desligar é um jeito de perder o acesso à própria plataforma, e quem tem de desligá-la é exatamente quem já está trancado do lado de fora. As três que nascem em `0` (`senhaValidadeDias`, `sessaoTetoMin`, `origemMaxTentativas`) são as que **mudariam o comportamento de quem já usa o sistema** se viessem ligadas — ligar é decisão do Administrador, nunca efeito colateral de um deploy.

**`SenhaHistorico`** — append-only, 1:N com o usuário, cascade. Guarda **só o hash bcrypt** da senha anterior, nunca o texto. Podado a cada troca para o necessário.

**`BloqueioOrigem`** — uma linha por endereço de rede (`origem` única), com `tentativas` e `bloqueadoAte`. Índice em `bloqueadoAte`, que é por onde a listagem de bloqueados consulta. Zera no login bem-sucedido vindo daquele endereço e na liberação manual.

**Colunas em `Usuario`** — `loginTentativas` (default 0), `loginBloqueadoAte` (anulável) e `senhaAlteradaEm` (anulável, **sem backfill**). As duas primeiras zeram no login bem-sucedido e no desbloqueio manual.

Todas as migrations são aditivas: coluna nova com `DEFAULT` ou anulável, tabela nova. **Nenhuma linha existente exigida a preencher valor** — o dever da base povoada (ver CLAUDE.md) vale integralmente e foi cumprido.

> **`senhaAlteradaEm` é anulável de propósito, e o nulo é significativo:** quer dizer *"nunca vence"*. Preenchê-la no backfill com `criado_em` ou `atualizado_em` mandaria **a base inteira** para a tela de troca de senha no primeiro deploy em que o vencimento fosse ligado — a coluna passa a ter valor na primeira troca de cada pessoa, e até lá ninguém é cobrado por um prazo que não começou a correr.

## 3. Regras

### RN72 — A política de senha é configurável, e o histórico guarda hash, jamais texto
Comprimento mínimo, classes de caractere exigidas (maiúscula, minúscula, número, símbolo) e "não repetir as últimas N senhas" são **parâmetro, não constante**. Valem em toda troca de senha feita pelo próprio usuário, e a tela de troca **exibe a política vigente** — dica e `minLength` saem dela, não de texto fixo que envelhece.

O histórico guarda **o hash bcrypt** da senha anterior, nunca o texto, e a comparação roda **fora da transação**: hashear segurando conexão de banco é o defeito que a ordem evita. A senha **atual** conta como a primeira das N.

O padrão **preserva o comportamento anterior** (10, sem exigência de classe) — apertar é decisão do Administrador, não efeito colateral da entrega.

**Vencimento periódico (v0.2).** A senha pode ter prazo: passados N dias desde a última troca, a próxima entrada exige trocar. É a **única** parte da política que alcança quem já está dentro sem pedir nada — apertar comprimento ou classe vale na próxima troca, mas vencimento, por definição, obriga. Daí as três cautelas: nasce em `0` (desligado), a faixa começa em 30 dias para que não se configure um prazo que vence todo mundo amanhã, e `senhaAlteradaEm` nula **nunca vence** (ver §2).

**Exigir nova senha no próximo acesso (v0.5).** Acende a marca de troca obrigatória **sem trocar a senha**, e a distinção é o ponto: "Redefinir credencial" gera uma senha provisória que alguém precisa transmitir — WhatsApp, e-mail, recado —, e todo canal desses é chance de vazamento; esta ação preserva a senha atual, então **nada trafega**. Por isso também **não derruba a sessão**: a pessoa já está autenticada com a senha que se está pedindo para trocar, e derrubar perderia trabalho sem ganhar segurança.

Existe em dois lugares, e os dois são necessários: **por usuário** na T27, e **em massa** na T35, aba Senha, ao lado do parâmetro de validade — que é onde quem liga o vencimento está olhando quando a lacuna se cria. A ação em massa alcança só os **ativos** (inativo não acessa, e quem for reativado já recebe credencial provisória), **inclui quem executa** — a tela já diz que os ajustes valem para todo mundo, inclusive para quem os alterou — e pede **confirmação em dois passos**, porque não tem desfazer: a marca só sai quando cada pessoa troca a senha. Grava **um evento por usuário**, não um agregado: a trilha responde "o que aconteceu com esta conta".

A sessão **não cai** quando a senha vence: o que acontece é que a marca de troca obrigatória se acende, e o usuário é conduzido à tela de troca. Derrubar a sessão seria pior e não mais seguro — a pessoa já está autenticada, e a diferença entre as duas condutas é só quanto trabalho ela perde.

### RN73 — A sessão expira por inatividade, em janela deslizante, e a autoridade é o servidor
Passado o tempo configurado **sem atividade**, a sessão expira; cada atividade reinicia a contagem. Quem decide é o callback `jwt` (vizinho da revogação por época, RN47), e a ordem é deliberada: **a revogação vem antes da inatividade** — quem foi inativado ou rebaixado perde o acesso mesmo ativo no instante, e o motivo registrado precisa ser esse.

**Teto absoluto (v0.2).** Ao lado da janela deslizante há um teto que **não se renova com o uso**: passados N minutos desde o login, a sessão cai ainda que a pessoa esteja trabalhando. Os dois eixos respondem a ameaças diferentes — a inatividade cobre a estação abandonada, o teto cobre a sessão longeva cujo token vazou. Nasce desligado, porque ligá-lo interrompe trabalho em curso de quem já está dentro.

A ordem de avaliação é **revogação → teto → inatividade**, e é significativa: cada motivo é registrado separadamente no log, e sobrepô-los faria a trilha atribuir a queda à causa errada. As três decisões são do servidor; nenhuma depende de o navegador colaborar.

A política é **lida a cada requisição**, não gravada no token: apertar o tempo vale para as sessões já abertas na requisição seguinte.

O contador ao lado do sino é o **reflexo visível** da regra, não a regra: reinicia com atividade real (clique, tecla, rolagem, toque, volta do foco) e, ao zerar, encerra a sessão e leva ao login com o aviso. Com o contador desligado ou o JavaScript ausente, a expiração continua valendo — ela é do servidor.

> **Consequência de implementação que a ficha registra porque é contraintuitiva:** *Server Component não escreve cookie no Next.js*. Numa navegação o token é atualizado em memória e o cookie fica com o valor antigo; quem **persiste** a marca de atividade é a server action do heartbeat. O heartbeat é, portanto, **estrutural** — sem ele a janela contaria desde o login. Medido e provado em `e2e/sessao-inatividade.spec.ts`, que lê e forja o próprio cookie para não depender de esperar 30 minutos.

### RN74 — O bloqueio por tentativas protege a conta, e o Administrador nunca é bloqueado
Falhas **consecutivas** de senha contam; ao alcançar o limite, o acesso fica bloqueado pelo tempo configurado. Enquanto bloqueada, a autenticação é recusada **sem sequer conferir a senha** — acertar a senha não encurta o bloqueio, e errar não o estende. Bloqueio expirado **reinicia a janela**: a pessoa recomeça do zero, não de onde parou.

**O Administrador da Plataforma nunca é bloqueado nem contado.** É decisão de segurança explícita: a conta que faz o desbloqueio não pode se trancar. O preço — a conta mais poderosa não tem essa proteção — é aceito conscientemente; mitigá-lo é assunto de outra onda (ver §6).

Toda recusa devolve o mesmo resultado à camada de autenticação; a tela de login **relê o estado** para distinguir "bloqueado" de "credencial inválida", de modo que o provedor não vaza o motivo. O desbloqueio manual é do Administrador, na própria tela, e é **auditado**.

#### Bloqueio por origem de rede (v0.2)

O bloqueio acima protege **uma conta**; este protege contra quem varre **várias**. Falhas consecutivas vindas do mesmo endereço de rede contam juntas, qualquer que seja a conta alvo, e ao alcançar o limite o endereço fica trancado pelo tempo configurado. Mesma mecânica: recusa antes de conferir a senha, expiração reinicia a janela, liberação manual pelo Administrador e **auditada**.

Três decisões que a implementação tomou e que a ficha registra para serem contestáveis:

1. **Nasce desligado.** Um escritório inteiro costuma sair por um único endereço público — ligar o bloqueio por origem pode trancar todo mundo de uma vez. É a proteção desta ficha com maior potencial de dano acidental, e por isso a que mais precisa de decisão consciente.
2. **Falha contra conta de Administrador conta para a origem.** O Administrador continua entrando de um endereço bloqueado (RN74), mas as tentativas contra ele **somam** no contador do endereço. Sem isso bastaria mirar um e-mail de Administrador para evadir a regra inteira.
3. **A origem vem de cabeçalho (`x-forwarded-for` / `x-real-ip`), e cabeçalho é forjável.** A ficha não finge o contrário: quem forja o próprio endereço escapa do **próprio** bloqueio, o que é uma degradação aceitável — a regra segue valendo para o atacante que não forja, e forjar não permite bloquear terceiros, porque o contador de um endereço nunca nega acesso a outro. Valor irreconhecível é tratado como origem ausente, e origem ausente significa **regra não se aplica**, jamais "bloqueia todos".

> **Isto não é *rate limiting*, e a distinção não é acadêmica.** *Rate limiting* mede **requisições por unidade de tempo** e recusa o excesso; esta regra conta **falhas consecutivas de senha**. A consequência prática: uma inundação de pedidos continua custando uma leitura e uma gravação no banco por tentativa, porque para saber que a falha é falha é preciso consultar. Defesa contra **volume** pertence à borda — WAF ou balanceador, com regra baseada em taxa, antes de a requisição chegar à aplicação —, não cabe nesta tela e está declarada como pendência no §6.

## 4. Tela — T35 Configurações

Item na lateral **abaixo de Auditoria**, visível **só** a quem pode configurar. Quatro blocos, distribuídos em **três abas**:

| Aba | Blocos |
|---|---|
| **Senha** | política de senha — comprimento, classes de caractere, histórico e validade |
| **Sessão** | tempo de sessão — inatividade e teto absoluto |
| **Bloqueios** | bloqueio por tentativas de login (+ lista **Contas bloqueadas**, botão *Desbloquear*) e bloqueio por origem de rede (+ lista **Endereços bloqueados**, botão *Liberar*) |

**Três abas e não quatro, deliberadamente:** os dois bloqueios são irmãos — mesma mecânica, e é onde se desbloqueia. Separá-los obrigaria quem vai liberar alguém a adivinhar, em duas abas, se o que travou foi a conta ou o endereço.

A aba viaja na **query** (`?aba=`), e por isso a navegação é por **âncora nativa, não `<Link>`** — convenção da casa, medida, e prendida pela cerca `infra/arquitetura/navegacao-por-query.test.ts`, onde a tela está declarada. Aba desconhecida na URL cai na padrão (**Senha**), nunca em erro nem em tela vazia.

### Faixa de panorama — o que as abas custam, e como se paga

Acima das abas, sempre visível, uma faixa de quatro células (`kpi-row`, sem CSS novo) com o estado de **cada uma das quatro proteções** e, quando houver, a contagem de contas e endereços bloqueados no momento.

**Ela não é enfeite, é a contrapartida da decisão de usar abas.** Aba esconde: sem a faixa, quem administra o portal poderia nunca abrir a aba *Bloqueios* e nunca descobrir que o bloqueio por origem existe — desligado. A rolagem longa que as abas substituíram tinha essa virtude, a de mostrar tudo que há, e a faixa é o que a devolve. O teste `a faixa de panorama mostra as quatro proteções em TODAS as abas` é quem reprova se alguém a mover para dentro de uma aba.

O texto das células vem do domínio (`dominio/usuarios/resumo-politicas.ts`), não da tela: a interface não pode ter uma segunda opinião sobre o que "desligado" significa. E **proteção desligada aparece como a palavra "Desligado"**, jamais como `0` — número sozinho não distingue *desligado* de *nenhuma tentativa permitida*, que são opostos. É o mesmo hábito que os cartões já tinham.

Quem não é Administrador é redirecionado à HOME. Cada bloco salva sozinho, com aviso próprio de sucesso e de erro: um formulário único obrigaria a revalidar tudo para mudar um campo, e uma recusa numa ponta descartaria a edição da outra.

**Cada proteção desligável exibe, em palavras, o que está valendo** — "o bloqueio por origem está desligado", e não apenas um `0` num campo numérico. Número sozinho não diz se zero significa *desligado* ou *nenhuma tentativa permitida*, que são opostos.

Ao lado do sino do cabeçalho fica o **contador de sessão** (`role="timer"`), que some abaixo de 760px e não existe quando a expiração por inatividade está desligada. Ele é reflexo da regra, nunca a regra (RN73).

A tela reusa o componente existente do repositório (`card`, `field`, `aviso-inline`, `tbl`/`tbl-resp`) e **não tem protótipo próprio**: nasceu depois do v11.2. Conferência visual quando houver versão nova do protótipo é trabalho pendente — não reimplementação.

## 5. RBAC

Ação única **`CONFIGURAR_PORTAL`** — mesmo desenho de `CONFIGURAR_PARAMETROS`, o irmão de negócio. Cobre os quatro blocos e os dois desbloqueios: **não há ação separada** para desbloquear conta nem para liberar endereço.

### 5.1 Renomeação do papel de administração, e o acesso total (v0.4)

Por decisão da TI, o papel de administração foi **renomeado** e um papel de **acesso total** foi criado ao lado dele.

| Valor de enum | Rótulo | Alcance | Detentores |
|---|---|---|---|
| **`ADMIN`** | **Administrador** | as **12 ações** de sempre — configuração, metas, usuários, auditoria, dados pessoais plenos e leitura | **as contas que já existiam**, movidas pela migration |
| **`ADMINISTRADOR_PLATAFORMA`** | **Administrador da Plataforma** | **acesso total**: as 35 ações, e as que vierem depois | **nenhum**, até alguém atribuir |

**O verbo é renomear, e a consequência é que nada muda para quem já usa.** As contas que hoje administram a plataforma continuam com exatamente as mesmas permissões, a mesma isenção de bloqueio e o mesmo peso na RN46 — só o nome do papel delas mudou. O acesso total é papel **novo**, nasce vazio, e é atribuído por ato humano na T27, auditado.

Nenhum outro papel muda de alcance — Gestor segue com 31 ações, Analista com 16, e assim por diante; há teste que cobra essas contagens.

**"Acesso total" está escrito como regra, não como 35 concessões.** A constante `PAPEIS_COM_ACESSO_TOTAL`, em `dominio/autorizacao/permissoes.ts`, é onde o total mora; a matriz responde "quem mais além dele". A explicitação célula a célula que a casa exige não se perde: a tabela do teste continua declarando os **oito** papéis em **todas** as ações, e a cerca `acesso-total-cobre-todas-as-acoes` quebra o build se alguém esburacar o total.

#### O que a renomeação obrigou a rever, e por quê

Duas regras identificavam o administrador pelo **literal** `"ADMINISTRADOR_PLATAFORMA"`. Deixá-las como estavam teria produzido regressão **silenciosa**: depois da migration esse valor não tem nenhum detentor, então as duas regras passariam a valer para ninguém.

1. **RN46 — proteção do último administrador.** A contagem daria zero, a regra nunca dispararia, e seria possível rebaixar o último Administrador deixando a plataforma **sem quem atribui papéis**. Passou a contar quem pode `GERIR_USUARIOS`, que é exatamente o que a regra sempre quis dizer.
2. **RN74 — isenção de bloqueio.** As contas reais, que só trocaram de nome, perderiam a isenção **sem que nada no pedido mandasse tirá-la**. Passou a valer para quem pode `CONFIGURAR_PORTAL` — o motivo original da regra: a conta que destranca as outras não pode se trancar.

Definir as duas por **capacidade** em vez de nome resolve de uma vez e é auto-mantido: papel novo com essas ações entra sozinho.

#### A RN06 e a mudança de governança

**A RN06 continua valendo para o acesso total, e não é contradição:** ela é verificada **por registro**, comparando `solicitanteId` com quem decide — nunca foi permissão de papel. Poder aprovar não é poder aprovar o que se pediu.

**Mas há uma mudança de governança, e ela precisa ser vista.** Antes, parâmetro sensível pedido por um administrador **tinha** de ser aprovado por alguém de fora da administração, porque nenhum administrador possuía `APROVAR_DEVOLVER`. Agora **dois detentores do acesso total podem aprovar um ao outro** — é um par de olhos a menos. Quem quiser restringir tem como, sem código: **designar aprovadores** na regra, que o motor passa a exigir o decisor entre eles. Registrado em teste para não ficar implícito.

Enquanto o acesso total não for atribuído a ninguém, a situação prática é a de hoje: quem escreve parâmetro é o Administrador, que não aprova.

#### Migrations — duas, e a separação é obrigatória

1. `20260915120000_papel_admin` — acrescenta o valor `ADMIN` ao enum.
2. `20260915130000_renomear_administrador` — move as contas existentes para ele.

**Precisam ser arquivos distintos:** o PostgreSQL recusa usar um valor de enum na mesma transação em que ele foi criado, e o Prisma roda cada migration em transação. Juntá-las faria o deploy falhar.

Nenhuma coluna é removida, nenhum tipo é estreitado, nenhuma linha existente é obrigada a preencher valor — o dever da base povoada vale integralmente. A segunda migration **altera dado**, e o dado que altera é exatamente o que a renomeação significa.

#### Risco declarado: dois nomes parecidos, poderes muito diferentes

"Administrador" e "Administrador da Plataforma" ficam vizinhos na lista de papéis da T27, e errar o item concede a plataforma inteira com um clique. A mitigação é a nota ao lado do seletor, ligada ao campo por `aria-describedby`. **Não é mitigação completa** — a proteção real seria confirmação explícita ao atribuir o acesso total, e fica registrada aqui como possível melhoria, não como algo que esta rodada entregou.

## 6. Pendências declaradas — o que esta ficha NÃO resolve

1. **`[A CONFIRMAR — Superintendência]` Proteção da conta do Administrador.** A RN74 o isenta dos dois bloqueios; nenhuma contrapartida foi definida (segundo fator, lista de origens permitidas, alerta em auditoria após N falhas). **É a lacuna de maior consequência desta ficha**: a conta mais poderosa da plataforma é também a única sem limite de tentativas. Enquanto não houver decisão, a isenção vale como está, e o §4.9 do guia a declara ao leitor em vez de escondê-la.
2. **`[A CONFIRMAR — jurídico/Superintendência]` Valores de política para produção.** Os padrões (10 caracteres, 30 min, 5 tentativas/15 min, e as três proteções novas desligadas) são de engenharia, escolhidos para **preservar o comportamento anterior** e por convenção de back-office. Se houver norma interna ou exigência contratual, ela vence e é aplicada pela própria tela, **sem código**.
3. **`[A CONFIRMAR — TI]` Proteção por taxa na borda.** O bloqueio por origem conta falhas de senha, não requisições por tempo (ver RN74), e portanto **não defende contra volume**: cada tentativa ainda custa consulta e gravação. A defesa é regra baseada em taxa no WAF ou no balanceador, provisionada fora da aplicação. Nada nesta ficha a substitui, e nenhuma configuração desta tela a dispensa.
4. **Sem teste de ponta a ponta do vencimento de senha.** A expiração de sessão tem prova medida (`e2e/sessao-inatividade.spec.ts`, que forja o próprio cookie para não esperar 30 minutos); o vencimento de senha tem cobertura de unidade sobre `senhaVenceu`, mas não um caminho e2e que envelheça `senhaAlteradaEm` e verifique a condução à tela de troca. É dívida de teste conhecida, não comportamento incerto.
5. **Sem tela de histórico das próprias configurações.** As mudanças são auditadas e legíveis no módulo de Auditoria, mas não há, na T35, a visão "o que mudou aqui e quando" que o Parametrizador oferece para os parâmetros de negócio.

> **Fechada na v0.2 — §6.1 da v0.1:** o guia ganhou a seção **4.9 · Configurações do portal**, redigida na voz do guia (o documento de referência é da Onda 9 e não a contém), com fonte única em `conteudo/guia-plataforma/secoes.html` como a RN58 exige, e o `MAPA_AJUDA` passou a apontar `/configuracoes` para ela em vez da seção de abertura. A revisão editorial do texto continua sendo de quem cuida do guia, não do código.
>
> **Fechados na v0.2 — §6.4, §6.5 e §6.6 da v0.1:** vencimento periódico de senha, bloqueio por origem e teto absoluto de sessão foram pedidos e implementados; estão descritos em RN72, RN74 e RN73, respectivamente.

## 7. Fora de escopo

Segundo fator; federação/Entra ID (a interface `ProvedorIdentidade` continua sendo o ponto de troca); política de uso — quem recebe qual papel; qualquer parâmetro de negócio (é do Parametrizador); **proteção por taxa na borda**, que é de infraestrutura e não da aplicação (ver §6.3); lista de endereços permitidos (*allowlist*) — o que existe é bloqueio reativo por falha, não autorização prévia por origem.

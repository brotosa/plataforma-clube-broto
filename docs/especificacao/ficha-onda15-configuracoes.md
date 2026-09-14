# Ficha de Módulo — Onda 15: Configurações do portal
**Plataforma de Administração e Gestão do Clube Broto** · v0.2 para validação · 14/09/2026

Fase **F23**, única da onda. Módulo novo (**T35**), exclusivo do Administrador da Plataforma: política de senha, tempo de sessão e os dois bloqueios de acesso — por conta e por origem de rede. Migrations **estritamente aditivas**. Sobre a versão **1.5.0**.

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

---

## 1. Por que existe

A plataforma já tinha o **Parametrizador** (Onda 3), que cuida de parâmetro de **negócio** — régua, teto, comissão, meta. Não tinha onde ajustar o que é **técnico e de segurança do portal**, e essas regras viviam como constante em código: o mínimo de senha era `10` escrito na tela de troca, a sessão não expirava por inatividade e não havia bloqueio por tentativa de login.

Configurações é o **irmão de segurança do Parametrizador**: mesma disciplina (escrita só do Administrador, sempre auditada, efeito prospectivo), assunto diferente.

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

Item na lateral **abaixo de Auditoria**, visível **só** a quem pode configurar. Quatro blocos, na ordem:

1. **Política de senha** — comprimento, classes de caractere, histórico e validade.
2. **Tempo de sessão** — inatividade e teto absoluto.
3. **Bloqueio por tentativas de login** — parâmetros, mais a lista **Contas bloqueadas** com o botão *Desbloquear*.
4. **Bloqueio por origem de rede** — parâmetros, mais a lista **Endereços bloqueados** com o botão *Liberar*.

Quem não é Administrador é redirecionado à HOME. Cada bloco salva sozinho, com aviso próprio de sucesso e de erro: um formulário único obrigaria a revalidar tudo para mudar um campo, e uma recusa numa ponta descartaria a edição da outra.

**Cada proteção desligável exibe, em palavras, o que está valendo** — "o bloqueio por origem está desligado", e não apenas um `0` num campo numérico. Número sozinho não diz se zero significa *desligado* ou *nenhuma tentativa permitida*, que são opostos.

Ao lado do sino do cabeçalho fica o **contador de sessão** (`role="timer"`), que some abaixo de 760px e não existe quando a expiração por inatividade está desligada. Ele é reflexo da regra, nunca a regra (RN73).

A tela reusa o componente existente do repositório (`card`, `field`, `aviso-inline`, `tbl`/`tbl-resp`) e **não tem protótipo próprio**: nasceu depois do v11.2. Conferência visual quando houver versão nova do protótipo é trabalho pendente — não reimplementação.

## 5. RBAC

Ação única **`CONFIGURAR_PORTAL`**, permitida só ao `ADMINISTRADOR_PLATAFORMA` e negada aos outros seis papéis — mesmo desenho de `CONFIGURAR_PARAMETROS`, o irmão de negócio. Cobre os três blocos e o desbloqueio: **não há ação separada** para desbloquear conta.

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

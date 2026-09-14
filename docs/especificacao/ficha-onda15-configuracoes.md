# Ficha de Módulo — Onda 15: Configurações do portal
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 14/09/2026

Fase **F23**, única da onda. Módulo novo (**T35**), exclusivo do Administrador da Plataforma: política de senha, tempo de sessão por inatividade e bloqueio por tentativas de login. Migrations **estritamente aditivas**. Sobre a versão **1.5.0**.

> **Esta ficha é retroativa, e isso é uma ressalva, não um detalhe.**
>
> O rito da casa é ficha validada **antes** do código. Aqui a ordem se inverteu: o módulo nasceu de um pedido direto em conversa ("um botão de configuração… por exemplo critério de senha… mas apenas o administrador"), foi implementado em três entregas (PRs #59, #60, #61) e **já está em produção** desde 14/09. Este documento descreve o que **existe**, para que passe a existir também como especificação — e para que as decisões tomadas no caminho fiquem passíveis de contestação.
>
> Em consequência: **a numeração RN72–RN74 é proposta**, não consagrada, e qualquer divergência entre o que está aqui e o que a Superintendência entende como regra **vence esta ficha** e vira trabalho de correção. O mesmo vale para os pontos do §6.

---

## 1. Por que existe

A plataforma já tinha o **Parametrizador** (Onda 3), que cuida de parâmetro de **negócio** — régua, teto, comissão, meta. Não tinha onde ajustar o que é **técnico e de segurança do portal**, e essas regras viviam como constante em código: o mínimo de senha era `10` escrito na tela de troca, a sessão não expirava por inatividade e não havia bloqueio por tentativa de login.

Configurações é o **irmão de segurança do Parametrizador**: mesma disciplina (escrita só do Administrador, sempre auditada, efeito prospectivo), assunto diferente.

## 2. Entidades

**`ConfiguracaoPortal`** — singleton, id fixo `"portal"`. Uma linha só, criada na primeira gravação. **Ausência de linha = padrões do domínio**, e é isso que preserva o comportamento anterior sem depender de seed.

| Campo | Padrão | Faixa |
|---|---|---|
| `senhaComprimentoMin` | 10 | 8–64 |
| `senhaExigeMaiuscula` / `Minuscula` / `Numero` / `Simbolo` | false | — |
| `senhaHistoricoN` | 5 | 0–24 (0 desliga) |
| `tempoSessaoMin` | 30 | 5–480 |
| `loginMaxTentativas` | 5 | 3–20 |
| `loginBloqueioMin` | 15 | 1–1440 |

**`SenhaHistorico`** — append-only, 1:N com o usuário, cascade. Guarda **só o hash bcrypt** da senha anterior, nunca o texto. Podado a cada troca para o necessário.

**Colunas em `Usuario`** — `loginTentativas` (default 0) e `loginBloqueadoAte` (anulável). Zeram no login bem-sucedido e no desbloqueio manual.

Todas as migrations são aditivas: coluna nova com `DEFAULT` ou anulável, tabela nova. **Nenhuma linha existente exigida a preencher valor** — o dever da base povoada (ver CLAUDE.md) vale integralmente e foi cumprido.

## 3. Regras

### RN72 — A política de senha é configurável, e o histórico guarda hash, jamais texto
Comprimento mínimo, classes de caractere exigidas (maiúscula, minúscula, número, símbolo) e "não repetir as últimas N senhas" são **parâmetro, não constante**. Valem em toda troca de senha feita pelo próprio usuário, e a tela de troca **exibe a política vigente** — dica e `minLength` saem dela, não de texto fixo que envelhece.

O histórico guarda **o hash bcrypt** da senha anterior, nunca o texto, e a comparação roda **fora da transação**: hashear segurando conexão de banco é o defeito que a ordem evita. A senha **atual** conta como a primeira das N.

O padrão **preserva o comportamento anterior** (10, sem exigência de classe) — apertar é decisão do Administrador, não efeito colateral da entrega.

### RN73 — A sessão expira por inatividade, em janela deslizante, e a autoridade é o servidor
Passado o tempo configurado **sem atividade**, a sessão expira; cada atividade reinicia a contagem. Quem decide é o callback `jwt` (vizinho da revogação por época, RN47), e a ordem é deliberada: **a revogação vem antes da inatividade** — quem foi inativado ou rebaixado perde o acesso mesmo ativo no instante, e o motivo registrado precisa ser esse.

A política é **lida a cada requisição**, não gravada no token: apertar o tempo vale para as sessões já abertas na requisição seguinte.

O contador ao lado do sino é o **reflexo visível** da regra, não a regra: reinicia com atividade real (clique, tecla, rolagem, toque, volta do foco) e, ao zerar, encerra a sessão e leva ao login com o aviso. Com o contador desligado ou o JavaScript ausente, a expiração continua valendo — ela é do servidor.

> **Consequência de implementação que a ficha registra porque é contraintuitiva:** *Server Component não escreve cookie no Next.js*. Numa navegação o token é atualizado em memória e o cookie fica com o valor antigo; quem **persiste** a marca de atividade é a server action do heartbeat. O heartbeat é, portanto, **estrutural** — sem ele a janela contaria desde o login. Medido e provado em `e2e/sessao-inatividade.spec.ts`, que lê e forja o próprio cookie para não depender de esperar 30 minutos.

### RN74 — O bloqueio por tentativas protege a conta, e o Administrador nunca é bloqueado
Falhas **consecutivas** de senha contam; ao alcançar o limite, o acesso fica bloqueado pelo tempo configurado. Enquanto bloqueada, a autenticação é recusada **sem sequer conferir a senha** — acertar a senha não encurta o bloqueio, e errar não o estende. Bloqueio expirado **reinicia a janela**: a pessoa recomeça do zero, não de onde parou.

**O Administrador da Plataforma nunca é bloqueado nem contado.** É decisão de segurança explícita: a conta que faz o desbloqueio não pode se trancar. O preço — a conta mais poderosa não tem essa proteção — é aceito conscientemente; mitigá-lo é assunto de outra onda (ver §6).

Toda recusa devolve o mesmo resultado à camada de autenticação; a tela de login **relê o estado** para distinguir "bloqueado" de "credencial inválida", de modo que o provedor não vaza o motivo. O desbloqueio manual é do Administrador, na própria tela, e é **auditado**.

## 4. Tela — T35 Configurações

Item na lateral **abaixo de Auditoria**, visível **só** a quem pode configurar. Três blocos, na ordem: **Política de senha**, **Tempo de sessão** e **Bloqueio por tentativas de login** — este último com a lista **Contas bloqueadas** e o botão *Desbloquear*. Quem não é Administrador é redirecionado à HOME.

A tela reusa o componente existente do repositório (`card`, `field`, `aviso-inline`, `tbl`/`tbl-resp`) e **não tem protótipo próprio**: nasceu depois do v11.2. Conferência visual quando houver versão nova do protótipo é trabalho pendente — não reimplementação.

## 5. RBAC

Ação única **`CONFIGURAR_PORTAL`**, permitida só ao `ADMINISTRADOR_PLATAFORMA` e negada aos outros seis papéis — mesmo desenho de `CONFIGURAR_PARAMETROS`, o irmão de negócio. Cobre os três blocos e o desbloqueio: **não há ação separada** para desbloquear conta.

## 6. Pendências declaradas — o que esta ficha NÃO resolve

1. **O guia não tem seção sobre este módulo.** A 4.6 ("Configurar a plataforma") é sobre o Parametrizador. Enquanto não houver seção, a ajuda contextual de `/configuracoes` abre na abertura — é o caso previsto pela RN59, e a rota está no `MAPA_AJUDA` justamente para a **barra de volta** funcionar. Texto de guia é decisão editorial (RN58), fora do código.
2. **`[A CONFIRMAR — Superintendência]` Proteção da conta do Administrador.** A RN74 o isenta do bloqueio; nenhuma contrapartida foi definida (segundo fator, lista de origens, alerta em auditoria após N falhas). Enquanto não houver decisão, a isenção vale como está.
3. **`[A CONFIRMAR — jurídico/Superintendência]` Valores de política para produção.** Os padrões (10 caracteres, 30 min, 5 tentativas/15 min) são de engenharia, escolhidos para **preservar o comportamento anterior** e por convenção de back-office. Se houver norma interna ou exigência contratual, ela vence e é aplicada pela própria tela, sem código.
4. **Não há política de expiração periódica de senha** (trocar a cada N dias) — decisão consciente de não implementar sem pedido; o histórico existe, o vencimento não.
5. **O bloqueio é por conta, não por origem.** Não há limite por IP nem proteção contra tentativa distribuída. Fora de escopo desta onda.
6. **Sessão: não há teto absoluto.** A janela é só de inatividade — uma sessão com atividade contínua se estende indefinidamente. Teto absoluto (`maxAge`) não foi mexido; se for exigido, é mudança de uma linha e uma decisão.

## 7. Fora de escopo

Segundo fator; federação/Entra ID (a interface `ProvedorIdentidade` continua sendo o ponto de troca); política de uso — quem recebe qual papel; qualquer parâmetro de negócio (é do Parametrizador); expiração periódica de senha; limite por IP.

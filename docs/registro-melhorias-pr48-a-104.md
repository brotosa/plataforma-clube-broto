# Registro de melhorias — PR #48 a #104

Continuação de [`registro-melhorias-completo-pr1-a-47.md`](./registro-melhorias-completo-pr1-a-47.md).
**Cinquenta e sete PRs** mesclados na `main` entre **28/08 e 18/09/2026** — e a
`main` é **produção**: mesclar dispara o deploy (CodeBuild → ECS `sa-east-1`).
Todo PR passou pelo CI completo (typecheck, lint, unidade, integração com banco,
build, e2e + axe AAA, responsividade 380px) antes de mesclar.

**A natureza desta rodada é outra, e a diferença importa.** A anterior (#1–#47)
foi acabamento e correção nascidos de uso, **sem onda nova**. Esta abriu **sete
ondas** — da 15 à 21 —, e nenhuma delas estava no escopo planejado: cada uma
nasceu de pedido direto, de uso em produção ou de falha reproduzida. É o período
em que a plataforma deixou de executar um plano e passou a responder ao que
encontrava.

**Quatorze migrations, todas estritamente aditivas** — verificado por varredura:
nenhuma contém `DROP COLUMN`, `DROP TABLE`, `SET NOT NULL` ou mudança de tipo.
A base está povoada desde a F15, e a regra vale integralmente.

---

## Panorama (#48 a #104)

| PR | Data | Título | Tema | Migration |
|----|------|--------|------|-----------|
| #48 | 28/08 | Registro completo (#1–#47) + Manual do usuário + Ofertas ordenáveis | Docs/UI | Não |
| #49 | 28/08 | Manual: navegação fixa + galeria de telas por módulo | Docs | Não |
| #50 | 01/09 | Conformidade com o CNPJ alfanumérico (IN RFB nº 2.229/2024) | Conformidade | Não |
| #51 | 10/09 | Painel de atividades na ficha do Patrocinador | Funcionalidade | **Sim** |
| #52 | 10/09 | Selo de ambiente AAA, varredura axe ampliada, deep-link da vitrine | Acessibilidade | Não |
| #53 | 10/09 | Filtros no painel de Atividades | Funcionalidade | Não |
| #54 | 11/09 | Anexos nas Atividades: PDF ou print junto do comentário | Funcionalidade | **Sim** |
| #55 | 11/09 | Exportações recentes + reexecutar com a mesma finalidade | Funcionalidade | Não |
| #56 | 11/09 | Manual: a captura desce da galeria para junto das ações | Docs | Não |
| #57 | 11/09 | Cobertura e2e: download do kit (RN71) e esteira nominal (RN69) | Testes | Não |
| #58 | 11/09 | Painel do gatilho de armazenamento (RN71) no Parametrizador | Funcionalidade | Não |
| #59 | 11/09 | Configurações: item na lateral + política de senha | Funcionalidade | **Sim** |
| #60 | 11/09 | Configurações: tempo de sessão + contador ao lado do sino | Funcionalidade | **Sim** |
| #61 | 14/09 | Configurações: bloqueio por tentativas + desbloqueio | Segurança | **Sim** |
| #62 | 14/09 | Manual: entrada de Configurações cobre os três blocos | Docs | Não |
| #63 | 14/09 | Barra de volta da ajuda, prova da expiração, ficha retroativa da Onda 15 | Docs/Correção | Não |
| #64 | 14/09 | Manual: capturas em 1280×1100 | Docs | Não |
| #65 | 14/09 | Configurações: validade de senha, teto de sessão, tudo desligável | Segurança | **Sim** |
| #66 | 14/09 | Configurações: bloqueio de login por origem de rede | Segurança | **Sim** |
| #67 | 14/09 | Guia: seção 4.9 e ficha da Onda 15 em v0.2 | Docs | Não |
| #68 | 15/09 | Configurações: abas e panorama · renomeia Administrador e cria o acesso total | Segurança | **Sim** (2) |
| #69 | 15/09 | Usuários: a coluna Papel ganha três degraus de destaque | UI | Não |
| #70 | 15/09 | Exigir nova senha no próximo acesso, por usuário e em massa | Segurança | Não |
| #71 | 15/09 | Usuários: encerrar sessões sem tirar o acesso | Segurança | Não |
| #72 | 15/09 | Usuários: faixa única de ações, menu "Acesso" e rodapé de paginação | UI | Não |
| #73 | 16/09 | Validade da credencial provisória, com `0` como desligamento | Segurança | **Sim** |
| #74 | 16/09 | Sessão: conserto da aba esquecida · e2e do vencimento de senha | Correção | Não |
| #75 | 16/09 | Usuários: indicador On-line/Offline · importação de telemetria na trilha | Funcionalidade | **Sim** |
| #76 | 17/09 | **F24** — Gerador de relatórios: motor, dois assuntos e a T36 | Funcionalidade | **Sim** |
| #77 | 17/09 | Conceder acesso total passa a exigir confirmação explícita | Segurança | Não |
| #78 | 17/09 | A T35 passa a mostrar quem mudou cada proteção, e quando | Segurança | Não |
| #79 | 17/09 | T36: conserta o layout quebrado — sete classes CSS que não existiam | Correção | Não |
| #80 | 17/09 | **F25** — Funil, Campanhas e Patrocinadores no Gerador | Funcionalidade | Não |
| #81 | 17/09 | **F26** — Telemetria, Assinantes e Auditoria fecham o Gerador | Funcionalidade | Não |
| #82 | 17/09 | **F27** — Visualização: sete desenhos, e as recusas | Funcionalidade | Não |
| #83 | 17/09 | Ficha da Onda 20 e o levantamento das pendências | Docs | Não |
| #84 | 17/09 | **F28** — a saída do relatório em três formatos | Funcionalidade | **Sim** |
| #85 | 17/09 | Ficha da Onda 18 — Painel de relatórios (v0.1) | Docs | Não |
| #86 | 17/09 | **F30** — Painel: vários relatórios lado a lado, e as duas recusas | Funcionalidade | **Sim** |
| #87 | 18/09 | **F31** — o filtro do painel por eixo declarado | Funcionalidade | Não |
| #88 | 18/09 | Ficha da Onda 21 — Proteção na borda (v0.1) | Docs | Não |
| #89 | 18/09 | **F32** — a origem lida da direita para a esquerda | Segurança | Não |
| #90 | 18/09 | Ficha da Onda 21 v0.3 — a borda não é contornável | Docs | Não |
| #91 | 18/09 | A isenção da conta de Administrador deixa de ser invisível (RN74) | Segurança | Não |
| #92 | 18/09 | Ficha da Onda 19 — Interatividade do Gerador (v0.1) | Docs | Não |
| #93 | 18/09 | Corrige a RN74 no CLAUDE.md: "não é contado" deixou de ser verdade | Docs | Não |
| #94 | 18/09 | **F33 (1)** — clicar numa célula filtra o relatório (RN91) | Funcionalidade | Não |
| #95 | 18/09 | **F33 (2)** — descer de nível pelas hierarquias declaradas (RN92) | Funcionalidade | Não |
| #96 | 18/09 | **F34** — ver as linhas por trás do número (RN93) | Funcionalidade | Não |
| #97 | 18/09 | As duas consultas que nasceram na sessão | Docs | Não |
| #98 | 18/09 | O painel nascia sempre privado, e não havia como apagá-lo | Correção | Não |
| #99 | 18/09 | **F35** — a edição do painel (RN94) e o destino do "Pôr no painel" | Funcionalidade | Não |
| #100 | 18/09 | O guia ganha a família de relatórios, e o mapa de ajuda ganha cerca | Docs | Não |
| #101 | 18/09 | Fecha a §5.3 — por observação, e a contagem é refeita | Docs | Não |
| #102 | 18/09 | Dez avisos falsos escondiam um verdadeiro | Correção | Não |
| #103 | 18/09 | A borda declarada entra no Terraform | Infra | Não |
| #104 | 18/09 | As duas últimas decisões internas fecham, e com elas a §5 | UI/Docs | Não |

---

## A. Manual do usuário (#48, #49, #56, #62, #64)

O Manual ganhou forma nesta rodada. Ele é organizado **por ação do RBAC**, não
por tela — e a cerca `manual-cobre-acoes.test.ts` exige verbete para todas as 43
ações, o que é o que o mantém honesto quando o produto cresce.

A evolução das capturas conta uma história de ajuste fino: a galeria por módulo
(#49) provou que imagem separada do texto não é lida, e a captura **desceu para
junto da ação** (#56); depois a moldura passou a **1280×1100** (#64), porque a
anterior mostrava pouco mais que o topo da tela.

## B. Conformidade e acessibilidade (#50, #52)

**CNPJ alfanumérico** (#50): a IN RFB nº 2.229/2024 permite letras nas oito
primeiras posições, e a validação da plataforma recusava. Correção de
conformidade com prazo legal, não melhoria.

**Acessibilidade** (#52): o selo de ambiente foi a AAA, a varredura do axe
ampliou-se para telas que não estavam cobertas, e os cards da vitrine ganharam
deep-link.

## C. Atividades e exportações (#51, #53, #54, #55)

O painel de atividades chegou à ficha do Patrocinador (#51, **migration**),
ganhou **filtros** por pendências abertas / que me mencionam / resolvidas (#53) e
**anexos** — PDF ou print junto do comentário (#54, **migration**).

As exportações de lista passaram a ter **histórico próprio** e reexecução **com a
mesma finalidade** (#55). A finalidade acompanhar a reexecução é o ponto: sem
isso, repetir uma exportação criaria um acesso a dado pessoal sem declaração.

## D. Armazenamento e cobertura de teste (#57, #58)

A RN71 ganhou **painel do gatilho** no Parametrizador (#58): a condição objetiva
de o adapter de objeto entrar — maior kit acima de 50 MB ou total acima de 5 GB —
deixou de ser número num documento e passou a ser medida visível.

E a cobertura e2e alcançou dois caminhos que nunca tinham sido exercitados
ponta a ponta: o **download do kit** (RN71) e a **esteira nominal de telemetria**
(RN69), com fixture sintética.

## E. Configurações do portal — Onda 15 (#59 a #68, #73, #78)

Dez PRs, seis migrations, e **a única ficha retroativa do repositório**: o módulo
foi para produção antes de existir especificação (#63), e a ficha descreve o que
**existe**.

A construção foi incremental e cada camada é um PR: política de senha (#59),
tempo de sessão (#60), bloqueio por tentativas (#61), validade de senha e teto
absoluto (#65), bloqueio por origem de rede (#66), validade da credencial
provisória (#73).

**Duas decisões atravessam todas elas.** A primeira: **`0` desliga**, em toda
proteção — proteção que não se pode desligar é um jeito de perder o acesso à
própria plataforma. A segunda: a tela ganhou **abas e uma faixa de panorama**
(#68), e a faixa existe porque **aba esconde** — sem ela o Administrador poderia
nunca abrir a aba dos bloqueios e nunca saber que o bloqueio por origem existe,
desligado. Proteção desligada aparece na faixa como a **palavra** "Desligado",
nunca como `0`.

O #68 também **renomeou** o papel de administração para **Administrador** e deu
o nome antigo a um papel novo de **acesso total**. Renomear obrigou a rever toda
regra que identificava papel por **nome**: duas comparavam com o literal e
teriam passado a valer **para ninguém, em silêncio**.

E o #78 fechou a ponta que faltava: a T35 passou a mostrar **quem mudou cada
proteção, e quando**.

## F. Usuários e sessão (#69 a #72, #74, #75, #77)

A T27 recebeu o que faltava para administrar de verdade: destaque por papel
(#69), **exigir nova senha no próximo acesso** por usuário e em massa (#70),
**encerrar sessões sem tirar o acesso** (#71), faixa única de ações com menu
"Acesso" e paginação (#72), e o indicador **On-line/Offline** (#75,
**migration**).

**Conceder acesso total passa a exigir confirmação explícita** (#77) — é a única
ação da plataforma que dá a alguém tudo, inclusive o que ainda não existe.

O #74 consertou a **aba esquecida**: a sessão expirava no servidor e a aba
continuava desenhando a tela como se nada fosse.

## G. Gerador de relatórios — Ondas 16, 17 e 20 (#76, #79 a #84)

O módulo maior desde a F13, em três fases (#76, #80, #81), mais a visualização
(#82) e a saída em três formatos (#84).

**O #79 merece registro à parte.** A T36 subiu para produção com o layout
quebrado: sete classes CSS referenciadas e **inexistentes**. Nenhum teste viu,
porque nenhuma cerca lê nome de classe contra o CSS — o mesmo ponto cego que a
Onda 14 tinha registrado sobre estilo inline, em outra forma.

O **#83** produziu o levantamento consolidado das pendências, que passou a ser o
índice único de tudo que espera resposta de terceiro.

## H. Painel de relatórios — Onda 18 (#85, #86, #87, #98, #99)

O painel (#86, **migration**) e o filtro por eixo declarado (#87).

**O #98 é o caso de uso encontrando o que a especificação não previu.** Dois
defeitos, os dois fio solto de entregar criação sem edição: o painel **nascia
sempre privado** — o seletor de visibilidade governava só o "Salvar", e a
gravação caía no padrão sem nada na tela dizendo —, e **não havia como
apagá-lo**: a regra estava escrita, auditada e restrita ao autor desde a F30, e
nenhuma tela a chamava.

O **#99** (F35) deu ao painel a segunda metade, porque "Pôr no painel" criando
painel novo de um bloco produzia **quatro painéis de um bloco** em vez de um
painel de quatro.

## I. Interatividade do Gerador — Onda 19 (#92, #94, #95, #96)

Clicar filtra (#94), descer de nível (#95), ver as linhas por trás (#96).

**A medição do catálogo mudou o desenho antes de haver código**, e é o traço
desta onda: **nenhum** assunto declarava hierarquia, e **34 das 71** dimensões
não declaram operador de vazio. O que parecia dedutível teve de virar
declaração.

## J. Proteção na borda — Onda 21 (#88 a #91, #93, #103)

Onda corretiva de infraestrutura, com **duas metades de dono diferente**: a
borda (WAF e limite de taxa) é da TI e **não foi iniciada**; a aplicação está
entregue e em vigor.

O **#89** corrigiu a leitura de `x-forwarded-for` — que com balanceador na frente
passaria a ler o valor **forjado pelo cliente** —, e o **#103** pôs a variável em
produção e no Terraform. O log provou que o defeito era real: antes da correção,
cada tarefa avisava, uma vez, que lia o valor enviado pelo cliente.

O **#91** tornou visível a isenção de bloqueio da conta de Administrador: até
então, tentar senhas contra ela podia se repetir **sem limite, sem prazo e sem
rastro em lugar algum**. E o **#93** corrigiu o CLAUDE.md, que afirmava algo que
tinha deixado de ser verdade — documentação que envelhece calada é a mesma
família de defeito.

## K. Fecho de documentação (#97, #100, #101, #102, #104)

O guia recebeu a **família de relatórios** inteira em duas seções (#100), e o
mapa de ajuda contextual ganhou **cerca**: quatro telas estavam fora dele, o que
não as fazia abrir na seção errada — fazia **perder a barra de volta**.

O **#102** é o mais instrutivo da rodada: dez dos onze avisos do lint eram falsos
— parâmetros de `useActionState` já marcados com `_`, convenção que a
configuração não honrava — e a parede de ruído **escondia o décimo primeiro**,
que apontava um ajudante de teste cujo nome dizia ler a definição da tela e que
não lia nada.

O **#104** fechou as duas últimas decisões internas: o selo Offline deixou de ser
vermelho, e o nome do arquivo exportado permanece o conservador.

---

## O que esta rodada deixou aberto

Vinte e oito pendências, **todas de terceiros** — 9 da Minutrade, 8 da
Superintendência, 2 do jurídico e 9 da TI. O índice é
[`especificacao/pendencias-consolidadas.md`](./especificacao/pendencias-consolidadas.md),
e as mensagens prontas estão em `especificacao/consultas-a-terceiros.md`.

As três de maior peso: o **WAF** (que a conferência de 18/09 tornou obrigatório,
não opcional — a aplicação não é alcançável por fora do balanceador), o **endereço
público do banco de produção** (acesso direto por `psql` não deixa trilha, e a
RN49 diz que auditoria não se apaga) e a **reunião única com a Minutrade**, da
qual dependem a atribuição das campanhas, os selos de consumo e a reconciliação
das duas contagens.

# Registro da implantação real (28/07/2026) — para importar no Terraform

Esta primeira implantação em `sa-east-1` foi feita **imperativamente via
AWS CLI**, não por `terraform apply` — o ambiente que a executou não tinha
acesso ao `registry.terraform.io` (política de rede bloqueou, mesma classe
de bloqueio que impediu `docker build` local contra o Docker Hub). O código
em `terraform/aws/*.tf` é a especificação pretendida; o **state está vazio**
até alguém rodar os `terraform import` abaixo a partir de uma máquina com
internet normal.

## Divergência do plano original: imagem via ECR, não GHCR

A esteira do repositório (`.github/workflows/ci.yml`, RN61) publica no GHCR
a cada merge na main — mas neste ambiente o GitHub Actions nunca executou
de fato (zero workflow runs registrados, mesmo após merges reais). A imagem
foi então construída pelo **AWS CodeBuild** (roda dentro da AWS, sem
depender de rede externa) e publicada no **Amazon ECR**
(`broto-clube-app`), eliminando a necessidade de credencial do GHCR no ECS.
Os arquivos `.tf` já refletem isso (`ecs.tf`, `variables.tf`) — faltam
`ecr.tf` e `codebuild.tf` formais, que não foram escritos por falta de
tempo; os recursos abaixo existem só via CLI.

Quando a esteira do GitHub passar a publicar de verdade, trocar a origem da
imagem de volta para o GHCR é mudança de configuração, não de arquitetura.

## Recursos criados (para `terraform import`)

| Recurso | ID real |
|---|---|
| VPC | `vpc-0501d0f8c7be90a8c` |
| Internet Gateway | `igw-0ab9f92f78d05f82f` |
| Subnet pública sa-east-1a | `subnet-080e77d4c755742f6` |
| Subnet pública sa-east-1b | `subnet-0a514b3830c212c99` |
| Subnet privada sa-east-1a | `subnet-08dad878090e9ce70` |
| Subnet privada sa-east-1b | `subnet-021c834c2e0e6d6cc` |
| Route table pública | `rtb-04f9292b0a980f1af` |
| Route table privada | `rtb-0c056ca6314de3bce` |
| SG ALB | `sg-03ec061302417afeb` |
| SG ECS | `sg-004f9a0bd01d5a672` |
| SG RDS | `sg-0fe86366926dff17c` |
| RDS instance | `broto-clube-db` (endpoint `broto-clube-db.c8ejna5u4npz.sa-east-1.rds.amazonaws.com`) |
| DB subnet group | `broto-clube-db-subnet-group` |
| Secret auth-secret | `broto-clube/auth-secret` |
| Secret cpf-hash-key | `broto-clube/cpf-hash-key` (**permanente** — nunca girar sem plano de recarga) |
| Secret app-encryption-key | `broto-clube/app-encryption-key` (**permanente** — idem) |
| Secret database-url | `broto-clube/database-url` |
| Secret ghcr-credentials | `broto-clube/ghcr-credentials` — **órfão**: não é mais usado (imagem vem do ECR); pode ser removido |
| IAM role execução ECS | `broto-clube-ecs-execution-role` |
| IAM role CodeBuild | `broto-clube-codebuild-role` — não modelado em `.tf` ainda |
| ALB | `broto-clube-alb` |
| Target group | `broto-clube-tg` |
| Listener HTTP:80 | ARN em `aws-recursos.env` (não versionado) |
| ECS cluster | `broto-clube-cluster` |
| Log group | `/ecs/broto-clube` |
| Task definition app | `broto-clube-app:8` em produção (imagem `1.5.0`; revisões 1–7 obsoletas — ver incidentes abaixo) |
| ECS service | `broto-clube-app-service` |
| ECR repository | `broto-clube-app` — sem `.tf` correspondente ainda |
| CodeBuild projects | `broto-clube-build` (app) e `broto-clube-build-ops` (imagem ops), ambos em **us-east-1** — sem `.tf` correspondente ainda |
| CodeBuild source credentials | `arn:aws:codebuild:us-east-1:373945090777:token/github` — PAT classic da conta `brotosa`, importado via `import-source-credentials`, usado pelo `broto-clube-build` para clonar direto do GitHub e pelo webhook para se autorregistrar |
| CodeBuild webhook | no projeto `broto-clube-build`, filtro `EVENT=PUSH` + `HEAD_REF=^refs/heads/main$` — todo push aceito na `main` builda e deploya sozinho (ver "Esteira de deploy automático" abaixo) |
| Task definition ops | `broto-clube-ops:1` — usada só para `run-task` avulso (migrations/seed), nunca como serviço |

## O que ficou pendente

- **Domínio e HTTPS**: adiado por decisão do usuário. Hoje só HTTP na URL
  do próprio ALB. Existe hosted zone `clubebroto.com.br` já na conta,
  disponível para quando a decisão vier.
- **Job diário agendado (EventBridge Scheduler)**: a imagem ops
  (`broto-clube-ops:1`) já roda `pnpm job:diario` sob demanda via
  `run-task` com override de comando — falta só a regra do Scheduler
  chamando isso uma vez por dia. Não implementado por falta de tempo nesta
  rodada.
- **`ecr.tf` e `codebuild.tf`**: os recursos existem na conta mas não têm
  `.tf` — precisam ser escritos e importados junto com o resto.
- **VPC em us-east-1**: a conta bateu no limite de 5 VPCs/IGWs nessa
  região antes desta pilha existir — não é algo desta implantação, mas
  vale saber se outra pilha precisar de rede nova por lá.
- **Domínio em produção**: `admclube.broto.com.br`, Route53 alias para o
  ALB, certificado ACM validado, listener 80 redirecionando para 443. A
  URL bruta do ALB (`broto-clube-alb-....elb.amazonaws.com`) continua
  funcionando em paralelo — não tem certificado próprio para ela, então
  acessá-la direto por HTTPS dá erro de nome no certificado (esperado,
  não é bug: o certificado é só para o domínio real).

## Incidente: healthcheck de contêiner derrubando a task em produção

Depois de trocar o `AUTH_URL` para o domínio novo (revisão 3), a task
começou a falhar repetidamente com `Task failed container health checks`
— inclusive a revisão anterior (2), que já estava estável havia horas.
Causa: o `healthCheck` da task definition rodava `node -e "require('http')..."`
a cada 30s, um processo Node inteiro nascendo *dentro do mesmo cgroup de
memória* da task (1024 MB) já ocupado pela aplicação — disputa de memória
que ia derrubando o contêiner em loop, mesmo com a aplicação respondendo
normalmente por fora.

Correção (revisão 4): removido o `healthCheck` do contêiner — o alvo do
ALB (`aws_lb_target_group`, que consulta `/api/saude/pronto` de fora,
sem essa disputa) já é a fonte de prontidão usada para roteamento, então
nada foi perdido em cobertura. Memória subida de 1024 para 2048 MB como
margem adicional.

O `update-service` sozinho não resolveu: o serviço acumulou múltiplas
"deployments" empilhadas (revisões 1–4) e o agendador ficou preso
tentando reconciliar todas, sem nunca chegar a tentar a revisão 4. A
saída foi **apagar o service** (`aws ecs delete-service --force`, sem
tocar em cluster/ALB/target group/banco) **e recriar do zero**
(`aws ecs create-service`), só com a revisão 4 — resolveu na hora. Isso
não está refletido em `.tf` porque o `aws_ecs_service` do Terraform já
descreve o estado final correto; não há nada de especial a modelar sobre
o incidente em si, só o registro aqui.

**Se isso se repetir**: não insista em `update-service` por muito tempo
se o `describe-services` mostrar mais de duas `deployments` sem progresso
— apague e recrie o service direto, é mais rápido e mais previsível do
que tentar reconciliar o histórico acumulado.

## Incidente: 429 do Docker Hub bloqueando o build (imagem 1.5.0)

O build de `broto-clube-build` (imagem `1.5.0`, que unifica a edição de
contrato vigente com esta infraestrutura) passou a falhar de forma
consistente na fase `BUILD`:

```
ERROR: unexpected status from HEAD request to
https://registry-1.docker.io/v2/library/node/manifests/22-bookworm-slim:
429 Too Many Requests
```

Causa: o NAT do CodeBuild é um IP compartilhado por várias contas AWS, e o
limite de pull anônimo do Docker Hub (100 pulls/6h) é por IP — não por
conta nem por projeto. Duas tentativas seguidas falharam do mesmo jeito,
confirmando que não era transitório.

Correção: as três etapas do `Dockerfile` (`dependencias`, `construcao`,
`runtime`) passaram a puxar `node:22-bookworm-slim` de
`public.ecr.aws/docker/library/` em vez de `docker.io/library/` — mesmo
conteúdo (espelho oficial da AWS das imagens Docker Official Images), sem
o limite do Docker Hub. Terceira tentativa de build passou de primeira.

## Registro do deploy da imagem 1.5.0

- Task definition `broto-clube-app:7` (imagem `...):1.5.0`), registrada a
  partir da `:6` só trocando a tag da imagem — memória (2048 MB) e ausência
  de `healthCheck` de contêiner preservadas.
- Validada antes de tocar no serviço: task avulsa (`run-task`, mesma
  rede/SG do serviço) com log limpo (`Ready in 300ms`, sem erro) e depois
  `update-service` para a revisão 7 — rollout padrão (rolling, sem
  circuit breaker), task nova ficou `healthy` no ALB antes da antiga
  drenar. Sem downtime observado.
- Pós-deploy: `/api/saude` (200, `vivo`), `/api/saude/pronto` (200,
  `pronto` — confirma alcance ao RDS) e `/entrar` (200) verificados
  direto no ALB; `/aliados` sem sessão devolveu 307 para `/entrar`
  (RN61 — recusa de acesso anônimo em rota protegida).

## Esteira de deploy automático — `main` é sempre produção

Até aqui, cada deploy exigia disparo manual do CodeBuild (upload de zip no
S3) e troca manual do serviço ECS. Decisão do usuário: `main` passa a ser
sempre o que está em produção — todo push aceito lá builda e implanta
sozinho, sem gate humano no meio.

**Como funciona:**

1. `broto-clube-build` trocou a origem de S3 para `GITHUB`
   (`https://github.com/brotosa/plataforma-clube-broto.git`, branch
   `main`), com um PAT classic da conta `brotosa` importado via
   `import-source-credentials` (escopo `repo`, guardado cifrado pela AWS,
   nunca em texto puro em lugar nenhum do repositório).
2. Um webhook no projeto (`create-webhook`, filtro `EVENT=PUSH` +
   `HEAD_REF=^refs/heads/main$`) dispara o build a cada push aceito na
   `main` — o próprio CodeBuild registra esse webhook no GitHub usando o
   mesmo PAT.
3. O `buildspec` (inline no projeto, não em arquivo no repo) builda,
   publica três tags no ECR (versão do `package.json`, sha curto do
   commit, `latest`), registra uma **nova revisão** da task definition
   (clona a atual, só troca a imagem) e chama `update-service` — o ECS
   faz o rollout normal (task nova `healthy` no ALB antes da antiga
   drenar), sem circuit breaker automático.
4. O papel do CodeBuild (`broto-clube-codebuild-role`) ganhou uma política
   nova (`deploy-ecs-automatico`): `ecs:DescribeTaskDefinition` +
   `ecs:RegisterTaskDefinition` (sem escopo de recurso — a API não aceita),
   `ecs:UpdateService` + `ecs:DescribeServices` escopados ao service, e
   `iam:PassRole` escopado só à role de execução da task.

**Incidente na primeira tentativa**: o `buildspec` tinha um `sed -E
's/.*"version": *"([^"]+)".*/\1/'` para extrair a versão do
`package.json`. O `*` logo depois do primeiro `"` é indicador de *alias*
em YAML (`*nome`) — o parser do CodeBuild recusou o arquivo inteiro com
`YAML_FILE_ERROR` na fase `DOWNLOAD_SOURCE`, antes de qualquer comando
rodar. Trocado por `cut -d'"' -f4` (sem caractere especial de YAML). Uma
segunda causa correlata, corrigida no mesmo commit: um bloco `- >` (escalar
dobrado) para a linha do `jq` tinha uma continuação indentada um espaço a
mais que as demais, o que faz o YAML **preservar** a quebra de linha ali
em vez de dobrá-la em espaço — quebraria o comando em três na execução.
Resolvido reescrevendo o filtro `jq` como uma linha só, sem bloco dobrado.
Validado localmente com `yaml.safe_load` antes de reenviar — os dois
builds de teste seguintes passaram de primeira.

**Validado ponta a ponta** com um build manual (`start-build` sem
`environment-variables-override`, para simular exatamente o que o webhook
dispara): registrou `broto-clube-app:8`, atualizou o serviço, rollout sem
downtime, smoke test pós-deploy (`/api/saude`, `/api/saude/pronto`,
`/entrar`) todos 200. O gatilho por webhook em si (push real de alguém,
não disparo manual) ainda não foi exercitado nesta sessão — o próximo
push de verdade na `main` é o primeiro teste real do caminho ponta a
ponta via GitHub.

## Higiene de segurança desta sessão

- A imagem ops **não definia `NODE_ENV=production`** na primeira versão, e
  o seed criou os 7 usuários de desenvolvimento (senha documentada no
  README) na base real. Identificado e corrigido na mesma sessão: usuários
  removidos (`deleteMany` por `email` terminando em
  `@dev.clubebroto.local`) e a imagem corrigida (ver histórico do Git em
  `terraform/aws/docker/Dockerfile.ops`).
- Credenciais usadas nesta implantação (chave AWS do usuário `claudinho` e
  o Personal Access Token do GitHub) foram coladas na conversa que conduziu
  este trabalho — **recomenda-se rotacionar ambas** independentemente do
  resultado técnico, pelo mesmo motivo de qualquer segredo que passou por
  um histórico de chat.
- **Atenção ao rotacionar o PAT do GitHub agora**: diferente de antes, esse
  token passou a ficar **guardado dentro da AWS**, como source credential
  do `broto-clube-build` (`import-source-credentials`, usado também pelo
  webhook). Regenerar o token no GitHub sem reimportar o novo valor
  (`aws codebuild import-source-credentials --server-type GITHUB
  --auth-type PERSONAL_ACCESS_TOKEN --token <novo>` — mesmo comando,
  sobrescreve) quebra a esteira de deploy automático silenciosamente: o
  próximo push na `main` para de disparar build, sem aviso.

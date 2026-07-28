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
| Task definition app | `broto-clube-app:2` (revisão 1 usava GHCR — obsoleta) |
| ECS service | `broto-clube-app-service` |
| ECR repository | `broto-clube-app` — sem `.tf` correspondente ainda |
| CodeBuild projects | `broto-clube-build` (app) e `broto-clube-build-ops` (imagem ops), ambos em **us-east-1** (mesma região do bucket de origem — CodeBuild exige S3 na mesma região) — sem `.tf` correspondente ainda |
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

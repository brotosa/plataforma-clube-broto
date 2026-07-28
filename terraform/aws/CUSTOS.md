# Estimativa de custos — infraestrutura AWS (sa-east-1)

Estimativa de lista (on-demand, sem desconto de Savings Plan/Reserved),
região **São Paulo (`sa-east-1`)** — uma das mais caras da AWS, tipicamente
20–30% acima de `us-east-1` para computação. Os valores abaixo não vieram
da API de preços da AWS (a credencial usada nesta implantação não tem
`pricing:GetProducts`, de propósito — é uma permissão de conta, não de
projeto) nem de raspagem das páginas oficiais (bloquearam o acesso
automatizado). São estimativas por cálculo, a partir de preço público
conhecido de `us-east-1` ajustado pelo prêmio regional de São Paulo.
**Trate como estimativa de planejamento, não como fatura — confirme o
número real no Cost Explorer depois do primeiro ciclo de faturamento.**

## Tabela — custo mensal recorrente (uso 24/7, tráfego baixo/interno)

| Recurso | Configuração | Estimativa/mês |
|---|---|---|
| RDS (instância) | `db.t4g.micro`, PostgreSQL 16, Single-AZ | ~US$ 15–17 |
| RDS (armazenamento) | 20 GB `gp3` | ~US$ 3 |
| RDS (backup) | retenção 7 dias, dentro do tamanho do banco | US$ 0 (incluído) |
| ECS Fargate (vCPU) | 0,5 vCPU, 1 task, 24/7 | ~US$ 19–20 |
| ECS Fargate (memória) | 2 GB, 1 task, 24/7 | ~US$ 8–9 |
| Application Load Balancer (base) | 1 ALB, 2 listeners (80+443) | ~US$ 24–25 |
| Application Load Balancer (LCU) | tráfego administrativo interno, baixo | ~US$ 2–5 |
| Secrets Manager | 4 segredos (`auth-secret`, `cpf-hash-key`, `app-encryption-key`, `database-url`) | ~US$ 1,60 |
| CloudWatch Logs | ingestão + retenção 30 dias, app de baixo volume | ~US$ 1–2 |
| Amazon ECR | 1 repositório, ~300–400 MB entre as tags | < US$ 0,10 |
| Route53 (registro) | 1 registro A/alias na zona `broto.com.br` (a zona em si já existia na conta, não é custo novo) | < US$ 0,50 |
| ACM (certificado) | usado só em recurso AWS (ALB) | US$ 0 |
| S3 (state do Terraform) | poucos MB, versionado | < US$ 0,05 |
| DynamoDB (lock do state) | sob demanda, uso mínimo | < US$ 0,05 |
| Transferência de dados | uso interno de equipe, volume baixo | ~US$ 1–5 (variável) |
| **Total estimado** | | **~US$ 75–90/mês** |

## O que já está deliberadamente enxuto (e por quê)

- **Sem NAT Gateway** — economiza ~US$ 32–35/mês. As tasks do ECS ficam em
  subnet pública com IP próprio; o RDS fica em subnet privada sem rota de
  saída, e não precisa de internet para nada.
- **RDS Single-AZ**, não Multi-AZ — evita dobrar o custo da instância.
  Uso administrativo interno, não uma aplicação de missão crítica com SLA
  de disponibilidade agressivo.
- **1 task Fargate**, sem auto scaling — dimensionado para o uso real hoje
  (equipe interna, não milhares de usuários simultâneos).
- **CloudWatch Logs com retenção de 30 dias**, não indefinida — evita
  acúmulo de custo de armazenamento de log ao longo dos meses.
- **Container Insights desligado** no cluster ECS — métrica mais granular
  tem custo próprio; liga depois se precisar de diagnóstico fino.

## Custo não-recorrente (fora da tabela mensal)

- **AWS CodeBuild** — só cobra pelo tempo de build (`BUILD_GENERAL1_SMALL`),
  usado sob demanda a cada nova imagem publicada (app ou ops), não fica
  ligado o mês inteiro. Poucos centavos por build de alguns minutos.

## O que aumentaria o custo (e por quanto, aproximado)

| Mudança | Efeito estimado |
|---|---|
| RDS Multi-AZ | dobra o custo da instância (~+US$ 15–17/mês) |
| Subir a classe do RDS (ex.: `db.t4g.small`) | dobra o custo da instância |
| Mais réplicas do ECS (auto scaling) | multiplica o custo de Fargate pelo número de tasks |
| Adicionar NAT Gateway | ~+US$ 32–35/mês + tarifa por GB processado |
| AWS WAF na frente do ALB | ~+US$ 5–10/mês + por regra/requisição |
| Reserved Instance / Savings Plan no RDS ou Fargate | **reduz** o custo, se o uso 24/7 se confirmar estável por 1 ano |

## Ponto de limpeza — resolvido

O secret `broto-clube/ghcr-credentials` no Secrets Manager tinha ficado
**órfão** depois que a imagem passou a vir do ECR em vez do GHCR (ver
`IMPLANTACAO-REAL.md`). Apagado em 28/07/2026 (janela de recuperação de 7
dias, padrão do Secrets Manager) — não consta mais na tabela de custo
recorrente acima.

## Como obter o número real

1. **AWS Cost Explorer** (Console → Billing → Cost Explorer), filtrando por
   tag `projeto = broto-clube` — todos os recursos desta pilha foram
   criados com essa tag, então dá para isolar o custo exato depois de
   alguns dias de uso real.
2. **AWS Budgets** — vale criar um orçamento mensal com alerta (ex.:
   avisar em US$ 100/mês) para pegar qualquer desvio cedo, em vez de
   descobrir só na fatura.

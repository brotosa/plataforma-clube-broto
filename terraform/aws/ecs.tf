resource "aws_ecs_cluster" "this" {
  name = "${var.nome_prefixo}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled" # custo extra; liga depois se precisar de métrica fina
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.nome_prefixo}"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.nome_prefixo}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memoria
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([
    {
      name  = "app"
      image = "${aws_ecr_repository.app.repository_url}:${var.imagem_tag}"

      portMappings = [
        { containerPort = 3000, protocol = "tcp" }
      ]

      environment = [
        { name = "AUTH_TRUST_HOST", value = "true" },
        { name = "AUTH_URL", value = "https://admclube.broto.com.br" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "AUTH_SECRET", valueFrom = aws_secretsmanager_secret.auth_secret.arn },
        { name = "CPF_HASH_KEY", valueFrom = aws_secretsmanager_secret.cpf_hash_key.arn },
        { name = "APP_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.app_encryption_key.arn },
      ]

      # SEM healthCheck de contêiner de propósito — removido depois de
      # causar instabilidade real em produção (28/07/2026, ver
      # IMPLANTACAO-REAL.md): o comando `node -e ...` nasce um processo
      # Node inteiro por cima do que já roda, dentro do MESMO cgroup de
      # memória da task, a cada 30s. Com a task em 1024 MB, isso derrubava
      # o contêiner repetidamente (healthy status oscilando) mesmo com a
      # aplicação respondendo normalmente. O alvo do ALB (aws_lb_target_group,
      # que consulta /api/saude/pronto de FORA do contêiner, sem competir
      # por memória) já cobre a prontidão — é a fonte única de saúde desta
      # task. Se um health check de contêiner voltar a ser necessário,
      # subir a memória primeiro e medir, não reintroduzir às cegas.

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }
    }
  ])

  tags = { Name = "${var.nome_prefixo}-app" }
}

resource "aws_ecs_service" "app" {
  name            = "${var.nome_prefixo}-app-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [for s in aws_subnet.publica : s.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true # sem NAT Gateway: é assim que a task alcança GHCR/Secrets Manager
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 3000
  }

  # Só troca a task depois que a nova passar no health check do ALB —
  # equivalente ao que a fumaça da esteira (RN61) já garante antes de
  # publicar a imagem.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  depends_on = [aws_lb_listener.http]
}

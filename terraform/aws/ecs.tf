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
      image = var.ghcr_imagem

      repositoryCredentials = {
        credentialsParameter = aws_secretsmanager_secret.ghcr.arn
      }

      portMappings = [
        { containerPort = 3000, protocol = "tcp" }
      ]

      environment = [
        { name = "AUTH_TRUST_HOST", value = "true" },
        { name = "AUTH_URL", value = "http://${aws_lb.this.dns_name}" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "AUTH_SECRET", valueFrom = aws_secretsmanager_secret.auth_secret.arn },
        { name = "CPF_HASH_KEY", valueFrom = aws_secretsmanager_secret.cpf_hash_key.arn },
        { name = "APP_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.app_encryption_key.arn },
      ]

      # curl/wget não existem na imagem de runtime (RN61 — enxuta, de
      # propósito); o próprio node já está presente e faz a checagem.
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/api/saude',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }

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

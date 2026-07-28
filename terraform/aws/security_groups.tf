resource "aws_security_group" "alb" {
  name        = "${var.nome_prefixo}-alb-sg"
  description = "Entrada pública HTTP/HTTPS para o balanceador do ${var.nome_prefixo}"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP publico"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Pronta para quando o domínio/certificado entrarem (RN61 herda: sem
  # tela nova aqui, mas a porta já fica aberta para não exigir mudança de
  # security group depois).
  ingress {
    description = "HTTPS publico (ativa quando o certificado ACM entrar)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.nome_prefixo}-alb-sg" }
}

resource "aws_security_group" "ecs" {
  name        = "${var.nome_prefixo}-ecs-sg"
  description = "Task do ECS — recebe só do ALB, sai para GHCR/Secrets Manager/CloudWatch/RDS"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Trafego do ALB para a aplicacao"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.nome_prefixo}-ecs-sg" }
}

resource "aws_security_group" "rds" {
  name        = "${var.nome_prefixo}-rds-sg"
  description = "PostgreSQL — recebe só das tasks do ECS desta pilha"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Postgres a partir do ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.nome_prefixo}-rds-sg" }
}

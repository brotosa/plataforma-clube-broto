resource "aws_lb" "this" {
  name               = "${var.nome_prefixo}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for s in aws_subnet.publica : s.id]

  tags = { Name = "${var.nome_prefixo}-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "${var.nome_prefixo}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.this.id
  target_type = "ip"

  # Prontidão (RN61): só entra tráfego quando a aplicação alcança o banco.
  # Liveness fica a cargo do healthCheck do próprio contêiner (ecs.tf).
  health_check {
    path                = "/api/saude/pronto"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = "${var.nome_prefixo}-tg" }
}

# Só HTTP por enquanto — domínio e certificado ACM ficam para quando você
# decidir o domínio (combinado). Trocar para 443 depois é adicionar um
# listener novo, não reconstruir nada disto.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

output "alb_dns_name" {
  description = "URL de acesso enquanto não há domínio próprio."
  value       = "http://${aws_lb.this.dns_name}"
}

output "ecs_cluster" {
  value = aws_ecs_cluster.this.name
}

output "rds_endpoint" {
  value     = aws_db_instance.this.endpoint
  sensitive = true
}

output "vpc_id" {
  value = aws_vpc.this.id
}

output "subnets_privadas" {
  value = [for s in aws_subnet.privada : s.id]
}

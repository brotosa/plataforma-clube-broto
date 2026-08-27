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

output "bastion_instance_id" {
  description = "Id da EC2 bastion (null quando criar_bastion=false)."
  value       = var.criar_bastion ? aws_instance.bastion[0].id : null
}

# Comando pronto para abrir o túnel SSM da 5432 do RDS para o localhost do
# PC. Depois de rodar, conecte com: psql "host=localhost port=5432
# dbname=clube_broto user=broto sslmode=require".
output "bastion_tunel_ssm" {
  description = "Comando aws ssm para encaminhar o RDS ao localhost:5432 (null quando o bastion está desligado)."
  sensitive   = true
  value = var.criar_bastion ? join(" ", [
    "aws ssm start-session",
    "--target ${aws_instance.bastion[0].id}",
    "--document-name AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters '{\"host\":[\"${element(split(":", aws_db_instance.this.endpoint), 0)}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5432\"]}'",
    "--region ${var.aws_region}",
  ]) : null
}

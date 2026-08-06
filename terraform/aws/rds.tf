resource "random_password" "db_master" {
  length  = 32
  special = false # evita caracteres que quebram a URL de conexão sem escaping
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.nome_prefixo}-db-subnet-group"
  subnet_ids = [for s in aws_subnet.privada : s.id]

  tags = { Name = "${var.nome_prefixo}-db-subnet-group" }
}

resource "aws_db_instance" "this" {
  identifier     = "${var.nome_prefixo}-db"
  engine         = "postgres"
  engine_version = "16"

  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "clube_broto"
  username = "broto"
  password = random_password.db_master.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Single-AZ de propósito nesta primeira fase — custo menor para uso
  # administrativo interno; sobe para Multi-AZ depois trocando um valor,
  # sem mudança de arquitetura.
  multi_az = false

  backup_retention_period = 7
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.nome_prefixo}-db-final"
  deletion_protection     = true

  tags = { Name = "${var.nome_prefixo}-db" }
}

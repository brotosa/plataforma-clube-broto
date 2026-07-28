# AUTH_SECRET pode ser rotacionado a qualquer momento (só desloga sessões).
resource "random_password" "auth_secret" {
  length  = 44
  special = false
}

# CPF_HASH_KEY e APP_ENCRYPTION_KEY são PERMANENTES (README/CLAUDE.md):
# girar qualquer uma delas re-identifica ou torna ilegível a base de CPF.
# Gerado uma única vez aqui — não retire nem "taint" estes dois recursos
# sem um plano de recarga de dados.
resource "random_password" "cpf_hash_key" {
  length  = 44
  special = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "random_password" "app_encryption_key" {
  length  = 44
  special = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret" "auth_secret" {
  name = "${var.nome_prefixo}/auth-secret"
}

resource "aws_secretsmanager_secret_version" "auth_secret" {
  secret_id     = aws_secretsmanager_secret.auth_secret.id
  secret_string = random_password.auth_secret.result
}

resource "aws_secretsmanager_secret" "cpf_hash_key" {
  name = "${var.nome_prefixo}/cpf-hash-key"
}

resource "aws_secretsmanager_secret_version" "cpf_hash_key" {
  secret_id     = aws_secretsmanager_secret.cpf_hash_key.id
  secret_string = random_password.cpf_hash_key.result
}

resource "aws_secretsmanager_secret" "app_encryption_key" {
  name = "${var.nome_prefixo}/app-encryption-key"
}

resource "aws_secretsmanager_secret_version" "app_encryption_key" {
  secret_id     = aws_secretsmanager_secret.app_encryption_key.id
  secret_string = random_password.app_encryption_key.result
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.nome_prefixo}/database-url"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${aws_db_instance.this.username}:${random_password.db_master.result}@${aws_db_instance.this.endpoint}/${aws_db_instance.this.db_name}?schema=public"
}

variable "aws_region" {
  description = "Região AWS de implantação."
  type        = string
  default     = "us-east-1"
}

variable "nome_prefixo" {
  description = "Prefixo aplicado a todo recurso desta pilha — isola do que já existe na conta."
  type        = string
  default     = "broto-clube"
}

variable "vpc_cidr" {
  description = "CIDR da VPC dedicada. Escolhido para não colidir com as VPCs já existentes na conta (172.30.0.0/16 x3, 10.20.0.0/16, 172.16.24.0/21)."
  type        = string
  default     = "10.60.0.0/16"
}

variable "azs" {
  description = "Zonas de disponibilidade usadas (2, para o ALB e o RDS)."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "ghcr_imagem" {
  description = "Imagem publicada pela esteira do repositório (RN61), com a etiqueta de versão a implantar."
  type        = string
}

variable "ghcr_usuario" {
  description = "Usuário/organização do GHCR para autenticação do ECS."
  type        = string
  default     = "brotosa"
}

variable "ghcr_token" {
  description = "Personal Access Token do GitHub (escopo read:packages) — nunca commitado, vem de tfvars ignorado pelo git."
  type        = string
  sensitive   = true
}

variable "rds_instance_class" {
  description = "Classe da instância RDS. Menor viável para começar (uso administrativo interno)."
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_storage_gb" {
  description = "Armazenamento do RDS em GB."
  type        = number
  default     = 20
}

variable "ecs_cpu" {
  description = "CPU da task Fargate (unidades, 1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "ecs_memoria" {
  description = "Memória da task Fargate, em MB."
  type        = number
  default     = 1024
}

variable "ecs_desired_count" {
  description = "Número de instâncias da task rodando."
  type        = number
  default     = 1
}

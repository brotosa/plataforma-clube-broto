terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Bootstrap manual (fora do Terraform, de propósito — o backend não pode
  # referenciar a si mesmo): bucket S3 versionado/criptografado/sem acesso
  # público + tabela DynamoDB de lock, ambos com prefixo broto-clube-.
  backend "s3" {
    bucket         = "broto-clube-tfstate-373945090777"
    key            = "broto-clube/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "broto-clube-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      projeto   = "broto-clube"
      ambiente  = "producao"
      gerenciado_por = "terraform"
    }
  }
}

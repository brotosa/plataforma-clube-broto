# Rede dedicada e isolada — nada aqui é compartilhado com o que já existe
# na conta. Sem NAT Gateway (economiza ~US$35/mês): as tasks do ECS ficam
# em subnet pública com IP público próprio e security group restrito, e o
# RDS fica em subnet privada (sem rota de saída), alcançável só de dentro
# da VPC — não precisa de internet para nada.

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.nome_prefixo}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.nome_prefixo}-igw" }
}

resource "aws_subnet" "publica" {
  for_each = { for idx, az in var.azs : az => idx }

  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, each.value + 1)
  availability_zone       = each.key
  map_public_ip_on_launch = true

  tags = { Name = "${var.nome_prefixo}-publica-${each.key}" }
}

resource "aws_subnet" "privada" {
  for_each = { for idx, az in var.azs : az => idx }

  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 11)
  availability_zone = each.key

  tags = { Name = "${var.nome_prefixo}-privada-${each.key}" }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${var.nome_prefixo}-rt-publica" }
}

resource "aws_route_table_association" "publica" {
  for_each       = aws_subnet.publica
  subnet_id      = each.value.id
  route_table_id = aws_route_table.publica.id
}

# Tabela privada só com a rota local (implícita) — sem 0.0.0.0/0, de
# propósito: o RDS não tem e não precisa de saída para a internet.
resource "aws_route_table" "privada" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.nome_prefixo}-rt-privada" }
}

resource "aws_route_table_association" "privada" {
  for_each       = aws_subnet.privada
  subnet_id      = each.value.id
  route_table_id = aws_route_table.privada.id
}

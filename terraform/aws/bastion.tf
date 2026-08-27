# =====================================================================
# Bastion de acesso administrativo ao RDS privado — OPT-IN (var.criar_bastion).
#
# Por que existe: o RDS fica em subnet privada e o security group dele só
# aceita o SG do ECS. Não há rota da internet (nem do laptop) até o banco.
# Para rodar consultas pontuais com psql/DBeaver do PC, é preciso um ponto
# de salto DENTRO da VPC. Este é ele — o menor possível.
#
# Desenho de segurança:
#   - SEM SSH e SEM porta de entrada aberta: o acesso é só por AWS SSM
#     (Session Manager), que é iniciado de fora para dentro pela API da AWS,
#     autenticado por IAM. Por isso o bastion não tem security group de
#     ingresso próprio — reusa o SG do ECS (`aws_security_group.ecs`), que é
#     exatamente quem o RDS já aceita, e não precisa de nenhuma regra nova.
#   - Fica em subnet PÚBLICA (com IP público) porque o agente SSM precisa
#     alcançar os endpoints da AWS pela internet (a subnet privada não tem
#     rota de saída). Não há inbound: IP público sem porta aberta não é
#     superfície de ataque, e o SSM não usa porta de entrada.
#   - t4g.nano: a menor instância; custa ~US$3/mês ligada. PARE a instância
#     (ou volte `criar_bastion=false`) quando não estiver usando.
#
# Como usar depois do apply (com criar_bastion=true):
#   aws ssm start-session --target <bastion_instance_id> \
#     --document-name AWS-StartPortForwardingSessionToRemoteHost \
#     --parameters '{"host":["<rds_endpoint sem :5432>"],"portNumber":["5432"],"localPortNumber":["5432"]}' \
#     --region sa-east-1
#   # e então, no PC: psql "host=localhost port=5432 dbname=clube_broto user=broto sslmode=require"
# =====================================================================

# AMI mais recente do Amazon Linux 2023 para ARM (t4g). O SSM Agent já vem
# instalado e habilitado no AL2023 — nada de user_data obrigatório.
data "aws_ami" "bastion_al2023" {
  count       = var.criar_bastion ? 1 : 0
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_iam_policy_document" "bastion_assume" {
  count = var.criar_bastion ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bastion" {
  count              = var.criar_bastion ? 1 : 0
  name               = "${var.nome_prefixo}-bastion-role"
  assume_role_policy = data.aws_iam_policy_document.bastion_assume[0].json
}

# A política gerenciada do SSM: é só o que o bastion precisa para o Session
# Manager funcionar. Nada de acesso a Secrets/S3/etc. — a senha do banco o
# operador informa no psql, não fica na instância.
resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  count      = var.criar_bastion ? 1 : 0
  role       = aws_iam_role.bastion[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  count = var.criar_bastion ? 1 : 0
  name  = "${var.nome_prefixo}-bastion-profile"
  role  = aws_iam_role.bastion[0].name
}

resource "aws_instance" "bastion" {
  count = var.criar_bastion ? 1 : 0

  ami           = data.aws_ami.bastion_al2023[0].id
  instance_type = "t4g.nano"
  # Subnet pública (rota de saída para o SSM) da primeira AZ.
  subnet_id                   = aws_subnet.publica[var.azs[0]].id
  associate_public_ip_address = true
  # Reusa o SG do ECS: é quem o RDS aceita, sem regra nova. O ingresso do
  # SG (do ALB, na 3000) é inofensivo aqui — nada escuta nessa porta.
  vpc_security_group_ids = [aws_security_group.ecs.id]
  iam_instance_profile   = aws_iam_instance_profile.bastion[0].name

  # Sem key_name de propósito: acesso é só por SSM, nunca por SSH.

  metadata_options {
    http_tokens = "required" # IMDSv2 obrigatório
  }

  # Cliente PostgreSQL na própria instância, para quem preferir abrir um
  # shell SSM e rodar psql direto no bastion (além do túnel para o PC).
  user_data = <<-EOF
    #!/bin/bash
    dnf install -y postgresql15 || dnf install -y postgresql16 || true
  EOF

  tags = { Name = "${var.nome_prefixo}-bastion" }
}

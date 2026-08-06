# A imagem é publicada aqui pelo AWS CodeBuild, não pela esteira do GitHub
# (ver variables.tf e IMPLANTACAO-REAL.md — o GitHub Actions deste
# ambiente nunca publicou no GHCR de fato). O projeto CodeBuild em si
# ainda não está modelado em .tf (existe só via CLI); fica para uma
# próxima rodada junto com o `terraform import` dos recursos reais.
resource "aws_ecr_repository" "app" {
  name                 = "${var.nome_prefixo}-app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

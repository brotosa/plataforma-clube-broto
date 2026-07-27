# Ficha de Módulo — Onda 10: Imagem da solução e ajuste do cabeçalho
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 26/07/2026

Onda curta, dois itens, ambos vindos da homologação. Continuidade: regra **RN60**; sem telas novas. Reaproveita integralmente a infraestrutura construída na Onda 8 para a marca do aliado.

---

## 1. Imagem do card da solução

**Hoje** o cadastro da solução pede o **endereço de uma imagem** (`imagemCardUrl`) — mesmo impasse que o logotipo tinha antes da Onda 8: campo de texto apontando para um objeto que ninguém tem onde hospedar, e por isso nenhum card de solução tem imagem.

**Passa a ser** upload na própria tela, arquivo guardado pela plataforma, servido por rota própria — **exatamente a solução da RN54**, com a infraestrutura já construída: validação de tipo real pela assinatura do conteúdo, tabela própria em relação 1:1, rota de leitura com identificador de versão no cache, troca e remoção auditadas.

**Calibragem diferente da marca, por natureza do uso:**

| | Marca do aliado (RN54) | Imagem do card (RN60) |
|---|---|---|
| Limite | 200 KB | **400 KB** |
| Formatos | PNG, JPG, WEBP, SVG | **PNG, JPG, WEBP** — sem SVG |
| Papel | Identidade da empresa | Ilustração do que a solução é |

O card de vitrine é maior que um logotipo, por isso o limite maior. **SVG fica fora**: imagem de card é fotográfica por natureza, o vetor não traz ganho e traria de volta toda a superfície de higienização.

**Onde a imagem aparece** (decisão da Superintendência): no formulário e na ficha da solução, nos **cards de oferta** — onde a solução é apresentada — e no **kit de campanha**, quando a oferta vinculada tiver imagem. Onde não houver, o lugar mantém o tratamento neutro já existente, nunca espaço quebrado.

**Campo antigo:** `imagemCardUrl` segue o mesmo caminho de `logoUrl` — **mantida como coluna obsoleta**, deixa de ser escrita, com leitura da imagem nova e a antiga como retaguarda enquanto houver valor. A queda entra como dívida no README, com a mesma condição objetiva: quando nenhuma solução tiver valor na coluna antiga.

## 2. Posição do botão de ajuda

O botão **"?"** do cabeçalho passa da posição atual — à esquerda do sino — para a **extremidade direita**, como último elemento da barra, depois do bloco de identidade e do papel.

Decisão da Superintendência, que inverte o racional adotado na Onda 9 (ajuda antes do alerta). Consequência aceita e desejável: a ajuda passa a ser o **último item na ordem de tabulação** do cabeçalho — apropriado, porque ajuda não é ação urgente. Rótulo acessível, comportamento e destino contextual permanecem inalterados.

## 3. Regras de negócio

60. **RN60 — Imagem sob controle da plataforma, calibrada pelo uso.** A imagem do card da solução é armazenada pela própria plataforma, com limite de 400 KB, formatos PNG/JPG/WEBP, tipo validado pelo conteúdo e binário em tabela própria (1:1 com a solução). Ausência de imagem mantém o tratamento neutro da tela, nunca espaço quebrado. Troca e remoção são auditadas.

**Decisão de arquitetura nomeada, para não se rediscutir a cada imagem nova:** *imagem pequena, pouca e identitária vive no banco da plataforma; imagem grande, numerosa e descartável vive em armazenamento de objetos.* Marca do aliado e card de solução são do primeiro tipo — poucas dezenas de arquivos, essenciais à leitura da tela. **Peças de campanha** (`Peca.imagemChave`) são do segundo — muitas por campanha, pesadas, destinadas ao kit — e **permanecem no armazenamento de objetos**, sem alteração nesta onda.

## 4. Fora de escopo

Alterar o armazenamento das peças de campanha; galeria ou múltiplas imagens por solução; recorte ou edição de imagem na plataforma; imagem em qualquer outra entidade.

## 5. Pendências

Nenhuma nova.

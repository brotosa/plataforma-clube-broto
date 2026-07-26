# Ficha de Módulo — Onda 9: Ajuda contextual e rótulo institucional
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 26/07/2026

Onda curta, dois itens. Origem: o **Guia da Plataforma** — documento de referência redigido e diagramado, com rodada de acabamento no Design concluída — e um ajuste de rótulo pendente. Continuidade: tela **T31** (Ajuda), regras **RN58–RN59**. Referência visual: protótipo **v10.1**.

---

## 1. T31 — Ajuda contextual

### 1.1 Por que rota, e não modal

Decisão do Design, ratificada: a ajuda é uma **rota dentro do shell** (`/ajuda`), não modal, não gaveta, não link externo. O guia tem 12 seções e leitura longa — precisa de rolagem, âncora por seção (`/ajuda#j4`), endereço compartilhável, botão voltar do navegador e impressão. Modal prende o leitor no topo, perde histórico e não sobrevive a `Ctrl+P`. Como rota, o guia herda a lateral azul e o cabeçalho, e **o sumário do próprio documento passa a ser índice da página**, em vez de uma segunda barra competindo com o menu do produto.

### 1.2 Acesso e visibilidade

Botão **"?"** no cabeçalho, **à esquerda do sino** — ajuda antes do alerta, que é o item de maior urgência. Rótulo acessível completo ("Ajuda — abrir o guia da plataforma").

**Visível para todos os papéis, sem restrição** (decisão da Superintendência): o guia não expõe dado algum, e ajuda que só alguns enxergam derrota o próprio propósito.

### 1.3 Ajuda contextual — o mapa

O clique abre o guia **na seção correspondente ao módulo de onde partiu**, não no começo:

| Módulo de origem | Seção do guia |
|---|---|
| Dashboard · Cobertura · Mapa da rede · Metas do funil | 4.5 Acompanhar a rede |
| Mercado & Scout (radar, avaliação, dossiê, ficha M1) | 4.1 Trazer um aliado novo |
| Aliados & Soluções (lista, ficha) | 4.1 Trazer um aliado novo |
| Cadastro de solução · Ofertas | 4.2 Publicar e manter ofertas |
| Assinantes (carteira, perfil, importações, segmentos) | 4.3 Base de assinantes |
| Campanhas & Cestas | 4.4 Rodar uma campanha |
| Parametrizador | 4.6 Configurar a plataforma |
| Usuários | 5 Papéis e permissões |
| Aprovações · Auditoria | 3 Os seis princípios |

Módulo sem mapeamento abre na seção de abertura — **nunca em erro**. A rota também é alcançável diretamente, sem contexto.

### 1.4 Volta identificada

Barra no topo da rota com **"← Voltar para {módulo}"**, devolvendo à **tela exata de origem** — não ao Dashboard. Sem origem conhecida (acesso direto pela URL), a barra não aparece.

### 1.5 Conteúdo e apresentação

O guia tem **12 seções**: o que é e o que não é · vocabulário · os seis princípios · seis jornadas de uso · papéis e permissões · por que alguns números não aparecem · glossário. **O texto é imutável nesta onda** — foi redigido, validado e acabado; a implementação transcreve, não reescreve.

Requisitos já resolvidos no protótipo, a replicar: camada de leitura escopada (corpo 16px/1,7, medida de ~68ch) que **não vaza** para o resto da plataforma, cujos tokens permanecem; blocos de destaque (nota, atenção, trava) distinguíveis por **ícone, rótulo e estilo de régua**, nunca só por cor; tabelas no padrão responsivo com rótulo de coluna por célula a 380px; linha do tempo das jornadas com o número do passo acima do título em telas estreitas; sumário no mobile fechado por padrão; **AAA integral** — nenhum texto em cinza claro.

### 1.6 Fonte única

O guia é **um único artefato**, consumido pela rota e pelo documento autônomo (o arquivo que circula e vira PDF pelo navegador). **Nenhuma cópia paralela de conteúdo** — divergência entre os dois é defeito.

## 2. Rótulo institucional da marca

O descritivo da barra lateral passa de "Gestão do Clube" para **"Plataforma de gestão do Clube"**. Onde o rótulo aparece com o nome completo — tela de login e metadados do documento — a forma é **"Plataforma de gestão do Clube Broto"**.

**Não muda** o nome formal do sistema ("Plataforma de Administração e Gestão do Clube Broto"), que consta da documentação, do cabeçalho do kit entregue à Minutrade e do handoff. O que muda é o rótulo de interface.

Cuidado de tela: o descritivo novo é mais longo e a lateral tem largura fixa — a quebra de linha precisa ser **controlada** (sem palavra órfã, sem estouro), na lateral expandida, recolhida e a 380px.

## 3. Regras de negócio

58. **RN58 — Ajuda é leitura, para todos.** A rota de ajuda é acessível a todos os papéis, não exige permissão e não exibe nenhum dado da operação — apenas conteúdo do guia. É somente leitura: não há edição de conteúdo pela interface.
59. **RN59 — Contexto orienta, nunca aprisiona.** A ajuda abre na seção do módulo de origem quando há contexto, na abertura quando não há, e permite navegar livremente para qualquer seção a partir dali. A volta devolve à tela exata de origem; sem origem conhecida, não há volta a inventar.

## 4. Fora de escopo

Busca dentro do guia; edição de conteúdo pela interface; versionamento do guia por papel ou por perfil; capturas de tela (decisão registrada — telas mudam a cada onda e imagem desatualizada confunde mais do que ajuda); tradução.

## 5. Pendências

**[A CONFIRMAR — Superintendência]:** a **política de uso da plataforma**, que define quem recebe qual papel. A seção 5 do guia a referencia; quando existir, entra como anexo natural do documento.

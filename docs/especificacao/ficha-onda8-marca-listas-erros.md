# Ficha de Módulo — Onda 8: Identidade visual do aliado, leitura de listas e falhas legíveis
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 26/07/2026

Origem: **primeira homologação com base povoada** (aliados e ofertas reais, 46 prospects, 2.000 assinantes, 597 eventos de telemetria). Todos os itens vêm de uso real da plataforma, não de especulação. Continuidade: regras **RN54–RN57**; sem telas novas — seis ajustes sobre telas existentes.

---

## 1. Logotipo do aliado — armazenamento na própria plataforma

**Hoje:** o cadastro pede o **endereço de um objeto no S3**, o que torna a marca do aliado refém de um bucket que a TI ainda não provisionou — na prática, nenhum logo existe.

**Passa a ser:** upload na própria tela, arquivo **guardado pela plataforma**, servido por rota própria. Decisão consciente de arquitetura para **este caso específico**: são poucas dezenas de arquivos, pequenos, com consistência transacional de graça e zero dependência externa — sobrevive a qualquer ambiente que a TI escolher. O S3 e o adaptador de exportação **continuam existindo** para o que é volumoso (peças de campanha), onde banco não serve.

**Limites, que são a condição da decisão (RN54):** tamanho máximo **200 KB** por arquivo; formatos **PNG, JPG, WEBP e SVG**; **validação do tipo real do conteúdo**, nunca da extensão; redimensionamento no envio para a maior dimensão necessária; SVG **higienizado** (sem script, sem referência externa) antes de armazenar. Substituição do logo mantém histórico na auditoria; remoção é permitida e volta ao estado sem marca.

**Nota de modelagem obrigatória:** o binário vive em **tabela própria** com relação 1:1 com a empresa — nunca como coluna da empresa. Caso contrário toda consulta que lê aliado passa a carregar o arquivo junto, e a lista de 46 registros (ou de centenas) degrada sem que ninguém entenda por quê.

**Onde a marca aparece (decisão da Superintendência):** ficha do aliado, **lista de aliados**, **cards do funil**, e nos **kits de ofertas e de campanha**. Onde não houver logo, o lugar exibe a inicial em placa neutra — o mesmo tratamento que a lista já usa hoje —, nunca um espaço quebrado.

## 2. Leitura de listas — rolagem × paginação

**Aliados:** conjunto contido (46 hoje, algumas centenas no horizonte). A lista passa a **rolagem contínua**, sem controles de página — ler a rede inteira é gesto frequente e a paginação de 8 interrompe o raciocínio.

**Assinantes:** **mantém a paginação no servidor**, decisão ratificada. A base projetada é de dezenas de milhares e a consulta paginada é o que a sustenta; trocar por carga total quebraria a tela no dia da carga real.

## 3. Célula "Ofertas" do painel (T26)

**Hoje** o destaque é `148 de 192`, dois números competindo pela leitura. **Passa a ser** o número absoluto de **ofertas ativas publicadas com resgate no período** — a mesma base da vitrine viva —, com "de N ativas" descendo para a nota de procedência. Sem base de cálculo, mantém o traço com motivo (RN50).

## 4. Falhas legíveis (RN55)

**Hoje** um erro de configuração ausente chega à tela como *"Não foi possível concluir a ação. Tente novamente."* — genérico e, pior, **conselho errado**: tentar de novo nunca resolveria. O serviço já falha com texto preciso ("CPF_HASH_KEY ausente no ambiente..."); a mensagem se perde no caminho até a interface. Custou meia hora de homologação.

**Passa a valer:** falhas de causa conhecida — validação, permissão, configuração ausente, layout de arquivo, limite excedido — **exibem a mensagem do domínio**, que nomeia a causa e a ação. Falhas inesperadas mantêm mensagem genérica **sem "tente novamente"** e registram o detalhe no log do servidor. **Nunca** vazam à interface: rastro de pilha, caminho de arquivo, SQL, nome de variável de ambiente com valor, ou qualquer identificador interno. A distinção é pelas classes de erro que o domínio já possui, não por texto solto.


## 5. Mover empresa arrastando o card (T8)

**Hoje** a movimentação no funil se faz pelo menu do card ("Mover para {estágio}" / "Descartar"). **Passa a existir também** o gesto de arrastar o card para a coluna de destino — conveniência de mouse, **não** um caminho novo de decisão.

**O que não muda, e é a condição do recurso (RN57):** o servidor continua sendo a autoridade. Arrastar dispara exatamente a mesma operação do menu, com as mesmas validações e o mesmo registro em auditoria (autor, data, origem e destino). Em particular: soltar em **Priorizada** sem avaliação fechada é **recusado** (RN15); soltar em **Descartada** abre o modal dos seis motivos tipificados e só conclui com um deles (RN17); colunas cuja transição não é permitida a partir da origem **não aceitam** o card; e cartões que o papel do usuário não pode mover não são arrastáveis. Recusa devolve o card à coluna de origem **com a mensagem da regra**, nunca em silêncio.

**Em aprovação** é coluna de leitura: o caso ali é governado pelo motor e não se move por arrasto — nem para dentro, nem para fora.

**Acessibilidade:** o menu do card permanece o caminho completo e é o caminho por teclado; arrastar é adicional. Em toque (celular e tablet), o menu continua sendo a via — nenhuma função fica exclusiva do arrasto. Durante o gesto, a coluna de destino indica se aceita ou recusa o card antes de soltar.

## 6. Regras de negócio

54. **RN54 — Marca do aliado sob controle da plataforma.** Logo armazenado pela própria plataforma, com limite de 200 KB, formatos PNG/JPG/WEBP/SVG, tipo validado pelo conteúdo, SVG higienizado e binário em tabela própria (1:1). Ausência de logo exibe placa com inicial, nunca espaço quebrado. Troca e remoção são auditadas.
55. **RN55 — Falha nomeia a causa.** Erros de causa conhecida exibem a mensagem do domínio, com a ação necessária; erros inesperados exibem mensagem genérica sem sugerir repetição e registram detalhe apenas no servidor. Nenhum detalhe interno chega à interface.
56. **RN56 — Leitura proporcional ao conjunto.** Listas de conjunto contido (rede de aliados) leem por rolagem contínua; listas de base ilimitada (assinantes, eventos, auditoria) mantêm paginação no servidor. A escolha é do tamanho esperado do conjunto, não de preferência de tela.
57. **RN57 — Arrastar não cria caminho de decisão.** A movimentação por arrasto no funil executa a mesma operação do menu, com as mesmas validações (RN15, RN16, RN17), o mesmo registro de auditoria e as mesmas permissões. Destino inválido não aceita o card; recusa devolve à origem com a mensagem da regra; transições com efeito colateral (descarte, priorização) mantêm suas confirmações. O menu permanece o caminho completo e acessível — nenhuma função existe apenas no arrasto.

## 7. Fora de escopo

Galeria de imagens do aliado ou banco de mídia (a marca é um arquivo por aliado); upload de imagem em qualquer outra entidade; substituição do S3 nas peças de campanha; internacionalização das mensagens de erro; reordenação de cards dentro da mesma coluna (a ordem do kanban não é dado de negócio).

## 8. Pendências

Nenhuma nova. Herdadas com efeito nesta onda: as chaves de ambiente, agora configuradas em produção, permanecem como item de checklist de qualquer novo ambiente — a RN55 as torna diagnosticáveis em segundos quando faltarem.

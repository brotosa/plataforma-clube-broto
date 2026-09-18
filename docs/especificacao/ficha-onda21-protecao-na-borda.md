# Ficha de Módulo — Onda 21: Proteção na borda
**Plataforma de Administração e Gestão do Clube Broto** · v0.3 para validação · 18/09/2026

A plataforma **não tem WAF nem nenhuma defesa contra volume** — confirmado pela TI em 18/09. Esta onda provisiona a proteção na borda e corrige, na aplicação, a leitura de origem que hoje depende de não haver borda nenhuma. Onda de **uma fase (F32)**, com **duas metades de dono diferente**. Sobre a versão **1.5.0**.

> **A v0.3 fecha a pendência 1 por inteiro** — a topologia e, agora, a segunda metade da pergunta: a borda **não é contornável** (§6.1). E acrescenta a **pendência 6**, que é achado, não escopo: o banco de produção tem endereço público, e nada desta onda o protege. A metade de borda continua sendo da TI, e nada dela foi executado. A numeração **RN90** segue proposta.

> **Esta onda tem uma metade que o Claude Code NÃO pode executar.** Provisionar WAF, balanceador e regras é da TI Broto, na conta AWS — as credenciais desta sessão não têm leitura sequer de `elasticloadbalancing`, `wafv2`, `ecs` ou `cloudfront`. O que está aqui é **especificação e a metade de aplicação**, não execução.

---

## 1. Por que existe

A ficha da Onda 15 §6.3 declarou esta pendência e a RN74 a repete: **o bloqueio por tentativas não é rate limiting, e a distinção não é acadêmica.**

O que a plataforma faz hoje: conta falhas **consecutivas de senha** por conta e por origem, e bloqueia pelo tempo configurado. O que ela **não** faz: limitar requisições por unidade de tempo. Cada tentativa, mesmo recusada, ainda custa uma consulta e uma gravação — então **inundação não é contida em lugar nenhum**.

É a única pendência do repositório que não é falta de decisão nem falta de dado: é exposição, agora, em produção.

---

## 2. O risco que este documento existe para evitar

**Ligar as regras gerenciadas da AWS sem preparo quebra a plataforma em silêncio.**

O conjunto padrão de regras inspeciona o corpo da requisição e **recusa corpo acima de um teto pequeno**. A plataforma envia corpos grandes em caminhos legítimos e cotidianos:

| Caminho | Tamanho | Origem |
| --- | --- | --- |
| Anexo de comentário | **até 5 MB** | `dominio/comentarios/anexo.ts` |
| Peça de campanha | até 1 MB | RN71 |
| Imagem do card da solução | até 400 KB | RN60 |
| Marca do aliado | até 200 KB | RN54 |
| Minuta de contrato | PDF | F19 |
| **`POST /relatorios/exportar`** | definição **+ o SVG do gráfico** | F28 |

O último é o mais traiçoeiro, porque é novo e não parece upload: desde a F28, pedir o relatório em HTML manda o **desenho inteiro** no corpo. Um gráfico de barras com trinta categorias passa folgado de dezenas de quilobytes.

**O sintoma seria devastador e mudo:** a pessoa clica em "Abrir para impressão" e nada acontece; sobe a marca de um aliado e a tela diz que falhou. Nenhum log da aplicação registra nada, **porque a requisição nunca chega nela** — ela morre na borda. E o defeito não apareceria em nenhum teste desta casa: o CI não tem WAF.

**Daí a regra.**

---

## 3. Regra

### RN90 — A borda protege contra volume, e nunca recusa o que a aplicação aceita

**Três partes, e a terceira é a que costuma ser esquecida.**

**(a) Defesa contra volume é da borda.** Limite por taxa sobre requisições por origem, com regra mais apertada no caminho de autenticação. A aplicação **não** implementa rate limiting: já tem o bloqueio por falhas consecutivas (RN74), que resolve outro problema, e duplicar a defesa em dois lugares produz dois limites que divergem.

**(b) Nenhuma regra de borda pode recusar corpo que a aplicação aceita.** O teto de inspeção e as regras de tamanho são calibrados **acima** do maior corpo legítimo — hoje 5 MB, do anexo de comentário. Onde a borda não puder inspecionar um corpo tão grande, a decisão é **deixar passar sem inspecionar**, nunca recusar: a aplicação valida tipo real, tamanho e conteúdo desde a RN54, e é ela a autoridade sobre o que aceita.

**(c) A rota de saúde fica de fora de toda regra de taxa.** `/api/saude` e `/api/saude/pronto` são chamadas de poucos em poucos segundos pelo balanceador (RN61). Uma regra de taxa que as alcance derruba o alvo por excesso de zelo — a plataforma sai do ar por causa da própria proteção, e o diagnóstico é caríssimo porque tudo parece saudável de dentro.

**Toda regra nasce em contagem, não em bloqueio.** Uma janela de observação com o tráfego real vem antes de qualquer recusa: limite calibrado no escuro ou barra quem trabalha, ou não barra ninguém.

---

## 4. A metade de aplicação — e por que ela existe

### O bloqueio por origem hoje lê o valor FORJADO

`infra/identidade/origem-requisicao.ts` lê o **primeiro** elemento de `x-forwarded-for`. Sem balanceador, esse é o valor que o cliente mandou — e o próprio comentário do módulo declara a limitação: quem forja escapa do próprio bloqueio.

**Com balanceador na frente, o valor correto é outro.** O balanceador **acrescenta** o endereço real ao fim da lista: um cliente que envie `x-forwarded-for: 1.2.3.4` chega à aplicação como `1.2.3.4, <endereço real>`. Ler o primeiro elemento continua lendo **exatamente o que o atacante escreveu** — e, pior, passa a ser evitável por qualquer um, não só por quem sabe.

Hoje isso é degradação declarada. **No dia em que a borda entrar, vira defeito**, porque a informação correta passa a existir e a aplicação continua ignorando.

**O que a F32 muda na aplicação:** a origem passa a ser lida contando **da direita para a esquerda**, pulando o número de saltos confiáveis — um parâmetro nomeado, porque o número depende da topologia (só balanceador? balanceador atrás de CDN?) e trocá-lo não pode exigir deploy de código novo. Sem o parâmetro configurado, o comportamento é o de hoje, e a aplicação **diz no log** que está lendo origem sem borda declarada.

Isso é pequeno, testável, e é o que faz o bloqueio por origem da RN74 deixar de ser decorativo.

### Implementado — `infra/identidade/origem-requisicao.ts`

Um leitor só na plataforma inteira (verificado: nenhum outro ponto lê `x-forwarded-for`), e a variável é **`SALTOS_CONFIAVEIS_NA_BORDA`**, documentada no `.env.example`. **Em produção, `1`.**

Quatro decisões que a implementação tomou e que valem registro, porque cada uma é um jeito de errar:

1. **Cadeia mais curta que a topologia devolve ausência, nunca o primeiro elemento.** Se a lista tem menos elementos do que os saltos declarados, alguém está falando com a aplicação por fora da borda — ou a borda não acrescentou. Cair para o primeiro ali seria voltar a ler o valor forjado **exatamente no caso suspeito**. Sem origem, a regra não se aplica, que é o que a RN74 já manda.
2. **Com borda declarada, `x-real-ip` deixa de valer.** O balanceador não o escreve; qualquer cliente escreve. Aceitá-lo como queda reabriria o buraco pelo outro lado. Ele só continua valendo no modo sem borda.
3. **Valor ilegível da variável cai para `0` e nomeia a variável no log**, sem imprimir o valor (RN55). Configuração malfeita não pode derrubar o login — mas também não pode ser silenciosa. Há teto de sanidade (8 saltos): um número absurdo faria toda lista parecer curta e **desligaria o bloqueio por origem em silêncio**.
4. **O log não carrega o conteúdo do cabeçalho**, só as contagens (`recebidos`, `esperados`). O cabeçalho é texto de cliente, e texto de cliente não entra em linha de log. Os avisos saem **uma vez por processo**: são de configuração, não de requisição.

Vinte e um testes, com 0, 1 e 2 saltos, e a cerca verificada nos dois sentidos — reintroduzido o defeito (ler o índice 0), quatro testes quebram.

---

## 5. Fase

**F32 — a onda inteira**, em duas metades que não dependem uma da outra para começar:

| Metade | Dono | O que é | Estado |
| --- | --- | --- | --- |
| **Borda** | TI Broto, na conta AWS | Provisionar, calibrar em contagem, depois bloquear | **Não iniciada** |
| **Aplicação** | Claude Code | A leitura de origem por saltos confiáveis, com teste | **Entregue** |

A metade de aplicação **não esperou** a outra: sem o parâmetro, ela preserva o comportamento atual.

**Um passo de implantação, e ele não é de código.** A leitura correta só entra em vigor quando `SALTOS_CONFIAVEIS_NA_BORDA=1` estiver na definição de tarefa do ECS. Até lá o código novo está no ar comportando-se como o antigo — e dizendo isso no log a cada processo novo. É o único item desta fase que depende de alguém fora do repositório.

---

## 6. Pendências declaradas — o que a TI precisa responder

1. ~~**`[A CONFIRMAR — TI]` O que existe hoje na frente da aplicação.**~~ **RESPONDIDO em 18/09/2026.**

   **Um balanceador de aplicação, sozinho, e mais nada.** `broto-clube-alb`, voltado para a internet, na VPC `vpc-0501d0f8c7be90a8c`, com nós em `sa-east-1a` e `sa-east-1b`. Dois listeners: **443** com o certificado de `admclube.broto.com.br` **ligado no próprio balanceador**, e **80** redirecionando para 443 (301). O grupo de destino `broto-clube-tg` é do tipo **IP**, `HTTP:3000`, HTTP1, com **um** destino íntegro (`10.60.1.123:3000`) — a tarefa do ECS, direto.

   **Quatro evidências independentes de que não há CDN:** (a) `admclube.broto.com.br` resolve para `54.233.131.179` e `18.229.252.240`, que são **exatamente os dois endereços do balanceador** — uma distribuição de CDN resolveria para o conjunto global dela, não para o par de nós em sa-east-1; (b) a porta 80 responde `server: awselb/2.0`, **sem** `via: … CloudFront`, `x-amz-cf-id` ou `x-cache`; (c) o certificado do domínio de produção está no listener do balanceador, não numa distribuição; (d) dois endereços, um por zona, é a assinatura de um balanceador de duas AZ.

   **Decorre daí:** o WAF se associa **regionalmente, neste balanceador** (não em escopo global), e o número de saltos confiáveis é **1**.

   **A segunda metade da pergunta — se a borda é contornável — também está RESPONDIDA, e a favor.** O `broto-clube-ecs-sg` (`sg-004f9a0bd01d5a672`) libera a porta 3000 **exclusivamente** do `broto-clube-alb-sg` (`sg-03ec061302417afeb`), com `IpRanges` vazio: nenhum CIDR alcança a aplicação. Quem não passa pelo balanceador não fala com ela.

   **Decorre daí que o WAF será obrigatório, não opcional** — não há caminho paralelo a proteger nem a esquecer. O `broto-clube-alb-sg` abre 80/443 ao mundo, que é o esperado de um balanceador voltado à internet.

2. **`[A CONFIRMAR — TI]` Os limites de taxa.** Proposta para calibrar em contagem: **caminho de autenticação** bem mais apertado que o geral, porque é onde o custo por tentativa é alto e o tráfego legítimo é baixo. Números só depois da janela de observação — a plataforma tem poucas dezenas de usuários, e um limite de catálogo barraria a operação num dia de carga.
3. **`[A CONFIRMAR — TI]` Teto de inspeção de corpo.** Precisa comportar **5 MB**, ou a regra tem de deixar passar sem inspecionar o que exceder. Confirmar o teto vigente do serviço e o custo de elevá-lo.
4. **`[A CONFIRMAR — TI]` Regras gerenciadas: quais entram.** As de injeção e entrada maliciosa conhecida têm valor direto. A de **restrição de tamanho** é a que quebra os uploads — decidir se entra com exceção por caminho ou se fica fora.
5. **`[A CONFIRMAR — Superintendência]` O que fazer com quem estoura o limite.** Recusar, desafiar, ou só registrar. Recusa silenciosa num escritório que sai por um endereço só tranca todo mundo — é o mesmo argumento que fez o bloqueio por origem da RN74 nascer desligado.

6. **`[A CONFIRMAR — TI]` O banco de produção tem endereço público, e nada desta onda o protege.** Achado da conferência de grupos de segurança de 18/09 — **fora do escopo da RN90**, registrado aqui porque foi aqui que apareceu e porque ninguém mais o está olhando.

   **O que é verdade, com precisão.** Não é "o banco está aberto para a internet": o `broto-clube-rds-sg` (`sg-0fe86366926dff17c`) barra tudo menos o `broto-clube-ecs-sg` e o CIDR `177.140.15.214/32`. O que é verdade é que a instância `broto-clube-db` está com `PubliclyAccessible: true` — o endpoint resolve para endereço público, e **a única coisa entre ele e a internet é uma regra de grupo de segurança**. A `pto-broto` está privada, como deveria.

   **Quatro consequências, e a quarta é a que colide com uma regra escrita desta plataforma:**

   1. **Aquele `/32` é a saída de um lugar, não de uma pessoa.** Quem estiver atrás daquele endereço — o escritório inteiro, a rede de visitantes, o equipamento comprometido de qualquer um ali — alcança a porta 5432 do banco de produção. A regra não distingue.
   2. **Endereço de operadora muda.** Quando mudar: ou a regra é alargada às pressas para alguém voltar a trabalhar, ou fica apontando para o endereço que a operadora entregou a outro cliente.
   3. **Não há segunda camada.** WAF, limite de taxa (RN90) e bloqueio por origem (RN74) são todos da aplicação. Este caminho passa por fora dos três.
   4. **Acesso direto ao banco não deixa trilha — e a RN49 diz que auditoria não se apaga.** Aqui ela nem chega a existir: quem entra por `psql` altera aliado, oferta, assinante ou a própria tabela de auditoria **sem gravar evento nenhum**. A garantia de que toda mutação registra valor anterior, novo e autor vale para quem entra pela aplicação. Esta é uma porta lateral, e a base do outro lado tem 2.000 assinantes, a telemetria e a própria trilha.

   **Encaminhamento proposto, e é decisão de infraestrutura, não de código:** `PubliclyAccessible: false`, com acesso administrativo por **encaminhamento de porta via SSM Session Manager** — dispensa host bastião, não depende de endereço fixo e registra cada sessão no CloudTrail, o que responde ao item 4. Duas ressalvas declaradas: é um `modify-db-instance`, **não é instantâneo e pode interromper conexões**, então quer janela; e não foi verificado se o `broto-clube-db-subnet-group` está em sub-redes públicas — se estiver, tirar o endereço público é o passo certo, mas não é o desenho final.

---

## 7. Fora de escopo

Proteção contra negação de serviço distribuída além do que o serviço gerenciado já faz. Autenticação na borda. Geobloqueio. Inspeção de resposta. E **rate limiting dentro da aplicação** — seria o segundo limite que a RN90(a) existe para impedir.

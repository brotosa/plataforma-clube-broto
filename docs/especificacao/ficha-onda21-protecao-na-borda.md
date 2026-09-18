# Ficha de Módulo — Onda 21: Proteção na borda
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 18/09/2026

A plataforma **não tem WAF nem nenhuma defesa contra volume** — confirmado pela TI em 18/09. Esta onda provisiona a proteção na borda e corrige, na aplicação, a leitura de origem que hoje depende de não haver borda nenhuma. Onda de **uma fase (F32)**, com **duas metades de dono diferente**. Sobre a versão **1.5.0**.

> **Ficha antes do código.** Nada foi implementado. A numeração **RN90** é proposta.

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

---

## 5. Fase

**F32 — a onda inteira**, em duas metades que não dependem uma da outra para começar:

| Metade | Dono | O que é |
| --- | --- | --- |
| **Borda** | TI Broto, na conta AWS | Provisionar, calibrar em contagem, depois bloquear |
| **Aplicação** | Claude Code | A leitura de origem por saltos confiáveis, com teste |

A metade de aplicação **não espera** a outra: sem o parâmetro, ela preserva o comportamento atual.

---

## 6. Pendências declaradas — o que a TI precisa responder

1. **`[A CONFIRMAR — TI]` O que existe hoje na frente da aplicação.** ECS está atrás de balanceador de aplicação? Há CDN? A resposta decide **onde** o WAF se associa e **quantos saltos confiáveis** a aplicação deve pular.
2. **`[A CONFIRMAR — TI]` Os limites de taxa.** Proposta para calibrar em contagem: **caminho de autenticação** bem mais apertado que o geral, porque é onde o custo por tentativa é alto e o tráfego legítimo é baixo. Números só depois da janela de observação — a plataforma tem poucas dezenas de usuários, e um limite de catálogo barraria a operação num dia de carga.
3. **`[A CONFIRMAR — TI]` Teto de inspeção de corpo.** Precisa comportar **5 MB**, ou a regra tem de deixar passar sem inspecionar o que exceder. Confirmar o teto vigente do serviço e o custo de elevá-lo.
4. **`[A CONFIRMAR — TI]` Regras gerenciadas: quais entram.** As de injeção e entrada maliciosa conhecida têm valor direto. A de **restrição de tamanho** é a que quebra os uploads — decidir se entra com exceção por caminho ou se fica fora.
5. **`[A CONFIRMAR — Superintendência]` O que fazer com quem estoura o limite.** Recusar, desafiar, ou só registrar. Recusa silenciosa num escritório que sai por um endereço só tranca todo mundo — é o mesmo argumento que fez o bloqueio por origem da RN74 nascer desligado.

---

## 7. Fora de escopo

Proteção contra negação de serviço distribuída além do que o serviço gerenciado já faz. Autenticação na borda. Geobloqueio. Inspeção de resposta. E **rate limiting dentro da aplicação** — seria o segundo limite que a RN90(a) existe para impedir.

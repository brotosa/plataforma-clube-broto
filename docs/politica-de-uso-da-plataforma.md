# Política de uso da Plataforma do Clube Broto

**Quem recebe qual papel, e quem aprova a concessão.**

> **RASCUNHO para validação da Superintendência** — 21/09/2026. Os pontos
> marcados `[A DEFINIR]` são os que só ela pode responder; o resto deriva da
> matriz de permissões que já existe. A seção 5 do Guia da Plataforma aponta
> para este documento.

## 1. O que esta política é, e o que ela não é

[`perfis-de-acesso.md`](./perfis-de-acesso.md) responde **o que cada papel
pode**. Esta política responde **quem deve recebê-lo**.

Ela não altera permissão nenhuma: a matriz vive em
`dominio/autorizacao/permissoes.ts` e é a fonte da verdade. Se um dia
divergirem, o código vence e este documento é que está errado.

## 2. O princípio

**O menor alcance que permita o trabalho.** O papel se concede pelo que a
pessoa precisa **fazer**, não pelo cargo que ela ocupa. Diretor que só
acompanha recebe **Leitura**, como qualquer outra pessoa que só acompanha.

## 3. A linha que mais importa

**Apenas dois papéis alcançam dado pessoal de assinante:** Gestor do Clube e
Administrador. São os únicos que podem ver o dado pleno e exportar listas de
contato.

Essa é a fronteira que esta política existe para guardar, e a razão é de
reversibilidade: quase toda concessão errada se corrige tirando o papel — mas
**lista exportada saiu**, e não volta. A exportação é auditada e exige
finalidade declarada; nenhuma das duas coisas a desfaz.

## 4. Quem recebe cada papel

| Papel | Quem recebe | Alcança dado pessoal |
|---|---|---|
| **Leitura** | Quem acompanha sem operar — diretoria, auditoria externa, consultoria pontual. **É o padrão de quem pede acesso "só para ver".** | Não |
| **Aprovador** | Quem decide promoções e publicações **e não as origina**. Papel de decisão, não de operação. | Não |
| **Comercial** | Quem negocia com prospect: solicita promoção, lê dossiê, assume negociação. | Não |
| **Analista de Scout** | Quem roda o funil de prospecção — radar, avaliação, priorização, dossiê. | Não |
| **Analista de Aliados** | Quem mantém o cadastro no dia a dia: aliados, soluções, ofertas, campanhas, importações. | Não |
| **Gestor do Clube** | Quem **responde pela operação** do Clube. São 31 das 35 ações — é o papel mais amplo do negócio, e a concessão é nominal, não por equipe. | **Sim** |
| **Administrador** | Quem **administra a plataforma**, não quem opera o negócio: parâmetros, metas, usuários e configurações do portal. | **Sim** |
| **Administrador da Plataforma** | **Acesso total**, inclusive a ações que ainda não existem. Concede-se quando alguém precisa fazer **tudo** e a alternativa seria acumular papéis. | **Sim** |

## 5. As concessões que exigem aprovação nomeada

Quatro, e por motivos diferentes:

1. **Gestor do Clube** — alcança dado pessoal e opera quase tudo.
2. **Administrador** — alcança dado pessoal, gere usuários e configura as
   proteções de acesso do portal.
3. **Administrador da Plataforma** — acesso total. A tela já exige confirmação
   explícita para concedê-lo; esta política exige que a confirmação tenha um
   nome por trás.
4. **Qualquer papel para pessoa de fora da Broto** — inclusive Leitura. O
   alcance é o menor da lista, mas a pessoa não está sujeita às mesmas
   obrigações de quem é da casa.

Os demais papéis são concedidos pelo Administrador mediante pedido da chefia
da pessoa, sem aprovação adicional.

**Quem aprova as quatro acima:** `[A DEFINIR — Superintendência]`.

## 6. Saída e mudança de função

**Ninguém é excluído; é inativado.** A plataforma não apaga usuário — quem tem
histórico permanece, e a autoria dele nos registros e na trilha de auditoria
continua (RN47).

**A revogação é imediata:** trocar o papel de alguém ou inativá-lo derruba a
sessão dela na requisição seguinte, sem esperar o token expirar.

**Mudança de função é revisão de papel**, não acúmulo: quem sai do Scout para o
Comercial troca de papel, não soma os dois.

## 7. Revisão

**Por evento:** toda entrada, saída ou mudança de função.

**Por varredura:** `[A DEFINIR — Superintendência]` a periodicidade. A tela de
Usuários (T27) já serve à conferência — lista todos, com papel, situação e
último acesso, e o indicador de presença mostra quem nunca entrou.

**Uma pergunta a responder na primeira varredura:** quantas contas hoje têm
capacidade de configurar o portal. Ela importa porque a isenção de bloqueio do
Administrador (RN74) se justifica quando há **uma** conta — se ela se trancasse,
ninguém a destrancaria. Com mais de uma, uma destranca a outra, e a isenção
passa a merecer nova discussão. **Não conferimos esse número**; a T27 o mostra.

---

## O que este documento deliberadamente não faz

**Não lista pessoas.** Nomes mudam mais rápido que políticas, e a lista viva é a
T27.

**Não cria papel novo.** A pergunta sobre um papel próprio de marketing foi
respondida em 21/09 — **não se cria agora** —, e a razão vale como critério
geral: papel se justifica quando alguém é impedido do que precisa ou alcança o
que não deveria. Antes disso, é coluna a mais numa matriz de 35 ações e custo
de manutenção permanente.

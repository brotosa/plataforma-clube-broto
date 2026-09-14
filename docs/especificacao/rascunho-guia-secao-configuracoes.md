# Rascunho editorial — seção do guia para Configurações do portal
**Para validação da Superintendência** · 14/09/2026 · pendência §6.1 da ficha da Onda 15

> **Isto NÃO é o guia.** A RN58 diz que o guia tem uma fonte só (`conteudo/guia-plataforma/`) e que **alterar o texto é decisão editorial fora do código**. Este arquivo é uma **proposta de texto**, escrita para ser lida, corrigida ou descartada. Nada aqui entrou no guia: enquanto não houver aprovação, a ajuda de `/configuracoes` abre na abertura do guia — o caso previsto pela RN59 —, e a rota está no `MAPA_AJUDA` só para a **barra de volta** funcionar.
>
> Aprovado o texto (com as correções que vierem), ele entra em `conteudo/guia-plataforma/secoes.html` como seção nova, o `MAPA_AJUDA` passa a apontar `/configuracoes` para ela em vez de `SECAO_DE_ABERTURA`, e o documento autônomo é regerado (`pnpm guia:gerar`). É trabalho de uma tarde; o que falta é a decisão editorial, não o código.

---

## Onde encaixar

Proposta: **seção 4.9**, imediatamente depois de 4.6 ("Configurar a plataforma", que é o Parametrizador), ou como **4.6-B** logo abaixo dela. As duas tratam de configuração e a proximidade ajuda a fixar a divisão: **4.6 é regra de negócio; esta é segurança do portal.** Âncora sugerida: `j9`.

*Alternativa a considerar:* virar subseção da 5 ("Papéis e permissões"), já que o assunto é acesso. A recomendação é **não** — a 5 explica quem pode o quê, e esta explica como a porta se tranca; misturar as duas dilui ambas.

---

## Texto proposto

### Configurações do portal

O Parametrizador cuida das réguas do negócio. As Configurações cuidam de outra coisa: **como a porta se tranca**.

Restrito ao Administrador da Plataforma, o módulo guarda três ajustes — e todos eles valem para todo mundo, inclusive para quem os alterou.

**Política de senha.** Quantos caracteres uma senha precisa ter, quais tipos de caractere são exigidos (maiúscula, minúscula, número, símbolo) e quantas senhas anteriores não podem ser repetidas. A tela de troca de senha mostra a exigência vigente — se a política apertar, o aviso aperta junto, sem ninguém reescrever texto. A nova regra vale **na próxima troca de senha**; ninguém é obrigado a trocar a senha porque a política mudou.

A plataforma **nunca guarda a sua senha**, nem a atual nem as antigas: guarda uma marca matemática que serve para conferir e não serve para ler. É por isso que o Administrador emite credencial provisória, mas não conhece a senha de ninguém.

**Tempo de sessão.** Depois de quanto tempo **sem atividade** a sessão se encerra. A contagem é deslizante: cada ação sua reinicia o relógio, e o contador ao lado do sino mostra quanto falta — ele fica âmbar quando o fim se aproxima. Se o tempo acabar, a plataforma leva você de volta ao login explicando o motivo; nada do que foi salvo se perde, e o que estava pela metade em um formulário, sim.

Alterar esse tempo vale para **as sessões que já estão abertas**, não só para os próximos acessos.

**Bloqueio por tentativas de login.** Quantas senhas erradas seguidas bloqueiam o acesso a uma conta, e por quanto tempo. Enquanto bloqueada, a conta é recusada mesmo que a senha esteja certa — e errar de novo não aumenta o castigo. Passado o tempo, a contagem recomeça do zero.

Há duas saídas do bloqueio: **esperar** ou **pedir ao Administrador**. Em *Contas bloqueadas*, na própria tela de Configurações, o Administrador libera o acesso na hora. O desbloqueio fica registrado na trilha de auditoria, como toda alteração deste módulo.

> **O Administrador da Plataforma nunca é bloqueado.** É proposital: se a conta que desbloqueia as outras pudesse se trancar, um erro de digitação repetido deixaria a plataforma sem quem a destranca. Em troca, a senha dessa conta merece cuidado maior que a das demais.

---

## Notas para quem for revisar

1. **Tom.** Segui a voz das seções existentes: segunda pessoa, frases curtas, o "porquê" antes do "como", e o encerramento explicando uma decisão em vez de só enunciá-la.
2. **O que deliberadamente não está no texto:** os valores padrão (10 caracteres, 30 minutos, 5 tentativas/15 minutos). Eles são **configuráveis**, e um guia que os cita envelhece na primeira vez que alguém mexer. O guia diz o que a regra é; a tela diz quanto ela vale hoje.
3. **Ponto a confirmar:** a frase *"o que estava pela metade em um formulário, sim"* admite perda de rascunho ao expirar. É verdade e é honesto, mas convém confirmar se a Superintendência quer esse grau de franqueza no guia ou prefere omitir.
4. **Dependência:** se a pendência §6.2 da ficha (contrapartida para a isenção do Administrador) for resolvida com alguma medida — segundo fator, alerta em auditoria —, o bloco final precisa ser reescrito para mencioná-la.

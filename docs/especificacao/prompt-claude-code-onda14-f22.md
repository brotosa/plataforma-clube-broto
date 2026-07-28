# Prompt para o Claude Code — Onda 14: Acabamento da versão 1 · Fase F22

> **Mesmo repositório.** Pré-requisito: **F1–F21 mergeadas na main** (verifique e reporte se algo faltar). Fase de **acabamento: sem migration, sem regra de negócio, sem tela nova** — os únicos toques de comportamento são o atalho de acessibilidade e o CSS de impressão. Anexos na main: `docs/especificacao/ficha-onda14-acabamento.md` e este prompt.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — ficha da Onda 14 nas fontes da verdade e F22 no mapa de fases. **Nenhuma RN nova** — esta fase não cria regra; não invente numeração.

## 1. Guia — complementos com origem declarada (ficha §1, itens 1–4)

O guia é fonte única (cerca RN58) e as doze seções transcritas são cobradas **frase por frase** contra `docs/referencias/Guia_da_Plataforma_v1.html`. Os quatro complementos entram em **bloco próprio ao final da seção**, com origem visível ("Complemento — Onda 8" etc.), **sem tocar uma frase transcrita**. Antes de escrever texto, leia `infra/arquitetura/guia-fonte-unica.test.ts` e responda no plano: a verificação é por **contenção** (frases da referência presentes) ou **igualdade estrita**? Se contenção, os blocos entram sem mexer na cerca. Se estrita, estenda a cerca **cirurgicamente** para reconhecer blocos de complemento com origem — as doze continuam cobradas por inteiro, e a extensão segue o desenho da F19 (toda seção com origem declarada; complemento declarado não pode existir na referência). A voz dos textos é a do guia: segunda pessoa, sem jargão, no padrão da 4.7. Regere o documento autônomo (`pnpm guia:gerar`) — a cerca de sincronia acusa se esquecer.

Conteúdo mínimo de cada complemento: **4.1** — enviar/substituir a marca do aliado: formatos, 200 KB, onde aparece, substituição não apaga a anterior da trilha; **4.2** — imagem do card da solução: 400 KB, onde aparece; **4.5** — mover card no funil por arrasto **e por teclado**, as duas vias com igual dignidade; **Campanhas** — imagem da peça: 1 MB, PNG/JPG/WEBP, **por que SVG não entra** (e-mail não renderiza), e que o kit sai com as peças dentro.

## 2. Atalho "pular para o conteúdo" (ficha §1, item 5)

O seletor `.skip` existe pronto na última entrega do Design — **extraia de lá, não recrie**: link como primeiro elemento focável do shell, alvo no início do conteúdo principal, visível apenas com foco. Acrescente ao `dseed-admin.css` como bloco `Extensão (Onda 14)` ao final. Teste e2e: Tab a partir do topo revela o atalho; Enter leva o foco ao conteúdo; axe-core segue AAA. **Nenhum outro item de navegação muda.**

## 3. R1 na impressão (item 6)

A barra de volta do R1 sai no papel. O `dseed-admin.css` já oculta `.gd-volta` em `@media print` — identifique a classe que a tela do R1 realmente usa e aplique o mesmo tratamento, no mesmo bloco de print. Confira visualmente pelo preview de impressão e cubra com asserção de estilo se houver padrão na suíte; se não houver, declare no PR que a conferência foi manual.

## 4. README (item 7)

Os exemplos das linhas ~258, 266 e 352 fixam `:1.0.0`. Troque por orientação que aponte a versão corrente do `package.json` (por exemplo, exibindo a etiqueta como `<versão do package.json>` com uma linha explicando onde lê-la) — o exemplo não pode envelhecer a cada fase. Não altere o conteúdo histórico das seções de fases.

## 5. Telemetria — retratos sucessivos reais (item 8)

Suba `dados/Lista_de_Sellers_2.xlsx` e `dados/Lista_de_Ofertas_4.xlsx` (fornecidas junto desta fase; se não estiverem na main, pare e reporte). Acrescente à suíte de integração da telemetria **um teste de retratos sucessivos**: importar a v3, depois a v4, e provar que o contador por oferta **atualiza sem duplicar** e que a procedência aponta para a importação nova — o caso real que a fixture sintética não cobre. Nenhuma mudança de código de produção é esperada aqui; se o teste revelar defeito, ele vira o achado da fase e é corrigido com registro no PR.

## 6. Qualidade e encerramento

**Suíte F1–F21 integralmente verde, sem alterar nenhum teste existente** — exceto a cerca da RN58 se a extensão do §1 for necessária, caso em que ela fica **mais forte**, nunca mais frouxa, e é justificada no PR. Versão **1.4.0**. E2e do `.skip` e do guia com axe AAA e 380px. Rebase da main antes do PR (título: "F22 — Acabamento da versão 1"), commits pequenos, PR aberto **sem merge**.

## Mensagem para abrir a sessão (colar como está)

Verifique que **F1–F21 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 14 em `docs/especificacao/`. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda14-f22.md` e a ficha, nesta ordem. Esta é fase de **acabamento: sem migration, sem regra nova, sem tela nova** — guia, atalho de acessibilidade, impressão do R1, README e um teste de telemetria com retratos reais. O item de risco é a **cerca da RN58**: os complementos do guia entram sem tocar uma frase transcrita, e qualquer extensão da cerca segue o desenho da F19 e sai mais forte, nunca mais frouxa. Apresente o plano da F22 em até 10 linhas — **incluindo a resposta: a cerca verifica por contenção ou igualdade estrita?** — e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada, commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.

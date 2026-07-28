# Ficha de Módulo — Onda 14: Acabamento da versão 1
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 28/07/2026

Fase **F22**, única da onda. **Sem migration, sem regra de negócio nova** — é a rodada que fecha as pontas declaradas ao longo das Ondas 8–13 antes da entrada em produção. Fecha em **1.4.0**, que é a versão que sobe.

---

## 1. O que esta rodada fecha, item a item

**Guia — as funcionalidades que nasceram depois dele.** O guia foi transcrito da referência da Onda 9 e três ondas de interface nunca chegaram nele. Entram como **complementos com origem declarada**, nunca como reescrita (ver §2):

1. **Seção 4.1 (Aliados)** — o envio da marca pelo próprio cadastro (Onda 8, RN54): formatos aceitos, teto de 200 KB, onde a marca aparece, substituição auditada.
2. **Seção 4.2 (Ofertas/Soluções)** — a imagem do card da solução (Onda 10, RN60): 400 KB, onde aparece, mesma disciplina.
3. **Seção 4.5 (Mercado & Scout)** — mover card no funil por arrasto **e por teclado** (RN57): as duas vias, porque o guia ensina a acessível junto com a rápida.
4. **Seção de Campanhas** — a imagem da peça (Onda 13, RN71): teto de 1 MB, PNG/JPG/WEBP, **sem SVG e o porquê** (cliente de e-mail não renderiza), e a informação de que o kit sai com as peças dentro.

**Acessibilidade** — 5. **Atalho "pular para o conteúdo" (`.skip`)**: criado pelo Design, nunca incorporado ao repositório. Com onze itens de menu, quem navega por teclado atravessa a sidebar inteira a cada tela. Premissa de trabalho: **adotar** (recomendação registrada desde o red team do v11.2; reversível nesta validação). O seletor existe pronto na entrega do Design — extrair, não recriar.

**Correções declaradas em PR e nunca fechadas** — 6. **R1 na impressão**: a barra de volta sai no papel (pendência declarada na F19). O CSS já oculta `.gd-volta` em `@media print` — a barra do R1 usa outra classe; conferir e aplicar o mesmo tratamento. 7. **README**: os exemplos de `docker pull` fixam `:1.0.0` (linhas ~258, 266 e 352) — trocar por instrução que aponte a versão corrente do `package.json`, para o exemplo não envelhecer de novo a cada fase.

**Telemetria — a nota do red team da F20** — 8. Subir em `dados/` as fotografias novas do catálogo (`Lista_de_Sellers_2.xlsx`, `Lista_de_Ofertas_4.xlsx`) e acrescentar **um teste de retratos sucessivos**: importar a v3 e depois a v4 reais e provar que o contador por oferta atualiza sem duplicar — o caso que hoje só a fixture sintética cobre.

**Editorial** — 9. A seção 4.7 (Patrocinadores) permanece como está, **salvo ajustes de texto enviados pela Superintendência** junto com esta ficha; se vierem, entram no mesmo commit de guia.

## 2. O item de risco: a cerca da RN58

As doze seções transcritas são cobradas **frase por frase contra a referência da Onda 9** — "divergência de uma frase é regressão". Os complementos dos itens 1–4 tocam seções transcritas, e a regra é: **as frases da referência permanecem todas, intactas e na ordem; o complemento entra em bloco próprio, com origem declarada** ("Complemento — Onda 8", no padrão que a F19 criou para seção nascida depois). Se a cerca hoje exigir igualdade estrita e não contenção, ela é estendida **cirurgicamente** para reconhecer blocos de complemento com origem — no mesmo rito da F19: as doze continuam cobradas, e a extensão da cerca é o primeiro alvo do red team desta fase. O documento autônomo é regerado (`pnpm guia:gerar`) — a cerca de sincronia cobra isso sozinha.

## 3. Fora de escopo

Qualquer migration; qualquer regra de negócio; qualquer tela além do `.skip` e do print do R1; a ajuda contextual (mapa RN59 já cobre tudo); valores do contrato Yamer (dado, entra pela tela quando a minuta for lida); adaptador de objeto (condição da RN71 não satisfeita).

## 4. Pendências que esta rodada NÃO fecha (registro honesto)

Rotatividade de vaga (decisão de negócio, minuta Yamer); kit sem aprovação registrada (premissa do carimbo segue valendo); política de uso — quem recebe qual papel (documento da Superintendência); despacho da requisição à Minutrade.

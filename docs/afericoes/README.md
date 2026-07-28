# Aferições visuais

Capturas de tela que servem de prova para revisão de PR — o que uma
asserção descreve em número, mas ninguém consegue conferir de olho sem
ver. Não são fixtures nem entram em nenhum caminho de execução.

Cada arquivo nomeia a tela e o estado. Quando a mesma tela é capturada
antes e depois de uma correção, os dois arquivos ficam lado a lado.

## Onda 14 (F22)

| Arquivo | O que mostra |
|---|---|
| `t32-formulario-antes.png` | T32, formulário do patrocinador com o `row-gap` em zero — o rótulo de cada linha encostando no campo de cima. É o estado que a F19, a F20 e a F21 tinham. |
| `t32-formulario-depois.png` | O mesmo formulário com `.form-grid`: 14px entre linhas, 16px entre colunas. |
| `r1-tela.png` | R1 na tela, com a barra de volta acima do documento. |
| `r1-impressao.png` | O mesmo R1 sob `@media print`: a barra sai, o documento fica. |

O "antes" da T32 foi reproduzido aplicando `.form-grid{row-gap:0}` sobre
a tela corrente, que é exatamente o que o estilo inline fazia — e não
uma captura de commit antigo, para que as duas imagens difiram só no que
está em discussão.

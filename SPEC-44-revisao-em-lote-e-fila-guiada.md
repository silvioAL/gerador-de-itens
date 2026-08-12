# SPEC-44 — Revisão pós-IA: confirmar em lote, fila guiada e uma régua só

> Origem (§192, pré-aprovado): "a experiência de clicar em confirmar/sugerir
> a item a item não está boa, e depois vai para a tela onde aparece apenas
> uma lista". Medido: ~9 placeholders por item × N itens = ~30 cliques para
> a decisão mais comum ("está bom"); nenhum agregado diz quantas sugestões
> aguardam nem onde; revisão e tela de itens usam réguas diferentes.

## 1. Princípio

Aceitar deve ser barato e em lote; intervir é que merece o clique. Desde a
SPEC-41, confirmar é ASSINAR (a sugestão já entra no documento com a marca)
— não desbloquear conteúdo. Auto-confirmar tudo foi avaliado e descartado:
apagaria a distinção sugerido/validado que documento e prontidão usam.

## 2. Fase 1 — lote e régua única

1. **Barra de pendências** no topo da revisão: "N sugestões da esteira
   aguardando · M campos vazios", progresso confirmados/totais, ações
   "Confirmar todas (N)" e "Revisar uma a uma" (Fase 2).
2. **Confirmar em lote em três alturas**: por seção/papel ("✓ Confirmar
   seção"), por item (chip no card da lista) e global (a barra). Confirmar
   em lote grava `origem: "sugerido", confirmado: true` — a procedência
   continua honesta (a IA escreveu, o humano assinou). Editar um campo
   continua confirmando só ele como `manual`.
3. **Régua única**: o card da revisão fala o MESMO idioma da tela `#/itens`
   ("N sugestões a confirmar · M a especificar · pronto"), e na tela de
   itens o chip de completude de item não-pronto vira link de volta pra
   revisão daquele item (deep-link pela chave).

## 3. Fase 2 — fila guiada

"Revisar uma a uma" abre um modo foco (overlay): UMA sugestão por vez
(item + rótulo + texto editável), ações Confirmar (Enter) · Pular ·
Descartar, avanço automático atravessando itens, contador X de Y. A fila é
um SNAPSHOT das pendências no momento de abrir (a lista viva mudaria sob o
usuário). Descartar remove a resposta (o campo volta a "✍️ especificar") —
`responderItem` passa a aceitar `undefined` como remoção. Editar antes de
confirmar grava como `manual`.

## 4. Feito quando

1. Zero sugestões pendentes alcançável com 1 clique (global) ou por
   seção/item; a barra some quando não há pendência.
2. A fila percorre todas as pendências com teclado, e descartar limpa o
   campo de verdade.
3. Card da revisão e card de itens dizem a mesma frase de completude; o
   chip da tela de itens navega de volta pro item na revisão.
4. Mordidas na contagem e no confirmar-em-lote; E2E do ciclo com sugestão
   real (mock de /ia/sugerir); smoke no bundle.

# SPEC-42 — Time não é stack: a experiência para de misturar os dois

> Origem (§189): "time não é a mesma coisa que stack, e aqui está meio
> misturado". Dois prints: o seletor do menu rotulado "Time (stack
> conhecida)", e a tela Perfis de stack mostrando cards POR TIME — com
> `time-pagamentos` e `time-silvio` idênticos e duplicados, porque ambos
> apontam o mesmo perfil.

## 1. Diagnóstico

O MODELO já está certo desde a SPEC-38 F2: stack é um perfil nomeado num
catálogo da organização, e o time só APONTA um perfil. A UI é que ficou no
paradigma anterior (quando `perfis_time` era atributo do time):

- `MenuLateral`: rótulo "Time (stack conhecida)" ensina que time = stack.
- `PerfisTimeTab` (até o nome do arquivo): cards por TIME projetando o
  perfil apontado → times que compartilham perfil viram cards duplicados; o
  "editar" num card de time grava NO PERFIL COMPARTILHADO e muda a stack de
  outros times em silêncio; o formulário de valor pede um "Time" para editar
  algo que pertence ao perfil.

## 2. A revisão (só frontend + client — o server já expõe tudo)

1. **Tela catálogo-primeiro** (`config/PerfisStackTab.tsx`, substitui
   `demo/PerfisTimeTab.tsx`): cards por PERFIL do catálogo — nome, valores
   por componente, e o badge "usado por: time-a, time-b" (ponteiros
   invertidos) que torna o compartilhamento visível. Editar/adicionar valor
   age no PERFIL (select de perfil no formulário, não campo "Time"), via
   `PUT /perfis-stack/:id/valores` (rota existente, exposta no client como
   `apiPerfisStack.definirValores`). Quando o perfil é usado por mais de um
   time, o formulário avisa: "vale para os N times que apontam este perfil".
2. **Vínculo do time separado**: uma seção pequena "Stack do time ativo" com
   só o seletor de apontar/trocar (comportamento atual, intocado).
3. **Menu**: rótulo vira "Time", com a stack como linha informativa embaixo
   do seletor ("stack: Java + Spring Boot" / "sem perfil apontado") — o App
   carrega o catálogo e deriva o nome pelo ponteiro do time ativo.
4. Rótulo da tela sem o "(N do time)" — a contagem por time era parte da
   confusão. `ConfigScreen` deixa de receber `perfisTime`/`onEditarValor...`.

## 3. Feito quando

1. Nenhum card por time na tela de stack; perfis compartilhados aparecem UMA
   vez, com "usado por" dizendo quem aponta.
2. Editar valor deixa claro que muda o perfil (e para quantos times vale).
3. O menu diz "Time" e informa a stack sem equipará-la ao time.
4. Testes: cards por perfil, badge usado-por, edição via `definirValores`
   (com mordida), menu com a linha de stack; E2E ajustados; smoke no bundle.

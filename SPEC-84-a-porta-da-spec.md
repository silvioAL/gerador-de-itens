# SPEC-84 — A porta da spec

## 0. A medição

O pedido desta rodada é *"que todos os itens fiquem verdes"* — os estágios do ciclo
que a landing marca como ausentes. São dois, e **as duas marcas estão erradas por
motivos diferentes**.

### 0.1 `mcp` — a marca está desatualizada, o estágio existe

`packages/web/src/demo/ciclo.ts:193` diz `estado: "ausente"`, com
`oQueFalta: "Não avaliado ainda."`

Não é mais verdade desde a SPEC-81, entregue em quatro rodadas:

| § | O que entrou |
|---|---|
| §321 | a tela do gateway do time — destinos por operação, em `Configurações → Exportação` |
| §324 | ler a arquitetura de negócio da casa |
| §325 | as telas de importação, e o painel de proposta campo a campo |
| §326 | o ADR entrando pela conversa, como a voz |

O estágio tem endereço (`{ tela: "config", area: "exportacao" }`), tem tela, tem
E2E. **A correção aqui é de uma linha de dado**, e ela é exatamente o defeito que
o comentário de `ciclo.ts:23` já previa: *"uma página em prosa continuaria dizendo
'não existe' sobre algo entregue."* O dado envelheceu do mesmo jeito — o que a
trava não pega é a marca ficar **conservadora demais**.

### 0.2 `specs-para-ia` — a marca está certa, e o motivo escrito está errado

`ciclo.ts:185` diz `oQueFalta: "Avaliado na SPEC-75, ainda não construído."`

A conclusão está certa. O motivo, não: **foi construído** — a SPEC-80 entregou as
quatro fatias (§312 a §315). O que não foi construído é a **porta**.

Medição, e é o §0 desta SPEC:

```
$ grep -rn "gerarSpec(\|coberturaDaSpec(" packages/ --include=*.ts --include=*.tsx \
    | grep -v "\.test\." | grep -v "index.ts"
packages/engine/src/especificacao/gerarSpec.ts:166:export function coberturaDaSpec(...)
packages/engine/src/especificacao/gerarSpec.ts:219:export function gerarSpec(...)
```

**Só as próprias definições.** Existem, estão exportadas em
`packages/engine/src/index.ts:196-209`, têm testes — e **nenhum consumidor**. O
`artefatosEscritos.spec` atravessa o Zod da borda, a coluna e a reidratação
(`usePersistencia.ts:97` copia o objeto inteiro), então o lugar de guardar existe.
Falta o lugar de **ver**.

É motor ligado sem nada acoplado ao eixo. E o mais desconfortável: as quatro
fatias da SPEC-80 (§5, `SPEC-80-specs-para-sdd.md:154-175`) descrevem modelo,
template, vínculo e trava — **nenhuma delas é a tela**. A SPEC nunca pediu a
porta, então ninguém a construiu, e o estágio ficou vermelho com razão.

## 1. O que esta SPEC faz

Uma coisa só: **a spec ganha porta**. Nada de motor novo — `gerarSpec` já
funciona, é determinístico e tem teste. O que falta é o caminho de ida e volta
entre ele e uma pessoa.

O molde não precisa ser inventado. O documento de desenho já faz exatamente isto,
e faz **no cliente**:

- `App.tsx:1001` — `gerarEspecificacaoEntrega` dentro de um `useMemo`;
- `App.tsx:1061` — `baixarArquivoTexto(markdown, "documento-de-desenho.md", …)`;
- `DocumentoScreen.tsx` — as seções escritas, cada uma com a sua `dica` quando
  vazia;
- `rota.ts:35` — `{ tela: "documento" }`, com hash próprio.

Nenhum passo precisa de rota nova no servidor. A spec é derivada do que a demanda
já tem, e o que a pessoa escreve nela já é persistido pelo caminho de sempre.

## 2. O que esta SPEC RECUSA

- **Gerar a spec com IA.** A SPEC-80 fatia D existe justamente para impedir isso:
  as três seções de julgamento — origem, recusas, fatias — não podem ser
  preenchidas por resposta de modelo. Uma tela que oferecesse "✦ escrever para
  mim" ali desmontaria a trava por conveniência. O botão não existe.
- **Editor de template na tela da demanda.** O template da spec é configuração do
  time, e configuração do time mora em `Configurações`. Duas portas para o mesmo
  arquivo é o §263.
- **Publicar a spec no tracker.** É a SPEC-81, e o destino de documento já existe.
  Misturar as duas faria a spec herdar o ciclo de aprovação do documento, que é
  outra coisa.
- **Uma spec por item.** A pergunta 1 da SPEC-80 §6 continua sem medição. A tela
  entrega **uma spec por demanda**, que é o que `coberturaDaSpec` já modela (N
  itens cobertos por uma spec). N-para-N degrada para 1-para-N sem migração; o
  contrário, não.

## 3. A régua

A mesma da SPEC-76/83, e ela é o que impede esta rodada de virar maquiagem:

> **A página não pode prometer o que o produto não faz.**

Um estágio só sai de `ausente` quando tem rota que resolve — e o
`ciclo.test.ts:24` já cobra isso, fechando o laço `hashDaRota` → `rotaDoHash`.
Marcar `specs-para-ia` como completo **sem** a tela faria o teste passar (porque a
rota existiria como objeto) e a promessa mentir. Por isso a fatia A vem antes da
fatia B, e não o contrário.

## 4. Fatias

- **A — a tela.** `SpecScreen`, rota `#/spec`, entrada no menu ao lado de
  "Documento de desenho". As três seções de julgamento editáveis, no molde de
  `SecaoEscrita`; a cobertura de itens com as três listas que `coberturaDaSpec` já
  devolve (cobertas, descobertas, **órfãs** — a que ninguém pensa em olhar); a
  conta de lacunas pelo `MARCADOR_ESPECIFICAR`, como o documento faz desde o §311;
  e o download em markdown.
- **B — o ciclo deixa de mentir.** Os dois estágios saem de `ausente`. A trava que
  hoje afirma *"o estágio ausente aparece marcado"* fica vermelha de propósito e é
  **reescrita, não contornada**: o que ela precisa guardar daqui em diante é que
  **estado e realidade não divergem** — todo estágio não-ausente tem rota que
  resolve, e nenhuma marca de ausência sobrevive sem `oQueFalta`.
- **C — a prova que envelhece bem.** O defeito desta rodada foi dado que envelheceu
  em silêncio nas duas direções. `mcp` ficou dizendo "não existe" sobre algo com
  quatro § entregues, e ninguém percebeu por dois meses. A trava nova: **todo
  estágio com rota para uma área de config precisa que a área exista em
  `AREAS_CONFIG_CONHECIDAS`** — e o E2E confere que a landing e o produto contam a
  mesma história.

## 5. Perguntas em aberto

1. **A spec entra no ciclo de aprovação do documento?** Hoje o documento tem
   `documentoStatus` e carimbo. A spec não tem, e não está claro que precise:
   quem aprova uma spec, no fluxo real, é quem vai construir. Sem medição — fica
   fora desta rodada, dito em voz alta.
2. **O `medicao` da spec sai de onde?** `gerarSpec` aceita `medicao?: string[]`, e
   o documento já calcula apontamentos. Reusar é o barato; se divergirem, viram
   duas verdades. Esta rodada passa o que o documento já apurou, e registra a
   escolha.

# SPEC-80 — Gerar specs para construir com IA

> **Origem:** o usuário — *"implementar tudo o que falta"*, com **ambição
> completa**. Este estágio já tinha avaliação própria: a **SPEC-75 §2**, que o
> declarou *"o valor maior, e independente do resto"* e **"a primeira coisa a
> fazer"**.
>
> Esta SPEC executa aquele veredito. Ela não o reabre.

---

## 0. A medição

O estágio `specs-para-ia` está marcado **`ausente`** em `ciclo.ts`, com
`oQueFalta: "Avaliado na SPEC-75, ainda não construído."`. É um dos dois pontos
não-verdes do círculo.

A SPEC-75 §2.1 já mediu o que **não** precisa ser reconstruído, e continua
verdadeiro: o produto converte desenho + contexto + decisões em markdown
estruturado, com template configurável, seções escritas por gente que sobrevivem
à regeneração, proveniência por campo, lacunas contáveis (SPEC-73) e PDCA sobre
o próprio template.

**O que esta rodada mediu e a SPEC-75 não tinha** — e muda a fatia B:

```sql
-- packages/server/migrations/0004_especificacao_templates.sql:8
CREATE UNIQUE INDEX "especificacao_templates_chave_unica"
  ON "especificacao_templates" USING btree ("time_id");
```

**Um template por time. Índice único em `time_id` sozinho.** A SPEC-75 §2.2 diz
que falta *"produzir N artefatos de tipos diferentes, cada um com template
próprio"* — e o que impede isso não é o motor, é **este índice**. É migração de
banco, não refactor: o índice passa a ser `(time_id, tipo_de_artefato)`.

E do outro lado da cadeia, `DocumentoEscrito`
(`packages/engine/src/model/types.ts:303`) tem hoje **três chaves fixas** —
`visaoGeral`, `tradeOffs`, `riscos` — com um comentário que diz por que são
fixas: *"é o que impede isto de virar um editor de documento"*. Esse comentário
é uma régua, e esta SPEC precisa respeitá-la, não contorná-la.

## 1. O que uma spec tem que o documento não tem

A SPEC-75 §2.2 nomeou duas, e as duas continuam certas depois de ler as SPECs
71 a 78 que este repositório de fato executou:

### 1.1 As recusas

Toda SPEC útil deste projeto tem uma seção **"O que NÃO entra"** — e ela é o que
impede a SPEC de virar lista de desejos. A SPEC-72 recusou salvamento
incremental *porque a medição não achou número que doesse*; a SPEC-75 recusou
agente com terminal em laço aberto.

**Recusa sem motivo é opinião; recusa com motivo é projeto.** A seção precisa
carregar o porquê, e o porquê não é derivável do desenho — é julgamento.

### 1.2 As fatias com prova

Não "fase 1, fase 2". Cada fatia declara **o que fica verdade** e **como se
prova** — e este repositório tem a régua mais dura possível para isso, o §248:
*desligar a correção e ver o teste falhar antes de dar por feito.*

Uma fatia sem prova declarada é uma promessa.

### 1.3 E uma terceira, que a SPEC-75 não listou

**A origem.** Toda SPEC deste repositório começa citando quem pediu e com que
palavras. Não é formalidade: é o que permite, meses depois, saber se o que foi
construído responde ao que foi pedido. As SPEC-71 a 78 todas têm; foi por isso
que cada rodada conseguiu remedir o §0 antes de repeti-lo.

## 2. O risco, e por que ele é estrutural

Da SPEC-75 §2.3, e vale inteiro:

> Uma spec gerada por modelo, com aparência de spec deste repositório, e conteúdo
> plausível-mas-vazio, é **pior que nenhuma**: ela custa a leitura de alguém e
> carrega autoridade que não merece.

A mitigação também é dela, e é a coisa mais importante desta SPEC:

> **As seções que carregam julgamento — a origem, as recusas, a régua — não
> podem ser escritas pelo modelo.**

O modelo preenche o que é **derivável**: o que existe hoje, o que foi medido,
quais elementos participam, quais itens dependem de quais. O resto é
`SecaoEscrita` com lacuna contável — a máquina da SPEC-73, já construída.

> Isto não é cautela. É a mesma tese do produto aplicada a si mesmo: **o motor
> decide a estrutura, a IA escreve o texto, e nada conta antes de alguém
> confirmar.** Uma geração de specs que violasse isso seria o produto se
> contradizendo no artefato mais visível que ele produz.

## 3. O vínculo com o item

*"que seriam anexadas a esses itens"*, no pedido original. A SPEC-75 §2.2 já
achou a forma: **é o mesmo `Decisao.ensaioIds` da SPEC-69, aplicado a outro
par.** Um item de trabalho aponta para a spec que o especifica; a spec aponta
para os itens que ela cobre.

Isso também dá a régua de completude: **uma spec que não cobre nenhum item é uma
spec órfã**, e o produto sabe dizer isso — do mesmo jeito que já diz "esta
necessidade não tem componente que responda por ela".

## 4. O que esta SPEC RECUSA

**Spec gerada inteira por modelo.** Ver §2. As seções de julgamento são de
gente, ou o artefato mente com autoridade.

**Um editor de documento.** O comentário em `DocumentoEscrito` já recusou isso
uma vez, e a recusa continua válida: chaves fixas por tipo de artefato, não um
campo livre onde cabe qualquer coisa.

**Formato proprietário.** A saída é markdown, como tudo o mais que este produto
escreve. Um agente de código consome markdown; um formato nosso obrigaria
todo mundo a aprendê-lo.

**Esperar pelo mapeamento de contexto.** A SPEC-75 §5 foi explícita: *"se gerar
specs esperar pelo mapeamento, o item de maior valor fica refém do de maior
risco."* Continua valendo.

**MCP como fatia.** Também da SPEC-75 §5 — é assunto próprio, e agora tem SPEC
própria: a **SPEC-81**.

## 5. Fatias

- **A — o artefato deixa de ser um.** Migração: o índice único passa a ser
  `(time_id, tipo)`. `TipoDeArtefato` nasce com dois valores — `documento` (o de
  hoje, sem mudança de comportamento) e `spec`. Prova, e é a mais importante da
  rodada: **o documento gerado hoje sai idêntico, caractere a caractere**, depois
  da migração — gerar antes, guardar a saída inteira, migrar, gerar de novo e
  comparar as duas strings. Nada de `toContain` por seção: comparação por trecho
  deixa passar exatamente a mudança que esta fatia arrisca introduzir.
- **B — o template da spec.** As seções, com `problemasDoTemplate` já separando
  erros × avisos. As de julgamento nascem como `SecaoEscrita` com o marcador da
  SPEC-73, e portanto **contáveis**: uma spec com 7 lacunas diz que tem 7.
- **C — o vínculo com os itens.** No molde de `Decisao.ensaioIds`. Prova: spec
  órfã aparece como lacuna, e item coberto mostra qual spec o cobre.
- **D — o que a IA pode e não pode escrever.** A trava: teste que falha se uma
  seção de julgamento for preenchível por resposta de modelo. É o `MARCA_SUGERIDO`
  encontrando a régua do §2 — e é a fatia que impede esta SPEC de virar aquilo
  que ela mesma recusa.

## 6. Perguntas em aberto

1. **Uma spec por demanda, ou uma por item?** O pedido diz *"anexadas a esses
   itens"*, no plural, e a §3 assume N-para-N. Se na prática for sempre uma por
   demanda, o vínculo fica caro à toa. **Não temos medição** — e a fatia C é o
   lugar barato de descobrir, porque N-para-N degrada para 1-para-N sem
   migração, e o contrário não.
2. **O template da spec sai de onde?** A honesta: das SPEC-71 a 78 deste
   repositório, que são o corpus real de specs que funcionaram. Vale extrair a
   estrutura comum delas antes de inventar uma.
3. **A spec entra no PDCA?** O template do documento já entra
   (`routes/pdca.ts`). Parece que sim, e de graça — mas confirmar que a cadência
   configurável não assume um template só por time, que é o mesmo índice da
   fatia A visto de outro ângulo.

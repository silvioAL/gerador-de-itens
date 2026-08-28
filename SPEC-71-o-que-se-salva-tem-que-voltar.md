# SPEC-71 — O que se salva tem que voltar

> **Origem:** o usuário, antes de abrir uma conversa nova:
>
> > *"precisamos avaliar se existem testes a fim de garantir que todas
> > informações salvas sejam recuperadas."*

---

## 0. A medição, antes de qualquer opinião

Sondei o servidor real (`localhost:4000`): criei uma quebra com os campos que as
últimas quatro SPECs introduziram, li de volta, e comparei campo a campo.

```
PERDEU volumetria
     mandei: {"quantidade":2000000,"por":"dia"}
     voltou: undefined
PERDEU cenariosDeLentidao
     mandei: [{ id, nome, estado:"aceito", debito:{motivo,autor,em}, fatorDeVolume:10, ajustes:[…] }]
     voltou: undefined
PERDEU decisoes[0].ensaioIds
     mandei: ["cen-x"]
     voltou: undefined
PERDEU necessidades[0].limiteMs
     mandei: 5000
     voltou: undefined
```

**Quatro de quatro.** Nada do que a SPEC-69 e a SPEC-70 construíram sobrevive a
um salvamento: o débito assumido com autor e motivo, o prazo que o negócio
exige, o volume da demanda e o elo que leva a evidência ao item. Tudo existe em
memória, aparece na tela, entra no documento — e some no F5.

## 1. Três causas, empilhadas

### 1.1 O Zod da borda conhece uma forma ANTIGA

`packages/server/src/routes/quebras.ts` valida `cenariosDeLentidao` com o
formato da SPEC-66:

```ts
cenariosDeLentidao: z.array(z.object({
  id, nome, origem, porque, aceito: z.boolean().optional(),
  ajustes: z.array(z.object({ tipo, id, fator, ms })),
})).optional()
```

`z.object` **descarta chave desconhecida em silêncio**. Então `estado`,
`debito`, `fatorDeVolume`, `tentativas`, `disjuntor` e `taxaRps` são apagados na
borda — sem erro, sem aviso, sem 400.

> É a mesma história que a própria migração 0011 conta, no comentário da tabela:
> *"o Zod da borda descartava em silêncio o que a esteira escreveu e o contexto
> do épico. Quem rodava os agentes no modo hospedado salvava e perdia o
> trabalho."* Corrigiu-se o caso; **não se corrigiu a classe.**

### 1.2 A tabela não tem onde guardar

`volumetria` e `cenariosDeLentidao` não são colunas de `quebras`. Mesmo que o
Zod aceitasse, o adaptador não teria onde escrever.

### 1.3 Os campos NOVOS de coleções antigas também caem

`necessidades` e `decisoes` **são** colunas `jsonb`. Mas o Zod as valida
campo a campo, e `limiteMs` (SPEC-69 fatia A) e `ensaioIds` (SPEC-69 fatia D)
não estão na lista — some o campo, sobrevive o resto. É o pior formato de perda:
**parcial e silenciosa**, porque a linha volta e parece certa.

## 2. Por que nenhum teste pegou

Existem testes de persistência (`quebrasEmPostgres.test.ts`). Eles provam que o
adaptador grava e lê **os campos que o teste cita**. Nenhum deles pergunta *"e o
que mais existe no tipo?"* — e é essa pergunta que faltou.

E o E2E que parecia cobrir isso **mente**:

```ts
await page.getByRole("button", { name: "Salvar" }).first().click();
await page.goto("/#/ensaios");                       // ← só o fragmento muda
await expect(page.getByTestId("linha-cen-…")).toContainText("12 s");
```

`goto` para uma URL que difere só no `#` é **same-document**: não recarrega
nada, e o estado em memória sobrevive. O teste diz *"o ensaio é do time, não da
sessão"* e prova o contrário do que afirma.

> O repositório **já sabe disso** — `regras-por-componente.spec.ts` tem o
> comentário: *"goto só de fragment é same-document — o reload é o que recarrega
> as regras no App"*. A armadilha estava documentada num spec e aberta no outro.

## 3. A régua: o teste tem que ser sobre o TIPO, não sobre uma lista

Um teste que cita campos é um teste que envelhece: ele passa a cada SPEC nova e
deixa de cobrir a cada SPEC nova. O que precisa existir é uma prova que
**quebra sozinha** quando alguém acrescenta um campo ao `Quebra` e esquece a
borda.

Duas formas, e as duas entram:

**3.1 Round-trip por igualdade estrutural.** Montar uma quebra com *todo* campo
do tipo preenchido, gravar, ler, e comparar o objeto inteiro — não campo a
campo. O que sobra na diferença é o que se perde.

**3.2 A lista de campos derivada do tipo.** Um teste que enumera as chaves de
`Quebra` e falha se alguma não estiver no Zod da borda. Escrever o inventário à
mão devolveria o problema: ele também envelheceria.

> **O que não serve:** "lembrar de atualizar o Zod". Foi exatamente o que não
> aconteceu quatro vezes seguidas, por três SPECs diferentes, com o comentário
> da migração 0011 avisando na mesma tabela.

## 4. O que a correção precisa cobrir

| campo | onde falta | efeito hoje |
|---|---|---|
| `volumetria` | Zod + coluna | o volume da demanda some; a saturação volta a calar |
| `cenariosDeLentidao` | coluna (Zod aceita, forma velha) | **todo ensaio some** |
| `cenariosDeLentidao[].estado`/`debito` | Zod | o débito assumido vira "por avaliar" de novo |
| `cenariosDeLentidao[].fatorDeVolume` | Zod | o pico do ensaio some |
| `ajustes[].tentativas`/`disjuntor`/`taxaRps` | Zod | as condições da SPEC-68 somem |
| `necessidades[].limiteMs` | Zod | o prazo do negócio some |
| `decisoes[].ensaioIds` | Zod | a evidência para de viajar ao item |
| `excecoes[].contradicao` | Zod | a exceção do §307 não silencia mais nada |

`anexosContexto` merece conferência à parte: a coluna declara
`$type<string[]>()` e o modelo diz `{ nome, conteudo }[]`. **Não medi** este —
fica como pergunta, não como afirmação.

## 5. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | O teste de round-trip por igualdade estrutural, com toda a `Quebra` preenchida | ele FALHA hoje, e a lista do que falha é a tabela do §4 |
| **B** | O Zod e as colunas alcançam o tipo | o teste da fatia A passa |
| **C** | O teste que falha quando um campo novo do tipo não chega à borda | acrescentar um campo ao `Quebra` sem tocar no Zod deixa a suíte vermelha |
| **D** | O E2E de persistência com `reload()` de verdade, e não `goto` de fragmento | assumir um ensaio, dar F5, e o débito continuar assumido |

**A antes de B, sempre:** o teste que falha primeiro é o que prova que a
correção corrigiu. Fazer o contrário é escrever um teste que nasce verde.

## 6. Perguntas em aberto

1. **`cenariosDeLentidao` merece coluna própria ou entra num `jsonb`?** A tabela
   já tem seis `jsonb` de coleção, com o mesmo raciocínio anotado em cada um
   ("sem consulta transversal que justifique tabela"). Recomendação: **`jsonb`**,
   pela consistência — e a SPEC-69 §5 não pede consulta transversal.
2. **O que fazer com quebra já gravada?** Nada: campo ausente já é tratado como
   ausente em todo o motor (`estadoDoEnsaio` migra `aceito: true`, `analisarLacunas`
   tolera necessidade sem `limiteMs`). Migração de dados aqui seria inventar
   valor que ninguém declarou.
3. **A borda deveria RECUSAR chave desconhecida em vez de descartar?**
   Recomendação: **não em geral** — um cliente mais novo que o servidor passaria
   a levar 400 no lugar de degradar. Mas o teste da fatia C dá o mesmo aviso, em
   tempo de build, sem esse custo.

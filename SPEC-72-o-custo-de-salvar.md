# SPEC-72 — O custo de salvar

> **Origem:** o usuário:
>
> > *"o sistema salva muitas informações, eventualmente grandes, como o contexto
> > da demanda, portanto avaliar se as estratégias de salvamento estão corretas
> > ou faltam otimizações."*

---

## 0. A medição, antes de otimizar qualquer coisa

Banco de trabalho real:

```
pg_total_relation_size('quebras') .... 848 kB
quebras ............................. 24
maior demand_info ................... 1 692 caracteres
maior diagrama (pg_column_size) ..... 3 629 bytes
```

E o autosave (`usePersistencia.ts`):

```ts
const timer = setTimeout(() => { void salvar(quebra); }, 2000);
return () => clearTimeout(timer);
```

**Debounce de 2 s, PUT da quebra inteira, a cada mudança de qualquer campo.**

## 1. O veredito honesto: não há problema de tamanho hoje

Vinte e quatro quebras ocupam **848 kB**. O maior contexto tem 1,7 mil
caracteres — menos que esta SPEC. O maior diagrama tem 3,6 kB.

> Otimizar isto hoje seria trabalho contra um número que não dói. A SPEC-56
> §0.3 já recusou uma família inteira de features por medir antes de construir;
> a mesma régua se aplica quando a medição diz "está tudo bem".

**O que esta SPEC recusa fazer:** salvamento incremental por campo, compressão,
paginação de anexos, tabela separada para o contexto. Nenhum desses tem número
que os justifique.

## 2. O que a medição SIM revelou

### 2.1 O debounce cancela, mas nada garante que o último salvou

O `return () => clearTimeout(timer)` cancela o salvamento pendente a cada
mudança. Numa digitação contínua, nada é salvo — o que é o objetivo. Mas:

- **fechar a aba com o timer armado perde os últimos 2 s de trabalho**, sem
  aviso;
- não há `beforeunload` nem *flush* no fechamento;
- o `status: "nao-salvo"` aparece na tela, e é a única defesa.

Duas segundos é pouco. Mas "pouco" não é "nada", e o campo mais afetado é
justamente o que o usuário citou: **o contexto da demanda, digitado em prosa
longa**.

### 2.2 Toda mudança dispara o documento inteiro

O `useEffect` depende de `quebra` — o objeto todo. Mexer num `timeoutMs` de um
nó reenvia contexto, anexos, decisões, percursos, itens e documento escrito.

Hoje isso custa ~4 kB e é irrelevante. **A régua que importa não é o byte: é o
`atualizadoEm`.** Toda gravação carimba a linha, então "quando esta demanda
mudou pela última vez" responde *"quando alguém arrastou um nó"* — e é sobre
esse carimbo que a SPEC-58 §5 constrói o "documento desatualizado".

### 2.3 O `anexosContexto` é a única bomba de tamanho, e ninguém a mediu

`anexosContexto` guarda **o conteúdo inteiro** de arquivos de texto anexados,
dentro da linha da quebra. Um `.md` de 2 MB colado ali entra por completo, em
cada PUT, a cada 2 s de digitação.

Não há limite declarado — nem no cliente, nem no Zod da borda, nem na coluna. E
a coluna declara `$type<string[]>()` enquanto o modelo diz
`{ nome, conteudo }[]`: **os dois discordam**, e um deles está errado (ver
SPEC-71 §4).

> Este é o único ponto onde o relato do usuário ("eventualmente grandes") tem
> um mecanismo real por trás. E ele não é sobre otimizar: é sobre **não ter
> teto**.

## 3. O que entra

**3.1 Teto declarado para anexo.** Um limite por anexo e um total por quebra,
recusados na borda com a frase que diz o número — não um 413 seco. Sem teto, o
primeiro anexo grande vira um incidente que ninguém consegue diagnosticar pela
tela.

**3.2 Flush ao sair.** `beforeunload` (ou `visibilitychange`) dispara o
salvamento pendente. É a diferença entre "perdi 2 s" e "não perdi nada", e custa
poucas linhas.

**3.3 O `atualizadoEm` deixa de ser carimbado por mudança que não é do
conteúdo.** Ou o autosave para de reenviar o que não mudou, ou o carimbo passa a
distinguir. A decisão entre as duas fica para a fatia — **a medição não diz qual
é melhor**, e escolher agora seria adivinhar.

## 4. O que NÃO entra, e por quê

**Salvamento incremental (PATCH por campo).** Multiplica a superfície de
persistência por doze, para economizar 4 kB. E, pior: cria a classe de defeito
em que metade da quebra é de uma versão e metade de outra.

**Compressão.** 848 kB de tabela inteira. Não há o que comprimir.

**Anexo em storage separado (S3/blob).** É a resposta certa para arquivo grande
— e a pergunta certa só aparece **depois** do teto do §3.1 estar de pé e alguém
esbarrar nele. Construir antes é construir para um usuário que não existe.

**Reduzir o debounce de 2 s.** Sem número que diga que 2 s incomoda. O flush ao
sair resolve o que dói de verdade.

## 5. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | Teto de anexo, declarado e recusado com a frase que diz o número | unitário na borda: acima do teto, 400 com o tamanho e o limite no texto |
| **B** | Flush do autosave ao sair da aba | E2E: digitar, fechar sem esperar, reabrir e o texto estar lá |
| **C** | O `atualizadoEm` só muda quando o conteúdo muda | unitário: salvar duas vezes o mesmo objeto não mexe no carimbo |

## 6. Perguntas em aberto

1. **Qual teto?** Não tenho número de uso real para escolher. Recomendação:
   começar generoso (algo como 1 MB por anexo, 4 MB por quebra) e **medir quem
   esbarra** — o teto existe para dar diagnóstico, não para apertar.
2. **`visibilitychange` ou `beforeunload`?** O segundo é menos confiável em
   móvel. Recomendação: os dois, com a mesma função — o custo é um listener.
3. **A discordância de tipo em `anexosContexto` é bug de coluna ou de modelo?**
   Não medi. Fica como pergunta para a SPEC-71 fatia A responder por evidência,
   e não para esta afirmar.

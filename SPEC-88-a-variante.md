# SPEC-88 — A variante (P6)

> **Origem:** o último passo aberto da SPEC-56 com valor medido. O §295 o deixou
> de fora com uma frase que esta SPEC herda como escopo: *"fazer certo é **uma
> quebra com duas variantes** e uma decisão registrada de qual foi adotada —
> modelo, servidor, tela e migração. É uma SPEC inteira, não uma fatia."*

## 0. A medição

### 0.1 O motor de comparação já existe, e é puro

`lerDesenho(diagrama, config, limiares): LeituraDoDesenho`
(`engine/src/leitura/lerDesenho.ts:240`) é **função pura sobre um diagrama**. Ela
devolve exatamente o que a SPEC-56 §8 disse que a comparação seria:

| O que a SPEC-56 pediu | O que `LeituraDoDesenho` já traz |
|---|---|
| pior caso de latência | `tempoDoPiorTrecho`, e `tempos` inteiro |
| número de pontos sem alternativa | `fanOut`, `cadeiaMaisFunda`, `terceiros` |
| o que não foi medido | `conexoesNaoClassificadas` |

**Comparar A e B é chamar a mesma função duas vezes.** Não há motor novo nesta
SPEC — há um segundo diagrama para chamá-la.

### 0.2 O registro da escolha também já existe

`Decisao` (`model/types.ts:207`) tem `alternativas: Alternativa[]`, `escolhida`
(por **título**, e o comentário diz por quê: *"reordenar a lista não pode trocar a
decisão"*), `porque` e `contexto`.

A SPEC-56 §8 tinha dito: *"com P4, a comparação **é** o corpo do ADR"*. Está
literal — o que falta é ligar as duas pontas.

### 0.3 O que NÃO existe

Um segundo diagrama. `Quebra.diagrama` é um só, e é isso.

## 1. A decisão de modelagem, e é a SPEC inteira

A SPEC-56 §8 escreveu a armadilha antes de alguém cair nela:

> *"variante não pode ser 'copiar a quebra e editar', ou as duas divergem e
> ninguém sabe qual venceu."*

Duas quebras é o desenho errado: o contexto, as necessidades, as decisões, o
produto e o volume são **da demanda**, não do desenho — copiá-los produz dois
lugares para editar a mesma coisa, e eles divergem na primeira semana.

**O desenho:**

- a quebra continua tendo **um** `diagrama`, e ele é sempre o **adotado**;
- `variantes` guarda as alternativas **não adotadas**, cada uma com o seu
  diagrama e o motivo de existir;
- **adotar** uma variante troca os dois de lugar — o diagrama de hoje vira
  variante, a variante vira o diagrama — e **registra uma `Decisao`** com as
  alternativas e o porquê.

> **Uma verdade por vez, com histórico.** Em nenhum instante existem dois
> desenhos "válidos" ao mesmo tempo: existe o adotado, e existem alternativas
> guardadas. Toda pergunta do produto — prontidão, itens, documento, spec —
> continua tendo uma resposta só, e nenhuma delas precisa aprender o que é uma
> variante.

## 2. Por que a troca é atômica, e por que ela EXIGE o porquê

Adotar sem registrar seria o mesmo que copiar e editar, com passo extra: daqui a
três meses ninguém sabe por que o desenho é este, e a variante guardada parece um
rascunho esquecido em vez de uma opção descartada com razão.

A `Decisao` que nasce da adoção é o que transforma *"mudamos de ideia"* em
*"escolhemos B porque A somava 900ms no pior trecho"* — e é a única forma de a
comparação sobreviver à comparação.

**Consequência declarada:** o produto **recusa** adotar sem `porque`. É a mesma
régua do §230 vista pelo outro lado: não bloqueamos aprovar com lacuna, mas
bloqueamos gravar uma decisão vazia — porque a decisão vazia não é lacuna
marcada, é ausência disfarçada de registro.

## 3. O que esta SPEC RECUSA

- **Duas quebras.** §1.
- **Mais de uma variante adotada.** Não existe "A e B valem": existe o adotado.
- **Merge entre variantes.** Pegar três nós de A e dois de B produz um terceiro
  desenho que ninguém desenhou, e cuja procedência é impossível de contar.
- **Variante de variante.** Árvore de alternativas é o tipo de estrutura que
  ninguém consegue depurar, e não temos medição de que alguém queira.
- **Comparar mais de duas por vez na tela.** A pergunta real é *"esta ou aquela?"*.
  Três colunas de números lado a lado é uma planilha, e planilha não é o que se
  lê antes de decidir.
- **Derivar itens de uma variante não adotada.** Item é compromisso de trabalho.
  Derivar de um desenho que ninguém escolheu produz backlog de mentira.

## 4. Fatias

- **A — o modelo, e a troca como operação única.** `Variante { id, titulo,
  diagrama, motivo?, criadaEm }`, `Quebra.variantes?`. `adotarVariante(quebra,
  varianteId, porque)` no engine — **função pura**, devolvendo a quebra nova
  **e** a `Decisao` que nasce. Prova: o diagrama de antes vira variante, o antigo
  título é preservado, a decisão lista as duas e nomeia a escolhida; e adotar sem
  `porque` **recusa**.
- **B — a comparação, e ela não inventa nada.** `compararVariantes(a, b, config)`
  chamando `lerDesenho` nas duas e devolvendo o par, com a diferença **calculada,
  nunca digitada**. Prova: dois desenhos com tempos conhecidos produzem a
  diferença certa; desenho sem tempo declarado diz *"não medido"* em vez de zero
  — que é a régua do §57 (`conexoesNaoClassificadas`) aplicada à comparação.
- **C — o dado atravessa.** Zod, coluna (`jsonb`, no molde das seis irmãs),
  porta, adaptador e reidratação. A trava do §310 cobra sozinha se ficar pela
  metade — e o §330 lembrou que a **quinta** declaração é a `QuebraSalva` própria
  do `packages/web`.
- **D — a tela.** Salvar o desenho de agora como variante, ver as duas leituras
  lado a lado, adotar com o porquê obrigatório. A decisão que nasce aparece onde
  as decisões já aparecem — não numa gaveta nova.

## 5. Perguntas em aberto

1. **Quantas variantes uma quebra aguenta?** Sem medição. A SPEC não impõe teto;
   a tela compara **duas** por vez (§3), o que já limita o uso na prática.
2. **A variante entra no documento?** O documento descreve o desenho adotado, e a
   decisão já carrega as alternativas. Provavelmente não precisa de seção nova —
   mas não medimos, e esta rodada não assume.
3. **O tamanho do payload.** Cada variante é um diagrama inteiro dentro da linha
   da quebra. A SPEC-72 mediu 848 kB em 24 quebras e concluiu que não há número
   que doa; com variantes isso cresce, e o teto de anexo daquela SPEC **não**
   cobre este caso. Fica registrado para medir quando houver uso real.

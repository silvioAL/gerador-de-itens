# SPEC-99 — O design system por referência: prints viram tokens

> **Origem:** o usuário, olhando a tela de *Design system* rodando, com **0 tokens
> declarados**:
>
> > *"aqui precisamos criar outra spec: necessitamos que seja possível interagir
> > com o assistente. Eventualmente o usuário vai querer criar essa spec a partir
> > de referências ou telas, portanto vai passar prints e o assistente vai gerar
> > a spec. Portanto entendo que aqui especificamente o comportamento do agente
> > deveria apresentar um balão nos mesmos moldes que existe hoje quando sugere
> > derivar quebra. Planeje como deve ser essa jornada e crie a spec."*

---

## 0. O que a tela pede hoje, e por que quase ninguém consegue dar

A aba de Design system tem **um caminho só**:

> *"Cole a exportação no formato **Design Tokens do W3C** — é o que Figma, Style
> Dictionary e Tokens Studio produzem."*

E o estado da instalação medida: **0 tokens declarados**.

**A porta existe e o degrau é alto.** Quem tem exportação W3C pronta é quem já
tem design system maduro — e esse time é justamente o que menos precisa desta
tela. Quem tem *"o Figma da equipe"*, *"o print da tela aprovada"* ou *"o guia de
marca em PDF"* — que é a maioria — não tem por onde começar.

> É o mesmo formato de defeito que a SPEC-94 §2.2 descreveu para a maturidade:
> **a ferramenta pede o artefato que só existe depois de o trabalho estar feito.**
> Aqui em escala pequena e resolvível.

### 0.1 E a consequência é silenciosa

Sem tokens, as checagens de design system **ficam caladas** — a própria tela diz
isso, e é um estado legítimo. Mas o efeito prático é que a régua visual da SPEC-79
existe, roda, e nunca cobra nada. O estágio *"Analisar o contexto técnico"* conta
o design system entre o que o motor lê; com a lista vazia, essa parte da promessa
não se cumpre — sem que nada acuse.

---

## 1. O que já existe, e é mais do que parece

Esta SPEC quase não inventa mecanismo. Ela **liga três coisas que já estão
construídas**:

| Peça | Onde | O que faz hoje |
|---|---|---|
| **Anexar print à conversa** | `conversa/AnexoDeImagem.tsx` (SPEC-30 Fase 2) | print de diagrama → o agente propõe nós e conexões **com os tipos que existem na config** |
| **O modelo enxerga imagem** | `credenciais_ia.visao` | o anexo **só aparece quando o provedor selecionado enxerga** — mesma regra do microfone |
| **O balão proativo** | `assistente/momentos.ts` (SPEC-37 Fase 3) | decide qual momento vale agora, com prioridade pura e testável; todo momento é dispensável, e dispensar silencia pela sessão |

> **A jornada pedida é o caminho do print, apontado para outro alvo.** Hoje ele
> produz nós e arestas; aqui produz tokens. O agente, a régua de visão, o aviso de
> saída de dados e a contenção (*a IA propõe, você aplica*) são os mesmos.

---

## 2. A jornada, passo a passo

### 2.1 O convite: um momento novo, com a régua dos que existem

**Onde:** na aba de Design system, quando **não há token declarado**.

**O que o balão diz:** que dá para começar por uma referência — um print da tela,
o guia de marca, a exportação do Figma — em vez de exigir o JSON do W3C.

**As três réguas herdadas da SPEC-37, e nenhuma é opcional:**

1. **Dispensável**, e dispensar silencia pela sessão. Um convite que volta a cada
   render é o que ensina a ignorar balão.
2. **Só quando cabe.** Com tokens já declarados, ele não aparece — o trabalho está
   feito, e sugerir de novo é ruído.
3. **A decisão mora em `momentos.ts`**, pura e testável, e não espalhada na tela.
   É onde um defeito seria silencioso: dois balões brigando, ou o mais urgente
   perdendo.

> **E uma quarta, específica deste caso:** se o provedor de IA **não enxerga
> imagem**, o balão não promete print. Ele oferece o caminho por texto — *"descreva
> as cores e os espaçamentos"* — ou se cala. Prometer anexo onde o anexo não vai
> funcionar é a promessa falsa que a SPEC-76 impede, na forma mais barata de
> cometer.

### 2.2 O que a pessoa manda

**Print, texto, ou os dois.** O anexo já sabe receber imagem (`ImagemAnexada`), e
o campo de texto já existe no painel.

O que **não** muda: o aviso de saída de dados continua fixo, sem sumir depois do
primeiro uso. Um print de tela corporativa costuma ter mais informação sensível do
que quem anexa lembra na hora — e aqui é ainda mais provável, porque o print é
justamente de uma tela real do produto da casa.

### 2.3 O que o agente devolve, e como

**Uma proposta de tokens, no formato que a tela já lê.** Não um texto descrevendo
cores: o mesmo JSON do W3C que o campo aceita hoje — **o agente preenche o campo
em vez de substituir o mecanismo**.

Isso é decisão de desenho e vale explicar: fazer o agente gravar direto criaria um
segundo caminho de escrita para a mesma configuração, e os dois divergiriam na
primeira mudança de formato (§263). Com a proposta caindo no campo, existe **um
lugar só** que sabe transformar JSON em tokens — o que a tela já faz e já tem
teste.

### 2.4 A contenção: nada entra sem confirmação

**É a tese do produto, e aqui ela é literal:** a IA propõe os tokens, a pessoa
**vê o que mudaria** e aplica. O botão *"Ler os tokens"* já existe e já mostra a
contagem; a proposta passa por ele como qualquer colagem.

E cada token proposto nasce **marcado como sugerido** — `ValorSpec.origem` já
distingue digitado, extraído, inferido e sugerido. Um token que o modelo leu de um
print é *inferido de imagem*, e essa procedência precisa sobreviver: quando o
contraste falhar seis meses depois, a pergunta *"de onde veio esse cinza?"* tem
resposta.

### 2.5 O que acontece depois, e é o que dá sentido a tudo

Com tokens declarados, **as checagens de design system acordam**: contraste vira
aritmética conferível, cor fora da paleta vira apontamento, e apontamento vira
item de trabalho (SPEC-79).

> **É o argumento da jornada inteira:** o print não vira decoração nem
> documentação — vira **régua que cobra**. E é por isso que vale baixar o degrau
> de entrada: o valor não está em ter a lista, está no que a lista liga.

---

## 3. O que esta SPEC RECUSA

- **Substituir o formato W3C.** Ele continua sendo o que a tela lê e grava. O
  agente preenche o campo; não cria um segundo caminho de escrita.
- **Aplicar sem confirmação.** Vale a régua de sempre — e mais aqui, porque o
  modelo está **lendo pixels**, que é onde ele mais erra.
- **Prometer anexo onde o provedor não enxerga.** O balão se adapta ou se cala.
- **Balão que volta depois de dispensado**, ou que aparece com tokens já
  declarados.
- **Token sem procedência.** *"Inferido de imagem"* é diferente de *"declarado
  pelo time"*, e apagar a diferença é perder a única informação que explica um
  valor estranho meses depois.
- **Adivinhar semântica.** Um print dá cores e espaçamentos; **não diz qual cor é
  "primária"**. O agente propõe nomes, e nomes propostos são a parte mais frágil —
  vão marcados como sugestão, e a tela deixa renomear antes de aplicar.
- **Extrair token de imagem no cliente** (contar pixels, achar paleta por
  histograma). Seria um segundo motor de inferência, sem proveniência e sem
  contenção — e o produto já tem um caminho para "a IA propõe".

---

## 4. Fatias

- **A — o momento.** `momentos.ts` ganha o caso da aba de Design system sem
  tokens, com a régua de visão. **Prova:** com tokens, não aparece; dispensado,
  não volta na sessão; sem provedor de visão, não promete print. A decisão é pura,
  e os três casos são de unidade.
- **B — o pedido ao agente.** O prompt que transforma referência em tokens W3C,
  na mesma anatomia dos pedidos que já existem. **Prova:** o teste de anatomia que
  o repositório já aplica aos outros pedidos, e a saída validada contra o leitor
  de tokens existente — se ele não ler, a proposta não serve.
- **C — a proposta na tela.** A resposta cai no campo, a pessoa lê e aplica.
  **Prova:** E2E contra o dublê; nada é gravado sem o clique.
- **D — a procedência.** Token vindo de imagem nasce marcado. **Prova:** a origem
  sobrevive ao salvar e aparece na tela.

> **Corte:** **A+B** numa rodada, **C+D** na outra. A fatia A sozinha já tem valor
> — ela transforma uma tela vazia num convite —, mas sem a B o convite não leva a
> lugar nenhum, e é por isso que as duas andam juntas.

---

## 5. Perguntas em aberto

1. **Um print de tela dá tokens bons?** Não medimos. Cores dominantes saem fáceis;
   **espaçamento e tipografia são bem mais difíceis**, e raio de borda quase
   impossível. **Recomendação:** a fatia B começa mirando **cor**, e o balão diz o
   que consegue ler — prometer a paleta inteira e devolver três cores é pior que
   prometer cor e entregar cor.
2. **E se o time colar o Figma em vez do print?** A exportação do Figma **já é**
   W3C, e o caminho de colar continua sendo o melhor para quem a tem. O balão
   precisa dizer isso — oferecer o caminho difícil a quem tem o fácil seria
   atrapalhar.
3. **Quantos tokens de uma vez?** Um print pode render dezenas. Aplicar tudo de
   uma vez torna a revisão impossível na prática, e é onde a confirmação vira
   carimbo. **Recomendação:** propor agrupado por tipo (cores, depois
   espaçamentos), e deixar aplicar por grupo.
4. **A régua de contraste roda sobre tokens sugeridos?** Se rodar, a tela pode
   dizer *"esta dupla não passa"* **antes** de a pessoa aplicar — e isso seria o
   melhor momento de dizer. É barato: `contraste()` já existe e já é usada para
   validar a paleta do próprio produto. **Recomendação: sim**, e é o detalhe que
   transforma a proposta em conversa em vez de despejo.

---

## 6. Para quem implementar

- `packages/web/src/assistente/momentos.ts` — a decisão do balão, pura. A fatia A
  vive aqui, e a prioridade é o que não pode ser espalhado pela tela.
- `packages/web/src/conversa/AnexoDeImagem.tsx` — o anexo que já existe, e a
  regra de só aparecer com provedor que enxerga.
- `packages/web/src/config/` — a aba de Design system, o campo W3C e o botão
  *"Ler os tokens"*, que a proposta atravessa em vez de contornar.
- `packages/engine/src/conformidade/contraste.ts` — a régua que acorda quando há
  tokens, e que responde à pergunta §5.4.
- `SPEC-79` — o design system como régua, e por que a lista vazia cala as
  checagens.
- `SPEC-30` Fase 2 — o print como insumo, e o aviso de saída de dados que não
  some.
- `SPEC-37` — os momentos, e as três réguas que todo balão herda.

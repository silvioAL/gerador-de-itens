# SPEC-120 — O upload em lotes, e o que o MCP aguenta

> **Origem:** o usuário, enquadrando as restrições reais do outro lado:
>
> > *"1 - MCPs são lentos e tem limitações de tokens, pode ser necessário subir
> > 5 itens por vez. 2 - É preciso das respostas para depois do upload pedir
> > para subir os anexos (as specs). 3 - os anexos precisam subir em formato
> > que um MCP consiga anexar, markdown é o melhor possível, mas precisamos
> > certificar que funciona. 5 - precisamos de animação em tela e que passe
> > feedbacks sobre o upload de forma não muito enjoativa"*
>
> Esta SPEC **não implementa nada**. Duas das quatro observações já estão
> construídas e esta SPEC diz onde; as outras duas são trabalho.

---

## 0. O que já existe, e por que dizer isso primeiro importa

Uma SPEC que respecifica o que já foi feito produz retrabalho e apaga
decisões. Então, item a item:

| Observação | Estado | Onde |
|---|---|---|
| **2.** Precisa da resposta da 1ª chamada para anexar a spec | ✅ **construído** | SPEC-114: a 2ª chamada só entra com `linkExterno`; quem não tem vira `semLinkExterno`, não erro |
| **5.** Animação e feedback do upload | ✅ **construído**, calibragem em aberto | SPEC-115 fatias E/G (§409): contagem real por etapa, item em trânsito nomeado, falha com motivo persistido |
| **1.** Lotes de ~5 itens | ❌ **não existe** | hoje vai **tudo numa chamada só** |
| **3.** Formato do anexo certificado | ⚠️ **presumido** | manda markdown e nunca se verificou que o MCP anexa |

### 0.1 A medição que dói

`exportarDaQuebra` monta `{ itens: [...] }` com **todos** os prontos e faz
**uma** chamada. `anexarSpecNaQuebra` monta `{ itens: [...] }` com **todos** os
pendentes e faz **uma** chamada.

A SPEC-98 §4 previu os lotes, listou as garantias e deixou o tamanho em aberto
(§4.2). A fatia D dela — *"os lotes, só na segunda chamada"* — **nunca foi
construída**. Uma demanda com trinta itens hoje manda trinta specs num POST, e
o modo de falhar é o pior possível: estoura, e estoura inteiro.

### 0.2 O terreno já está preparado, e isso é sorte com método

O §409 persistiu o estado **por item** (`specEnviadaEm`, `specErro`,
`specAnexada`). Isso não foi feito pensando em lote, mas é exatamente o que o
lote precisa: **um lote é só quantos itens vão por chamada HTTP** — o estado,
o acompanhamento na tela e o resultado parcial já são por item e não mudam.

Fatiar em lotes, aqui, não é reescrever o envio. É decidir quantos entram por
chamada e emendar as chamadas.

---

## 1. Os lotes: o tamanho respondido, e o que ele não resolve

> *"MCPs são lentos e tem limitações de tokens, pode ser necessário subir 5
> itens por vez"*

Isso responde a pergunta que a SPEC-98 §4.2 deixou aberta — **mas responde numa
unidade que é um proxy**, e vale dizer isso em voz alta.

### 1.1 Cinco itens não são cinco tamanhos

O que estoura contexto é a **spec**, não a contagem. Cinco itens pequenos e
cinco itens grandes diferem por uma ordem de grandeza no payload. Um limite em
itens é fácil de entender e de configurar, e falha justamente no caso que ele
existe para evitar: cinco specs longas.

**Então: 5 é o padrão, e o padrão não é a garantia.** As três defesas, e as
três já estavam propostas na SPEC-98 §4.2:

1. **Configurável**, com 5 de fábrica — o número certo é do gateway de cada
   um, não do produto.
2. **Teto por tamanho junto do teto por contagem** — o lote fecha quando
   qualquer um dos dois estourar. Medir caracteres é aproximação grosseira de
   tokens, e grosseira serve: o que se quer é não chegar perto do limite.
3. **A recusa do destino é sinal, não só erro** — um 413 ou um erro de contexto
   devolvido pelo MCP deveria reduzir o lote e tentar de novo, em vez de
   marcar tudo como falho.

> **A garantia que não se negocia** (SPEC-98 §4.1): o lote é fatiado **por
> item, nunca no meio de um**. Meio item é truncagem com outro nome.

### 1.2 E o lote vale para as DUAS chamadas

A SPEC-98 §4 concluiu que o lote é problema *"da segunda chamada apenas"*,
porque *"um item pronto é pequeno"*. **A observação do usuário corrige isso:**
o limite não é só de tokens, é de **lentidão** — e um MCP lento com trinta
issues para criar numa chamada tem o mesmo problema de timeout que a spec tem
de contexto.

### 1.3 O que os lotes fazem com o modo de demonstração

O dublê da SPEC-115 fatia D espera **20s por item**, de propósito (é o que torna
o pipeline visível). Com lotes de 5, um lote leva 100s. Isso é coerente — é o
tempo de um MCP lento — mas precisa ser dito na tela de configuração, senão a
demonstração parece travada.

---

## 2. O formato do anexo: markdown, e a palavra que importa é "certificar"

> *"os anexos precisam subir em formato que um MCP consiga anexar, markdown é o
> melhor possível, **mas precisamos certificar que funciona**"*

O produto manda markdown hoje, no campo `conteudo`. **Nunca foi verificado
contra um MCP de verdade** — e "presumir que funciona" é como as três rodadas
anteriores descobriram que o botão não anexava nada.

### 2.1 O que "certificar" precisa cobrir

| O que pode quebrar | Por quê |
|---|---|
| **Blocos de código dentro do markdown** | a spec tem ` ``` `; um MCP que reembrulhe em markdown produz aninhamento quebrado |
| **Tamanho do anexo** | anexo tem teto próprio, diferente do teto de contexto |
| **Onde o MCP põe** | comentário no issue? campo de descrição? arquivo anexo? São três coisas, e a pessoa precisa saber qual |
| **Acentuação e UTF-8** | este produto escreve em português; um encoding errado só aparece no issue |
| **Markdown do destino ≠ markdown** | Jira tem o dele; um wrapper pode converter, ou não |

### 2.2 A decisão a tomar

**O produto converte, ou manda markdown e o gateway se vira?** A régua da
SPEC-49 responde por analogia — *"implementar um tracker específico seria
escolher o tracker de todo mundo"* — e a resposta coerente é: **manda markdown,
o gateway converte.** O que falta é o produto **declarar isso no contrato** da
operação `specDoItem`, para quem escreve o agente do outro lado saber o que
recebe.

E a certificação não é teste automatizado: é **rodar contra o MCP do Jira
real** e olhar o issue. Só isso prova.

---

## 3. A animação: o que já existe, e o que "não muito enjoativa" significa

> *"precisamos de animação em tela e que passe feedbacks sobre o upload de
> forma não muito enjoativa"*

### 3.1 O que o §409 já entregou

- contagem real por etapa (*"2 com a spec anexada · 1 anexando · 1 esperando"*)
- o item em trânsito **nomeado**, com pulso de 1,6s
- a falha com motivo, **persistida** — sobrevive ao F5
- **nenhuma barra de progresso**, e há teste que falha se alguém acrescentar
  uma (SPEC-98 §6 recusa estimativa que não se declara estimativa)

### 3.2 O que "enjoativa" cobra, e é calibragem

A régua da SPEC-85 §2 já é *"movimento que não carrega informação que o
estático não carrega, não entra"*. "Não enjoativa" acrescenta uma segunda:
**movimento que carrega informação também cansa, se repetir demais.**

Com lotes, isso deixa de ser teórico: um envio de trinta itens em seis lotes
tem trinta pulsos, seis transições e trinta linhas aparecendo. Três ajustes
que a implementação precisa pesar:

1. **O que muda pouco não pisca.** O pulso marca *onde está acontecendo*; a
   lista inteira em movimento não marca nada.
2. **Agregar por lote, detalhar sob demanda.** *"Lote 3 de 6 · 12 de 30
   anexadas"* é a informação; trinta linhas simultâneas são ruído com a mesma
   informação dentro.
3. **O fim é um evento, não a ausência de movimento.** Hoje a animação
   simplesmente para. Terminar precisa ser visível, ou quem desviou o olhar
   não sabe se acabou ou travou.

E a guarda de `prefers-reduced-motion` (§328) continua cobrindo tudo — quem
pede menos movimento já recebe a mesma informação parada.

---

## 4. O que esta SPEC RECUSA

- **Respecificar o que o §409 construiu.** O estado por item, a persistência e
  a contagem real ficam como estão; o lote se emenda neles.
- **Lote medido só em contagem de itens.** É proxy, e falha no caso que
  importa (§1.1).
- **Fatiar no meio de um item** (SPEC-98 §4.1).
- **Converter markdown para o dialeto de um tracker.** Seria escolher o tracker
  de todo mundo (SPEC-49). O produto declara o formato; o gateway converte.
- **Presumir que o anexo funciona.** Certificar é rodar contra o MCP real e
  olhar o issue — a régua que esta casa já pagou três vezes para aprender.
- **Barra de progresso.** Com lotes ela fica tentadora ("lote 3 de 6" parece
  uma barra honesta) — e continua sendo estimativa sobre tempo que é do outro
  lado. Contagem real, sim; barra, não.

---

## 5. Fatias

- **A — o lote existe, com tamanho configurável e 5 de fábrica.** Vale para as
  duas chamadas (§1.2). **Prova:** trinta itens produzem seis chamadas, e o
  estado por item continua igual ao de hoje.
- **B — teto por tamanho junto do teto por contagem** (§1.1). **Prova:** cinco
  specs grandes fecham o lote antes dos cinco itens.
- **C — a recusa do destino reduz o lote e tenta de novo** (§1.1, defesa 3).
  **Prova:** um 413 no lote de 5 vira dois lotes menores, sem a pessoa fazer
  nada — e o que não passar nem sozinho vira erro por item, com motivo.
- **D — o contrato do anexo, declarado.** O que o produto manda, em que campo,
  em que formato. **Prova:** a tela de configuração diz, como já diz o contrato
  de `itens`.
- **E — a certificação contra o MCP real** (§2.2). **Prova:** um issue de
  verdade, com a spec anexada, aberto e conferido — blocos de código,
  acentuação e tamanho.
- **F — a animação calibrada para lote** (§3.2): agregada por lote, detalhe sob
  demanda, e o fim como evento.

---

## 6. Perguntas em aberto

1. **O lote é configurável por destino ou global?** Dois gateways podem ter
   limites diferentes — mas com **um gateway só** (SPEC-118 §2.0), talvez a
   configuração global baste.
2. **A redução automática (fatia C) é desejável ou assustadora?** Um produto
   que retenta sozinho é conveniente até o dia em que retenta algo que teve
   efeito colateral. Para `specDoItem` (anexar) o risco é baixo; para `itens`
   (criar issue) **um retry sobre um sucesso mal reportado duplica issue**.
3. **Qual MCP de Jira será o alvo da certificação?** A resposta muda o que a
   fatia E testa — e, se forem vários, muda se o formato pode ser um só.
4. **O que a tela mostra quando um lote inteiro falha?** Por item já está
   resolvido. Por lote, a pergunta é se os itens daquele lote aparecem cada um
   com o mesmo motivo (ruído) ou se o lote vira uma linha (esconde quais).

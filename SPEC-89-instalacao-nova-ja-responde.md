# SPEC-89 — Instalação nova já responde

> **Origem:** o usuário, olhando o produto rodando: *"quanto a demo notei que não
> usa o mock, deveria."*

## 0. A medição

### 0.1 O tour promete algo que a instalação nova não faz

`useTour.ts:122` afirma, no passo "Começar conversando":

> *"Este desenho na mesa nasceu da conversa ao lado."*

A conversa ao lado é `CONVERSA_DO_TOUR` (`dadosDoTour.tsx:35`) — uma **transcrição
fixa**, com a proposta de diagrama escrita à mão. Nada nasceu de nada.

E o passo final (`useTour.ts:265`) fecha convidando:

> *"a mesa à sua frente está vazia, e a conversa está aberta. Descreva a sua
> demanda em uma frase, por texto ou por voz, e o agente propõe os primeiros
> componentes."*

**Numa instalação sem credencial, isso não acontece.** O servidor responde:

```
$ grep -c "IA não configurada" packages/server/src/routes/ia.ts
3
→ 503 { erro: "IA não configurada — cadastre a credencial do gateway" }
```

É a régua da SPEC-76 sendo violada pelo próprio tour: **a página não pode
prometer o que o produto não faz** — e aqui a promessa é a última frase que a
pessoa lê antes de tentar.

### 0.2 O dublê já existe, já é plausível, e já sobe por padrão

A SPEC-74 entregou `packages/gateway-falso`, e a fatia B o colocou no
`docker-compose.yml` **sem `profiles`** — ele sobe no `docker compose up` normal,
com `GATEWAY_FALSO_RESPOSTAS: plausivel` e latência de 500 ms para parecer real.

O preset "Sem custo (respostas simuladas)" é o **primeiro** da lista
(`presets.ts:100`), com o comentário que explica por quê: *"a pessoa escolhe o
primeiro que reconhece"*.

Ou seja: a peça existe, é boa, e ainda assim é preciso configurá-la à mão antes
de o produto responder qualquer coisa.

### 0.3 O 503 está repetido em três lugares

`routes/ia.ts:285`, `:349` e `:557`, com a mesma condição
(`!credencial?.baseUrl || !credencial.chave`) e a mesma frase. Três cópias da
mesma decisão — e é onde o fallback tem que entrar **uma vez só** (§263).

## 1. A decisão que define esta SPEC: o fallback é DECLARADO, nunca adivinhado

O caminho fácil seria "sem credencial, use o dublê". **É perigoso**, e recusar
isso é metade do valor da rodada: numa implantação de produção sem gateway
configurado, o produto passaria a responder com **texto inventado** em vez de
recusar — e ninguém notaria até alguém aprovar um documento escrito por um
dublê.

A regra: o fallback só existe onde **a implantação declara que o dublê está
lá**, por variável de ambiente. O `docker-compose.yml` declara (ele sobe o
serviço); uma implantação de produção simplesmente não declara, e o 503 continua
sendo o comportamento.

É o mesmo desenho que a SPEC-74 fatia B já usou para o serviço: quem tem o dublê
diz que tem.

## 2. O que muda no tour

`CONVERSA_DO_TOUR` **sai**. O passo passa a rodar a conversa de verdade contra o
dublê — e a frase *"este desenho nasceu da conversa ao lado"* fica verdadeira
pela primeira vez.

Consequência declarada, e ela é boa: o tour deixa de ser um vídeo e passa a ser o
produto. O que a pessoa vê no passo é o que ela vai ver quando digitar.

**A marca continua.** Tudo que sai do dublê chega marcado como simulado
(`/ia/status` já devolve `simulado`, SPEC-74 fatia D) — o tour não pode fazer
ninguém achar que aquilo veio de um modelo de verdade.

## 3. O que esta SPEC RECUSA

- **Fallback silencioso em produção.** §1. É o risco inteiro desta rodada.
- **O tour escrever credencial.** O §235 recusa dado de demonstração que escreve
  na configuração de quem só quis ver a ferramenta, e isso vale aqui: o fallback
  é do servidor, não um `PUT` disparado pelo tour.
- **Tirar a marca de simulado.** Ela é o que separa "demonstração honesta" de
  "produto mentindo com confiança".
- **Fazer o dublê responder melhor.** A fatia C da SPEC-74 já o deixou plausível.
  Se a resposta não convencer no tour, isso é medição para outra rodada — e é
  medição, não opinião.

## 4. Fatias

- **A — a credencial em vigor, num lugar só.** `credencialEmVigor(repo)`
  devolvendo a salva ou a do dublê **quando declarada**, com um sinalizador de
  procedência. Os três 503 passam a chamá-la. Prova: sem a variável, os três
  continuam devolvendo 503 — comportamento idêntico ao de hoje; com ela, os três
  respondem e a resposta vem marcada.
- **B — a declaração no compose.** A variável, com o valor que alcança o serviço
  por dentro da rede do Docker. O README diz o que ela faz e por que uma
  implantação de produção não a define.
- **C — o tour perde a transcrição fixa.** `CONVERSA_DO_TOUR` sai; o passo roda a
  conversa. Prova: E2E do tour com o dublê no ar, e a proposta aparecendo na mesa
  sem nenhum dado de demonstração no caminho.
- **D — a trava que impede o silêncio.** Teste que falha se algum caminho de IA
  responder com dado do dublê **sem** a marca de simulado. É a fatia que impede
  esta SPEC de virar o defeito que ela existe para evitar.

## 5. Perguntas em aberto

1. **O dublê responde bem o bastante para o tour?** Não medimos com olhos ainda —
   é o mesmo tipo de pergunta que a SPEC-82 §4.2 fez sobre movimento, e a resposta
   se dá vendo. A fatia C entrega o caminho; a avaliação vem depois.
2. **E a transcrição?** O dublê já responde `/audio/transcriptions`, então o botão
   de falar passa a funcionar junto, de graça. Não é escopo declarado desta
   rodada, mas cai dentro — e se cair, é dito no §.

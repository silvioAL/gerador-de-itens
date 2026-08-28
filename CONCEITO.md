# O conceito — o ciclo, e a IA contida no meio

> Este é o texto que a SPEC-76 fatia A pede: o que a ferramenta é, escrito para
> alguém de fora ler e explicar de volta **sem ver a tela**.
>
> A lista dos estágios não mora aqui. Ela mora em
> `packages/web/src/demo/ciclo.ts`, como dado — porque é conferida por teste
> contra o roteador de verdade, e porque uma lista em prosa envelhece calada. O
> que mora aqui é o **porquê**.

---

## Em uma frase

Uma ferramenta que transforma o **desenho de uma solução** em **itens de
trabalho especificados**, por um mecanismo determinístico — e que usa IA para
escrever texto, nunca para decidir estrutura.

## O que ela não é

Não é um gerador de prompt. Não é um assistente que "cria o backlog para você".

A diferença é verificável, e é a tese do produto: **o mesmo desenho produz
sempre os mesmos itens.** Se você mudar uma coisa e rederivar, dá para comparar
o antes e o depois — porque nada no meio do caminho é uma amostragem de modelo.

## A divisão de trabalho

É a coisa mais importante deste documento.

**O motor calcula.** Ele lê duas coisas — o seu desenho e a configuração do time
(tipos de componente, padrões, réguas, modelos de documento) — e faz três: mede
o desenho a cada mudança, deriva os itens de trabalho, monta os textos a partir
dos modelos. Não conversa com IA, não vai à rede, não guarda estado.

**A IA escreve.** A história de usuário, os critérios de aceite, o porquê de uma
proposta, o texto de um contrato. Ela nunca decide que itens existem, o que
falta preencher, o que está fora do padrão, ou em que ordem as coisas dependem
umas das outras.

**A pessoa confirma.** Nada que a IA propõe conta antes disso. E o que ela
escreveu continua marcado como dela, mesmo depois de confirmado — a marca é do
texto, não do momento.

## O centro rígido

Se o ciclo é um círculo, a IA está no meio dele — tocando todos os estágios, e
**contida** em todos.

Ela propõe, nunca aplica. Sugere, e alguém aceita. Escreve o texto, e nunca a
conta. É o que separa esta ferramenta de um gerador, e é a coisa mais difícil de
comunicar — porque é uma **ausência** de comportamento. Não há uma tela que
mostre "aqui a IA não fez nada".

O que existe, e é o substituto honesto para essa tela: **toda coisa que a
ferramenta afirma diz de onde veio.** Um valor traz sua proveniência (manual,
extraído, inferido, sugerido). Uma lacuna traz o marcador que a torna contável.
Uma medição traz a régra que a produziu. Um número derivado nunca se apresenta
como declarado.

## Por que a camada determinística existe

Porque uma medida que ninguém consegue contestar vira ruído ou dogma.

Quando a ferramenta aponta algo — "este componente está fora do padrão", "este
caminho estoura a régua", "este serviço não aguenta o volume que você prometeu"
— existe uma regra explícita por trás. Você pode ler a regra, discordar dela,
mudá-la na configuração, ou registrar que decidiu contrariá-la de propósito,
com motivo e autor.

Essa saída não é concessão: é o que mantém o mecanismo vivo. Sem ela, a pessoa
aprende a ignorar o vermelho, e a medição inteira morre junto.

## Por que é um ciclo, e não uma esteira

Uma esteira termina. Este produto volta.

O que se aprende usando — o feedback de quem refina, a exceção que cinco times
registraram pelo mesmo motivo, o volume que envelheceu — vira **solicitação de
ajuste na camada determinística**, com prévia e aprovação. O ajuste aplicado
muda as regras. As regras mudam o próximo documento, o próximo item, a próxima
medição.

Se cinco times violam o mesmo padrão, o padrão está errado, não os times. É essa
volta que faz a ferramenta aprender com quem a usa, em vez de só cobrar.

## A régua desta página

**Ela não pode prometer o que o produto não faz.**

É a mesma régua que o produto cobra de todo mundo lá dentro. Uma página de
apresentação que desenhasse estágios inexistentes seria a ferramenta violando,
na porta de entrada, a única coisa que ela exige.

Por isso os estágios que ainda não existem **aparecem, marcados**. Eles dizem
para onde isto vai — e a marca é o que os torna honestos. E por isso a lista é
dado conferido por teste: um estágio que perder a tela derruba a suíte no mesmo
commit em que isso acontecer.

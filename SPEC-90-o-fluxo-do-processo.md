# SPEC-90 — O diagrama do fluxo, com os saltos ao gateway

> **Origem:** o usuário, duas vezes. Primeiro: *"falta diagrama dos fluxos que já
> falei, que conecta a parte de produto e arquitetura de negócio → técnica →
> design da solução → ensaio, etc."* E depois, precisando: *"acho que já temos
> algo nesse sentido na landing page, mas falta uma explicação em forma de
> diagrama que demonstre o processo, mostre em forma de fluxo quando vai para o
> MCP, etc. — nesse sentido semelhante a arquitetura técnica."*

## 0. A medição

Ele está certo nas duas metades: **tem algo nesse sentido, e o que falta é o
fluxo.** A landing tem cinco peças, e nenhuma responde *"em que ponto isto sai
para o gateway?"*:

| Peça | O que ela mostra | Por que não é o fluxo |
|---|---|---|
| `AEvolucao` | prompt → agente → camada | é sobre o MUNDO, não sobre o processo daqui |
| `AsCamadas` | perene · demanda · apontamentos · IA | é um **corte transversal**: o que existe, não em que ordem |
| `CicloDoProduto` | os treze estágios em círculo | mostra que **fecha**, e é um índice — não tem direção legível nem os saltos |
| `OMapaDeConexoes` | entra/sai, marcado | é **lista**: diz que existe ADR entrando e item saindo, nunca ONDE |
| `OPassoContido` | a IA propõe e para | é a tese, sobre um passo só |

O `OMapaDeConexoes` é o mais perto, e é exatamente o que o usuário identificou
como *"algo nesse sentido"*. Ele tem os cinco caminhos com o estado de cada um —
o que ele não tem é **o ponto do processo em que cada um acontece**.

## 1. O que este diagrama faz, e por que "semelhante a arquitetura técnica"

Caixa e seta. A cadeia que o usuário nomeou — **negócio → técnica → desenho →
ensaio → entrega**, com a volta do PDCA fechando —, e os saltos ao gateway
saindo e entrando **nos pontos onde acontecem**.

A diferença para o círculo é a pergunta que cada um responde:

- o círculo responde *"quais são os estágios, e o que já existe?"* — é índice;
- o fluxo responde *"por onde a coisa passa, e quando fala com fora?"* — é
  percurso.

Ler o mesmo conjunto de duas formas não é repetição quando as perguntas são
diferentes. **É repetição se o texto for o mesmo** — e é por isso que este
diagrama não repete os resumos dos estágios: ele mostra os nomes e as setas.

## 1.1 É uma JORNADA, e isso tem um cuidado herdado

O usuário completou o pedido: *"e uma visão de jornada, o objetivo é mostrar como
o sistema funciona."*

Então o diagrama se lê como percurso de alguém, da esquerda para a direita, e não
como inventário de caixas. O que muda na prática: as setas carregam **verbo**
(o que acontece ali), a volta do PDCA é desenhada como volta, e os saltos ao
gateway aparecem como **desvios no caminho** — não como caixas soltas ao lado.

**O cuidado.** Existiu uma `Jornada` na landing, e o §323 a tirou de lá com uma
medição: *"4 das 5 etapas dela eram estágios que o círculo acabava de mostrar"* —
uma narrativa contada três vezes. Ela continua viva pós-login, na aba "A jornada",
que é onde está quem já entrou.

Este diagrama **não é a volta daquele**. A diferença é o que a trava vai cobrar:
ele não repete os textos dos estágios, e mostra o que aquele não mostrava — **em
que ponto a coisa sai para o gateway**. Se ele acabar repetindo prosa de estágio,
é a `Jornada` de novo com outro nome, e o §263 já cobrou esse preço uma vez.

## 2. A régua: o diagrama sai do DADO, e por isso não consegue mentir

As duas listas já existem e já são guardadas por travas: `ESTAGIOS_DO_CICLO`
(§327, §328) e `CONEXOES` (§328). O fluxo é desenhado a partir delas.

O que falta nos dados é **onde cada coisa fica**, e é isso que a rodada
acrescenta:

- cada estágio ganha a **fase** a que pertence (a cadeia que o usuário nomeou);
- cada conexão ganha **em qual estágio ela acontece**.

Consequência declarada, e é o ponto: **um estágio que mude de fase muda o
diagrama**, e uma conexão que aponte para um estágio inexistente **quebra o
teste**. O diagrama não pode afirmar um caminho que o produto não tem, pelo mesmo
mecanismo que a SPEC-76 usou na prosa.

## 3. O que esta SPEC RECUSA

- **Substituir o círculo.** Ele responde outra pergunta, tem trava própria, e o
  usuário pediu explicitamente para manter a ideia do círculo e dos pontos
  (SPEC-85). Este entra **ao lado**.
- **Repetir os resumos dos estágios.** O texto de cada estágio já está no
  desdobramento do círculo. Aqui vão os nomes e as setas — repetir a prosa seria
  o §263 pela terceira vez na mesma página.
- **Desenhar o MCP como caixa nossa.** O produto **não implementa MCP**: ele
  chama um gateway configurável, e quem fala MCP é quem está do outro lado
  (SPEC-81). O diagrama tem que mostrar isso, e não sugerir que o protocolo mora
  aqui dentro.
- **Inventar fase que não tem estágio.** Fase é agrupamento do que existe, nunca
  uma caixa vazia bonita.

## 4. Fatias

- **A — o dado ganha o lugar.** `EstagioDoCiclo.fase` e `Conexao.noEstagio`.
  Provas: toda fase declarada tem pelo menos um estágio; toda conexão aponta para
  um estágio que existe; e a ordem das fases cobre os treze sem sobra nem falta.
- **B — o diagrama.** SVG dirigido pelas duas listas: as fases em sequência com a
  volta do PDCA fechando, os estágios dentro de cada uma, e os saltos ao gateway
  **entrando e saindo no ponto certo**, marcados com o mesmo vocabulário de estado
  do resto da página (`MARCA_DE_ESTADO`).
- **C — a landing, sem repetir.** Entra depois do ciclo — o índice antes do
  percurso —, e a trava de títulos do §328 continua valendo.

## 5. Perguntas em aberto

1. **Quantas fases?** Cinco mais a volta é o que a frase do usuário desenha. Não
   temos medição de que seja o número certo; o que a rodada garante é que fase
   sem estágio não existe, então errar para mais fica visível.
2. **Móvel.** Um fluxo horizontal com cinco fases não cabe em tela estreita. Esta
   rodada usa quebra de linha, e não miniatura ilegível — mas não medimos em
   aparelho real, e isso fica dito.

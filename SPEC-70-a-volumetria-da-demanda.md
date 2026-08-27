# SPEC-70 — A volumetria da demanda, distribuída pelo motor

> **Origem:** o usuário, olhando o campo `pico de [—] req/s` dentro de um ajuste
> de ensaio:
>
> > *"quanto a essa parte do pico acho que podemos melhorar, talvez adicionar
> > uma volumetria geral em algum lugar determinístico relacionado a demanda
> > (hoje está descrito como épico, mas pode ser qualquer demanda, vamos
> > renomear para demanda) — distribuir já de forma determinística para o motor,
> > **assim o usuário não precisa preencher**."*

---

## 1. O que custa hoje

A Lei de Little (SPEC-68 §3.3) é a única conta do produto que é aritmética pura:
`concorrência = taxa × tempo de resposta`. Ela precisa de dois números
declarados — e um deles, a **taxa**, é pedido **nó a nó**:

```ts
const taxa = numeroDe(no.spec?.[campos.taxa]);   // taxaEsperadaRps, por nó
const pool = numeroDe(no.spec?.[campos.pool]);
if (taxa === undefined || pool === undefined) continue;   // silêncio
```

Num desenho de oito componentes, a conta só fecha se alguém digitar oito
números. E, na esmagadora maioria dos casos, **são o mesmo número** — o volume
que entra na porta da frente, propagado adiante pelo próprio grafo.

O mesmo acontece no ensaio: o `pico de [—] req/s` é por elemento ajustado. Um
pico de tráfego não é uma propriedade de um componente; é uma condição do
**mundo**, e ela chega em todo mundo ao mesmo tempo.

> Pedir oito vezes o número que se deduz uma vez é a definição de trabalho que a
> ferramenta deveria estar fazendo.

## 2. O número existe UMA vez, e mora na demanda

```ts
export interface VolumetriaDaDemanda {
  quantidade: number;
  /** A unidade em que o NEGÓCIO fala. O motor normaliza para req/s. */
  por: "segundo" | "minuto" | "hora" | "dia";
}
```

**Por que na demanda e não no componente.** O volume é uma propriedade do que se
está construindo — *"esta jornada atende 2 milhões de consultas por dia"* —, não
de cada peça. Quem sabe esse número é quem trouxe a demanda, e ele é dito uma
vez, na mesma conversa em que se diz o propósito.

**Por que a unidade do negócio, e não req/s.** Ninguém traz "23,1 req/s"; traz
"2 milhões por dia". Obrigar a conversão na cabeça é onde o número entra errado
— e um número errado aqui contamina toda a propagação.

## 3. A distribuição é DEDUZIDA, não estimada

A regra, e ela é inteira:

1. **Entrada** — nó sem nenhuma conexão que espera chegando nele — recebe o
   volume da demanda;
2. **cada conexão que espera** propaga a taxa de quem chama para quem é chamado;
3. **nó chamado por vários** soma o que chega.

Não há heurística, não há amostragem, não há distribuição estatística: é o mesmo
passeio pelo grafo que a `lerDesenho` já faz, com outro número na mochila.

### 3.1 O que o motor NÃO adivinha

**Quantas vezes por requisição uma chamada acontece.** Um laço que consulta o
bureau uma vez por item de uma lista de 50 multiplica a taxa por 50, e **isso não
está no desenho**. Sem declaração, o motor assume **uma**, e diz que assumiu.

> Inventar um fator de amplificação seria fabricar o número mais importante da
> conta — e a saturação passaria a acusar ou a absolver por um palpite. É o §248
> na sua forma mais cara: um número plausível é pior que nenhum.

**Ciclos** têm guarda: um nó já visitado não recebe de novo. Grafo com ciclo
síncrono é um problema de desenho que outra régua acusa; aqui ele não pode virar
laço infinito.

## 4. Declarado vence derivado

Se o nó declara `taxaEsperadaRps`, ela manda. Quem **mediu** um componente sabe
mais que quem **propagou** a partir da porta da frente — um serviço que também
recebe tráfego de fora do desenho é o caso óbvio.

E a tela diz qual é qual: um número derivado apresentado como declarado seria a
ferramenta se atribuindo uma medição que ninguém fez.

## 5. O pico deixa de ser por elemento

```ts
export interface CenarioDeLentidao {
  // …
  /** "Neste ensaio, o volume da demanda é N× o normal." */
  fatorDeVolume?: number;
}
```

Um ensaio de Black Friday é `fatorDeVolume: 10`, e ele chega a **todos** os nós
de uma vez, pela mesma propagação. É exatamente o *"o usuário não precisa
preencher"* do relato.

O `taxaRps` por ajuste **continua existindo**: é a pergunta legítima *"e se só
este componente receber uma rajada?"* — e ela não é dedutível do volume da
demanda. Dois mecanismos, duas perguntas diferentes.

## 6. O que NÃO entra, e por quê

**Volumetria por percurso.** Uma demanda, um volume. Dois percursos com volumes
diferentes são duas demandas, e forçá-los na mesma quebra criaria um número que
não corresponde a nada.

**Duração, ramp-up e taxa de falha.** A SPEC-56 §0.3 e a SPEC-68 já os recusaram:
só produzem número através de amostragem, e amostragem sobre um desenho é
simulação de mentira. Continuam fora.

**Distribuição por peso entre ramos.** *"70% das requisições vão pelo caminho
A"* é conhecimento que não está no desenho, e pedi-lo devolveria ao usuário o
preenchimento que esta SPEC existe para tirar dele.

## 7. Épico vira demanda

*"hoje está descrito como épico, mas pode ser qualquer demanda"*.

O produto nunca foi sobre épicos. É sobre a **demanda** — épico, história, spike,
correção. `📎 Contexto do épico` → `📎 Contexto da demanda`, e o mesmo em toda
superfície que herdou a palavra.

Não é cosmético: um rótulo que nomeia um artefato de um processo específico
(Jira, SAFe) diz a quem usa outro processo que a ferramenta não é para ele.

## 8. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | `VolumetriaDaDemanda` e `distribuirVolumetria` no motor | unitário: entrada recebe, fan-out propaga, dois caminhos somam, ciclo não trava |
| **B** | A saturação lê o derivado quando não há declarado | unitário: o mesmo desenho acusa com volumetria e cala sem ela; declarado vence |
| **C** | `fatorDeVolume` no ensaio — o pico que chega a todos de uma vez | unitário: 10× o volume satura o que 1× não saturava |
| **D** | As superfícies: o campo na demanda, a marca de derivado, e o rename | E2E: declarar o volume na demanda faz a saturação aparecer sem tocar em nó nenhum |

**A ordem tem dependência dura:** A antes de B e C, porque as duas leem a
distribuição. D por último, porque a tela mostra o que as três produzem.

## 9. Perguntas em aberto

1. **O que fazer quando o desenho tem várias entradas?** Cada uma recebe o
   volume inteiro — e isso é uma escolha, não uma dedução. Recomendação: **sim**,
   e dizer na tela, porque o contrário (dividir entre elas) inventaria uma
   distribuição que ninguém declarou.
2. **A volumetria deveria ir ao documento?** Recomendação: **sim**, na seção de
   contexto — é dado de negócio, e quem lê o documento decide olhando para ele.
   Fica para uma fatia própria; esta SPEC não o faz.
3. **Conexões assíncronas propagam volume?** **Não.** A Lei de Little conta
   quem SEGURA a requisição, e quem publica numa fila não segura. É a mesma
   régua do `arestaEspera` que o §291 fixou.

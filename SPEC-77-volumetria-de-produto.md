# SPEC-77 — A volumetria que é do produto, não da chamada

> **Origem:** o usuário, dentro do pedido da página de apresentação, e pedindo
> que virasse SPEC própria:
>
> > *"requisitos de volumetria (**e também seria importante adicionar para
> > produto, pois também deveria fazer parte do PDCA — gerar spec separada para
> > isso**)"*

---

## 0. A medição

Existe **uma** volumetria hoje, e ela é técnica. Em `config/types.ts`:

```ts
/** Quando presente, ativa o bloco fixo "Requisitos de volumetria" (Response
 *  time, throughput…) */
volumetria?: { contextos: string[] };
```

É um bloco de **checklist de refinamento**, por tech e contexto: entra no item
gerado, e o que se preenche são números de engenharia (tempo de resposta, vazão).

E existe uma segunda, nova, que a SPEC-70 acabou de criar: `quebra.volumetria` —
o volume que **a demanda** atende, distribuído pelo grafo para a Lei de Little.

**Nenhuma das duas é do produto.** A primeira é do item; a segunda, da demanda.
As duas morrem quando a demanda termina.

## 1. O que falta, e por que é diferente das outras duas

O contexto do **produto** (SPEC-53) foi criado justamente para o que **não se
recola a cada demanda**: objetivo, glossário, regras que valem sempre. Ele é
**perene** — e é essa a palavra que o usuário usou ao descrever o ciclo:
*"captação de informações e regras de negócio/produto de forma perene"*.

Volume é exatamente esse tipo de fato:

> *"Este produto atende 40 mil clientes ativos, com 2 milhões de consultas por
> dia, pico de 5× no fim do mês."*

Isso não muda a cada demanda. Muda **uma vez por trimestre**, e quando muda,
muda o julgamento de **todas** as demandas em aberto.

Hoje, quem quer esse número na conta precisa redigitá-lo em cada quebra — que é
o mesmo defeito que a SPEC-70 corrigiu um nível abaixo (a taxa nó a nó), agora
um nível acima.

## 2. A herança, e a régua que ela precisa

O desenho natural é o mesmo do resto do produto: **o produto propõe, a demanda
pode discordar**.

- a demanda **sem** volumetria própria usa a do produto;
- a demanda **com** volumetria própria manda, e a tela diz que ela está
  divergindo do produto — não em silêncio.

> É a mesma forma de `obter(chave, timeId)` na config (time → global → template),
> e a mesma do §303: **declarado vence herdado, e a tela diz qual é qual.**

**O que essa régua impede:** que alguém veja "2 milhões/dia" numa demanda e não
saiba se foi digitado ali ou veio do produto — e, portanto, se mudar o produto
muda aquele número ou não.

## 3. Por que isto pertence ao PDCA, como o usuário disse

O PDCA hoje processa feedback sobre **configuração** (regras, campos, pipeline) e
o transforma em solicitação de ajuste com prévia, aprovação e aplicação.

Volumetria de produto é config de produto. E ela tem uma propriedade que a torna
um caso forte para o ciclo:

**ela envelhece sozinha.** Uma regra de refinamento continua válida até alguém
mudá-la; um volume declarado há um ano provavelmente está errado hoje, e **nada
avisa**. Um número desatualizado que alimenta a Lei de Little produz saturação
falsa — ou, pior, silêncio falso.

Daí o elo com o PDCA não ser enfeite: o ciclo é quem sabe perguntar *"este número
ainda vale?"* e transformar a resposta em ajuste registrado.

## 4. O que NÃO entra

**Medir volume de verdade (telemetria, APM).** O produto nunca mediu nada do
mundo real, e começar aqui mudaria o que ele é. O número é **declarado** por
quem sabe — como todo número neste produto.

**Volumetria por ambiente (dev/hom/prod).** Multiplica a superfície por três para
um ganho não demonstrado. Se aparecer a necessidade, ela aparece com um caso.

**Estimar o pico a partir da média.** "5×" é conhecimento de negócio, não uma
constante. Inventá-lo é o §248 na conta que mais importa.

**Substituir a volumetria técnica do checklist.** São perguntas diferentes: uma é
"quanto este produto recebe", a outra é "que número este item precisa cumprir".
Fundi-las perderia as duas.

## 5. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | `Produto.volumetria` — o número perene, na mesma forma da SPEC-70 (quantidade + unidade) | unitário: a conversão para req/s é a mesma função, com um dono só |
| **B** | A herança: demanda sem volume usa a do produto, e a tela diz de onde veio | unitário: herdado vs declarado, e a marca em cada caso |
| **C** | A divergência declarada: demanda que discorda do produto mostra os dois números | E2E: mudar na demanda não muda o produto, e a tela avisa |
| **D** | O PDCA pergunta pela idade do número, e o ajuste é registrado | unitário: volume declarado há mais de N meses vira oportunidade no ciclo |

**A e B são o valor inteiro.** C e D são o que impede o número de virar mentira
silenciosa com o tempo.

## 6. Perguntas em aberto

1. **O pico entra como campo do produto ou fica só como fator do ensaio?**
   Recomendação: **campo do produto** (`picoDe: 5`), porque é fato perene — e o
   `fatorDeVolume` do ensaio continua existindo para a pergunta hipotética.
2. **Qual é o "N meses" que dispara a pergunta do PDCA?** Não tenho número.
   Recomendação: **configurável**, na mesma tela onde a cadência do PDCA já é.
3. **Produto sem volumetria deve aparecer como lacuna?** Recomendação: **não** —
   o §230 vale: nem todo produto tem esse número, e cobrar de todos ensinaria a
   ignorar a cor.

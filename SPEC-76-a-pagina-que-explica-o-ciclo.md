# SPEC-76 — A página que explica o ciclo

> **Origem:** o usuário:
>
> > *"hoje nosso sistema não 'se vende bem'. Precisamos avaliar se é preciso
> > montar uma página de apresentação, talvez prévia ao login, que explique os
> > conceitos gerais — que precisam ser definidos e diagramados de forma muito
> > bonita. O sistema é feito para que a IA possa apoiar todas as partes do ciclo
> > de desenvolvimento […]. Quando penso nisso eu penso em um diagrama com um
> > círculo, interativo, com o mapeamento de valor e objetivos com setas
> > apontando para os stages e a IA contida no meio como um círculo rígido e os
> > desdobramentos explicativos — mas é só uma forma de representar que talvez
> > sirva para buscar alguma referência."*

---

## 0. A medição

A landing atual tem **68 linhas**. O conteúdo inteiro é:

```
h1: "Do diagrama ao backlog, sem inventar nada"
p:  <um parágrafo>
botão: "Entrar"  (× 2)
```

Uma frase e um botão. Para um produto que hoje tem **doze superfícies**, três
motores de medição, PDCA sobre a própria configuração e um documento que
sobrevive à regeneração.

> O diagnóstico do usuário está certo, e a medição o confirma sem margem: a
> página não explica nada porque **não há nada nela**.

## 1. O problema não é design — é que o conceito nunca foi escrito

*"conceitos gerais, que precisam ser definidos"* — a palavra **definidos** é a
parte difícil, e ela vem antes de qualquer pixel.

O produto cresceu por SPECs, cada uma resolvendo um problema real e nomeando a
própria régua. Ninguém nunca escreveu **o todo**: o que é o ciclo, quais são os
estágios, o que a IA faz e o que ela nunca faz, e por que a camada determinística
existe.

Fazer o diagrama antes de escrever isso produziria uma figura bonita sobre um
conceito difuso — e figura bonita sobre conceito difuso é exatamente como um
produto "não se vende bem" **com** página de apresentação.

## 2. O ciclo, como o usuário o descreveu

Ele listou os estágios, e a lista é boa. Transcrita, com uma coluna que o pedido
não tinha e que é a mais importante desta SPEC:

| Estágio | Existe hoje? |
|---|---|
| Captação de informações e regras de negócio/produto, de forma perene | **sim** — contexto do produto, glossário (SPEC-53) |
| Análise de contexto e *design system* | **parcial** — stacks, padrões por componente, campos por tipo |
| Ensaios | **sim** — SPEC-66/68/69/70 |
| Especificação das soluções | **sim** — o documento (SPEC-58) |
| Construção dos itens | **sim** — derivação + esteira de agentes |
| Diagramas técnicos | **sim** — a mesa, e a figura no documento |
| Alterações de especificação assistidas por IA | **sim** — o assistente e a esteira |
| Checklists de processo, técnicos, de testes | **sim** — regras de refinamento |
| Requisitos de volumetria | **técnica sim; de produto não** (ver SPEC-77) |
| Specs para desenvolvimento com IA | **não** — é a SPEC-75 |
| Integração e upload para MCPs | **não** |
| Coleta de oportunidades → ajustes na camada determinística | **sim** — PDCA (SPEC-39/45) |

**Nove de doze existem. Três não.**

## 3. A régua que decide o conteúdo da página

> **A página não pode prometer o que o produto não faz.**

É a mesma régua que o produto aplica a si mesmo em todo lugar — proveniência,
lacuna contável, "sugerido" que não vira fato. Uma landing que desenha doze
estágios como se todos existissem seria o produto violando, na porta de entrada,
a única coisa que ele cobra de todo mundo lá dentro.

Duas saídas honestas, e as duas servem:

- **mostrar só o que existe** — nove estágios já são uma história forte;
- **mostrar o todo com o que ainda não existe visivelmente marcado** — e isso
  tem valor próprio: diz para onde o produto vai.

O que não serve é a terceira: desenhar doze sem distinguir.

## 4. Sobre o diagrama circular

O usuário já disse que é *"só uma forma de representar que talvez sirva para
buscar alguma referência"* — e essa cautela está certa.

**O que a forma circular acerta:** o ciclo **fecha**. A coleta de oportunidades
volta como ajuste na camada determinística, que muda as regras, que mudam o
próximo documento. Esse retorno é o coração do produto (é o PDCA), e um diagrama
linear o perderia.

**O que ela arrisca:** um círculo com doze fatias e setas para o centro é
denso — e denso na primeira tela é a definição de *não se vender bem*. O risco de
trocar "uma frase e um botão" por "um infográfico que ninguém lê" é real.

**A recomendação:** o círculo como **mapa**, não como primeira impressão. A
página abre com a promessa em uma frase, e o diagrama vem logo abaixo, com os
desdobramentos abrindo **ao clique** — que é o que o usuário já intuiu ao dizer
"interativo".

**O centro rígido.** *"a IA contida no meio como um círculo rígido"* é uma
imagem precisa, e ela merece ser o conceito central da página: **a IA está no
meio de tudo, e é contida.** Ela propõe, nunca aplica; sugere, e alguém aceita;
escreve o texto, e nunca a conta. É o que separa este produto de um gerador — e
é a coisa mais difícil de comunicar, porque é uma **ausência** de comportamento.

> Se a página conseguir comunicar só isso, já terá feito o trabalho.

## 5. O que NÃO entra

**Preço, depoimento, logotipo de cliente.** Nada disso existe, e inventar é o
oposto do que o produto defende.

**Vídeo ou animação pesada.** O tour guiado já existe e faz esse papel de dentro
(SPEC-78 o revisa). A landing precisa funcionar em cinco segundos, sem play.

**Reescrever o tour como landing.** São públicos diferentes: a landing fala com
quem **não sabe o que é isto**; o tour, com quem **já entrou**.

## 6. Fatias

| | O quê | Prova |
|---|---|---|
| **A** | O conceito ESCRITO: o ciclo, os estágios, o papel contido da IA, a camada determinística | um texto que alguém de fora lê e explica de volta — sem ver a tela |
| **B** | A página com a promessa e os estágios que EXISTEM, marcando os que não | E2E: a landing cita os nove, e o que não existe está marcado |
| **C** | O diagrama circular, com desdobramento ao clique | E2E: clicar num estágio abre a explicação e leva ao lugar certo depois do login |
| **D** | A prova de que ela não mente | teste que falha se um estágio marcado como existente não tiver rota |

**A antes de tudo, e ela não é fatia de código.** Sem o conceito escrito, B e C
são decoração.

> Para a fatia C: o repositório tem uma *skill* de `dataviz` com paleta validada
> e regras de forma/cor. Usá-la evita que "bonito" vire opinião.

## 7. Perguntas em aberto

1. **A página deve ser pré-login ou também acessível de dentro?** Recomendação:
   **as duas** — quem já usa esquece o todo, e o §251 mostrou três vezes que
   demonstração pela metade custa caro.
2. **O texto é do produto ou do time?** Hoje seria do produto. Se um dia for
   configurável, vira mais uma superfície de config — e isso é uma decisão, não
   um detalhe.
3. **Os três estágios ausentes devem aparecer?** Recomendação: **sim, marcados**
   — dizem para onde o produto vai, e a marca é o que os torna honestos.

# SPEC-119 — A spec como prompt: o leitor final é um agente de código

> **Origem:** o usuário, decidindo a pergunta 2 da SPEC-117 e acrescentando a
> informação que reclassifica tudo:
>
> > *"Acrescenta, sessão específica da spec, é ali que deveria estar a parte
> > das decisões, avalie a engenharia de prompt para que fique adequado, **a
> > idéia é que os devs peguem os itens do jira depois e usem para programar
> > com o claude**"*
>
> Esta SPEC **não implementa nada** — avalia o template atual sob a régua
> nova e propõe a forma.

---

## 0. A régua que muda, e ela reclassifica o artefato inteiro

A SPEC-98 §1 pesquisou SDD e chegou na frase que organizou tudo desde então:

> *"Quando agentes escrevem o código, a spec é a coisa de maior alavancagem que
> um humano pode produzir."*

O produto acreditou nela e construiu a spec **para ser lida**. Seções em prosa,
títulos de documento, contexto antes de tudo — a forma de um artefato que
circula entre pessoas.

**A frase estava certa e a conclusão ficou pela metade.** O percurso completo,
dito agora com todas as letras: a spec sobe anexada ao issue, o dev pega o
issue no Jira, e **entrega o conteúdo a um agente de código**. O último leitor
não é humano.

Isso não torna a leitura humana dispensável — a spec é revisada por gente
**antes** de subir, e é ali que ela ganha autoridade. Mas significa que o
artefato tem **dois consumidores com necessidades diferentes**, e hoje ele foi
desenhado para um só.

---

## 1. Medição: o template de hoje, item a item

```markdown
# {{titulo}}
## Origem                      ← quem pediu, com que palavras
## Contexto                    ← produto + demanda
## O que foi medido            ← apontamentos do motor
## O que NÃO entra             ← recusas
## Fatias                      ← o que fica verdade, e como se prova
## Itens que esta spec cobre   ← a lista de rótulos
```

Contra o que um agente de código precisa, na ordem em que ele precisa:

| O agente precisa saber | Está na spec? | Onde está de verdade |
|---|---|---|
| **O que construir**, concretamente | ⚠️ só o rótulo | no **corpo do item** — outro artefato, no mesmo issue |
| **As restrições que não pode violar** | ❌ **ausente** | as decisões não têm seção nenhuma |
| **Onde mexer** — componente, stack, contratos | ❌ ausente | `techs`/`contextos` do item |
| **Como saber que terminou** | ⚠️ ponteiro | critérios de aceite, no corpo do item |
| **O que NÃO fazer** | ✅ | `recusas` |
| O que já foi apurado sobre o desenho | ✅ | `medicao` |
| Quem pediu | ✅ | `origem` |

**As três primeiras linhas são as mais importantes para quem vai escrever
código, e duas delas estão ausentes.** A quarta é um ponteiro.

---

## 2. A seção que falta: **Decisões** (o pedido explícito)

> *"sessão específica da spec, é ali que deveria estar a parte das decisões"*

### 2.1 A assimetria que o §410 deixou

A rodada §410 fez as decisões alimentarem a spec — mas **só pelo lado
negativo**: a alternativa descartada vira `recusas`. A alternativa **escolhida**,
com o porquê, não entra em lugar nenhum.

Para um humano isso quase se sustenta: quem lê "síncrono ficou fora porque
acopla ao parceiro" infere que ficou fila. **Para um agente de código é
exatamente a informação que falta**: ele precisa saber qual padrão usar, não
qual evitar.

```
hoje:  "❌ Síncrono — fora porque escolhemos Fila: acopla ao parceiro"
falta: "✅ Fila — porque desacopla o pico do parceiro"
```

### 2.2 Por que é seção própria, e não uma linha no contexto

Uma decisão de arquitetura é **restrição de implementação**, e restrição
precisa de posição estrutural. Diluída no contexto, ela lê como pano de fundo —
e um agente trata pano de fundo como opcional.

É também a seção que mais se beneficia de estar na spec em vez de no item: a
decisão é da DEMANDA (ou do componente), não de um item só. Repeti-la em cada
item seria a duplicação que o §323 recusa; tê-la uma vez na spec que todos os
itens carregam é a forma certa.

### 2.3 O que ela carrega

Da `Decisao` aceita, o que serve a quem implementa:

| Campo | Serve para |
|---|---|
| `escolhida` + `porque` | **a restrição**, e a razão que a torna checável |
| `titulo` | o nome pelo qual a decisão é citada |
| `noId`/`arestaId` | **onde** ela vale — é o que impede aplicá-la ao componente errado |
| alternativas descartadas | já vai em `recusas`; aqui entra só como referência cruzada |

---

## 3. A avaliação de engenharia de prompt: sete problemas concretos

### 3.1 O que obriga está no meio do documento

`O que NÃO entra` é a seção mais valiosa para um agente — restrição negativa é
o que impede um modelo de exceder o escopo — e está na **posição 4 de 6**.
Modelos degradam atenção no meio de contextos longos; instruções que obrigam
funcionam melhor cedo **e repetidas no fim**.

### 3.2 `O que foi medido` é ambíguo para quem não sabe o que é o motor

Ali vão violações de padrão e lacunas de propósito — **diagnóstico**. Um agente
de código lê uma lista de problemas e tenta resolvê-los: é literalmente o que
ele foi treinado para fazer. Sem moldura, a seção vira escopo fantasma.

> Falta a frase: *"isto é o que o motor apurou sobre o desenho. Não é tarefa —
> a menos que apareça num item abaixo."*

### 3.3 `Origem` pode ser lida como instrução

*"O time de catálogo pediu na reunião que a consulta respondesse em 2s"* é
rastreabilidade para um humano e **pedido literal** para um agente — que pode
ir implementar aquilo em vez do item. O pedido já foi traduzido em itens; a
origem existe para conferir depois, não para executar.

### 3.4 Ponteiro pendurado nas fatias

O §410 fez a seção derivada dizer *"Prova: os critérios de aceite deste item,
na seção dele"*. Isso pressupõe que o corpo do item viaja junto. **Viaja hoje**
(o issue tem os dois), mas a spec não garante — e um agente que receba só a
spec segue um ponteiro para lugar nenhum.

Ou o formato garante os dois juntos, ou a prova entra na seção. Não pode ficar
implícito.

### 3.5 A spec não diz ao agente o que fazer com ela

Nenhuma linha estabelece o contrato de leitura. Três linhas de abertura —
*"você vai implementar os itens listados; as decisões abaixo são restrições; o
que está em 'o que NÃO entra' está fora do escopo"* — custam quase nada e
mudam o comportamento mais que qualquer reorganização.

### 3.6 Os títulos são prosa, não estrutura

`## O que NÃO entra` é bom para uma pessoa. Para um modelo separando seções
longas, delimitadores explícitos e nomes estáveis ajudam a não misturar. **Sem
virar JSON** — a SPEC-98 §6 recusa *"um formato que só ferramenta abre"*, e a
spec continua sendo revisada por gente.

### 3.7 Nada diz o que é imutável

O agente não tem como saber que `recusas` é inegociável e `contexto` é pano de
fundo. Marcar a força de cada seção é o que permite ao modelo priorizar quando
duas coisas parecem se contradizer.

---

## 4. O que esta SPEC RECUSA

- **Virar prompt de uma ferramenta só.** O artefato é markdown aberto; ele
  precisa servir ao Claude, ao próximo agente, e a quem lê sem agente nenhum.
- **Encher de instrução ao modelo a ponto de o humano não ler.** A spec é
  revisada por gente **antes** de subir, e é dessa revisão que vem a autoridade
  dela (SPEC-80 §2). Uma spec ilegível não é revisada — é aprovada no
  automático.
- **Duplicar o corpo do item dentro da spec** (§323). O que falta é ponteiro
  confiável, não cópia.
- **Deixar o modelo escrever as seções de julgamento.** A trava da SPEC-80
  fatia D não se mexe: melhorar a spec como prompt é sobre FORMA, e o
  julgamento continua sendo de gente.

---

## 5. Fatias

- **A — a seção `Decisões` existe no template.** Derivada das decisões aceitas,
  pelo lado positivo (§2). **Prova:** uma demanda com 2 decisões aceitas produz
  2 restrições nomeadas, com o componente onde valem — e o que foi descartado
  continua em `recusas`, sem repetição.
- **B — cada seção declara a sua força.** Restrição, escopo, diagnóstico,
  contexto. **Prova:** a spec diz, em uma linha por seção, o que aquilo obriga.
- **C — o bloco de abertura** (§3.5): o contrato de leitura, três linhas.
- **D — a moldura do `medicao` e da `origem`** (§3.2, §3.3): as duas seções
  que um agente pode confundir com tarefa passam a dizer o que são.
- **E — a ordem muda, e as restrições se repetem no fim** (§3.1).
- **F — o ponteiro das fatias vira garantia** (§3.4): ou o payload leva os dois
  juntos e a spec afirma isso, ou a prova entra na seção.
- **G — certificar contra o consumidor real.** Pegar a spec de uma demanda de
  verdade, entregar a um agente de código e medir o que ele faz com ela. É a
  única fatia que prova as outras — e é a régua desta casa: sem o teste contra
  o real, o defeito sobrevive.

---

## 6. Perguntas em aberto

1. **A `medicao` deveria simplesmente sair da spec que vai ao issue?** Ela é
   apuração sobre o DESENHO, e quem implementa um item não age sobre ela. Se o
   valor dela é para quem revisa antes de subir, talvez o lugar seja o
   documento — e a spec do issue fica mais curta e menos ambígua.
2. **A spec por item deveria carregar o contrato do componente** (endpoints,
   campos, techs)? Hoje está no corpo do item. Para o agente, ter tudo num
   artefato só reduz o risco do §3.4 — mas aumenta a duplicação que o §323
   recusa.
3. **Quanto da instrução ao modelo é aceitável antes de a spec ficar ruim de
   ler?** É a tensão do §4, e ela só se resolve olhando a spec pronta.
4. **O template é configurável (SPEC-80) — a reorganização vale para quem já
   customizou o dele?** As variáveis novas precisam de aviso, não de
   substituição silenciosa: `problemasDoTemplateSpec` já avisa o que falta, e
   é onde isso se encaixa.

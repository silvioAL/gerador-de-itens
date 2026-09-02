# SPEC-100 — Um documento só, e agnóstico: importar, desenhar, devolver

> **Origem:** o usuário, ao notar dois vocabulários no produto:
>
> > *"no sistema temos algumas partes que falam de ADR, outras de design doc.
> > Avalie se faz sentido ter essa duplicidade, são a mesma coisa? E quando o
> > time precisar tratar mudanças menores? Vamos discutir sobre isso, pesquise,
> > estamos fazendo uma ferramenta integrada a IA."*
>
> E a decisão, na mesma conversa:
>
> > *"entendo que o sistema deve ser agnóstico. Podemos chamar de design doc,
> > pois cada empresa tem sua terminologia e processo. O que importa é poder
> > importar um documento do Confluence para trabalhar e desenhar, e no output
> > ter o design doc que ela já produz, e specs."*

---

## 0. A medição: não era duplicidade, era hierarquia — e mesmo assim ele tem razão

| O que existe | O que é | Onde |
|---|---|---|
| `Decisao` | **ADR quase termo a termo**: `titulo · contexto · alternativas · escolhida · porque · status · substituidaPor · autor · em`, ancorada em nó, aresta ou na quebra | `engine/src/model/types.ts` |
| `DocumentoDeDesenho` | o documento inteiro — e ele **contém** `decisoes: Decisao[]` | `engine/src/documento/estruturarDocumento.ts` |

**Não são cópias: são conteúdo e continente.** O design doc já carrega as decisões
no topo, uma vez (§242).

**Mas a percepção de duplicidade é real, e vem de outro lugar:** o produto tem
**dois caminhos de saída** — `escritorDeAdr` (para o repositório de ADR da casa) e
`publicadorDeDocumento` (para a base de conhecimento). Quem olha a configuração vê
dois destinos, dois vocabulários, e a pergunta *"não é a mesma coisa?"* é a
pergunta certa.

---

## 1. O que o mercado distingue, pesquisado

| | O que faz | Tamanho |
|---|---|---|
| **RFC** | **explora** uma decisão ainda aberta: várias opções, impacto entre times | 1–5 páginas |
| **ADR** | **registra** uma decisão já tomada: contexto, alternativas, razão | **10–20 minutos para escrever** |
| **Design doc** | descreve **como** implementar em detalhe | o documento da solução |

A sequência canônica: **RFC → (aceito) → design doc + vários ADRs**.

E o alerta que vale para nós:

> *"Se o seu RFC sempre tem uma resposta óbvia e ninguém propõe alternativas
> reais, você está escrevendo um Design Doc com rótulo de RFC. Nenhum dos dois é
> errado — só seja honesto sobre qual está fazendo."*

**A régua dos 10–20 minutos** diz algo útil sobre o formato: um ADR já nasceu para
ser leve, e se está pesado, o escopo está grande demais para um registro só.

### 1.1 ⚠️ Mas a pergunta das "mudanças menores" tem resposta melhor, e é do produto

> Correção do usuário, e ela desfaz a premissa da minha primeira resposta:
>
> > *"quanto às alterações serem pequenas: isso é traduzido no desenho.
> > Geralmente as pessoas falam de pequenas alterações **com esse tom**, mas o
> > sistema resolve isso dando **a proporção que a alteração tiver**, e com as
> > quebras padronizadas evita a armadilha de falar que é pouco e na realidade
> > ter mais coisas."*

Eu tinha tratado *"mudança menor"* como uma **categoria de entrada** — algo que a
pessoa declara e que o processo precisa acomodar com um formato mais leve.

**É o contrário.** *"É só uma mudancinha"* é uma afirmação **sem medida**, dita em
tom, antes de alguém olhar. E é a origem da armadilha mais comum de estimativa:
o tamanho é subestimado justamente porque **ainda não foi decomposto**.

> **Neste produto o tamanho não é declarado — é derivado.** Você desenha, o motor
> deriva, e **o número de itens é a resposta**. A proporção sai do dado, e não do
> tom de quem pediu.

E a padronização é o que dá sentido à comparação: como a derivação é
determinística e a configuração é da organização (SPEC-94 §6.1), **dois desenhos
equivalentes produzem quebras equivalentes** — então "pequeno" e "grande" passam a
significar a mesma coisa entre times, em vez de refletirem quem fala.

#### O que isso muda nesta SPEC

O §3.2 abaixo continua valendo — o custo de **redigir** caiu com a IA. Mas a
pergunta *"mudança pequena merece registro?"* estava **mal colocada**: não há
formato leve e formato pesado a escolher na entrada.

**O que decide é a proporção medida**, e ela aparece depois do desenho. Uma
alteração que derivou dois itens e não moveu decisão nenhuma não precisa de nada;
uma que se anunciou pequena e derivou onze **acabou de se explicar sozinha** — e é
exatamente esse o momento em que o produto tem algo a dizer que ninguém tinha
antes.

---

## 2. A decisão: agnóstico no NOME, estruturado no DADO

O usuário decidiu chamar tudo de **design doc**, porque cada empresa tem a sua
terminologia. **Está certo, e vale precisar onde a decisão se aplica** — porque
há uma parte que não pode ser afrouxada junto.

| | Decisão |
|---|---|
| **O nome na tela** | **agnóstico.** Uma empresa chama de *design doc*, outra de *documento de solução*, outra de *technical spec*. O produto não impõe vocabulário, e idealmente **o rótulo é configurável** |
| **A estrutura do dado** | **continua.** `Decisao` com alternativas, escolhida e porquê **não é um sinônimo de documento** — é uma peça dentro dele, e é a peça de maior valor |

> **Por que a segunda metade não pode ser afrouxada:** se "tudo vira design doc"
> apagar a `Decisao` como estrutura, o produto perde exatamente o que o §3 mostra
> ser o mais valioso numa ferramenta integrada a IA. Agnóstico é o rótulo, não o
> modelo.

### 2.1 O que muda na prática

- **Um destino de saída, não dois.** O ADR deixa de ter caminho próprio na
  configuração: o design doc sai, e as decisões vão dentro dele. Quem quiser o
  repositório de ADR separado configura um segundo destino de documento — mas o
  produto não impõe a separação.
- **A palavra "ADR" sai da interface.** Fica nos comentários de código, onde ela
  é precisa e útil para quem mantém.
- **O que entra continua podendo ser ADR.** A leitura (`leitorDeAdr`) é de um
  repositório que **é da casa e tem o formato da casa** — ali o nome é deles, e
  respeitá-lo é o próprio agnosticismo.

---

## 3. O que muda porque é uma ferramenta integrada a IA

O usuário pediu esse ângulo, e a pesquisa devolveu um argumento mais forte do que
eu esperava.

### 3.1 O agente esquece, e "razoável" não é "decidido"

> *"Agentes de IA não lembram nenhuma decisão anterior: modelos são **stateless**,
> e toda sessão começa do zero. Quando um segundo agente — ou o mesmo, uma semana
> depois — encontra o código, ele lê o resultado **sem ideia de que uma decisão
> foi tomada**, e alegremente a muda."*

E a consequência, que é a frase que melhor descreve a tese deste produto vinda de
fora:

> *"Se as suas razões não estão onde o agente olha, ele não pode respeitá-las —
> ele vai fazer algo **razoável**. E razoável não é a mesma coisa que
> **decidido**."*

Mais: *"contexto sozinho não previne deriva arquitetural — um agente que produz
código plausível e funcional rápido vai produzir código plausível, funcional e
**inconsistente** com a mesma velocidade, a menos que algo o prenda às decisões
registradas."*

### 3.2 A consequência para o desenho, e ela inverte a economia

**Antes da IA:** escrever um registro de decisão era caro (tempo de gente), então
reservava-se ao que era grande. Mudança pequena não valia o formulário — daí a
pergunta do usuário sobre mudanças menores.

**Com IA:** o custo de **redigir** cai perto de zero — a IA escreve o texto a
partir do que o motor já sabe. O que **não** cai é o custo de **decidir**, e é
justamente a parte indelegável (SPEC-80 §2).

> **Isso permite a granularidade descer.** Uma mudança menor pode ter registro
> porque registrar ficou barato — desde que **a escolha e o porquê continuem de
> gente**. Se a IA decidir e registrar, o registro vira uma alucinação com
> carimbo, que é pior que registro nenhum.

### 3.3 E aqui o produto tem algo que um repositório de ADR não tem

Um ADR em markdown num repositório é **texto solto**: o agente precisa achá-lo,
lê-lo e escolher respeitá-lo.

Aqui a decisão é **ancorada** — `noId`/`arestaId` —, tem **status** e
`substituidaPor`, e viaja **junto do item** que a implementa. Quando o agente
recebe o item, o *porquê* vem no mesmo payload que o *o quê*.

> É a diferença entre *deixar a razão disponível* e *entregá-la junto do
> trabalho*. A pesquisa diz que o problema é a razão não estar onde o agente
> olha; o produto pode colocá-la exatamente ali.

---

## 4. A jornada que o usuário descreveu

> *"importar um documento do Confluence para trabalhar e desenhar, e no output ter
> o design doc que ela já produz, e specs."*

```
  documento da casa  ──importa──▶  desenho na mesa  ──▶  design doc + specs
     (Confluence)                   (o trabalho)          (de volta à casa)
```

**As duas pontas já existem em parte:**

| Ponta | Estado |
|---|---|
| **Importar** | `leitorDeAdr` e `leitorDeArquiteturaDeNegocio` leem do gateway. **Falta ler um documento por link** — a frente (3) das cinco |
| **Devolver** | `publicadorDeDocumento` publica, e o §348 acabou de dar a ele o **espaço** de destino |

**O que falta é o meio da primeira ponta:** hoje a leitura é de *tipos* de coisa
(ADR, arquitetura de negócio). O usuário quer **um documento qualquer, por link** —
o que é mais simples e mais geral.

### 4.1 O risco desta jornada, e ele é o de sempre

Importar um documento e transformá-lo em desenho é **interpretação**, e a IA vai
interpretar. A régua que já existe vale inteira: **o que vem de fora chega como
proposta marcada**, e nada vira desenho sem alguém confirmar (`Origem` já
distingue `importado` de `manual`).

E vale a régua da SPEC-30 para o print: **o aviso de saída de dados não some**. Um
documento de Confluence tem, em média, mais informação sensível que um print.

---

## 5. O que esta SPEC RECUSA

- **Apagar `Decisao` como estrutura.** Agnóstico é o rótulo; alternativas +
  escolhida + porquê é o dado que dá valor ao resto (§3).
- **Impor vocabulário.** O produto não decide se a casa chama de *design doc*,
  *documento de solução* ou *technical spec*.
- **Dois destinos obrigatórios.** Quem quiser separar ADR do documento configura;
  o produto não obriga.
- **Deixar a IA decidir e registrar.** Registro barato só vale enquanto a escolha
  for de gente — senão é alucinação com carimbo.
- **Importar direto para o desenho, sem confirmação.** O que vem de fora é
  proposta marcada.
- **Traduzir o repositório da casa.** Se ele se chama ADR, é ADR na leitura — o
  nome de lá é dele.

---

## 6. Fatias

- **A — o vocabulário na interface.** "ADR" sai da tela; o rótulo do documento
  vira configurável, com *"Design doc"* de fábrica. **Prova:** varredura na
  interface não acha a sigla; o rótulo configurado aparece onde o documento é
  citado.
- **B — um destino de saída, não dois.** As decisões saem dentro do documento; o
  destino de ADR deixa de ser obrigatório. **Prova:** publicar leva as decisões
  junto; quem tinha dois destinos configurados continua funcionando.
- **C — importar documento por link** (a frente 3 das cinco). **Prova:** o
  documento vira proposta marcada como importada, e nada entra no desenho sem
  confirmação.
- **D — a decisão viaja com o item.** O *porquê* no mesmo payload que o *o quê*,
  quando o item sobe. **Prova:** o item exportado carrega as decisões que o
  sustentam. **É a fatia de maior valor do §3**, e a que nenhum repositório de ADR
  em markdown consegue.

> **Corte:** **A+B** numa rodada (é vocabulário e configuração, e destrava a
> confusão que originou esta SPEC), **C** na seguinte (é a frente que já estava na
> fila), **D** por último — ela depende da SPEC-98, que desenhou como o item sobe.

---

## 7. Perguntas em aberto

1. **O rótulo é por organização ou por time?** A terminologia costuma ser da
   empresa, não do time. **Recomendação:** organização, com o mesmo formato de
   configuração dos outros documentos.
2. ~~**Mudança menor merece decisão registrada?**~~ **Mal colocada — ver §1.1.**
   Não há formato leve e pesado a escolher na entrada: **o tamanho é derivado, não
   declarado**. A pergunta que sobra é outra, e é boa: **o produto deveria dizer
   em voz alta quando a proporção contraria o tom?** *"Você chamou de ajuste
   pequeno; o desenho derivou onze itens e moveu duas decisões."*

   **Recomendação: sim, e é barato** — os dois números já existem no fim da
   derivação. Mas o texto precisa de cuidado: informar, nunca repreender. Uma
   ferramenta que parece estar corrigindo quem pediu é uma ferramenta que a
   pessoa deixa de usar para pedir.
3. **O que fazer com quem já configurou destino de ADR?** Ele continua valendo — a
   fatia B tira a obrigatoriedade, não o recurso.
4. **Importar documento por link exige que ele esteja em markdown?** Um Confluence
   devolve HTML ou storage format. **Recomendação:** o gateway devolve texto, e o
   que ele lê do outro lado é problema dele — a mesma fronteira do §348.

---

## 8. Para quem implementar

- `packages/engine/src/model/types.ts` — `Decisao`, e por que a estrutura fica.
- `packages/engine/src/documento/estruturarDocumento.ts` — o documento que já
  contém as decisões.
- `packages/aplicacao/src/portas/` — `leitorDeAdr`, `escritorDeAdr`,
  `publicadorDeDocumento`: os dois caminhos que a fatia B unifica.
- `SPEC-81` — as quatro operações do gateway, e a quinta (escrever ADR de volta).
- `SPEC-98` — como o item sobe, de que a fatia D depende.
- `SPEC-57` — a decisão que nasce de escolha entre alternativas, e a régua que
  impede isto de virar wiki.

### As fontes da pesquisa

- ADR × RFC × design doc, e quando usar cada um — <https://newsletter.pragmaticengineer.com/p/rfcs-and-design-docs> · <https://candost.blog/adrs-rfcs-differences-when-which/>
- A régua dos 10–20 minutos para um ADR — <https://askmoai.com/blogs/adr-vs-rfc>
- **ADRs para agentes de IA: o agente é stateless e "razoável não é decidido"** — <https://www.braingrid.ai/blog/architecture-decision-records-for-ai-coding-agents>
- Como agentes de código usam ADRs — <https://mnemehq.com/insights/how-ai-coding-agents-use-adrs/>
- AGENTS.md × ADR, e o que muda na documentação de arquitetura — <https://ai.gopubby.com/agents-md-is-the-ew-architecture-decision-record-adr-3cfb6bdd6f2c>

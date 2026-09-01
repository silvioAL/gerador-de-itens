# SPEC-98 — A spec que o agente consome: estrutura, saída e lotes

> **Origem:** o usuário, olhando a tela de spec que encontrou pelo menu:
>
> > *"através do menu cheguei nessa tela, ela não está no tour e não entendi como
> > ela se conecta com o resto do sistema, pode ter sido feita devido algum
> > equívoco. Estávamos falando em gerar specs para upload do MCP, mas isso já
> > está razoável nos itens, bastaria organizar."*
> >
> > *"mas essas specs já existem em Documento de desenho, acredito que bastaria
> > revisarmos a estrutura delas, entendo que precisam ser machine readable ou
> > markdown. Pesquise boas práticas de Spec driven design. E também precisamos
> > pensar na integração com o backend/MCP nesse sentido, pois aparece para mim
> > ali apenas a opção de baixar o markdown, e a ideia é que seja possível fazer
> > o upload e geração dos itens. É possível que exista limitação de tokens,
> > então esse processo deve ser feito em lotes pequenos, e com feedback muito
> > bonito e animado ao usuário."*

---

## 0. O que foi medido antes de propor

| O que | Estado |
|---|---|
| A tela de spec (`#/spec`) está no tour? | ❌ **Não.** A única ocorrência de "spec" em `useTour.ts` é uma frase sobre preâmbulo |
| O ciclo promete o estágio *"Gerar specs para construir com IA"*? | ✅ **Sim, como `completo`**, com rota para a tela |
| O que a tela oferece de saída? | **Só `baixar-spec`** — download do markdown |
| Os **itens** têm caminho de saída? | ✅ `POST /quebras/:id/itens/exportar` → agente/MCP configurável (SPEC-49) |
| A spec tem esse caminho? | ❌ **Não** |

**O primeiro e o último são o problema, e o segundo é o que os torna graves:** a
landing anuncia um estágio completo, o percurso guiado nunca passa por ele, e o
artefato que ele produz não tem para onde ir.

### 0.1 A observação do usuário está certa — e não é equívoco de implementação

*"Essas specs já existem em Documento de desenho."* Confere: o item dentro do
documento já traz história de usuário, tabela de campos **com proveniência**,
endpoints, checklist e cenários — é conteúdo estruturado e rico.

A tela de spec **não foi um equívoco**: a SPEC-84 a construiu porque a SPEC-80
tinha entregue o motor inteiro (`gerarSpec`, `coberturaDaSpec`, a trava do que a
IA não escreve) e **zero consumidores**. Ela foi a porta.

**Mas o julgamento do usuário sobre o resultado vale mais que a intenção do
desenho:** se o dono do produto chega nela e não vê como se conecta, ela falhou no
que se propôs. E a saída que ele aponta — *"bastaria organizar"* — é a certa: o
problema não é falta de conteúdo, é **estrutura e destino**.

---

## 1. Boas práticas de Spec-Driven Development, pesquisadas

O usuário pediu a pesquisa. O que o mercado consolidou até 2026:

### 1.1 A definição que mudou

> *"Em 2026, SDD é melhor entendido não como uma ferramenta, mas como uma
> disciplina: **quando agentes escrevem o código, a spec é a coisa de maior
> alavancagem que um humano pode produzir**."*

E a estrutura canônica é uma **cadeia**, não um documento:

```
spec  →  plano técnico  →  tarefas atômicas  →  código
```

**O produto já tem duas pontas dessa cadeia** — o desenho medido é o plano, os
itens derivados são as tarefas atômicas. O que falta é a spec dizer isso na forma
que um agente espera.

### 1.2 GitHub Spec Kit — a implementação de referência

Aberta pela GitHub em setembro de 2025: um CLI (`specify`) mais **templates** que
definem o que é uma spec, o que é um plano técnico, e como isso se quebra em
tarefas que um agente executa. Funciona com Claude Code, Copilot, Cursor, Codex,
Gemini CLI, Windsurf.

**O que vale copiar:** que a spec seja **arquivo versionado com estrutura
previsível**, e não prosa livre. O que **não** vale: adotar o CLI deles — o nosso
gerador de spec já existe e sai do dado.

### 1.3 EARS — e é aqui que "machine readable" tem resposta

**Easy Approach to Requirements Syntax** (Alistair Mavin, Rolls-Royce, IEEE RE'09):
cinco padrões de frase que tornam um requisito **testável sem virar JSON**.

| Padrão | Forma | Quando |
|---|---|---|
| **Ubíquo** | *O sistema deve …* | vale sempre |
| **Dirigido por evento** | *Quando ‹gatilho›, o sistema deve …* | dispara com algo |
| **Dirigido por estado** | *Enquanto ‹estado›, o sistema deve …* | vale durante |
| **Comportamento indesejado** | *Se ‹condição›, então o sistema deve …* | erro, falha, exceção |
| **Opcional** | *Onde ‹recurso está ativo›, o sistema deve …* | só com o recurso |

> **É a resposta exata para *"machine readable ou markdown"* — porque é os dois.**
> Continua sendo markdown que uma pessoa lê; e a sintaxe é regular o bastante para
> uma máquina parsear, verificar e derivar teste. Nada de formato binário, nada de
> schema que só ferramenta abre.
>
> E há precedente: o Spec Kit tem pedido aberto para integrar EARS.

**Onde isso encosta no produto:** os **critérios de aceite** dos itens
(`CHAVE_CRITERIOS_ACEITE`) são hoje texto livre escrito pela IA. Em EARS, eles
viram verificáveis — e a régua da casa passa a poder cobrar a forma, como já cobra
contraste.

### 1.4 O verificador separado

> *"O padrão mais subutilizado em SDD é designar um agente separado para conferir
> o trabalho, em vez de confiar que o agente implementador se auto-verifique."*

Coordinator → Implementors (cada um com sua sub-spec) → **Verifier**.

**Isto é a tese do produto dita por outra boca.** O motor já é o verificador que
não implementa: ele mede, aponta e não escreve. A spec que sai daqui pode carregar
**o que verificar** — e é aí que a lacuna contável e as checagens viram material
de agente, em vez de tela.

---

## 2. A estrutura da spec, revisada

A atual (`TEMPLATE_SPEC_PADRAO`) tem seis seções: Origem · Contexto · O que foi
medido · O que NÃO entra · Fatias · Itens que esta spec cobre.

**A crítica do usuário não é que falte conteúdo — é que ele já existe no
documento.** Então a revisão não acrescenta seções: ela decide **o que a spec
carrega por valor e o que ela referencia**, e dá forma previsível ao que sobra.

| Seção | Hoje | Proposto |
|---|---|---|
| **Origem** | texto livre | mantém — é julgamento humano, e a SPEC-80 §2 a declara indelegável |
| **Contexto** | prosa do produto | **encolhe**: o essencial, e um ponteiro para o documento |
| **O que foi medido** | prosa | **vira lista verificável** — cada medição com a régua e o valor |
| **O que NÃO entra** | texto livre | mantém — indelegável |
| **Fatias** | texto livre | **ganha forma**: cada fatia com *o que fica verdade* e *como se prova* |
| **Itens cobertos** | lista de rótulos | **vira a carga**: o corpo do item, que é o que o agente precisa |
| **Critérios** ✨ | não existe como seção | **EARS**, derivado dos critérios dos itens |

> **A régua que decide o que entra:** *a spec carrega o que o agente precisa para
> construir; referencia o que uma pessoa precisa para decidir.* Duplicar o
> documento inteiro faria a spec envelhecer em separado dele — o defeito que o
> §323 mediu na landing, agora entre dois artefatos.

---

## 3. A saída: upload e geração, não só download

> *"aparece para mim ali apenas a opção de baixar o markdown, e a ideia é que seja
> possível fazer o upload e geração dos itens"*

### 3.1 O caminho já existe, para o outro artefato

A SPEC-49 construiu para os **itens**: `POST {endpoint}` com `{ itens: [...] }`
para um **agente configurável** — MCP bridge, n8n, função interna. O produto não
fala Jira; fala com quem fala.

**A spec não tem esse caminho, e não há razão técnica para não ter.** O adaptador,
a configuração do destino e o tratamento de erro por item já existem e são
reaproveitáveis.

### 3.2 ⚠️ São DUAS chamadas, e não uma

> Correção do usuário, e ela desfaz uma mistura que a primeira escrita fez:
>
> > *"precisa entender que talvez faça sentido não misturar as coisas: uma coisa
> > é a história que vai subir, e depois provavelmente precisa de outra chamada
> > para anexar a spec."*

**Ele está certo, e a razão é dura, não estilística.** São duas operações com
naturezas diferentes:

| | **Subir a história** | **Anexar a spec** |
|---|---|---|
| O que cria | o issue no tracker | um anexo/comentário **num issue que já existe** |
| Precisa de quê | o item pronto | **a chave que a primeira chamada devolveu** |
| Tamanho | pequeno — cabe numa chamada | grande — é o que exige lote (§4) |
| Quem consome | o tracker | o agente de código, ou quem lê o issue |
| Se falhar | o issue não existe | **o issue existe sem a spec** |

**A dependência é sequencial e não tem volta:** não há o que anexar antes de o
issue existir. Tratar as duas como uma chamada só seria inventar uma transação
que o destino não oferece — e a SPEC-49 já aprendeu essa lição no plural
(*"falha é por item, nunca tudo-ou-nada"*).

#### O estado que nasce daí, e ele precisa ser visível

A combinação nova é **"história subiu, spec não"**. Ela não é erro nem sucesso:

> Um item exportado **sem** a spec anexada é um issue que existe e está incompleto
> para quem vai construir. Se a tela mostrar só "exportado", ela mente pelo mesmo
> mecanismo que o placar do §276 mentia: **somando dois estados diferentes num
> rótulo só.**

Então o rastro cresce de um campo para dois — *o issue existe* e *a spec chegou* —
e a tela diz os dois. É o que permite **reenviar só o que falta**, em vez de
repetir a exportação inteira e arriscar duplicar issue.

#### E isso muda o §4

O lote deixa de ser um problema do envio inteiro e passa a ser **da segunda
chamada apenas**. A primeira é curta por natureza: um item pronto é pequeno. Quem
estoura contexto é a spec — e agora ela é fatiável sozinha, sem arrastar a criação
do issue junto a cada tentativa.

> **Consequência prática boa:** uma falha de token na spec **não desfaz** o issue
> criado. Antes, com uma chamada só, ou se tentava tudo de novo ou se aceitava
> duplicar.

### 3.3 As três regras que a SPEC-49 já provou, e valem aqui

1. **Só sai o que está pronto.** Item com `✍️ especificar` não vira issue
   meia-boca — e spec com lacuna não vira instrução para agente. A contagem de
   lacunas já está na tela.
2. **Falha é por item, nunca tudo-ou-nada.** Quem foi, foi; quem falhou diz por
   quê e continua disponível.
3. **Reenviar não duplica.** O rastro `chave → link` sobrevive à regeneração.

---

## 4. Os lotes, e por que eles não são detalhe de implementação

> *"é possível que exista limitação de tokens, então esse processo deve ser feito
> em lotes pequenos"*

**A restrição é real e é de projeto.** Uma spec com trinta itens, cada um com
tabela de campos, endpoints e cenários, não cabe numa janela de contexto — e o
modo de falha é o pior possível: **o agente recebe a spec truncada e constrói o
que leu**, sem saber que faltou metade.

### 4.1 O que o lote precisa garantir

| Régua | Por quê |
|---|---|
| **O lote é fatiado por ITEM, nunca no meio de um** | meio item é a truncagem com outro nome |
| **Cada lote carrega o contexto mínimo** | um item sem o contexto do produto vira instrução ambígua — e ambiguidade é o que o SDD existe para remover |
| **A ordem respeita as dependências** | `resolverDependencias` já existe, e mandar o item que depende antes do que ele depende é pedir retrabalho ao agente |
| **O resultado é por lote, e o parcial fica** | mesma régua da SPEC-49: nunca tudo-ou-nada |
| **O tamanho é configurável, e tem padrão declarado** | limite de token varia por modelo; fixar no código seria escolher o modelo dos outros |

### 4.2 A pergunta que precisa ser respondida antes de construir

**Quem estima o tamanho?** Contar token exige o tokenizador do modelo de destino,
que não temos. As saídas honestas:

- **estimar por caracteres**, com margem, e dizer que é estimativa;
- **deixar o número de itens por lote configurável**, e começar pequeno;
- **deixar o destino recusar** e tratar a recusa como sinal para reduzir o lote.

**Recomendação: as três, nessa ordem.** A terceira é a única que aprende — e é a
que transforma um palpite em medição.

---

## 5. O feedback: "bonito e animado", com a régua da casa

> *"com feedback muito bonito e animado ao usuário"*

O pedido é legítimo e tem um risco conhecido nesta casa. A régua da SPEC-85 §2:
**movimento que não carrega informação que o estático não carrega, não entra.**

Aqui ele carrega, e é fácil dizer o quê:

| O que a animação mostra | Por que não é enfeite |
|---|---|
| **em que lote está**, de quantos | é a única informação que responde *"quanto falta"* |
| **o item atravessando** para o destino | envio em lote é lento e opaco; sem isso a tela parece travada |
| **o que já chegou fica marcado** | o parcial é resultado, não estado intermediário — e a pessoa pode parar sabendo o que foi |
| **a falha para o lote e diz qual** | erro que passa correndo numa animação é erro escondido |

**E o que ela NÃO pode fazer:** barra de progresso falsa. Se a estimativa de lotes
for um palpite (§4.2), a barra precisa dizer que é — ou ser substituída por
contagem real (*"lote 3 de 7"*), que é honesta por construção.

> Já existe precedente do que funciona: o `OPassoContido` mostra a proposta indo
> até o portão e **parando**. Movimento com significado, não decoração — e a
> guarda de `prefers-reduced-motion` do §328 continua valendo.

---

## 6. O que esta SPEC RECUSA

- **Duplicar o documento dentro da spec.** Dois artefatos com o mesmo conteúdo
  divergem no primeiro que alguém editar (§323).
- **Um formato que só ferramenta abre.** *"Machine readable"* aqui é markdown com
  sintaxe regular (EARS), não JSON que ninguém revisa em diff.
- **Adotar o CLI do Spec Kit.** O gerador já existe e sai do dado; trocar por uma
  ferramenta externa jogaria fora a proveniência.
- **Botão de "✦ escrever para mim" nas seções de julgamento.** Origem, recusas e
  fatias continuam indelegáveis (SPEC-80 §2), e há teste que falha se virarem
  preenchíveis por modelo.
- **Enviar spec com lacuna.** Mesma régua do item: o que não está pronto não sai.
- **Barra de progresso que estima sem dizer que estima.**
- **Misturar a criação do issue com o anexo da spec** (§3.2). São duas chamadas,
  e juntá-las inventaria uma transação que o destino não oferece.
- **Chamar de "exportado" o item cuja spec não chegou.** É somar dois estados num
  rótulo só — o mesmo mecanismo pelo qual o placar do §276 mentia.
- **Manter a tela fora do tour** — se o ciclo promete o estágio, o percurso passa
  por ele. É a régua da SPEC-76 aplicada à navegação.

---

## 7. Fatias

- **A — a estrutura revisada.** O template ganha os critérios em EARS e a carga do
  item; o contexto encolhe para ponteiro. **Prova:** a spec de um desenho real
  contém o corpo dos itens cobertos, e nenhuma seção duplica o documento.
- **B — EARS nos critérios de aceite.** Um validador que reconhece os cinco
  padrões e aponta o que não casa. **Prova:** critério fora de padrão vira aviso
  — nunca erro, porque a régua nasce como sugestão (a mesma escada da SPEC-63).
- **C — a saída em DUAS chamadas** (§3.2). Subir a história, e **depois** anexar a
  spec ao issue criado. **Prova:** o rastro tem dois campos, não um; um item com
  issue e sem spec aparece como tal, e reenviar manda **só o que falta** — sem
  duplicar issue.
- **D — os lotes, só na segunda chamada.** Fatiamento por item, ordem por
  dependência, tamanho configurável. **Prova:** um desenho grande produz N lotes,
  nenhum item é partido, a ordem respeita `resolverDependencias`, e **uma falha
  de token não desfaz o issue já criado**.
- **E — o feedback animado.** **Prova:** a contagem exibida é real; e o teste de
  movimento reduzido continua verde.
- **F — a tela entra no tour.** **Prova:** a trava do §332 (o tour não aponta para
  área morta) passa a cobrir a spec.

> **Corte sugerido:** **A+B** numa rodada (é a estrutura, e ela decide o resto),
> **C+D** na segunda (é a integração), **E+F** na terceira.

---

## 8. Perguntas em aberto

1. **A tela de spec sobrevive à revisão?** O usuário levantou que *"bastaria
   organizar"* nos itens. Se a spec virar uma **saída do documento** em vez de uma
   tela própria, a fatia F muda de sentido — e o estágio do ciclo apontaria para o
   documento. **Recomendação:** decidir isto **antes** da fatia A, porque ele
   define onde o trabalho mora. É pergunta de produto, e é do usuário.
2. **EARS em português.** Os cinco padrões são ingleses (*shall*, *when*,
   *while*). Traduzir mantém a regularidade? *"deve"*, *"quando"*, *"enquanto"*,
   *"se… então"*, *"onde"* parecem funcionar — mas isso precisa ser testado com
   critérios reais antes de virar régua.
3. **O agente do destino é o mesmo dos itens?** A SPEC-49 configura um endereço
   para itens. Spec e item podem ir para destinos diferentes (o item para o
   tracker, a spec para o agente de código). **Recomendação:** destino próprio,
   com o mesmo formato de configuração — e o §3.2 reforça, porque **são duas
   chamadas de qualquer forma**: nada obriga as duas a saírem pelo mesmo lugar.

5. **O anexo é anexo, comentário ou campo?** Depende do tracker, e é justamente o
   que o produto não deve saber (a régua da SPEC-49: *o gerador não fala Jira*).
   **Recomendação:** a segunda chamada manda `{ chaveExterna, conteudo }` e **o
   agente decide a forma** — se vira attachment, comentário ou custom field é
   problema de quem fala o protocolo, e essa é a fronteira que já existe.
4. **Quem consome a spec do outro lado?** Nunca medimos. Se for um agente de
   código, EARS ajuda muito; se for uma pessoa lendo no repositório, a prioridade
   muda. **Isto é o que mais falta**, e é a mesma lacuna da recomendação geral: o
   produto ainda não foi usado ponta a ponta por alguém de fora.

---

## 9. Para quem implementar

- `packages/engine/src/especificacao/gerarSpec.ts` — `TEMPLATE_SPEC_PADRAO`,
  `coberturaDaSpec`, `SECOES_DE_JULGAMENTO`.
- `packages/engine/src/especificacao/gerarItensDeTrabalho.ts` — o corpo do item,
  que é a carga da fatia A.
- `packages/engine/src/dependency/dependencias.ts` — `resolverDependencias`, a
  ordem dos lotes.
- `packages/aplicacao/src/portas/exportadorDeItens.ts` e `SPEC-49` — o caminho de
  saída que já existe e se reaproveita.
- `packages/web/src/spec/SpecScreen.tsx` — a tela, e o único botão que ela tem.
- `packages/web/src/demo/useTour.ts` e `ciclo.ts` — o estágio prometido e o tour
  que não passa por ele.
- `SPEC-80` §2 — o que a IA não pode escrever. A fatia A não pode afrouxar isso.

### As fontes da pesquisa

- **GitHub Spec Kit** — <https://github.com/github/spec-kit> · <https://github.github.com/spec-kit/>
- SDD em 2026, o que é e como os times usam — <https://dev.to/krlz/spec-driven-development-in-2026-what-it-is-the-tooling-and-how-teams-actually-use-it-2fk2>
- **EARS**, guia oficial de Alistair Mavin — <https://alistairmavin.com/ears/>
- EARS, os cinco padrões — <https://www.modernrequirements.com/glossary/ears-notation/>
- EARS no Spec Kit (pedido aberto) — <https://github.com/github/spec-kit/issues/1356>
- Coordinator / Implementor / **Verifier** — <https://www.augmentcode.com/guides/what-is-spec-driven-development>

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

#### A espera não é opcional: a segunda chamada depende do RETORNO da primeira

> *"provavelmente depois de gerar o item é necessário aguardar o retorno da
> primeira chamada, pois ele vai ter um id do issue tracker, e só depois subir a
> spec."*

**É dependência de dado, não de preferência** — e isso fecha algumas portas de
implementação que pareceriam otimizações:

- **Não há como paralelizar as duas chamadas.** O id só existe depois que o issue
  existe. Disparar as duas juntas seria mandar a spec para um destino que ainda
  não tem endereço.
- **Não há como pré-calcular o id.** Quem o gera é o tracker, não nós — e inventar
  um identificador local para "corrigir depois" é o tipo de atalho que produz
  anexo órfão.

##### O elo entre os dois mundos já existe

`Atividade.chave` é **estável entre regenerações** (SPEC-41), e a SPEC-49 já grava
o rastro `chave → link`. É esse par que casa cada spec com o issue certo:

```
chave local  ──1ª chamada──▶  id do tracker  ──2ª chamada──▶  spec anexada
```

Sem ele, um lote de cinco itens que volta com cinco ids não teria como saber
**qual id é de qual item** — e anexar a spec no issue errado é pior que não
anexar, porque parece certo.

##### O lote parcial manda só o que ganhou id

Se a primeira chamada cria três de cinco, **só três specs sobem**. Os dois que
falharam continuam sem issue e sem spec — estado coerente, e reenviável. É a régua
da SPEC-49 estendida: falha por item, agora em duas etapas.

##### ⚠️ E se o agente não devolver o id na hora?

Esta é a pergunta de contrato que a implementação precisa responder antes de
escrever a primeira linha. Um agente pode criar o issue de forma **assíncrona** e
só ter o id depois.

As saídas, e nenhuma é gratuita:

| Saída | Custo |
|---|---|
| **Exigir id síncrono no contrato** | simples, e recusa agentes que trabalham em fila |
| **Aceitar retorno depois** (callback/polling) | fecha o caso geral, e traz estado pendente para guardar e reconciliar |
| **Deixar a spec pendente até o id chegar** | honesto, e exige uma fila própria — que é trabalho de verdade |

~~**Recomendação: exigir id síncrono na primeira versão.**~~

##### ⚠️ Corrigido: **o agente demora**, e isso derruba a recomendação acima

> *"o agente demora para criar os itens e subir."*

Escrevi "exigir id síncrono" antes de saber disso, e a informação muda o desenho.
Uma chamada síncrona longa é frágil por três motivos, e nenhum é teórico:
**estoura timeout de HTTP**, **prende a tela sem dizer o que está acontecendo**, e
**perde tudo se cair no meio**.

E ela explica retroativamente o §5: **o pedido de "feedback bonito e animado" não
era estética — era a resposta à espera.** A animação existe porque isto demora.

##### O desenho que a demora pede: **pipeline por item, não fases**

A primeira escrita imaginava duas fases — *"sobe todas as histórias, depois sobe
todas as specs"*. Com um agente lento, isso é o pior arranjo possível: ninguém vê
nada até o fim da primeira fase.

O certo é **item a item, com as duas etapas encadeadas**:

```
item 1: história ──▶ id ──▶ spec ✓
item 2:            história ──▶ id ──▶ spec ✓
item 3:                       história ──▶ (esperando)
```

**A spec de um item sobe assim que o id DAQUELE item chega** — não espera os
outros. Três consequências, e as três importam:

| | |
|---|---|
| **O primeiro resultado aparece cedo** | e não depois de todos os itens |
| **A tela tem o que mostrar o tempo todo** | é o §5 com informação real, não barra fingida |
| **Parar no meio deixa estado coerente** | os que passaram estão completos; os que não começaram estão intactos |

##### O que sobra de decisão

**Uma chamada por item continua podendo demorar.** As saídas:

| Saída | Quando serve |
|---|---|
| **Síncrona por item, com timeout generoso** | se o agente responde em segundos por item |
| **Assíncrona com acompanhamento** | se responde em minutos, ou trabalha em fila |

~~**Recomendação corrigida: começar síncrono por item e medir.**~~

##### ✅ **Decidido pelo usuário: assíncrono.**

> *"pode ser assíncrona, sem problemas, sabemos que demora."*

A decisão está tomada, e ela é a certa para o que foi descrito. O que ela traz de
consequência precisa ser desenhado antes da primeira linha:

**1. O estado do envio mora no BANCO, não na tela.**

É a consequência que decide todas as outras. Um envio que demora minutos não pode
viver na memória de uma aba: a pessoa fecha o navegador, troca de tela, ou o F5
acontece. **A régua desta casa já é essa** — "sobrevive ao F5" é prova exigida em
meia dúzia de specs — e aqui ela deixa de ser cortesia: sem persistência, um envio
interrompido vira issues criados que o produto esqueceu, e ninguém sabe quais
specs faltam.

**2. Polling, não callback.**

| | Custo |
|---|---|
| **Callback** (o agente chama de volta) | exige que o **produto seja alcançável** pelo agente — endereço público, autenticação de entrada, e uma porta nova na superfície de ataque |
| **Polling** (o produto pergunta) | funciona atrás de firewall, não abre nada, e o custo é tráfego ocioso |

**Recomendação: polling.** O produto já é quem chama para fora em todas as
integrações (gateway de IA, exportador, ADRs) — e manter uma direção só é o que
faz a instalação de quem compra não precisar publicar endereço nenhum. Callback
fica como evolução, para quem quiser e puder.

**3. O pipeline do item anterior continua valendo, e agora ele é o modelo do
estado.** Cada item tem o seu ponto no percurso, e é isso que a tela lê:

```
item 1: história ✓  id ✓  spec ✓        (concluído)
item 2: história ✓  id ✓  spec ⏳       (anexando)
item 3: história ⏳                      (criando)
item 4:                                  (na fila)
```

**4. Reabrir a tela mostra onde parou** — e é a prova mais importante da fatia. Não
"recomeça": lê o estado e continua exibindo. Um envio de dez minutos que perde o
rastro quando alguém troca de aba é pior que um envio síncrono, porque promete
continuidade e não entrega.

**5. E o "cancelar" passa a ser possível de verdade.** Com estado persistido, parar
no meio é uma decisão registrada — os itens concluídos ficam, os que não começaram
não começam. Sem persistência, "cancelar" seria só fechar a aba e torcer.

> **E a régua que não muda:** o que estoura contexto de token continua sendo a
> **spec** de um item grande (§4). Esse fatiamento é de dentro da segunda chamada,
> e é independente desta decisão.

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

> **E o §3.2 explicou por que o pedido existe:** *"o agente demora para criar os
> itens e subir"*. A animação **é a resposta à espera** — não decoração. Sem ela,
> uma operação de minutos parece uma tela travada, e a pessoa recarrega no meio.

Aqui ele carrega, e é fácil dizer o quê:

| O que a animação mostra | Por que não é enfeite |
|---|---|
| **em que lote está**, de quantos | é a única informação que responde *"quanto falta"* |
| **o item atravessando** para o destino | envio em lote é lento e opaco; sem isso a tela parece travada |
| **o que já chegou fica marcado** | o parcial é resultado, não estado intermediário — e a pessoa pode parar sabendo o que foi |
| **a falha para o lote e diz qual** | erro que passa correndo numa animação é erro escondido |
| **em que ETAPA cada item está** — história ou spec | com o pipeline do §3.2, dois itens estão em pontos diferentes ao mesmo tempo, e a tela precisa mostrar isso sem virar log |

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
- **C — a saída em DUAS chamadas** (§3.2). Subir a história, **aguardar o id** que
  ela devolve, e só então anexar a spec. **Prova:** o rastro tem dois campos, não
  um; um item com issue e sem spec aparece como tal; reenviar manda **só o que
  falta**; e num lote parcial **sobem apenas as specs dos itens que ganharam id**
  — casadas pela `Atividade.chave`, nunca pela ordem da lista.
- **D — os lotes, só na segunda chamada.** Fatiamento por item, ordem por
  dependência, tamanho configurável. **Prova:** um desenho grande produz N lotes,
  nenhum item é partido, a ordem respeita `resolverDependencias`, e **uma falha
  de token não desfaz o issue já criado**.
- **E — o feedback animado, sobre estado persistido.** **Prova:** a contagem
  exibida é real; **fechar a tela e voltar mostra onde parou** (não recomeça, não
  esquece); e o teste de movimento reduzido continua verde.
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

# SPEC-58 — O documento de desenho

> **Origem:** *"ADR deixaria meio órfão em termos de processo as mudanças que
> não envolvem mudanças arquiteturais, todavia seria interessante nivelar como
> Design docs"*.
>
> **Escopo decidido pelo usuário:** o documento é **por demanda**, não por
> iniciativa. *"já temos na aplicação contexto da demanda, épico ou história e o
> padrão de quebra bem definido"*.

---

## 1. O buraco que esta SPEC fecha

A fatia C da SPEC-57 pôs uma régua deliberadamente restritiva no ADR: *"decisão
nasce de escolha entre alternativas — nunca de preencher um campo"*. Ela existe
porque ADR demais é o mesmo que ADR nenhum, só que mais caro.

A régua está certa e **fica**. Mas ela criou uma sombra: uma demanda que não
muda arquitetura não tem **nenhum** artefato narrativo. Ela produz
necessidades, campos preenchidos e itens derivados — e nenhum lugar onde alguém
conte o que foi feito e por quê. Em termos de processo, essa demanda passa pela
mesa sem deixar rastro que um humano leia.

**O erro não foi criar o ADR restritivo. Foi não ter percebido que o documento
que resolve isso já existe.**

## 2. O que já existe (verificado, não suposto)

| O que | Onde | Estado |
|---|---|---|
| O documento gerado | `quebra.especificacao` (markdown), `especificacaoGeradaEm` | Persistido desde §184 |
| O template do documento | `TEMPLATE_ESPECIFICACAO_PADRAO`, configurável (SPEC-47) | `titulo`, `contexto`, `historiaPo`, `itens`, DoR, DoD |
| O template do item | `TEMPLATE_ITEM_PADRAO`, configurável | 22 variáveis, incluindo `necessidades`, `decisoes`, `percursos` |
| O contexto da demanda | `demandInfo`, `anexosContexto`, `produtoId` (SPEC-53) | Editável no assistente |
| O propósito | `quebra.necessidades` (fatia A) | Com proveniência e lacunas |
| As decisões | `quebra.decisoes` (fatia C) | Com alternativas descartadas |
| As conferências | conformidade (B), percursos (E) | Medidas, não persistidas |
| O trabalho | itens derivados + itens escritos (SPEC-41) | Persistidos |

**O achado que reorienta a SPEC inteira:** `quebra.especificacao` está no banco
e **nunca é exibida**. O `App` a lê como booleano (`!!quebra.especificacao`,
`temEspecificacaoSalva`) para saber se já foi gerada. O markdown em si vai para
o `download` e desaparece da aplicação.

Ou seja: **o documento não precisa ser criado. Precisa ser promovido.** Hoje ele
é uma *saída*; precisa virar o *artefato de trabalho da demanda*.

## 3. As quatro regras que este documento obedece

1. **O documento é da DEMANDA.** Uma quebra, um documento. Não há documento de
   iniciativa, de produto ou de trimestre — a mesa já tem o recorte certo, e
   inventar um segundo nível seria complexidade emprestada de outro contexto.
2. **O que a máquina sabe, a máquina escreve — e reescreve.** Desenho, medição,
   itens derivados e citações são gerados a cada regeneração. Congelá-los faria
   o documento apodrecer em silêncio, que é o defeito clássico do design doc de
   wiki.
3. **O que a pessoa escreve, a máquina nunca sobrescreve.** Contexto,
   trade-offs, o que ficou de fora, riscos. Se a regeneração apagar isso uma
   única vez, ninguém escreve de novo — e o documento vira só o export de antes.
4. **O ADR é uma SEÇÃO, não um concorrente.** Demanda sem decisão arquitetural
   tem essa seção vazia e o documento inteiro em pé. É assim que o órfão deixa
   de existir sem afrouxar a régua da fatia C.

## 4. O que o documento tem

Ordem deliberada: quem lê precisa entender *por que existe* antes de *o que
fazer*.

| Seção | Origem | Gerada ou escrita |
|---|---|---|
| **Contexto** | `demandInfo`, produto (SPEC-53), anexos | Escrita (já é) |
| **O que precisa ser verdade** | `necessidades` (fatia A) | Gerada |
| **O desenho** | diagrama + campos com proveniência | Gerada |
| **Decisões** | `decisoes` (fatia C) + exceções (§242) | Gerada, **uma vez, no topo** |
| **O que foi conferido** | conformidade (B) + percursos (E) | Gerada |
| **Trade-offs e o que ficou de fora** | — | **Escrita** (não existe hoje) |
| **Riscos e o que pode dar errado** | — | **Escrita** (não existe hoje) |
| **Os itens** | derivação | Gerada |
| **DoR / DoD** | baseline + contexto | Gerada |

**Duas mudanças de fundo em relação ao que sai hoje:**

- **As decisões sobem para o topo, uma vez.** Hoje elas se repetem em cada item
  (`{{decisoes}}` no template do item). Isso foi eu tratando o documento como
  export: num export por item faz sentido, num documento que alguém lê do começo
  ao fim é ruído. A citação por item **continua**, mas encurtada — o item aponta
  para a decisão, o topo a conta por inteiro.
- **Duas seções escritas nascem agora.** Trade-offs e riscos são exatamente o
  que a demanda sem ADR não tinha onde registrar. São elas que fecham o órfão.

## 5. O ciclo: o que "em termos de processo" quer dizer

Sem status, o documento não se encaixa em rito nenhum do time. Quatro estados, e
nenhum a mais:

| Estado | Significa | Quem move |
|---|---|---|
| **rascunho** | existe, ninguém garantiu nada | automático ao gerar |
| **em revisão** | pedido de leitura a alguém | quem escreveu |
| **aprovado** | o time concorda com o desenho | quem revisa |
| **implementado** | o trabalho saiu | quem entrega |

**Três decisões sobre o ciclo, e cada uma tem alternativa defensável:**

1. **Status não bloqueia derivação.** Mesma disciplina de tudo que a SPEC-57
   construiu: avisa, não trava. Exigir aprovação para derivar transformaria a
   mesa num portão burocrático, e o primeiro atraso ensinaria o time a aprovar
   sem ler.
2. **Regenerar um documento aprovado o devolve a "em revisão".** Não a
   rascunho — o trabalho de revisão não foi perdido, mas o que foi aprovado
   mudou, e dizer que continua aprovado seria mentira. Esta é a regra que
   impede "aprovado" de virar carimbo.
3. **O estado é da demanda, não do documento.** Não há versionamento de
   documento nesta SPEC. Versão é um problema real e é o próximo, não este —
   e resolvê-lo junto faria as duas coisas saírem pela metade.

## 6. Onde o documento vive na tela

Hoje: um botão que gera e baixa, na tela de revisão. O markdown nunca aparece.

Passa a ser: **uma tela própria da demanda** (`#/documento`), no mesmo menu de
`#/itens`. Ela mostra o documento montado, com as seções escritas editáveis no
lugar, o status no topo, e o botão de exportar como o que ele é — uma saída,
não o único acesso.

A regeneração é explícita e diz o que vai fazer: *"o desenho, as medições e os
itens serão reescritos; o que você escreveu fica"*.

## 7. O documento precisa ser bonito — e o que isso significa aqui

Pedido do usuário: *"o output deve ser visualmente bonito"*. Não é acabamento;
é requisito, e por uma razão de produto: **este documento é o que sai da mesa e
circula**. Ele vai para quem não abriu a ferramenta — outro time, um
fornecedor, a liderança. Um bloco de markdown cru comunica "isto foi cuspido
por uma máquina"; um documento bem composto comunica que alguém pensou.

### 7.1 As três decisões técnicas, e a que as amarra

**O projeto já resolveu este problema uma vez, e a solução fica.**
`gerarDiagramaHtml` (SPEC-21) gera um HTML **único, autocontido, animado e
interativo** — SVG + CSS + JS inline, **zero dependência nova**, função pura no
engine. É o precedente, e ele é bom.

1. **Nada de biblioteca de markdown.** `packages/web` tem seis dependências no
   total, e essa magreza é escolha, não acaso. Um `react-markdown` +
   `remark` + plugins traz uma árvore inteira para renderizar um documento cuja
   estrutura **nós mesmos geramos** — não é markdown arbitrário da internet, é
   markdown que sai do nosso template. Vamos compor o HTML das partes que já
   conhecemos, em vez de reparsear o texto que acabamos de escrever.
2. **Markdown continua sendo a verdade.** O template configurável (SPEC-47) é
   markdown, a exportação para o tracker é markdown, o documento salvo na
   quebra é markdown. O HTML é uma **renderização**, nunca a fonte — senão
   passam a existir duas verdades e a primeira edição as separa.
3. **A aparência vem dos tokens do app** (`--painel`, `--borda`, `--texto`,
   `--verde`/`--amarelo`/`--vermelho`). Um segundo sistema visual dentro do
   mesmo produto é como interface envelhece em seis meses.

### 7.2 O que faz este documento bonito, concretamente

Não é fonte bonita — é **a informação certa na forma certa**:

- **O diagrama, dentro do documento.** É a maior diferença visual possível, e
  o gerador já existe e já anima. Um design doc de arquitetura sem o desenho é
  uma descrição de um quadro;
- **A faixa de saúde no topo** — os mesmos chips do placar (🎯 propósito, ⚖
  padrão, 🧭 decisões, 🛣 caminhos) como resumo visual do estado do desenho no
  momento em que o documento foi gerado. Quem abre entende a situação em dois
  segundos, antes de ler uma linha;
- **Decisões como cartões**, com a escolhida em destaque e as descartadas
  riscadas, do jeito que já aparecem na mesa. Uma lista de bullets perde
  exatamente o contraste que faz a decisão ser lida;
- **Proveniência como selo**, não como palavra numa coluna de tabela: manual,
  extraído, inferido, sugerido têm peso visual diferente porque **têm confiança
  diferente**;
- **Violações como aviso, com o porquê junto** — a mesma composição do ⚖, onde
  a razão do padrão é tão visível quanto a cobrança;
- **Largura de leitura contida** (~72 caracteres), hierarquia tipográfica clara
  e respiro entre seções. Documento largura-de-tela ninguém lê até o fim;
- **As seções escritas por gente ficam visualmente distintas das geradas.**
  Quem lê precisa saber o que uma pessoa afirmou e o que a máquina apurou — é
  a mesma disciplina de proveniência, aplicada ao documento inteiro.

### 7.3 Três saídas, uma composição

| Saída | Para quê | Como |
|---|---|---|
| **Na tela** (`#/documento`) | ler, editar as seções escritas, revisar | React, tokens do app |
| **HTML autocontido** | mandar por e-mail, anexar, arquivar | mesma composição, um arquivo só, como `gerarDiagramaHtml` |
| **Markdown** | tracker, versionamento, quem prefere texto | o que já existe hoje |

O HTML autocontido resolve o PDF de graça: `Ctrl+P` do navegador, com `@media
print` cuidado. Gerar PDF de verdade exigiria um headless browser no servidor —
peso desproporcional para o ganho.

**A régua que impede as três de divergirem:** as três saem da **mesma estrutura
de dados**, não de três montagens paralelas. O engine já devolve o documento
estruturado antes de virar markdown (`FichaEspecificacaoNo`, `FichaItem`); é
dessa estrutura que as três renderizações partem. Três montagens separadas
divergem na primeira mudança — e o jeito de descobrir é alguém reclamar que o
PDF não tem o que a tela tem.

## 8. O que esta SPEC NÃO faz

Dito em voz alta para não virar escopo por omissão:

- **não versiona.** Sem histórico de versões, sem diff entre elas;
- **não comenta.** Revisão aqui é um status, não uma thread. Comentário é um
  sistema inteiro (notificação, resolução, menção) e o time já tem onde fazer
  isso;
- **não publica.** Exportar para Confluence/Notion é SPEC-49 territory, e a
  exportação de itens já existe. O documento sai em markdown, como hoje;
- **não é por iniciativa.** Decidido: o recorte é a demanda;
- **não afrouxa a régua do ADR.** A fatia C continua exigindo escolha entre
  alternativas. O documento é o que dá casa ao que não é decisão.

## 9. Fatiamento

Cada fatia entrega um fluxo completo e usável.

| Fatia | O que entrega | Vale sozinha? |
|---|---|---|
| **1 — O documento tem leitor, e ele é bonito** | tela `#/documento` com o documento COMPOSTO (não markdown cru), a faixa de saúde, o diagrama embutido e a exportação | **Sim.** Fecha o absurdo atual: o documento está no banco e ninguém o vê |
| **2 — O que a pessoa escreve** | seções escritas (trade-offs, riscos) que sobrevivem à regeneração | **Sim**, e é o que fecha o órfão |
| **3 — O ciclo** | status + a regra de "aprovado → em revisão ao regenerar" | **Sim**, e é o "em termos de processo" |
| **4 — As decisões sobem** | seção de decisões no topo, citação por item encurtada | Melhora 1–3, não vale sozinha |
| **5 — O HTML que circula** | exportação autocontida (um arquivo, imprime bem), no molde de `gerarDiagramaHtml` | **Sim**, e é o que faz o documento sair da ferramenta com a cara que tem dentro dela |

**Recomendação: 1 primeiro.** É a menor e a mais constrangedora de não ter — o
documento existe, está salvo, e a aplicação finge que não. Depois 2, que é o
pedido original. 3, 4 e 5 seguem.

A composição visual entra **na fatia 1**, não como polimento depois. Fazer
"primeiro funcionar, depois embelezar" com documento é como se aprende que
embelezar nunca chega: a versão feia vira a versão, e o custo de trocá-la
cresce a cada template que alguém configurou em cima dela.

## 10. As perguntas que precisam de resposta antes do primeiro commit

1. **As seções escritas moram onde?** Coluna própria na quebra
   (`documentoEscrito: Record<string, string>`) ou dentro do markdown com
   marcadores? **Proposta: coluna própria.** Marcador dentro do markdown é
   frágil — a primeira edição manual que apagar um marcador leva o texto junto.
2. **O template configurável (SPEC-47) continua mandando?** Se o time trocou o
   template do documento, as seções escritas precisam ter lugar nele.
   **Proposta:** as variáveis novas (`tradeOffs`, `riscos`) entram na lista
   fechada de `VARIAVEIS_ESPECIFICACAO`, e o diagnóstico do §108 conta —
   senão a fatia 2 nasce dormente em toda instalação, que é a lição do §244
   pela terceira vez.
3. **A composição parte de qual estrutura?** O engine hoje devolve markdown
   pronto (`gerarEspecificacaoEntrega`) e, por dentro, já tem as fichas
   estruturadas (`FichaEspecificacaoNo`, `FichaItem`). **Proposta:** expor a
   estrutura do DOCUMENTO inteiro, e fazer markdown e HTML serem duas
   renderizações dela — não duas montagens paralelas, que divergem na primeira
   mudança.
4. **Regenerar é manual ou automático?** **Proposta: manual, com aviso de
   defasagem.** Automático a cada mudança faria o documento piscar embaixo de
   quem está lendo; a procedência (SPEC-26) já sabe dizer "isto foi escrito
   sobre um desenho que já mudou".

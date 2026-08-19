# SPEC-61 — Uma saída só

> **Origem:** *"não vejo vantagem de manter `#/itens` e `#/documento` como
> features e telas separadas, faça uma revisão delas e unifique"*, *"esse
> trecho do print de o desenho me incomoda bastante, a lista fica mudando de
> tamanho, seria melhor ter o mesmo diagrama da tela anterior"* — mais os dois
> pontos que ficaram anotados no §269 e que o usuário mandou avaliar.

---

## 1. As duas telas são a mesma coisa vista duas vezes

`#/itens` mostra os cards com o texto final de cada item. `#/documento` mostra
a folha, e **já tem uma seção "Os itens"**. As duas nascem da mesma derivação,
sobre a mesma demanda, no mesmo instante.

O sintoma já tinha aparecido e eu tratei como navegação: no §269 precisei
**criar links de uma para a outra** ("Ver o documento →" nos itens, e o
contrário). Quando duas telas precisam apontar uma para a outra o tempo todo, a
pergunta certa não é "onde ponho o link" — é por que são duas.

E o custo não é só de navegação:

- **duas coisas para manter em sincronia.** O texto do item aparece nos dois
  lugares por caminhos diferentes (`itensGerados` × `documento.itens`);
- **duas respostas para "cadê o que eu gerei?"**, e a pessoa precisa saber qual
  delas responde o que ela quer;
- **o menu carrega as duas**, o que faz o menu parecer maior do que o produto.

### A régua

> **O documento é a tela. Os itens são uma seção dele.**

Não o contrário: a folha é o que circula, o que se aprova, o que tem status. Os
cards são o detalhe de uma das seções — a mais operacional, e por isso a que
ganha o corpo inteiro do texto escrito.

## 2. O que a fusão preserva, e o que ela mata

| Da tela de itens | Vai para |
|---|---|
| corpo escrito de cada item | seção "Os itens" do documento, expandível card a card |
| pendências e sugestões por item | mesma seção, no cabeçalho de cada card |
| "Ir para a demanda" (vazio) | mensagem de vazio da seção |
| botão "Ver o documento →" | **morre** — não há para onde ir |

**Morre também a rota `#/itens`.** Quem chegar nela por link velho é levado ao
documento: rota que some tem que redirecionar, não dar tela branca.

**Não morre a tela de revisão.** Ela é onde se *trabalha* o item (refinar,
confirmar sugestão da esteira); o documento é onde se *lê* o resultado. São
momentos diferentes do mesmo objeto, e essa distinção se sustenta — a de
"itens" × "documento" não se sustentava.

## 3. O desenho: o mesmo da mesa, e parado

Hoje a seção "O desenho" embute um **iframe** com o HTML animado (SPEC-21). Ele
traz junto um painel lateral que muda de tamanho conforme a seleção — dentro de
um documento, isso é um corpo estranho que se mexe sozinho.

> **O desenho no documento é uma FIGURA.** Figura não muda de tamanho, não
> pede clique e não tem painel lateral.

O que entra é o **mesmo React Flow da mesa**, em modo leitura: sem arrastar,
sem conectar, sem painel — só os nós, as arestas e os rótulos, com altura fixa.
É mais bonito porque é o mesmo desenho que a pessoa acabou de compor, e não uma
segunda renderização parecida.

**O que se perde:** a exploração ("clique num nó para ver os itens
relacionados") e o "reproduzir em sequência". Os dois continuam existindo onde
fazem sentido — na revisão, que é a tela de trabalhar. Perder exploração dentro
de um documento não é perda: documento é para ler, e quem quer explorar volta
para a mesa.

## 4. A faixa de saúde separa problema de inventário

Ficou anotado no §269: os chips `🎯 1 necessidade sem componente`, `⚖ 1 fora do
padrão` e `🧭 1 decisão(ões)` têm o mesmo peso visual, e só a cor os separa. Os
dois primeiros **cobram ação**; o terceiro é **contagem**.

A faixa passa a ter duas partes com títulos: **o que ainda pede atenção** e **o
que este desenho já tem**. Nada de cor nova: o que muda é onde a coisa está, e
lugar comunica antes de cor.

## 5. Ordem de implementação

1. **O desenho vira figura** — é isolado, é o que mais incomoda, e não depende
   da fusão;
2. **A faixa se divide** — igualmente isolado, e pequeno;
3. **A fusão** — a seção "Os itens" recebe os cards, `#/itens` redireciona, o
   menu perde a entrada, os E2E que navegam por ela passam pelo documento.

A fusão vem por último de propósito: ela é a única que mexe em rota, e rota
quebrada é o tipo de erro que só aparece no caminho de quem tinha um link
salvo.

---

## 6. Revisão da SPEC — o que faltava para ela ser executável

Reli isto contra o que a implementação de fato precisa decidir. Sete lacunas, e
a primeira é de dados, não de tela.

### 6.1 São DUAS listas de itens, não uma

O documento monta `itens` a partir de `estruturarDocumento(atividades…)` — a
**derivação**, que existe sempre. Os cards vêm de `gerarItensDeTrabalho` e são
gravados como `ItemGerado`, com `estado`, `criadoEm` e `linkExterno` — a
**escrita**, que só existe depois que alguém pediu.

Juntar as duas sem dizer qual manda produziria uma seção que às vezes tem
quatro itens e às vezes sete, sem ninguém entender por quê.

> **A derivação manda; a escrita enfeita.** A seção lista sempre os itens
> derivados — eles são o que o desenho produz. Onde houver escrita para aquela
> `chave`, o card abre com o texto final; onde não houver, o card diz *"ainda
> não escrito"*.

A junção é pela `chave`, que é estável por construção (é a mesma que sobrevive
a rederivar). Item escrito cuja chave sumiu da derivação **aparece no fim,
marcado como órfão** — pela mesma razão do §57: sumir em silêncio esconde
justamente o evento que interessa.

### 6.2 O documento não gera — mostra

Gerar continua sendo ato da revisão (o balão do M7/M12, §270). O documento
nunca ganha um botão de gerar: ele é onde se lê o resultado, e uma tela que
gera e mostra a mesma coisa é a confusão que esta SPEC está desfazendo.

Consequência: **depois de gerar, a navegação vai para o documento**, na seção
dos itens — hoje ela vai para `#/itens`, que deixará de existir.

### 6.3 O tour tem um passo que aponta para a rota que morre

`useTour` tem o passo **"Itens escritos"** com `opts.abrirItens()` e
`opts.fecharItens()`. Com a rota fundida, o passo passa a apontar para a seção
do documento, e os dois opts viram um só (`abrirDocumento`, que já existe).

Capacidade que o tour não mostra não existe (§244) — mas passo que aponta para
tela que não existe é pior: quebra a demonstração inteira no meio.

### 6.4 O canvas em leitura precisa de um modo, não de boa vontade

`Canvas` recebe `UseDiagrama` (o hook), não um `Diagrama`. Para o documento:

- instanciar `useDiagrama(documento.diagrama, () => {}, config)` — o `aplicar`
  vazio já impede qualquer escrita, porque é por ele que toda mutação passa;
- **e ainda assim um `somenteLeitura` explícito no `Canvas`**, desligando
  arrastar, conectar e o atalho de exclusão. Depender só do `aplicar` vazio
  deixaria a interface convidando a ações que não acontecem, que é pior do que
  não convidar;
- `fitView` ao montar: figura se enquadra sozinha.

### 6.5 O gerador de HTML do diagrama SOBREVIVE

O §269 tirou o download de HTML **do documento**. O `gerarDiagramaHtml`
continua vivo e usado pelo botão *"Baixar diagrama (.html)"* da revisão — que é
o artefato que se manda para quem não tem acesso à ferramenta. Sai da tela do
documento; não sai do produto.

### 6.6 Quais chips vão para cada lado da faixa

Sem esta tabela, a divisão vira julgamento na hora de implementar:

| Pede atenção | Já tem |
|---|---|
| 🎯 necessidade sem componente | 🎯 necessidades cobertas |
| ⚖ fora do padrão | ⚖ exceções aceitas (com motivo) |
| 🛣 caminho fora da régua · sem medir · a confirmar | 🛣 caminhos confirmados |
| 🧭 proposta esperando · decisão sem porquê | 🧭 decisões vigentes |

A régua que gerou a tabela: **está de um lado o que alguém precisa resolver, do
outro o que já foi resolvido.** "A confirmar" fica à esquerda porque é trabalho
de uma pessoa que ninguém fez (§261).

### 6.7 A rota morta redireciona, e o menu perde a entrada

`Rota` continua **entendendo** `#/itens` — e resolvendo para `documento`. Rota
que some sem redirecionar dá tela branca para quem tinha o link salvo, e link
salvo é justamente o de quem mais usa.

O item "Itens escritos" sai do menu. Os E2E que navegam por `menu-itens`,
`itens-screen` e `corpo-dos-itens` passam a navegar pelo documento; o
`itens-ir-ao-documento` (§269) some junto com a tela que o hospedava.

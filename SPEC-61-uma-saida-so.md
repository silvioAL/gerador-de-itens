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

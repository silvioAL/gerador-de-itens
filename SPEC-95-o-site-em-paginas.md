# SPEC-95 — O site em páginas, e a profundidade que um arquiteto avalia

> **Origem:** o usuário, depois de receber a landing virada apresentação (§341):
>
> > *"quanto a estar ficando longo estava me referindo a ser reorganizada em mais
> > páginas, eventualmente com menu próprio, algo nesse sentido. Ainda me parece
> > distante de uma página que entro para comprar um software profissional caro
> > que envolve avaliação de maturidade ou algo do tipo tão complexo, está muito
> > simples, podemos incrementar bastante."*
>
> E, logo em seguida:
>
> > *"porém devemos pensar também no público não técnico, devem entender o story
> > telling."*
>
> **Decisões tomadas com o usuário na mesma conversa:**
>
> - **Rotas públicas na mesma SPA** (`#/site/…`), e não site separado.
> - **A densidade vem de profundidade técnica de verdade** — não de capturas de
>   tela, não de preço, não de prova social.
> - **E ela não pode custar o entendimento de quem não é técnico** (§1.1).

---

## 0. O erro de leitura que esta SPEC corrige

A §341 leu *"está ficando longa"* como **excesso de conteúdo numa página**, e
respondeu com âncoras internas e um caminho curto. Estava errado.

**O usuário queria mais páginas.** E a diferença não é de acabamento — é de
arquitetura:

| | Âncora (`#o-ciclo`) | Página (`#/site/o-ciclo`) |
|---|---|---|
| Endereço | rola dentro de um documento | **é um destino** |
| Título | um só para tudo | próprio, por assunto |
| Carga | traz a página inteira junto | traz o assunto |
| Menu | índice de seções | **navegação de site** |
| Crescer | a página fica mais longa | **nasce outra página** |

A última linha é a que importa: com âncoras, todo conteúdo novo que a SPEC-94
trouxer (método de quebra, maturidade, valor) **piora o problema que o usuário
relatou**. Com páginas, ele o resolve.

E é também a resposta ao *"está muito simples"*: a página atual tem **102
palavras de prosa própria** (§341). Isso é enxuto para uma apresentação e
**pobre para um software que se propõe a avaliar maturidade de processo**. Quem
avalia uma compra cara procura profundidade, e não a encontra.

---

## 1. O que "profissional e caro" quer dizer aqui, e o que não

O usuário escolheu **profundidade técnica**, e recusou implicitamente o resto ao
não marcá-lo. Isso é sorte: as réguas herdadas já proibiam quase todo o
repertório visual de página comercial (SPEC-83 §2, SPEC-82 §4.1).

**Quer dizer:**

- **páginas que um arquiteto lê antes de recomendar a compra** — arquitetura,
  segurança, determinismo, integrações, o método;
- **afirmação com prova ao lado** — ver §3, que é o coração desta SPEC;
- **especificidade** — números que saem deste repositório, não do mercado.

**Não quer dizer:**

- **um site só para engenheiros** — ver §1.1, que é a régua que governa esta;
- depoimento, logo de cliente, número de conversão (recusados desde a SPEC-83);
- captura de tela como explicação (recusa do próprio usuário, SPEC-82 §4.1 — e
  **não reaberta**: ele não a marcou quando lhe foi oferecida);
- preço e planos (não existem no repositório, e não se derivam de código);
- adjetivo. *"Robusto"*, *"enterprise-grade"* e *"escalável"* são o oposto de
  profundidade: são o que se escreve quando não se tem o que mostrar.

---

## 1.1 Os dois públicos, e quem manda na narrativa

> *"devemos pensar também no público não técnico, devem entender o story telling"*

Isto **responde a pergunta em aberto §7.1 da SPEC-92**, que perguntava *"quem é o
leitor?"* e ficou sem resposta. São dois, e eles não se substituem:

| | Quem avalia | Quem decide |
|---|---|---|
| **Quem é** | arquiteto, tech lead, engenheiro de plataforma | head de produto, diretor, dono do processo, quem assina |
| **O que procura** | *"isto funciona como diz? o que roda onde? é determinístico?"* | *"que problema meu isto resolve? por onde eu começo? quanto custa parar de resolver do jeito atual?"* |
| **Como decide** | verificando | **entendendo a história** |
| **O que o afasta** | adjetivo sem mecanismo | jargão que ele não pode conferir |

**E o segundo é quem compra.** Num software caro, o técnico vetá — mas quem
aprova costuma ser quem não vai ler `derivar.ts`. Um site que só fala com o
primeiro perde a venda no lugar onde ela acontece.

### A régua: a narrativa é o eixo, a profundidade pendura nela

**A espinha do site é a história, em português claro.** As páginas técnicas são
**aprofundamento**, não o caminho principal — e a ordem importa:

> **Toda página abre respondendo em linguagem comum, e só então desce.** Quem
> parar no primeiro terço entendeu o assunto; quem continuar encontra o
> mecanismo, o código e a prova.

Isso não é diluir. É a mesma disciplina que as sete peças já seguem: o
`OPassoContido` enuncia a tese em texto **antes** da figura, *"para quem não vê a
animação ter a tese inteira sem ela"* — a régua está escrita no comentário dele
desde o §328. O que muda é aplicá-la ao site inteiro.

### O assunto que fala com os dois

**A maturidade (SPEC-94) é a ponte, e isso é sorte que vale usar.** Ela é a única
parte do produto cujo vocabulário nativo é de gestão, não de engenharia: *"de onde
sua organização parte"*, *"o que precisa existir antes"*, *"por que o passo é
curto para uns e longo para outros"*. Um diretor entende sem tradução, e um
arquiteto reconhece o CMMI por trás.

Por isso ela é forte candidata a **abrir** o site, e não a ser mais uma página no
fim — decisão para a fatia C, com o desenho na mão.

### E há um risco a nomear

O produto tem vocabulário próprio e forte — *camada perene*, *apontamento*,
*proveniência*, *lacuna contável*, *governança executável*. Ele é preciso, é
âncora de código, e é **exatamente o que faz alguém de fora se perder na terceira
frase**.

A saída **não** é abandoná-lo: ele é o produto. É **introduzi-lo** — cada termo
aparece pela primeira vez junto do que ele quer dizer, e a régua é mecânica o
bastante para virar trava (fatia G): *nenhum termo do vocabulário interno aparece
na abertura de uma página sem estar explicado ali.*

---

## 2. A arquitetura das rotas

### 2.1 O espaço público

Hoje `rotaDoHash` (`packages/web/src/navegacao/rota.ts`) trata **tudo** que
começa com `#/` como tela de dentro, e o desconhecido cai no `canvas`. A landing
é renderizada em `App.tsx` **antes** de qualquer roteador.

**O espaço público passa a ser `#/site/…`**, e ele é reconhecido *antes* da
decisão de autenticar:

| Rota | Página |
|---|---|
| `#/` sem sessão, ou `#/site` | a **capa** |
| `#/site/o-problema` | por que a IA que você já tem não basta |
| `#/site/o-conceito` | a camada, as quatro camadas, o motor e a contenção |
| `#/site/o-ciclo` | os 13 estágios e o percurso em raias |
| `#/site/o-metodo` | **como o desenho vira histórias e tasks** (SPEC-94 §3) |
| `#/site/a-maturidade` | **a escala, e de onde a organização parte** (SPEC-94 §2) |
| `#/site/arquitetura` | hexagonal, determinismo, o que roda onde |
| `#/site/seguranca` | autenticação, RBAC, auditoria, segredos |
| `#/site/integracoes` | o que entra e o que sai, marcado |

> **Por que `#/site/` e não `#/o-ciclo` direto:** um prefixo próprio deixa a
> regra ser *"tudo sob `#/site` é público"*, em vez de uma lista de exceções que
> alguém esquece de atualizar. E torna trivial a trava: **nenhuma rota pública
> pode colidir com uma rota de aplicação.**

### 2.2 A limitação conhecida, dita antes que alguém a descubra

**Rota com `#` não é indexada por buscador.** O conteúdo depois do `#` não vai ao
servidor, então nenhum robô vê as páginas.

Para um produto que quer ser encontrado por quem procura *"camada de governança
para IA"*, isso importa — e a alternativa (URL limpa, `/o-ciclo`) foi apresentada
ao usuário e **não escolhida**, porque mexe no Caddy e no deploy.

**Fica registrado como dívida consciente (SPEC-69), com a saída conhecida:**
servir a SPA em qualquer caminho é uma linha no `Caddyfile` mais um `basename` no
roteador. Quando a busca virar requisito, o custo é esse — e as páginas desta
SPEC não precisam mudar, só o formato do endereço.

### 2.3 O que acontece com o trabalho da §341

**Nada se joga fora, e isto é régua da fatia.**

- `atos.ts` vira `paginas.ts` — a mesma ideia (dado que gera navegação e travas),
  com `id`, `nome`, `pergunta` e agora `rota`;
- `NavegacaoDosAtos` vira o **menu do site**, e o `aria-current` passa de
  `location` para `page`, que é o valor certo quando o destino é outra página;
- `MolduraDoAto` vira a moldura de página — o chapéu continua sendo chapéu;
- **o caminho curto (`useCaminhoCurto`) muda de significado** e precisa de
  decisão: percorrer cinco páginas é um *tour*, não uma rolagem. Ver §6, fatia E.
- `useAncoraInicial` continua necessário para âncoras **dentro** de uma página
  longa, e pelo mesmo motivo medido no §341.

As sete peças de diagrama **não mudam**. De novo: o usuário gostou delas.

---

## 3. A ideia que faz esta SPEC valer: **a página cita a prova**

Um arquiteto avaliando compra cara não quer adjetivo — quer verificar. E este
repositório tem uma coisa que quase nenhuma landing tem:

> **Cada afirmação técnica do produto já é provada por um teste com nome.**

| A página afirma | O que prova, e existe |
|---|---|
| "o mesmo desenho produz sempre os mesmos itens" | `engine/src/especificacao/documentoNaoMuda.test.ts` |
| "a regra da casa roda, não fica documentada" | `Requisito.checagem` — `config/types.ts:331` |
| "nada que a IA propõe conta antes da confirmação" | as travas de proveniência em `ValorSpec.origem` |
| "toda conexão incompleta diz o que falta" | `demo/landing.travas.test.tsx` |
| "a página não promete o que o produto não faz" | `demo/ciclo.test.ts`, contra o roteador real |
| "a paleta passa na régua de contraste que o produto cobra dos outros" | a trava de contraste do §340 |

**Isso é profundidade que não envelhece mentindo** — se a prova sumir, a suíte
cai no mesmo commit. É a régua da SPEC-76 virada argumento de venda, e é
específica deste produto: quase ninguém pode fazê-la.

> **A régua da própria régua:** a página não cita um teste que não existe, e há
> trava para isso (fatia G). Uma citação quebrada seria pior que nenhuma — seria
> uma promessa falsa *sobre o mecanismo de não fazer promessas falsas*.

**O que NÃO fazer aqui:** despejar contagem de testes ("953 testes!") como
número de folheto. Quantidade de teste não é qualidade de produto, e um arquiteto
sabe disso. O que convence é **a afirmação específica com a prova específica ao
lado**.

---

## 4. As páginas técnicas, e de onde sai o conteúdo de cada uma

Nenhuma precisa de conteúdo inventado. Tudo já existe, espalhado.

| Página | Sai de | O que ela responde |
|---|---|---|
| **O método** | `derive/derivar.ts`, `percursos.ts`, SPEC-94 §3 | como o desenho vira item, e **por que fatiar por elemento não é o anti-padrão que parece** |
| **A maturidade** | SPEC-94 §2 | de onde sua organização parte, e por que o passo é curto para uns e longo para outros |
| **Arquitetura** | SPEC-31 (hexagonal), `engine` sem I/O | o que é determinístico, o que vai à rede, o que guarda estado |
| **Segurança** | SPEC-09, 10, 12, 28 | autenticação, RBAC por time, auditoria, cofre de segredos |
| **Integrações** | SPEC-81 (MCP), SPEC-49, `conceito.ts` | o que entra, o que sai, **e o que ainda não existe, marcado** |
| **O conceito** | `CONCEITO.md` | a tese inteira |

> **A página de integrações é a que mais precisa de disciplina.** É onde a
> tentação de prometer roadmap é maior, e onde a régua da SPEC-76 já opera: das 5
> conexões, **4 existem** e a quinta aparece marcada com o que falta. Manter isso
> numa página de vendas é o diferencial, não a limitação.

---

## 5. O que esta SPEC RECUSA

- **Duplicar os diagramas.** Foi por isso que o site separado foi recusado: dois
  lugares para a mesma explicação divergem no primeiro que alguém editar (§323).
- **Uma página por SPEC.** São 95. A página é por **assunto que alguém procura**,
  e uma página pode citar cinco SPECs.
- **Adjetivo no lugar de mecanismo.** Vale a régua da SPEC-83 §2 em todas as
  páginas novas, e a trava de teto de prosa da §341 continua valendo por página.
- **Captura de tela como explicação.** Recusa do usuário, oferecida de volta nesta
  conversa e **não retomada**.
- **Reescrever as sete peças.**
- **Afrouxar as travas da §341** para caber mais texto. Se o teto apertar, é
  porque a página está virando artigo de novo.

---

## 6. Fatias

- **A — o espaço público no roteador.** `#/site/…` reconhecido antes da
  autenticação, sem colidir com as rotas de aplicação. **Prova:** estender
  `navegacao/rota.test.ts`; nenhuma rota pública resolve para tela de dentro, e
  nenhuma rota de dentro cai no site.

- **B — `paginas.ts` e o menu.** O dado que gera navegação e travas, herdado de
  `atos.ts`. **Prova:** todo item do menu resolve para uma página que renderiza;
  `aria-current="page"`; e a barra continua cabendo em 360 px — **medida, não
  suposta** (a de cinco itens já rolava, §341).

- **C — a capa encolhe.** A home deixa de carregar tudo e passa a apresentar as
  páginas. **Prova:** a altura da capa cai — é a primeira vez nesta série de
  rodadas em que *"está ficando longa"* tem uma prova numérica que a atende.

- **D — as páginas técnicas, com abertura para os dois públicos.** Arquitetura,
  segurança, integrações, o conceito. **Prova:** cada afirmação técnica tem prova
  citada e a citação resolve (fatia G); **e a abertura de cada página passa na
  régua de vocabulário** — nenhum termo interno sem introdução.

- **E — o que fazer com o caminho curto.** Percorrer páginas é um tour, e o
  produto **já tem um** (`useTour`, SPEC-78, com régua de interrupção no §253).
  **Decisão a tomar na implementação:** reusar o mecanismo do tour ou aposentar o
  caminho curto. Não decido aqui porque depende de como a capa ficar — mas
  **manter dois mecanismos de percurso é o §263 esperando acontecer.**

- **F — o método e a maturidade.** As páginas que a SPEC-94 desenha. Dependem
  dela, e a da maturidade depende da decisão do §7.5 dela (o patamar 5 é casa
  vazia até existir a tabela `medicoes`).

- **G — as travas.** Rota pública que não colide; item de menu que resolve;
  **prova citada que existe** (o arquivo referenciado está no repositório); o teto
  de prosa por página; e **a régua de vocabulário**.

  A de vocabulário merece desenho, porque é a única desta SPEC que tenta medir
  **compreensão**, e isso é difícil de fazer honestamente:

  - a lista de termos internos sai do `CONCEITO.md` (a tabela *"O vocabulário"*)
    e de `conceito.ts` — **dado, não uma lista escrita à mão que envelhece**;
  - a régua roda sobre a **abertura** de cada página, não sobre ela inteira: o
    corpo pode e deve usar o vocabulário, senão a página vira paráfrase;
  - "explicado ali" é mecânico: o termo aparece a menos de N palavras de sua
    definição, ou dentro de um elemento marcado como introdução.

  > **O que ela NÃO promete:** que a página seja compreensível. Isso não é
  > mecânico, e fingir que um teste garante seria a mesma mentira que o
  > `landing-movel.spec.ts` recusa dizer sobre "ser agradável no celular"
  > (§336). O que ela pega é o defeito objetivo: **jargão solto na primeira
  > tela.** Compreensão de verdade se verifica dando a página para alguém ler —
  > e isso vai para o "o que não foi verificado" da rodada.

> **Corte sugerido:** **A+B+C numa rodada** — é a mudança de arquitetura, e ela é
> a que o usuário pediu. **D+G na segunda.** **E+F na terceira**, depois da
> SPEC-94.

---

## 7. Perguntas em aberto

1. **A capa continua sendo `#/` sem sessão?** Hoje quem tem sessão cai direto no
   canvas. Se o site tem endereço próprio, alguém logado que queira ler a página
   de segurança precisa chegar lá — e voltar. **Recomendação:** `#/site/…`
   funciona logado e deslogado; o que muda é o botão do canto (*Entrar* × *Ir para
   o app*).

2. **Quanto texto por página técnica?** O teto da §341 é de 160 palavras autorais
   **para a página inteira**, e foi calibrado para uma apresentação. Uma página de
   arquitetura com 160 palavras é um panfleto. **Recomendação:** o teto passa a
   ser **por página**, com valor próprio para as técnicas — e continua existindo,
   porque o que ele impede é a página virar artigo sem que ninguém perceba.

3. **As páginas técnicas entram no menu principal?** Nove itens não cabem numa
   barra que já rola com cinco em 360 px. **Recomendação:** menu de cinco a seis,
   com as técnicas agrupadas sob uma entrada (*"Como funciona"*), e a decisão de
   forma tomada **medindo em 360**, não no desktop.

4. **Quem escreve o conteúdo técnico?** Sai das SPECs, mas SPEC não é texto para
   quem chega de fora — é registro de decisão, com histórico e discussão. A
   tradução é trabalho de escrita, e é o maior custo desta SPEC. **Não é
   automatizável**, e fingir que é produziria exatamente o *"plausível-mas-vazio"*
   que a SPEC-80 recusa.

5. **A narrativa para o não técnico já existe em algum lugar?** Parcialmente: o
   `AEvolucao` (prompt → agente → camada) é a melhor peça do produto nesse
   sentido, e não usa jargão nenhum. **Mas a história para de ser contada logo
   depois dela** — a partir das quatro camadas, o vocabulário interno assume.
   **Recomendação:** desenhar a espinha narrativa inteira **antes** das páginas
   técnicas, e testá-la com alguém de fora. É a fatia mais barata de fazer e a
   mais cara de descobrir errada depois.

6. **O público não técnico chega a ler "maturidade"?** A SPEC-94 §7.2 já
   levantou o risco de a tela de diagnóstico afastar quem mede patamar 1. Na
   **página pública** o risco é o inverso e maior: alguém se reconhecer no
   patamar 1 e concluir *"então isto não é para mim"* — quando é exatamente para
   ele. **Recomendação:** a página da maturidade nunca apresenta a escala sem
   apresentar junto o caminho, e o texto do patamar 1 é sobre **de onde se
   começa**, jamais sobre atraso.

---

## 8. Para quem implementar: o mínimo antes de começar

- `packages/web/src/navegacao/rota.ts` — `rotaDoHash`, `SEGMENTO_DA_AREA`, e o
  fallback para `canvas`. A fatia A mexe aqui.
- `packages/web/src/App.tsx` — onde a landing é renderizada antes do roteador.
- `packages/web/src/demo/atos.ts`, `NavegacaoDosAtos.tsx`, `MolduraDoAto.tsx`,
  `useAncoraInicial.ts` — o que a §341 construiu e esta SPEC transforma.
- `packages/web/src/demo/landing.travas.test.tsx` — as travas que continuam
  valendo, e o teto que precisa virar por página.
- `packages/web/e2e/landing-apresentacao.spec.ts` e `landing-movel.spec.ts` — as
  provas de pixel. **A régua do §341:** capture e olhe, nos dois temas, antes de
  dar por feito.
- `SPEC-94` — o método e a maturidade, que são duas das páginas.
- `JOURNEY.md` §341 — inclusive o erro de leitura que esta SPEC corrige.

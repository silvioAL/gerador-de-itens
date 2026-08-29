# SPEC-79 — O design system como régua

> **Origem:** o usuário, sobre a página do ciclo:
>
> > *"criar spec para que todos itens fiquem verde, ou seja, implementar tudo o
> > que falta"* — e, na escolha de profundidade: **ambição completa.**

Este é o primeiro dos três estágios não-verdes. Ele é o único marcado
`parcial` — os outros dois não existem —, e por isso é o mais barato de
entender e o mais fácil de fazer errado.

---

## 0. A medição

`packages/web/src/demo/ciclo.ts` hoje declara **13 estágios: 10 completos, 1
parcial, 2 ausentes** (`contagemDoCiclo()` → 11 de 13). O parcial é este, e o
texto que a própria página mostra diz o que falta:

> **Analisar o contexto técnico** — *parcial.*
> **O que falta:** Um design system de verdade — tokens, componentes de
> interface, régua visual — ainda não é modelado aqui. O que existe é a régua de
> arquitetura e de dados.

O que **já** existe, medido em `packages/engine/src/config/types.ts`:

| Peça | Onde | O que faz |
|---|---|---|
| `FieldSpec` | `:46` | campo tipado, com `required`, `when`, `permiteNA`, `options` |
| `NodeTypeConfig` | `:72` | tipo de componente: `spec: FieldSpec[]`, `techs`, `contextos` |
| `RegrasPorTech` | `:292` | `checklistTecnico`, `checklistProcesso`, `testes`, por tecnologia |
| `Requisito` | `:238` | exigência com `contextos`, `porque`, e — o essencial — `checagem?` |
| `Checagem` | `:216` | `campo` + `operador` + `valor`, com `valorDe` e `multiplicadoPor` |
| `Condicao` | `:14` | o `when` que liga uma regra só no contexto certo |

> **A máquina de medir já está construída.** O que falta não é um motor novo: é
> o vocabulário de interface entrando nos tipos que o motor já lê.

Isso muda o tamanho do trabalho, e é a razão de esta SPEC vir primeiro entre as
três.

## 1. O que "design system de verdade" precisa significar aqui

Um design system, num produto que **mede**, não pode ser uma galeria de
componentes bonitos. Se ele não vira checagem, ele é documentação — e este
produto já recusa documentação que ninguém confere.

São três coisas, e cada uma tem que virar dado consultável:

### 1.1 Tokens

Cor, tipografia, espaçamento, raio, elevação, duração de animação. Hoje o
próprio produto usa `var(--painel)`, `var(--texto)`, `var(--texto-2)`,
`var(--borda)` — tokens de fato, mas **hardcoded no CSS e invisíveis ao motor.**

Um token é `{ nome, valor, valorEscuro?, grupo }`. É a coisa mais simples desta
SPEC, e é a base das outras duas.

### 1.2 Componentes de interface como tipo de nó

`NodeTypeConfig` já modela "serviço", "fila", "banco". Um "componente de
interface" é o mesmo formato com outra `spec`: estado de carregamento, estado
vazio, estado de erro, foco visível, rótulo acessível, comportamento em toque.

**Isto não é um tipo especial** — é `NodeTypeConfig` com `contextos: ["web"]` e
uma `spec` própria. Se precisar de mecanismo novo, o desenho está errado.

### 1.3 A régua visual — e é aqui que a tese do produto se prova

Boa parte de "está de acordo com o design system?" é **computável**, não
opinável:

- contraste de texto sobre fundo (WCAG é aritmética sobre luminância);
- alvo de toque menor que o mínimo;
- valor de cor/espaçamento que **não é** nenhum token declarado;
- par de cores indistinguível para daltonismo (ΔE em espaço perceptual).

> É a mesma natureza da Lei de Little em `resiliencia.ts` e da conta de
> saturação: uma medida que ninguém consegue contestar vira ruído ou dogma —
> esta você contesta, porque a regra está escrita e você pode mudá-la.

**O que NÃO é computável — hierarquia visual, tom, se a tela "parece nossa" —
não entra como checagem.** Vira `Requisito` sem `checagem`, que é exatamente o
que o tipo já permite: um item de checklist que uma pessoa responde.

## 2. Por que isto não é "mais uma aba de configuração"

A tentação é criar uma área `designSystem` ao lado das doze existentes e
encerrar. Isso deixaria o ponto verde e não mudaria nada: os tokens ficariam
num formulário que nenhum motor lê.

**O critério de verde desta SPEC:** um desenho que contraria o design system do
time tem que produzir **item de trabalho derivado**, do mesmo jeito que um
desenho que contraria um padrão de arquitetura produz hoje
(`gerarItensDeTrabalho` já emite "um item para cada padrão que o desenho
contraria"). Se não deriva item, não está verde.

## 3. O que esta SPEC RECUSA

**Biblioteca de componentes React.** O produto não vai passar a exportar botões.
Ele modela o design system do **time do usuário**, não impõe o dele.

**Importar tokens de Figma automaticamente.** Tentador e caro, e depende de uma
integração externa que ninguém mediu. Um import de JSON no formato de tokens do
W3C cobre o caso sem acoplar em ferramenta.

**Reescrever a interface do próprio produto para consumir os tokens
configuráveis.** É outro assunto — e misturá-lo faria a régua nascer refém de
um refactor visual.

**Checagem estética.** Contraste é aritmética; "elegante" não é. A régua desta
SPEC é: *se não dá para calcular, é `Requisito` sem `checagem`.*

## 4. Fatias

- **A — os tokens são dado.** Nova área de configuração, `Token[]` por time, com
  import/export no formato de tokens do W3C. Prova: um token declarado sobrevive
  a um F5 e volta pela borda (a régua da SPEC-71).
- **B — componentes de interface como `NodeTypeConfig`.** Uma `spec` própria com
  os estados que uma interface precisa declarar. Prova: derivar itens de uma
  demanda com nó de interface produz item por estado ausente.
- **C — a régua computável.** `Checagem` ganha os operadores que faltam
  (contraste, pertence-aos-tokens, alvo-mínimo), e o motor passa a medir. **Esta
  é a fatia que torna o ponto verde**; sem ela as outras duas são formulário.
  Prova: um par cor/fundo abaixo da razão declarada derruba a prontidão do nó,
  com o número na frase.
- **D — a marca no ciclo.** `ciclo.ts` passa `padroes` a `completo` e some com o
  `oQueFalta`. **Só depois de C**, e o teste da SPEC-76 fatia D continua
  cobrando que todo estágio não-ausente tenha rota.

## 5. Perguntas em aberto

1. **Tokens são do time ou do produto?** A SPEC-77 acabou de estabelecer a régua
   "declarado vence herdado" para volumetria. Design system parece ser do
   **time** (uma casa, um sistema visual), mas um time que atende dois produtos
   com marcas diferentes quebra isso. Recomendação: nasce no time, e a herança
   por produto fica para quando alguém pedir.
2. **Qual razão de contraste é o padrão?** WCAG AA (4.5:1) é o mínimo defensável;
   AAA (7:1) é o que um design system maduro pede. Recomendação: **configurável,
   com AA como default**, porque a régua é do time e não nossa — é a mesma
   escolha que a SPEC-72 fez para o teto de anexo.
3. **O que acontece com quem já tem demanda salva?** Nenhum nó de interface
   existe hoje, então não há migração de dado — mas há de *expectativa*: uma
   demanda antiga não pode passar a ter prontidão vermelha por causa de uma
   régua que não existia quando ela foi feita. Recomendação: régua nova nasce
   como **aviso**, e o time promove a erro quando quiser (`problemasDoTemplate`
   já tem esse precedente de erros × avisos).

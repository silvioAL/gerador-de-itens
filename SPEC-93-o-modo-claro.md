# SPEC-93 — O modo claro, e os 312 lugares que impediam

> **Origem:** o usuário: *"implemente o modo branco, assim ficamos com o atual
> como dark e o branco"* — e, precisando quem escolhe: *"o usuário decide qual
> agrada mais."*

## 0. A medição

`packages/web/src/styles.css` tem **um `:root` só**, com 14 variáveis de cor.
Capturas em `colorScheme: dark` e `light` saem byte a byte idênticas — o produto
não tem tema claro, e não é que ele esteja escondido: ele não existe.

**Mas o obstáculo real não é o `:root`.** Varrendo `packages/web/src`:

| O que | Ocorrências | Cores distintas |
|---|---|---|
| Hex que é **cópia literal** de uma variável existente | **147** | 14 |
| Hex **sem variável** nenhuma | **165** | 40 |
| **Total de cor fixa no código** | **312** | 54 |

As campeãs das cópias: `#1b2533` (22×, é `--borda`), `#3ecf8e` (19×, é
`--verde`), `#15202d` (15×, é `--painel-alto`), `#0c111a` (9×, é `--fundo`).

As campeãs sem variável: **`#4f46e5` (64× em 26 arquivos)** — o indigo de
"escrito por gente" — e **`#a5b4fc` (35× em 26 arquivos)**, o texto indigo claro.

**Trocar o `:root` sem mexer nisso deixaria 312 lugares escuros dentro de um tema
claro.** É por isso que esta SPEC não é "adicionar uma paleta": é tokenizar
primeiro, e a paleta é a consequência.

## 1. A régua, e ela é do próprio produto

A SPEC-79 construiu `contraste()` e `contrasteArredondado()` em
`packages/engine/src/conformidade/contraste.ts` — aritmética de WCAG, para o
motor cobrar contraste no design system **do time**.

**A paleta clara vai ser provada com essa mesma função.** Não "ficou bonito": os
pares texto-sobre-superfície passam no limiar, e há teste que falha se alguém
escurecer um cinza demais no futuro.

Um produto que mede contraste dos outros e não mede o próprio é o tipo de
incoerência que o §327 e o §328 já pegaram em outras formas.

## 2. Quem decide é a pessoa

O usuário foi explícito. Então:

- **três estados**: `sistema` (o padrão), `claro`, `escuro`;
- `sistema` segue `prefers-color-scheme`, e é o padrão porque respeitar a escolha
  que a pessoa já fez no sistema operacional é melhor que impor a nossa;
- a escolha **persiste** em `localStorage`, e é aplicada antes da primeira pintura
  para não haver o flash de tema errado.

## 3. O que esta SPEC RECUSA

- **Duas paletas.** As variáveis são as mesmas; o que muda é o valor. Duas listas
  divergem na primeira mudança (§263).
- **Um tema por tela.** O tema é do produto, não de uma página.
- **Inverter mecanicamente o escuro.** Claro não é escuro com as cores trocadas:
  a hierarquia de superfície se inverte (no escuro o painel é mais claro que o
  fundo; no claro é o contrário), e sombra passa a fazer o trabalho que a borda
  fazia.
- **Trocar o indigo.** `#4f46e5` é a cor de "escrito por gente" em 26 arquivos, e
  ela funciona nos dois temas. Ganha token e continua a mesma.

## 4. Fatias

- **A — as 147 cópias viram variável.** Mecânico e verificável. Trava: nenhum hex
  no código pode ser igual a uma variável declarada.
- **B — as cores sem token ganham um.** As duas que importam (`#4f46e5`,
  `#a5b4fc`) e as de estado. Trava: o teto de hex no código só pode cair.
- **C — a paleta clara e o seletor.** Os valores, o `[data-tema]`, o controle com
  três estados e a persistência sem flash.
- **D — a prova de contraste.** Os pares da paleta clara passam pela
  `contraste()` do próprio motor.

## 5. Perguntas em aberto

1. **Qual limiar?** WCAG AA é 4,5:1 para texto normal e 3:1 para texto grande.
   Esta rodada usa **4,5 para texto e 3 para os cinzas de apoio**, e o teste diz
   qual par usou qual.
2. **O canvas do React Flow.** Ele tem tema próprio, sobrescrito no `styles.css`.
   Vai precisar dos dois valores — e é o lugar mais provável de sobrar escuro.

## 6. O que a execução corrigiu nesta SPEC (§340)

Escrito depois de entregar, porque uma SPEC que não registra onde errou vira
mentira na próxima leitura.

- **A §5.2 acertou o lugar pelo motivo errado.** O canvas foi mesmo onde sobrou
  escuro, mas não por causa do tema próprio do React Flow — as regras de CSS já
  liam variáveis. Sobrou porque `maskColor` é **prop**, e o valor estava escrito
  em `rgba()`, que a medição do §0 (só `#rrggbb`) nunca contou.
- **O §0 subcontou.** Além dos 312 hexes, havia 99 ocorrências de `rgba()` e 50
  usos de `var(--x, #hex)` — e em quatro desses o fallback era quem pintava,
  porque a variável nunca foi declarada.
- **A fatia A precisou de um segundo critério.** "Nenhum hex igual a uma
  variável" não alcança cor densa que nunca teve variável. O critério que
  funciona é a **densidade**: acima de 25% de opacidade a cor impõe um tema.
- **Nem toda cor crua é defeito.** Lavagem translúcida de acento, véu de modal e
  cor de marca de terceiro são legítimos, e a trava os declara com o motivo em
  vez de silenciá-los com um número.

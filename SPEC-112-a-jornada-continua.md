# SPEC-112 — A jornada contínua: o nó opcional, e trabalhar dentro do fluxo

> **A tese, nas palavras do usuário:** *"nosso objetivo era tornar parecido com
> um low code, capacidade de conectar via diagrama os fluxos e fazer a jornada
> contínua"*. E o relato que a abriu: *"pego 'Fluxo completo: aprovação de
> crédito' e vou em derivar, vai para a tela do documento. Como fazer o ensaio?
> Como ter aquela tela de geração?"*

## 1. O problema é um só, com três sintomas

A SPEC-110 construiu o encanamento inteiro e ele funciona. Mas ele mora no
canvas de fluxos, **e o canvas é o único lugar do produto onde se conecta
alguma coisa — e é o lugar aonde ninguém vai.** As duas telas por onde se
entra tratam fluxo como assunto de outro departamento:

| Onde | Sintoma medido | O que falta |
|---|---|---|
| Mesa | derivar → documento → fim | a jornada não é contínua |
| Galeria | fluxos e telas em listas separadas | a relação não é navegável |
| Canvas | conecta de verdade | ninguém chega lá |

## 2. Medições (main `3106a37`, no navegador)

**M1 — A mesa oferece DOIS gestos**: `Salvar` e `Derivar Quebra`. Nenhuma porta
para ensaiar, para a esteira, para a jornada.

**M2 — A porta do ensaio não parece porta.** Não há botão "Ensaiar". O caminho
é clicar no chip **"⏱ resposta ≥ 3,0 s"** (`leitura-resumo`), que se lê como
resultado, e só então `abrir-simulacao` aparece no popover.

**M3 — O Derivar nasce morto e mudo.** `App.tsx:1889`:
`disabled={vermelhos.length > 0}`, com o motivo só no `title` (`:1892`).
Tooltip não existe em toque, e num botão desabilitado é fácil nem tentar. **O
cenário PRONTO da casa carrega com 3 vermelhos** — o primeiro contato de quem
experimenta o produto é um botão morto que não se explica.

**M4 — O remédio está a dez centímetros, desligado.** A mesma barra tem
`VERMELHO 3` e `▶ Próximo pendente (3)`, que navega até os nós. Nada liga um ao
outro.

**M5 — A galeria conta a relação, não a percorre.** O card da tela mostra
`usada em N fluxos` num `<span>` **não clicável**; o card do fluxo não diz
quais telas contém. A relação existe no dado (nó `tela:<id>`) e some na tela.

**M6 — As peças da jornada contínua JÁ EXISTEM e não estão sendo usadas.**
`TELAS_DO_SISTEMA` (`telas.ts:74`) tem `mesa`, `documento` e
`bancada-de-ensaios` como TELAS — nós de fluxo em que a execução para, com a
moldura Avançar/Retornar por cima da tela real (o App já delega: `mesa` →
canvas, `documento` → documento). **A `jornada-da-demanda` da SPEC-110 J não as
inclui** — ela tem só subfluxos.

**M7 — O motor já roda um PEDAÇO do fluxo.** `ateNo`
(`casos-de-uso/fluxos.ts:214`) filtra o plano para o fecho de ancestrais do nó
escolhido. É a mecânica de "rodar só esta etapa", pronta.

**M8 — Mas nó que não roda DERRUBA quem depende dele.** Regra 1 do executor:
*"a origem X não rodou — entrada ausente não vira default"*. Um nó plugado e
pulado mataria o resto da linha. **É este o buraco entre o desenho que o
usuário pediu e o motor que existe.**

## 3. As decisões (respondidas pelo usuário)

- **D1. O ensaio é CONDICIONAL e fica PLUGADO no diagrama.** Palavras dele:
  *"é condicional, portanto o usuário clica e usa se quiser"* e *"plugada por
  conector, o sistema deve ser capaz de lidar com isso"*. Ou seja: a etapa
  **não sai** do desenho — ela fica ligada por aresta, visível e religável, e é
  o MOTOR que precisa saber que ela não roda sozinha.
- **D2. "Aquela tela de geração" é o PIPELINE DE AGENTES** — a esteira rodando
  ao vivo sobre a demanda aberta.
- **D3. O portão do Derivar está CERTO**: *"se o requisito de refinamento for
  obrigatório, não deve habilitar o derivar"*. Muda a **comunicação**, não a
  regra.
- **D4. A conexão se faz PELO DIAGRAMA.** A jornada não é sequência escrita no
  shell: é um fluxo que se edita no canvas. Mudar a jornada é mudar o desenho
  dela — é isso que faz o produto ser low-code em vez de ganhar mais um botão.
- **D5. O nó pulado APARECE no rastro**, como `pulado`. Sem isso quem lê a
  execução não distingue "não existia no desenho" de "não rodou desta vez".

## 4. O nó opcional: a semântica, e o que ela NÃO é

**Isto é mudança de MOTOR.** Um rascunho anterior desta SPEC prometia "nada de
motor novo"; com a D1 a promessa cai, e dizer o contrário seria mentira. O que
entra é pequeno e nomeado:

| | Comportamento |
|---|---|
| `NoDoFluxo.opcional` | dado do desenho, editável no painel do nó |
| Corrida linear | pula o nó opcional — a jornada passa direto |
| Rastro | registra `pulado` (D5), distinto de `nao-executado` |
| Aresta que SAI dele | **não derruba** o destino; ela só não traz dado |
| Se o destino exigir o campo | falha nomeando — a régua §9.3 fica de pé |
| O gesto | clicar o nó no canvas → "rodar esta etapa", reusando `ateNo` (M7) |

**O que isto não é:** não é `if/else` com predicado. A SPEC-110 §8 declarou
condicional como lacuna sem spec, e este desenho não finge preenchê-la — ele diz
apenas *"este nó só roda quando alguém pede"*. Predicado, ramo e junção
continuam fora, e continuam sem spec.

## 5. As fatias

### Fatia A — o nó opcional no motor

A fundação: sem ela a jornada com o ensaio plugado não roda.

- `opcional` no tipo do nó; `pulado` no rastro; a aresta de um pulado não
  derruba o destino; painel do nó com a marcação.
- Gesto no canvas: "rodar esta etapa" a partir do nó (reusa `ateNo`).
- **Provas**: unidade do executor (pula; não derruba; o obrigatório ausente
  ainda falha nomeando; o rastro diz `pulado`); §248 em cada.

### Fatia B — o Derivar diz por que está morto

Independe de tudo e resolve sozinha o pior sintoma (M3/M4).

- No CORPO da tela: *"3 componentes com campo obrigatório em branco: …"*, com
  `▶ Próximo pendente` ao lado como ação.
- **Provas**: unidade da frase; E2E que lê o motivo **sem hover** e chega ao nó.

### Fatia C — a jornada de fábrica inclui as telas de trabalho

O coração (M6 + D4). A `jornada-da-demanda` derivada passa a ser:

```
gatilho → TELA(mesa) → [ensaio]* → [esteira] → TELA(documento) → [exportar] + [publicar]
                        (* opcional, plugado)
```

- Rodar a jornada PARA na mesa; **Avançar** segue. O ensaio está no desenho,
  plugado, e só roda se a pessoa clicar nele (fatia A).
- A moldura já diz onde se está (*"Jornada da demanda › Mesa de projeto"*).
- **Provas**: unidade da derivação; E2E da jornada ponta a ponta; §248.

### Fatia D — a galeria mostra a relação, nos dois sentidos

M5. Card da tela: `usada em N fluxos` vira porta. Card do fluxo: diz quais
telas contém, com porta para cada uma.

### Fatia E — o laço do ensaio fecha de onde veio

Quem chegou à bancada vindo da mesa volta para a mesa; quem veio do canvas
volta para o canvas. A origem sobrevive ao F5 (R2).

## 6. O que esta SPEC NÃO faz

- **Não mexe na régua do Derivar** (D3).
- **Não inventa condicional com predicado** (§4).
- **Não tira o ensaio do diagrama** (D1) — ele fica plugado.

## 7. Riscos nomeados

- **R1 — A barra da mesa já tem vinte botões.** Qualquer acréscimo pede
  validação visual nos dois temas.
- **R2 — "De onde vim" precisa sobreviver ao F5** (fatia E).
- **R3 — A jornada com telas muda o que "rodar a jornada" significa.** Antes
  corria até a bancada; agora para no primeiro nó, por desenho. Os E2E da
  SPEC-110 J precisam ser RELIDOS, não só re-executados.
- **R4 — `pulado` é estado novo no rastro.** Toda leitura de rastro (canvas,
  histórico, saúde da galeria) precisa saber o que fazer com ele; tratá-lo como
  falha pintaria de vermelho uma jornada saudável.

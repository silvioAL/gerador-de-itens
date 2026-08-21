# Contexto e Arquitetura — Gerador de Itens

Este documento é a base que **toda spec nova deve assumir como lida**. Ele
descreve o produto **como ele está**, não como foi planejado: quando a
construção divergiu do plano, o que vale é o que está aqui.

Ele nasceu retroativamente (as SPEC-01/02/03 o assumiam e ele nunca tinha sido
escrito) e foi **reescrito no §279**, porque tinha envelhecido até mentir — ainda
descrevia uma ferramenta local, com estado em arquivo git, um `packages/cli` e
"não é multi-tenant". Nada disso é verdade desde a SPEC-33. O histórico de como
se chegou aqui é do `JOURNEY.md`; o porquê de cada mecanismo é das `SPEC-*.md`.
Aqui fica o retrato.

---

## 1. Por que este projeto existe

Existia uma ferramenta em uso (`gerador_de_itens-2.html`, protótipo de página
única) que gerava itens de backlog a partir de uma descrição de mudança de
arquitetura. Ela resolvia um problema real — sem ela, cada quebra técnica
reinventa do zero quais perguntas fazer sobre uma fila nova, um endpoint novo,
uma integração nova — mas carregava problemas estruturais que motivaram a
reescrita: estado lido de volta do DOM, regras presas em `switch` inline,
`localStorage` como fonte da verdade, nenhuma proveniência, e cobertura desigual
entre tecnologias (o detalhe de uma fila Rabbit não tinha equivalente para
Kafka, Mongo, SQL, Camunda, FICO).

O objetivo nunca foi "reescrever a mesma ferramenta melhor". É mudar **o que a
ferramenta força a pessoa a decidir antes de escrever código**, e fazer isso sem
travar em Rabbit como domínio único.

O que o produto virou desde então, e que o protótipo não tinha: o desenho deixou
de ser só entrada de backlog e passou a ser **medido** (§4.3), a carregar **por
que é assim** (decisões, exceções), e a produzir um **documento que circula** —
não só uma lista de tarefas.

## 2. O que este projeto **não** é

- **Não é um editor de diagramas genérico.** O diagrama é meio, não fim — existe
  para produzir prontidão, medição e backlog, não para desenhar bonito.
- **Não é um gerador de backlog por IA.** Nenhuma atividade nasce de um LLM
  interpretando texto solto: atividades são saída determinística de `derivar()`
  sobre um diagrama real. A IA **escreve** o corpo do item e **propõe** decisões,
  propósito e diagrama — e nada do que ela produz conta como decidido até alguém
  confirmar (§4.2). A fronteira é essa, e ela não se move.
- **Não é uma ferramenta local.** Foi, até a SPEC-33. Hoje é servidor + banco +
  navegador, com organização, times, níveis e RBAC. Não existe mais modo
  offline nem `gerador open`, e **nada neste repositório publica no npm** — o
  pacote antigo continua lá, sem receber versão nova.
- **Não é multi-tenant de verdade.** Existe **uma** organização por deploy. A
  tabela `organizacoes` é real (e não conceitual) porque a empresa pode um dia
  querer mais de uma, mas não há isolamento de banco por tenant nem UI para
  criar organização.

## 3. As três portas de entrada

1. **Desenhar** — a pessoa compõe o diagrama nó a nó na mesa de projeto; o
   painel de propriedades pergunta o que precisa ser decidido, e a prontidão
   mostra o que falta.
2. **Conversar** — descreve a demanda por texto ou voz e o agente **propõe** um
   diagrama, que entra pelo mesmo caminho de um cenário carregado: nós comuns,
   editáveis, indistinguíveis dos criados no clique. Nenhum canal paralelo de
   escrita (SPEC-27/30).
3. **Abrir o que já existe** — a demanda salva volta inteira (desenho,
   propósito, decisões, percursos, respostas, documento). Descrever um sistema
   que já roda continua sendo trabalho de quem o conhece: nós `status:
   existente` são marcados à mão, e a proveniência diz de onde veio cada valor.

> Houve um importador de `graph.json` do Graphify (SPEC-06 §5), removido no §212:
> exigia um mapeamento caminho→tipo que só quem conhecia o formato mantinha, e
> não era usado.

## 4. As réguas

São o que não muda entre specs. Quando uma spec nova contraria uma delas, ou ela
está errada ou a régua precisa ser revista **explicitamente** — nunca em
silêncio.

### 4.1 Mecanismo, nunca caso particular

- **Config-driven.** Tipo de nó, campo, condição de visibilidade, regra de
  conexão — o engine não sabe o que é "rabbit" ou "kafka"; sabe interpretar
  `NodeTypeConfig`/`FieldSpec`. Mudar o engine para acomodar um campo específico
  é o erro que a SPEC-03 já advertia.
- **Derivação determinística.** Diagrama → atividades é função pura de
  `(diagrama, config, contexto)`.
- **Chave estável vs rótulo.** A atividade tem chave que nunca muda
  (`n2::criacao`) e rótulo sequencial recalculado a cada derivação (`04`). Merge,
  citação e rastro de exportação usam a chave.
- **Falhar alto, nunca em silêncio.** Config inválida impede a subida apontando o
  campo exato, em vez de fazer o requisito sumir.

### 4.2 Nada da máquina vale sem uma pessoa

- **Proveniência de cada valor** — `manual` | `extraido` | `inferido` |
  `sugerido`. Valor `inferido`/`sugerido` não confirmado **nunca** conta como
  preenchido para a prontidão.
- A mesma regra vale um nível acima: **decisão** proposta pelo agente nasce
  `proposta` e não vale nada até alguém aceitar; **percurso** inferido não conta
  até ser confirmado; **necessidade** sugerida idem.
- **Prontidão em semáforo.** Vermelho bloqueia, amarelo não — bloquear no amarelo
  criaria pressão para confirmar sem ler.

### 4.3 O desenho é medido, e a medida ensina

- O padrão do time vira **régua conferível** (`checagem`: campo, operador,
  valor), e o motor aponta onde o desenho sai dela.
- Régua sem porquê é ordem: a violação carrega o **motivo do padrão**, e a
  exceção aceita carrega o **motivo de contrariá-lo**, com autor.
- Uma classe de defeito não mora em elemento nenhum, mora no **caminho** — cinco
  saltos de 400ms são cinco nós dentro do padrão e um percurso de dois segundos.

### 4.4 Nada some em silêncio

É a régua que mais aparece em achado real, e vale para o produto inteiro:

- necessidade cujo elemento foi apagado continua aparecendo, como lacuna;
- decisão ancorada em nó que sumiu vira **órfã**, não é apagada;
- decisão revista guarda `substituidaPor` — quem apaga a decisão revista faz o
  time repetir o ciclo que a produziu;
- item escrito cuja chave sumiu da derivação aparece marcado como órfão;
- e **o "não" também é decisão**: descartar um feedback ou recusar um ajuste fica
  registrado, com motivo, e pode ser reconsiderado (SPEC-62).

### 4.5 Ver o efeito antes de aplicar

Toda mudança de configuração que o produto oferece aplicar sozinho mostra o
efeito **num item de exemplo** antes da decisão, calculado pela mesma função pura
que vai aplicar. Prévia que use outra lógica é promessa que a execução não
cumpre.

### 4.6 Capacidade que o tour não mostra não existe

Para quem está avaliando a ferramenta, o que o tour não percorre não existe
(§244). Funcionalidade nova pede passo novo — ou a constatação explícita de que
ela não merece um.

## 5. Arquitetura como construída

Servidor **Fastify + Postgres**, front **Vite + React + React Flow**, tudo
TypeScript, empacotado em Docker. Um runtime só (SPEC-33): o modo local morreu, e
com ele a implementação dupla do domínio.

```
gerador/
├── packages/
│   ├── engine/      TS PURO, zero I/O — o núcleo do hexágono.
│   │                model · spec (condições) · readiness · derive ·
│   │                dependency (ciclos/conflitos) · refinamento · revisao ·
│   │                proposito · decisao · percurso · conformidade ·
│   │                documento · especificacao · diagrama-html · remedicao ·
│   │                pdca · procedencia · transcricao · export
│   ├── aplicacao/   casos de uso + PORTAS (interfaces de persistência,
│   │                cofre, exportador, IA) — não conhece Fastify nem SQL
│   ├── llm/         provedores de IA atrás de uma porta (`ProvedorIa`)
│   ├── server/      Fastify + Drizzle/Postgres — routes, ADAPTADORES das
│   │                portas, auth/RBAC, migrations
│   └── web/         React — mesa de projeto, revisão, documento, config,
│                    mapa do sistema, assistente
├── config/          diagrama/app (arquivo, ver §6) · cenarios/ · domains/
├── fixtures/        casos compartilhados entre as suítes
├── infra/, Dockerfile, docker-compose*.yml, Caddyfile, nginx.conf
└── SPEC-*.md, JOURNEY.md
```

### 5.1 O hexágono, e por que ele existe

O domínio esteve implementado **duas vezes** — uma contra arquivo, outra contra
Postgres — e as duas divergiam sozinhas (SPEC-31 mediu ~2.560 linhas do mesmo
domínio em dois lugares; a consequência documentada foi rota de IA que só
existia de um lado). As portas mataram a divergência na persistência; o **modo
único** (SPEC-33) matou a causa.

O que sobrou é a disciplina: `packages/engine` não importa infraestrutura, e
`boundary.sanity.test.ts` reprova quem tentar. Persistência nova é adaptador
novo, não reescrita.

### 5.2 As telas, e o endereço de cada uma

Rota em **hash** (`#/config/membros`), sem lib de router: o deploy é estático e
hash preserva F5 e deep-link sem tocar no servidor.

| Rota | O que é |
|---|---|
| `#/` | a **mesa de projeto** — canvas, paleta, painel de propriedades, placar |
| `#/documento` | o **documento de desenho**: contexto, necessidades, o desenho como figura, decisões, o que foi conferido, trade-offs/riscos escritos por gente, e **a seção dos itens** |
| `#/config/<área>` | as doze áreas de configuração (produto, stacks, padrões por componente, campos de conexão, regras, especificação, exportação, membros, acessos, pipeline de IA, modelo de IA, PDCA) |
| `#/sistema` | **como a ferramenta está montada**: o que o motor confere, quem escreve o quê na esteira, e o ciclo que muda os dois |

A **revisão** não tem rota própria: ela cobre a mesa quando existe derivação, e
é onde se *trabalha* o item. O documento é onde se *lê* o resultado — a distinção
que sobreviveu à SPEC-61, que matou `#/itens` (rota morta **redireciona**, nunca
dá tela branca).

### 5.3 Onde a IA entra

- **A esteira** (SPEC-24): papéis em sequência sobre o mesmo item — história e
  critérios, contrato de arquitetura, refinamento técnico, regras de teste. Cada
  papel tem estado visível no mapa do sistema (ativo, desligado, sem modelo,
  falhou) e deixa rastro de execução.
- **O assistente** conduz por momentos (o balão), propõe diagrama, propósito e
  decisões, e coleta o feedback que alimenta o PDCA.
- Tudo passa por um provedor atrás de porta, com credencial no cofre. O que a IA
  escreve chega como `sugerido` e espera assinatura.

## 6. Onde mora a configuração (arquivo × banco)

Esta é a pergunta que mais confunde quem chega, e a resposta não é uniforme:

| O quê | Onde | Por quê |
|---|---|---|
| tipos de nó e aresta (`diagrama.json`), vocabulário (`app.json`) | **arquivo**, servido em `/config/` (volume no Docker) | é a forma do domínio daquele deploy; muda por instalação, não por uso |
| cenários prontos, domínios de exemplo | **arquivo** | material de demonstração |
| regras de refinamento, template de especificação e de item, pipeline de agentes, cadência do PDCA | **banco** (`config_documentos`) | é o que MAIS muda, e muda pela tela |
| campos por componente e por conexão | **banco** (`campos_no`, `campos_aresta`), sobrepondo o `spec` estático por `key` | extensão por time, sem editar arquivo |
| stacks conhecidas, produtos, credenciais de IA | **banco** | curadoria contínua |

> Já houve o defeito de as duas fontes disputarem: a regra criada pela aba
> gravava no banco e a revisão lia o arquivo servido. Hoje o banco manda e o
> arquivo é fallback.

## 7. Quem pode o quê

- **Organização → times → membros**, com três níveis (`visualizar`, `operar`,
  `owner`).
- **RBAC por recurso** por cima disso: papéis com permissões (`regras.*`,
  `campos-no`, `pipeline-agentes`, `acessos`…). Área que a pessoa não edita
  **some do menu** — listar o que não se administra é ruído em toda abertura.
- Quem chega por deep-link numa área sem permissão cai numa tela que explica e
  oferece **pedir ajuste** — o pedido vira solicitação para quem decide.
- Toda escrita relevante deixa **auditoria**.

## 8. O ciclo que muda a ferramenta

O PDCA das configurações fecha o laço, e é a parte mais fácil de implementar
errado:

**Check** — o assistente pergunta o que faltou ou sobrou; o que as pessoas
respondem entra em "O que disseram". **Plan** — o feedback vira solicitação de
ajuste no estúdio, com prévia do efeito. **Act** — quem tem a permissão decide
vendo de onde o pedido veio e o que ele faz; aprovar + aplicar muda a
configuração de verdade, com registro de quem aplicou.

> Escrever direto na fila de decisão pula dois tempos do ciclo, e foi um defeito
> real (SPEC-62). Tudo que uma pessoa diz entra pelo mesmo lugar.

## 9. O que ainda não existe

- **Edição do canvas do sistema** (`#/sistema` lê e leva às telas que editam;
  ligar/desligar e reordenar papéis já valem ali).
- **Waypoints manuais de aresta** — roteamento automático apenas.
- **Versão de configuração por time** para campos (a validade do pedido de
  ajuste é checada por documento, e campos não têm documento versionado).
- **Itens de backlog manuais fora do diagrama** — *decisão explícita de não
  fazer*: todo item nasce de um nó/aresta real, nunca de texto solto (§2).
- **Multi-organização de verdade** — ver §2.

## 10. Convenções para quem for escrever a próxima spec

- Se a mudança é sobre **o que um tipo de nó pergunta**, é config — spec própria
  só se o domínio for grande o bastante (ver SPEC-04).
- Se a mudança exige tocar `packages/engine/src/`, pare e pergunte se o mecanismo
  genérico não está bom o bastante.
- **Persistência nova é adaptador**, atrás de uma porta em `packages/aplicacao`.
  Rota que fala SQL de domínio é dívida no dia em que nasce.
- Toda fixture nova em `fixtures/` é lida por engine **e** web — nunca copiada.
- Config nova em `config/*.example.json` passa em `validateConfig`/`validateRegras`.
- **Toda rodada ganha entrada no `JOURNEY.md`**, grande ou pequena; mudança
  estrutural ganha `SPEC-*.md`. Achado real do usuário entra citado, com a frase
  dele — é o que impede a próxima pessoa de "consertar" de novo o que já foi
  decidido.
- E antes de dizer que está pronto: **reproduza contra o app rodando**, não só
  contra a suíte verde.

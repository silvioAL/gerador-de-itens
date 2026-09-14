# SPEC-116 — Avaliação: o backend em Spring Boot / Java 21

> **Origem:** o usuário — *"precisamos refatorar o backend para um projeto
> spring boot com java 21."* Pedido para levantar em spec, para implementar
> numa conversa nova — esta SPEC avalia, não implementa (mesmo molde da
> SPEC-55 para o Forge, e da SPEC-75 para mapeamento de contexto).

---

## 1. O que já foi decidido aqui, e por quê — para não reabrir sem saber o que se está reabrindo

A primeira decisão registrada de todo este projeto (JOURNEY.md §2) foi
**contra** uma stack Java + TypeScript separada:

> *"Isso permitiu TypeScript de ponta a ponta, o que por sua vez eliminou o
> maior risco estrutural do plano original: duas implementações do avaliador
> de condições (Java + TS) que precisavam ficar sincronizadas via fixture
> compartilhada. Com um runtime só, essa categoria inteira de bug deixou de
> poder existir."*

Isso não é nostalgia arquitetural — é o motivo pelo qual `packages/engine` e
`packages/aplicacao` (o motor de derivação, a lógica de negócio, os casos de
uso) são **hoje o mesmo código que roda no navegador e no servidor**. Uma
migração de "o backend" para Java reabre exatamente essa pergunta, e a SPEC
que propuser a migração precisa responder: **o motor migra junto, ou fica
duplicado?**

## 2. O que existe hoje, medido

| Pacote | Linhas de produção (sem teste) | Roda onde |
|---|---|---|
| `engine` | 11.150 | navegador **e** servidor |
| `aplicacao` | 5.147 | navegador **e** servidor |
| `server` | 7.238 | só servidor (Fastify, rotas, Drizzle/Postgres) |
| `llm` | 2.642 | só servidor (gateway de IA) |

**A pergunta que decide o tamanho real da migração não é "quantas linhas tem
o server"** (7.238 seria a leitura ingênua) — é **quanto de `engine` e
`aplicacao` o servidor de fato usa em runtime**, porque essa fatia:

- ou migra para Java também (reabrindo a duplicação que a fundação deste
  projeto eliminou — agora Java no servidor, TypeScript no navegador, e a
  MESMA lógica de derivação/validação escrita duas vezes);
- ou o servidor Java passa a chamar de volta um serviço Node só para essa
  lógica (uma segunda rede interna, para um problema que hoje é uma chamada
  de função);
- ou o motor vira uma biblioteca Java NOVA, escrita do zero, com risco de
  divergir do motor que o navegador usa — o `structuredClone`/fixture
  compartilhado do parágrafo citado acima, na íntegra.

**Nenhuma das três é gratuita**, e a SPEC de implementação não pode escolher
uma sem medir qual das três é menos ruim — o que não foi medido ainda.

## 3. Os testes de contrato dependem de rodar os DOIS lados hoje

`contratoDeItensGerados.ts`, `contratoDeCredenciais.ts`,
`contratoDeCamposNo.ts` (e mais) são suítes que QUALQUER adaptador de uma
porta precisa passar — hoje isso significa "roda a mesma suíte TS contra
Postgres real e contra o dublê em memória". Um servidor Java implementaria
essas portas numa linguagem diferente da suíte que as definiu; a régua vira
"a mesma suíte de contrato, reescrita em Java, cobrindo o mesmo
comportamento" — outro par de implementações a manter sincronizadas.

## 4. O que Spring Boot / Java 21 traria de real (o lado que a avaliação não pode omitir)

Para não virar uma recusa disfarçada de avaliação — algumas razões legítimas
de se querer isso, e o que cada uma pede como resposta:

| Motivo possível | O que precisaria ser verdade pra justificar |
|---|---|
| Equipe/organização já é majoritariamente Java | Medição de quem vai manter o código — não medido nesta conversa |
| Requisito de compliance/infra que só aceita JVM | Fato externo, concreto — não medido nesta conversa |
| Performance/concorrência do servidor Node é gargalo medido | Não há medição de performance neste repositório hoje |
| Ecossistema Spring (Security, observability) resolve algo que Fastify não resolve | O produto já tem RBAC, sessão, auditoria — comparar o que falta de verdade, não presumir |

**Nenhuma dessas quatro foi citada no pedido original.** Sem saber qual (se
alguma) é o motivo real, a SPEC de implementação corre o risco de otimizar
para o problema errado — a mesma armadilha que a SPEC-75 nomeou para o
mapeamento de contexto.

## 5. O que esta avaliação RECOMENDA

**Não iniciar a reescrita sem antes responder, nesta ordem:**

1. **Por quê**, especificamente — qual das linhas do §4 (ou outra) é o motivo
   real. Muda o desenho inteiro.
2. **`engine`/`aplicacao` migram, viram serviço à parte, ou o servidor Java
   os chama por rede?** — a decisão do §2, e ela é estrutural, não de
   detalhe.
3. **Escopo do "backend"**: é só `server` (rotas HTTP, Postgres), ou inclui
   `llm` (gateway de IA) e a orquestração da esteira? Cada um tem
   dependências e formato de teste diferentes.
4. **Uma fatia piloto**, não o todo: migrar a superfície MAIS ISOLADA
   primeiro (candidato: as rotas de configuração, que são as mais parecidas
   com CRUD simples) e medir o custo real de UMA fatia antes de comprometer
   o resto — a mesma disciplina que a SPEC-55 usou para avaliar o Forge.

## 6. O que esta SPEC RECUSA

- **Estimar prazo ou fatiar a migração inteira sem resposta às quatro
  perguntas do §5.** Um cronograma sobre motivo desconhecido é ficção.
- **Presumir que "backend" exclui `engine`/`aplicacao`.** Já demonstrado no
  §2 que são a maior parte do que o servidor executa.
- **Migrar reescrevendo do zero em vez de traduzindo com os testes de
  contrato como especificação.** As suítes de contrato já são, na prática,
  a especificação executável de cada porta — usá-las como alvo de paridade
  (rodar a MESMA suíte, adaptada, contra a implementação Java) é mais barato
  e mais seguro que reescrever e confiar na leitura humana do código antigo.

## 7. Se a resposta às quatro perguntas justificar seguir — as fatias prováveis

Não fatiado em detalhe (depende das respostas do §5), mas a forma esperada:

- **A — decidir e documentar as 4 respostas do §5.**
- **B — a fatia piloto**, com prova de paridade via suíte de contrato
  adaptada, rodando em paralelo ao servidor Node (não substituindo ainda).
- **C — medir o custo real da fatia piloto** (tempo, linhas, bugs de
  paridade encontrados) antes de decidir se as fatias seguintes têm o mesmo
  tamanho relativo do que o `server` sozinho sugeriria.
- **D — a fatia de `engine`/`aplicacao`**, na forma que o §5.2 decidir —
  provavelmente a mais cara e a mais arriscada de todas, por ser a que este
  projeto está estruturado, desde o início, para NÃO ter duplicada.

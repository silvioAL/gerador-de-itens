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

### ✅ Respondido pelo usuário, na revisão desta SPEC

> *"preciso que o backend vire um projeto Spring Boot, pois vou levar esse
> projeto para a empresa e esse é o padrão lá."*

**É a primeira linha da tabela, e é um fato externo concreto — não uma
preferência técnica a debater.** "Levar para a empresa, onde Java/Spring é o
padrão" muda a régua do §6 (recusa de "presumir motivo"): o motivo está
dado, e não é performance nem lacuna do Fastify — é adoção organizacional. Isso
tem uma consequência prática direta: **a paridade de comportamento importa
mais que a elegância da tradução**, porque quem vai manter o código depois
é o time da empresa, não necessariamente quem está migrando agora. A fatia
piloto (§7.B) e a suíte de contrato como especificação (§6) ficam ainda mais
importantes com essa resposta, não menos.

## 5. O que esta avaliação RECOMENDA

**A pergunta 1 abaixo está respondida (ver acima). As demais continuam em
aberto — não iniciar a reescrita sem respondê-las:**

1. ~~Por quê, especificamente~~ — **respondido: adoção organizacional
   ("padrão da empresa"), não performance nem lacuna técnica.**
2. **`engine`/`aplicacao` migram, viram serviço à parte, ou o servidor Java
   os chama por rede?** — a decisão do §2, e ela é estrutural, não de
   detalhe. **Sem resposta ainda, e agora mais urgente**: se o destino é uma
   empresa com padrão Java, faz pouco sentido a organização herdar um
   componente TypeScript (`engine`/`aplicacao`) que continua sendo a maior
   parte da lógica — o motivo dado no §4 empurra para migrar TUDO, não só
   `server`.
3. **Escopo do "backend"**: é só `server` (rotas HTTP, Postgres), ou inclui
   `llm` (gateway de IA) e a orquestração da esteira? Cada um tem
   dependências e formato de teste diferentes.
4. **Uma fatia piloto**, não o todo: migrar a superfície MAIS ISOLADA
   primeiro (candidato: as rotas de configuração, que são as mais parecidas
   com CRUD simples) e medir o custo real de UMA fatia antes de comprometer
   o resto — a mesma disciplina que a SPEC-55 usou para avaliar o Forge.

## 6. O que esta SPEC RECUSA

- **Estimar prazo ou fatiar a migração inteira sem resposta às perguntas 2-4
  do §5** (a 1 já está respondida). Um cronograma sem saber o escopo real
  (§5.2/§5.3) é ficção.
- **Presumir que "backend" exclui `engine`/`aplicacao`.** Já demonstrado no
  §2 que são a maior parte do que o servidor executa.
- **Migrar reescrevendo do zero em vez de traduzindo com os testes de
  contrato como especificação.** As suítes de contrato já são, na prática,
  a especificação executável de cada porta — usá-las como alvo de paridade
  (rodar a MESMA suíte, adaptada, contra a implementação Java) é mais barato
  e mais seguro que reescrever e confiar na leitura humana do código antigo.

## 7. Com o motivo já respondido — as fatias prováveis

Não fatiado em detalhe (depende das respostas 2-4 do §5, ainda em aberto),
mas a forma esperada:

- **A — decidir e documentar as respostas 2-4 do §5** (a 1 já está feita).
- **B — a fatia piloto**, com prova de paridade via suíte de contrato
  adaptada, rodando em paralelo ao servidor Node (não substituindo ainda).
- **C — medir o custo real da fatia piloto** (tempo, linhas, bugs de
  paridade encontrados) antes de decidir se as fatias seguintes têm o mesmo
  tamanho relativo do que o `server` sozinho sugeriria.
- **D — a fatia de `engine`/`aplicacao`**, na forma que o §5.2 decidir —
  provavelmente a mais cara e a mais arriscada de todas, por ser a que este
  projeto está estruturado, desde o início, para NÃO ter duplicada.

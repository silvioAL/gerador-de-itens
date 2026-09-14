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

**As perguntas 1, 2 e 3 abaixo estão respondidas. A 4 continua em aberto —
não iniciar a reescrita sem respondê-la:**

1. ~~Por quê, especificamente~~ — **respondido: adoção organizacional
   ("padrão da empresa"), não performance nem lacuna técnica.**
2. ~~`engine`/`aplicacao` migram, viram serviço à parte, ou o servidor Java
   os chama por rede?~~ — **respondido, e na direção mais radical das três**:
   *"o que é backend precisa ir para o serviço Spring, não quero motor e
   outras coisas rodando em front, o front deve ser só o que deveria ser."*
   Não é só "engine migra para Java" — é **"o navegador para de rodar o
   motor"**. Ver §5.1 abaixo: isso muda a UX de hoje, e a mudança precisa
   estar visível antes de alguém começar a implementar achando que é só
   trocar a linguagem do servidor.
3. ~~Escopo do "backend"~~ — **respondido: tudo (`server` + `llm` +
   orquestração da esteira).** Sem partes híbridas permanentes em Node.
4. **Uma fatia piloto**, não o todo: migrar a superfície MAIS ISOLADA
   primeiro e medir o custo real de UMA fatia antes de comprometer o resto —
   a mesma disciplina que a SPEC-55 usou para avaliar o Forge. **Ainda sem
   candidato escolhido** — ver §5.2 para opções.

### 5.1 ⚠️ A consequência que a resposta 2 traz, e que precisa estar visível antes de implementar

Hoje `derivar()`, `gerarSpec()`, `gerarItensDeTrabalho()` e o resto do motor
rodam **no navegador, dentro de `useMemo`, síncronos** — é o que dá o
preview instantâneo da mesa (editar um nó e ver o diagrama/documento
reagir na hora, sem round-trip de rede). É a arquitetura que o `App.tsx`
inteiro pressupõe hoje, em dezenas de lugares.

**Com o motor só no Spring, toda essa reação instantânea vira chamada de
rede.** Não é detalhe de implementação — é uma mudança de UX que precisa ser
decidida conscientemente, com uma das saídas (nenhuma é de graça):

| Saída | Custo |
|---|---|
| **Chamar o backend a cada edição** (debounced) | Introduz espera onde hoje não existe nenhuma — o preview deixa de ser instantâneo |
| **Otimista + reconciliação** (mostra local, confirma depois) | Mais trabalho de engenharia; exige decidir o que fazer quando backend e preview local divergem |
| **Motor client-side FINO, só para preview visual** (não decide nada, só refletir) | Parece contradizer *"não quero motor rodando em front"* — precisa confirmar se isto conta como "motor" ou como "renderização" |

**Esta SPEC não escolhe entre as três** — é decisão de produto, não só de
arquitetura, porque muda como a ferramenta SE SENTE ao usar. Precisa ser
respondida antes da fatia E (§7), não durante.

### 5.2 Candidatos à fatia piloto, para escolher

- **Rotas de configuração** (`config.ts`) — mais parecidas com CRUD simples,
  menor superfície de regra de negócio.
- **`leitorDeAdr`/`escritorDeAdr`/`publicadorDeDocumento`** (SPEC-81) — já
  são portas isoladas, com contrato de teste próprio, sem tocar no motor de
  derivação.
- **Autenticação/sessão** — toca em segurança cedo, o que tem valor de medir
  logo, mas é código sensível para ser o primeiro experimento.

## 6. O que esta SPEC RECUSA

- **Estimar prazo ou fatiar a migração inteira sem escolher a fatia piloto
  (§5, pergunta 4).** Um cronograma sem saber por onde começar é ficção.
- **Implementar a fatia do motor (fatia E, §7) sem decidir o §5.1 antes.**
  Migrar o motor para o Spring SEM decidir o que substitui o preview
  instantâneo faria a mesa parecer quebrada (lenta, travando a cada tecla)
  em vez de faltando uma decisão de UX tomada.
- **Migrar reescrevendo do zero em vez de traduzindo com os testes de
  contrato como especificação.** As suítes de contrato já são, na prática,
  a especificação executável de cada porta — usá-las como alvo de paridade
  (rodar a MESMA suíte, adaptada, contra a implementação Java) é mais barato
  e mais seguro que reescrever e confiar na leitura humana do código antigo.

## 7. Com o motivo, o escopo e o destino do motor já respondidos — as fatias

- **A — escolher a fatia piloto** (§5.2) e decidir a saída do §5.1 (a UX do
  preview sem motor local) — as duas decisões que faltam antes de qualquer
  código.
- **B — a fatia piloto**, com prova de paridade via suíte de contrato
  adaptada, rodando em paralelo ao servidor Node (não substituindo ainda).
- **C — medir o custo real da fatia piloto** (tempo, linhas, bugs de
  paridade encontrados) antes de comprometer o resto do cronograma.
- **D — o resto de `server`/`llm`/esteira**, na ordem que o custo medido em
  C sugerir.
- **E — `engine`/`aplicacao` para o Spring, e o navegador para de rodar o
  motor.** A mais cara e a mais arriscada de todas — é a que este projeto
  estava estruturado, desde o início, para NÃO ter duplicada (§1), e agora
  também muda a UX da mesa (§5.1). Fatia própria, por último, não incluída
  na fatia piloto. **Inclui o redesenho do §8.2** (comportamento migrando
  para dentro de Entities/VOs) — não é só traduzir sintaxe.

## 8. Requisito técnico do usuário: Clean Architecture, DDD + Hexagonal, camadas, Value Objects, design patterns

> *"o backend deve usar clean architecture, DDD + Hexagonal, suas devidas
> camadas, value objects, e os design patterns que convierem."*

### 8.1 A boa notícia, medida: o desenho atual já pensa em camadas — só não com esses nomes

Isto não é começar do zero. `packages/aplicacao/src/portas/` já são
**interfaces que o domínio define e a infraestrutura implementa**
(`RepositorioDeItensGerados`, `ExportadorDeItens`, `AnexadorDeSpec`) —
literalmente a Inversão de Dependência que Hexagonal e Clean Architecture
exigem: o núcleo não conhece Postgres, Fastify, nem o gateway HTTP; quem
conhece é `packages/server/src/adaptadores/`. `casos-de-uso/` já é a camada
de aplicação (orquestra, não decide regra de negócio sozinha). O mapeamento
é direto:

| Camada (Clean/Hexagonal) | Hoje | No Spring |
|---|---|---|
| Domínio (entidades, VOs, regras) | `packages/engine/src/model/`, funções puras do engine | pacote `domain`, classes ricas (ver §8.2) |
| Aplicação (casos de uso) | `packages/aplicacao/src/casos-de-uso/` | pacote `application`, `@UseCase`/serviços de aplicação |
| Portas (interfaces) | `packages/aplicacao/src/portas/` | interfaces no pacote `domain`/`application` |
| Adaptadores de saída | `packages/server/src/adaptadores/` | `infrastructure/persistence`, `infrastructure/gateway` (JPA, WebClient) |
| Adaptadores de entrada | `packages/server/src/routes/` | `infrastructure/web` (`@RestController`) |

**O que falta não é inventar a estrutura — é migrar SEM perder a inversão de
dependência que já existe.** O risco real está em outro lugar (§8.2).

### 8.2 ⚠️ O risco real: o motor hoje é funcional, DDD tático é orientado a objeto

`engine`/`aplicacao` são, de propósito, **dados simples (interfaces) +
funções puras por fora** — `derivar(diagrama, config)`, `calcularProntidao(spec,
no)`, nunca `no.calcularProntidao()`. É um estilo funcional deliberado deste
projeto (determinístico, fácil de testar, sem estado escondido).

**DDD tático em Java tradicionalmente é o oposto**: comportamento MORA na
entidade/Value Object (`Decisao.substituirPor(nova)`, não
`substituirDecisao(decisao, nova)`), porque é isso que protege invariante —
um Value Object com setter público ou um Entity sem método que garanta sua
própria regra é "anemic domain model", o antipadrão que a literatura de DDD
mais cita.

**Traduzir mecanicamente (função vira método estático, struct vira classe
com getters/setters) não é DDD — é procedural com sintaxe de classe.** Para
o requisito ser cumprido de verdade, e não só de nome, a fatia E (§7)
precisa REDESENHAR o domínio, não só traduzir — decidir onde cada regra hoje
solta numa função pura passa a morar dentro de que Entity/VO.

### 8.3 Candidatos concretos, medidos no modelo atual

**Value Objects** (sem identidade própria, imutáveis, iguais por valor):

- `ValorSpec` (`engine/model/types.ts:10`) — valor + proveniência
  (`origem`, `evidencia`, `confianca`) já é o formato clássico de VO: dois
  `ValorSpec` com os mesmos campos são o mesmo valor, não "o mesmo objeto".
- `Alternativa` (`titulo`, `consequencia?`) dentro de `Decisao` — sem
  identidade própria, só existe como parte de uma decisão.
- Proveniência (`Origem`: `"manual" | "sugerido" | "extraido" | "herdado"`)
  — candidato a VO/enum rico, se ganhar comportamento (ex.: `podeSerSobrescrita()`).

**Entities** (identidade + ciclo de vida):

- `Quebra` — candidata a **Aggregate Root**: hoje `diagrama`, `decisoes`,
  `itensGerados`, `ensaios` são coleções soltas dentro dela, editadas por
  fora sem a `Quebra` arbitrar a própria consistência. DDD tático pediria
  que invariantes entre essas coleções (ex.: "spec não pode cobrir item que
  não existe mais" — hoje resolvido como `orfas` calculado depois, em
  `coberturaDaSpec`) fossem impossíveis de violar PELO objeto, não
  detectadas depois.
- `Decisao`, `ItemGeradoSalvo` — identidade própria (`id`), ciclo de vida
  (`status`, `estado`), candidatas a Entity dentro do aggregate `Quebra`.

**Domain Services** (regra que não pertence a uma única entidade):

- `derivar`, `resolverDependencias`, `calcularProntidao` — operam sobre MAIS
  de uma entidade/VO ao mesmo tempo; não pertencem a nenhuma sozinha. Viram
  Domain Services no sentido tático (não `@Service` do Spring, que é outra
  camada) — funções livres SEM estado, mas dentro do pacote `domain`.

**Design patterns já implícitos hoje, que a tradução Java pode nomear:**

- **Strategy** — `ExportadorDeItens`/`AnexadorDeSpec`/`PublicadorDeDocumento`
  já são estratégias intercambiáveis por configuração (o "gateway do time").
- **Factory** — `criarCasosDeUsoDeItensGerados(repo)`,
  `criarRepositorioDeItensGeradosEmPostgres(db)` já são fábricas por injeção
  de dependência manual; no Spring, viram `@Bean`/construtor com `@Autowired`.
- **Specification** — candidato para `prontosEIgnorados`/`calcularProntidao`
  (regras compostas de "pronto para X"), se o requisito de regras de negócio
  crescer a ponto de justificar o padrão formal em vez de `filter()`.

## 9. O que esta SPEC RECUSA (acréscimo do §8)

- **Chamar de "Clean Architecture" uma tradução mecânica.** Sem o
  redesenho do §8.2 (comportamento migrando para dentro de Entities/VOs), o
  resultado é Java procedural com nomes de pasta bonitos — não cumpre o
  requisito, só parece cumprir.
- **Inventar Value Objects/Entities sem candidato medido.** O §8.3 lista o
  que já existe hoje como candidato; a fatia de implementação usa essa lista
  como ponto de partida, não como catálogo fechado — mas também não parte de
  uma lousa em branco.
- **Forçar um design pattern sem necessidade.** "Os que convierem" (palavra
  do próprio pedido) significa medir onde cada padrão resolve algo que sem
  ele seria pior — Strategy e Factory já se pagam pelo que já existe hoje;
  Specification é candidato, não obrigação, até a regra de negócio pedir.

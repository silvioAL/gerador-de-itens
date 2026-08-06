# SPEC-01 — Backend, `engine/` puro e camada de tenant

**Passo 1 de §12** · Pré-requisito de tudo · Sem UI

Leia `CONTEXTO-E-ARQUITETURA.md` antes. Esta spec assume §5 (arquitetura), §6 (modelo), §7 (motor) e §5.6 (tenant). Onde houver conflito, o documento de arquitetura vence.

---

## 1. Objetivo

Backend Spring Boot com o motor determinístico funcionando e testado, persistência de quebras em Mongo com escopo de tenant, e configuração carregada de arquivo.

**Ao final deste passo, sem nenhuma tela existir**, deve ser possível: subir a aplicação, criar uma quebra via HTTP, derivar as atividades e receber o resultado com dependências resolvidas e validações.

## 2. Escopo

**Inclui:** projeto Maven, `docker-compose` com Mongo, `TenantContext`/`TenantFilter`/`TenantAwareMongo`, carga e validação de `config/*.json`, modelo de domínio, avaliador de condições, prontidão, derivação, dependências, CRUD de quebra, endpoint de derivação, testes com fixtures.

**Não inclui:** frontend, exportação CSV, padrões, IA, Graphify, autenticação real.

## 3. Estrutura

```
backend/src/main/java/<pacote>/geradoritens/
├── engine/          ⭐ sem Spring, sem Mongo, sem I/O
│   ├── model/       Diagrama No Aresta ValorSpec CampoSpec Condicao Atividade Dependencia
│   ├── spec/        AvaliadorCondicao CamposVisiveis ResolvedorDefault
│   ├── readiness/   CalculadoraProntidao
│   ├── derive/      Derivador + regras por tipo
│   └── dependency/  ResolvedorDependencias DetectorCiclo DetectorConflito
├── quebra/          QuebraController QuebraService QuebraRepository QuebraDocument
├── tenant/          TenantContext TenantFilter TenantAwareMongo
└── config/          CarregadorConfig ValidadorConfig MongoConfig IndexInitializer
```

**Regra dura:** nenhuma classe em `engine/` pode importar `org.springframework.*`, `com.mongodb.*` ou `java.io.*`. Adicione um teste ArchUnit (ou equivalente) que falhe o build se isso acontecer. Não é preciosismo — é o que mantém a derivação testável, e a ausência disso é a causa raiz dos bugs de §2.3.

## 4. Modelo de domínio

Records imutáveis. Java 21.

```java
package …engine.model;

public record Diagrama(List<No> nodes, List<Aresta> edges) {}

public record No(
    String id, String type, double x, double y,
    String label, StatusNo status, String time,
    Map<String, ValorSpec> spec,
    Map<String, JustificativaNA> specNA,
    List<Endpoint> endpoints,        // só para type=service
    List<Motor> motores,             // só para type=fico
    List<Stage> stages,              // só para type=camunda
    String knownInfo
) {}

public enum StatusNo { NOVO, EXISTENTE }

public record ValorSpec(
    Object valor,
    Origem origem,
    String evidencia,     // origem=EXTRAIDO
    Double confianca,     // origem=INFERIDO
    boolean confirmado,   // origem=INFERIDO ou SUGERIDO
    String padrao         // id do padrão que preencheu, se houver
) {}

public enum Origem { MANUAL, EXTRAIDO, INFERIDO, SUGERIDO }

public record JustificativaNA(String motivo) {}

public record Aresta(
    String id, String source, String target, String type,
    String note, boolean reversed,
    String routingMode, List<Ponto> waypoints, Ponto labelOffset
) {}

public record Atividade(
    String chave,            // estável: "n1::setup", "e3::publish"
    String rotulo,           // sequencial de exibição: "01"
    String produto,
    TipoItem tipo,           // HISTORIA TASK DEBITO_TECNICO
    Tamanho tamanho,         // PP P M G
    String descricao,
    List<String> techs,
    List<String> contextos,
    List<Dependencia> dependencias,
    OrigemAtividade origem,           // nodeId, edgeId
    Map<String, Object> specResumo,
    List<String> timesEnvolvidos
) {}

public record Dependencia(TipoDependencia type, String alvoChave, String detalhe) {}
public enum TipoDependencia { INDEPENDENT, ENABLER, DEPENDENT }
```

**Chave estável vs rótulo.** `chave` deriva da origem e nunca muda quando um nó é acrescentado no meio. `rotulo` é o sequencial de exibição, recalculado a cada derivação. Merge de enriquecimento e referências externas usam **sempre** `chave`. Ver §7.4.

## 5. Configuração

`CarregadorConfig` lê `config/app.json`, `config/regras.json` e `config/diagrama.json` do diretório do repositório (caminho por propriedade `gerador.config-dir`, default `./config`).

`ValidadorConfig` roda na inicialização e **falha a subida da aplicação** se:

- alguma `tech` referenciada em `diagrama.json` não existir em `app.json`;
- algum `contexto` referenciado não existir em `app.json`;
- algum `when` usar operador desconhecido;
- algum `default` usar `{{campo}}` que não existe no mesmo tipo de nó;
- algum tipo de aresta referenciar tipo de nó inexistente.

Falhar alto é o ponto (§7.2). Hoje renomear uma tecnologia faz os requisitos sumirem em silêncio; aqui a aplicação não sobe.

## 6. Avaliador de condições

```java
public interface AvaliadorCondicao {
    boolean avaliar(Condicao c, No no, List<Aresta> arestasDoDiagrama);
}
```

Sete operadores, exatamente os de §7.1: `field/equals`, `field/notEquals`, `field/preenchido`, `hasIncomingEdge`, `hasOutgoingEdge`, `nodeStatus`, e os compositores `allOf`, `anyOf`, `not`.

Regras que as fixtures cobrem e que é fácil errar:

- `hasIncomingEdge` considera **apenas arestas cujo `target` é o nó**. Aresta saindo não conta.
- `field/equals` compara o **valor**, ignorando origem.
- Campo cuja condição não é satisfeita **não é visível**, e campo não visível **nunca** entra em obrigatórios em aberto, mesmo que `required: true`.
- `default` com `{{campo}}` é resolvido contra outros campos do mesmo nó; se o campo referenciado estiver vazio, o default fica vazio (não literal `{{topic}}`).

**Testes obrigatórios:** `fixtures/spec-conditions/rabbit.json`. A suíte carrega o arquivo e roda todos os `casos`. É o mesmo arquivo lido pelo frontend em SPEC-02 — não copie, não adapte, leia (§5.2).

## 7. Prontidão

```java
public record Prontidao(
    Nivel nivel,                       // VERDE AMARELO VERMELHO
    List<String> obrigatoriosEmAberto,
    List<String> inferidosPendentes,
    List<ErroSpec> erros
) {}
```

Sobre os campos **visíveis e obrigatórios**:

| Nível | Condição |
|---|---|
| VERMELHO | existe obrigatório sem valor válido e sem N/A válido |
| AMARELO | todos resolvidos, mas há `INFERIDO` ou `SUGERIDO` com `confirmado=false` |
| VERDE | todos resolvidos, nenhum pendente de confirmação |

Erros de N/A: `NA_SEM_MOTIVO` (motivo vazio ou em branco) e `NA_NAO_PERMITIDO` (campo com `permiteNA:false`). N/A inválido **não resolve** o campo.

**Valor com `origem = SUGERIDO` e `confirmado = false` não conta como preenchido** — o campo permanece em aberto. É a proteção de §4.3 contra o copiloto; implementar agora, mesmo sem copiloto existir, porque é uma linha aqui e uma auditoria depois.

## 8. Derivação

Porte as regras da ferramenta atual, com três correções obrigatórias:

1. **`techs` e `contextos` vêm de `diagrama.json`**, nunca embutidos em `switch` (§7.2).
2. **Chave estável** conforme §4 desta spec.
3. **`timesEnvolvidos`**: toda atividade cuja origem toca nó com `status=EXISTENTE` e `time` diferente do time da quebra registra esse time.

Mapeamento por `derives` — §7.4 do documento de arquitetura tem a tabela completa. `specResumo` carrega **apenas os campos relevantes para aquela atividade**, não o nó inteiro (§9.4, regra 3).

**Testes obrigatórios:** `fixtures/derive/01-servico-novo-fila-consumo.json`.

Note que a fixture usa `descricaoContem` em vez de igualdade de string. Isso é deliberado: a descrição é a parte que legitimamente muda, e um teste que a fixa por igualdade quebra a cada ajuste de texto até alguém desligá-lo. Asserte estrutura, não prosa.

## 9. Dependências

```java
public record ResultadoDependencias(
    List<Atividade> atividades,        // com dependências resolvidas
    List<Ciclo> ciclos,
    List<Conflito> conflitos,
    List<String> ordemTopologica,
    boolean podeDerivar
) {}
```

Códigos de conflito: `ENABLER_E_DEPENDENT`, `INDEPENDENT_COM_DEPENDENCIA`, `ALVO_INEXISTENTE`.

**Nunca lance exceção por ciclo ou conflito.** Retorne no resultado — a UI precisa listar os problemas com link para o item, não receber 500.

Ao recalcular auto-dependências, **preserve as existentes antes de limpar**. Este é o bug de §2.3 em que a correção está morta no código atual; não reproduza a versão que apaga tudo.

**Testes obrigatórios:** `fixtures/derive/02-ciclos-e-conflitos.json`.

## 10. Persistência e tenant

Coleção `quebras` conforme §5.8. Documento com `tenantId`, `rev`, `slug` único por tenant.

`TenantContext` request-scoped, populado por `TenantFilter`. Implementação inicial lê `gerador.tenant-id` da configuração (default `local`). **Nenhuma outra classe lê essa propriedade** — trocar pelo serviço real deve ser substituir o filtro.

`TenantAwareMongo` é o único componente que recebe `MongoTemplate` injetado. Adicione teste ArchUnit proibindo injeção de `MongoTemplate` fora dele.

`IndexInitializer` cria os índices de §5.8 na inicialização, explicitamente. Não use `auto-index-creation`.

**Concorrência:** `PUT` recebe `rev`; divergência responde **409** com o `rev` atual. Incremente na gravação.

## 11. Endpoints

```
GET    /api/config
GET    /api/quebras
POST   /api/quebras
GET    /api/quebras/{id}
PUT    /api/quebras/{id}          409 se rev divergir
DELETE /api/quebras/{id}
POST   /api/quebras/{id}/derivar  → ResultadoDependencias + prontidão por nó
```

`POST /derivar` **reavalia prontidão no servidor** e retorna `podeDerivar: false` com a lista do que falta se houver nó vermelho. O frontend não é autoridade (§5.2).

`springdoc-openapi` habilitado.

## 12. Testes

| Tipo | Cobre |
|---|---|
| Unitário sobre fixtures | avaliador, prontidão, derivação, dependências |
| ArchUnit | pureza de `engine/`, injeção de `MongoTemplate` |
| Testcontainers | repositório de quebra, filtro de tenant, 409 de concorrência |

**O teste de tenant é obrigatório e precisa de banco real.** Grave dois documentos com `tenantId` diferentes e verifique que a consulta de um não enxerga o outro. Mock passa mesmo quando o filtro foi esquecido — que é exatamente o bug que a camada existe para impedir.

## 13. Critérios de pronto

- [ ] `docker compose up` + `./mvnw spring-boot:run` sobem a aplicação
- [ ] Config inválida impede a subida com mensagem clara apontando o campo
- [ ] Todas as fixtures passam nas suítes
- [ ] ArchUnit verde
- [ ] Teste de isolamento entre tenants passa com Testcontainers
- [ ] `PUT` com `rev` velho responde 409
- [ ] `POST /derivar` da fixture 01 devolve as 6 atividades com as dependências esperadas

## 14. O que NÃO fazer

- Não crie tela, componente ou template. Este passo termina em HTTP.
- Não implemente CSV, padrões, IA ou Graphify.
- Não persista atividades derivadas — são recomputadas (§6.1).
- Não use `MongoRepository` diretamente nos serviços.
- Não introduza estado de workflow na quebra (§4.5).
- Não "melhore" as regras de derivação por conta própria. Se algo parecer errado, registre e pergunte — a granularidade é uma pendência aberta em §7.4 e será validada contra uma quebra real.

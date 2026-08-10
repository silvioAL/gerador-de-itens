# SPEC-31 — Arquitetura hexagonal: portas, adaptadores e a morte da implementação dupla

## 1. Objetivo

Fazer o domínio deixar de ser implementado **duas vezes** — uma contra arquivo (modo local), outra contra Postgres (modo hospedado) — extraindo portas e transformando cada persistência num adaptador. Consequência direta: funcionalidade nova nasce **uma vez** e os dois modos ganham; e a escolha de banco vira troca de adaptador em vez de reescrita.

## 2. O achado que motiva (medido, não estimado)

```
packages/cli/src/commands/openApiLocal.ts   1.598 linhas   (domínio + arquivo)
packages/server/src/routes/* + app.ts         964 linhas   (domínio + Postgres)
```

`quebras`, `campos-no`, `perfis-time` e `especificacao-template` estão implementados nos **dois**, separadamente. São ~2.560 linhas orquestrando o mesmo domínio em dois lugares que divergem sozinhos.

Essa divergência não é hipótese — é a causa documentada de três achados desta rodada:

- **JOURNEY §105**: o modo hospedado não tem rota `/ia/*` nenhuma. As 7 rotas de IA existem só no local, porque foram escritas lá e ninguém as escreveu de novo do outro lado.
- **§107/§108**: `/config/regras`, `/config/pipeline-agentes` e `/prompt-unico-template` também só existem no local — a tabela de regras, que é o que MAIS muda, não tem casa no banco.
- **A config em eras diferentes**: duas pastas de trabalho do mesmo usuário, uma com `regras.json` de 27/13 e outra de 0/12, produzindo um agente vazio que pareceu defeito de produto.

Escrever a mesma coisa duas vezes garante que uma das duas fique para trás. A pergunta não é *se*, é *qual*.

## 3. Metade do hexágono já existe

Isto **não** é começar do zero, e isso muda o risco:

- **`packages/engine` é puro.** Zero `node:fs`, `node:http`, `fetch` ou `process.env` em ~5.900 linhas de regra de negócio. É o núcleo do hexágono, já isolado.
- **A fronteira já é testada.** `boundary.sanity.test.ts` existe desde a Fase 1 — o equivalente a ArchUnit, garantindo que o engine não adquira dependência de infraestrutura.
- **Uma porta já está em produção.** `ProvedorIa` (`packages/llm/provedor.ts`) é uma interface com dois adaptadores: `criarProvedorLocal` (node-llama-cpp) e `criarProvedorCompativelOpenAI` (HTTP). Trocar de modelo é trocar de adaptador, e isso já funciona há várias fases.

O trabalho é **generalizar um padrão que já provou valor aqui**, não importar um paradigma novo.

## 4. Decisões

### 4.1 Portas primeiro, banco depois

Confirmado com o usuário. Extrair as portas e fazer arquivo e Postgres virarem adaptadores da mesma camada de aplicação **antes** de qualquer troca de banco. Motivos:

- Mata a duplicação, que é o problema maior e independe de qual banco vence.
- Torna a decisão Mongo/Postgres reversível: vira um terceiro adaptador, escrito e descartado sem tocar no resto.
- Cada fase entrega valor e deixa o produto publicável — não há janela com a ferramenta parada.

### 4.2 DDD seletivo

Confirmado com o usuário. **Adotado:**

- **Repositórios como portas** — a peça que resolve o problema.
- **Contextos delimitados** — existem dois e quase não se tocam (§6).
- **Linguagem ubíqua** — já existe, em português, e é consistente (`Quebra`, `Atividade`, `Prontidão`, `Refinamento`, `Esteira`, `ValorSpec`). É um ativo do projeto; a SPEC apenas o reconhece.

**Deliberadamente fora:** agregados como classes com construtor privado, value objects encapsulados, eventos de domínio, CQRS. O núcleo é funcional, puro e testado; envolvê-lo em cerimônia de objeto custa reescrita e não compra invariante que hoje falte. Se um invariante específico precisar de guarda, ele vira função pura no engine — que é onde o resto já mora.

### 4.3 O que NÃO se toca nesta SPEC

`packages/engine` permanece como está: funções puras, sem classes, sem injeção. Ele já é o hexágono. Mexer nele seria refatorar o que funciona para satisfazer vocabulário.

## 5. As portas

Uma interface por conceito, no domínio; implementações em cada adaptador.

| Porta | Adaptadores | Substitui |
| --- | --- | --- |
| `RepositorioDeQuebras` | arquivo, Postgres | `quebras` nos dois lados |
| `RepositorioDeCamposNo` | arquivo, Postgres | `campos-no` nos dois lados |
| `RepositorioDePerfisTime` | arquivo, Postgres | `perfis-time` nos dois lados |
| `RepositorioDeTemplates` | arquivo, Postgres | `especificacao-template`, `prompt-unico-template` |
| `RepositorioDeConfig` | arquivo, Postgres | `regras`, `pipeline-agentes`, `ia` — **hoje só no local** |
| `ProvedorIa` | llama local, gateway | **já existe**, serve de modelo |
| `CustodiaDeCredencial` | arquivo (`~/.gerador`), KMS | SPEC-29 |

Cada caso de uso recebe as portas de que precisa e nada mais. O adaptador HTTP (Fastify no hospedado, `node:http` no local) fica reduzido a traduzir requisição → caso de uso → resposta.

## 6. Contextos delimitados

Dois, e a fronteira entre eles é fina de propósito:

- **Especificação** — diagrama, derivação, prontidão, refinamento, esteira de agentes, especificação de entrega. É onde vive o valor do produto e onde o engine já reina.
- **Acesso e organização** — autenticação, times, convites, papéis, permissões, auditoria. Existe só no hospedado, é genuinamente relacional (8 FKs), e não tem contrapartida no modo local.

O único ponto de contato é o **escopo**: uma quebra pertence a um time. Isso atravessa como um identificador, não como dependência de módulo — e é por isso que o modo local funciona sem o segundo contexto inteiro.

Consequência prática: **o contexto de acesso não precisa migrar de banco.** Se o Mongo entrar, entra pelo contexto de especificação, onde o dado é documento; o relacional fica onde as FKs trabalham.

## 7. Roteiro faseado

Estrangulamento, não big bang. Cada fase é um PR publicável.

- **Fase 1 — a porta de Quebras.** Extrair `RepositorioDeQuebras` + o caso de uso, com adaptador de arquivo e de Postgres. Os dois modos passam a compartilhar a regra. É a fase que prova o padrão no conceito mais central; se algo no desenho estiver errado, aparece aqui e custa pouco.
- **Fase 2 — campos-no, perfis-time, templates.** Mesmo tratamento, agora repetitivo e rápido.
- **Fase 3 — config (regras, pipeline, prompt único).** Nasce nos **dois** modos ao mesmo tempo, com semente a partir do template da versão. Fecha o buraco do §108: config velha e silenciosa deixa de ser possível.
- **Fase 4 — IA como porta no hospedado.** As 7 rotas passam a existir dos dois lados, com `@gerador/llm/gateway` (sem binário nativo no container) e custódia de credencial da SPEC-29. Fecha o §105.
- **Fase 5 — adaptador Mongo**, se ainda fizer sentido depois de 1 a 4. Escrito contra as mesmas portas, validado pela mesma suíte. **Avaliado e não construído** — ver §7.1.

### 7.1 Fase 5: a avaliação, e por que a resposta foi "ainda não"

A Fase 5 sempre foi condicional. Feita a avaliação depois de 1 a 4, com os números:

**O motivo original não se sustentou.** A proposta de Mongo veio de *"os schemas não são muito estáveis até então"*. As Fases 1 a 4 mudaram o schema três vezes (migrações `0011`, `0012`, `0013`) — então a instabilidade era real. Mas **as três são aditivas e as três guardam o que varia em `jsonb`**: `respostas_itens`, `anexos_contexto`, `config_documentos.documento`, `credenciais_ia.cabecalhos`. O que era instável já é documento; o que virou coluna (`demand_info`, `base_url`, `versao_template`) é justamente o que se estabilizou. O Postgres está sendo usado como banco de documentos onde precisa ser, e como relacional onde a integridade importa — a FK de `perfis_time` para `times` pegou um caso na Fase 2.

**O custo hoje é maior que na primeira conversa.** Um adaptador Mongo agora precisa implementar **seis portas** e passar **43 casos de contrato**, mais Mongo no `docker-compose`, no CI e como dependência. Na conversa original eram zero portas — a troca pareceria barata porque não havia nada escrito.

**O que a SPEC-31 entregou torna a decisão barata de reverter.** A pergunta "e se um dia precisarmos de Mongo?" deixou de ser arquitetural: são seis arquivos de adaptador contra interfaces que já existem, validados por uma suíte que já existe. Isso é meio dia de trabalho quando houver um motivo — volume, forma que o `jsonb` não sirva, ou uma restrição de infraestrutura da empresa.

**A decisão, então: não construir agora.** Não por preferência por Postgres, e sim porque nenhum problema atual aponta para Mongo, e a Fase 5 existia para responder a um problema que as Fases 1 a 4 resolveram por outro caminho.

## 8. Como não quebrar no caminho

- **Os testes existentes são a rede.** 50 testes do server rodam contra Postgres real; 81 do CLI contra HTTP real. Um adaptador novo é aprovado quando passa nos mesmos testes — não em testes escritos para ele.
- **A suíte de porta é uma só.** Cada porta ganha um conjunto de testes de contrato que TODO adaptador precisa passar. É o que impede o adaptador de arquivo e o de Postgres de divergirem de novo — a mesma pergunta feita aos dois.
- **`boundary.sanity.test.ts` cresce.** Passa a proibir também que a camada de aplicação importe adaptador, e que adaptador importe adaptador.
- **Nenhuma fase remove o caminho antigo antes de o novo passar.** O código duplicado sai no fim de cada fase, não no começo.

## 9. Fora de escopo, deliberado

- Reescrever `packages/engine` (§4.3).
- Migrar o contexto de acesso para outro banco (§6).
- Event sourcing, CQRS, microserviços. O produto é um monólito com dois modos de execução; continuará sendo.
- Trocar Fastify ou `node:http`. Adaptador HTTP é detalhe, e a SPEC trata justamente de tornar detalhe substituível sem cerimônia.

## 10. Verificação

Por fase: suíte completa verde (engine, llm, web, cli, server), `tsc --noEmit`, lint, e — a checagem que importa — **a mesma suíte de contrato passando nos dois adaptadores da porta daquela fase**. Ao fim da Fase 3, uma verificação de produto: criar uma regra pela UI no modo hospedado e vê-la aplicada numa derivação, que hoje é impossível.

# Especificação de solução

## Contexto
Loja online de médio porte. Quem usa: o time de operações do catálogo.

Substituir a busca por SKU, hoje em planilha.

## Visão geral
Como operador do catálogo, quero buscar por SKU para não depender da planilha.

## Decisões

- **Mongo em vez de SQL para o catálogo:** Mongo — A forma varia por categoria, e a leitura domina — a junção que se perde não é usada aqui.
  _O catálogo tem forma variável por categoria e é lido muito mais do que escrito._
  - ~~Postgres com jsonb~~ — migração de esquema a cada categoria nova

## Trade-offs e o que ficou de fora

Ganhamos forma flexível por categoria; perdemos junção forte entre elas.

## Riscos e o que pode dar errado

Se o volume dobrar antes da indexação, a busca degrada.

## Itens

### 1. 01 — Setup inicial de srv-catalogo.

**Tipo:** História · **Tamanho:** M
**Techs:** Backend · **Contextos:** —
**Dependências:** enabler

#### Necessidades atendidas

- O catálogo precisa responder busca por SKU em menos de meio segundo

#### História de usuário

_(sem história definida)_ <- ✍️ especificar

##### srv-catalogo (Serviço, novo)

| Campo | Valor | Proveniência |
|---|---|---|
| Nome do serviço | srv-catalogo | manual |
| Linguagem | N/A — ainda não decidido | — |

#### Requisitos de refinamento técnico

**BACKEND:**
- Idempotência declarada <- ✍️ especificar

#### Critérios de aceite (Gherkin)

```gherkin
Dado <contexto>
Quando <ação>
Então <resultado esperado>
```
_(preencher com os cenários reais deste item)_ <- ✍️ especificar

#### Entrega final

_(a definir: o que fica pronto quando este item termina)_ <- ✍️ especificar

---

### 2. 02 — Criar produtos.

**Tipo:** Task · **Tamanho:** PP
**Techs:** Backend · **Contextos:** Backend-dados
**Dependências:** enabler

#### Por que este desenho é assim

- Mongo em vez de SQL para o catálogo — A forma varia por categoria, e a leitura domina — a junção que se perde não é usada aqui.

#### História de usuário

_(sem história definida)_ <- ✍️ especificar

##### produtos (Coleção Mongo, novo)

| Campo | Valor | Proveniência |
|---|---|---|
| Nome da coleção | produtos | manual |
| TTL (dias) | N/A — catálogo não expira | — |

#### Requisitos de refinamento técnico

**BACKEND:**
- Logs relevantes emitidos <- ✍️ especificar
- Idempotência declarada <- ✍️ especificar

**Ciclos de teste:**

**BACKEND:**
_DEV:_
- **Teste de migração**: roda limpo

#### Checklist de processo

**BACKEND:**
- [ ] Plano de migração revisado com o time

#### Requisitos de volumetria

- Response time: ___ <- ✍️ especificar
- Max error: ___ <- ✍️ especificar
- RPS (Requisições por segundo): ___ <- ✍️ especificar
- Test duration: ___ <- ✍️ especificar

#### Critérios de aceite (Gherkin)

```gherkin
Dado um documento válido
Quando ele é gravado
Então pode ser lido de volta
```

#### Entrega final

_(a definir: o que fica pronto quando este item termina)_ <- ✍️ especificar

---

### 3. 03 — srv-catalogo escreve em produtos.

**Tipo:** História · **Tamanho:** P
**Techs:** Backend · **Contextos:** Backend-dados
**Dependências:** dependent → n1::setup, dependent → n2::criacao

#### Necessidades atendidas

- O catálogo precisa responder busca por SKU em menos de meio segundo

#### História de usuário

_(sem história definida)_ <- ✍️ especificar

##### srv-catalogo (Serviço, novo)

| Campo | Valor | Proveniência |
|---|---|---|
| Nome do serviço | srv-catalogo | manual |
| Linguagem | N/A — ainda não decidido | — |

##### produtos (Coleção Mongo, novo)

| Campo | Valor | Proveniência |
|---|---|---|
| Nome da coleção | produtos | manual |
| TTL (dias) | N/A — catálogo não expira | — |

#### Requisitos de refinamento técnico

**BACKEND:**
- Logs relevantes emitidos <- ✍️ especificar
- Idempotência declarada <- ✍️ especificar

**Ciclos de teste:**

**BACKEND:**
_DEV:_
- **Teste de migração**: roda limpo

#### Checklist de processo

**BACKEND:**
- [ ] Plano de migração revisado com o time

#### Requisitos de volumetria

- Response time: ___ <- ✍️ especificar
- Max error: ___ <- ✍️ especificar
- RPS (Requisições por segundo): ___ <- ✍️ especificar
- Test duration: ___ <- ✍️ especificar

#### Critérios de aceite (Gherkin)

```gherkin
Dado um documento válido
Quando ele é gravado
Então pode ser lido de volta
```

#### Entrega final

_(a definir: o que fica pronto quando este item termina)_ <- ✍️ especificar

## Definition of Ready
- [ ] Contexto e objetivo de negócio claros pra quem for implementar
- [ ] Dependências (itens enabler/dependent) mapeadas
- [ ] Nenhum campo obrigatório em aberto na especificação técnica (prontidão verde)

_(item específico deste fluxo — completar com base no contexto; não é uma lista fechada)_

## Definition of Done
- [ ] Código revisado
- [ ] Sem regressão na suíte de testes automatizados

_(critério específico deste fluxo — completar com base no contexto; não é uma lista fechada)_

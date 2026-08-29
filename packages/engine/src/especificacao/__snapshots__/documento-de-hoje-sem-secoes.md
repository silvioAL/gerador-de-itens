# Especificação de solução

## Contexto
_Sem contexto adicional informado._

## Itens

### 1. 01 — Setup inicial de srv-catalogo.

**Tipo:** História · **Tamanho:** M
**Techs:** Backend · **Contextos:** —
**Dependências:** enabler

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

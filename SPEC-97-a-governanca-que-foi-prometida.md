# SPEC-97 — A governança que foi prometida

> **Origem:** prometida há muito tempo e nunca escrita. A capa do site declara
> essa lacuna em âmbar, de propósito. O usuário, ao pedir para fechar a SPEC-102,
> disse:
>
> > *"a parte de governança ok, acredito que já foi especificado"*
>
> **Não foi.** Este documento existe para que ela pare de ser uma promessa.
>
> E o pedido concreto que a define:
>
> > *"é comum que a arquitetura queira colocar requisitos de refinamento /
> > configurações obrigatórias e os DBAs também"*
>
> Mais um que veio junto, e é da mesma família:
>
> > *"a configuração do MCP e issue tracker está por time, acho que o adequado
> > seria que fizesse parte da governança global"*

---

## 0. A medição

Varredura em `auth/permissoes.ts`, `auth/niveis.ts`, `routes/config.ts`,
`routes/quebras.ts` e `db/schema.ts`.

### 0.1 Existem dois eixos, e confundi-los é o que torna a área ilegível

| Eixo | Onde mora | Responde |
|---|---|---|
| **Nível no time** | `usuario_time (email, timeId, nivel)` | *o que esta pessoa faz no dia a dia* — `visualizar` < `operar` < `owner` |
| **Papel RBAC** | `papeis_acesso` → `papel_permissao` → `usuario_papel` | *quem cura qual área de configuração* — 16 recursos × 3 ações |

E uma ponte: `time_papel` — papel portado por um **time**, herdado só pelos
membros `owner`, valendo com escopo **organizacional**.

### 0.2 Como uma escrita é decidida hoje

`exigirPermissao`:

1. Sem organização → **libera** (falha aberta, SPEC-28 §4.3).
2. Ação ≠ `ler`: resolve o nível. Se `owner` → **libera, ignorando o RBAC**.
3. Senão exige grant explícito; sem ele, 403.
4. `ler` usa só o eixo RBAC — e se a organização não tem papel nenhum, libera.

`exigirEdicaoCurada` **inverte** isso para os catálogos: se algum papel carrega o
recurso, a curadoria liga e o *owner-bypass é revogado*.

> As duas regras são defensáveis e estão em arquivos vizinhos com defaults
> opostos. **Nada declara qual vale onde** — é conhecimento que existe só na
> cabeça de quem leu as duas.

### 0.3 Os quatro defeitos medidos

**(a) Não há isolamento de leitura nenhum.** `GET /quebras` (`quebras.ts:367`) é
`casos.listar()` — um `select ... order by`, **sem `WHERE`**. Toda pessoa logada
vê toda demanda de todo time. No web, a busca é texto livre sobre título+time.

O comentário de `RECURSOS_SEM_ROTA` afirma o contrário: *"Quem quer isolar quebra
já tem o escopo por time, que é o eixo certo para trabalho."* **Esse escopo não
existe.**

**(b) O escopo de autorização vem do CORPO da requisição** (`quebras.ts:382`):

```ts
const podeOperarNaQuebra = exigirNivel(db, "operar", (req) => {
  const time = (req.body as { time?: string | null } | null)?.time;
  return typeof time === "string" && time.trim() ? time : null;
});
```

Quem chama **escolhe contra qual time é conferido**. E no `PUT` o mesmo corpo
ainda reescreve o time da quebra. Quem é `visualizar` no time A e `owner` no time
B edita a quebra do time A mandando `time: "time-B"`.

**(c) `POST /quebras/:id/derivar` (`:602`) não tem `preHandler` nenhum.**

**(d) `maiorNivel` dá owner em qualquer operação sem escopo.** Está declarado
(`niveis.ts:43`), mas o docstring pressupõe escopo **ausente** — não escopo
**escolhido pelo chamador**, que é o que (b) permite.

### 0.4 E um quinto, achado no §354

`RECURSO_DA_CHAVE_DE_CONFIG` tornou visível que `exportador` e `tokens` são
gateadas pela permissão de **`pipeline-agentes`** — herança do `else` que existia
antes. Nenhuma das duas é da esteira.

---

## 1. As três perguntas que a governança precisa responder

| # | Pergunta | Estado |
|---|---|---|
| **1** | **Quem pode o quê** — e por que dois eixos com defaults opostos? | existe, **não está declarado** |
| **2** | **Quem enxerga o quê** | **não existe** (§0.3a) |
| **3** | **Quem pode obrigar** — arquitetura/DBA impondo piso | **não existe**, e é o pedido |

A **3** é a que o usuário descreveu. A **1** é dívida de declaração. A **2** é
decisão de produto, não de código.

---

## 2. Pergunta 3 — o piso organizacional: **o que o produto não sabe fazer**

Hoje toda configuração é **substituição**: `time → global`, e o time vence.
Arquitetura escreve uma regra global, o time escreve a dele, e a global some.

Não existe *"esta régua vale para todos e o time não pode desligar"* — que é
literalmente o pedido.

### 2.1 O mecanismo já existe, num lugar só

A SPEC-86 resolveu exatamente esta forma para o eixo do **produto**:
`config_documentos` tem `(chave, timeId, produtoId)`, e o que o produto guarda
**soma** ao do time em vez de substituir — a resolução é `regrasEmVigor`, no
engine, com `origemDe` dizendo de onde cada item veio.

> **É a peça certa, e ela já foi construída e provada.** O que falta não é
> mecanismo: é um terceiro nível — o **organizacional obrigatório** — usando a
> mesma soma, e o `origemDe` respondendo *"esta régua é da arquitetura, você não
> a desligou porque não pode"*.

### 2.2 Por que "obrigatório" precisa ser DADO, e não convenção

Um piso que o time pode sobrescrever não é piso. E um piso que **parece**
obrigatório e não é seria pior que nenhum: a arquitetura acreditaria estar
cobrando.

Então a marcação vive no documento (`obrigatorio: true` por item), e a resolução
recusa sobreposição — não em silêncio, com o motivo na tela.

### 2.3 O que isto NÃO é

**Não é um quarto eixo de escopo.** É o eixo organizacional que já existe
(`papeisAcesso.organizacaoId`, `stacks.organizacaoId`) ganhando poder de
**escrever régua**, não só de conceder permissão.

---

## 3. Pergunta 1 — declarar o que já existe

Nada a construir; tudo a escrever. A tabela do §0.1, os quatro passos do §0.2, e
**o porquê dos defaults opostos** — `exigirPermissao` protege trabalho (owner
sempre pode), `exigirEdicaoCurada` protege catálogo (curadoria vence o owner).

Mais o que o §354 já começou: a relação chave→dono como **dado**
(`RECURSO_DA_CHAVE_DE_CONFIG`), e não como ramo.

---

## 4. Pergunta 2 — quem enxerga: **decisão do usuário, não do código**

Hoje todo mundo vê tudo. Três saídas, e a escolha é de produto:

- **fechar por time** — coerente com o que o código já afirma, mas some demanda
  hoje visível;
- **manter aberto** — desenho não é sigilo, e a ferramenta é de colaboração;
- **fechar só para quem não é owner** — meio-termo.

**Recomendação: manter aberto e corrigir a ESCRITA** (§0.3b/c). O furo de
autorização é defeito em qualquer das três; a visibilidade é preferência. Mas
então o comentário do `RECURSOS_SEM_ROTA` precisa deixar de afirmar um
isolamento que não existe.

---

## 5. O que esta SPEC RECUSA

- **Um terceiro mecanismo de resolução.** A soma da SPEC-86 já existe e já é
  provada; inventar outro criaria duas formas de somar régua.
- **Piso por time do nó** — a SPEC-101 §4 já recusou, e a SPEC-102 §5.3 repetiu:
  o mesmo desenho produzindo itens diferentes quebra a tese do produto.
- **Trocar o recurso de `exportador`/`tokens` sem rodada própria.** Está errado
  (§0.4), mas corrigir **tira acesso de quem tem hoje**. Declarado ≠ consertado.
- **Resolver as três perguntas juntas.** É o que faz "governança" virar projeto.
- **Aprovação em duas etapas** (a `acao: "aprovar"` que existe e nenhuma rota
  exige). Continua esperando um caso real — §242.

---

## 6. Fatias

- **A — declarar (§3).** Sem código. **Prova:** a tabela dos dois eixos e os
  defaults opostos escritos onde quem lê `permissoes.ts` os encontra.
- **B — fechar os três furos de escrita (§0.3b/c/d).** Escopo vindo da linha
  gravada, nunca do corpo; `derivar` com gate. **Prova:** quem é `visualizar` no
  time da quebra leva 403 mesmo mandando outro time no corpo — e o teste falha
  antes da correção.
- **C — o piso organizacional (§2).** `origemDe` dizendo *"da arquitetura"*.
  **Prova:** o time sobrescreve e a régua obrigatória continua cobrando, com o
  motivo na tela.
- **D — MCP/tracker sob a governança global.** O pedido do usuário sobre
  `exportador`; depende de C existir.

> **Corte:** **B** primeiro — é defeito de autorização, não depende de decisão
> nenhuma e é pequeno. **A** junto, porque é escrita. **C** é a rodada de
> verdade. **D** só depois de C.

---

## 7. Perguntas em aberto

1. **Piso organizacional vale para quais chaves?** `regras` é o caso do pedido.
   `campos_no`? `exportador`? **Não medimos** qual dói.
2. **O time pode PEDIR exceção ao piso?** O §242 já tem a válvula para padrão
   (`excecoes`, com motivo e autor). Recomendação: a mesma forma — negar sem
   caminho ensina a contornar.
3. **Quem é "a arquitetura"?** Hoje seria um papel RBAC com escopo
   organizacional. Isso basta, ou governança pede entidade própria? Recomendação:
   basta — inventar entidade antes do caso é o que o §242 recusa.
4. **A visibilidade (§4) é decisão do usuário**, e está esperando por ele.

---

## 8. Para quem implementar

- `packages/server/src/auth/permissoes.ts` — os dois eixos, o owner-bypass, a
  inversão da curadoria e `RECURSO_DA_CHAVE_DE_CONFIG`.
- `packages/server/src/auth/niveis.ts` — `maiorNivel` e o escopo ausente.
- `packages/server/src/routes/quebras.ts:367,382,602` — os três furos da fatia B.
- `packages/engine/.../regrasEmVigor` e **SPEC-86** — a soma que a fatia C reusa,
  e o `origemDe` que ela estende.
- **SPEC-102 §5.3** — a decisão de escopo do vocabulário de conexão, que é o
  precedente mais recente desta mesma pergunta.

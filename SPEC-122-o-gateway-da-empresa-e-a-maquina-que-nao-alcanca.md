# SPEC-122 — O gateway da empresa, e a máquina que não o alcança

> **Origem:** o usuário, depois de eu apontar que faltava credencial de IA na
> stack local:
>
> > *"já tenho, só não consigo rodar nessa máquina, existem restrições de rede,
> > mas o sistema é desenvolvido aqui… depois que estiver implementado baixar na
> > máquina corporativa e seguir o desenvolvimento e teste por lá. **Hoje não
> > estamos comportando o que é necessário**"*
>
> E o curl da integração real, que é a medição mais valiosa desta SPEC:
>
> ```bash
> curl --location 'https://llm-proxy-arquitetura.agibank-dev.in/v1/chat/completions' \
> --header 'Authorization: Bearer xxxxx' \
> --header 'Content-Type: application/json' \
> --data '{"model": "claude-sonnet-4-5", "messages": [{"role": "user", "content": "Bom dia"}]}'
> ```
>
> Esta SPEC **não implementa nada** — mede o que o produto exige de um provedor,
> compara com o que este gateway provou aceitar, e nomeia o que separa os dois.

---

## 0. A restrição que organiza tudo, e ela não é técnica

**A máquina que desenvolve não alcança o gateway. A máquina que alcança o
gateway não desenvolve.**

Isso não é um detalhe de ambiente — é a régua desta SPEC inteira. Toda decisão
aqui tem que responder a uma pergunta a mais que o normal: *como alguém
descobre que isto funcionou, se quem escreveu o código não pode testá-lo?*

A resposta desta casa para "não dá para testar" sempre foi a mesma, e está
escrita no JOURNEY em três lugares: **sem o teste contra o real, o defeito
sobrevive.** Ela continua valendo. O que muda é *onde* o teste acontece — e,
por consequência, o que o produto precisa fazer para que esse teste, quando
acontecer longe daqui, produza uma resposta legível em vez de um vermelho mudo.

---

## 1. A medição: o que o produto MANDA, e o que o curl PROVOU

O corpo que `provedorOpenAI.ts` monta, em toda chamada de chat:

```json
{
  "model": "<modelo>",
  "messages": [...],
  "stream": true,
  "max_tokens": 4096,
  "response_format": { "type": "json_object" }
}
```

O corpo que o curl do usuário provou funcionar:

```json
{ "model": "claude-sonnet-4-5", "messages": [...] }
```

### 1.1 A tabela que importa

| O produto manda | O curl provou? | O que acontece se o proxy não aceitar |
|---|---|---|
| `messages` + `model` | ✅ **sim** | — |
| `Authorization: Bearer` | ✅ **sim** | — |
| `stream: true` | ❌ não testado | **coberto** — ver §1.2 |
| `max_tokens` | ❌ não testado | 400, e a mensagem do gateway chega à tela |
| `response_format` | ❌ não testado | ⚠️ **o risco central** — ver §2 |

**Três das cinco linhas são desconhecidas**, e o curl não tinha como responder:
ele testou o caminho feliz de uma conversa, não o que o produto realmente faz.

### 1.2 O que já está coberto, e é mais do que eu esperava

Medindo antes de propor, duas das preocupações óbvias **já têm resposta no
código**:

- **Gateway que ignora `stream: true`.** `provedorOpenAI` detecta pelo que
  CHEGOU, não pelo `Content-Type` — *"no fetch do Node o corpo é sempre um
  stream, e header errado é comum em wrapper caseiro"*. Se o proxy responder o
  JSON inteiro de uma vez, o produto lê `choices[0].message.content` e segue.
- **`max_tokens` cortando a resposta.** `exigirRespostaInteira` olha o
  `finish_reason` e recusa resposta truncada em vez de gravar meia decisão.

Isso reduz a SPEC ao que sobrou — e o que sobrou é sério.

---

## 2. ⚠️ O `response_format`, e por que ele é o risco central

### 2.1 Toda chamada do produto é estruturada

As nove `montarPedidoX` devolvem `{ prompt, esquema }`. **Não existe chamada de
texto livre** no fluxo de trabalho: desenhar, decidir, propor propósitos,
escrever item, mapear componente — todas esperam JSON com forma conhecida, e
a resposta é validada contra o esquema.

Se o proxy engolir `response_format` sem repassar, o Claude responde prosa
(*"Claro! Aqui está o diagrama: …"*), o parse falha, e **nenhuma das nove
funciona**. Não é degradação: é o produto inteiro parado.

### 2.2 E o produto vai mandar o dialeto ERRADO, por construção

```ts
export function formatoJsonPorBaseUrl(baseUrl) {
  const preset = PRESETS_GATEWAY.find((p) => alvo.startsWith(p.baseUrl…));
  return preset?.formatoJson ?? "json_object";
}
```

`llm-proxy-arquitetura.agibank-dev.in` **não casa com preset nenhum** — então
cai em `json_object`.

Mas o modelo por trás é **Claude**, e o preset oficial da Anthropic neste mesmo
arquivo declara `json_schema`, com a justificativa escrita ao lado:

> *"Structured Outputs: garantia MAIS FORTE que json_object."*

E há um comentário no provedor que documenta o 400 exato:

> ```
> HTTP 400 response_format.type: Input should be 'json_schema'
> ```

**Ou seja: o produto tem a informação de que Claude quer `json_schema`, e vai
mandar `json_object`, porque a heurística casa por ENDEREÇO e o endereço é
desconhecido.**

### 2.3 As três saídas, e nenhuma é gratuita

| Saída | O que custa |
|---|---|
| **A pessoa escolhe na tela** (existe hoje) | funciona — e exige que ela saiba o que é `json_schema`, e descubra por tentativa numa máquina onde errar custa uma ida e volta |
| **Casar por MODELO, não só por endereço** | `claude-*` → `json_schema`, qualquer endereço. Barato, e acerta o caso desta SPEC |
| **Negociar: tenta, cai para o próximo** | acerta sempre, e a primeira chamada de cada sessão paga uma tentativa perdida |

**Recomendação: a segunda como piso, a terceira como rede.** O nome do modelo é
informação que o produto já tem e não usa; a negociação cobre o proxy que
reescreve o nome (este devolve `us.anthropic.claude-sonnet-4-5-20250929-v1:0`
quando se pede `claude-sonnet-4-5` — prova de que o nome viaja e é traduzido).

---

## 3. O que a resposta dele revela, e ninguém pediu

```json
"usage": {
  "completion_tokens": 36, "prompt_tokens": 15, "total_tokens": 51,
  "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0
}
```

**O proxy devolve o custo real de cada chamada, e o produto joga fora.**

Isso não é lacuna desta SPEC — é oportunidade que ela mede de passagem. A
SPEC-74 construiu o *modo sem custo* justamente porque não havia como saber o
que se gastava; aqui o número chega em toda resposta. Fica anotado, e a decisão
de usá-lo é de outra rodada.

---

## 4. O que "hoje não estamos comportando" pode significar

Esta é a pergunta cuja resposta muda o tamanho da SPEC, e ela é do usuário.
Três leituras, e elas pedem coisas diferentes:

### Leitura A — o dialeto

O produto manda `json_object` para um gateway Claude. **É o que a §2 mede, e é
concreto.** Custo baixo, e resolve sozinho se for só isso.

### Leitura B — o preset

Não há como salvar *"este é o gateway da minha empresa"* com dialeto, modelos e
capacidades declarados. Hoje se preenche endereço, chave e modelo à mão, e as
três heurísticas (`formatoJson`, `temVisao`, `simulado`) respondem pelo
fallback. **Um preset por organização** — ou um preset editável — é trabalho
maior e mais duradouro.

### Leitura C — o ciclo de desenvolvimento

*"O sistema é desenvolvido aqui, e testado lá."* O que falta não é código: é o
produto **dizer o suficiente quando falha** para que o diagnóstico atravesse a
distância entre as duas máquinas. Hoje `erroDeGateway` já traduz 401, 404, 413 e
o 400 de visão — mas não o 400 de `response_format`, que é justamente o que vai
acontecer.

> **As três podem ser verdade ao mesmo tempo, e a ordem importa.** A Leitura A
> sem a C produz um produto que funciona e não sabe dizer por quê; a C sem a A
> produz uma mensagem de erro muito boa sobre um defeito evitável.

---

## 5. O que esta SPEC RECUSA

- **Implementar o proxy da empresa.** O produto fala um dialeto
  (OpenAI-compatível) e continua falando um. Um adaptador por gateway seria
  escolher o gateway de todo mundo — a mesma régua que a SPEC-49 aplicou ao
  tracker e a SPEC-81 ao MCP.
- **Adivinhar o dialeto por heurística de nome de host.** `agibank-dev.in` não
  diz nada sobre `response_format`. O que diz é o **modelo** (§2.3).
- **Presumir que funcionou.** Nada nesta SPEC vira "pronto" por passar em teste
  de unidade: o gateway é o outro lado, e o outro lado só responde na máquina
  que o alcança.
- **Mandar a chave para lugar nenhum novo.** A régua da SPEC-118 §3.1 vale
  inteira aqui: o curl que o usuário colou tinha `Bearer xxxxx` justamente
  porque chave vazada não se desvaza.
- **Bloquear o produto quando o dialeto falha.** A conversa continua possível;
  o que falha é o pedido estruturado. Recusar tudo transformaria um defeito de
  configuração num produto morto.
- **Tratar `usage` nesta rodada.** Ver §3 — é oportunidade medida, não escopo.

---

## 6. Fatias

- **A — o dialeto JSON casa por MODELO, não só por endereço.** `claude-*` pede
  `json_schema` em qualquer gateway. **Prova:** com `baseUrl` desconhecida e
  `modelo: "claude-sonnet-4-5"`, o corpo montado leva
  `response_format.type: "json_schema"`.
- **B — o 400 de `response_format` vira frase, não dump.** É o erro que vai
  acontecer na máquina corporativa, e é o único que `erroDeGateway` ainda não
  traduz. **Prova:** um 400 citando `response_format` produz uma mensagem que
  nomeia o campo da tela a mexer.
- **C — a negociação de dialeto**, como rede da fatia A: recusado por
  `response_format`, tenta o próximo dialeto uma vez e lembra o que funcionou
  para aquela `baseUrl`. **Prova:** um gateway que só aceita `json_object`
  funciona sem ninguém configurar nada, e a segunda chamada já vai direto.
- **D — "Testar conexão" exercita o que o produto REALMENTE faz.** Hoje ele
  manda *"Responda apenas: ok"* — texto livre, que passa mesmo num gateway que
  recusa `response_format`. **Prova:** um gateway que aceita chat e recusa JSON
  estruturado **falha no teste**, aqui, em vez de falhar na primeira derivação.
- **E — o preset da casa** (Leitura B da §4): salvar dialeto, modelos e
  capacidades de um gateway interno, em vez de depender do fallback. **Prova:**
  a segunda pessoa do time não redescobre a configuração por tentativa.
- **F — certificar contra o gateway real.** Na máquina corporativa: desenhar,
  derivar, rodar a esteira, exportar. É a única fatia que prova as outras, e a
  única que não roda aqui.

---

## 7. Perguntas em aberto

1. **Qual das três leituras da §4 é a sua?** Se for só a A, isto é uma rodada
   pequena. Se for a B, é configuração nova. Se for a C, é sobre diagnóstico —
   e as três convivem, mas a ordem muda o que entrego primeiro.
2. **O proxy aceita `response_format`?** É a pergunta que decide as fatias A e
   C, e ela tem resposta rápida: rodar o curl acrescentando
   `"response_format": {"type": "json_object"}` e depois `{"type":
   "json_schema", "json_schema": {...}}`. **Dois curls na máquina corporativa
   respondem a SPEC inteira** — e é o único trabalho desta SPEC que eu não
   consigo fazer.
3. **Ele aceita `stream: true`?** O produto já degrada se não aceitar (§1.2),
   mas saber muda a experiência: sem streaming, a esteira fica muda por minutos
   em vez de escrever na tela.
4. **Há um endpoint de transcrição?** `baseUrlTranscricao` existe para isto. Se
   não houver, a voz na conversa some — e é melhor a tela dizer isso do que
   oferecer um botão que dá 404.
5. **O gateway é o mesmo para todos os times, ou varia?** Decide se a fatia E é
   um preset só (global) ou um por time — e a mecânica de `__global__` que a
   SPEC-117 usou responde às duas.

---

## 8. O que a implementação reaproveita

- **`formatoJsonPorBaseUrl` / `temVisao` / `destinoSimulado`** — as três já
  casam `baseUrl` contra `PRESETS_GATEWAY` com o mesmo desenho. A fatia A
  acrescenta o eixo do modelo a UMA delas, sem inventar mecanismo.
- **`erroDeGateway`** — já traduz 401, 404, 413 e o 400 de visão para frases
  que dizem onde mexer. A fatia B é mais uma entrada na mesma função.
- **O fallback de streaming** (§1.2) — construído, testado, e exatamente o que
  um wrapper caseiro exige.
- **`comAdditionalPropertiesFalse`** e a lista
  `NAO_SUPORTADAS_EM_STRUCTURED_OUTPUTS` — o produto já sabe sanear o schema
  para o dialeto estrito da Anthropic, **medido contra ela**. É a fatia A
  chegando a um lugar que já a esperava.
- **`ImportarCurl`** (SPEC-118) — o curl que originou esta SPEC é exatamente o
  que a tela já sabe interpretar: endereço, chave separada e mascarada, e o
  `model` lido do corpo. **A configuração deste gateway é colar aquele curl.**

# SPEC-118 — Três conexões, configuradas colando um cURL

> **Origem:** o usuário, olhando as duas telas de configuração que existem
> hoje (Modelo de IA e Exportação):
>
> > *"Aqui também precisa ser simplificado/unificado, o objetivo é que eu
> > possa configurar: 1 - A IA geral onde roda o assistente e geração dos
> > itens, o endpoint para importação, o endpoint para exportação, todos 3 via
> > importação de curl para ferramenta"*
>
> Esta SPEC **não implementa nada** — mede, propõe a forma e faz as perguntas
> cuja resposta muda o desenho.

---

## 0. O laço que esta SPEC fecha, e ele foi aberto pelo próprio usuário

Antes de qualquer proposta, o achado que organiza tudo. O campo `metodo` e o
campo `envelope` de `DestinoDoGateway` existem por causa desta frase, que está
citada no código desde o §346:

> *"é possível que existam diferentes agentes no gateway… **o curl da chamada**
> vai conter variações entre agentes"*

**Os campos foram derivados de um cURL que ninguém nunca colou.** O produto
pediu à pessoa que lesse o curl dela, decompusesse mentalmente em verbo,
cabeçalhos, endereço e formato do corpo, e redigitasse cada pedaço num
formulário diferente. Esta SPEC propõe fechar o laço: **a pessoa cola o curl,
e o produto faz a decomposição.**

Não é conveniência de digitação. É a diferença entre uma configuração que
alguém confere contra o que funciona no terminal e uma que alguém transcreve —
e transcrição é onde some uma barra, um header, um `/v1`.

---

## 1. A medição: o que existe, e por que parece duas ferramentas

### 1.1 Duas telas, dois modelos mentais diferentes

| | **Modelo de IA** | **Exportação** |
|---|---|---|
| O que configura | um destino de LLM | 1 endereço de topo + N destinos por operação |
| Campos | `baseUrl`, `chave`, `modelo`, `cabecalhos`, `visao`, `formatoJson`, `baseUrlTranscricao` | `endpoint`, `rotulo`, `cabecalhos`, `metodo`, `envelope`, `espaco`, `demonstracao`, `operacao` |
| Onde mora | credencial (banco do servidor / `~/.gerador`) | documento de config `exportador` |
| Como se testa | botão **"Testar conexão"** | ❌ não se testa — descobre-se na falha |

**Sete campos de um lado, oito do outro, e só um nome em comum
(`cabecalhos`).** As duas telas descrevem a mesma coisa — *um endereço HTTP com
autenticação e um formato de corpo* — em dois vocabulários.

### 1.2 O que o usuário chama de "importação" não existe como conceito

Ele pediu três coisas: **IA**, **importação**, **exportação**. O produto tem:

| Operação de hoje | O que ela é, na cabeça de quem usa |
|---|---|
| `itens` | exportação |
| `documento` | exportação |
| `specDoItem` | exportação |
| `adr` | **importação** |
| `documentoExterno` | **importação** |

As cinco moram na MESMA lista chamada *"Outros destinos"*, num `<select>` onde
"ler ADRs" e "publicar documento" são vizinhos indistinguíveis. **A direção do
fluxo — a coisa que a pessoa usa para se orientar — não aparece em lugar
nenhum da tela.**

E o `endpoint` de topo é um sexto destino, de `itens`, com tela própria por
motivo histórico (SPEC-81 §1: quem configurou antes não reconfigura). Ele é o
único que não diz a operação, porque a operação dele é implícita.

### 1.3 O que já é bom, e não se perde

- **Falha por item, nunca tudo-ou-nada** (SPEC-49) — não é assunto desta SPEC.
- **`demonstracao`** (SPEC-115 fatia D) — um destino que não chama ninguém e
  se anuncia. Continua valendo, e ganha significado: um destino de
  demonstração é o único que pode não ter curl.
- **"Testar conexão"** da IA — esta SPEC quer estendê-lo, não removê-lo.
- **A coerção que degrada campo a campo** (`normalizarExportador`) — o cURL
  vira mais uma entrada a sanear, com a mesma disciplina.

---

## 2. A proposta: três conexões, e cada uma tem um curl

```
Conexões
├── 🧠 IA          — onde roda o assistente e a geração dos itens
├── ⬇ Importar     — de onde vêm documentos e ADRs da casa
└── ⬆ Exportar     — para onde vão itens, specs e o documento
```

Os nomes são os que o usuário usou. A direção da seta é a informação que falta
na tela de hoje, e ela é a primeira coisa que alguém procura.

**Cada conexão continua podendo ter mais de um destino** — é a régua da
SPEC-81 e ela não se mexe: dois trackers numa migração, dois espaços de
documentação. O que muda é que eles ficam agrupados pela direção, e não
espalhados num select de cinco valores.

### 2.1 O que um cURL preenche

```bash
curl -X POST 'https://gw.empresa/jira/issues' \
  -H 'Authorization: Bearer abc123' \
  -H 'X-Team: pagamentos' \
  -d '{"itens": [{"chave": "...", "titulo": "..."}]}'
```

| Do curl | Vira | Como |
|---|---|---|
| a URL | `endpoint` / `baseUrl` | direto |
| `-X POST` | `metodo` | direto; ausente = `POST`, que já é o padrão |
| `-H` | `cabecalhos` | direto |
| `Authorization: Bearer …` | `chave` | **separado dos cabeçalhos e mascarado** — ver §3.1 |
| a chave de topo do `-d` | `envelope` | `{"itens": [...]}` → `itens`; corpo sem embrulho → `""` |
| `"model": "..."` no `-d` (só IA) | `modelo` | direto |

### 2.2 O que o cURL NÃO diz, e continua sendo escolha

- **`operacao`** — nenhum curl diz "isto cria issue" versus "isto anexa spec
  num issue que já existe". O produto não pode adivinhar, e adivinhar errado
  mandaria a spec para a rota de criação.
- **`rotulo`** — como a pessoa chama aquilo na tela dela.
- **`espaco`** — a etiqueta opaca do §348. Se aparecer no corpo, pode ser
  proposta; mas o produto não sabe o que é um espaço, de propósito.
- **`visao`, `formatoJson`** (IA) — são declarações sobre o modelo, não sobre
  a chamada.

**Então o cURL preenche o formulário; ele não o substitui.** É a mesma régua
do `leitorDeAdr`: *importar não é aceitar*.

---

## 3. ⚠️ O que esta SPEC precisa decidir antes da primeira linha

### 3.1 A chave vem no curl, e isso é uma superfície nova

Um curl copiado de um terminal que funciona **contém o segredo real**. Hoje a
chave de IA tem um caminho tratado: vai para o banco do servidor, a API devolve
só o resumo mascarado, o arquivo local é `0600`, e a tela diz *"nada vai pra
arquivo de configuração nem pro git"*.

Uma caixa de texto onde se cola um curl é um lugar novo onde a chave passa. Ela
pode ficar num `value` de textarea, num screenshot de suporte, num undo buffer,
num relatório de erro. **Três regras que a implementação precisa seguir:**

1. O campo de colar é **efêmero**: ao interpretar, ele se esvazia. Não guarda
   rascunho, não repopula ao reabrir.
2. A chave sai dos `cabecalhos` e vai para o campo de segredo, **mascarada na
   volta** — como a de IA já é.
3. A tela **diz** que reconheceu um segredo e o separou. Silêncio aqui faria a
   pessoa achar que a chave foi para a config versionável.

> **É a régua mais importante desta SPEC**, e a única cujo erro é
> irreversível: chave vazada não se desvaza.

### 3.2 Um curl descreve UMA chamada

O agente que cria issue e o que anexa spec são **duas chamadas** (SPEC-114,
SPEC-98 §3.2) — e podem estar atrás de endereços diferentes. Um botão único de
"importar meu curl" que configurasse a exportação inteira teria que inventar o
resto.

**Um curl por destino**, então. O que se ganha em unificação é a FORMA de
configurar, não o número de coisas configuradas.

### 3.3 Dialetos de cURL, e este é o trabalho de verdade

A mesma chamada, copiada de lugares diferentes:

| Origem | O que muda |
|---|---|
| DevTools → *Copy as cURL (bash)* | continuação com `\`, aspas simples |
| DevTools → *Copy as cURL (cmd)* | continuação com `^`, aspas duplas, escapes diferentes |
| PowerShell | `curl` é alias de `Invoke-WebRequest` — **outra sintaxe inteira** |
| Postman / Insomnia | `--data-raw`, `--location`, `--request` |

Um parser que só entenda bash vai falhar no caso mais comum do usuário deste
produto, que trabalha no Windows. **A decisão a tomar:** quais dialetos entram
na primeira versão, e o que acontece com o que não for entendido — recusa
explícita ("não entendi este formato, confira os campos") é melhor que um
parse parcial silencioso.

### 3.4 O que já está configurado não pode quebrar

Quem configurou pelos formulários continua com a configuração valendo, sem
tocar em nada. O cURL é **uma entrada a mais** para os mesmos campos — não um
formato novo de armazenamento. O documento salvo no banco continua sendo o que
é hoje.

---

## 4. O que esta SPEC RECUSA

- **Guardar o curl.** O que se guarda é o que ele virou. Guardar o texto
  original seria guardar a chave em claro, e criaria duas fontes da mesma
  verdade que divergem no primeiro que alguém editar.
- **Executar o curl.** Interpretar não é rodar. O "Testar conexão" é outro
  gesto, deliberado, e continua sendo.
- **Esconder os campos depois de importar.** O formulário continua lá, e é o
  que a pessoa confere. Um importador que preenche e some é um importador em
  que ninguém confia na segunda vez.
- **Um curl só para as três conexões.** São chamadas diferentes para sistemas
  diferentes — ver §3.2.
- **Inferir `operacao` do corpo.** Ver §2.2: errar aqui manda dado para a rota
  errada, e o erro parece certo.
- **Trocar o formato salvo da configuração.** Ver §3.4.

---

## 5. Fatias

- **A — o interpretador de cURL, puro e testado.** Entra texto, sai
  `{ url, metodo, cabecalhos, corpo }`. Sem tela, sem rede. **Prova:** a mesma
  chamada copiada dos quatro dialetos da §3.3 produz o mesmo resultado, e o
  que não for entendido volta como recusa nomeada.
- **B — a chave é reconhecida e separada.** `Authorization` sai dos cabeçalhos
  e vira segredo mascarado; a tela diz que isso aconteceu. **Prova:** depois de
  importar, a chave não aparece em nenhum lugar legível da tela nem no
  documento de config.
- **C — colar o curl preenche o formulário de um destino de EXPORTAÇÃO.**
  `endpoint`, `metodo`, `cabecalhos`, `envelope`. **Prova:** o curl do §2.1
  produz `envelope: "itens"`, e a tela mostra o que entendeu antes de salvar.
- **D — o mesmo para IMPORTAÇÃO**, com a direção visível na tela (§1.2).
  **Prova:** as operações de leitura deixam de estar no mesmo balaio das de
  escrita.
- **E — o mesmo para a IA**, extraindo `baseUrl`, `chave` e `modelo` do corpo.
  **Prova:** o curl de um gateway OpenAI-compatível configura a conexão sem
  ninguém digitar `/v1`.
- **F — "Testar conexão" para as três.** Hoje só a IA tem. É o par natural do
  importador: colou, conferiu, testou. **Prova:** um endereço errado é
  descoberto na configuração, não na primeira exportação.
- **G — as três conexões numa tela só**, agrupadas por direção (§2). É
  reorganização; o dado salvo não muda (§3.4).

---

## 6. Perguntas em aberto

1. **Quais dialetos de cURL entram na primeira versão?** (§3.3) O usuário
   trabalha no Windows — bash-only seria entregar a fatia pela metade para
   quem a pediu.
2. **"Testar conexão" para importação/exportação chama o quê?** A IA tem um
   endpoint de teste barato. Um destino de tracker não tem: testar de verdade
   criaria um issue. Um `HEAD`/`OPTIONS`, um payload vazio, ou a fatia F fica
   só para a IA?
3. **A tela única (fatia G) substitui as duas abas ou as agrupa?** Trocar de
   lugar uma configuração que alguém já sabe onde fica tem custo — e o §308
   deste projeto já pagou por aba cortada.
4. **O `endpoint` de topo da exportação (SPEC-81 §1) some?** Ele é o destino de
   `itens` de quem configurou antes, mantido por compatibilidade. Com a tela
   reorganizada, ele vira um destino normal na lista — e isso exige migração de
   dado, que a SPEC-81 recusou fazer na época.

---

## 7. O que a implementação reaproveita

- `DestinoDoGateway` com `metodo`/`envelope`/`espaco`/`cabecalhos` — **os
  campos já são exatamente a decomposição de um curl** (§0). O importador
  preenche o que já existe.
- `normalizarExportador` / `sanearPapeis` — a disciplina de degradar campo a
  campo em vez de recusar o documento inteiro.
- `CredencialProvedor` e o resumo mascarado — o caminho da chave de IA já está
  resolvido e é o molde para a §3.1.
- `demonstracao` (SPEC-115 fatia D) — o destino que não chama ninguém, e o
  único que legitimamente não tem curl.
- `TokensTab` — onde está escrito que *"um recurso que só existe via `curl` é,
  na prática, um recurso que não existe"*. Esta SPEC é a outra ponta da mesma
  régua: o curl deixa de ser o caminho alternativo e vira **entrada** da tela.

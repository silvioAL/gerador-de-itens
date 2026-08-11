# SPEC-34 — Configurar conversando (#297)

## 1. Pedido e linhagem

O pedido original é do JOURNEY §83, na voz do usuário: *"poderia alterar — mesmo
que da mesma forma, conversando com um chat de IA com algum agente (melhor do
que aqueles botões de sugerir que colocamos) + approve"*. A comparação que ele
mesmo fez continua sendo o coração do desenho: o botão "✨ Sugerir" é campo a
campo e exige saber ONDE clicar; a conversa é no nível da intenção ("nosso time
passou a exigir teste de contrato em API externa") e quem descobre os campos é
a ferramenta.

Esta SPEC herda duas decisões já tomadas e não as reabre:

- **SPEC-23 §6.6**: a IA propõe, a rota existente recebe, o usuário salva. Em
  nenhum momento o modelo escreve configuração diretamente.
- **SPEC-26 Bloco 5**: o agente não escreve, o agente propõe — o "approve" é um
  clique explícito do usuário sobre uma proposta visível e completa.

E depende de uma terceira: o **#298** (assistente flutuante) existe exatamente
para isto — a lista `ABAS` de `AssistenteFlutuante.tsx` é o ponto de extensão
declarado onde esta conversa nasce.

## 2. Medições que moldam a SPEC (fatos, não estimativa)

1. **A sugestão estruturada JÁ EXISTE no hospedado.** `POST /ia/sugerir-config`
   está em `packages/server/src/routes/ia.ts` e a tabela declarativa
   `ALVOS_SUGESTAO_CONFIG` mora em
   `packages/aplicacao/src/casos-de-uso/ia/pedidos.ts` (seis alvos: `campo-no`,
   `campo-aresta`, `regra-refinamento`, `item-processo`, `teste-automatizado`,
   `papel`). O #297 **não** é "construir a
   sugestão de config" — é construir a conversa por cima dela: intenção →
   alvo(s) → proposta → approve.
2. **`retrospectivas` está em `RECURSOS_SEM_ROTA`**
   (`packages/server/src/auth/permissoes.ts`), com o motivo assinado: "a
   ingestão de retrospectivas (SPEC-23 fluxo 5) nunca foi construída no modo
   hospedado". Tabela, rota e tela: tudo é construção do zero. O recurso de
   RBAC já existe no enum antecipando exatamente esta SPEC.
3. **As rotas de escrita de config já são protegidas por RBAC**
   (`campos-no`, `campos-aresta`, `regras.*`, `pipeline-agentes`…). Aplicar uma
   proposta pela mesma rota herda o portão de graça — nenhuma verificação nova
   no servidor.

## 3. Decisões

### 3.1 Onde mora: aba do assistente, não tela nova

"⚙ Configurar" entra como terceira entrada em `ABAS` do `AssistenteFlutuante`.
Nada de botão novo em Configurações nem overlay próprio — o motivo de o #298
ter vindo antes na fila foi este. A tela de Configurações continua sendo onde
se vê e edita o estado; a conversa é onde se descreve a intenção.

### 3.2 A conversa propõe; aplicar usa a rota de sempre

A resposta do agente vem em duas partes: texto (o raciocínio, curto) e zero ou
mais **propostas tipadas** `{alvo, objeto}` — o mesmo vocabulário de
`ALVOS_SUGESTAO_CONFIG`. Cada proposta vira um cartão com o objeto completo
visível e um botão "Aplicar" — o mesmo padrão do "Aplicar ao canvas" da
conversa de desenho, que o usuário já conhece.

"Aplicar" chama **a mesma função de cliente que o formulário usa**
(`apiCamposNo.criar`, `apiRegras.salvar`, …) — mesma validação, mesma
auditoria, mesmo RBAC do servidor. Não existe caminho novo de escrita; existe
um jeito novo de chegar ao caminho velho.

### 3.3 RBAC visível, não silencioso

Se a sessão não tem permissão de editar o recurso de uma proposta, o cartão
mostra a proposta com o Aplicar desabilitado e o motivo escrito ("sem permissão
para editar campos de componente") — a lição do §144: esconder o que seria
negado deixa o usuário sem saber que a feature existe e a quem pedir acesso. A
fonte é `GET /auth/permissoes`, que a UI já consome.

### 3.4 Retrospectivas v1: contexto, não RAG

A SPEC-23 §4 já tinha decidido "nenhuma lib de vetor no dia um" para um corpus
de um time; aqui a mesma régua corta mais fundo: **v1 nem embeddings tem**. O
fluxo é:

- Tabela `retrospectivas` (organização, time, título, texto, criadoEm) e rotas
  `POST/GET/DELETE /retrospectivas`, protegidas pelo recurso `retrospectivas`
  com `editar`/`ler` — **o recurso sai de `RECURSOS_SEM_ROTA`** e o
  teste-guarda `permissoes.cobertura.test.ts` passa a exigi-lo coberto.
- Na aba, anexar/colar uma retro é a mesma UX do Contexto do épico (colar texto
  ou anexar arquivo de texto). As retros do time entram no prompt da conversa
  como contexto.
- **Toda proposta nascida de retro cita o trecho de origem** (SPEC-23 fluxo 5
  já exigia: "nunca uma sugestão sem rastro de onde veio").

Busca vetorial só quando o corpus real justificar — fica registrado aqui para
ninguém "completar o RAG" por zelo.

### 3.5 Uma rota conversacional: `POST /ia/configurar`

Recebe `{mensagens, timeId}`; o montador (`montarPedidoConfigurarConversa`, em
`packages/aplicacao`, mesmo padrão de `montarPedidoDiagrama`) inclui: os alvos
disponíveis com seus schemas, um resumo da config atual do time (para o modelo
propor mudança, não duplicata) e as retrospectivas do time (Fase 2). Devolve
`{texto, propostas}`.

**Sem tool-use encadeado na v1.** A decisão do §84 continua valendo: nada no
caminho crítico pode exigir modelo forte. Uma chamada, resposta estruturada,
zero ou mais propostas. Se o gateway conectado for um modelo capaz, a
qualidade sobe sozinha — a mecânica não muda.

## 4. Fases

### Fase 1 — a conversa e o approve (sem retrospectivas)

Aba "⚙ Configurar" no assistente; `POST /ia/configurar`;
`montarPedidoConfigurarConversa` com teste de anatomia (mesmo padrão de
`pedidos.anatomia.test.ts`); cartões de proposta com Aplicar pela rota
existente; RBAC visível (§3.3).

**Feito quando**: no E2E com gateway falso, descrever uma intenção gera uma
proposta de `campo-no`, Aplicar cria o campo de verdade (a aba "Padrões por
componente" passa a listá-lo) e nada é escrito sem o clique. Prova de mordida:
com o fio proposta→rota cortado, o E2E fica vermelho na asserção do campo
criado.

### Fase 2 — retrospectivas do zero

Migração + rotas + recurso RBAC ganhando rota (atualizar `RECURSOS_SEM_ROTA` e
o teste-guarda); anexar/listar retros na aba; retros no contexto do prompt;
proposta citando o trecho.

**Feito quando**: colar uma retro com um aprendizado concreto e pedir "vira
regra" gera proposta de `regra-refinamento` citando o trecho; sem permissão em
`retrospectivas`, o POST é 403 e a UI diz isso.

### Fase 3 — fora por enquanto (registrado para não virar zelo)

Busca vetorial sobre retros; propostas em lote multi-alvo com aplicação
transacional; edição de `when` por IA (mesma exclusão da SPEC-23 §6.7, mesmo
motivo: condição induz erro silencioso).

## 5. Fora de escopo, deliberado

- **Conversa de refinamento dos itens** (SPEC-26 Bloco 5): outra conversa,
  outra fase do trabalho, outro material. Esta SPEC não a adianta nem a bloqueia.
- **Escrever config sem clique** — nem com "modo confiante". A fronteira do
  §41/SPEC-23 §6.6 não tem exceção.
- **Alvos novos** além dos seis existentes: cada um é uma entrada na tabela
  em rodada própria, com schema e regras de preenchimento medidos.

## 6. Verificação

Como todas as fases de IA do projeto: fake determinístico do gateway em teste
automatizado (nunca modelo real em CI), validação real com Playwright contra a
stack de trabalho antes de declarar qualquer fase entregue, e prova de mordida
de todo teste novo (reintroduzir o defeito, ver o vermelho certo).

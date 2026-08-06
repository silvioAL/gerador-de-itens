# SPEC-02 — Frontend: canvas e painel de propriedades

**Passo 2 de §12** · Depende de SPEC-01

Leia `CONTEXTO-E-ARQUITETURA.md` (§3.3, §4.3, §5.2, §7.1, §7.3) antes.

---

## 1. Objetivo

Editor de diagrama e painel de propriedades que renderiza o spec com condicionais, N/A com justificativa e proveniência visível, mais prontidão no canvas e gate na derivação.

## 2. Escopo

**Inclui:** projeto Vite + TS + React, cliente da API, canvas SVG, painel de propriedades dirigido por `diagrama.json`, avaliador de condições em TS validado contra a fixture compartilhada, semáforo de prontidão, gate, tela de revisão mínima.

**Não inclui:** padrões, IA, Graphify, CSV, telas de configuração.

## 3. A duplicação controlada

`frontend/src/spec/` reimplementa **apenas** o avaliador de condições e a prontidão. É a duplicação deliberada de §5.2, e só se sustenta com a regra:

> A suíte TS lê `fixtures/spec-conditions/rabbit.json` — **o mesmo arquivo** que o Java. Não copie para dentro de `frontend/`. Configure o Vitest para resolver o caminho da raiz do repositório.

Semântica idêntica à de SPEC-01 §6 e §7. Se algum caso passar num lado e falhar no outro, o bug é da implementação, não da fixture.

Todo o resto do motor — derivação, dependências — é chamada de API. **Não reimplemente derivação no frontend.**

## 4. Canvas

SVG manipulado diretamente, sem biblioteca de diagramação. Porte o que a ferramenta atual já resolve: zoom, pan, arrastar nó, criar aresta por arraste, roteamento automático com waypoints manuais opcionais, seleção, snap opcional.

**Estado é objeto JS, nunca o DOM.** Este é o erro central da versão atual (§2.3): ela lê valores de volta de uma tabela oculta por índice de célula. O SVG é renderizado a partir do estado; nada é lido de volta dele.

Cada nó exibe:

- ícone e rótulo do tipo, conforme `diagrama.json`
- distinção visual entre `novo` e `existente`
- **semáforo de prontidão** — verde, amarelo, vermelho
- badge de time quando `existente` e o time difere do time da quebra

Criação de aresta valida contra as regras de conexão por destino de `diagrama.json`; conexão inválida é rejeitada com o motivo, não silenciosamente ignorada.

## 5. Painel de propriedades

Renderizado **inteiramente a partir do `spec` do tipo de nó**. Não escreva formulário específico de Rabbit em código — quando SPEC-03 acrescentar Kafka, nada aqui deve mudar.

Para cada campo visível:

| Tipo | Controle |
|---|---|
| `text` | input |
| `number` | input numérico |
| `boolean` | toggle |
| `select` | select com `options` |

**Reavaliar visibilidade a cada mudança.** Marcar "Possui DLQ?" faz `dlxName` e `retryStrategy` aparecerem imediatamente, sem round-trip. É a razão de o avaliador existir no cliente.

### 5.1 Proveniência visível

Não negociável (§3.3). Cada campo preenchido mostra sua origem:

| Origem | Tratamento |
|---|---|
| `manual` | neutro |
| `extraido` | verde, com a evidência acessível (tooltip ou link) |
| `inferido` | **amarelo**, com a confiança e um botão explícito de confirmar |
| `sugerido` | **distinto e mais forte**, com confirmar/descartar por campo |

Esconder a distinção anula o mecanismo. Um valor inferido não pode parecer igual a um que alguém decidiu.

### 5.2 N/A

Botão de dispensar por campo, quando `permiteNA` não for `false`. Dispensar **exige motivo** — campo de texto obrigatório, não placeholder. Sem motivo, o campo continua em aberto e o erro `NA_SEM_MOTIVO` aparece.

Campo com `permiteNA: false` não mostra o botão.

### 5.3 Ajuda

`ajuda` do campo renderizado junto ao rótulo. É onde mora o "por que isso importa", e é metade do valor de forçar a pergunta.

## 6. Prontidão e gate

Calculada no cliente a cada mudança, exibida em três lugares: no nó, no painel, e num resumo global.

Botão **Derivar Quebra** desabilitado enquanto houver nó vermelho, com a lista do que falta e clique que seleciona o nó.

**Amarelo não bloqueia.** Bloquear geraria pressão para confirmar sem ler, que é o oposto do objetivo.

O backend reavalia e pode recusar mesmo assim; trate `podeDerivar: false` na resposta exibindo os motivos, sem assumir que o cliente estava certo.

## 7. Persistência

Autosave contra `PUT /api/quebras/{id}` com debounce (~2s) e indicador discreto.

Envie sempre o `rev` carregado. Em **409**, não sobrescreva: avise que a quebra foi alterada em outro lugar e ofereça recarregar.

`localStorage` serve **apenas** como rascunho de recuperação após queda do navegador. Nunca como fonte da verdade — foi essa a origem da dor #4.

## 8. Tela de revisão (mínima)

Após derivar: tabela de atividades com rótulo, tipo, tamanho, descrição, techs, contextos e dependências. Lista de ciclos e conflitos com link para o item. Destaque para atividades com `timesEnvolvidos` preenchido.

Sem edição de atividade nesta etapa — atividades são derivadas, não editadas (§6.1).

## 9. Critérios de pronto

- [ ] Suíte TS roda `fixtures/spec-conditions/rabbit.json` e passa em todos os casos
- [ ] Marcar DLQ faz `dlxName` aparecer sem chamada ao servidor
- [ ] Campo inferido é visualmente distinto e exige confirmação
- [ ] N/A sem motivo mantém o campo em aberto
- [ ] Nó vermelho desabilita a derivação e o motivo é clicável
- [ ] Autosave com 409 tratado
- [ ] Derivar a fixture 01 mostra as 6 atividades com as dependências

## 10. O que NÃO fazer

- Não reimplemente derivação, dependências ou ciclos no cliente.
- Não escreva formulário específico por tipo de nó.
- Não use `localStorage` como fonte da verdade.
- Não leia estado de volta do DOM.
- Não crie botão de "aceitar todas as sugestões" (§4.3).
- Não esconda a origem dos valores para deixar a tela mais limpa.

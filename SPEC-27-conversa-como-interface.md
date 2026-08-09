# SPEC-27 — A conversa como interface (desenhar e refinar falando)

## 1. Objetivo

Dar à ferramenta a primitiva que falta: **uma janela de conversa**, tipo chatbot, onde o usuário descreve o que quer e um agente responde com propostas que ele confirma. Duas conversas distintas, uma por fase do trabalho:

- **Conversa do desenho** — descrever a demanda e receber o DIAGRAMA proposto (nós, conexões, specs), olhando os tipos de nó disponíveis, as regras de conexão e a stack do time.
- **Conversa da especificação** — depois dos itens derivados: alterar um item, mandar revisar os demais, receber sugestões e ir confirmando.

## 2. O que motivou (achado real, e é uma correção de rota)

Duas falas do usuário, na mesma conversa:

> *"Hoje, para mudar, basicamente eu falo com o Rovo (janela de chat) e peço para ele alterar um item e depois para ele revisar os demais; ele me devolve as sugestões e vou confirmando para alterar os demais. Acho até mais simples fazer assim."*

> *"O ponto é que não temos uma feature importante (mesma janela, similar a chatbot), onde eu possa desenhar um diagrama passando as informações (atual botão contexto do épico) e um agente avaliar isso, as configurações, stack do time, etc, e construir o diagrama."*

**Duas correções de rumo que isso impõe:**

1. **Propagação não é um botão.** A SPEC-26 desenhou "Propagar mudança" (Bloco 2) + painel de diff (Bloco 3) como uma tela própria. O fluxo real do usuário já resolve isso conversando: *altere X* → *revise os demais* → confirma um a um. O painel de diff **não morre — ele vira o cartão de proposta dentro da conversa.** Menos superfície nova, mesma garantia (nada é escrito sem aprovação).
2. **A entrada do funil está vazia.** O botão "Contexto do épico" só GUARDA texto. Ninguém lê esse texto para propor a arquitetura — o diagrama continua 100% manual. É a maior lacuna do produto hoje: a ferramenta ajuda a especificar o que já foi desenhado, e não ajuda a desenhar.

E uma terceira, sobre janela de contexto:

> *"Provavelmente, para não exceder janelas de conversa, depois do desenho ele teria que começar outra conversa sobre a especificação."*

## 3. Decisão central: a conversa é NOSSA, não do modelo

O `motor.ts` já zera o histórico da sessão a cada chamada (`resetChatHistory()`, achado da SPEC-25 Fase 1 — sem isso o contexto estourava no segundo papel). Consequência de arquitetura, não acidente: **o modelo não guarda conversa; quem monta o histórico enviado é o app.**

Isso significa que decidir o que entra na janela é decisão de produto, e a divisão por fase é a primeira aplicação dela:

| | Conversa do desenho | Conversa da especificação |
|---|---|---|
| Carrega | descrição da demanda + tipos de nó + regras de conexão + techs/contextos + perfil de stack do time | itens derivados + as respostas já escritas + o que mudou no desenho |
| Não carrega | nada de item/refinamento (não existem ainda) | o catálogo de tipos de nó (o desenho já está feito) |
| Produz | proposta de diagrama | proposta de alteração campo a campo |

Trocar de fase **começa uma conversa nova**, de propósito. Não é limitação técnica disfarçada de feature: é o que mantém a janela previsível no modelo local, onde estourar contexto não dá erro claro — dá resposta pior, em silêncio (foi exatamente o que aconteceu na Fase 1).

## 4. Decisão: trilhos, não tool-calling livre

O caminho "óbvio" seria dar ao modelo as funções de `useQuebra` (`adicionarNo`, `tentarConectar`, `definirValorSpec`) como ferramentas e deixá-lo encadear chamadas. **Não é o que fazemos na v1**, pelo motivo já registrado em SPEC-25 §8.1: tool use livre encadeado exige provedor forte, e o ambiente que precisa funcionar hoje é o modelo local de 4B.

Em vez disso, **saída estruturada com o espaço de resposta restrito pela configuração**:

- o `tipo` de cada nó é um **enum** com os tipos que existem em `config/diagrama.json` — o modelo não consegue inventar um tipo que a ferramenta não tem;
- o `tipo` de cada conexão idem, e a validade do par origem→destino é conferida pelo app com `edgeRules`, a MESMA regra que valida um arrasto do mouse;
- specs propostas passam pelo mesmo caminho de `ValorSpec` com `origem: "sugerido"` — o semáforo de prontidão e o confirmar/descartar que já existem (SPEC-23 §Arquitetura) valem sem nada novo.

O app põe os trilhos; o modelo preenche. É o mesmo princípio do Bloco 5a da SPEC-26, aplicado antes e num lugar mais fácil.

## 5. Fase 1 — Conversa do desenho (esta rodada)

**Rota nova `POST /ia/diagrama`** (`openApiLocal.ts`): recebe `{descricao, tiposDisponiveis[], tiposDeConexao[], techs[], contextos[], perfilTime?}` e devolve, via GBNF:

```json
{
  "nos": [{ "id": "n1", "tipo": "service", "rotulo": "srv-checkout", "motivo": "..." }],
  "arestas": [{ "de": "n1", "para": "n2", "tipo": "http", "motivo": "..." }]
}
```

`motivo` não é enfeite: é o que a pessoa lê para decidir se aceita. Uma proposta sem porquê é uma caixa-preta pedindo confiança cega.

**UI `ConversaPanel`**: janela de chat de verdade (histórico de mensagens, campo de entrada), aberta pelo header. A resposta do agente vira um **cartão de proposta** com a lista de nós/conexões e um botão "Aplicar ao canvas" — e o que é aplicado passa pelas MESMAS funções que um clique humano usaria (`adicionarNo`, `tentarConectar`), nunca por um caminho paralelo (lição do JOURNEY §41).

**O botão "Contexto do épico" continua existindo** — ele é o armazenamento (`demandInfo`/`anexosContexto`, já persistido e já usado nos prompts da esteira). A conversa é a porta de entrada conversacional para o MESMO dado, não um segundo lugar para guardar a mesma coisa.

**Feito quando**: descrever uma demanda em português na janela devolve um diagrama coerente com os tipos que a ferramenta tem, com o porquê de cada nó, e "Aplicar ao canvas" produz nós e conexões reais, editáveis como qualquer outro.

## 6. Fase 2 — Conversa da especificação (próxima)

Mesma janela, escopo outro: alterar o campo de um item e mandar revisar os demais. Cada sugestão vira um cartão com antes/depois e aceitar/rejeitar — **é aqui que os Blocos 2 e 3 da SPEC-26 aterrissam**, como conteúdo da conversa em vez de tela própria. A onda de impacto (quem depende de quem) e a detecção de obsolescência (Bloco 1, já implementado) continuam sendo computadas pelo app: elas dizem ao agente QUAIS itens revisar, para ele não precisar descobrir isso sozinho.

## 7. Fora de escopo, deliberado

- **Tool-calling livre encadeado** — §4. Entra quando houver provedor forte (SPEC-25 Fase 2), sem mudar a arquitetura.
- **Memória entre conversas** — cada fase começa limpa, §3.
- **Editar o diagrama por conversa depois de aplicado** (mover, renomear falando) — a conversa propõe o desenho inicial; ajuste fino continua no canvas, que é melhor nisso.
- **Streaming token a token da proposta** — o corpo é JSON restrito por grammar; mostrar JSON sendo montado não ajuda ninguém. O estado "pensando…" que já existe basta.

## 8. Verificação

Contra o `gerador open` real, com o modelo local: descrever uma demanda de verdade (o épico de crédito que o usuário já usa como massa), conferir que os tipos propostos existem na configuração, que as conexões respeitam `edgeRules`, e que aplicar produz um canvas editável. Regressão completa verde antes.

## 9. Fase 2 — implementada: a conversa da especificação

`POST /ia/alterar-item` serve os DOIS pedidos do fluxo real com uma rota só, porque são a mesma operação vista de ângulos diferentes: *dado um item e um motivo, o que muda nos campos dele*.

- **"Altere o item X"** → manda `instrucao`.
- **"Revise os demais"** → manda `oQueMudou` (o que já foi aceito) em vez de instrução, e o prompt vira *"ajuste APENAS o que decorre disso; se nada decorre, devolva lista VAZIA — essa é uma resposta correta e esperada, não uma falha"*.

Três travas, todas herdadas de erro anterior:

| trava | por quê |
|---|---|
| `campo` é **enum das chaves do próprio item** | o modelo não altera um campo que não existe — mesmo trilho do diagrama (§4) |
| **uma chamada por item** | o lote grande foi o que truncou e apagou o trabalho de um papel inteiro (JOURNEY §93); aqui a resposta é pequena por construção e o progresso aparece item a item |
| o **valor atual** vai no prompt | sem o "antes", o modelo reescreve do zero em vez de ajustar — o oposto do pedido |

**Quem escolhe o escopo da revisão é o app, não o modelo.** `itensImpactados` (engine, determinístico) devolve quem depende do item alterado (transitivamente) e quem nasce da mesma origem — nó ou conexão. Propagação para cima fica de fora de propósito: o produtor não muda porque o consumidor mudou, e propagar assim transformaria qualquer edição numa revisão da quebra inteira, que é exatamente o trabalho manual que se quer evitar.

**O diff virou cartão.** Cada campo proposto aparece com antes (riscado), depois e o porquê, com Aceitar/Rejeitar. É o Bloco 3 da SPEC-26 aterrissando dentro da conversa em vez de numa tela própria — menos superfície nova, mesma garantia: nada é escrito sem clique.

"Revisar os demais" só habilita **depois de aceitar alguma alteração** — é a mudança aceita que se propaga; sem ela não há o que propagar.

**Bug pego pelo próprio teste**: a primeira versão guardava o cartão renderizado (JSX) dentro da mensagem, no estado. Aceitar/Rejeitar mudava o estado mas o elemento salvo continuava o antigo, e a tela não refletia o clique. Mensagem passou a guardar **dado**; o cartão é montado na renderização.

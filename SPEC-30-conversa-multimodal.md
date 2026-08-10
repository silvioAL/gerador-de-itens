# SPEC-30 — Conversa multimodal: falar com o desenho e mostrar imagens

> **Status**: desenho revisado, implementação não iniciada. Pedido original: *"melhorar a feature de desenhar conversando — deverá ser possível conversar com áudio e enviar imagens para serem interpretadas, e não sei se nosso modelo atual faz isso (provavelmente vamos precisar de outro modelo integrado)."*
>
> Estende [SPEC-27](SPEC-27-conversa-como-interface.md) (a janela de conversa que desenha o diagrama) e depende das capacidades de provedor da [SPEC-25](SPEC-25-selecao-de-modelo-e-provedores.md).

## 0. O que mudou desde a primeira versão desta SPEC

Três coisas aconteceram entre o desenho original e agora, e as três mexem no plano:

1. **O usuário decidiu que transcrição e visão também podem ir por API**: *"para registrar essa parte de imagem e voz também pode ser com o claude ou api se o usuário quiser, afinal ele escolhe o modelo"*. A versão anterior assumia transcrição **local obrigatória**. Isso deixou de valer: transcrever vira uma **capacidade do provedor**, com duas implementações, e quem escolhe é quem usa — a mesma régua que já vale pro modelo de chat (SPEC-25).
2. **A [SPEC-31](SPEC-31-hexagonal-portas-e-adaptadores.md) aconteceu**: existem dois modos com o **mesmo conjunto de rotas**, e um teste (`paridade.sanity.test.ts`) que falha quando um lado ganha rota que o outro não tem. Qualquer rota nova desta SPEC nasce nos dois lados ou entra explicitamente na lista de exceções, com motivo.
3. **O modo hospedado decidiu não carregar modelo local** (Fase 4 da SPEC-31: 200 MB de binário que nunca executa). Consequência direta e não negociável: **no container, transcrição local não existe** — só o caminho de gateway. Não é limitação a contornar depois; é a mesma decisão que fez o `packages/server` não depender de `node-llama-cpp`.

O efeito combinado é que a Fase 1 deixa de ser "instalar whisper" e passa a ser "a porta de transcrição, com dois adaptadores" — o que, por acaso, é mais barato de entregar, porque o adaptador de gateway não precisa de download nenhum.

## 1. Resposta direta à dúvida do usuário: não, o modelo local atual não faz

Verificado, não suposto:

- **`node-llama-cpp` não documenta suporte multimodal** — nem visão nem áudio. A documentação cobre chat, JSON schema, function calling, tokens e GPU; não há menção a modelo de visão, embedding de imagem ou projetor multimodal.
- O **llama.cpp** por baixo **tem** suporte: exige dois GGUF (o modelo + o **mmproj**, o projetor que transforma imagem em embedding) e expõe isso pelo `llama-mtmd-cli`. **Qwen3-VL** existe em GGUF com mmproj.
- **Áudio** é outra família de problema: transcrição é `whisper.cpp`, com bindings Node de terceiros (`nodejs-whisper`, `whisper-cpp-node`, `smart-whisper`), de manutenção desigual.

Então: o modelo GGUF que roda hoje embutido **não vê imagem e não ouve áudio**, e o binding que usamos não expõe o caminho para isso nem se trocássemos o modelo.

**Mas isso só condena o caminho local.** Pelo gateway — que hoje é o caminho principal do modo hospedado e uma opção no local — visão e transcrição já estão disponíveis sem nada novo instalado, porque o protocolo compatível com OpenAI cobre as duas. Foi essa distinção que reorganizou o roteiro (§7).

## 2. A decisão que evita um redesenho: áudio não é multimodal

A tentação é tratar "áudio e imagem" como um problema só — "precisamos de um modelo multimodal". Mas os dois entram no sistema em lugares diferentes:

- **Áudio é entrada de texto com outro teclado.** A pessoa fala, vira texto, o texto entra na conversa **exatamente como se tivesse sido digitado**. O `ProvedorIa` não muda, o prompt não muda, a grammar não muda, nada na esteira muda. Transcrever é **pré-processamento**, e sai inteiro fora do caminho do LLM.
- **Imagem é entrada que só o modelo entende.** Não existe "converter imagem em texto" sem já ser um modelo de visão. Aqui, sim, o provedor precisa mudar.

Separar isso é o que permite entregar o áudio — que é a metade mais usada no fluxo descrito (falar em vez de digitar a demanda) — sem esperar nada da visão.

## 3. Áudio (Fase 1)

### 3.1 A porta, e os dois adaptadores

Transcrever é uma capacidade **do provedor**, não uma característica do produto. A porta é pequena porque o problema é pequeno:

```ts
/** Capacidade OPCIONAL: quem não implementa, não transcreve — e a UI sabe. */
transcrever?(audio: Uint8Array, formato: string): Promise<string>;
```

Dois adaptadores, e o usuário escolhe:

| adaptador | onde roda | custo | disponível em |
|---|---|---|---|
| **local** (`whisper.cpp` via binding Node) | máquina de quem usa | download único, nada sai | só `gerador open` |
| **gateway** (`POST {baseUrl}/audio/transcriptions`) | onde a credencial apontar | por uso; o áudio **sai** | os dois modos |

O adaptador de gateway usa o mesmo formato de-facto da OpenAI (`multipart/form-data` com o arquivo e `model`), que é o que o Groq, o próprio OpenAI e gateways corporativos expõem. Isso significa que ele reaproveita a credencial **já configurada** na aba "Modelo de IA": não há tela nova, não há segunda chave.

Por que os dois, e não um: *"pode ser com o claude ou api se o usuário quiser, afinal ele escolhe o modelo"*. Quem trabalha offline ou não pode mandar áudio pra fora usa o local; quem tem gateway e não quer baixar 1,5 GB usa o gateway. **No modo hospedado só existe a segunda coluna** — não por limitação técnica, mas pela decisão de não carregar modelo dentro do container (§0.3).

### 3.2 O que a tela faz quando ninguém transcreve

O botão de microfone **não aparece** se o provedor selecionado não tem `transcrever`. Mesma régua do pip "sem trabalho" (JOURNEY §97) e do `capacidades.visao` (§4.1): a interface não oferece o que o sistema não faz. Um botão que grava 30 segundos e depois falha é pior que botão nenhum — desperdiça o tempo *e* a fala.

Quando não há transcrição disponível, a janela continua exatamente como hoje: digitar funciona.

### 3.3 Alternativa recusada: Web Speech API

É grátis, sem download e já está no navegador. Recusada porque em Chrome **manda o áudio para servidor do fornecedor**, não funciona offline e varia por navegador. Contra a premissa local-first — e pior, contra ela **em silêncio**: quem fala não imagina que a voz saiu da máquina.

Note a diferença em relação ao adaptador de gateway do §3.1, que também manda áudio pra fora: lá é uma escolha **explícita**, feita numa tela que diz para onde vai. Aqui seria um efeito colateral invisível de clicar num microfone.

### 3.4 O ponto de integração é um só

`JanelaConversa` (SPEC-27) ganha o botão. O áudio gravado vai para uma rota nova de transcrição, e o texto **cai no mesmo campo de entrada**, editável antes de enviar.

Editável importa: transcrição erra nome de sistema e sigla — que é justamente o vocabulário desta ferramenta — e mandar direto transformaria erro de reconhecimento em nó errado no diagrama.

### 3.5 A rota, nos dois modos

`POST /ia/transcrever` nasce em `openApiLocal.ts` **e** em `packages/server/src/routes/ia.ts`, senão `paridade.sanity.test.ts` falha — e falha com razão: uma rota que só existe num modo é exatamente o defeito que a SPEC-31 Fase 4 existiu pra corrigir (a tela chamando `/ia/status` e recebendo 404 sem dizer por quê).

O corpo é o áudio; a resposta é `{ texto }`. Quem escolhe o adaptador é a configuração de IA, não a rota — o mesmo desenho de `montarPedido*`: a camada de aplicação não sabe quem executa.

### 3.6 O que precisa de cuidado

- **Formato**: o `whisper.cpp` quer WAV 16 kHz mono; o navegador grava WebM/Opus. A conversão tem que acontecer, e é o ponto onde bindings de Node divergem (alguns chamam `ffmpeg`, dependência externa a mais). O adaptador de gateway **não tem esse problema** — aceita o WebM direto.
- **Escolha do binding**: `nodejs-whisper` é o mais ativo; `smart-whisper` tem API melhor (modelo carregado uma vez) mas está há ~2 anos sem publicar. Decisão de implementação, atrás da porta, com fake determinístico no teste.
- **Teto de duração**: áudio longo é transcrição longa e upload grande. Teto explícito desde o primeiro commit, pela lição já cara da SPEC-25 Fase 1: *toda ausência de teto virou bug*.
- **Medir antes de recomendar modelo.** A lição do JOURNEY §124 (o `qwen3` que levava 22 minutos) vale igual aqui: o tamanho do modelo de transcrição (`tiny`/`base`/`small`) muda o tempo em ordens de grandeza, e o número que vai pro README tem que sair de uma gravação real nesta máquina, não da tabela do projeto.

## 4. Imagem (Fases 2 e 3)

### 4.1 Capacidade declarada pelo provedor

`ProvedorIa` ganha:

```ts
readonly capacidades: { visao: boolean };
```

E a UI **só oferece anexar imagem quando o provedor selecionado suporta**. Sem isso, o botão existe e a conversa falha depois — o produto não pode oferecer o que o provedor não faz. É a mesma régua do pip "sem trabalho" (JOURNEY §97): a interface tem que dizer a verdade sobre o que o sistema consegue.

### 4.2 Fase 2 — via gateway (barato, quase pronto)

Provedores compatíveis com OpenAI aceitam imagem no próprio `messages` (parte `image_url`, com data URL base64). Ou seja: o `ProvedorCompativelOpenAI` da SPEC-25 Fase 2 vira multimodal com uma mudança pequena na montagem do corpo — **sem modelo novo, sem download, sem binding**.

Isso vale nos **dois** modos, e é o único caminho de visão do modo hospedado. Inclui o Ollama do `--profile ia` (SPEC-31 §Qwen): trocando o modelo por um `qwen2.5vl`, a visão passa a rodar dentro da própria stack, sem nada sair da rede — o mesmo argumento que fez o Ollama entrar.

`capacidades.visao` **não pode ser deduzida da base URL**: o mesmo endereço serve modelo com e sem visão, e a diferença está no nome do modelo. Duas saídas, nesta ordem de preferência:

1. **Declarar no preset**, por modelo (o `PresetGateway` já lista `modelos`) — cobre os destinos conhecidos sem chamada nenhuma.
2. **Deixar o usuário marcar** quando o modelo é digitado à mão (gateway interno com nome próprio), com o padrão em "não".

Errar para "não" é deliberado: o custo de esconder um botão que funcionaria é um clique a mais na configuração; o custo de oferecer um que falha é uma conversa perdida.

Consequência que precisa estar na tela: a imagem **sai da máquina** para o endpoint configurado. Se o gateway é interno (ou o container ao lado), continua dentro da empresa; se é um provedor público, é upload para terceiro. O aviso tem que ser explícito no momento de anexar — print de arquitetura costuma ter mais informação sensível do que quem anexa lembra.

### 4.3 Fase 3 — local (caro, só se necessário)

Visão offline exige Qwen3-VL + mmproj e, como o `node-llama-cpp` não expõe multimodal, invocar o `llama-mtmd-cli` como **subprocesso**. Isso traz: binário a distribuir por plataforma, ~2 GB a mais de download, streaming por stdout em vez da API do binding, e um segundo caminho de código para manter.

Fica registrado como fase **condicional**: só entra se aparecer necessidade real de interpretar imagem **sem** rede. Se o uso for sempre com gateway (o caso do usuário hoje), a Fase 2 basta e a 3 é custo sem retorno.

## 5. O que a imagem vai fazer, concretamente

No fluxo do desenho (SPEC-27 Fase 1), a imagem serve para o que o usuário descreveu como "enviar imagens para serem interpretadas":

- print de um diagrama existente (Miro, Confluence, lousa) → o agente propõe os nós e conexões equivalentes;
- print de tela/erro → vira contexto do épico;
- foto de rascunho em papel → mesmo caminho do primeiro.

Em todos, a saída continua sendo **a mesma de hoje**: uma proposta de diagrama em JSON, com os tipos vindo da config real do projeto (os "trilhos" da SPEC-27), que a pessoa aceita ou rejeita. A imagem entra como **insumo**, não como novo formato de saída — o que significa que nada em `useQuebra`, `derivar` ou na esteira precisa mudar.

## 5.1 Onde o RAG encosta nisto: a retrospectiva acontece falando

O RAG da SPEC-23 (fluxo 5) precisa de um corpus de retrospectivas — e **retrospectiva é uma reunião**. Hoje o material só existe se alguém se der ao trabalho de escrever depois, que é justamente o motivo de o conhecimento não virar checklist reusável (SPEC-23 §2).

A Fase 1 desta SPEC é, sem trabalho adicional, **a fonte natural desse corpus**: grava-se a retro, transcreve-se, e o texto está pronto para ingestão. O mesmo mecanismo de transcrição serve os dois usos.

Com uma ressalva que a existência de dois adaptadores (§3.1) torna necessária: **para retrospectiva, o adaptador local é o certo.** Uma reunião de retro contém avaliação de trabalho de pessoas nomeadas — é o material mais sensível que esta ferramenta chega a tocar. Ditar uma demanda pelo gateway é uma escolha razoável; mandar a gravação de uma retro do time para um endpoint externo é outra conversa, e não é uma que a ferramenta deva facilitar por descuido. Se e quando o RAG entrar, a ingestão a partir de áudio deve **exigir** o adaptador local.

Três regras que ficam registradas para quando o RAG for implementado:

- **Ingerir é ato deliberado, nunca automático.** Transcrição de retro contém nome de pessoa e avaliação de trabalho alheio. O caminho é: transcreve → a pessoa **lê, edita e decide** enviar ao índice. Um pipeline que indexasse toda gravação transformaria a ferramenta num arquivo permanente de conversa de time — o oposto do que ela é para. Isso é a mesma disciplina do §3.2 (texto editável antes de enviar), aqui por um motivo mais forte que a acurácia.
- **Áudio de retrospectiva só transcreve localmente**, pelo motivo acima.
- **Imagem não entra no índice.** Um print vale como insumo de uma conversa (§5), não como documento indexável: extrair texto de imagem para indexar exige OCR ou modelo de visão na ingestão, e o resultado é texto sem procedência confiável. Se um diagrama precisa virar conhecimento pesquisável, o caminho é ele virar **diagrama de verdade** na ferramenta — que é exatamente o que a conversa do desenho já faz.

## 6. Fora de escopo, deliberado

- **Resposta em áudio (TTS)**: o pedido é falar com a ferramenta, não ouvi-la.
- **Vídeo**.
- **Transcrição em tempo real** (streaming de fala): grava-e-transcreve é suficiente para ditar uma demanda; streaming é outro problema de engenharia.
- **Áudio/imagem na esteira de agentes**: aqui é a **conversa** (SPEC-27). A esteira recebe texto já consolidado.
- **Diarização** (quem falou o quê): faria sentido para ata de reunião; não para ditar uma demanda.

## 7. Roteiro faseado

1. **Fase 1a — áudio pelo gateway**: a porta `transcrever?`, o adaptador de gateway (`/audio/transcriptions`), a rota `POST /ia/transcrever` nos **dois** modos, e o botão de microfone com texto editável. Entrega valor sem download nenhum, e é o único caminho que funciona no container.
2. **Fase 1b — áudio local**: o adaptador `whisper.cpp` atrás da mesma porta, com o modelo entrando em `gerador ia instalar`/`status`. Só o modo local; a UI não muda (é a mesma porta).
3. **Fase 2 — imagem via gateway**: `capacidades.visao` declarada por preset, envio multimodal no `ProvedorCompativelOpenAI`, anexo na `JanelaConversa` com aviso de saída de dados.
4. **Fase 3 — imagem local** (condicional, §4.3).

A ordem 1a→1b inverte a versão anterior desta SPEC de propósito. O motivo é o mesmo que fez o gateway vir antes do modelo local no modo hospedado: **o caminho que não precisa de download é o que dá pra validar hoje**, e ele valida a porta inteira — o adaptador local depois entra sem tocar em UI, rota ou teste de contrato.

## 8. Verificação

Nenhuma fase é "concluída" com a suíte verde. A regra da SPEC-31 vale aqui e é a que pegou os quatro defeitos da Fase 4: **exercitar pelo navegador**, contra a stack, com o `e2e/gatewayFalso.ts` estendido para responder também `/audio/transcriptions` (ele já é o dublê que fala o dialeto OpenAI).

- **Fase 1a**: gravar 20-30 s ditando uma demanda real, conferir que o texto cai no campo **editável**, corrigir um nome de sistema à mão e enviar — a correção manual é parte do fluxo, não exceção. E que, com provedor sem `transcrever`, o botão **não aparece**.
- **Fase 1b**: mesma coisa, offline, medindo o tempo na máquina real e registrando o número (JOURNEY §124).
- **Fase 2**: anexar um print de diagrama real e verificar que os nós propostos usam **tipos que existem na config** (os trilhos da SPEC-27 continuam valendo com imagem). E que, sem provedor com visão, o botão de anexar **não aparece**.
- Fake determinístico na suíte de unidade para todos os caminhos — nenhum teste de CI depende de modelo real, mesma regra desde a SPEC-23.

## 9. Fontes da pesquisa

- `node-llama-cpp` — documentação sem menção a multimodal: [node-llama-cpp — Guide](https://node-llama-cpp.withcat.ai/guide/)
- llama.cpp multimodal (mmproj, `llama-mtmd-cli`): [llama.cpp — docs/multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- Qwen3-VL em GGUF com vision encoder: [Qwen3-VL-2B-Thinking-GGUF](https://huggingface.co/Qwen/Qwen3-VL-2B-Thinking-GGUF)
- Bindings Node de whisper.cpp: [nodejs-whisper](https://www.npmjs.com/package/nodejs-whisper), [smart-whisper](https://www.npmjs.com/package/smart-whisper)

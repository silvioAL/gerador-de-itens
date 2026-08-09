# SPEC-30 — Conversa multimodal: falar com o desenho e mostrar imagens

> **Status**: desenho, implementação não iniciada. Pedido: *"melhorar a feature de desenhar conversando — deverá ser possível conversar com áudio e enviar imagens para serem interpretadas, e não sei se nosso modelo atual faz isso (provavelmente vamos precisar de outro modelo integrado)."*
>
> Estende [SPEC-27](SPEC-27-conversa-como-interface.md) (a janela de conversa que desenha o diagrama) e depende das capacidades de provedor da [SPEC-25](SPEC-25-selecao-de-modelo-e-provedores.md).

## 1. Resposta direta à dúvida do usuário: não, o modelo atual não faz

Verificado, não suposto:

- **`node-llama-cpp` não documenta suporte multimodal** — nem visão nem áudio. A documentação cobre chat, JSON schema, function calling, tokens e GPU; não há menção a modelo de visão, embedding de imagem ou projetor multimodal.
- O **llama.cpp** por baixo **tem** suporte: exige dois GGUF (o modelo + o **mmproj**, o projetor que transforma imagem em embedding) e expõe isso pelo `llama-mtmd-cli`. **Qwen3-VL** existe em GGUF com mmproj.
- **Áudio** é outra família de problema: transcrição é `whisper.cpp`, com bindings Node de terceiros (`nodejs-whisper`, `whisper-cpp-node`, `smart-whisper`), de manutenção desigual.

Então: o Qwen3-4B que roda hoje **não vê imagem e não ouve áudio**, e o binding que usamos não expõe o caminho para isso nem se trocássemos o modelo.

## 2. A decisão que evita um redesenho: áudio não é multimodal

A tentação é tratar "áudio e imagem" como um problema só — "precisamos de um modelo multimodal". Mas os dois entram no sistema em lugares diferentes:

- **Áudio é entrada de texto com outro teclado.** A pessoa fala, vira texto, o texto entra na conversa **exatamente como se tivesse sido digitado**. O `ProvedorIa` não muda, o prompt não muda, a grammar não muda, nada na esteira muda. Transcrever é **pré-processamento**, e sai inteiro fora do caminho do LLM.
- **Imagem é entrada que só o modelo entende.** Não existe "converter imagem em texto" sem já ser um modelo de visão. Aqui, sim, o provedor precisa mudar.

Separar isso é o que permite entregar o áudio — que é a metade mais usada no fluxo descrito (falar em vez de digitar a demanda) — sem esperar nada da visão.

## 3. Áudio (Fase 1)

### 3.1 Transcrição local, mesma disciplina dos modelos que já existem

`whisper.cpp` com modelo GGUF baixado para `~/.gerador/models/`, exatamente como o Qwen e o de embedding (SPEC-23 Fase 0): `gerador ia instalar` passa a poder baixar o modelo de transcrição, e `gerador ia status` reporta.

Alternativa considerada e recusada: a **Web Speech API** do navegador. É grátis e sem download, mas em Chrome manda o áudio para servidor do fornecedor, não funciona offline e varia por navegador. Contra a premissa local-first do produto — e pior, contra ela **em silêncio**: quem fala não imagina que a voz saiu da máquina.

### 3.2 O ponto de integração é um só

`JanelaConversa` (SPEC-27) ganha um botão de microfone. O áudio gravado vai para uma rota nova de transcrição, e o texto **cai no mesmo campo de entrada**, editável antes de enviar. Editável importa: transcrição erra nome de sistema e sigla — que é justamente o vocabulário desta ferramenta — e mandar direto transformaria erro de reconhecimento em nó errado no diagrama.

### 3.3 O que precisa de cuidado

- **Formato**: o whisper.cpp quer WAV 16 kHz mono; o navegador grava WebM/Opus. A conversão tem que acontecer, e é o ponto onde bindings de Node divergem (alguns chamam `ffmpeg`, o que é uma dependência externa a mais).
- **Escolha do binding**: `nodejs-whisper` é o mais ativo; `smart-whisper` tem API melhor (modelo carregado uma vez, inferências paralelas) mas está há ~2 anos sem publicar. Decisão de implementação, com a mesma régua da SPEC-25: **atrás de uma interface própria**, com fake determinístico no teste — trocar de binding não deve tocar a UI.
- **Teto de duração**: áudio longo é transcrição longa. Registrar teto explícito, pela lição já cara da SPEC-25 Fase 1: *toda ausência de teto virou bug*.

## 4. Imagem (Fases 2 e 3)

### 4.1 Capacidade declarada pelo provedor

`ProvedorIa` ganha:

```ts
readonly capacidades: { visao: boolean };
```

E a UI **só oferece anexar imagem quando o provedor selecionado suporta**. Sem isso, o botão existe e a conversa falha depois — o produto não pode oferecer o que o provedor não faz. É a mesma régua do pip "sem trabalho" (JOURNEY §97): a interface tem que dizer a verdade sobre o que o sistema consegue.

### 4.2 Fase 2 — via gateway (barato, quase pronto)

Provedores compatíveis com OpenAI aceitam imagem no próprio `messages` (parte `image_url`, com data URL base64). Ou seja: o `ProvedorCompativelOpenAI` da SPEC-25 Fase 2 vira multimodal com uma mudança pequena na montagem do corpo — **sem modelo novo, sem download, sem binding**.

Consequência que precisa estar na tela: a imagem **sai da máquina** para o endpoint configurado. Se o gateway é interno, continua dentro da empresa (é a mesma propriedade que a SPEC-25 §4.6 já explora); se é um provedor público, é upload para terceiro. O aviso tem que ser explícito no momento de anexar — print de arquitetura costuma ter mais informação sensível do que quem anexa lembra.

### 4.3 Fase 3 — local (caro, só se necessário)

Visão offline exige Qwen3-VL + mmproj e, como o `node-llama-cpp` não expõe multimodal, invocar o `llama-mtmd-cli` como **subprocesso**. Isso traz: binário a distribuir por plataforma, ~2 GB a mais de download, streaming por stdout em vez da API do binding, e um segundo caminho de código para manter.

Fica registrado como fase **condicional**: só entra se aparecer necessidade real de interpretar imagem **sem** rede. Se o uso for sempre com gateway (o caso do usuário hoje), a Fase 2 basta e a 3 é custo sem retorno.

## 5. O que a imagem vai fazer, concretamente

No fluxo do desenho (SPEC-27 Fase 1), a imagem serve para o que o usuário descreveu como "enviar imagens para serem interpretadas":

- print de um diagrama existente (Miro, Confluence, lousa) → o agente propõe os nós e conexões equivalentes;
- print de tela/erro → vira contexto do épico;
- foto de rascunho em papel → mesmo caminho do primeiro.

Em todos, a saída continua sendo **a mesma de hoje**: uma proposta de diagrama em JSON, com os tipos vindo da config real do projeto (os "trilhos" da SPEC-27), que a pessoa aceita ou rejeita. A imagem entra como **insumo**, não como novo formato de saída — o que significa que nada em `useQuebra`, `derivar` ou na esteira precisa mudar.

## 6. Fora de escopo, deliberado

- **Resposta em áudio (TTS)**: o pedido é falar com a ferramenta, não ouvi-la.
- **Vídeo**.
- **Transcrição em tempo real** (streaming de fala): grava-e-transcreve é suficiente para ditar uma demanda; streaming é outro problema de engenharia.
- **Áudio/imagem na esteira de agentes**: aqui é a **conversa** (SPEC-27). A esteira recebe texto já consolidado.
- **Diarização** (quem falou o quê): faria sentido para ata de reunião; não para ditar uma demanda.

## 7. Roteiro faseado

1. **Fase 1 — áudio**: modelo de transcrição no registro + rota de transcrição + botão de microfone com texto editável antes de enviar. Não toca em `ProvedorIa`.
2. **Fase 2 — imagem via gateway**: `capacidades.visao`, envio multimodal no `ProvedorCompativelOpenAI`, anexo na `JanelaConversa` com aviso de saída de dados.
3. **Fase 3 — imagem local** (condicional, §4.3).

## 8. Verificação

- **Fase 1**: gravar 20-30s ditando uma demanda real, conferir que o texto cai no campo **editável**, corrigir um nome de sistema à mão e enviar — a correção manual é parte do fluxo, não exceção. Medir o tempo de transcrição na máquina real (a lição da SPEC-25: tempo local é uma decisão de produto, não um detalhe).
- **Fase 2**: anexar um print de diagrama real e verificar que os nós propostos usam **tipos que existem na config** (os trilhos continuam valendo com imagem). E que, sem provedor com visão, o botão de anexar **não aparece**.
- Fake determinístico na suíte para os dois caminhos — nenhum teste de CI depende de modelo real, mesma regra desde a SPEC-23.

## 9. Fontes da pesquisa

- `node-llama-cpp` — documentação sem menção a multimodal: [node-llama-cpp — Guide](https://node-llama-cpp.withcat.ai/guide/)
- llama.cpp multimodal (mmproj, `llama-mtmd-cli`): [llama.cpp — docs/multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- Qwen3-VL em GGUF com vision encoder: [Qwen3-VL-2B-Thinking-GGUF](https://huggingface.co/Qwen/Qwen3-VL-2B-Thinking-GGUF)
- Bindings Node de whisper.cpp: [nodejs-whisper](https://www.npmjs.com/package/nodejs-whisper), [smart-whisper](https://www.npmjs.com/package/smart-whisper)

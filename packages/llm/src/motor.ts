import { getLlama, LlamaChatSession, type GbnfJsonSchema } from "node-llama-cpp";

/**
 * Wrapper fino sobre `node-llama-cpp` — sem cache/singleton escondido de
 * propósito: quem chama decide se guarda o resultado de `carregarModeloChat`/
 * `carregarModeloEmbedding` entre chamadas (ex.: o servidor local do
 * `gerador open`, que vive o processo inteiro) ou recarrega a cada vez. Sem
 * teste automatizado nesta v1 — a única forma real de testar isso é com o
 * binário nativo + um modelo GGUF de verdade, o que contradiz a disciplina
 * de "nunca baixar modelo real em CI"; a validação é manual, contra o modelo
 * de verdade (ver SPEC-23 §7).
 */
export interface MotorChat {
  /** Completa texto livre, com streaming opcional token a token. */
  completar(prompt: string, opcoes?: { onTexto?: (pedaco: string) => void }): Promise<string>;
  /** Completa com JSON Schema obrigatório via GBNF — a resposta sempre bate
   * com o schema, ou a chamada lança erro. Usado pelos fluxos que propõem
   * dado estruturado (`CampoNo`, `ValorSpec`, `Condicao`...), nunca texto
   * livre que precisaria ser "parseado na sorte". O tipo de retorno fica a
   * cargo de quem chama (`as T` no call site) — a inferência de tipo do
   * `node-llama-cpp` não se propaga limpo através de um wrapper genérico
   * próprio (limitação conhecida de generics de ordem superior do TS).
   * `onTexto` (SPEC-24 Fase E) recebe o texto CRU do JSON restrito sendo
   * gerado, token a token — a grammar não impede streaming, só restringe o
   * que sai; é o que permite mostrar o modelo escrevendo em tempo real. */
  completarComSchema(prompt: string, schema: GbnfJsonSchema, opcoes?: { onTexto?: (pedaco: string) => void }): Promise<unknown>;
  descartar(): Promise<void>;
}

export interface MotorEmbedding {
  gerarEmbedding(texto: string): Promise<number[]>;
  descartar(): Promise<void>;
}

/** Remove um bloco de raciocínio que tenha escapado pro texto principal.
 * Defensivo: o `node-llama-cpp` já separa o `<think>` em segmento próprio
 * nos modelos que ele reconhece, mas um GGUF com template inesperado pode
 * devolver a marcação inline — e aí ela não pode vazar pra resposta. */
function semRaciocinio(texto: string): string {
  return texto.replace(/<think>[\s\S]*?<\/think>/g, "").trimStart();
}

/**
 * Teto de tokens de raciocínio por geração (SPEC-25 Fase 1). MEDIDO, não
 * chutado: com o `<think>` sem limite, uma única chamada com UM item e UM
 * campo levou 2563s (~42 min) numa máquina real — a esteira inteira daria
 * horas, inusável mesmo pra quem aceita lentidão ("posso tolerar que fique
 * lento" tem limite prático). Este teto preserva o raciocínio — que é o
 * motivo de usar o modelo — mas o mantém dentro de um custo utilizável;
 * o modelo conclui o pensamento e responde quando o orçamento acaba.
 */
const TETO_RACIOCINIO = 2000;

export interface OpcoesCarregarChat {
  /** Ver `ModeloRegistrado.raciocinador` — muda a estratégia de geração
   * estruturada (SPEC-25 §4.3). */
  raciocinador?: boolean;
}

export async function carregarModeloChat(caminhoModelo: string, opcoesModelo?: OpcoesCarregarChat): Promise<MotorChat> {
  const llama = await getLlama();
  const modelo = await llama.loadModel({ modelPath: caminhoModelo });
  const raciocinador = opcoesModelo?.raciocinador === true;
  // Contexto no automático (default do node-llama-cpp: o maior que couber na
  // máquina). ACHADO REAL: a primeira tentativa aqui foi forçar
  // `contextSize: { min: 16384 }` "pra dar espaço ao <think>" — e isso
  // QUEBROU tudo numa máquina com VRAM modesta ("A context size of 16384 is
  // too large for the available VRAM"), falhando na criação do contexto antes
  // de gerar qualquer coisa. Espaço pro raciocínio se resolve zerando o
  // histórico a cada chamada (abaixo), não exigindo uma janela mínima que a
  // máquina do usuário talvez não tenha.
  const contexto = await modelo.createContext();
  const sessao = new LlamaChatSession({ contextSequence: contexto.getSequence() });

  return {
    async completar(prompt, opcoes) {
      // ACHADO REAL (validação da Fase 1): a sessão acumula o histórico entre
      // chamadas, e o singleton do servidor vive o processo inteiro — depois
      // do primeiro papel, o contexto estourava e TODAS as gerações seguintes
      // falhavam (com o Qwen passava despercebido: 1 prompt curto por
      // chamada; com o R1, 2 fases + raciocínio, estoura no segundo papel).
      // Nenhum fluxo aqui depende de memória entre chamadas — cada prompt já
      // carrega todo o contexto de que precisa (épico, itens, respostas dos
      // papéis anteriores). Zerar é o comportamento correto, não um remendo.
      sessao.resetChatHistory();
      if (!raciocinador) {
        return sessao.prompt(prompt, { onTextChunk: opcoes?.onTexto });
      }
      // Com modelo raciocinador, o `<think>` vem como SEGMENTO separado
      // (`type: "segment"`, `segmentType: "thought"`). Só o texto da
      // resposta principal (`type: undefined`) vai pro stream de quem
      // chamou — o raciocínio é meio, não entrega.
      const resposta = await sessao.prompt(prompt, {
        onResponseChunk: (pedaco) => {
          if (pedaco.type === undefined && pedaco.text) opcoes?.onTexto?.(pedaco.text);
        },
      });
      return semRaciocinio(resposta);
    },
    async completarComSchema(prompt, schema, opcoes) {
      // Mesmo motivo de `completar` acima — cada geração é independente. No
      // caminho de duas fases, o reset acontece só AQUI (a fase B precisa do
      // rascunho que a fase A deixou no contexto).
      sessao.resetChatHistory();
      // `as never`: `createGrammarForJsonSchema` é genérica com `const T`
      // próprio, que não unifica com o `GbnfJsonSchema` (union) recebido
      // aqui de fora — limitação de inferência de generics de ordem
      // superior do TS, não um erro de tipo real (o runtime aceita
      // qualquer `GbnfJsonSchema` válido normalmente).
      const grammar = await llama.createGrammarForJsonSchema(schema as never);

      if (!raciocinador) {
        const resposta = await sessao.prompt(prompt, { grammar, onTextChunk: opcoes?.onTexto });
        return grammar.parse(resposta);
      }

      // SPEC-25 §4.3 — a decisão central da Fase 1: a grammar restringe a
      // amostragem desde o PRIMEIRO token, então aplicá-la junto com o
      // prompt mataria o `<think>` — justamente a capacidade pela qual este
      // modelo foi escolhido. Duas fases na MESMA sessão (o contexto já
      // está quente, a segunda é barata):
      //
      //   A) livre: o modelo raciocina e rascunha. NADA daqui vai pro
      //      stream de saída — quem consome (`/ia/pipeline/:papel`) acumula
      //      os pedaços e faz `JSON.parse` no fim; prosa no meio quebraria
      //      o parse. A UI fica no estado "pensando…", que já existe.
      //   B) estruturada: mesma sessão, agora com a grammar E
      //      `thoughtTokens: 0` — sem esse orçamento zerado o modelo tenta
      //      raciocinar de novo e colide com a grammar.
      await sessao.prompt(
        `${prompt}\n\nPense com cuidado e escreva um rascunho da resposta. Não se preocupe com formato agora.`,
        { budgets: { thoughtTokens: TETO_RACIOCINIO } }
      );
      const resposta = await sessao.prompt(
        `Agora entregue APENAS a resposta final, no formato JSON pedido, sem comentários nem raciocínio.`,
        { grammar, budgets: { thoughtTokens: 0 }, onTextChunk: opcoes?.onTexto }
      );
      return grammar.parse(resposta);
    },
    async descartar() {
      await contexto.dispose();
      await modelo.dispose();
    },
  };
}

export async function carregarModeloEmbedding(caminhoModelo: string): Promise<MotorEmbedding> {
  const llama = await getLlama();
  const modelo = await llama.loadModel({ modelPath: caminhoModelo });
  const contexto = await modelo.createEmbeddingContext();

  return {
    async gerarEmbedding(texto) {
      const embedding = await contexto.getEmbeddingFor(texto);
      return [...embedding.vector];
    },
    async descartar() {
      await contexto.dispose();
      await modelo.dispose();
    },
  };
}

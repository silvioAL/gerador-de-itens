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

export async function carregarModeloChat(caminhoModelo: string): Promise<MotorChat> {
  const llama = await getLlama();
  const modelo = await llama.loadModel({ modelPath: caminhoModelo });
  const contexto = await modelo.createContext();
  const sessao = new LlamaChatSession({ contextSequence: contexto.getSequence() });

  return {
    async completar(prompt, opcoes) {
      return sessao.prompt(prompt, { onTextChunk: opcoes?.onTexto });
    },
    async completarComSchema(prompt, schema, opcoes) {
      // `as never`: `createGrammarForJsonSchema` é genérica com `const T`
      // próprio, que não unifica com o `GbnfJsonSchema` (union) recebido
      // aqui de fora — limitação de inferência de generics de ordem
      // superior do TS, não um erro de tipo real (o runtime aceita
      // qualquer `GbnfJsonSchema` válido normalmente).
      const grammar = await llama.createGrammarForJsonSchema(schema as never);
      const resposta = await sessao.prompt(prompt, { grammar, onTextChunk: opcoes?.onTexto });
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

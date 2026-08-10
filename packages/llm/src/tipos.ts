import type { EsquemaJson } from "./esquema.js";

/**
 * SPEC-31 Fase 4 — os TIPOS de provedor, separados das fábricas.
 *
 * `provedor.ts` tem as duas coisas: a interface e as funções que carregam o
 * modelo local. Quem só precisa do contrato (o gateway, o modo hospedado, a
 * camada de aplicação) não pode ser obrigado a arrastar `node-llama-cpp` junto
 * — e um `import type` não protege: o pacote continua tendo que resolver.
 *
 * A separação é por ARQUIVO porque é a única que o bundler respeita.
 */
export interface OpcoesGeracao {
  /**
   * ACHADO REAL (modo hospedado, esteira com Claude): quando a resposta não
   * obedece ao schema, `completarEstruturado` tenta de novo — e a segunda
   * tentativa streamava no MESMO canal da primeira. Quem acumulava os pedaços
   * recebia as duas concatenadas, o `JSON.parse` falhava, e o lote inteiro era
   * descartado em silêncio: o trabalho do papel sumia da tela.
   *
   * Isto avisa "esqueça tudo que mandei até agora". Quem só exibe texto ao
   * vivo limpa a área; quem acumula para dar `parse` no fim zera o buffer.
   * Nunca dispara no caminho local (GBNF já garante JSON válido de primeira).
   */
  onReiniciar?: () => void;
  /** Texto da RESPOSTA sendo gerada, pedaço a pedaço. Raciocínio de modelo
   * raciocinador nunca chega aqui (ver `motor.ts`). */
  onTexto?: (pedaco: string) => void;
}

/**
 * SPEC-25 Fase 0 — a fronteira entre "de onde vem a inteligência" e o resto
 * do produto. Todo consumidor (rotas de `/ia/*`) fala só com esta interface;
 * trocar o modelo local pelo wrapper corporativo ou por um gateway remoto
 * (Fase 2) não toca em quem chama. Hoje existe um provedor local só — a
 * abstração não sobrevive por causa da pluralidade de modelos locais (essa
 * acabou na Fase 1, ver SPEC-25 §4.3), e sim por causa da Fase 2.
 *
 * O contrato que precisa valer em QUALQUER implementação: entra um prompt,
 * o texto streama, e no fim o corpo completo de `completarEstruturado` é
 * um JSON válido no schema pedido. Como cada provedor garante isso é
 * problema dele — GBNF nos locais, tool use forçado no Anthropic,
 * `json_object` + validação nos compatíveis com OpenAI.
 */
export interface ProvedorIa {
  readonly id: string;
  readonly nome: string;
  completar(prompt: string, opcoes?: OpcoesGeracao): Promise<string>;
  /** O tipo de retorno fica a cargo de quem chama (`as T` no call site) —
   * mesma limitação de generics de ordem superior documentada em `motor.ts`. */
  completarEstruturado(prompt: string, schema: EsquemaJson, opcoes?: OpcoesGeracao): Promise<unknown>;
  /**
   * SPEC-30 Fase 1a — transcrever fala em texto. **Opcional de propósito**: o
   * provedor local não faz (`node-llama-cpp` não expõe multimodal, SPEC-30 §1),
   * e a UI usa a ausência para não desenhar o botão de microfone.
   *
   * Oferecer um botão que grava 30 segundos e falha depois é pior que não ter
   * botão — desperdiça o tempo *e* a fala. Por isso a capacidade é lida da
   * presença do método, não de uma flag que pode mentir.
   */
  transcrever?(audio: Uint8Array, opcoes: OpcoesTranscricao): Promise<string>;
  descartar(): Promise<void>;
}

export interface OpcoesTranscricao {
  /** Tipo MIME do que o navegador gravou (ex.: `audio/webm`). Vai como nome de
   * arquivo e content-type no multipart — destinos compatíveis com OpenAI
   * decidem o decodificador por ele. */
  formato: string;
  /** Dica de idioma (ISO-639-1). Melhora muito o reconhecimento de sigla e nome
   * de sistema em português, que é o vocabulário desta ferramenta. */
  idioma?: string;
  /**
   * Vocabulário do projeto, como frase de contexto (`initial_prompt` do
   * Whisper). É o campo que mais muda o resultado — MEDIDO, mesma frase, mesmo
   * modelo `base` em CPU:
   *
   * ```
   * sem: "fila do rabitém IKEA … com dedileta arquil e idem potência"
   * com: "fila do RabbitMQ … com dead letter queue e idempotência"
   * ```
   *
   * Quem monta é `montarVocabularioTranscricao` (camada de aplicação), a partir
   * da config do projeto — ver o porquê de não ser fine-tuning lá.
   */
  vocabulario?: string;
}

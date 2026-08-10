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
  descartar(): Promise<void>;
}

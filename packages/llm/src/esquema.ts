/**
 * SPEC-31 Fase 4 — o tipo de schema JSON que os provedores falam.
 *
 * Era `GbnfJsonSchema`, importado do `node-llama-cpp`. Type-only, então some
 * na compilação — mas obrigava **qualquer** consumidor de `ProvedorIa` a ter
 * o pacote do binário nativo resolvível, incluindo o container do modo
 * hospedado, que nunca vai carregar modelo local nenhum.
 *
 * A forma aqui é a que este projeto realmente usa (objeto com propriedades,
 * arrays, enums e os primitivos). `motor.ts` continua falando GBNF de verdade
 * com o llama.cpp: converter é problema dele, na borda.
 */
export type EsquemaJson =
  | { type: "string"; enum?: readonly string[] }
  | { type: "number" | "integer" | "boolean" | "null" }
  | { type: "array"; items?: EsquemaJson; minItems?: number; maxItems?: number }
  | {
      type: "object";
      properties?: Record<string, EsquemaJson>;
      required?: readonly string[];
      additionalProperties?: boolean | EsquemaJson;
    }
  | { oneOf: readonly EsquemaJson[] }
  | { const: string | number | boolean | null };

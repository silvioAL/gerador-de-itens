import { describe, expect, it } from "vitest";
import { CHAVES_CONFIG } from "../portas/repositorioDeConfig.js";
import { normalizarDocumentoConfig } from "./normalizacao.js";
import { resumirConfig } from "./diagnostico.js";

/**
 * §354 — **o teste que faltava, e cuja falta matou uma feature inteira.**
 *
 * `normalizarDocumentoConfig` é um `switch` que devolve `unknown`. Chave sem
 * `case` caía fora dele e devolvia `undefined` — e `unknown` significa que o
 * compilador nunca reclamou.
 *
 * `tokens` (SPEC-79) entrou na lista sem `case` e ficou morta no modo hospedado,
 * medido contra o servidor real:
 *
 * - `PUT /config/tokens` → **500** (`null value in column "documento" violates
 *   not-null constraint`);
 * - `GET /config/tokens` → resposta sem o campo `documento`;
 * - `loadConfig` fazia `c?.tokens ?? []`, e o `c?.` transformava o defeito em
 *   *"design system não configurado"* — indistinguível do estado legítimo.
 *
 * Nenhum teste pegou porque **nenhum teste chamava esta função**, e os que
 * chamavam as irmãs usavam só as chaves que tinham `case`.
 *
 * O guarda abaixo varre a lista FECHADA em vez de nomear chaves: chave nova é
 * incluída sozinha, que é a única forma de isto não se repetir.
 */
describe("toda chave de config sobrevive à normalização", () => {
  /** Um documento reconhecível por chave — o conteúdo não importa, a
   * sobrevivência sim. `regras`/`pipeline-agentes` têm coerção própria e
   * reescrevem a forma; por isso a asserção é "não sumiu", não "é idêntico". */
  const DOCUMENTO: Record<string, unknown> = {
    regras: { porTech: {}, tipos: [], tamanhos: [] },
    "pipeline-agentes": { papeis: [{ id: "po", nome: "PO" }] },
    exportador: { endpoint: "https://exemplo.invalido/itens", rotulo: "", cabecalhos: {} },
    tokens: { tokens: [{ nome: "cor.primaria", valor: "#0891b2", tipo: "color" }] },
    conexoes: { regras: { motor: { default: "interno", valid: ["interno", "http"] } } },
    conectores: {
      conectores: [
        {
          id: "volumetria",
          nome: "Volumetria (Dynatrace)",
          endpoint: "https://gateway.exemplo/volumetria",
          entrada: [{ chave: "projetoId", rotulo: "Projeto", tipo: "texto", obrigatorio: true }],
          saida: [{ chave: "rps", rotulo: "Requisições/s", tipo: "numero", caminho: "$.dados.rps" }],
        },
      ],
    },
    fluxos: {
      fluxos: [
        {
          id: "jmx",
          nome: "JMX a partir da volumetria",
          nos: [{ id: "v", tipo: "conector", refId: "volumetria", posicao: { x: 0, y: 0 }, parametros: {} }],
          arestas: [],
        },
      ],
    },
  };

  it.each([...CHAVES_CONFIG])("`%s` não vira undefined ao ser normalizada", (chave) => {
    const entrada = DOCUMENTO[chave];
    expect(entrada, `falta um documento de exemplo para a chave "${chave}" neste teste`).toBeDefined();

    const saida = normalizarDocumentoConfig(chave, entrada);

    // `undefined` é o defeito exato: a coluna `documento` é NOT NULL, então
    // gravar isto é um 500, e ler é uma resposta sem o campo.
    expect(saida, `"${chave}" saiu da normalização como undefined — é o defeito do §354`).not.toBeUndefined();
    expect(saida).not.toBeNull();
  });

  it.each([...CHAVES_CONFIG])("`%s` tem um resumo para o diagnóstico comparar", (chave) => {
    // `resumirConfig` é `switch` exaustivo com retorno tipado, então o
    // compilador já cobra o `case`. Este teste cobra que ele RESPONDA algo —
    // um resumo vazio faria o diagnóstico calar sem ninguém notar.
    expect(resumirConfig(chave, DOCUMENTO[chave])).toBeTypeOf("object");
  });
});

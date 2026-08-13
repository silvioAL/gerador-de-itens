import { describe, expect, it } from "vitest";
import {
  ANATOMIA_DO_PROMPT_PIPELINE,
  PREAMBULO_GENERICO,
  PREAMBULO_PADRAO_POR_PAPEL,
  montarPedidoPipeline,
  preambuloDoPapel,
} from "./pedidos.js";

/**
 * #296 — a aba do pipeline passa a EXPLICAR de onde vem cada pedaço do prompt.
 *
 * Explicação em tabela envelhece: alguém muda `montarPedidoPipeline`, a tabela
 * fica descrevendo um prompt que não existe mais, e a tela mente com convicção.
 * Este teste monta um pedido de VERDADE e exige que todo marcador declarado
 * apareça nele. Mudar a montagem sem mudar a anatomia quebra o build.
 *
 * É a lição do #302 aplicada antes do defeito: um teste que não tem como
 * distinguir a tabela certa da errada não é rede, é decoração.
 */
const itens = [
  {
    chave: "n1::ep0",
    rotulo: "Serviço de propostas — POST /propostas",
    contextoNo: "Serviço (Java/Spring Boot), time-pagamentos",
    placeholders: [{ chave: "historiaUsuario", tech: "java", rotulo: "História de usuário" }],
    respostasAnteriores: [{ rotulo: "Contrato técnico", valor: "POST /propostas devolve 201 com o id" }],
  },
];

describe("ANATOMIA_DO_PROMPT_PIPELINE descreve o prompt que sai de verdade (#296)", () => {
  it("todo marcador declarado aparece num prompt montado com todas as partes presentes", () => {
    const { prompt } = montarPedidoPipeline({
      preambulo: PREAMBULO_GENERICO,
      // SPEC-53 — "todas as partes" passou a incluir o contexto do PRODUTO.
      contextoDoProduto: "## Produto: Consignado",
      contextoEpico: "Portabilidade de crédito consignado, prazo regulatório de 5 dias.",
      itens,
    });

    const ausentes = ANATOMIA_DO_PROMPT_PIPELINE.filter((p) => !prompt.includes(p.marcador)).map((p) => p.id);
    expect(ausentes, `partes declaradas que não existem no prompt real: ${ausentes.join(", ")}`).toEqual([]);
  });

  it("as partes opcionais somem quando não há o que mostrar — e a anatomia diz quais são", () => {
    // Sem épico e sem papel anterior: o prompt encolhe. As duas partes
    // correspondentes precisam sumir juntas, senão a tela promete um bloco que
    // o modelo nunca vê.
    const { prompt } = montarPedidoPipeline({
      preambulo: PREAMBULO_GENERICO,
      itens: [{ ...itens[0], respostasAnteriores: [] }],
    });

    const parte = (id: string) => ANATOMIA_DO_PROMPT_PIPELINE.find((p) => p.id === id)!.marcador;
    expect(prompt.includes(parte("epico"))).toBe(false);
    expect(prompt.includes(parte("respostas-anteriores"))).toBe(false);
    // As obrigatórias continuam lá.
    expect(prompt.includes(parte("instrucao-lote"))).toBe(true);
    expect(prompt.includes(parte("campos"))).toBe(true);
  });

  it("cada papel padrão tem preâmbulo exportado — era o que a tela não conseguia mostrar", () => {
    for (const grupo of ["po", "arquiteto", "especialista", "qa"]) {
      expect(PREAMBULO_PADRAO_POR_PAPEL[grupo], `grupo ${grupo}`).toBeTruthy();
    }
  });

  it("o preâmbulo efetivo de um papel sem personalização é o do GRUPO, não vazio", () => {
    // É exatamente o que a pessoa via como campo em branco: `preambulo`
    // ausente na config não significa "sem prompt", significa "herda".
    const efetivo = preambuloDoPapel("po", [{ id: "po", grupo: "po" }]);
    expect(efetivo).toBe(PREAMBULO_PADRAO_POR_PAPEL.po);
    expect(efetivo.length).toBeGreaterThan(100);
  });

  it("papel custom sem grupo conhecido cai no genérico — nunca em vazio", () => {
    expect(preambuloDoPapel("mensageria", [])).toBe(PREAMBULO_GENERICO);
  });
});

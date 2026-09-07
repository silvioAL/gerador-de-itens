import type { DiagramaConfig, No } from "@gerador/engine";
import type { NoDoFluxo, TipoDeNoDoFluxo } from "@gerador/aplicacao";

/**
 * SPEC-107 fatia D — **o vocabulário VISUAL do fluxo, gerado do catálogo.**
 *
 * A régua da 105 §1 fica: telas separadas, paletas separadas — o que unifica
 * é a LINGUAGEM (§2.2): o fluxo renderiza com o MESMO `NodeCard` da mesa,
 * dirigido por um `DiagramaConfig` PRÓPRIO, com um tipo por FAMÍLIA de
 * capacidade. O risco anotado na SPEC (os dois grafos indistinguíveis) é
 * mitigado aqui: a paleta de cores é OUTRA — nenhuma família usa a cor de um
 * tipo da mesa, e o cabeçalho da tela segue dizendo o que se desenha.
 *
 * As cores são travadas por teste nos DOIS temas (contraste ≥ 3 sobre o
 * cartão, o molde de `paleta.contraste.test.ts`) — cor de família ilegível
 * no tema escuro é defeito, não detalhe (§2.4-11).
 */
export const CORES_POR_FAMILIA: Record<TipoDeNoDoFluxo, string> = {
  conector: "#0e7490",
  agente: "#9333ea",
  funcao: "#059669",
  projeto: "#b45309",
  transformacao: "#db2777",
};

/** Ícones do catálogo curado da mesa (`canvas/icones.ts`) — reusar o mapa é o
 * que garante que o nome existe e não infla o bundle. */
export const ICONES_POR_FAMILIA: Record<TipoDeNoDoFluxo, string> = {
  conector: "Globe",
  agente: "Zap",
  funcao: "Cog",
  projeto: "Boxes",
  transformacao: "Split",
};

/**
 * SPEC-109 fatia B — o vocabulário que o usuário pediu ("integração externa →
 * agente → artefato"): a família fala a língua de quem monta o fluxo, não a
 * do código. "Conector" era o nome do TIPO interno; "Integração externa" é o
 * que ele é. "Projeto" virou "Mesa de projeto" — a mesa É o componente que se
 * abre (a decisão antiga do §2.3 de separar os nomes caiu com o pedido).
 */
export const ROTULOS_POR_FAMILIA: Record<TipoDeNoDoFluxo, string> = {
  conector: "Integração externa",
  agente: "Agente",
  funcao: "Função do sistema",
  projeto: "Mesa de projeto",
  transformacao: "Transformação",
};

/**
 * O `DiagramaConfig` do fluxo: um tipo por família. `spec` vazio de
 * propósito — a prontidão do fluxo não é a da mesa (o validador de fiação é
 * outro), e o `NodeCard` esconde a bolinha quando não há o que medir.
 */
export function configDoFluxo(): DiagramaConfig {
  const nodeTypes = Object.fromEntries(
    (Object.keys(CORES_POR_FAMILIA) as TipoDeNoDoFluxo[]).map((familia) => [
      familia,
      {
        label: ROTULOS_POR_FAMILIA[familia],
        derives: "",
        techs: [],
        contextos: [],
        spec: [],
        color: CORES_POR_FAMILIA[familia],
        icon: ICONES_POR_FAMILIA[familia],
      },
    ])
  );
  return { nodeTypes, edgeTypes: { dado: { label: "dado" } }, edgeRules: {} } as unknown as DiagramaConfig;
}

/**
 * O nó do fluxo na forma que o `NodeCard` lê. `status` vazio (o cartão
 * esconde a pílula): o vocabulário novo/existente é da mesa, não da fiação —
 * o estado de EXECUÇÃO viaja por fora (a pulsação e o rastro).
 */
export function comoNoDaMesa(no: NoDoFluxo, rotulo: string): No {
  return {
    id: no.id,
    type: no.tipo,
    x: no.posicao.x,
    y: no.posicao.y,
    label: `${no.confirmacao === "aguardar" ? "⏸ " : ""}${rotulo}`,
    status: "" as No["status"],
    spec: {},
    specNA: {},
  };
}


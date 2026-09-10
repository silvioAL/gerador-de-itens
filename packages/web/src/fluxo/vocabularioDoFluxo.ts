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
  // SPEC-110 fatia A — o laranja do "▶": a cor do começo, distinta das cinco
  // famílias existentes e de todo tipo da mesa, e legível nos dois temas
  // (medido: 3.15 no claro, 4.62 no escuro — o teste de contraste cobra ≥ 3).
  gatilho: "#ea580c",
  /**
   * SPEC-110 fatia B — o AZUL da TELA: onde a PESSOA entra no fluxo. Azul e
   * não o teal da integração externa (`#0e7490`, mais escuro e esverdeado):
   * são as duas famílias que falam com o mundo de fora, e distingui-las é o
   * ponto — uma chama uma máquina, a outra chama alguém.
   */
  tela: "#0284c7",
  conector: "#0e7490",
  agente: "#9333ea",
  funcao: "#059669",
  projeto: "#b45309",
  transformacao: "#db2777",
  /**
   * SPEC-110 fatia J — o índigo do SUBFLUXO. Distante do roxo do agente
   * (`#9333ea`) e do azul da tela (`#0284c7`) porque o cartão que contém um
   * fluxo inteiro não pode ser confundido com o que faz uma coisa só.
   *
   * A escolha passou por TRÊS guardiões da casa, e os três estavam certos:
   *
   * 1. o índigo mais escuro que tentei primeiro dava 2.84 no tema escuro, e a
   *    régua cobra ≥ 3;
   * 2. o tom seguinte passava no contraste mas é o `--acento-indigo` — cor de
   *    um tipo da MESA, e a §2.2 recusa isso para os dois grafos não ficarem
   *    indistinguíveis;
   * 3. e citar os dois hexes recusados neste comentário tropeçou na regra que
   *    proíbe repetir no código um valor que já é variável — eles têm nome
   *    (`--acento-gente` e `--acento-indigo`), e o nome é o que se escreve.
   *
   * O tom abaixo é livre nas duas listas: 4.21 no claro, 4.24 no escuro.
   */
  subfluxo: "#6d6af2",
};

/** Ícones do catálogo curado da mesa (`canvas/icones.ts`) — reusar o mapa é o
 * que garante que o nome existe e não infla o bundle. */
export const ICONES_POR_FAMILIA: Record<TipoDeNoDoFluxo, string> = {
  gatilho: "Play",
  // SPEC-110 B — a tela é onde alguém OLHA e decide; o retângulo com moldura
  // é o desenho mais próximo disso no catálogo curado.
  tela: "Smartphone",
  conector: "Globe",
  agente: "Zap",
  funcao: "Cog",
  projeto: "Boxes",
  transformacao: "Split",
  // Camadas: um fluxo dentro de outro é exatamente isso.
  subfluxo: "Layers",
};

/**
 * SPEC-109 fatia B — o vocabulário que o usuário pediu ("integração externa →
 * agente → artefato"): a família fala a língua de quem monta o fluxo, não a
 * do código. "Conector" era o nome do TIPO interno; "Integração externa" é o
 * que ele é. "Projeto" virou "Mesa de projeto" — a mesa É o componente que se
 * abre (a decisão antiga do §2.3 de separar os nomes caiu com o pedido).
 */
export const ROTULOS_POR_FAMILIA: Record<TipoDeNoDoFluxo, string> = {
  // SPEC-110 A — a família nova diz QUANDO o fluxo roda.
  gatilho: "Gatilho",
  // SPEC-110 B — "Tela", não "Screen": o vocabulário da interface fala
  // português, e é o nome que o usuário usou ao pedir ("abstraído como
  // screen" era a ideia; a palavra na tela é a da casa).
  tela: "Tela",
  conector: "Integração externa",
  agente: "Agente",
  funcao: "Função do sistema",
  /**
   * SPEC-110 fatia F — a família é a DEMANDA, e a mesa é uma TELA. Manter
   * "Mesa de projeto" aqui faria o cabeçalho do cartão mentir: um nó de
   * leitura passou a NÃO ser a porta para a mesa (a porta virou a tela `mesa`
   * da fatia B), e o cartão anunciaria uma tela que ele não abre — medido na
   * validação visual desta fatia, onde os três cartões diziam
   * "MESA DE PROJETO" por cima de "Ler", "Gravar" e "Mesa de projeto".
   */
  projeto: "Demanda",
  transformacao: "Transformação",
  // O cartão diz que ali dentro mora um fluxo inteiro.
  subfluxo: "Subfluxo",
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


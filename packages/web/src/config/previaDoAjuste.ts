import {
  aplicarOperacao,
  derivar,
  renderizarItemEspecificacao,
  type DiagramaConfig,
  type Diagrama,
  type OperacaoDeAjuste,
  type RegrasConfig,
} from "@gerador/engine";

/**
 * SPEC-45 — a prévia do ajuste: **um item do mesmo tipo, simulado**.
 *
 * Pedido do usuário: "simular um item do mesmo tipo, gerando um item de
 * simulação com a IA e iterando até chegar no que se deseja em termos de
 * configuração". A parte determinística mora aqui: um nó de exemplo do tipo
 * escolhido é derivado e renderizado com a configuração PROPOSTA, pelo mesmo
 * caminho que gera o documento de verdade (`renderizarItemEspecificacao`) —
 * prévia que usasse outra lógica seria uma promessa que a geração real não
 * cumpre. A IA entra depois, preenchendo os campos deste mesmo item.
 */
export interface PreviaDoAjuste {
  /** O item de exemplo renderizado com a config proposta. */
  markdown: string;
  /** As linhas de checklist que ENTRAM com o ajuste (pintadas de verde). */
  adicionados: string[];
  /** As que SAEM (pintadas de vermelho). */
  removidos: string[];
  /** Techs do tipo de componente escolhido — o alvo natural da operação. */
  techs: string[];
}

/** Um diagrama de UM nó do tipo pedido — o "item do mesmo tipo" da prévia.
 * Campos obrigatórios entram preenchidos com um valor de exemplo: item de
 * exemplo com pendência vermelha ensinaria a coisa errada. */
export function diagramaDeExemplo(config: DiagramaConfig, tipoNo: string): Diagrama {
  const cfg = config.nodeTypes[tipoNo];
  const spec: Diagrama["nodes"][number]["spec"] = {};
  for (const campo of cfg?.spec ?? []) {
    if (campo.required) spec[campo.key] = { valor: `exemplo-${campo.key}`, origem: "manual" };
  }
  return {
    nodes: [
      {
        id: "exemplo",
        type: tipoNo,
        status: "novo",
        label: `${cfg?.label ?? tipoNo} de exemplo`,
        x: 0,
        y: 0,
        spec,
        specNA: {},
      },
    ],
    edges: [],
  };
}

/**
 * Renderiza o item de exemplo com a operação já aplicada e diz o que mudou.
 * `null` quando o tipo não deriva atividade nenhuma (nem todo componente
 * gera item) — a tela mostra isso em vez de uma prévia vazia enganosa.
 */
export function simularItemComAjuste(
  config: DiagramaConfig,
  regras: RegrasConfig,
  tipoNo: string,
  operacao: OperacaoDeAjuste | null
): PreviaDoAjuste | null {
  const diagrama = diagramaDeExemplo(config, tipoNo);
  const atividades = derivar(diagrama, config, {});
  if (atividades.length === 0) return null;

  const regrasPropostas = operacao ? aplicarOperacao(regras, operacao) : regras;
  const markdown = renderizarItemEspecificacao(1, atividades[0], diagrama, config, regrasPropostas);

  // O diff é medido no ITEM (não no documento): é o que a pessoa vai ver na
  // revisão. Uma regra adicionada numa tech que este componente não usa
  // corretamente não aparece — e é exatamente o aviso que ela precisa.
  const antes = renderizarItemEspecificacao(1, atividades[0], diagrama, config, regras);
  const linhas = (texto: string) =>
    texto
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.trim());
  const linhasAntes = linhas(antes);
  const linhasDepois = linhas(markdown);

  return {
    markdown,
    adicionados: linhasDepois.filter((l) => !linhasAntes.includes(l)),
    removidos: linhasAntes.filter((l) => !linhasDepois.includes(l)),
    techs: config.nodeTypes[tipoNo]?.techs ?? [],
  };
}

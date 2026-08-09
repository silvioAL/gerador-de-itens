import type { Atividade } from "../model/types.js";

/**
 * SPEC-26 Bloco 2 / SPEC-27 Fase 2 — a onda de impacto.
 *
 * Mudou o item X: quem mais precisa ser olhado? A resposta sai do grafo que já
 * existe, **sem modelo nenhum** — e essa é a parte que importa. Se quem decide
 * o escopo da revisão fosse o LLM, ele teria que primeiro descobrir as
 * dependências (que o app já sabe de cor) e depois raciocinar sobre elas, com
 * chance de errar nas duas etapas. O app computa QUAIS itens revisar; o modelo
 * só escreve o ajuste.
 *
 * Dois caminhos de propagação, os dois presentes no domínio:
 *
 * 1. **Dependência** — quem depende de X, transitivamente. Mudou o contrato do
 *    item que cria a fila, muda quem consome dela.
 * 2. **Mesma origem** — itens derivados do MESMO nó ou da MESMA conexão. Eles
 *    compartilham a spec que mudou, então compartilham a consequência.
 *
 * O que NÃO é impacto: item que X depende (o produtor não muda porque o
 * consumidor mudou). Propagar para cima transformaria qualquer edição numa
 * revisão da quebra inteira, que é exatamente o trabalho manual que se quer
 * evitar.
 */
export interface ItemImpactado {
  chave: string;
  /** Por que este item entrou na onda — vira o texto que a pessoa lê antes de
   * aceitar a revisão, e o motivo que vai no prompt do modelo. */
  motivo: "origem" | "dependencia";
}

export function itensImpactados(atividades: Atividade[], chaveAlterada: string): ItemImpactado[] {
  const alterada = atividades.find((a) => a.chave === chaveAlterada);
  if (!alterada) return [];

  const motivos = new Map<string, ItemImpactado["motivo"]>();

  // 1. Mesma origem (nó ou conexão): compartilham a spec que mudou.
  for (const a of atividades) {
    if (a.chave === chaveAlterada) continue;
    const mesmoNo = !!alterada.origem.nodeId && a.origem.nodeId === alterada.origem.nodeId;
    const mesmaAresta = !!alterada.origem.edgeId && a.origem.edgeId === alterada.origem.edgeId;
    if (mesmoNo || mesmaAresta) motivos.set(a.chave, "origem");
  }

  // 2. Quem depende de X, transitivamente. Fila de largura sobre as
  //    dependências declaradas — o mesmo grafo que a derivação já produz.
  const fila = [chaveAlterada];
  const visitados = new Set([chaveAlterada]);
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const a of atividades) {
      if (visitados.has(a.chave)) continue;
      if (!a.dependencias.some((d) => d.alvoChave === atual)) continue;
      visitados.add(a.chave);
      // "dependencia" vence "origem": é a relação mais forte, e o motivo
      // mostrado deve ser o que explica melhor por que revisar.
      motivos.set(a.chave, "dependencia");
      fila.push(a.chave);
    }
  }

  // Ordem estável e útil: a mesma ordem dos itens na tela.
  const posicao = new Map(atividades.map((a, i) => [a.chave, i]));
  return [...motivos.entries()]
    .map(([chave, motivo]) => ({ chave, motivo }))
    .sort((a, b) => (posicao.get(a.chave) ?? 0) - (posicao.get(b.chave) ?? 0));
}

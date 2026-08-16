import { useCallback, useState } from "react";
import type { Diagrama, DiagramaConfig, Quebra, ValorSpec } from "@gerador/engine";
import { useDiagrama } from "./useDiagrama";

export type { EdgeRejeitada } from "./useDiagrama";

/**
 * O estado de uma QUEBRA — a demanda inteira.
 *
 * SPEC-59 fatia C: tudo que era manipulação de nó e aresta saiu daqui para
 * `useDiagrama`, e este hook o **compõe**. A escolha foi composição e não
 * genérico por parâmetro de tipo: genérico espalharia o domínio dentro do
 * canvas, e o que se queria era exatamente tirá-lo de lá.
 *
 * O que sobrou aqui é o que só existe numa quebra: o documento em si, e as
 * respostas dos placeholders por item. Tudo o mais é diagrama, e diagrama
 * agora é assunto de outro arquivo.
 */
export function useQuebra(inicial: Quebra, config: DiagramaConfig) {
  const [quebra, setQuebra] = useState<Quebra>(inicial);

  /** A ponte: o diagrama mora dentro da quebra, e só este callback sabe disso.
   * É por ele que `useDiagrama` escreve sem nunca ver um `Quebra`. */
  const aplicarNoDiagrama = useCallback(
    (mudar: (d: Diagrama) => Diagrama) => setQuebra((q) => ({ ...q, diagrama: mudar(q.diagrama) })),
    []
  );

  const diagramaState = useDiagrama(quebra.diagrama, aplicarNoDiagrama, config);

  /** Resposta (manual ou sugerida por IA) a um placeholder "<- ✍️ especificar"
   * do refinamento técnico/volumetria de uma atividade (Fase 1, SPEC-23) —
   * chaveada por `Atividade.chave` (estável) + a chave do próprio placeholder,
   * mesmo padrão de `definirValorSpec` pra campos de nó. */
  // SPEC-44: `undefined` REMOVE a resposta (o Descartar da fila guiada) — o
  // campo volta a "✍️ especificar" de verdade, não fica um valor vazio.
  const responderItem = useCallback(
    (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec | undefined) => {
      setQuebra((q) => {
        const doItem = { ...q.respostasItens?.[atividadeChave] };
        if (resposta === undefined) delete doItem[chavePlaceholder];
        else doItem[chavePlaceholder] = resposta;
        return { ...q, respostasItens: { ...q.respostasItens, [atividadeChave]: doItem } };
      });
    },
    []
  );

  return { quebra, setQuebra, ...diagramaState, responderItem };
}

export type UseQuebra = ReturnType<typeof useQuebra>;
export type { Aresta, No } from "@gerador/engine";

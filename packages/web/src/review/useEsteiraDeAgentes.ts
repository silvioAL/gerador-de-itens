import { useCallback, useRef, useState } from "react";
import type { ValorSpec } from "@gerador/engine";
import { apiIa, type PapelPipeline, type PlaceholderPedidoItemIa } from "../api/client";

/** Ordem fixa da esteira default (SPEC-24) — editável na Fase F, hardcoded
 * por enquanto (pipeline configurável ainda não existe). */
export const PAPEIS_PIPELINE: PapelPipeline[] = ["po", "arquiteto", "especialista", "qa"];

export const ROTULO_PAPEL: Record<PapelPipeline, string> = {
  po: "PO",
  arquiteto: "Arquiteto",
  especialista: "Especialista técnico",
  qa: "QA",
};

/** Um item da fila carrega os placeholders JÁ separados por papel — quem
 * monta isso (`ReviewScreen.montarFilaEsteira`) decide, a partir da ficha,
 * quais chaves pertencem a qual papel (história/critérios → PO, contrato →
 * Arquiteto, checklist técnico/volumetria → Especialista, regras de
 * teste/cenário → QA). Um papel sem nada pra um item (ex.: Especialista sem
 * nenhum requisito técnico aplicável) é pulado pra aquele item — não é fila
 * vazia, é ausência de trabalho legítima. */
export interface ItemFilaEsteira {
  atividadeChave: string;
  atividadeRotulo: string;
  contextoNo: string;
  placeholdersPorPapel: Record<PapelPipeline, PlaceholderPedidoItemIa[]>;
}

export interface UseEsteiraDeAgentesParams {
  contextoEpico?: string;
  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => void;
}

export interface EstadoEsteiraDeAgentes {
  rodando: boolean;
  pausado: boolean;
  papelAtual: PapelPipeline | null;
  /** Item em processamento dentro do papel atual. */
  atual: ItemFilaEsteira | null;
  /** Progresso DENTRO do papel atual — reseta a cada handoff. */
  progresso: { feito: number; total: number };
  iniciar: (fila: ItemFilaEsteira[]) => void;
  pausar: () => void;
  continuar: () => void;
}

/**
 * Orquestra a esteira de 4 papéis (SPEC-24) — muda de eixo em relação a
 * `useGeracaoAoVivo` (Fase 1d/1d-ii, que processa um ITEM por vez, do início
 * ao fim): aqui processa um PAPEL por vez, em TODOS os itens, só então passa
 * pro próximo papel — "PO termina todos os itens, depois Arquiteto começa em
 * todos os itens...", fiel à divisão de responsabilidade real de um time
 * (um PO não pensa contrato de API, um Arquiteto não escreve critério de
 * aceite). Sequencial sempre (nunca paralelo — um modelo local, uma sessão
 * só). Falha isolada num item não trava a esteira, mesma disciplina de
 * `useGeracaoAoVivo`.
 */
export function useEsteiraDeAgentes({ contextoEpico, onResponderItem }: UseEsteiraDeAgentesParams): EstadoEsteiraDeAgentes {
  const [fila, setFila] = useState<ItemFilaEsteira[]>([]);
  const [papelIndice, setPapelIndice] = useState(0);
  const [itemIndice, setItemIndice] = useState(0);
  const [rodando, setRodando] = useState(false);
  const [pausado, setPausado] = useState(false);

  const pausadoRef = useRef(false);
  const tokenRef = useRef(0);

  const processarEsteira = useCallback(
    async (filaNova: ItemFilaEsteira[], token: number) => {
      for (let p = 0; p < PAPEIS_PIPELINE.length; p++) {
        if (tokenRef.current !== token) return;
        const papel = PAPEIS_PIPELINE[p];
        const itensDoPapel = filaNova.filter((item) => item.placeholdersPorPapel[papel].length > 0);
        setPapelIndice(p);

        for (let i = 0; i < itensDoPapel.length; i++) {
          if (tokenRef.current !== token) return;

          while (pausadoRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            if (tokenRef.current !== token) return;
          }

          setItemIndice(i);
          const item = itensDoPapel[i];
          try {
            const respostas = await apiIa.sugerirPipeline(papel, {
              atividadeRotulo: item.atividadeRotulo,
              contextoNo: item.contextoNo,
              contextoEpico,
              placeholders: item.placeholdersPorPapel[papel],
            });
            if (tokenRef.current !== token) return;
            for (const placeholder of item.placeholdersPorPapel[papel]) {
              const valor = respostas[placeholder.chave];
              if (valor === undefined) continue;
              onResponderItem?.(item.atividadeChave, placeholder.chave, { valor, origem: "sugerido", confirmado: false });
            }
          } catch {
            // Falha isolada (ex.: modelo travou nesse item/papel) não trava a
            // esteira — segue pro próximo item do mesmo papel. Item fica sem
            // aquele campo, editável manualmente depois.
          }
        }
      }
      if (tokenRef.current === token) setRodando(false);
    },
    [contextoEpico, onResponderItem]
  );

  const iniciar = useCallback(
    (filaNova: ItemFilaEsteira[]) => {
      const token = ++tokenRef.current;
      pausadoRef.current = false;
      setPausado(false);
      setFila(filaNova);
      setPapelIndice(0);
      setItemIndice(0);
      const temTrabalho = filaNova.some((item) => PAPEIS_PIPELINE.some((papel) => item.placeholdersPorPapel[papel].length > 0));
      setRodando(temTrabalho);
      if (temTrabalho) void processarEsteira(filaNova, token);
    },
    [processarEsteira]
  );

  const pausar = useCallback(() => {
    pausadoRef.current = true;
    setPausado(true);
  }, []);

  const continuar = useCallback(() => {
    pausadoRef.current = false;
    setPausado(false);
  }, []);

  const papelAtual = rodando ? (PAPEIS_PIPELINE[papelIndice] ?? null) : null;
  const itensDoPapelAtual = papelAtual ? fila.filter((item) => item.placeholdersPorPapel[papelAtual].length > 0) : [];

  return {
    rodando,
    pausado,
    papelAtual,
    atual: rodando ? (itensDoPapelAtual[itemIndice] ?? null) : null,
    progresso: { feito: rodando ? itemIndice : itensDoPapelAtual.length, total: itensDoPapelAtual.length },
    iniciar,
    pausar,
    continuar,
  };
}

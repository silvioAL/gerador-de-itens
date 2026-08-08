import { useCallback, useRef, useState } from "react";
import type { ValorSpec } from "@gerador/engine";
import { apiIa, type PlaceholderPedidoItemIa } from "../api/client";

/** Fase 1d-ii (SPEC-23) — um item da fila agora é uma ATIVIDADE inteira, não
 * mais um placeholder isolado: a IA responde a ficha inteira (história de
 * usuário + critérios de aceite contextuais + checklist técnico/volumetria)
 * numa chamada só a `/ia/sugerir-item`, correção de rumo depois de 1d (a
 * versão placeholder-por-placeholder nunca gerava história/cenário
 * contextual, só respostas de checklist soltas). */
export interface ItemFilaGeracao {
  atividadeChave: string;
  atividadeRotulo: string;
  contextoNo: string;
  placeholders: PlaceholderPedidoItemIa[];
}

export interface UseGeracaoAoVivoParams {
  contextoEpico?: string;
  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => void;
}

export interface EstadoGeracaoAoVivo {
  rodando: boolean;
  pausado: boolean;
  atual: ItemFilaGeracao | null;
  progresso: { feito: number; total: number };
  iniciar: (fila: ItemFilaGeracao[]) => void;
  pausar: () => void;
  continuar: () => void;
}

/**
 * Orquestra chamadas reais de `/ia/sugerir-item` (schema dinâmico via GBNF,
 * Fase 1d-ii) em sequência sobre uma fila de atividades pendentes — nunca em
 * paralelo (um modelo local, uma sessão só; chamadas concorrentes
 * disputariam o mesmo contexto). "Reiniciar/Gerar de novo" é só chamar
 * `iniciar()` de novo com uma fila nova — recomeça do zero (Fase 1d,
 * SPEC-23).
 *
 * Sem `textoParcial` (existia na versão 1d, placeholder-por-placeholder,
 * streamada): a chamada por item devolve todos os campos de uma vez via
 * GBNF, não streamada — quem chama mostra um indicador estático ("gerando a
 * ficha inteira...") em vez de texto crescendo caractere a caractere.
 *
 * A fila é um snapshot passado em `iniciar()`, não um valor reativo — evita
 * reconstruir/reiniciar a cada re-render de quem chama (fichas/atividades
 * mudam de referência a cada render do `ReviewScreen`).
 */
export function useGeracaoAoVivo({ contextoEpico, onResponderItem }: UseGeracaoAoVivoParams): EstadoGeracaoAoVivo {
  const [fila, setFila] = useState<ItemFilaGeracao[]>([]);
  const [indice, setIndice] = useState(0);
  const [rodando, setRodando] = useState(false);
  const [pausado, setPausado] = useState(false);

  // Refs pra loop assíncrono ler o estado mais recente sem depender de
  // closures presas no valor de quando o loop começou.
  const pausadoRef = useRef(false);
  const tokenRef = useRef(0);

  const processarFila = useCallback(
    async (filaNova: ItemFilaGeracao[], token: number) => {
      for (let i = 0; i < filaNova.length; i++) {
        if (tokenRef.current !== token) return; // reiniciado enquanto rodava

        while (pausadoRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          if (tokenRef.current !== token) return;
        }

        setIndice(i);
        const item = filaNova[i];
        try {
          const respostas = await apiIa.sugerirItem({
            atividadeRotulo: item.atividadeRotulo,
            contextoNo: item.contextoNo,
            contextoEpico,
            placeholders: item.placeholders,
          });
          if (tokenRef.current !== token) return;
          for (const placeholder of item.placeholders) {
            const valor = respostas[placeholder.chave];
            if (valor === undefined) continue;
            onResponderItem?.(item.atividadeChave, placeholder.chave, { valor, origem: "sugerido", confirmado: false });
          }
        } catch {
          // Achado esperado: falha isolada (ex.: modelo travou num item) não
          // trava a fila inteira — segue pro próximo. O item que falhou fica
          // sem resposta, tentável de novo manualmente via "✨ Sugerir".
        }
      }
      if (tokenRef.current === token) setRodando(false);
    },
    [contextoEpico, onResponderItem]
  );

  const iniciar = useCallback(
    (filaNova: ItemFilaGeracao[]) => {
      const token = ++tokenRef.current; // invalida qualquer loop anterior em voo
      pausadoRef.current = false;
      setPausado(false);
      setFila(filaNova);
      setIndice(0);
      setRodando(filaNova.length > 0);
      if (filaNova.length > 0) void processarFila(filaNova, token);
    },
    [processarFila]
  );

  const pausar = useCallback(() => {
    pausadoRef.current = true;
    setPausado(true);
  }, []);

  const continuar = useCallback(() => {
    pausadoRef.current = false;
    setPausado(false);
  }, []);

  return {
    rodando,
    pausado,
    atual: rodando ? (fila[indice] ?? null) : null,
    progresso: { feito: rodando ? indice : fila.length, total: fila.length },
    iniciar,
    pausar,
    continuar,
  };
}

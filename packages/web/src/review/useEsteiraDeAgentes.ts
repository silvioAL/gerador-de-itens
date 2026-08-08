import { useCallback, useEffect, useRef, useState } from "react";
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

/** O que cada papel faz — subtítulo na faixa de agentes enquanto ele ainda
 * não começou. Enquanto está ativo, o subtítulo vira o item em processamento
 * (quem renderiza decide, ver `EsteiraAgentes`). */
export const DESCRICAO_PAPEL: Record<PapelPipeline, string> = {
  po: "Escreve a história e os critérios de aceite",
  arquiteto: "Amarra o item ao nó e escreve o contrato",
  especialista: "Aplica a tabela de regras do contexto",
  qa: "Deriva as regras de teste e escreve os cenários",
};

/** Quantos itens vão numa chamada só ao modelo (SPEC-24 Fase E — achado real
 * do usuário: "uma chamada por item está muito lento; passe todo o material
 * em uma chamada única por agente, e com 20-30 itens rode em grupos de 5-10
 * com recuperação do contexto"). 5, não 10: a resposta do lote inteiro tem
 * que caber na janela de saída do modelo local sem truncar — com os campos
 * do Especialista (checklist inteiro por item) 10 itens estouram fácil.
 * Cada lote recebe o prompt completo de novo (contexto do épico + contexto
 * de nós por item) — é a "recuperação do contexto" entre grupos. */
export const TAM_LOTE_ESTEIRA = 5;

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
  /** SPEC-24 Fase E — achado real do usuário: "pode avançar sozinho até o
   * fim, ou ir parando conforme está hoje". `true` (default) preserva o
   * comportamento atual — cada resposta fica `confirmado: false`, pendente
   * de revisão manual. `false` aplica direto (`confirmado: true`), sem
   * pausa, igual ao protótipo de referência. */
  confirmacaoObrigatoria?: boolean;
  onResponderItem?: (atividadeChave: string, chavePlaceholder: string, resposta: ValorSpec) => void;
}

export interface EstadoEsteiraDeAgentes {
  rodando: boolean;
  pausado: boolean;
  papelAtual: PapelPipeline | null;
  /** O item que o modelo está ESCREVENDO agora (derivado do streaming do
   * lote — a última chave de item aberta no JSON parcial), com fallback pro
   * primeiro item do lote corrente enquanto nada chegou. */
  atual: ItemFilaEsteira | null;
  /** Chaves de TODOS os itens do lote em geração agora — os pips/timeline
   * marcam o lote inteiro como "em escrita", não um item só. */
  escrevendoChaves: string[];
  /** Progresso DENTRO do papel atual (itens concluídos) — reseta a cada
   * handoff. */
  progresso: { feito: number; total: number };
  /** O que o modelo está escrevendo agora, por item → por chave de
   * placeholder (SPEC-24 Fase E — extraído ao vivo do JSON aninhado parcial
   * que a rota streama). Vazio fora de uma chamada em andamento. */
  respostasAoVivoPorItem: Record<string, Record<string, string>>;
  iniciar: (fila: ItemFilaEsteira[]) => void;
  pausar: () => void;
  continuar: () => void;
}

/**
 * Extrai a estrutura item→campo→valor de um JSON aninhado possivelmente
 * INCOMPLETO — o texto cru que o modelo ainda está escrevendo num lote.
 * Todos os valores são strings planas em dois níveis fixos (garantido pelo
 * schema GBNF), então um mini-scanner que acompanha profundidade e o último
 * par chave/valor aberto basta. O último valor pode não ter fechado a aspa
 * ainda — vem até onde chegou. Não é um parser de JSON geral, e não precisa
 * ser: é só pra exibição ao vivo; o parse de verdade acontece no final,
 * sobre o corpo completo garantido pela grammar.
 */
export function extrairRespostasParciaisAninhadas(texto: string): Record<string, Record<string, string>> {
  const parciais: Record<string, Record<string, string>> = {};
  let profundidade = 0;
  let chaveItem: string | null = null;
  let chaveCampo: string | null = null;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"') {
      // Lê a string (mantendo escapes crus pra desescapar de uma vez no fim).
      let j = i + 1;
      let cru = "";
      while (j < texto.length && texto[j] !== '"') {
        if (texto[j] === "\\") {
          cru += texto[j] + (texto[j + 1] ?? "");
          j += 2;
        } else {
          cru += texto[j];
          j++;
        }
      }
      const fechada = j < texto.length;
      let k = j + 1;
      while (k < texto.length && /\s/.test(texto[k])) k++;
      const eChave = fechada && texto[k] === ":";
      const valor = desescapar(cru);
      if (eChave) {
        if (profundidade === 1) {
          chaveItem = valor;
          parciais[chaveItem] ??= {};
        } else if (profundidade === 2) {
          chaveCampo = valor;
        }
        i = k + 1;
      } else {
        if (profundidade === 2 && chaveItem && chaveCampo) {
          parciais[chaveItem][chaveCampo] = valor;
          if (fechada) chaveCampo = null;
        }
        i = fechada ? j + 1 : texto.length;
      }
      continue;
    }
    if (c === "{") profundidade++;
    if (c === "}") {
      profundidade--;
      if (profundidade === 1) chaveItem = null;
    }
    i++;
  }
  return parciais;
}

function desescapar(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/**
 * Orquestra a esteira de 4 papéis (SPEC-24): processa um PAPEL por vez, em
 * TODOS os itens, só então passa pro próximo papel — fiel à divisão de
 * responsabilidade real de um time. Desde a Fase E, dentro de um papel os
 * itens vão em LOTES de `TAM_LOTE_ESTEIRA` numa chamada só ao modelo (era
 * uma chamada POR ITEM — 4×N chamadas pra N itens, lento demais; agora são
 * 4×⌈N/5⌉). Sequencial sempre (nunca paralelo — um modelo local, uma sessão
 * só). Falha isolada num lote não trava a esteira — os itens daquele lote
 * ficam sem os campos daquele papel, editáveis manualmente depois.
 */
export function useEsteiraDeAgentes({
  contextoEpico,
  confirmacaoObrigatoria = true,
  onResponderItem,
}: UseEsteiraDeAgentesParams): EstadoEsteiraDeAgentes {
  const [fila, setFila] = useState<ItemFilaEsteira[]>([]);
  const [papelIndice, setPapelIndice] = useState(0);
  const [itensFeitos, setItensFeitos] = useState(0);
  const [loteChaves, setLoteChaves] = useState<string[]>([]);
  const [rodando, setRodando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [aoVivoPorItem, setAoVivoPorItem] = useState<Record<string, Record<string, string>>>({});

  const pausadoRef = useRef(false);
  const tokenRef = useRef(0);
  // Lido dentro de `processarEsteira`, não capturado por fechamento — o
  // efeito de auto-start em `ReviewScreen` chama `esteira.iniciar` só na
  // montagem (deps `[]`), preso ao `iniciar` da primeira renderização; sem o
  // ref, a config carregada depois (achado real: `/config/pipeline-agentes`
  // resolve depois de `/ia/status`) nunca seria enxergada por esse fechamento
  // já antigo. Ref sempre reflete o valor mais recente, mesmo lido de dentro
  // de uma função presa a uma renderização passada.
  const confirmacaoObrigatoriaRef = useRef(confirmacaoObrigatoria);
  useEffect(() => {
    confirmacaoObrigatoriaRef.current = confirmacaoObrigatoria;
  }, [confirmacaoObrigatoria]);

  const processarEsteira = useCallback(
    async (filaNova: ItemFilaEsteira[], token: number) => {
      for (let p = 0; p < PAPEIS_PIPELINE.length; p++) {
        if (tokenRef.current !== token) return;
        const papel = PAPEIS_PIPELINE[p];
        const itensDoPapel = filaNova.filter((item) => item.placeholdersPorPapel[papel].length > 0);
        setPapelIndice(p);
        setItensFeitos(0);

        for (let i = 0; i < itensDoPapel.length; i += TAM_LOTE_ESTEIRA) {
          if (tokenRef.current !== token) return;

          while (pausadoRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            if (tokenRef.current !== token) return;
          }

          const lote = itensDoPapel.slice(i, i + TAM_LOTE_ESTEIRA);
          setLoteChaves(lote.map((item) => item.atividadeChave));
          setAoVivoPorItem({});
          try {
            const respostas = await apiIa.sugerirPipeline(
              papel,
              {
                contextoEpico,
                itens: lote.map((item) => ({
                  chave: item.atividadeChave,
                  rotulo: item.atividadeRotulo,
                  contextoNo: item.contextoNo,
                  placeholders: item.placeholdersPorPapel[papel],
                })),
              },
              (acumulado) => {
                if (tokenRef.current === token) setAoVivoPorItem(extrairRespostasParciaisAninhadas(acumulado));
              }
            );
            if (tokenRef.current !== token) return;
            for (const item of lote) {
              for (const placeholder of item.placeholdersPorPapel[papel]) {
                const valor = respostas[item.atividadeChave]?.[placeholder.chave];
                if (valor === undefined) continue;
                onResponderItem?.(item.atividadeChave, placeholder.chave, {
                  valor,
                  origem: "sugerido",
                  confirmado: !confirmacaoObrigatoriaRef.current,
                });
              }
            }
          } catch {
            // Falha isolada (ex.: modelo travou nesse lote/papel) não trava a
            // esteira — segue pro próximo lote do mesmo papel. Os itens do
            // lote ficam sem os campos desse papel, editáveis manualmente.
          } finally {
            if (tokenRef.current === token) setAoVivoPorItem({});
          }
          if (tokenRef.current === token) setItensFeitos(i + lote.length);
        }
      }
      if (tokenRef.current === token) {
        setRodando(false);
        setLoteChaves([]);
      }
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
      setItensFeitos(0);
      setLoteChaves([]);
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
  // O item "sendo escrito": a ÚLTIMA chave de item aberta no JSON parcial
  // (objetos preservam ordem de inserção); antes do primeiro token do lote,
  // o primeiro item do lote.
  const chaveEscrevendo = Object.keys(aoVivoPorItem).at(-1) ?? loteChaves[0];
  const atual = rodando ? (fila.find((item) => item.atividadeChave === chaveEscrevendo) ?? null) : null;

  return {
    rodando,
    pausado,
    papelAtual,
    atual,
    escrevendoChaves: rodando ? loteChaves : [],
    progresso: { feito: itensFeitos, total: itensDoPapelAtual.length },
    respostasAoVivoPorItem: aoVivoPorItem,
    iniciar,
    pausar,
    continuar,
  };
}

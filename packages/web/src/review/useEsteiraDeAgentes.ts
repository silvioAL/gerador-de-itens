import { useCallback, useEffect, useRef, useState } from "react";
import type { ValorSpec } from "@gerador/engine";
import {
  PAPEIS_PADRAO,
  apiIa,
  type GrupoFicha,
  type PapelConfigurado,
  type PlaceholderPedidoItemIa,
  type RespostaAnteriorIa,
} from "../api/client";

/** As 4 SEÇÕES fixas da ficha (dado do engine) — não confundir com os papéis
 * da esteira, que desde a Fase F são configuráveis (`PapelConfigurado`): N
 * papéis escrevem nessas 4 seções. Mantém o nome exportado antigo porque
 * AbaRefinamento/pips seccionam a FICHA por aqui. */
export const PAPEIS_PIPELINE: GrupoFicha[] = ["po", "arquiteto", "especialista", "qa"];

/** Rótulo das seções da ficha (cabeçalhos da aba Refinamento). Os papéis da
 * esteira têm `nome` próprio na config — este aqui é da SEÇÃO. */
export const ROTULO_PAPEL: Record<GrupoFicha, string> = {
  po: "PO",
  arquiteto: "Arquiteto",
  especialista: "Especialista técnico",
  qa: "QA",
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
  /** Chave = ID do papel CONFIGURADO (não o grupo) — quem monta a fila
   * (`ReviewScreen.montarFilaEsteira`) já resolveu qual papel leva cada
   * seção de cada item (contextos, Fase F). */
  placeholdersPorPapel: Record<string, PlaceholderPedidoItemIa[]>;
  /** Artefatos que JÁ existiam antes desta corrida (respostas confirmadas,
   * edições do usuário) e que não vão ser regenerados — entram como insumo
   * dos papéis desde o primeiro ("re-rodar a partir da alteração" manda a
   * alteração por aqui). As respostas geradas DURANTE a corrida são
   * acumuladas por cima pelo próprio hook. */
  respostasExistentes?: RespostaAnteriorIa[];
}

export interface UseEsteiraDeAgentesParams {
  contextoEpico?: string;
  /** SPEC-24 Fase F — papéis ATIVOS da esteira, na ordem de execução. Vem da
   * config (`pipeline-agentes.json`); ausente cai nos 4 padrão. Lido via ref
   * dentro da esteira (mesmo motivo do `confirmacaoObrigatoria`: a config
   * resolve DEPOIS do auto-start de montagem). */
  papeis?: PapelConfigurado[];
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
  /** ID do papel configurado em execução agora. */
  papelAtual: string | null;
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
  /** `papeisOverride` (Fase F): o auto-start acabou de resolver a config e o
   * prop `papeis` ainda não re-renderizou — passa a lista fresca direto pra
   * esta corrida não largar com a antiga. */
  iniciar: (fila: ItemFilaEsteira[], papeisOverride?: PapelConfigurado[]) => void;
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
  papeis = PAPEIS_PADRAO,
  confirmacaoObrigatoria = true,
  onResponderItem,
}: UseEsteiraDeAgentesParams): EstadoEsteiraDeAgentes {
  const [fila, setFila] = useState<ItemFilaEsteira[]>([]);
  const [papelAtualId, setPapelAtualId] = useState<string | null>(null);
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
  const papeisRef = useRef(papeis);
  useEffect(() => {
    papeisRef.current = papeis;
  }, [papeis]);

  const processarEsteira = useCallback(
    async (filaNova: ItemFilaEsteira[], token: number) => {
      // Fixa a lista NO INÍCIO da corrida — a config mudar no meio não muda
      // uma esteira já em andamento (a próxima usa a nova).
      const papeisDaCorrida = papeisRef.current;
      // Encadeamento: cada item acumula os artefatos já escritos (os que
      // existiam antes da corrida + os que os papéis anteriores geraram
      // nesta corrida), e os papéis seguintes recebem tudo como insumo.
      const acumuladas = new Map<string, RespostaAnteriorIa[]>(
        filaNova.map((item) => [item.atividadeChave, [...(item.respostasExistentes ?? [])]])
      );
      for (const papel of papeisDaCorrida) {
        if (tokenRef.current !== token) return;
        const itensDoPapel = filaNova.filter((item) => (item.placeholdersPorPapel[papel.id] ?? []).length > 0);
        setPapelAtualId(papel.id);
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
          // ACHADO REAL (relato do usuário: "vi o PO escrevendo e depois todos
          // os itens ficaram vazios"): o texto que aparece durante a geração
          // vem do parser PARCIAL, que aceita JSON incompleto; o que fica vem
          // do `JSON.parse` do corpo inteiro, no fim. Resposta truncada
          // (contexto estourado, geração interrompida) faz o parse explodir, o
          // catch abaixo engolir, e TUDO que o usuário viu ser escrito sumir.
          // Guardar o acumulado permite salvar o que já chegou.
          let ultimoAcumulado = "";
          try {
            const respostas = await apiIa.sugerirPipeline(
              papel.id,
              {
                contextoEpico,
                itens: lote.map((item) => ({
                  chave: item.atividadeChave,
                  rotulo: item.atividadeRotulo,
                  contextoNo: item.contextoNo,
                  placeholders: item.placeholdersPorPapel[papel.id],
                  // Snapshot, não a referência viva — o acumulador continua
                  // crescendo depois desta chamada.
                  respostasAnteriores: [...(acumuladas.get(item.atividadeChave) ?? [])],
                })),
              },
              (acumulado) => {
                ultimoAcumulado = acumulado;
                if (tokenRef.current === token) setAoVivoPorItem(extrairRespostasParciaisAninhadas(acumulado));
              }
            );
            if (tokenRef.current !== token) return;
            for (const item of lote) {
              // ACHADO REAL (validação da Fase 1 da SPEC-25): num lote de 4
              // itens, três receberam tudo e um — o do nó EXISTENTE, com 17
              // placeholders contra 10 dos outros — não recebeu nada, e a
              // única pista foi um pip apagado num screenshot. A grammar do
              // servidor obriga todas as chaves, então uma ausência aqui é
              // sinal de que a resposta veio incompleta (ou de que o schema e
              // o pedido divergiram) — e isso precisa aparecer, não sumir.
              // Mesmo princípio do `console.error` na rota: falha silenciosa
              // custou horas de diagnóstico.
              const faltando = item.placeholdersPorPapel[papel.id].filter(
                (p) => respostas[item.atividadeChave]?.[p.chave] === undefined
              );
              // Só avisa de perda PARCIAL: se a resposta veio vazia inteira, a
              // causa é outra (falha da chamada) e o servidor já registrou —
              // repetir por item aqui só faria barulho.
              if (faltando.length > 0 && Object.keys(respostas).length > 0) {
                console.warn(
                  `[esteira/${papel.id}] item "${item.atividadeChave}" voltou sem ${faltando.length} de ${item.placeholdersPorPapel[papel.id].length} campos:`,
                  faltando.map((p) => p.chave)
                );
              }
              for (const placeholder of item.placeholdersPorPapel[papel.id]) {
                const valor = respostas[item.atividadeChave]?.[placeholder.chave];
                if (valor === undefined) continue;
                acumuladas.get(item.atividadeChave)?.push({ rotulo: placeholder.rotulo, valor });
                onResponderItem?.(item.atividadeChave, placeholder.chave, {
                  valor,
                  origem: "sugerido",
                  confirmado: !confirmacaoObrigatoriaRef.current,
                });
              }
            }
          } catch (erro) {
            // Falha isolada (ex.: modelo travou nesse lote/papel) não trava a
            // esteira — segue pro próximo lote do mesmo papel. Mas ela deixou
            // de ser SILENCIOSA: sumir com o trabalho de um papel inteiro sem
            // dizer nada foi o pior sintoma que este projeto teve.
            console.error(
              `[esteira/${papel.id}] lote de ${lote.length} item(ns) falhou:`,
              erro instanceof Error ? erro.message : erro
            );
            // Salva o que o modelo chegou a escrever: o parser parcial é o
            // MESMO que alimenta o texto ao vivo, então o que a pessoa viu na
            // tela é exatamente o que se recupera aqui. Melhor um campo
            // incompleto, visível e editável, do que a tela em branco.
            if (tokenRef.current === token && ultimoAcumulado) {
              const salvas = extrairRespostasParciaisAninhadas(ultimoAcumulado);
              let recuperados = 0;
              for (const item of lote) {
                for (const placeholder of item.placeholdersPorPapel[papel.id]) {
                  const valor = salvas[item.atividadeChave]?.[placeholder.chave];
                  if (valor === undefined || valor === "") continue;
                  recuperados++;
                  acumuladas.get(item.atividadeChave)?.push({ rotulo: placeholder.rotulo, valor });
                  // Nunca confirmado, mesmo com confirmação desligada: é texto
                  // possivelmente truncado, e precisa passar pelo olho humano.
                  onResponderItem?.(item.atividadeChave, placeholder.chave, {
                    valor,
                    origem: "sugerido",
                    confirmado: false,
                  });
                }
              }
              if (recuperados > 0) {
                console.warn(`[esteira/${papel.id}] recuperados ${recuperados} campo(s) do texto já gerado.`);
              }
            }
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
    (filaNova: ItemFilaEsteira[], papeisOverride?: PapelConfigurado[]) => {
      if (papeisOverride) papeisRef.current = papeisOverride;
      const token = ++tokenRef.current;
      pausadoRef.current = false;
      setPausado(false);
      setFila(filaNova);
      setPapelAtualId(null);
      setItensFeitos(0);
      setLoteChaves([]);
      const temTrabalho = filaNova.some((item) =>
        papeisRef.current.some((papel) => (item.placeholdersPorPapel[papel.id] ?? []).length > 0)
      );
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

  const papelAtual = rodando ? papelAtualId : null;
  const itensDoPapelAtual = papelAtual ? fila.filter((item) => (item.placeholdersPorPapel[papelAtual] ?? []).length > 0) : [];
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

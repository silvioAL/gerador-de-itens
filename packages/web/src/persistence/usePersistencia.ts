import { useCallback, useEffect, useRef, useState } from "react";
import type { Quebra } from "@gerador/engine";
import { apiQuebras, type QuebraResumo } from "../api/client";

export type StatusPersistencia = "sem-arquivo" | "salvo" | "salvando" | "nao-salvo" | "sem-titulo" | "erro";

/**
 * Substitui o File System Access API (arquivo local) por chamadas ao
 * @gerador/server — a quebra agora é uma linha no Postgres, não um arquivo em
 * disco (Fase A do plano de produção, ver JOURNEY.md). `localStorage` continua
 * fora disso, mesmo motivo de sempre: rascunho de recuperação, nunca fonte da
 * verdade.
 */
export function usePersistencia(quebra: Quebra, aoAbrir: (q: Quebra) => void) {
  const [quebraId, setQuebraId] = useState<string | null>(null);
  const [lista, setLista] = useState<QuebraResumo[]>([]);
  const [status, setStatus] = useState<StatusPersistencia>("sem-arquivo");
  const primeiraRenderRef = useRef(true);

  const carregarLista = useCallback(async () => {
    try {
      setLista(await apiQuebras.listar());
    } catch {
      // servidor fora do ar não deveria travar a tela principal — só a lista de "Abrir" fica vazia
    }
  }, []);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  // Sem título, a quebra fica impossível de reconhecer depois numa lista —
  // nem chega a chamar a API (mesmo motivo que barra "Derivar Quebra" com
  // vermelho pendente: recusa alto, não silencioso).
  const salvar = useCallback(
    async (q: Quebra) => {
      if (!q.titulo?.trim()) {
        setStatus("sem-titulo");
        return;
      }
      setStatus("salvando");
      try {
        if (quebraId) {
          await apiQuebras.atualizar(quebraId, q);
        } else {
          const criada = await apiQuebras.criar(q);
          setQuebraId(criada.id);
        }
        setStatus("salvo");
        void carregarLista();
      } catch {
        setStatus("erro");
      }
    },
    [quebraId, carregarLista]
  );

  const abrirPorId = useCallback(
    async (id: string) => {
      setStatus("salvando");
      try {
        const salva = await apiQuebras.buscar(id);
        // §184 — reabrir devolve TODO o material salvo. Antes só vinham
        // título/time/diagrama: as respostas da esteira, o contexto e a
        // especificação gerada se perdiam na reabertura (achado real).
        aoAbrir({
          titulo: salva.titulo ?? undefined,
          time: salva.time ?? undefined,
          diagrama: salva.diagrama,
          respostasItens: salva.respostasItens,
          demandInfo: salva.demandInfo || undefined,
          // SPEC-71 — o servidor passou a guardar o NOME do arquivo, então
          // esta conversão morreu. Ela era o único ponto do repositório que
          // sabia da divergência de forma entre o modelo e a coluna, e existia
          // só de um lado: a leitura convertia, a escrita não — e o PUT levava
          // 400 com qualquer anexo. Migração 0037 converte o que já estava
          // gravado, com o mesmo `anexo-N.txt` que se inventava aqui.
          anexosContexto: salva.anexosContexto,
          especificacao: salva.especificacao ?? undefined,
          // §250 — ACHADO REAL, e é a terceira vez que esta lista fica para
          // trás. O §184 já tinha corrigido isto uma vez ("antes só vinham
          // título/time/diagrama"), e desde então CADA campo novo da quebra
          // (produto, necessidades, decisões, exceções, percursos, documento)
          // foi esquecido aqui — reabrir a demanda apagava as fatias A, C e E
          // inteiras, em silêncio, e o próximo autosave gravava o vazio por
          // cima do que estava salvo.
          //
          // A lição estrutural: reconstruir o objeto campo a campo é um convite
          // permanente ao esquecimento. O que protege daqui para frente é o
          // teste de contrato (`usePersistencia.test`), que compara a quebra
          // reaberta com a salva INTEIRA, em vez de conferir campo escolhido.
          produtoId: salva.produtoId ?? undefined,
          necessidades: salva.necessidades,
          decisoes: salva.decisoes,
          excecoes: salva.excecoes,
          percursos: salva.percursos,
          artefatosEscritos: salva.artefatosEscritos,
          documentoStatus: salva.documentoStatus ?? undefined,
          // SPEC-71 — o QUINTO funil, e o que torna a correção do servidor
          // insuficiente sozinha: mesmo com Zod e colunas certos, estes três
          // sumiam aqui, e o autosave de 2 s gravava o vazio por cima do que
          // estava salvo. É a quarta vez que esta lista fica para trás — e é
          // por isso que a trava desta rodada não é um aviso a mais no
          // comentário acima, é um teste que compara o objeto INTEIRO.
          volumetria: salva.volumetria,
          // `null` do banco vira ausência no modelo: `Quebra.modoDeOperacao` é
          // `string | undefined`, e "não declarou" tem uma forma só do lado de cá.
          modoDeOperacao: salva.modoDeOperacao ?? undefined,
          variantes: salva.variantes,
          leiturasDispensadas: salva.leiturasDispensadas,
          cenariosDeLentidao: salva.cenariosDeLentidao,
        });
        setQuebraId(salva.id);
        setStatus("salvo");
      } catch {
        setStatus("erro");
      }
    },
    [aoAbrir]
  );

  const nova = useCallback(
    (base: Quebra) => {
      setQuebraId(null);
      setStatus("sem-arquivo");
      aoAbrir(base);
    },
    [aoAbrir]
  );

  // Autosave só depois da quebra já ter sido salva ao menos uma vez (tem id do
  // servidor) — sem isso, cada tecla criaria uma quebra nova em duplicata.
  /**
   * SPEC-72 fatia B — o que está pendente quando a aba fecha.
   *
   * O `clearTimeout` do cleanup cancela o salvamento a cada tecla, que é o
   * objetivo do debounce. Mas fechar a aba com o timer armado **perde os
   * últimos 2 s de trabalho, sem aviso** — e o campo mais afetado é justamente
   * o que o usuário citou no pedido: o contexto da demanda, digitado em prosa
   * longa.
   *
   * O timer vivia dentro do efeito, então não havia o que disparar de fora.
   * Estes dois refs são o que torna o flush possível: o relógio, para saber se
   * há algo pendente, e a quebra do momento, porque o listener é registrado uma
   * vez e não pode ficar preso à renderização em que nasceu.
   */
  const relogioDoAutosaveRef = useRef<ReturnType<typeof setTimeout>>();
  const quebraAtualRef = useRef(quebra);
  quebraAtualRef.current = quebra;

  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false;
      return;
    }
    if (!quebraId) return;
    setStatus("nao-salvo");
    relogioDoAutosaveRef.current = setTimeout(() => {
      relogioDoAutosaveRef.current = undefined;
      void salvar(quebra);
    }, 2000);
    return () => clearTimeout(relogioDoAutosaveRef.current);
  }, [quebra, quebraId, salvar]);

  /**
   * SPEC-72 fatia B — salvar o pendente ao sair.
   *
   * **Os dois eventos, com a mesma função** (§6.2 da SPEC): `beforeunload` é
   * menos confiável em móvel, onde a aba costuma ser descartada sem ele;
   * `visibilitychange` cobre "trocou de aba" e o descarte que vem depois. O
   * custo de ter os dois é um listener, e o de ter só um é perder trabalho no
   * ambiente que o outro cobria.
   *
   * Registrado uma vez, e lendo tudo por ref: reassinar a cada mudança da
   * quebra trocaria os listeners a cada tecla, que é justamente a frequência
   * que o debounce existe para evitar.
   */
  useEffect(() => {
    const gravarPendente = () => {
      if (!relogioDoAutosaveRef.current) return;
      clearTimeout(relogioDoAutosaveRef.current);
      relogioDoAutosaveRef.current = undefined;
      void salvar(quebraAtualRef.current);
    };
    const aoEsconder = () => {
      // Só quando a aba REALMENTE some. `visible` acontece o tempo todo (voltar
      // do alt-tab), e salvar ali seria transformar troca de janela em escrita.
      if (document.visibilityState === "hidden") gravarPendente();
    };

    window.addEventListener("beforeunload", gravarPendente);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("beforeunload", gravarPendente);
      document.removeEventListener("visibilitychange", aoEsconder);
    };
  }, [salvar]);

  return {
    lista,
    quebraId,
    abrirPorId,
    nova,
    salvar: () => salvar(quebra),
    status,
  };
}

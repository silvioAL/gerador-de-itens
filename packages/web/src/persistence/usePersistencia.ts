import { useCallback, useEffect, useRef, useState } from "react";
import type { Quebra } from "@gerador/engine";
import { apiQuebras, type QuebraResumo } from "../api/client";

export type StatusPersistencia = "sem-arquivo" | "salvo" | "salvando" | "nao-salvo" | "erro";

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

  const salvar = useCallback(
    async (q: Quebra) => {
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
        aoAbrir({ time: salva.time ?? undefined, diagrama: salva.diagrama });
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
  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false;
      return;
    }
    if (!quebraId) return;
    setStatus("nao-salvo");
    const timer = setTimeout(() => {
      void salvar(quebra);
    }, 2000);
    return () => clearTimeout(timer);
  }, [quebra, quebraId, salvar]);

  return {
    lista,
    quebraId,
    abrirPorId,
    nova,
    salvar: () => salvar(quebra),
    status,
  };
}

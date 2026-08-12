import { useState } from "react";
import type { Quebra } from "@gerador/engine";
import type { Cenario } from "./scenarios";
import type { AbaConfig } from "../config/ConfigScreen";

export interface PassoTour {
  selector: string | null;
  titulo: string;
  texto: string;
  onEnter?: () => void;
  /** Piso de duração (ms) pra demonstração automática (useAutoDemo.ts) — usado
   * quando o passo hospeda uma animação própria (ex.: o terminal digitando)
   * que pode levar mais tempo que o cálculo padrão baseado no tamanho do texto. */
  duracaoMinima?: number;
}

export interface UseTourOpts {
  cenarios: Cenario[];
  carregarCenario: (q: Quebra) => void;
  selecionarNo: (id: string | null) => void;
  derivarQuebra: () => void;
  fecharRevisao: () => void;
  abrirConfigNaAba: (aba: AbaConfig) => void;
  fecharJornada: () => void;
  fecharConfig: () => void;
}

export function useTour(opts: UseTourOpts) {
  const [passoIndice, setPassoIndice] = useState<number | null>(null);
  const cenarioTour = opts.cenarios.find((c) => c.id === "mongo");

  const passos: PassoTour[] = [
    {
      selector: null,
      titulo: "Bem-vindo",
      texto:
        "Este tour usa um cenário pronto (Catálogo) para mostrar o fluxo completo: diagrama → prontidão → derivação → revisão → especificação de solução → configurações. São 11 passos rápidos.",
      onEnter: () => {
        opts.fecharRevisao();
        opts.selecionarNo(null);
        if (cenarioTour) opts.carregarCenario(cenarioTour.quebra);
      },
    },
    {
      selector: ".react-flow",
      titulo: "O diagrama",
      texto:
        "Um serviço novo escrevendo numa coleção Mongo nova. Cada nó já foi preenchido e ficou verde — pronto para virar item de trabalho.",
    },
    {
      selector: "[data-tour=readiness-summary]",
      titulo: "Prontidão",
      texto:
        "Esse resumo conta quantos nós estão vermelho, amarelo ou verde. Vermelho bloqueia a derivação — aqui os dois já estão verdes.",
    },
    {
      selector: "[data-tour=properties-panel]",
      titulo: "Proveniência",
      texto:
        "Ao selecionar um nó, o painel mostra os campos do tipo — e a proveniência de cada valor: manual, extraído, inferido ou sugerido.",
      onEnter: () => opts.selecionarNo("n2"),
    },
    {
      selector: "[data-tour=derivar-button]",
      titulo: "Derivar",
      texto:
        "Com tudo verde, o botão libera. Ele roda um motor determinístico — não uma IA — que sempre produz os mesmos itens para o mesmo diagrama.",
    },
    {
      selector: "[data-tour=review-table]",
      titulo: "Revisão",
      texto:
        "Os itens chegam com dependências reais, calculadas a partir das arestas. Qualquer ciclo ou conflito apareceria aqui, nunca escondido.",
      onEnter: () => opts.derivarQuebra(),
    },
    {
      selector: "[data-tour=export-buttons]",
      titulo: "Especificação de solução",
      texto:
        "Expanda qualquer item da lista pra ver a spec técnica completa, o refinamento e os critérios de aceite em Gherkin — sem precisar copiar nada. Quando estiver pronto, um clique gera um único markdown com tudo, pensado pra ser o input de outro agente (ex.: o que sobe os itens pro sistema de tracking do time).",
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Perfis de stack",
      texto:
        'Um time pode ter uma stack conhecida (linguagem, framework...) que pré-preenche sugestões em campos novos — sem reconfigurar toda vez que desenhar um serviço. Configure ou corrija um valor aqui, ou capture direto de um nó real com o botão "salvar como padrão do time" no painel de propriedades.',
      onEnter: () => opts.abrirConfigNaAba("perfis"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Padrões por componente",
      texto:
        'Cada tipo de nó já vem com campos padrão (ex.: nome do tópico, DLQ) — "sobrescrever" cria uma versão específica pro seu time (ex.: um sufixo obrigatório de nomenclatura), e "+ Adicionar campo" cria um campo novo do zero.',
      onEnter: () => opts.abrirConfigNaAba("campos"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Modelo da especificação de solução",
      texto:
        "O documento final segue um modelo com seções fixas (Contexto, Visão geral, Itens, Definition of Ready/Done) — customize o texto ao redor dos itens aqui, global ou só pro seu time.",
      onEnter: () => opts.abrirConfigNaAba("especificacao"),
    },
    {
      selector: null,
      titulo: "Fim do tour",
      texto: "Você pode reabrir isso, ou carregar outro cenário, pelo botão ✦ Como funciona & cenários.",
      onEnter: () => opts.fecharConfig(),
    },
  ];

  function iniciar() {
    setPassoIndice(0);
    passos[0].onEnter?.();
  }

  function proximo() {
    setPassoIndice((atual) => {
      if (atual === null) return null;
      const proximoIndice = atual + 1;
      if (proximoIndice >= passos.length) {
        opts.fecharRevisao();
        return null;
      }
      passos[proximoIndice].onEnter?.();
      return proximoIndice;
    });
  }

  function pular() {
    opts.fecharJornada();
    setPassoIndice(null);
  }

  return {
    ativo: passoIndice !== null,
    passoAtual: passoIndice !== null ? passos[passoIndice] : null,
    indice: passoIndice ?? 0,
    total: passos.length,
    ultimo: passoIndice === passos.length - 1,
    iniciar,
    proximo,
    pular,
  };
}

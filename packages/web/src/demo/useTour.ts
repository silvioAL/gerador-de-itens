import { useState } from "react";
import type { Quebra } from "@gerador/engine";
import type { Cenario } from "./scenarios";
import type { AbaConfig } from "../config/ConfigScreen";

export interface PassoTour {
  selector: string | null;
  titulo: string;
  texto: string;
  onEnter?: () => void;
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
        "Este tour usa um cenário pronto (Catálogo) para mostrar o fluxo completo: diagrama → prontidão → derivação → revisão → exportação. São 8 passos rápidos.",
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
        "Um serviço novo escrevendo numa coleção Mongo nova. Cada nó já foi preenchido e ficou verde — pronto para virar backlog.",
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
        "Com tudo verde, o botão libera. Ele roda um motor determinístico — não uma IA — que sempre produz o mesmo backlog para o mesmo diagrama.",
    },
    {
      selector: "[data-tour=review-table]",
      titulo: "Revisão",
      texto:
        "As atividades chegam com dependências reais, calculadas a partir das arestas. Qualquer ciclo ou conflito apareceria aqui, nunca escondido.",
      onEnter: () => opts.derivarQuebra(),
    },
    {
      selector: "[data-tour=export-buttons]",
      titulo: "Saídas",
      texto:
        'Cada formato serve para algo diferente: .md pra colar num doc de planejamento, e "Especificação de entrega" gera o documento único da quebra inteira — spec técnica completa de cada item, refinamento, critérios de aceite em Gherkin, DoR/DoD.',
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Perfis de time",
      texto:
        'Um time pode ter uma stack conhecida (linguagem, framework...) que pré-preenche sugestões em campos novos — sem reconfigurar toda vez que desenhar um serviço. Configure ou corrija um valor aqui, ou capture direto de um nó real com o botão "salvar como padrão do time" no painel de propriedades.',
      onEnter: () => opts.abrirConfigNaAba("perfis"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Referências de código",
      texto:
        "Uma biblioteca de trechos de código reais guardados como referência — não é extraído automaticamente, é você que decide o que entra e escreve por quê. Alimenta o vocabulário de padrões que a ferramenta usa.",
      onEnter: () => opts.abrirConfigNaAba("referencias"),
    },
    {
      selector: null,
      titulo: "Linha de comando",
      texto:
        "Tudo isso também roda fora do browser: `npm install -g gerador-de-itens` instala o CLI; `gerador init` cria um config/ de exemplo; `gerador derive quebra.json --out backlog.md` gera o backlog; `gerador implementar quebra.json --out especificacao.md` gera a especificação de entrega inteira; `gerador export-vault --abrir` materializa referências e padrões como notas Obsidian. Todo comando é 100% local, sem servidor.",
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

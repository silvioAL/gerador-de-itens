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
  /** SPEC-48 — a tela dos itens escritos (o tour não a conhecia). */
  abrirItens: () => void;
  /** Volta ao canvas: os passos de configuração vêm depois dela. */
  fecharItens: () => void;
  /** SPEC-57 fatia A — abre o painel onde o PROPÓSITO da demanda vive
   * (📎 Contexto do épico). `null` fecha: os passos seguintes usam o painel de
   * propriedades, e a janela flutuante ficaria por cima dele. */
  abrirProposito: () => void;
  fecharAssistente: () => void;
  /** §235 — os três buracos de espinha: a porta de entrada (conversa), o
   * contexto de negócio (produto) e o fim da cadeia (exportação). */
  abrirConversa: () => void;
  ligarDemonstracao: (ligada: boolean) => void;
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
        "Este tour usa um cenário pronto (Catálogo) e percorre o caminho inteiro: desenhar → derivar → revisar → escrever os itens → gerar o documento → e o que fica configurado por trás disso. O contador aqui em cima diz onde você está.",
      onEnter: () => {
        opts.fecharRevisao();
        opts.selecionarNo(null);
        if (cenarioTour) opts.carregarCenario(cenarioTour.quebra);
      },
    },
    {
      selector: "[data-testid=assistente-janela]",
      titulo: "Começar conversando",
      texto:
        "A porta de entrada não é arrastar caixa: você descreve a demanda — por texto, voz ou um print de lousa — e o agente propõe os componentes USANDO OS TIPOS que este projeto tem configurados. Nada é aplicado sozinho: a proposta vem com o motivo de cada peça, e você decide. Este desenho na mesa nasceu da conversa ao lado.",
      onEnter: () => {
        // Ligar aqui, e não só no passo do produto: a conversa de demonstração
        // é o primeiro dado falso que o tour mostra.
        opts.ligarDemonstracao(true);
        opts.abrirConversa();
      },
    },
    {
      selector: ".react-flow",
      titulo: "O diagrama",
      onEnter: () => opts.fecharAssistente(),
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
      // SPEC-57 fatia A — o elo da frente da cadeia. Vem logo depois da
      // prontidão porque é a MESMA barra: propósito é outra dimensão da
      // mesma medida, não uma tela à parte.
      selector: "[data-testid=proposito-resumo]",
      titulo: "Para que serve cada componente",
      texto:
        "Além de \"o que falta preencher\", a mesa mede \"para que isto existe\". Cada necessidade da demanda é ligada ao componente que responde por ela — e o que fica sem ninguém aparece aqui como lacuna, antes de virar item. Neste desenho, duas estão cobertas e uma não: repare que a lacuna AVISA, não bloqueia derivar.",
      onEnter: () => opts.abrirProposito(),
    },
    {
      selector: "[data-tour=properties-panel]",
      titulo: "Proveniência",
      texto:
        "Ao selecionar um nó, o painel mostra os campos do tipo — e a proveniência de cada valor: manual, extraído, inferido ou sugerido. É a mesma régua do propósito: o que o agente sugere não conta até alguém confirmar.",
      onEnter: () => {
        opts.fecharAssistente();
        opts.selecionarNo("n2");
      },
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
      selector: "[data-testid=barra-pendencias]",
      titulo: "Confirmar o que a IA escreveu",
      texto:
        "Quando a esteira escreve, cada resposta espera a sua assinatura. Esta barra diz quantas estão esperando e permite confirmar TODAS de uma vez — ou revisar uma a uma, no modo foco. Aceitar é barato; corrigir é que merece o clique.",
    },
    {
      selector: "[data-testid=abrir-conversa-especificacao]",
      titulo: "Especificação de solução",
      texto:
        "O documento final sai pelo AGENTE: com tudo refinado ele oferece sozinho (balão), e a qualquer momento o balão \"gerar especificação\" baixa o markdown — mesmo parcial. Cada item do documento cita a necessidade que atende: é assim que o propósito declarado lá no começo chega até quem vai implementar.",
    },
    {
      selector: "[data-testid=corpo-dos-itens]",
      titulo: "Itens escritos",
      texto:
        "Além do documento, o assistente gera os ITENS um a um — cada card traz a escrita final, o que falta especificar e o que fica pronto quando ele termina (a entrega final). É o que vai virar issue no seu tracker.",
      onEnter: () => opts.abrirItens(),
    },
    {
      selector: "[data-tour=menu-botao]",
      titulo: "O menu",
      texto:
        "Tudo que é administração mora no menu ☰ — padrões do time, pessoas e acessos, IA. Cada item abre uma tela própria, com endereço: dá pra voltar por F5 ou colar o link. Os próximos passos abrem algumas delas.",
      onEnter: () => opts.fecharItens(),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Contexto do produto",
      texto:
        "A ferramenta sabia tecnologia e processo, e não sabia DE QUE PRODUTO a demanda falava. O que estiver aqui — objetivo, quem usa, regras, glossário — viaja junto com toda demanda ligada a este produto, e é o que separa um item tecnicamente correto de um item que entende o negócio. É o par do propósito: lá o \"para quê\", aqui o \"de que negócio\".",
      onEnter: () => {
        opts.ligarDemonstracao(true);
        opts.abrirConfigNaAba("produtos");
      },
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Stacks conhecidas",
      texto:
        'A stack é um perfil do CATÁLOGO ("Java + Spring Boot", "Node"...) e o time aponta um — trocar de tecnologia é trocar o ponteiro. Os valores do perfil apontado pré-preenchem sugestões em campos novos; dá pra capturar direto de um nó real com "salvar como padrão do time" no painel.',
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
      titulo: "Níveis e acessos",
      texto:
        "Cada membro do time tem um nível: visualizar (lê as quebras), operar (cria, deriva e refina) e owner (configurações e membros). Qualquer um convida até o próprio nível — ninguém escala privilégio. Na aba Acessos, papéis delegam configuração a setores (ex.: Arquitetura no pipeline) e podem ser portados por um TIME inteiro: os owners herdam, e a permissão acompanha a composição.",
      onEnter: () => opts.abrirConfigNaAba("membros"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Modelos: documento e item",
      texto:
        "São dois modelos: o do DOCUMENTO (Contexto, Visão geral, Itens, Definition of Ready/Done) e o de CADA ITEM — onde se decide a ordem das seções e o que fecha o item, a entrega final. Global, ou só pro seu time.",
      onEnter: () => opts.abrirConfigNaAba("especificacao"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Do item à issue",
      texto:
        "O último elo: os itens prontos são enviados para um AGENTE que fala com o seu tracker (MCP, n8n, uma função interna — o que a empresa já tiver). O gerador não implementa Jira de propósito: implementar um tracker seria escolher o tracker de todo mundo. Falha é por item, e reexportar não duplica.",
      onEnter: () => opts.abrirConfigNaAba("exportacao"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Melhoria contínua (PDCA)",
      texto:
        "Depois de gerar, o assistente pergunta o que faltou ou sobrou. O que as pessoas respondem aparece aqui: vira sugestão de ajuste, você vê o efeito num item de exemplo antes de decidir, aprova — e a configuração muda de verdade, com registro de quem aplicou.",
      onEnter: () => opts.abrirConfigNaAba("pdca"),
    },
    {
      selector: null,
      titulo: "Fim do tour",
      texto: "Dá pra rever isto em ▶ Demonstração & tour, ou carregar outro desenho em ✦ Cenários prontos — os dois botões ficam sempre no topo.",
      onEnter: () => {
        // Desligar é obrigatório: dado de demonstração que sobrevive ao tour
        // vira configuração fantasma na tela de quem for usar de verdade.
        opts.ligarDemonstracao(false);
        opts.fecharConfig();
      },
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

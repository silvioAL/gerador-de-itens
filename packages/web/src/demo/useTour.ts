import { useEffect, useState } from "react";
import type { Quebra } from "@gerador/engine";
import type { Cenario } from "./scenarios";
import type { AbaConfig } from "../config/ConfigScreen";

export interface PassoTour {
  selector: string | null;
  titulo: string;
  texto: string;
  onEnter?: () => void;
  /**
   * §252 — quanto tempo este passo fica na tela antes de o tour seguir
   * sozinho. Ausente = `SEGUNDOS_PADRAO`.
   *
   * Não é enfeite: o tour roda sem ninguém clicar, e passo que aparece e some
   * antes de a pessoa entender o que está vendo é pior que passo nenhum. Os
   * que mostram algo acontecendo — a derivação, o documento montado, o agente
   * medindo — ganham mais tempo; os de transição ganham menos.
   */
  segundos?: number;
}

/** Sete segundos lê um parágrafo curto sem pressa. Passo que precisa de mais
 * pede explicitamente — e ter que pedir é o que impede o tour de virar uma
 * sequência de telas paradas. */
export const SEGUNDOS_PADRAO = 7;

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
  /** SPEC-58 — o documento de desenho (`#/documento`). */
  abrirDocumento: () => void;
  /** SPEC-59 — a vista de como a ferramenta está montada (`#/sistema`). */
  abrirSistema: () => void;
  /** §261 — abre o reconhecimento do que fica para trás. O tour deriva por um
   * atalho próprio (`derivarQuebra`), então precisa pedir o diálogo de forma
   * explícita — senão o passo apontaria para algo que nunca aparece. */
  mostrarAvisos: () => void;
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

/**
 * §236 — os passos do PRODUTO: o que a ferramenta faz, do desenho ao item.
 *
 * Separado dos passos de CONFIGURAÇÃO para o primeiro tour continuar
 * respondendo "isto serve pra quê?" em vez de virar 25 passos onde metade é
 * tela de administração. Quem está avaliando a ferramenta quer o primeiro;
 * quem já decidiu usar quer o segundo.
 */
export function passosDoProduto(opts: UseTourOpts): PassoTour[] {
  const cenarioTour = opts.cenarios.find((c) => c.id === "mongo");
  return [
    {
      selector: null,
      titulo: "Bem-vindo",
      segundos: 6,
      texto:
        "Este tour usa um cenário pronto (Catálogo) e percorre o caminho inteiro: desenhar → derivar → revisar → escrever os itens → gerar o documento → e o que fica configurado por trás disso. O contador aqui em cima diz onde você está.",
      onEnter: () => {
        opts.fecharRevisao();
        opts.selecionarNo(null);
        if (cenarioTour) opts.carregarCenario(cenarioTour.quebra);
      },
    },
    {
      // §255 — o motor explicado ANTES de qualquer tela. Sem isto, o tour
      // mostrava o que a ferramenta faz sem nunca dizer QUEM faz — e a divisão
      // entre o que o motor calcula e o que a IA escreve é a tese do produto.
      selector: null,
      titulo: "Quem faz o quê",
      segundos: 11,
      texto:
        "Duas partes trabalham aqui, e a divisão é a ideia toda. O MOTOR calcula: lê o seu desenho e a configuração do time, mede o que está pronto e o que sai do padrão, e deriva os itens com as dependências. Ele não conversa com IA nem vai à rede — mesmo desenho, mesmos itens, sempre. A IA escreve: a história do item, os critérios, o porquê de uma proposta. Nunca o contrário. E nada que ela propõe conta antes de você confirmar.",
    },
    {
      selector: "[data-testid=assistente-janela]",
      titulo: "Começar conversando",
      segundos: 9,
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
      segundos: 8,
      onEnter: () => opts.fecharAssistente(),
      texto:
        "Um serviço novo escrevendo numa coleção Mongo nova. Cada nó já foi preenchido e ficou verde — pronto para virar item de trabalho.",
    },
    {
      selector: "[data-tour=readiness-summary]",
      titulo: "Prontidão",
      segundos: 8,
      texto:
        "Esse resumo conta quantos nós estão vermelho, amarelo ou verde. Vermelho bloqueia a derivação — aqui os dois já estão verdes.",
    },
    {
      // SPEC-57 fatia A — o elo da frente da cadeia. Vem logo depois da
      // prontidão porque é a MESMA barra: propósito é outra dimensão da
      // mesma medida, não uma tela à parte.
      selector: "[data-testid=proposito-resumo]",
      titulo: "Para que serve cada componente",
      segundos: 10,
      texto:
        "Além de \"o que falta preencher\", a mesa mede \"para que isto existe\". Cada necessidade da demanda é ligada ao componente que responde por ela — e o que fica sem ninguém aparece aqui como lacuna, antes de virar item. Neste desenho, duas estão cobertas e uma não: repare que a lacuna AVISA, não bloqueia derivar.",
      onEnter: () => opts.abrirProposito(),
    },
    {
      // §238 — a interação que a fatia D construiu e o tour não mostrava.
      selector: "[data-testid=delta-da-proposta]",
      titulo: "O agente propõe, o motor mede",
      segundos: 12,
      texto:
        "O agente lê o contexto da demanda e propõe propósitos — e nada disso conta ao chegar. Antes de você aceitar, o motor mede a proposta COMO SE aceita e mostra a diferença: aqui, aceitar cria uma lacuna nova, porque a necessidade sugerida ainda não tem componente que responda por ela. É esse trabalho que você precisa ver antes de dizer sim — é o que impede o \"confirmar todas\" de virar um clique automático.",
      onEnter: () => opts.abrirProposito(),
    },
    {
      // §245 — a terceira dimensão da mesma barra: conformidade. Vem depois do
      // propósito porque é a mesma ideia aplicada a outra pergunta — lá "para
      // quê existe", aqui "está dentro do que combinamos".
      selector: "[data-testid=conformidade-resumo]",
      titulo: "O padrão do time, conferido",
      segundos: 12,
      texto:
        "Um padrão escrito em texto é uma opinião que alguém precisa lembrar de conferir. Quando ele vira régua — \"declarar a chave de sharding\", \"timeout ≤ 500ms\" — o motor confere sozinho e diz onde o desenho sai da linha. Clique no ⚖: a lista mostra o que viola, o que se esperava e POR QUE o padrão existe. E aceita ser contrariada: às vezes violar é a decisão certa, e aí ela fica registrada com motivo e autor, sai do amarelo e não vira item.",
      onEnter: () => {
        opts.fecharAssistente();
        opts.selecionarNo(null);
      },
    },
    {
      // §248 — a fatia E: a dimensão que não cabe em nó nenhum. Vem depois da
      // conformidade porque é a mesma pergunta um nível acima: lá "este
      // componente está na linha", aqui "o CAMINHO inteiro está".
      selector: "[data-testid=percursos-resumo]",
      titulo: "O caminho, não só os componentes",
      segundos: 12,
      texto:
        "Cinco saltos de 400ms são cinco componentes dentro do padrão e uma resposta de dois segundos — nenhuma medida por componente vê isso. Clique no 🛣: o motor LEU os caminhos do desenho e está pedindo confirmação, porque inferir é grátis e erra. Nada é medido antes de você confirmar. Depois disso as réguas de caminho valem: soma de timeout, elo mais lento, número de saltos. E se faltar um campo no meio, ele diz \"não dá para medir\" em vez de somar o que existe — meia soma vira um verde falso, que é o pior resultado possível de uma medição.",
      onEnter: () => {
        opts.fecharAssistente();
        opts.selecionarNo(null);
      },
    },
    {
      // §246 — a fatia C: a régua explica por que existe, e a decisão que a
      // contraria também. Vem logo depois da conformidade porque é a mesma
      // frase virada do avesso: lá o padrão cobra, aqui alguém responde.
      selector: "[data-testid=decisoes-resumo]",
      titulo: "Por que este desenho é assim",
      segundos: 11,
      texto:
        "Preencher um campo não é decidir — decidir é escolher ENTRE alternativas. Clique no 🧭: cada decisão guarda a escolhida, o porquê, e o que foi descartado com o custo de cada opção. É o descartado que serve daqui a um ano: sem ele, quem reabrir a decisão troca por algo que já tinha sido rejeitado por um motivo que ninguém escreveu. E note o ⏳: o agente PROPÕE, mas proposta não vale nada até você aceitar — e o porquê passa a ser seu.",
      onEnter: () => {
        opts.fecharAssistente();
        opts.selecionarNo(null);
      },
    },
    {
      // §251 — a proposta do agente aparecia como DADO (o ⏳ na lista), e o
      // ato de pedi-la, não. É a interação que melhor mostra a tese da
      // SPEC-56 §0.7 — o motor mede, o agente explica, a pessoa decide.
      selector: "[data-testid=pedir-decisao-ao-agente]",
      titulo: "Peça ao agente",
      segundos: 10,
      texto:
        "Este botão não pede opinião sobre arquitetura: manda o agente ler o que o MOTOR já mediu — o que está fora do padrão e por quê, as lacunas, o que já foi decidido — e propor o que ainda está em aberto. Toda proposta vem com duas alternativas e o custo de cada uma. E não vale nada até você aceitar: aí o porquê passa a ser seu.",
      onEnter: () => opts.selecionarNo("n1"),
    },
    {
      selector: "[data-tour=properties-panel]",
      titulo: "Proveniência",
      segundos: 8,
      texto:
        "Ao selecionar um nó, o painel mostra os campos do tipo — e a proveniência de cada valor: manual, extraído, inferido ou sugerido. É a mesma régua do propósito: o que o agente sugere não conta até alguém confirmar.",
      onEnter: () => opts.selecionarNo("n2"),
    },
    {
      selector: "[data-tour=derivar-button]",
      titulo: "Derivar",
      segundos: 9,
      texto:
        "Com tudo verde, o botão libera. Ele roda um motor determinístico — não uma IA — que sempre produz os mesmos itens para o mesmo diagrama.",
    },
    {
      // §261 — o passo existe porque o cenário do tour PRODUZ avisos (o padrão
      // que o desenho contraria, a proposta do agente esperando). Escondê-los
      // com um atalho faria a demonstração mostrar um caminho que não é o de
      // quem usa — que é a mentira que o §234 cobrou caro.
      selector: "[data-testid=avisos-da-derivacao]",
      titulo: "O que fica para trás",
      segundos: 11,
      texto:
        "Derivar não é bloqueado por nada disto — os itens saem igual. Mas o que o motor mediu e você não resolveu aparece aqui, uma vez, antes de virar backlog: a necessidade sem dono, o padrão contrariado, o caminho fora da régua, a decisão que o agente propôs e ninguém aceitou. Seguir é um clique. O que não pode é isso acontecer em silêncio.",
      onEnter: () => opts.mostrarAvisos(),
    },
    {
      selector: "[data-tour=review-table]",
      titulo: "Revisão",
      segundos: 10,
      texto:
        "Os itens chegam com dependências reais, calculadas a partir das arestas. Qualquer ciclo ou conflito apareceria aqui, nunca escondido.",
      onEnter: () => opts.derivarQuebra(),
    },
    {
      selector: "[data-testid=barra-pendencias]",
      titulo: "Confirmar o que a IA escreveu",
      segundos: 9,
      texto:
        "Quando a esteira escreve, cada resposta espera a sua assinatura. Esta barra diz quantas estão esperando e permite confirmar TODAS de uma vez — ou revisar uma a uma, no modo foco. Aceitar é barato; corrigir é que merece o clique.",
    },
    {
      // §251 — a tela do documento não existia no tour, e o passo acima ainda
      // descrevia o mundo anterior à SPEC-58 ("baixa o markdown"). Capacidade
      // que o tour não mostra não existe para quem está avaliando (§244).
      selector: "[data-testid=documento-screen]",
      titulo: "O documento de desenho",
      segundos: 14,
      texto:
        "Com tudo refinado o agente oferece este documento sozinho — e ele não é um arquivo que você baixa e perde: tem tela própria, e é o que circula para quem nunca abriu esta ferramenta. Faixa de saúde no topo, o desenho animado junto, as decisões com o que foi descartado. Duas seções que só uma PESSOA escreve, trade-offs e riscos, que a máquina nunca sobrescreve: é onde mora a mudança que não moveu arquitetura. E aprovar guarda uma foto — se o desenho mudar depois, o selo avisa em vez de mentir.",
      onEnter: () => opts.abrirDocumento(),
    },
    {
      selector: "[data-testid=corpo-dos-itens]",
      titulo: "Itens escritos",
      segundos: 10,
      texto:
        "Além do documento, o assistente gera os ITENS um a um — cada card traz a escrita final, o que falta especificar e o que fica pronto quando ele termina (a entrega final). É o que vai virar issue no seu tracker.",
      onEnter: () => opts.abrirItens(),
    },
    {
      selector: "[data-tour=menu-botao]",
      titulo: "O menu",
      segundos: 7,
      texto:
        "Tudo que é administração mora no menu ☰ — padrões do time, pessoas e acessos, IA. Cada item abre uma tela própria, com endereço: dá pra voltar por F5 ou colar o link. É o assunto do outro tour, o de configuração.",
      onEnter: () => opts.fecharItens(),
    },
    {
      selector: null,
      titulo: "Fim do tour",
      segundos: 9,
      texto:
        "Este tour respondeu \"serve pra quê\": do desenho medido ao item escrito, passando pelo documento. O que se MOLDA pro seu time — produto, stacks, padrões, IA, pessoas, exportação, melhoria contínua — é o outro tour, o de configuração, em ▶ Como funciona.",
      onEnter: () => {
        // Desligar é obrigatório: dado de demonstração que sobrevive ao tour
        // vira configuração fantasma na tela de quem for usar de verdade.
        opts.ligarDemonstracao(false);
        opts.fecharConfig();
      },
    },
  ];
}

/**
 * §236 — os passos de CONFIGURAÇÃO: o que se molda para o time.
 *
 * Quatro telas que o tour do produto não alcançava (medido no §234) e que não
 * cabiam nele sem diluí-lo. Todas leem config que já vem preenchida no
 * projeto, então nenhuma precisa de dado de demonstração — diferente das três
 * do §235.
 */
export function passosDeConfiguracao(opts: UseTourOpts): PassoTour[] {
  return [
    {
      selector: null,
      titulo: "Moldar pro seu time",
      texto:
        "O outro tour mostra o que a ferramenta FAZ. Este mostra o que ela aprende do seu time: de onde vem a IA, quem escreve cada parte do item, quais perguntas cada tecnologia obriga e o que uma conexão precisa declarar. Nada aqui é obrigatório para usar — é o que faz o resultado parecer escrito por vocês.",
      onEnter: () => opts.fecharRevisao(),
    },
    {
      // §258 — a vista antes das telas. O tour de configuração percorre onze
      // telas e nunca mostrava como elas se ligam; quem chega aqui vê primeiro
      // o mapa, e depois cada peça dele.
      selector: "[data-testid=sistema-screen]",
      titulo: "Como a ferramenta está montada",
      segundos: 13,
      texto:
        "Antes das telas, o mapa. De um lado o que o MOTOR confere — as regras por tecnologia e as réguas de caminho. Do outro, quem ESCREVE cada parte do item: a esteira, em sequência, com o estado de cada agente (um papel ativo sem modelo configurado é o defeito mais silencioso que existe aqui). Os dois produzem o item, e o que o time responde depois volta a mudar os dois: é o laço do PDCA, que dá nome ao ciclo e não aparecia em tela nenhuma. Esta vista não edita — cada bloco leva à tela que edita.",
      onEnter: () => opts.abrirSistema(),
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
      titulo: "Campos por tipo de conexão",
      texto:
        "A conexão também carrega decisão, não é só uma seta: uma chamada síncrona precisa de timeout e retry; um evento precisa de contrato e de garantia de entrega. Campos declarados aqui aparecem no painel da aresta e viram item, do mesmo jeito que os do componente.",
      onEnter: () => opts.abrirConfigNaAba("camposAresta"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Regras de refinamento",
      texto:
        "O que cada tecnologia OBRIGA a decidir: uma fila pede DLQ, retry e idempotência; uma coleção pede índices e write concern. É daqui que sai o checklist técnico de cada item — e é o que transforma \"criar uma fila\" numa lista de decisões que alguém precisa tomar antes de codar.",
      onEnter: () => opts.abrirConfigNaAba("regras"),
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
      titulo: "Modelo de IA",
      texto:
        "A ferramenta não embute modelo: ela fala com um endereço compatível com a API da OpenAI — o Claude, um gateway corporativo, ou um container rodando ao lado sem nada sair da sua rede. Aqui se configura qual, e o \"testar conexão\" responde o que o gateway disse, em vez de um erro genérico de rede.",
      onEnter: () => opts.abrirConfigNaAba("modeloIa"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Esteira de agentes",
      texto:
        "Quem escreve o quê. Cada papel — PO, Arquiteto, Especialista técnico, QA — preenche uma parte do item, na ordem definida aqui. Tudo o que eles escrevem entra como SUGESTÃO e espera confirmação: é a mesma régua do propósito e da proveniência, aplicada ao texto.",
      onEnter: () => opts.abrirConfigNaAba("pipeline"),
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
      titulo: "Fim",
      texto:
        "Isto é o que se molda. O outro tour — ▶ Iniciar tour guiado — mostra o caminho completo de uma demanda, do desenho ao item escrito.",
      onEnter: () => {
        // §252 — os passos de produto/stacks migraram para cá e trouxeram o
        // `ligarDemonstracao(true)` junto. Desligar aqui é obrigatório pelo
        // mesmo motivo de sempre: dado de demonstração que sobrevive ao tour
        // vira configuração fantasma na tela de quem for usar de verdade.
        opts.ligarDemonstracao(false);
        opts.fecharConfig();
      },
    },
  ];
}

/**
 * §252 — o tour ANDA SOZINHO.
 *
 * A demonstração automática existiu e foi removida no §243, porque ela e o
 * tour faziam a mesma coisa por dois caminhos. Isto não a traz de volta: traz
 * o COMPORTAMENTO dela para dentro do único mecanismo que sobrou. Continua
 * havendo um tour só — ele é que passou a avançar sem depender de clique.
 *
 * Três decisões que fazem isso não irritar:
 *
 * - **"Próximo" continua existindo.** Quem quer correr, corre; quem quer
 *   parar, para. Automático que sequestra o controle é pior que manual;
 * - **pausa de verdade, com botão** — e o tempo do passo recomeça ao despausar,
 *   em vez de o passo sumir um segundo depois de a pessoa voltar;
 * - **cada passo diz quanto quer durar.** Um passo de transição não merece o
 *   mesmo tempo que a tela do documento montado.
 */
export function useTour(opts: UseTourOpts, montarPassos: (o: UseTourOpts) => PassoTour[] = passosDoProduto) {
  const [passoIndice, setPassoIndice] = useState<number | null>(null);
  const [pausado, setPausado] = useState(false);
  /**
   * §252 — SEGURAR o relógio é diferente de PAUSAR.
   *
   * Pausar é ato da pessoa e tem botão. Segurar é o ponteiro em cima da carta:
   * quem levou o mouse até o texto está lendo, e a tela trocar debaixo do
   * cursor é a coisa mais irritante que uma demonstração automática faz.
   *
   * Precisam ser dois estados, e não um: com um só, mover o mouse até o botão
   * de pausa já pausava, e o clique DESPAUSAVA — o botão não funcionava, e
   * pelo motivo mais difícil de enxergar.
   */
  const [segurado, setSegurado] = useState(false);
  const passos = montarPassos(opts);

  function iniciar() {
    setPausado(false);
    setSegurado(false);
    setPassoIndice(0);
    passos[0].onEnter?.();
  }

  /**
   * §253 — ACHADO REAL: **toda** saída do tour desliga a demonstração.
   *
   * Antes isso morava no `onEnter` do último passo, o que só cobria quem
   * chegasse até o fim. Quem PULAVA saía com a demonstração ligada — e o dado
   * de demonstração continuava na tela de uma sessão real. O sintoma que o
   * usuário viu: um chip "1 a decidir" que não sumia nunca, porque a proposta
   * era do tour e o aceite grava em `quebra.decisoes`, onde ela não existe.
   *
   * A garantia é da SAÍDA, não de um passo. Passo pode não ser alcançado;
   * saída sempre acontece.
   */
  function encerrar() {
    opts.ligarDemonstracao(false);
    setPassoIndice(null);
  }

  function proximo() {
    setPassoIndice((atual) => {
      if (atual === null) return null;
      const proximoIndice = atual + 1;
      if (proximoIndice >= passos.length) {
        opts.fecharRevisao();
        opts.ligarDemonstracao(false);
        return null;
      }
      passos[proximoIndice].onEnter?.();
      return proximoIndice;
    });
  }

  function pular() {
    opts.fecharJornada();
    encerrar();
  }

  const passoAtual = passoIndice !== null ? passos[passoIndice] : null;
  const duracao = (passoAtual?.segundos ?? SEGUNDOS_PADRAO) * 1000;

  useEffect(() => {
    if (passoIndice === null || pausado || segurado) return;
    const id = setTimeout(proximo, duracao);
    return () => clearTimeout(id);
    // `passoIndice` na lista é o que faz o relógio REINICIAR a cada passo — e
    // `pausado` é o que o faz recomeçar do zero ao despausar, em vez de o
    // passo sumir um segundo depois de a pessoa voltar a olhar.
  }, [passoIndice, pausado, segurado, duracao]);

  return {
    ativo: passoIndice !== null,
    passoAtual,
    indice: passoIndice ?? 0,
    total: passos.length,
    ultimo: passoIndice === passos.length - 1,
    pausado,
    segurado,
    duracao,
    alternarPausa: () => setPausado((p) => !p),
    segurar: setSegurado,
    iniciar,
    proximo,
    pular,
  };
}

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
  /**
   * SPEC-58 — o documento de desenho (`#/documento`).
   *
   * SPEC-61 §6.3 — `abrirItens`/`fecharItens` viraram este. O passo "Itens
   * escritos" apontava para `#/itens`, e passo que aponta para tela que não
   * existe quebra a demonstração inteira no meio. Como o documento agora
   * mostra os itens numa seção, quem abre o documento já abre os itens — e por
   * isso a ESCRITA deles acontece aqui (ver `App.tsx`): sem ela, o passo
   * prometeria cards e mostraria "ainda não escrito", que é o defeito do §234
   * de volta.
   */
  abrirDocumento: () => void;
  /** SPEC-59 — a vista de como a ferramenta está montada (`#/sistema`). */
  abrirSistema: () => void;
  /** §261 — abre o reconhecimento do que fica para trás. O tour deriva por um
   * atalho próprio (`derivarQuebra`), então precisa pedir o diálogo de forma
   * explícita — senão o passo apontaria para algo que nunca aparece. */
  mostrarAvisos: () => void;
  /** SPEC-57 fatia A — abre o painel onde o PROPÓSITO da demanda vive
   * (📎 Contexto da demanda). `null` fecha: os passos seguintes usam o painel de
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
      /**
       * SPEC-78 — DOIS passos viraram um.
       *
       * "Quem faz o quê" afirmava a divisão (motor calcula, IA escreve) e "O
       * motor, por dentro" mostrava a conta — 11 s + 16 s de explicação antes
       * de a pessoa ver qualquer coisa acontecer. Depois da SPEC-76, a landing
       * já carrega essa explicação, com o ciclo e o centro contido; repeti-la
       * aqui é gastar o momento em que a atenção é maior dizendo o que já foi
       * dito.
       *
       * O que o tour faz melhor que a landing é MOSTRAR — então o passo afirma
       * a tese em duas frases e vai direto para a conta real, com a régua do
       * time de quem assiste.
       */
      selector: "[data-testid=motor-passo-a-passo]",
      titulo: "Quem faz o quê",
      // A animação dá uma volta completa em ~6,5 s; este passo mostra duas.
      segundos: 16,
      texto:
        "Duas partes trabalham aqui, e a divisão é a ideia toda. O MOTOR calcula — lê o seu desenho e a configuração do time, mede o que está pronto e o que sai do padrão, e deriva os itens com as dependências. A IA escreve o texto, e nada que ela propõe conta antes de você confirmar. Esta é a conta inteira, com uma régua do SEU time: o campo preenchido, a régua que alguém escreveu, a comparação, e o item que sai dela. Quatro elos, nenhum com IA no meio — por isso o mesmo desenho dá sempre os mesmos itens.",
      onEnter: () => {
        // Primeiro passo a mostrar dado de demonstração: a marca liga aqui
        // (§235), porque o time de quem assiste pode não ter régua conferível
        // nenhuma, e "não há o que explicar" no meio da explicação não ensina.
        opts.ligarDemonstracao(true);
        opts.abrirSistema();
      },
    },
    {
      selector: "[data-testid=assistente-janela]",
      titulo: "Começar conversando",
      segundos: 9,
      texto:
        "A porta de entrada não é arrastar caixa: você descreve a demanda — por texto, voz ou um print de lousa — e o agente propõe os componentes USANDO OS TIPOS que este projeto tem configurados. Nada é aplicado sozinho: a proposta vem com o motivo de cada peça, e você decide. Este desenho na mesa nasceu da conversa ao lado. E o ✦ no canto acompanha você em qualquer tela: é por ele que se volta a chamar o agente.",
      onEnter: () => {
        // §268 — voltar do mapa: o passo anterior saiu do canvas, e a conversa
        // aparece por cima dele. Sem isto o passo apontaria para uma janela que
        // não está na tela que está aberta.
        opts.fecharConfig();
        // Continua ligada (o passo do motor já ligou): a conversa é dado de
        // demonstração também, e quem chega aqui por outro caminho precisa da
        // marca do mesmo jeito.
        opts.ligarDemonstracao(true);
        opts.abrirConversa();
      },
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
        "Cinco saltos de 400ms são cinco componentes dentro do padrão e uma resposta de dois segundos — nenhuma medida por componente vê isso. Clique no 🛣: o motor LEU os caminhos do desenho e está pedindo confirmação, porque inferir é grátis e erra. Nada é medido antes de você confirmar. Depois disso as réguas de caminho valem: soma de timeout, elo mais lento, número de saltos. E antes de confirmar, ele diz o preço: \"itens no backlog 4 → 5\" — porque confirmar um caminho fora da régua CRIA trabalho, e você decide sabendo disso. Se faltar um campo no meio, ele diz \"não dá para medir\" em vez de somar o que existe — meia soma vira um verde falso, que é o pior resultado possível de uma medição.",
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
        "Preencher um campo não é decidir — decidir é escolher ENTRE alternativas. Clique no 🧭: cada decisão guarda a escolhida, o porquê, e o que foi descartado com o custo de cada opção. É o descartado que serve daqui a um ano: sem ele, quem reabrir a decisão troca por algo que já tinha sido rejeitado por um motivo que ninguém escreveu. E note o ⏳: o agente PROPÕE, mas proposta não vale nada até você aceitar — e o porquê passa a ser seu. E dá para pedir ao agente que proponha as decisões que faltam: ele lê o desenho MEDIDO — as violações e as lacunas — e propõe; nada conta antes de você aceitar.",
      onEnter: () => {
        opts.fecharAssistente();
        opts.selecionarNo(null);
      },
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
      selector: "[data-testid=barra-pendencias]",
      titulo: "Confirmar o que a IA escreveu",
      segundos: 10,
      texto:
        "A revisão é a tela onde o item vira ficha, e onde a esteira escreve. Cada resposta dela espera a sua assinatura: esta barra diz quantas estão esperando e permite confirmar TODAS de uma vez — ou revisar uma a uma, no modo foco. Aceitar é barato; corrigir é que merece o clique. E o que você confirmar continua marcado como escrito pelo agente.",
      /**
       * SPEC-78 — este `onEnter` era do passo "Revisão", que morreu por apontar
       * uma tela em vez de ensinar o que se faz nela.
       *
       * Cortá-lo levou a DERIVAÇÃO junto, e a suíte pegou na hora: sem isto o
       * tour chegava à barra de pendências de um item que nunca foi derivado.
       * Foi o teste que estava certo, e a poda que estava errada — é
       * exatamente o trabalho que a fatia D existe para fazer.
       */
      onEnter: () => opts.derivarQuebra(),
    },
    {
      // §251 — a tela do documento não existia no tour, e o passo acima ainda
      // descrevia o mundo anterior à SPEC-58 ("baixa o markdown"). Capacidade
      // que o tour não mostra não existe para quem está avaliando (§244).
      selector: "[data-testid=documento-screen]",
      titulo: "O documento de desenho",
      segundos: 14,
      texto:
        "Com tudo refinado o agente oferece este documento sozinho — e ele não é um arquivo que você baixa e perde: tem tela própria, e é o que circula para quem nunca abriu esta ferramenta. Faixa de saúde no topo, o desenho animado junto, as decisões com o que foi descartado. Duas seções que só uma PESSOA escreve, trade-offs e riscos, que a máquina nunca sobrescreve: é onde mora a mudança que não moveu arquitetura. E aprovar guarda uma foto — se o desenho mudar depois, o selo avisa em vez de mentir, e diz QUAL seção mudou: \"mudou Itens, entrou Riscos\". Um aviso que não diz o que mudou obriga a reler tudo, e é assim que se aprende a reaprovar sem olhar. Os itens escritos são uma seção dele — desde a SPEC-61 há uma saída só, e é esta.",
      onEnter: () => opts.abrirDocumento(),
    },
    {
      selector: null,
      titulo: "Agora é a sua demanda",
      segundos: 10,
      texto:
        "Este tour respondeu \"serve pra quê\": do desenho medido ao item escrito, passando pelo documento. O cenário de demonstração saiu da tela — a mesa à sua frente está vazia, e a conversa está aberta. Descreva a sua demanda em uma frase, por texto ou por voz, e o agente propõe os primeiros componentes com os tipos que este projeto tem. Se preferir moldar antes, o tour de configuração está em ▶ Como funciona.",
      onEnter: () => {
        /**
         * SPEC-78 fatia C — o tour termina em AÇÃO, não em "e é isso".
         *
         * Um fecho que só resume desperdiça o momento em que a pessoa está
         * mais disposta — é a diferença entre visita guiada e começo de uso.
         * Ela sai daqui com a mesa limpa e a porta de entrada aberta, que é
         * exatamente o gesto que o primeiro passo mostrou.
         *
         * Desligar a demonstração continua obrigatório e vem ANTES: dado de
         * demonstração que sobrevive ao tour vira configuração fantasma na
         * tela de quem for usar de verdade (§253).
         */
        opts.ligarDemonstracao(false);
        opts.fecharConfig();
        opts.abrirConversa();
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
      /**
       * §340 — **liga a demonstração, e o motivo veio de um print do usuário.**
       *
       * Este passo mostra o mapa, e o mapa mostra a última execução de cada
       * agente lendo o histórico REAL. Quem demonstra com a credencial da casa
       * sem crédito via os quatro papéis em vermelho, com o erro cru do
       * provedor — e quem assiste conclui que a ferramenta está quebrada.
       *
       * O §339 trocou o histórico por dados de demonstração, e não bastou: o
       * passo equivalente do tour de PRODUTO liga o modo antes de abrir o mapa
       * (`ligarDemonstracao(true); abrirSistema()`), e este não ligava. A
       * correção existia e não alcançava a tela em que o defeito foi visto.
       *
       * O desligamento continua obrigatório e continua onde estava (§253):
       * demonstração que sobrevive ao tour vira configuração fantasma.
       */
      onEnter: () => {
        opts.ligarDemonstracao(true);
        opts.abrirSistema();
      },
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "O que é perene: o produto",
      segundos: 11,
      texto:
        "Aqui mora o que a demanda sozinha não diz: DE QUE PRODUTO ela fala. Objetivo, quem usa, regras que valem sempre, glossário — tudo isso viaja junto com cada demanda ligada a este produto. E o VOLUME que ele atende: o número perene que toda demanda herda, e do qual ela pode discordar dizendo por quê. É o par do propósito: lá o \"para quê\" desta entrega, aqui o \"de que negócio\" que não muda.",
      onEnter: () => {
        /**
         * §235 — a marca de demonstração LIGA aqui, e não é detalhe.
         *
         * Este é o primeiro passo do tour de configuração a mostrar dado falso
         * (o produto "Catálogo (exemplo)"). Sem a marca, alguém sai do tour
         * achando que configurou um produto — e foi por isso que ela existe.
         *
         * SPEC-78: ela quase morreu na poda. Fundir dois passos levou o
         * `ligarDemonstracao` junto, e quem pegou foi o E2E, que afirma a marca
         * na tela. É a segunda vez nesta rodada que um efeito colateral caiu com
         * o passo e um teste segurou — que é exatamente o trabalho da fatia D.
         */
        opts.ligarDemonstracao(true);
        opts.abrirConfigNaAba("produtos");
      },
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "A régua do time",
      segundos: 11,
      texto:
        "Três telas, uma ideia só: o que este time considera certo. A STACK é o perfil de tecnologia que pré-preenche sugestões; os PADRÕES POR COMPONENTE dizem que campos cada tipo de nó obriga, e podem virar régua conferível — aí o motor cobra sozinho; os CAMPOS DE CONEXÃO fazem o mesmo para o que uma seta precisa declarar. Tudo o que a ferramenta cobra de você sai daqui, e por isso você pode discordar e mudar.",
      onEnter: () => opts.abrirConfigNaAba("perfis"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "O que cada item precisa dizer",
      segundos: 11,
      texto:
        "As REGRAS de refinamento são o checklist que cada tecnologia obriga, por contexto — DLQ, idempotência, plano de migração. Os MODELOS decidem a forma: como o documento de desenho se estrutura e o que cada item traz dentro. Toda lacuna que sair daí é contável: se o motor escreve algo esperando que alguém complete, isso aparece na conta e no momento da aprovação.",
      onEnter: () => opts.abrirConfigNaAba("regras"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "A IA: de onde ela vem, e quem escreve o quê",
      segundos: 11,
      texto:
        "O DESTINO diz de onde a IA vem — um gateway seu, um modelo no seu Docker, ou o modo sem custo, que não chama modelo nenhum e marca tudo o que sai dele como simulado. A ESTEIRA diz quem escreve cada parte do item: PO, arquiteto, especialista, QA, cada um com o seu preâmbulo. Papel ativo sem modelo configurado é o defeito mais silencioso daqui.",
      onEnter: () => opts.abrirConfigNaAba("modeloIa"),
    },
    {
      selector: "[data-tour=config-screen-content]",
      titulo: "Quem pode o quê, e para onde o item vai",
      segundos: 11,
      texto:
        "Os NÍVEIS dizem quem no time visualiza, opera ou administra — e o controle nasce desligado, para ninguém ficar de fora no primeiro dia. A EXPORTAÇÃO diz para onde o item pronto vai: um agente configurável leva o markdown ao issue tracker do time, e só vai o que não tem pendência nenhuma.",
      // `membros`, e não `acessos`: é onde os NÍVEIS por pessoa são decididos,
      // que é a metade que o passo ensina primeiro. A delegação de RBAC fica a
      // um clique dali, na mesma área.
      onEnter: () => opts.abrirConfigNaAba("membros"),
    },
    {
      // §280 — o passo mostrava só a metade que dá certo. A SPEC-62 pôs o "não"
      // de pé (motivo, reconsiderar, reabrir) e ele não aparecia em tour
      // nenhum: pela régua do §244, capacidade que o tour não mostra não existe
      // para quem está avaliando. Texto maior pede tempo maior — passo longo
      // com 7s é passo que ninguém termina de ler.
      selector: "[data-tour=config-screen-content]",
      titulo: "Melhoria contínua (PDCA)",
      segundos: 14,
      texto:
        "Depois de gerar, o assistente pergunta o que faltou ou sobrou — e o que as pessoas respondem entra aqui, em \"O que disseram\". Dali vira uma proposta de ajuste no estúdio, e quem decide não decide no escuro: o pedido chega dizendo de que feedback nasceu, quando, e o que ele muda num item de exemplo. Aprovar aplica de verdade, com registro de quem aplicou. E o \"não\" também é decisão: recusar pede o porquê — quem escreveu o pedido lê —, o pedido recusado pode ser reconsiderado, e o feedback descartado volta a esperar tratamento. Um \"não\" mudo e definitivo é o que ensina um time a parar de responder.",
      onEnter: () => opts.abrirConfigNaAba("pdca"),
    },
    {
      selector: null,
      titulo: "Comece pelo que é seu",
      segundos: 10,
      texto:
        "Isto é o que se molda. O caminho mais curto para o resultado parecer escrito por vocês começa em uma tela só: o CONTEXTO DO PRODUTO — o que ele é, quem usa, as regras que valem sempre. Ele viaja com toda demanda deste produto, e é o que separa um item tecnicamente correto de um item que entende o negócio. Está aberto aí. O outro tour — ▶ Iniciar tour guiado — mostra o caminho completo de uma demanda.",
      onEnter: () => {
        // §252 — os passos de produto/stacks migraram para cá e trouxeram o
        // `ligarDemonstracao(true)` junto. Desligar aqui é obrigatório pelo
        // mesmo motivo de sempre: dado de demonstração que sobrevive ao tour
        // vira configuração fantasma na tela de quem for usar de verdade.
        // SPEC-78 fatia C — termina abrindo a tela por onde se começa, em vez
        // de citar o nome dela. Desligar a demonstração vem antes, pelo mesmo
        // motivo de sempre (§253).
        opts.ligarDemonstracao(false);
        opts.abrirConfigNaAba("produtos");
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

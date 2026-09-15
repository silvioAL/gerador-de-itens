/**
 * SPEC-117 fatias B, C e D — **as conversas do assistente, nomeadas.**
 *
 * ## A medição que originou este arquivo
 *
 * O produto chamava três coisas diferentes de agente, e só uma era editável:
 *
 * | | O que é | O que dava para editar |
 * |---|---|---|
 * | Papéis da esteira | PO, Arquiteto, Especialista, QA | ✅ inclusive o preâmbulo |
 * | **Conversas do assistente** | desenhar, decisões, mapear, alterar item… | ❌ **nada** |
 * | Agentes do gateway | o outro lado das integrações | ⚠️ o transporte, não o que fazem |
 *
 * `grep "export function montarPedido"` devolvia nove, e **oito tinham o prompt
 * inteiro escrito em TypeScript**. Trocar o comportamento de qualquer um deles
 * exigia um deploy — que é literalmente a frase do usuário: *"não tenho
 * flexibilidade para editar os agentes do assistente na ferramenta"*.
 *
 * ## O que este módulo NÃO faz, e é a decisão que organiza tudo
 *
 * O preâmbulo do time **acrescenta**; ele não substitui o prompt do produto.
 *
 * > *"Acrescenta, sessão específica da spec, é ali que deveria estar a parte
 * > das decisões"* — o usuário, respondendo a pergunta 2 da SPEC-117.
 *
 * Isso simplifica a SPEC inteira, **contra a recomendação original** (que era a
 * saída do meio: substituir e reinjetar as regras). O que a decisão desfaz:
 * nenhuma regra de produto pode sumir, porque nada sai do prompt. A trava da
 * SPEC-80 fatia D continua coberta pelo que já cobre.
 *
 * ## O custo que sobra, e ele é de engenharia de prompt
 *
 * Duas instruções podem se contradizer. Se o preâmbulo do time disser *"no
 * máximo 3 decisões"* e o do produto disser *"no máximo 8"*, o modelo recebe
 * duas ordens e resolve sozinho — mal.
 *
 * A mitigação não é técnica, é de **moldura**: o preâmbulo entra num bloco
 * nomeado e o prompt do produto diz a precedência em voz alta. É o que
 * transforma contradição em prioridade declarada — ver `comInstrucoesDoTime`.
 */

export const IDS_DE_CONVERSA = [
  "diagrama",
  "alterarItem",
  "sugerirConfig",
  "configurarConversa",
  "scriptDeMapeamento",
  "decisoes",
  "cenariosDeLentidao",
  "necessidades",
] as const;

export type IdDeConversa = (typeof IDS_DE_CONVERSA)[number];

/**
 * A classificação de cada parte do prompt, igual à da esteira
 * (`OrigemDaParte`): o que é da pessoa, o que vem do trabalho, o que é do
 * produto.
 *
 * `inegociavel` é a **fatia D**: a régua que a §3 da SPEC-117 mediu. Vários
 * prompts carregam regra de produto, não preferência —
 * `montarPedidoScriptDeMapeamento` exige somente leitura e proíbe inventar
 * endereço; `montarPedidoDecisoes` exige duas alternativas no mínimo. Hoje elas
 * estão dissolvidas na string, e esta lista é o que as torna **verificáveis**:
 * `pedidos.conversas.test.ts` monta cada prompt COM preâmbulo de time e falha
 * se alguma sumir.
 *
 * Com o preâmbulo acrescentando (pergunta 2), isto deixou de ser
 * pré-requisito e virou higiene — mas é a higiene que transforma a anatomia de
 * documentação em **mecanismo**, que é o que a fatia D pede.
 */
export interface ParteDoPromptDaConversa {
  id: string;
  rotulo: string;
  origem: "configuravel" | "da-quebra" | "fixo";
  /** Onde a pessoa mexe nisso — vazio quando é fixo. */
  ondeSeEdita?: string;
  /** Trecho literal do prompt montado. É o que o teste de envelhecimento ancora. */
  marcador: string;
  /** Regra de produto que nenhum preâmbulo pode derrubar (fatia D). */
  inegociavel?: boolean;
}

export interface ConversaDoAssistente {
  id: IdDeConversa;
  /** Como ela se chama na tela de quem a usa — o vocabulário da interface. */
  rotulo: string;
  /** Onde ela vive: a tela em que alguém a encontra. */
  onde: string;
  /** O que ela faz, em uma frase. */
  oQueFaz: string;
  anatomia: ParteDoPromptDaConversa[];
}

/**
 * O bloco do preâmbulo do time, igual em todas as conversas.
 *
 * É `configuravel` e entra na anatomia de cada uma porque a §0.2 mediu a falta:
 * a anatomia *"só existe para a esteira — as outras oito não têm nem a
 * classificação: não há como uma pessoa saber o que ali é dela e o que é do
 * produto, porque nada é dela"*.
 */
const PARTE_DO_PREAMBULO: ParteDoPromptDaConversa = {
  id: "preambulo-do-time",
  rotulo: "Instruções adicionais do time",
  origem: "configuravel",
  ondeSeEdita: 'aba "Agentes de IA", seção "Conversas", no campo desta conversa',
  marcador: CABECALHO_DAS_INSTRUCOES_DO_TIME(),
};

/**
 * Função e não constante para poder ser citada acima da definição sem hoisting
 * de `const`. O texto é o mesmo nos dois lugares por construção — é o que
 * impede a anatomia de descrever um bloco que a montagem não escreve.
 */
export function CABECALHO_DAS_INSTRUCOES_DO_TIME(): string {
  return "Instruções adicionais do time (acrescentam ao que foi pedido acima):";
}

/**
 * SPEC-117 fatia C — **o preâmbulo do time entra num bloco nomeado, no fim, e
 * declarando a própria precedência.**
 *
 * ## Por que no FIM, e não no começo
 *
 * Porque ele é subordinado. Um texto que abre o prompt é lido como a definição
 * do papel; um que fecha, depois das regras, é lido como acréscimo — e é
 * exatamente o que ele é. A ordem aqui não é estética: ela é a única coisa que
 * diz ao modelo qual das duas instruções vale quando as duas se contradizem.
 *
 * ## Por que a frase de precedência é explícita
 *
 * Porque "o produto tem precedência" não é óbvio para um modelo que recebeu as
 * duas no mesmo texto. Sem essa linha, *"no máximo 3 decisões"* do time e
 * *"no máximo 8"* do produto viram duas ordens e ele resolve sozinho, mal.
 *
 * Preâmbulo vazio não acrescenta bloco nenhum: um cabeçalho seguido de nada
 * ensinaria o modelo a ignorar cabeçalhos.
 */
export function comInstrucoesDoTime(prompt: string, preambuloDoTime?: string): string {
  const texto = preambuloDoTime?.trim();
  if (!texto) return prompt;

  return [
    prompt,
    ``,
    CABECALHO_DAS_INSTRUCOES_DO_TIME(),
    texto,
    `Se algo acima contradisser as instruções do produto, as instruções do produto valem.`,
  ].join("\n");
}

/**
 * O catálogo. A ordem é a de quem procura: as conversas que produzem artefato
 * primeiro, as que configuram a ferramenta depois.
 *
 * **`montarPedidoPipeline` não está aqui de propósito.** Ele é a esteira, tem
 * `ANATOMIA_DO_PROMPT_PIPELINE` própria, roda em lote e tem ordem — e a §2 da
 * SPEC-117 recusa explicitamente unificar os tipos numa lista só com um campo
 * `tipo`: *"produziria um formulário com metade dos campos cinza"*.
 */
export const CONVERSAS_DO_ASSISTENTE: ConversaDoAssistente[] = [
  {
    id: "diagrama",
    rotulo: "✦ Desenhar conversando",
    onde: "assistente, aba Desenhar",
    oQueFaz: "propõe componentes e conexões a partir da descrição da demanda",
    anatomia: [
      {
        id: "instrucao",
        rotulo: "O que o agente é",
        origem: "fixo",
        marcador: "Você é o arquiteto de software que desenha a solução",
      },
      {
        id: "tipos",
        rotulo: "Só os tipos configurados no projeto",
        origem: "fixo",
        marcador: "Tipos de componente DISPONÍVEIS (use exclusivamente estes ids):",
        // §3 — um desenho com nó que o produto não sabe renderizar não abre.
        inegociavel: true,
      },
      {
        id: "descricao",
        rotulo: "A descrição da demanda",
        origem: "da-quebra",
        ondeSeEdita: "o campo onde você descreve a demanda",
        marcador: "Demanda:",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
  {
    id: "decisoes",
    rotulo: "✦ Conversar e decidir",
    onde: "documento, na seção da spec",
    oQueFaz: "propõe decisões de arquitetura a partir do desenho e do contexto colado",
    anatomia: [
      {
        id: "instrucao",
        rotulo: "O que o agente é",
        origem: "fixo",
        marcador: "Proponha DECISÕES DE ARQUITETURA para este desenho",
      },
      {
        id: "duas-alternativas",
        rotulo: "Duas alternativas, no mínimo",
        origem: "fixo",
        marcador: "pelo menos DUAS alternativas",
        // §3 — proposta com uma opção só é opinião vestida de decisão.
        inegociavel: true,
      },
      {
        id: "lista-vazia",
        rotulo: "Lista vazia é resposta correta",
        origem: "fixo",
        marcador: 'devolva "decisoes" VAZIA. Lista vazia é resposta correta',
        inegociavel: true,
      },
      {
        id: "contexto-do-projeto",
        rotulo: "O que já existe do projeto",
        origem: "da-quebra",
        ondeSeEdita: "a caixa onde você cola o contexto do projeto",
        marcador: "Componentes desenhados (use exclusivamente estes ids em \"noId\"):",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
  {
    id: "necessidades",
    rotulo: "✦ Propor propósitos",
    onde: "mesa de projeto, barra de propósitos",
    oQueFaz: "propõe o que a demanda precisa deixar verdade",
    anatomia: [
      {
        id: "instrucao",
        rotulo: "O que o agente é",
        origem: "fixo",
        marcador: "Proponha as NECESSIDADES desta demanda",
      },
      {
        id: "lista-vazia",
        rotulo: "Lista vazia é resposta correta",
        origem: "fixo",
        marcador: 'devolva "necessidades" VAZIA',
        // §3 — sem isso, a cota é preenchida com propósito inventado.
        inegociavel: true,
      },
      {
        id: "contexto",
        rotulo: "O contexto da demanda",
        origem: "da-quebra",
        ondeSeEdita: 'botão "Contexto do épico"',
        marcador: "Regras:",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
  {
    id: "scriptDeMapeamento",
    rotulo: "🔎 Mapear componente",
    onde: "assistente, aba Mapear componente",
    oQueFaz: "escreve os comandos que levantam o estado real de um componente",
    anatomia: [
      {
        id: "somente-leitura",
        rotulo: "SOMENTE LEITURA",
        origem: "fixo",
        marcador: "SOMENTE leitura. Nada que escreva, apague, reinicie ou altere configuração.",
        /**
         * §3 — a mais cara de todas: o que se perde é *"um comando destrutivo
         * colado num terminal com acesso"*. O ciclo é `agente escreve → pessoa
         * roda onde tem acesso → pessoa cola`, e o passo do meio é de gente.
         */
        inegociavel: true,
      },
      {
        id: "nao-inventar-endereco",
        rotulo: "Não inventar endereço",
        origem: "fixo",
        marcador: "Não invente endereço, porta nem nome de recurso.",
        inegociavel: true,
      },
      {
        id: "componente",
        rotulo: "O componente e o que já se sabe dele",
        origem: "da-quebra",
        ondeSeEdita: "os campos do componente no diagrama",
        marcador: "O componente:",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
  {
    id: "alterarItem",
    rotulo: "Alterar item conversando",
    onde: "revisão, no card do item",
    oQueFaz: "reescreve um campo do item a partir do que você pede",
    anatomia: [
      {
        id: "instrucao",
        rotulo: "O que o agente é",
        origem: "fixo",
        marcador: "Você revisa itens de trabalho de software já especificados.",
      },
      {
        id: "pedido",
        rotulo: "O seu pedido",
        origem: "da-quebra",
        ondeSeEdita: "a caixa de conversa do item",
        marcador: "Pedido:",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
  {
    id: "cenariosDeLentidao",
    rotulo: "✦ Pauta do ensaio",
    onde: "bancada de ensaios",
    oQueFaz: "propõe os cenários de lentidão que valem a pena ensaiar",
    anatomia: [
      {
        id: "instrucao",
        rotulo: "O que o agente é",
        origem: "fixo",
        marcador: "Proponha CENÁRIOS DE LENTIDÃO plausíveis para este desenho.",
      },
      {
        id: "desenho",
        rotulo: "O caminho e os tempos do desenho",
        origem: "da-quebra",
        ondeSeEdita: "os tempos declarados em cada componente",
        marcador: "Componentes que podem ficar lentos (use exclusivamente estes ids):",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
  {
    id: "sugerirConfig",
    rotulo: "✦ Sugerir",
    onde: "formulários de configuração",
    oQueFaz: "propõe um campo, uma regra ou um papel a partir de uma frase",
    anatomia: [
      {
        id: "alvo",
        rotulo: "O que está sendo escrito",
        origem: "fixo",
        marcador: "Você ajuda a configurar uma ferramenta de refinamento",
      },
      {
        id: "instrucao-de-quem-pede",
        rotulo: "A frase que você escreveu",
        origem: "da-quebra",
        ondeSeEdita: "o campo de texto do ✦ Sugerir",
        marcador: "Pedido do usuário:",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
  {
    id: "configurarConversa",
    rotulo: "⚙ Configurar",
    onde: "assistente, aba Configurar",
    oQueFaz: "transforma o que você pede numa proposta de mudança de configuração",
    anatomia: [
      {
        id: "instrucao",
        rotulo: "O que o agente é",
        origem: "fixo",
        marcador: "Decida se o pedido da pessoa vira uma ou mais PROPOSTAS de configuração",
      },
      {
        id: "pedido",
        rotulo: "O que você pediu",
        origem: "da-quebra",
        ondeSeEdita: "a caixa da aba ⚙ Configurar",
        marcador: "Conversa até aqui:",
      },
      PARTE_DO_PREAMBULO,
    ],
  },
];

export function conversaPorId(id: string): ConversaDoAssistente | undefined {
  return CONVERSAS_DO_ASSISTENTE.find((c) => c.id === id);
}

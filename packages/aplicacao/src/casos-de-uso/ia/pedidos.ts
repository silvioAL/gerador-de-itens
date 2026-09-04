import type { EsquemaJson } from "@gerador/llm/gateway";

/**
 * SPEC-31 Fase 4 (conclusão) — os PEDIDOS de IA, compartilhados pelos dois modos.
 *
 * Cada rota de `/ia/*` fazia a mesma coisa: montar um schema JSON, montar um
 * prompt, chamar o provedor e streamar. As duas primeiras partes são **puras** —
 * entra dado, sai texto e schema — e eram justamente as ~900 linhas que só
 * existiam dentro do `openApiLocal.ts`. Enquanto elas moravam lá, o modo
 * hospedado não tinha como ter as rotas sem reescrevê-las, que é exatamente a
 * duplicação que a SPEC-31 existe para matar.
 *
 * Agora moram aqui, e as duas bordas só traduzem HTTP e chamam o provedor —
 * `node-llama-cpp` no local, gateway no container.
 */
export interface PedidoIa {
  /**
   * SPEC-30 Fase 2 — imagens (data URLs) que acompanham o prompt. Viajam com o
   * pedido porque quem executa é o adaptador: o montador continua puro e sem
   * saber quem enxerga imagem.
   */
  imagens?: string[];
  prompt: string;
  esquema: EsquemaJson;
}

/** Erro de entrada: a borda traduz em HTTP 400. */
export class PedidoInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "PedidoInvalido";
  }
}

interface AlvoSugestaoConfig {
  /** O que a IA está escrevendo — entra no prompt em primeira linha. */
  descricao: string;
  schema: EsquemaJson;
  /** Regras de preenchimento específicas do alvo (formato de chave, limites
   * de vocabulário) — o que um modelo pequeno erra se não for dito. */
  regras: string[];
}

const TIPOS_CAMPO = ["text", "textarea", "number", "boolean", "select", "lista"] as const;
/** Conexão não tem campo do tipo "lista" (`CampoAresta` não aceita) — o enum
 * do schema já impede o modelo de propor um tipo que o formulário rejeitaria. */
const TIPOS_CAMPO_ARESTA = TIPOS_CAMPO.filter((t) => t !== "lista");

const ALVOS_SUGESTAO_CONFIG: Record<string, AlvoSugestaoConfig> = {
  "campo-no": {
    descricao: "um campo de formulário de um TIPO DE NÓ do diagrama de arquitetura",
    schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        type: { enum: [...TIPOS_CAMPO] },
        ajuda: { type: "string" },
        opcoes: { type: "array", items: { type: "string" } },
        required: { type: "boolean" },
        permiteNA: { type: "boolean" },
      },
      required: ["key", "label", "type", "ajuda", "opcoes", "required", "permiteNA"],
    },
    regras: [
      `"key" em camelCase, sem espaços nem acentos — é identificador, não texto de tela.`,
      `"label" é o texto que aparece pro usuário, em português.`,
      `"opcoes" só faz sentido com type "select"; nos outros, devolva lista vazia.`,
      `"ajuda" é uma frase curta explicando o que preencher, não a repetição do label.`,
    ],
  },
  "campo-aresta": {
    descricao: "um campo de formulário de um TIPO DE CONEXÃO entre nós do diagrama",
    schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        label: { type: "string" },
        type: { enum: [...TIPOS_CAMPO_ARESTA] },
        ajuda: { type: "string" },
        opcoes: { type: "array", items: { type: "string" } },
        required: { type: "boolean" },
        permiteNA: { type: "boolean" },
      },
      required: ["key", "label", "type", "ajuda", "opcoes", "required", "permiteNA"],
    },
    regras: [
      `"key" em camelCase, sem espaços nem acentos.`,
      `O campo descreve a CONEXÃO (contrato, timeout, autenticação, retry), não os nós das pontas.`,
      `"opcoes" só faz sentido com type "select"; nos outros, devolva lista vazia.`,
    ],
  },
  /**
   * SPEC-102 fatia D — **a regra de conexão: o que nasce ao ligar dois nós.**
   *
   * O pedido que a originou veio com print: o usuário ligou um Fluxo Decisão
   * (FICO) num Motor de Regras e a aresta nasceu **HTTP**, porque
   * `edgeRules.motor.default` dizia isso. A correção precisou de nova imagem —
   * e ele pediu, com todas as letras, para *"poder usar o agente para ajustar
   * isso, pois eventualmente vai acontecer"*.
   *
   * O alvo é a regra do tipo de nó de DESTINO, que é como `edgeRules` é
   * indexado. Sem isso o modelo proporia "mude a aresta X→Y", que não existe
   * como configuração — regra é por destino, não por par.
   */
  "regra-de-conexao": {
    descricao:
      "a regra de ligação de um TIPO DE NÓ DE DESTINO: qual tipo de conexão nasce por padrão ao ligar algo nele, e quais são aceitos",
    schema: {
      type: "object",
      properties: {
        tipoNo: { type: "string" },
        default: { type: "string" },
        valid: { type: "array", items: { type: "string" } },
        porque: { type: "string" },
      },
      required: ["tipoNo", "default", "valid", "porque"],
    },
    regras: [
      `"tipoNo" é o id do tipo de nó de DESTINO (ex.: "motor", "fico", "rabbit"), nunca o rótulo.`,
      `"default" e os itens de "valid" são ids de TIPO DE CONEXÃO já existentes (ex.: "http", "interno", "publishes").`,
      `"default" PRECISA estar dentro de "valid" — um padrão fora dos aceitos é uma conexão que a validação recusa.`,
      `"valid" é a lista COMPLETA que passa a valer para esse destino, não só o que muda: ela substitui a anterior.`,
      `Não invente tipo de conexão: se o que a pessoa descreve não existe no vocabulário, diga isso em vez de propor um id novo.`,
      `"porque" explica em uma frase o que a ligação É — o que justifica o padrão, não o que a pessoa pediu.`,
    ],
  },
  "regra-refinamento": {
    descricao:
      "um REQUISITO DE REFINAMENTO TÉCNICO — uma decisão que o time precisa tomar no desenho antes de implementar",
    schema: {
      type: "object",
      properties: {
        texto: { type: "string" },
        contextos: { type: "array", items: { type: "string" } },
      },
      required: ["texto", "contextos"],
    },
    regras: [
      `"texto" começa com um verbo no infinitivo e nomeia a DECISÃO a tomar`,
      `(ex.: "Definir a política de retry e o timeout da chamada"), não uma`,
      `pergunta nem uma tarefa de execução — quem executa é o checklist de processo.`,
      `Um requisito por resposta, específico da tech e do contexto informados.`,
      `"contextos" limita onde o requisito aparece; lista vazia = vale sempre que a tech estiver presente.`,
    ],
  },
  /**
   * §271 — o CONTEXTO DO PRODUTO escrito com apoio do assistente.
   *
   * É o único alvo que devolve o registro inteiro em vez de uma linha de uma
   * lista, e a razão é a natureza do que se escreve: as cinco seções são um
   * texto só partido em pedaços — quem descreve o produto descreve as cinco de
   * uma vez, e pedir cinco vezes seguidas daria cinco respostas que não se
   * conhecem.
   */
  "contexto-do-produto": {
    descricao:
      "o CONTEXTO DE NEGÓCIO de um produto de software — o que vale para toda demanda dele, não para uma demanda específica",
    schema: {
      type: "object",
      properties: {
        objetivo: { type: "string" },
        quemUsa: { type: "string" },
        regrasDeNegocio: { type: "string" },
        sistemas: { type: "string" },
        restricoes: { type: "string" },
      },
      required: ["objetivo", "quemUsa", "regrasDeNegocio", "sistemas", "restricoes"],
    },
    regras: [
      `"objetivo" diz o que o produto É e para que serve, em duas ou três frases.`,
      `"quemUsa" nomeia as personas e o que cada uma quer dali.`,
      `"regrasDeNegocio" traz as que valem SEMPRE, não as de uma demanda —`,
      `se a frase começa com "nesta entrega", ela não pertence a este campo.`,
      `"sistemas" diz com quem o produto conversa e para quê.`,
      `"restricoes" é o que não se negocia: regulatório, compliance, contrato.`,
      `Escreva em português, em prosa curta. Campo sem informação suficiente`,
      `volta como string vazia — inventar contexto de negócio é pior que deixar em branco.`,
    ],
  },
  "item-processo": {
    descricao:
      "um ITEM DE CHECKLIST DE PROCESSO — algo que o time precisa FAZER pra conseguir executar e testar o item",
    schema: {
      type: "object",
      properties: {
        texto: { type: "string" },
        contextos: { type: "array", items: { type: "string" } },
      },
      required: ["texto", "contextos"],
    },
    regras: [
      `A diferença pro requisito técnico é a natureza: aqui é EXECUÇÃO`,
      `(configurar mock, levantar massa, repontar serviço, pedir acesso),`,
      `não uma decisão de desenho. Se a frase pode ser respondida escrevendo`,
      `uma decisão, ela é requisito técnico e não cabe aqui.`,
      `"contextos" vazio = vale sempre que a tech estiver presente.`,
    ],
  },
  "teste-automatizado": {
    descricao: "um CICLO DE TESTE AUTOMATIZADO da tabela de testes do time",
    schema: {
      type: "object",
      properties: {
        tipo: { type: "string" },
        validacao: { type: "string" },
        contextos: { type: "array", items: { type: "string" } },
        dev: { type: "boolean" },
        hlg: { type: "boolean" },
      },
      required: ["tipo", "validacao", "contextos", "dev", "hlg"],
    },
    regras: [
      `"tipo" é o nome do ciclo (ex.: "Teste de contrato", "Teste de carga").`,
      `"validacao" diz o que o teste PROVA, em uma frase verificável.`,
      `"dev"/"hlg" dizem em quais ambientes esse ciclo roda.`,
    ],
  },
  papel: {
    descricao: "um PAPEL (agente) da esteira que especifica os itens de trabalho",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        nome: { type: "string" },
        descricao: { type: "string" },
        preambulo: { type: "string" },
        contextos: { type: "array", items: { type: "string" } },
      },
      required: ["id", "nome", "descricao", "preambulo", "contextos"],
    },
    regras: [
      `"id" em minúsculas, sem espaços nem acentos (ex.: "seguranca").`,
      `"nome" é o título curto que aparece na esteira; "descricao" cabe em uma linha.`,
      `"preambulo" é a INSTRUÇÃO que esse agente recebe: diga o papel, o formato`,
      `esperado e a profundidade (quantos itens, o que cobrir) — é o que separa`,
      `uma resposta útil de uma resposta de duas linhas.`,
      `"contextos" limita em quais itens o papel atua; lista vazia = atua em todos.`,
    ],
  },
};

/**
 * ACHADO REAL do usuário (#296): *"não consigo ver o conteúdo atual dos prompts
 * nessa parte dedicada a edição"*. Estes preâmbulos eram `const` de módulo —
 * o campo da tela nascia VAZIO em todo papel não personalizado, e o texto que
 * de fato ia pro modelo não tinha como chegar à UI. Exportados de propósito:
 * é o mesmo padrão de `VARIAVEIS_ESPECIFICACAO`, que a aba de especificação já
 * importa pra mostrar o que existe.
 */
export const PREAMBULO_PADRAO_POR_PAPEL: Record<string, string> = {
  po: [
    `Você é o Product Owner num time de desenvolvimento de software.`,
    `Pra história de usuário: escreva no formato "Como <persona>, quero <capacidade>, para <benefício>",`,
    `específica pra ESTE item e este contexto — nunca genérica.`,
    // ACHADO REAL do usuário: "algumas histórias criadas pelo PO têm como
    // persona o time de desenvolvimento". Num item técnico ("Cache de CPF",
    // "API Externa") o modelo pega o caminho fácil e escreve "Como um
    // desenvolvedor de sistemas, quero…" — que não é história de usuário, é
    // tarefa disfarçada: some o benefício de negócio, e o critério de aceite
    // nasce sobre a implementação em vez do resultado. Proibir não basta; o
    // prompt precisa dizer ONDE achar a persona certa.
    `A persona NUNCA pode ser quem constrói o software: não escreva "desenvolvedor",`,
    `"time de desenvolvimento", "dev", "engenheiro", "arquiteto", "QA" nem "time".`,
    `A persona é quem recebe o VALOR do item: o usuário final, o cliente, o analista`,
    `ou operador de negócio, a área que consome o resultado, ou — quando o item é de`,
    `infraestrutura e não tem gente diretamente — o SISTEMA CONSUMIDOR nomeado`,
    `(ex.: "Como o serviço de propostas, quero…").`,
    `Item técnico não muda essa regra: pergunte de quem é o problema que ele resolve`,
    `e escreva por essa pessoa. Ex.: um cache existe para o cliente ter resposta rápida,`,
    `não para o time "ter cache".`,
    `Pros critérios de aceite: escreva uma lista NUMERADA de 3 a 7 critérios, um por linha,`,
    `cada um objetivo e verificável. Cubra o caminho feliz, pelo menos um caso de erro/exceção`,
    `e pelo menos um limite ou regra de negócio do contexto (use os números e restrições`,
    `do épico quando existirem — latências, prazos, limites, regulações).`,
  ].join(" "),
  arquiteto: [
    `Você é o Arquiteto de software responsável pelo contrato técnico deste item.`,
    `Descreva o nó de arquitetura vinculado, o request (campos com tipos), o response`,
    `(campos com tipos), os erros possíveis (código + motivo + comportamento esperado, um por linha)`,
    `e as dependências nomeadas — decisões concretas, nunca genéricas.`,
  ].join(" "),
  especialista: [
    `Você é o Especialista técnico responsável pelos requisitos de refinamento`,
    `deste item, pra tech e contexto informados. Cada requisito precisa de uma`,
    `decisão concreta pra esse caso específico: a escolha, o valor/configuração`,
    `exata e o porquê em 1-2 frases.`,
  ].join(" "),
  qa: [
    `Você é o QA responsável pelas regras de teste e cenários Gherkin deste item.`,
    `Pras regras de teste: lista NUMERADA de 3 a 6 regras de teste automatizado, uma por linha,`,
    `cobrindo o contrato, os erros e os limites definidos pelos papéis anteriores.`,
    `Pro cenário: um cenário Gherkin completo (Dado/Quando/Então) específico do contexto`,
    `— não repita cenários óbvios de erro genérico.`,
  ].join(" "),
};
export const PREAMBULO_GENERICO =
  `Você ajuda a especificar tecnicamente um item de trabalho de software.`;

/**
 * A ANATOMIA do prompt do lote — a segunda metade do #296: *"os locais das
 * variáveis também parecem não aparecer"*.
 *
 * O preâmbulo é só a CABEÇA do que sai. Tudo o mais — épico, blocos por item,
 * contexto dos nós, respostas dos papéis anteriores, campos a responder — é
 * montado em `montarPedidoPipeline` e era invisível: quem configurava a esteira
 * não tinha como saber onde o que ele preenche no canvas entra.
 *
 * Mora AQUI, ao lado da função que monta, e não numa lista à parte na UI, por
 * um motivo específico: `pedidos.anatomia.test.ts` monta um pedido de verdade e
 * exige que todo `marcador` apareça nele. Mudar a montagem sem mudar esta
 * tabela quebra o build — que é a única forma de a explicação não envelhecer.
 */
export type OrigemDaParte = "configuravel" | "da-quebra" | "fixo";

export interface ParteDoPromptPipeline {
  id: string;
  rotulo: string;
  origem: OrigemDaParte;
  /** Onde a pessoa mexe nisso — vazio quando é fixo. */
  ondeSeEdita?: string;
  /** Trecho literal do prompt montado. É o que o teste de anti-desvio ancora. */
  marcador: string;
}

export const ANATOMIA_DO_PROMPT_PIPELINE: ParteDoPromptPipeline[] = [
  {
    id: "preambulo",
    rotulo: "Preâmbulo do papel",
    origem: "configuravel",
    ondeSeEdita: "aqui nesta aba, no campo de prompt de cada papel",
    marcador: PREAMBULO_GENERICO,
  },
  {
    // SPEC-53 — o contexto do PRODUTO é bloco próprio, antes do da demanda: um
    // vale para tudo o que aquele produto gera, o outro só para esta entrega.
    id: "produto",
    rotulo: "Contexto do produto",
    origem: "da-quebra",
    ondeSeEdita: 'tela "Contexto do produto", e o produto da demanda no painel "Contexto do épico"',
    marcador: "Contexto do PRODUTO (vale para todas as demandas dele, não só esta):",
  },
  {
    id: "epico",
    rotulo: "Contexto desta demanda/épico",
    origem: "da-quebra",
    ondeSeEdita: 'botão "Contexto do épico", no topo da tela do diagrama',
    marcador: "Contexto desta demanda/épico especificamente:",
  },
  {
    id: "instrucao-lote",
    rotulo: "Instrução do lote",
    origem: "fixo",
    marcador: "Você vai responder um LOTE de",
  },
  {
    id: "contexto-no",
    rotulo: "Contexto dos nós de arquitetura",
    origem: "da-quebra",
    ondeSeEdita: "os campos que você preenche em cada componente do diagrama",
    marcador: "Contexto do(s) nó(s) de arquitetura envolvidos:",
  },
  {
    id: "respostas-anteriores",
    rotulo: "O que os papéis anteriores já definiram",
    origem: "da-quebra",
    ondeSeEdita: "a ordem dos papéis nesta aba decide quem vê o quê",
    marcador: "O que os papéis anteriores já definiram pra este item",
  },
  {
    id: "campos",
    rotulo: "Campos a responder",
    origem: "da-quebra",
    ondeSeEdita: 'aba "Regras" (checklist técnico, testes, volumetria) e os padrões por componente',
    marcador: "Campos a responder (responda pela chave entre aspas):",
  },
];

// --- Os quatro pedidos ------------------------------------------------------
//
// Cada um recebe o que a borda leu do corpo HTTP e devolve `{ prompt, esquema }`.
// Nenhum conhece `IncomingMessage`, provedor ou arquivo: é o que permite ao
// modo hospedado ter as mesmas rotas sem reescrever nada.

export interface ItemDoLote {
  chave: string;
  rotulo: string;
  contextoNo: string;
  placeholders: { chave: string; tech: string; rotulo: string }[];
  respostasAnteriores?: { rotulo: string; valor: string }[];
}

/**
 * SPEC-53 Fase 2 — o contexto do PRODUTO viaja separado do da demanda, e não
 * concatenado nele.
 *
 * São naturezas diferentes: um vale para todas as demandas do produto
 * (objetivo, glossário, regras permanentes), o outro só para esta. Fundir os
 * dois num bloco só ensinaria o modelo a tratar o glossário como
 * circunstância da demanda — quando ele é justamente o que não muda.
 */
export interface EntradaPipeline {
  /** Já resolvido pela borda a partir da config da esteira (Fase 3). */
  preambulo: string;
  contextoEpico?: string;
  /** SPEC-53 — o que o PRODUTO é: vale para toda demanda ligada a ele. */
  contextoDoProduto?: string;
  itens: ItemDoLote[];
}

export function montarPedidoPipeline({ preambulo, contextoEpico, contextoDoProduto, itens }: EntradaPipeline): PedidoIa {
  if (!Array.isArray(itens) || itens.length === 0 || itens.every((i) => i.placeholders.length === 0)) {
    throw new PedidoInvalido("nenhum item com placeholder informado pra gerar");
  }

  const esquema = {
    type: "object",
    properties: Object.fromEntries(
      itens.map((item) => [
        item.chave,
        {
          type: "object",
          properties: Object.fromEntries(item.placeholders.map((p) => [p.chave, { type: "string" }])),
          required: item.placeholders.map((p) => p.chave),
        },
      ])
    ),
    required: itens.map((item) => item.chave),
  } as EsquemaJson;

  const blocosItens = itens.map((item) =>
    [
      `### Item "${item.rotulo}" (chave "${item.chave}")`,
      `Contexto do(s) nó(s) de arquitetura envolvidos:`,
      item.contextoNo || "(sem contexto adicional)",
      // Encadeamento entre papéis: o artefato dos anteriores é insumo, não
      // decoração. Corte em 600 chars só por defesa da janela do modelo.
      ...(item.respostasAnteriores?.length
        ? [
            `O que os papéis anteriores já definiram pra este item (construa em cima disso, sem contradizer):`,
            ...item.respostasAnteriores.map(
              (r) => `- ${r.rotulo}: ${r.valor.length > 600 ? `${r.valor.slice(0, 600)}…` : r.valor}`
            ),
          ]
        : []),
      `Campos a responder (responda pela chave entre aspas):`,
      ...item.placeholders.map((p) => `- (chave "${p.chave}") ${p.tech ? `[${p.tech}] ` : ""}${p.rotulo}`),
    ].join("\n")
  );

  const prompt = [
    preambulo,
    // O produto ANTES da demanda: o geral orienta a leitura do específico, e a
    // ordem inversa faria o modelo decidir o tom antes de saber de que negócio
    // se trata.
    ...(contextoDoProduto?.trim()
      ? [`Contexto do PRODUTO (vale para todas as demandas dele, não só esta):`, contextoDoProduto.trim(), ``]
      : []),
    ...(contextoEpico ? [`Contexto desta demanda/épico especificamente:`, contextoEpico, ``] : []),
    `Você vai responder um LOTE de ${itens.length} item(ns) de uma vez.`,
    `Responda TODOS os campos de TODOS os itens, em português, cada um com`,
    `uma decisão concreta pro item específico naquele contexto — nunca`,
    `genérica, nunca repetindo o requisito, nunca copiando a resposta de um`,
    `item pro outro.`,
    ``,
    ...blocosItens,
  ].join("\n");

  return { prompt, esquema };
}

/** O preâmbulo do papel: o configurado vence; sem ele, o padrão do GRUPO;
 * papel que nem existe na config cai no genérico — nunca erro. */
export function preambuloDoPapel(
  papel: string,
  papeisConfigurados: { id: string; grupo?: string; preambulo?: string }[]
): string {
  const configurado = papeisConfigurados.find((p) => p.id === papel);
  if (configurado?.preambulo) return configurado.preambulo;
  return PREAMBULO_PADRAO_POR_PAPEL[configurado?.grupo ?? papel] ?? PREAMBULO_GENERICO;
}

export interface EntradaDiagrama {
  descricao: string;
  tiposDeNo: { id: string; rotulo: string }[];
  tiposDeConexao?: { id: string; rotulo: string }[];
  techs?: string[];
  contextos?: string[];
  perfilTime?: string;
  /**
   * SPEC-81 fatia D — as DECISÕES JÁ TOMADAS pela casa, vindas do repositório
   * de ADR pelo gateway.
   *
   * ## Por que elas entram no pedido do desenho
   *
   * É onde elas mudam alguma coisa. Um ADR que diga *"fila em vez de chamada
   * síncrona, porque desacopla o tempo do parceiro"* deve impedir que a
   * proposta nasça com a chamada síncrona — e hoje o modelo não tem como saber
   * disso, porque a decisão vive num repositório que ele nunca viu.
   *
   * ## Por que só as ACEITAS
   *
   * Uma decisão em proposta ainda não é a posição da casa. Mandá-la junto
   * daria a um rascunho o mesmo peso de um acordo — e é o mesmo erro que
   * `statusDe` evita na importação, aqui do outro lado.
   *
   * ## O que isto NÃO faz
   *
   * Não confere se o desenho contraria alguma. O modelo é orientado, não
   * medido — e a diferença importa: o que sai daqui continua chegando como
   * `sugerido`, e nada disso conta antes de alguém confirmar.
   */
  decisoesDaCasa?: { titulo: string; escolhida?: string; porque?: string }[];
}

/** ACHADO REAL (SPEC-27 Fase 1): array de tamanho aberto na grammar deixa a
 * geração sem fim — a primeira validação passou de 25 minutos. Teto explícito,
 * e dito no prompt também: o modelo não "vê" a grammar, só é barrado por ela. */
const MAX_NOS = 10;
const MAX_ARESTAS = 15;

export function montarPedidoDiagrama(entrada: EntradaDiagrama & { imagens?: string[] }): PedidoIa {
  const { descricao, tiposDeNo, tiposDeConexao, techs, contextos, perfilTime, imagens, decisoesDaCasa } = entrada;

  // SPEC-30 Fase 2: um print de diagrama JÁ É a descrição. Exigir texto junto
  // obrigaria a pessoa a redigitar o que a imagem mostra — que é exatamente o
  // trabalho que anexar o print deveria evitar.
  if (!descricao?.trim() && !imagens?.length) {
    throw new PedidoInvalido("descricao vazia — conte o que precisa ser construído (ou anexe uma imagem)");
  }
  if (!Array.isArray(tiposDeNo) || tiposDeNo.length === 0) {
    throw new PedidoInvalido("tiposDeNo vazio — sem os tipos disponíveis não dá pra restringir a proposta");
  }

  const idsDeNo = tiposDeNo.map((t) => t.id);
  const idsDeConexao = tiposDeConexao?.map((t) => t.id) ?? [];

  const esquema = {
    type: "object",
    properties: {
      nos: {
        type: "array",
        minItems: 1,
        maxItems: MAX_NOS,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            tipo: { enum: idsDeNo },
            rotulo: { type: "string" },
            motivo: { type: "string" },
          },
          required: ["id", "tipo", "rotulo", "motivo"],
        },
      },
      arestas: {
        type: "array",
        maxItems: MAX_ARESTAS,
        items: {
          type: "object",
          properties: {
            de: { type: "string" },
            para: { type: "string" },
            // Sem tipos de conexão configurados, vira string livre e o cliente
            // resolve pelo default de `edgeRules` — melhor que um enum vazio.
            tipo: idsDeConexao.length > 0 ? { enum: idsDeConexao } : { type: "string" },
            motivo: { type: "string" },
          },
          required: ["de", "para", "tipo", "motivo"],
        },
      },
    },
    required: ["nos", "arestas"],
  } as EsquemaJson;

  const prompt = [
    `Você é o arquiteto de software que desenha a solução antes do time começar a implementar.`,
    `A partir da demanda abaixo, proponha o DIAGRAMA: os componentes envolvidos e como eles se conectam.`,
    ``,
    `Demanda:`,
    descricao.trim(),
    ...(perfilTime?.trim() ? ["", `Stack que este time usa (respeite-a):`, perfilTime.trim()] : []),
    ...(decisoesDaCasa?.length
      ? [
          ``,
          `Decisões de arquitetura JÁ TOMADAS nesta casa — respeite-as, e não proponha o que elas descartaram:`,
          ...decisoesDaCasa.map(
            (d) =>
              `- ${d.titulo}${d.escolhida ? `: ${d.escolhida}` : ""}${d.porque ? ` — porque ${d.porque}` : ""}`
          ),
        ]
      : []),
    ...(techs?.length ? ["", `Tecnologias do time: ${techs.join(", ")}`] : []),
    ...(contextos?.length ? [`Contextos usados: ${contextos.join(", ")}`] : []),
    ``,
    `Tipos de componente DISPONÍVEIS (use exclusivamente estes ids):`,
    ...tiposDeNo.map((t) => `- ${t.id}: ${t.rotulo}`),
    ...(tiposDeConexao?.length
      ? [``, `Tipos de conexão disponíveis:`, ...tiposDeConexao.map((t) => `- ${t.id}: ${t.rotulo}`)]
      : []),
    ``,
    `Regras:`,
    `- "id" de cada nó é curto e único no seu retorno (n1, n2, ...); as arestas se referem a esses ids.`,
    `- "rotulo" é o NOME REAL do componente no jeito que o time nomeia (ex.: "srv-checkout",`,
    `  "pagamento.aprovado.q"), nunca um rótulo genérico como "Serviço A".`,
    `- "motivo" explica em uma frase por que esse componente/conexão faz parte desta demanda.`,
    `  É o que a pessoa vai ler pra decidir se aceita — sem ele a proposta é uma caixa-preta.`,
    `- Só inclua o que a demanda realmente exige. Diagrama inflado atrapalha mais que ajuda.`,
    `- No máximo ${MAX_NOS} componentes e ${MAX_ARESTAS} conexões. Se a demanda parece exigir mais,`,
    `  ela deveria ser quebrada antes — proponha o núcleo.`,
    `- Seja conciso: "motivo" em UMA frase curta.`,
    `- Responda em português.`,
  ].join("\n");

  // As imagens seguem com o pedido — quem as manda pro modelo é o adaptador.
  return { prompt, esquema, imagens };
}

export interface EntradaAlterarItem {
  instrucao?: string;
  itemRotulo: string;
  contextoNo?: string;
  campos: { chave: string; rotulo: string; valorAtual?: string }[];
  oQueMudou?: string;
  contextoEpico?: string;
  /** SPEC-53 — quem revisa um item precisa do vocabulário do produto tanto
   * quanto quem o escreveu. */
  contextoDoProduto?: string;
}

export function montarPedidoAlterarItem(entrada: EntradaAlterarItem): PedidoIa {
  const { instrucao, itemRotulo, contextoNo, campos, oQueMudou, contextoEpico, contextoDoProduto } = entrada;

  if (!instrucao?.trim() && !oQueMudou?.trim()) {
    throw new PedidoInvalido("sem instrução nem descrição do que mudou — nada a propor");
  }
  if (!Array.isArray(campos) || campos.length === 0) {
    throw new PedidoInvalido("item sem campos — nada a alterar");
  }

  const esquema = {
    type: "object",
    properties: {
      alteracoes: {
        type: "array",
        maxItems: campos.length,
        items: {
          type: "object",
          properties: {
            campo: { enum: campos.map((c) => c.chave) },
            valor: { type: "string" },
            motivo: { type: "string" },
          },
          required: ["campo", "valor", "motivo"],
        },
      },
    },
    required: ["alteracoes"],
  } as EsquemaJson;

  const prompt = [
    `Você revisa itens de trabalho de software já especificados.`,
    ...(contextoDoProduto?.trim() ? [``, `Contexto do PRODUTO:`, contextoDoProduto.trim(), ``] : []),
    ...(contextoEpico?.trim() ? [``, `Contexto desta demanda:`, contextoEpico.trim(), ``] : []),
    `Item: ${itemRotulo}`,
    ...(contextoNo?.trim() ? [`Contexto do(s) nó(s) de arquitetura:`, contextoNo.trim()] : []),
    ``,
    `Conteúdo atual dos campos:`,
    ...campos.map((c) => `- (campo "${c.chave}") ${c.rotulo}: ${c.valorAtual?.trim() || "(vazio)"}`),
    ``,
    ...(oQueMudou?.trim()
      ? [
          `O QUE MUDOU em outro ponto da quebra:`,
          oQueMudou.trim(),
          ``,
          `Ajuste APENAS o que decorre dessa mudança. Preserve todo o resto como está.`,
          `Se nada neste item decorre dela, devolva "alteracoes" como lista VAZIA —`,
          `essa é uma resposta correta e esperada, não uma falha.`,
        ]
      : [`Pedido: ${instrucao!.trim()}`, ``, `Altere só o que o pedido exige; preserve o resto.`]),
    ``,
    `Regras:`,
    `- "valor" é o texto COMPLETO e final do campo, já com o ajuste — não um trecho, não um diff.`,
    `- "motivo" explica em uma frase por que este campo mudou. É o que a pessoa lê antes de aceitar.`,
    `- Não repita um campo que não precisa mudar.`,
    `- Responda em português.`,
  ].join("\n");

  return { prompt, esquema };
}

export interface EntradaSugerirConfig {
  alvo: string;
  instrucao: string;
  contexto?: string;
}

export function montarPedidoSugerirConfig({ alvo, instrucao, contexto }: EntradaSugerirConfig): PedidoIa {
  const definicao = ALVOS_SUGESTAO_CONFIG[alvo];
  // Alvo desconhecido é erro de propósito (ao contrário de papel na esteira,
  // que cai no genérico): aqui o schema É o contrato com o formulário — sem
  // ele a resposta não teria onde ser preenchida.
  if (!definicao) {
    throw new PedidoInvalido(
      `alvo desconhecido: "${alvo}" (conhecidos: ${Object.keys(ALVOS_SUGESTAO_CONFIG).join(", ")})`
    );
  }
  if (!instrucao?.trim()) throw new PedidoInvalido("instrucao vazia — descreva o que a IA deve propor");

  const prompt = [
    `Você ajuda a configurar uma ferramenta de refinamento de itens de trabalho de software.`,
    `Escreva ${definicao.descricao}.`,
    ``,
    `Pedido do usuário: ${instrucao.trim()}`,
    ...(contexto?.trim() ? [``, `Onde essa configuração vai valer:`, contexto.trim()] : []),
    ``,
    `Regras:`,
    ...definicao.regras.map((r) => `- ${r}`),
    `- Responda em português, com decisões concretas pro caso descrito — nunca genéricas.`,
  ].join("\n");

  return { prompt, esquema: definicao.schema };
}

/** Os alvos que a UI conhece — a borda usa para recusar cedo. */
export const ALVOS_DE_SUGESTAO_CONHECIDOS = Object.keys(ALVOS_SUGESTAO_CONFIG);

/**
 * SPEC-34 — os alvos que a CONVERSA de configuração propõe. A Fase 1 trouxe os
 * três que se aplicam por uma rota que o App já chama; a Fase 2 somou os dois
 * de regras que têm a MESMA forma `{texto, contextos}` (checklist técnico e de
 * processo — o cartão só precisa de um select de tech). `teste-automatizado`
 * fica fora de propósito: a forma do schema do alvo não é a de `regras.testes`,
 * e aplicar exigiria uma conversão inventada — entra quando o mapeamento for
 * medido, não suposto.
 */
export const ALVOS_DA_CONVERSA_DE_CONFIG = [
  "campo-no",
  "campo-aresta",
  "papel",
  "regra-refinamento",
  "item-processo",
  // §274 — o contexto do produto entrou na CONVERSA. Ele já existia como alvo
  // do passo 2 (§271), num campo de instrução única dentro da aba: escrever o
  // que um produto é numa linha só é a parte difícil, e a conversa é onde se
  // chega lá aos poucos — perguntando, corrigindo, completando.
  "contexto-do-produto",
  // SPEC-102 fatia D — o vocabulário de conexão entra na CONVERSA, e é o
  // caminho que o relato do print pediu: mostrar a ligação errada e receber a
  // correção, em vez de editar `config/diagrama.json` e reconstruir a imagem.
  "regra-de-conexao",
] as const;

export interface MensagemConfigurar {
  autor: "voce" | "agente";
  texto: string;
}

export interface EntradaConfigurarConversa {
  mensagens: MensagemConfigurar[];
  /** Resumo da config atual do time — é o que faz o modelo propor MUDANÇA,
   * não duplicata do que já existe. */
  resumoConfig?: string;
  /**
   * SPEC-102 fatia C — o print da configuração errada.
   *
   * A SPEC-30 Fase 2 construiu imagem para a conversa do DESENHO, e parou ali.
   * O relato que originou esta fatia é de configuração: um print do canvas
   * mostrando uma conexão com o tipo errado. Sem isto, a pessoa que vê o erro
   * numa imagem tem que descrevê-lo por escrito — o trabalho que anexar existe
   * para evitar (mesma frase do `montarPedidoDiagrama`).
   */
  imagens?: string[];
}

/** Mesmo motivo do teto de nós no diagrama: array aberto deixa a geração sem
 * fim, e mais de três propostas numa resposta vira lista pra revisar, não
 * conversa. */
const MAX_PROPOSTAS_CONFIG = 3;

/**
 * SPEC-34 §3.5 — o PRIMEIRO passo da conversa de configuração: decidir se o
 * pedido vira proposta e de qual alvo, destilando a instrução. O objeto em si
 * é materializado pelo segundo passo, que reusa `montarPedidoSugerirConfig`
 * com o schema estrito do alvo — aqui o schema é fixo de propósito (schema
 * condicional por alvo é o que um gateway `json_object` não garante).
 */
export function montarPedidoConfigurarConversa({
  mensagens,
  resumoConfig,
  imagens,
}: EntradaConfigurarConversa): PedidoIa {
  const faladas = (mensagens ?? []).filter((m) => m?.texto?.trim());
  // SPEC-102 fatia C — um print de configuração errada JÁ É o pedido, pelo
  // mesmo raciocínio do `montarPedidoDiagrama`: exigir texto junto obrigaria a
  // pessoa a redigitar o que a imagem mostra.
  if (!faladas.some((m) => m.autor === "voce") && !imagens?.length) {
    throw new PedidoInvalido("conversa vazia — descreva o que quer configurar (ou anexe uma imagem)");
  }

  const esquema = {
    type: "object",
    properties: {
      texto: { type: "string" },
      propostas: {
        type: "array",
        maxItems: MAX_PROPOSTAS_CONFIG,
        items: {
          type: "object",
          properties: {
            alvo: { enum: [...ALVOS_DA_CONVERSA_DE_CONFIG] },
            instrucao: { type: "string" },
          },
          required: ["alvo", "instrucao"],
        },
      },
    },
    required: ["texto", "propostas"],
  } as EsquemaJson;

  const prompt = [
    `Você ajuda a configurar uma ferramenta de refinamento de itens de trabalho de software, conversando.`,
    `Decida se o pedido da pessoa vira uma ou mais PROPOSTAS de configuração, e de qual tipo.`,
    ``,
    `Tipos de proposta disponíveis (campo "alvo"):`,
    ...ALVOS_DA_CONVERSA_DE_CONFIG.map((a) => `- ${a}: ${ALVOS_SUGESTAO_CONFIG[a].descricao}`),
    ...(resumoConfig?.trim()
      ? [``, `Configuração atual do time (proponha mudança, não duplicata):`, resumoConfig.trim()]
      : []),
    ``,
    `Conversa até aqui:`,
    ...faladas.map((m) => `${m.autor === "voce" ? "Pessoa" : "Você"}: ${m.texto.trim()}`),
    ``,
    `Regras:`,
    `- "texto" é a sua fala na conversa: curta, em português, dizendo o que você propõe e por quê.`,
    `- "instrucao" de cada proposta é o pedido DESTILADO e autossuficiente — outra chamada vai`,
    `  materializar o objeto lendo SÓ a instrução, sem ver esta conversa. Inclua nela tudo que importa.`,
    `- Se a conversa ainda não dá uma proposta concreta, devolva "propostas" VAZIA e use "texto"`,
    `  para perguntar o que falta. Lista vazia é resposta correta, não falha.`,
    `- No máximo ${MAX_PROPOSTAS_CONFIG} propostas por resposta.`,
    ...(imagens?.length
      ? [`- A pessoa anexou ${imagens.length} imagem(ns): leia o que está nela antes de propor.`]
      : []),
  ].join("\n");

  // As imagens seguem com o pedido — quem as manda pro modelo é o adaptador
  // (mesma divisão do `montarPedidoDiagrama`).
  return { prompt, esquema, imagens };
}

const MAX_DECISOES = 4;

export interface EntradaDecisoes {
  contextoEpico?: string;
  contextoDoProduto?: string;
  /** Os nós do desenho, com o que já está preenchido neles. */
  componentes?: { id: string; rotulo: string; tipo: string; campos?: string }[];
  /** §239 — o que o MOTOR já mediu: o desenho fora do padrão, com o porquê do
   * padrão. É a diferença entre um agente que opina e um que explica. */
  violacoes?: { noId: string; campo: string; esperado: string; atual: string; porque?: string }[];
  /** SPEC-57 fatia A — propósitos sem componente que responda por eles. */
  lacunas?: string[];
  /** O que já foi decidido — para o agente não re-litigar decisão tomada. */
  jaDecididas?: string[];
}

/**
 * SPEC-57 fatia C (M4/M5) — o agente PROPÕE decisões a partir do desenho
 * **medido**.
 *
 * A tese da SPEC-56 §0.7 é que o motor mede, o agente explica e a pessoa
 * decide. Este pedido é o elo do meio, e três disciplinas o separam de "gerar
 * ADRs com IA":
 *
 * 1. **Ele recebe a MEDIÇÃO, não só o desenho.** As violações de padrão (com o
 *    porquê de cada padrão) e as lacunas de propósito entram no prompt. Um
 *    agente que só vê o diagrama produz decisão genérica de blog; um que vê o
 *    que está fora da régua produz decisão sobre este desenho.
 * 2. **Ele é obrigado a dar as alternativas descartadas.** `minItems: 2` no
 *    esquema, e não é formalidade: proposta com uma opção só é a opinião do
 *    modelo vestida de decisão, e a pessoa não teria contra o que pesar.
 * 3. **Nada disso conta ao chegar.** Vira `status: "proposta"`, `origem:
 *    "sugerido"` — não vai à spec, não conta no placar de vigentes, e o
 *    `porque` passa a ser de quem aceitar.
 *
 * Lista vazia é resposta correta e está dito no prompt: desenho sem escolha
 * real em aberto não deve produzir decisão inventada para preencher a cota.
 */
export function montarPedidoDecisoes(entrada: EntradaDecisoes): PedidoIa {
  const {
    contextoEpico,
    contextoDoProduto,
    componentes = [],
    violacoes = [],
    lacunas = [],
    jaDecididas = [],
  } = entrada;

  if (componentes.length === 0) {
    throw new PedidoInvalido(
      "não há componentes no desenho — decisão de arquitetura se ancora em um elemento; desenhe antes de pedir"
    );
  }

  const idsDeComponente = componentes.map((c) => c.id);

  const esquema = {
    type: "object",
    properties: {
      decisoes: {
        type: "array",
        maxItems: MAX_DECISOES,
        items: {
          type: "object",
          properties: {
            noId: { enum: idsDeComponente },
            titulo: { type: "string" },
            contexto: { type: "string" },
            alternativas: {
              type: "array",
              // Duas é a régua da fatia C: com uma só isto é um campo com
              // comentário, não uma decisão.
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: { titulo: { type: "string" }, consequencia: { type: "string" } },
                required: ["titulo", "consequencia"],
              },
            },
            escolhida: { type: "string" },
            porque: { type: "string" },
          },
          required: ["noId", "titulo", "alternativas", "escolhida", "porque"],
        },
      },
    },
    required: ["decisoes"],
  } as EsquemaJson;

  const prompt = [
    `Você ajuda um time a registrar POR QUE o desenho é como é.`,
    `Proponha DECISÕES DE ARQUITETURA para este desenho — escolhas entre alternativas, ancoradas em um componente.`,
    ``,
    ...(contextoDoProduto?.trim() ? [`Produto:`, contextoDoProduto.trim(), ``] : []),
    ...(contextoEpico?.trim() ? [`Demanda:`, contextoEpico.trim(), ``] : []),
    `Componentes desenhados (use exclusivamente estes ids em "noId"):`,
    ...componentes.map((c) => `- ${c.id}: ${c.rotulo} (${c.tipo})${c.campos ? ` — ${c.campos}` : ""}`),
    ``,
    // O que o motor JÁ MEDIU. É isto que faz a proposta ser sobre este desenho
    // e não sobre arquitetura em geral.
    ...(violacoes.length > 0
      ? [
          `O motor já mediu e apontou fora do padrão:`,
          ...violacoes.map(
            (v) =>
              `- ${v.noId}.${v.campo}: esperado ${v.esperado}, está ${v.atual}${v.porque ? ` — o padrão existe porque: ${v.porque}` : ""}`
          ),
          ``,
        ]
      : []),
    ...(lacunas.length > 0
      ? [`Propósitos ainda sem componente que responda por eles:`, ...lacunas.map((l) => `- ${l}`), ``]
      : []),
    ...(jaDecididas.length > 0
      ? [`Já decidido (NÃO proponha de novo, nem o contrário sem motivo novo):`, ...jaDecididas.map((t) => `- ${t}`), ``]
      : []),
    `Regras:`,
    `- Decisão é escolha ENTRE ALTERNATIVAS. Preencher um campo NÃO é decisão:`,
    `  "definir timeout = 300ms" é valor, não ADR. "fila em vez de chamada síncrona" é ADR.`,
    `- Cada proposta precisa de pelo menos DUAS alternativas, e cada descartada precisa da`,
    `  "consequencia": o que custaria escolhê-la. É contra isso que a pessoa vai pesar a sua escolha.`,
    `- "porque" é a razão que ainda vai valer daqui a um ano — o trade-off, não a repetição do título.`,
    `- Prefira decisões que expliquem o que o motor apontou acima: um desenho fora do padrão ou é erro`,
    `  (e vira correção) ou é escolha consciente (e vira decisão com motivo). Diga qual dos dois você acha.`,
    `- Se não houver escolha real em aberto, devolva "decisoes" VAZIA. Lista vazia é resposta correta;`,
    `  decisão inventada para preencher cota faz a pessoa parar de ler todas.`,
    `- No máximo ${MAX_DECISOES}.`,
    `- Responda em português.`,
  ].join("\n");

  return { prompt, esquema };
}

const MAX_CENARIOS = 5;

export interface EntradaCenariosDeLentidao {
  contextoEpico?: string;
  contextoDoProduto?: string;
  /**
   * Os elementos que PODEM ficar lentos — os que declaram tempo. Só eles, e o
   * `enum` do esquema fecha em cima disso: um ajuste sobre um elemento que não
   * tem duração seria um controle que não controla nada.
   */
  elementos?: { tipo: "no" | "aresta"; id: string; rotulo: string; msAtual?: number; externo?: boolean }[];
  /** O que o motor JÁ leu do desenho — é o que faz a proposta ser sobre ESTE
   * desenho, e não sobre arquitetura em geral. */
  respostaAtualMs?: number;
  respostaEhPiso?: boolean;
  /** Para não propor de novo o mesmo ensaio. */
  jaExistentes?: string[];
}

/**
 * SPEC-66 fatia D — o modelo propõe a PAUTA do ensaio, nunca o resultado.
 *
 * A divisão é a que sustenta a SPEC inteira: "se o bureau responder em 8 s,
 * quanto demora a resposta?" é aritmética sobre o grafo — determinística, e
 * **a mesma resposta toda vez**. Um modelo trocaria uma resposta exata por uma
 * plausível, e ninguém deveria decidir arquitetura com número que muda entre
 * execuções.
 *
 * O que ele faz melhor é saber QUE cenários merecem ensaio: bureau em pico,
 * cache frio depois do deploy, timeout do cliente menor que a soma dos
 * internos. Conhecimento de mundo, não conta.
 *
 * Por isso o esquema **não tem campo para tempo de resposta**. Um modelo
 * prestativo devolveria "resultadoMs" por conta própria, e um número inventado
 * ao lado dos calculados corrói a confiança na tabela inteira — então ele não
 * cabe na forma da resposta, e a regra também está escrita no prompt.
 */
export function montarPedidoCenariosDeLentidao(entrada: EntradaCenariosDeLentidao): PedidoIa {
  const { contextoEpico, contextoDoProduto, elementos = [], respostaAtualMs, respostaEhPiso, jaExistentes = [] } =
    entrada;

  if (elementos.length === 0) {
    throw new PedidoInvalido(
      "nenhum componente deste desenho declara tempo — não há o que ficar lento; preencha ao menos um timeout antes de pedir cenários"
    );
  }

  const ids = elementos.map((e) => e.id);

  const esquema = {
    type: "object",
    properties: {
      cenarios: {
        type: "array",
        maxItems: MAX_CENARIOS,
        items: {
          type: "object",
          properties: {
            nome: { type: "string" },
            porque: { type: "string" },
            ajustes: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  id: { enum: ids },
                  // Só multiplicador. Valor absoluto convidaria o modelo a
                  // afirmar um SLA que ele não tem como conhecer.
                  fator: { type: "number" },
                },
                required: ["id", "fator"],
              },
            },
          },
          required: ["nome", "porque", "ajustes"],
        },
      },
    },
    required: ["cenarios"],
  } as EsquemaJson;

  const prompt = [
    `Você ajuda um time a ensaiar o que acontece com a resposta de um sistema quando algo fica lento.`,
    `Proponha CENÁRIOS DE LENTIDÃO plausíveis para este desenho.`,
    ``,
    ...(contextoDoProduto?.trim() ? [`Produto:`, contextoDoProduto.trim(), ``] : []),
    ...(contextoEpico?.trim() ? [`Demanda:`, contextoEpico.trim(), ``] : []),
    `Componentes que podem ficar lentos (use exclusivamente estes ids):`,
    ...elementos.map(
      (e) =>
        `- ${e.id}: ${e.rotulo}${e.externo ? " [de terceiro]" : ""}${
          e.msAtual !== undefined ? ` — hoje ${e.msAtual} ms` : " — sem tempo declarado"
        }`
    ),
    ``,
    ...(respostaAtualMs !== undefined
      ? [`Hoje a resposta de ponta a ponta soma ${respostaAtualMs} ms${respostaEhPiso ? " (no mínimo)" : ""}.`, ``]
      : []),
    ...(jaExistentes.length > 0
      ? [`Cenários que já existem (NÃO repita):`, ...jaExistentes.map((n) => `- ${n}`), ``]
      : []),
    `Regras:`,
    `- NÃO calcule nem devolva tempo de resposta. Quem calcula é o motor, e um número seu ao lado`,
    `  dos calculados faria a tabela inteira deixar de ser confiável. Devolva só QUAL componente`,
    `  fica lento e QUANTAS VEZES pior ("fator").`,
    `- Prefira o que acontece de verdade em produção: dependência de terceiro degradada em horário`,
    `  de pico, cache frio depois do deploy, banco em failover, vizinho barulhento.`,
    `- "porque" é o que faz alguém levar o cenário a sério: a circunstância real em que ele ocorre.`,
    `  Um nome bonito sem circunstância é um cenário que ninguém sabe avaliar.`,
    `- Componente de terceiro merece atenção especial: é o que o time não controla.`,
    `- Fator entre 2 e 20. Abaixo de 2 não é lentidão, acima de 20 é indisponibilidade — e para`,
    `  indisponibilidade a pergunta certa é outra.`,
    `- Se o desenho não sugerir nenhum cenário digno, devolva "cenarios" VAZIA. Lista vazia é`,
    `  resposta correta; cenário inventado para preencher cota faz a pessoa parar de ler todos.`,
    `- No máximo ${MAX_CENARIOS}.`,
    `- Responda em português.`,
  ].join("\n");

  return { prompt, esquema };
}

const MAX_NECESSIDADES = 8;

export interface EntradaNecessidades {
  /** `quebra.demandInfo` — a descrição em prosa de que a demanda trata. */
  contextoEpico?: string;
  /** SPEC-53 — o vocabulário do produto, para a necessidade falar a língua do negócio. */
  contextoDoProduto?: string;
  /** Os nós do desenho, para o agente já propor o vínculo. Vazio = mesa em branco. */
  componentes?: { id: string; rotulo: string; tipo: string }[];
  /** O que já foi declarado — para não propor de novo o mesmo propósito. */
  jaDeclaradas?: string[];
}

/**
 * SPEC-57 fatia D — o agente PROPÕE o propósito da demanda, lendo o contexto
 * que já existe.
 *
 * Duas disciplinas que este pedido carrega, e que o diferenciam de "gerar
 * requisitos com IA":
 *
 * 1. **Ele propõe o VÍNCULO junto.** Necessidade sem componente é lacuna, e
 *    uma proposta que só cria lacuna transfere trabalho em vez de adiantar.
 *    Quando o desenho já tem componentes, o agente diz qual responde por quê —
 *    e erra na frente da pessoa, que é o lugar certo de errar.
 * 2. **Nada disso conta ao chegar.** A resposta vira `origem: "sugerido"`, e a
 *    regra 2 já cuida do resto: não fecha lacuna, não é citada no documento e
 *    não dá nó por atendido até alguém confirmar.
 */
export function montarPedidoNecessidades(entrada: EntradaNecessidades): PedidoIa {
  const { contextoEpico, contextoDoProduto, componentes = [], jaDeclaradas = [] } = entrada;

  if (!contextoEpico?.trim() && !contextoDoProduto?.trim()) {
    throw new PedidoInvalido(
      "sem contexto da demanda nem do produto — não há de onde tirar o propósito; escreva o contexto do épico antes"
    );
  }

  const idsDeComponente = componentes.map((c) => c.id);

  const esquema = {
    type: "object",
    properties: {
      necessidades: {
        type: "array",
        minItems: 1,
        maxItems: MAX_NECESSIDADES,
        items: {
          type: "object",
          properties: {
            texto: { type: "string" },
            prioridade: { enum: ["alta", "media", "baixa"] },
            // Sem componente no desenho, o enum ficaria vazio e o modelo não
            // teria o que responder — aí o campo some do esquema.
            ...(idsDeComponente.length > 0
              ? { atendidaPor: { type: "array", items: { enum: idsDeComponente } } }
              : {}),
            motivo: { type: "string" },
          },
          required: ["texto", "prioridade", "motivo"],
        },
      },
    },
    required: ["necessidades"],
  } as EsquemaJson;

  const prompt = [
    `Você ajuda um time a explicitar O QUE a demanda precisa resolver, antes de desenhar a solução.`,
    `Proponha as NECESSIDADES desta demanda: os propósitos que a entrega tem que atender.`,
    ``,
    ...(contextoDoProduto?.trim() ? [`Produto:`, contextoDoProduto.trim(), ``] : []),
    ...(contextoEpico?.trim() ? [`Demanda:`, contextoEpico.trim(), ``] : []),
    ...(jaDeclaradas.length > 0
      ? [`Já declaradas (NÃO repita nem reescreva estas):`, ...jaDeclaradas.map((t) => `- ${t}`), ``]
      : []),
    ...(componentes.length > 0
      ? [
          `Componentes já desenhados (use exclusivamente estes ids em "atendidaPor"):`,
          ...componentes.map((c) => `- ${c.id}: ${c.rotulo} (${c.tipo})`),
          ``,
        ]
      : []),
    `Regras:`,
    `- Necessidade é o QUE precisa ser verdade quando a entrega terminar, não COMO se faz.`,
    `  Bom: "o pedido não pode ser cobrado duas vezes". Ruim: "usar chave de idempotência no worker".`,
    `- Uma frase por necessidade, no vocabulário do negócio, verificável.`,
    componentes.length > 0
      ? `- "atendidaPor": os componentes que respondem por ela. Deixe VAZIO se nenhum dos desenhados responde — a lacuna é informação, não falha sua.`
      : `- Não há componentes desenhados ainda; proponha só as necessidades.`,
    `- "motivo" explica em uma frase por que isto é necessidade DESTA demanda.`,
    `  É o que a pessoa lê para decidir se aceita — sem ele a proposta é caixa-preta.`,
    `- No máximo ${MAX_NECESSIDADES}. Proponha o que a demanda realmente exige; lista inflada`,
    `  faz a pessoa aceitar sem ler, que é pior que não propor.`,
    `- Responda em português.`,
  ].join("\n");

  return { prompt, esquema };
}

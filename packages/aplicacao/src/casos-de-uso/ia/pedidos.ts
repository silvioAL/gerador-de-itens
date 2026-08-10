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

const PREAMBULO_PADRAO_POR_PAPEL: Record<string, string> = {
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
const PREAMBULO_GENERICO =
  `Você ajuda a especificar tecnicamente um item de trabalho de software.`;

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

export interface EntradaPipeline {
  /** Já resolvido pela borda a partir da config da esteira (Fase 3). */
  preambulo: string;
  contextoEpico?: string;
  itens: ItemDoLote[];
}

export function montarPedidoPipeline({ preambulo, contextoEpico, itens }: EntradaPipeline): PedidoIa {
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
    ...(contextoEpico ? [`Contexto geral da demanda/épico:`, contextoEpico, ``] : []),
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
}

/** ACHADO REAL (SPEC-27 Fase 1): array de tamanho aberto na grammar deixa a
 * geração sem fim — a primeira validação passou de 25 minutos. Teto explícito,
 * e dito no prompt também: o modelo não "vê" a grammar, só é barrado por ela. */
const MAX_NOS = 10;
const MAX_ARESTAS = 15;

export function montarPedidoDiagrama(entrada: EntradaDiagrama & { imagens?: string[] }): PedidoIa {
  const { descricao, tiposDeNo, tiposDeConexao, techs, contextos, perfilTime, imagens } = entrada;

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
}

export function montarPedidoAlterarItem(entrada: EntradaAlterarItem): PedidoIa {
  const { instrucao, itemRotulo, contextoNo, campos, oQueMudou, contextoEpico } = entrada;

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
    ...(contextoEpico?.trim() ? [``, `Contexto da demanda:`, contextoEpico.trim(), ``] : []),
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

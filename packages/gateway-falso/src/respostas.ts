/**
 * SPEC-74 fatia C — respostas com FORMA e TAMANHO realistas, por tipo de pedido.
 *
 * ## O problema que isto resolve
 *
 * O dublê nasceu para provar mecanismo: qualquer string serve, desde que o
 * campo certo receba o texto certo. Quem **desenvolve uma tela** precisa do
 * contrário — precisa ver o que acontece com um motivo de três linhas, com uma
 * lista de oito necessidades, com um rótulo curto ao lado de um parágrafo. Um
 * `"escrito-pelo-gateway-falso (nos[0].motivo)"` em todo campo esconde
 * exatamente o que se quer avaliar.
 *
 * ## Por que os dois modos convivem
 *
 * A suíte E2E depende do texto por CAMINHO DE CAMPO — `ia-hospedada.spec.ts`
 * afirma `escrito-pelo-gateway-falso.*\(label\)`. Trocar as respostas por
 * curadas quebraria a rede de segurança de todo o resto do repositório. Por
 * isso o modo `esqueleto` continua sendo o DEFAULT, e o `plausivel` é ligado
 * por ambiente — é o serviço do compose que o liga, não o Playwright.
 *
 * ## Por que ler o schema em vez de guardar payloads prontos
 *
 * Os esquemas destes pedidos são MONTADOS a partir da config do time: os `enum`
 * de tipo de nó, de chave de campo e de id de componente mudam por instalação.
 * Um payload gravado à mão ficaria inválido na primeira config diferente — e
 * inválido aqui significa retry do provedor e um teste lento sem motivo
 * aparente. Então o gerador PASSEIA no schema recebido, exatamente como o
 * `preencher` do esqueleto, e só troca o que escreve nas folhas de texto.
 */

/** Os tipos de pedido que o produto faz. Ver `casos-de-uso/ia/pedidos.ts`. */
export type TipoDePedido =
  | "pipeline"
  | "diagrama"
  | "alterar-item"
  | "sugerir-config"
  | "configurar"
  | "decisoes"
  | "cenarios-de-lentidao"
  | "necessidades"
  | "sugerir-campo"
  | "desconhecido";

/**
 * A primeira linha de cada prompt é única e estável, e é por ela que o dublê
 * reconhece o pedido — sem parsear nada e sem depender do schema.
 *
 * Os marcadores vão SEM pontuação final de propósito. A pontuação é a parte do
 * texto que mais muda por revisão de escrita, e amarrar o reconhecimento a ela
 * seria trocar uma falha alta (o teste abaixo) por uma baixa (o dublê cai no
 * fallback em silêncio, e alguém descobre olhando a tela).
 *
 * Isso deixa "…de trabalho de software" prefixo de DOIS pedidos —
 * `sugerir-config` e a conversa de configuração, que continua com ", conversando".
 * Por isso a ORDEM é significativa: o mais específico primeiro. Inverter os dois
 * faz a conversa responder no formato da sugestão avulsa, e há teste para isso.
 *
 * Se um destes textos mudar em `pedidos.ts`, `respostas.test.ts` fica vermelho:
 * a tabela é conferida contra os montadores de verdade, não contra si mesma.
 */
const MARCADORES: [TipoDePedido, string][] = [
  ["configurar", "Você ajuda a configurar uma ferramenta de refinamento de itens de trabalho de software, conversando"],
  ["sugerir-config", "Você ajuda a configurar uma ferramenta de refinamento de itens de trabalho de software"],
  ["pipeline", "Você vai responder um LOTE de"],
  ["diagrama", "Você é o arquiteto de software que desenha a solução antes do time começar a implementar"],
  ["alterar-item", "Você revisa itens de trabalho de software já especificados"],
  ["decisoes", "Você ajuda um time a registrar POR QUE o desenho é como é"],
  [
    "cenarios-de-lentidao",
    "Você ajuda um time a ensaiar o que acontece com a resposta de um sistema quando algo fica lento",
  ],
  ["necessidades", "Você ajuda um time a explicitar O QUE a demanda precisa resolver, antes de desenhar a solução"],
  ["sugerir-campo", "Você ajuda a especificar um requisito técnico de refinamento de software"],
];

export function tipoDoPedido(prompt: string): TipoDePedido {
  for (const [tipo, marcador] of MARCADORES) if (prompt.includes(marcador)) return tipo;
  return "desconhecido";
}

/** Só para o teste conferir que a tabela cobre todos os montadores. */
export function marcadoresConhecidos(): [TipoDePedido, string][] {
  return MARCADORES.map(([t, m]) => [t, m]);
}

/**
 * Hash estável de string. §5.3 da SPEC pede variação DETERMINÍSTICA: texto
 * sempre igual é bom para teste e péssimo para avaliar tela (três cartões
 * idênticos não mostram como a lista respira), e texto aleatório tornaria o
 * dublê irreprodutível. O pedido inteiro é a semente, então o mesmo pedido
 * devolve sempre a mesma resposta — e dois pedidos diferentes, respostas
 * diferentes.
 */
function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escolher<T>(lista: readonly T[], n: number): T {
  return lista[n % lista.length];
}

/**
 * O vocabulário, por NOME DE CAMPO e não por tipo de pedido.
 *
 * A chave do campo é o que diz o que se espera ali — `motivo` pede uma frase
 * causal, `rotulo` pede um identificador curto, `porque` pede um parágrafo. E
 * ela é estável entre os pedidos: `motivo` significa a mesma coisa no diagrama
 * e nas necessidades. Uma tabela por tipo repetiria as mesmas frases nove
 * vezes.
 *
 * Os tamanhos são deliberadamente DESIGUAIS dentro de cada lista: é a única
 * forma de a tela mostrar o que faz com um texto que estoura a linha ao lado de
 * um que não estoura.
 */
const VOCABULARIO: Record<string, readonly string[]> = {
  rotulo: ["propostas-aprovadas", "servico-de-cotacao", "bureau-credito-nacional", "consolidador-de-parcelas"],
  nome: [
    "Bureau lento no pico do fim do mês",
    "Fila de aprovadas acumulando",
    "Timeout curto demais na cotação",
    "Retentativa em cascata entre serviço e bureau",
  ],
  titulo: [
    "Publicar o evento de proposta aprovada",
    "Consultar o bureau de crédito com teto de tempo",
    "Guardar a decisão de risco para auditoria",
    "Reprocessar o que caiu na fila morta",
  ],
  texto: [
    "A proposta aprovada precisa chegar ao parceiro em até 5 segundos, mesmo no pico do fim do mês.",
    "Nenhuma decisão de crédito pode ser tomada sem registro de qual regra a produziu.",
    "O cliente precisa conseguir acompanhar o andamento sem abrir chamado.",
    "A operação tem que sobreviver ao bureau fora do ar, mesmo que degradada.",
  ],
  motivo: [
    "O volume declarado na demanda satura o pool antes de o timeout do chamador expirar.",
    "É a única etapa do caminho que não tem como ser refeita sem falar com o cliente de novo.",
    "O componente já existe e responde por isto hoje — trazer a responsabilidade para cá duplicaria a regra.",
    "Sem este passo o desenho não tem onde registrar o porquê, e a auditoria pede exatamente isso.",
  ],
  porque: [
    "Entre segurar a resposta e devolver um estado parcial, o time escolheu o estado parcial: a chamada tem um teto de tempo acordado com o parceiro, e estourá-lo custa mais que uma resposta incompleta que o cliente vê sendo completada.",
    "A alternativa síncrona é mais simples de escrever e mais cara de operar: qualquer lentidão do bureau vira lentidão da porta de entrada, e a porta de entrada é compartilhada com o fluxo que não depende de crédito.",
    "Foi medido, não estimado: com o volume que a demanda declara, o pool atual não fecha a conta da Lei de Little, e aumentar o pool empurra o problema para o banco.",
  ],
  contexto: [
    "Hoje a consulta é síncrona e o parceiro tem SLA de 800 ms; a demanda multiplica o volume por cinco no fim do mês.",
    "O fluxo nasceu monolítico e foi partido em dois no ano passado, e a fronteira ficou onde estava a transação, não onde está o negócio.",
  ],
  escolhida: [
    "Publicar de forma assíncrona e confirmar depois",
    "Chamar com teto de tempo e cair para o cache",
    "Manter síncrono e reduzir o escopo da consulta",
  ],
  consequencia: [
    "Simplifica a leitura do código e transfere a complexidade para a operação — quem estiver de plantão passa a precisar do painel para responder 'já foi?'.",
    "Custa uma tabela a mais e devolve previsibilidade: o pico deixa de ser sentido pela porta de entrada.",
    "Não muda nada hoje e cobra na primeira vez que o parceiro ficar lento.",
  ],
  valor: [
    "Consultar o bureau com teto de 800 ms, caindo para o último score conhecido quando estourar, e marcar a decisão como degradada.",
    "Publicar o evento com chave de idempotência igual ao id da proposta, para reprocesso não duplicar parceiro.",
  ],
  instrucao: [
    "Criar um campo de teto de tempo por conexão, obrigatório em conexões que esperam resposta.",
    "Acrescentar a regra de que toda fila precisa declarar o destino do que falhar.",
  ],
  ajuda: ["Em milissegundos. Deixe vazio se este passo não espera resposta."],
  descricao: [
    "Responde pelo desenho da solução antes de o time começar, e é quem registra o porquê das escolhas estruturais.",
  ],
  observacao: ["Vale para o time inteiro; casos fora da régua entram como exceção com motivo."],
  key: ["tetoDeTempoMs", "chaveDeIdempotencia", "destinoDoQueFalhar"],
  label: ["Teto de tempo (ms)", "Chave de idempotência", "Destino do que falhar"],
  preambulo: [
    "Você escreve a história de usuário e os critérios de aceite deste item. A persona nunca é quem constrói o software.",
  ],
};

/** Frase de tamanho médio para campo de texto sem vocabulário próprio. */
const GENERICO = [
  "Escrito pelo modo sem custo: tem a forma e o tamanho de uma resposta de verdade, e nenhum modelo foi consultado.",
  "Texto de exemplo com comprimento realista, para a tela mostrar como se comporta quando o conteúdo não cabe numa linha só.",
  "Resposta simulada, com o tamanho aproximado do que um modelo devolveria neste campo.",
] as const;

/**
 * Quantos itens uma lista deve ter para a tela ser avaliável.
 *
 * Um item só nunca mostra o que a lista faz — não há espaçamento entre cartões,
 * não há rolagem, não há "e mais 3". `minItems`/`maxItems` do schema continuam
 * mandando: este número é uma PREFERÊNCIA, e a conta abaixo a espreme entre os
 * dois limites.
 */
const QUANTIDADE_PREFERIDA: Record<string, number> = {
  nos: 4,
  arestas: 3,
  decisoes: 2,
  alternativas: 3,
  necessidades: 4,
  cenarios: 3,
  ajustes: 2,
  alteracoes: 2,
  propostas: 2,
  atendidaPor: 1,
  contextos: 2,
  opcoes: 3,
};

function ultimaChave(caminho: string): string {
  const semIndice = caminho.replace(/\[\d+\]$/, "");
  return semIndice.slice(semIndice.lastIndexOf(".") + 1);
}

/**
 * Passeia o schema como o `preencher` do esqueleto, e só troca o que escreve
 * nas folhas de texto. Manter os dois passeios com a MESMA leitura de `enum`,
 * `minItems` e `required` é o que garante que ligar o modo plausível não
 * transforma uma resposta válida numa inválida.
 */
export function plausivel(schema: unknown, sementeDoPedido: number, caminho = ""): unknown {
  const s = (schema ?? {}) as Record<string, unknown>;
  const chave = ultimaChave(caminho);
  const n = sementeDoPedido + caminho.length * 31 + (caminho.charCodeAt(caminho.length - 1) || 0);

  if (Array.isArray(s.enum)) return escolher(s.enum, n);

  if (s.type === "array") {
    const minimo = typeof s.minItems === "number" && s.minItems > 0 ? s.minItems : 1;
    const maximo = typeof s.maxItems === "number" ? s.maxItems : Number.POSITIVE_INFINITY;
    const preferida = QUANTIDADE_PREFERIDA[chave] ?? 2;
    const quantidade = Math.max(minimo, Math.min(maximo, preferida));
    return Array.from({ length: quantidade }, (_, i) => plausivel(s.items, sementeDoPedido, `${caminho}[${i}]`));
  }

  if (s.type === "boolean") return (n & 1) === 0;
  // Números aqui são sempre grandeza de engenharia (fator de volume, teto de
  // tempo). `1` passa no schema e não mostra nada na tela: um fator 1 não muda
  // ensaio nenhum, e um gráfico com todos os valores iguais é um gráfico vazio.
  if (s.type === "number" || s.type === "integer") return escolher([2, 3, 5, 10], n);

  if (s.type === "object" || s.properties) {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(props).map(([k, sub]) => [k, plausivel(sub, sementeDoPedido, caminho ? `${caminho}.${k}` : k)])
    );
  }

  const lista = VOCABULARIO[chave] ?? GENERICO;
  return escolher(lista, n);
}

/**
 * A resposta de TEXTO LIVRE — hoje o pior caso do dublê.
 *
 * `/ia/sugerir` não manda schema, então o esqueleto cai no ramo livre e devolve
 * `escrito-pelo-gateway-falso: ok`. Uma sugestão de campo que responde "ok" não
 * deixa avaliar nem o campo, nem a quebra de linha, nem o botão de aceitar.
 */
export function textoLivrePlausivel(tipo: TipoDePedido, sementeDoPedido: number): string {
  if (tipo === "sugerir-campo") return escolher(VOCABULARIO.valor, sementeDoPedido);
  return escolher(GENERICO, sementeDoPedido);
}

/** O que o handler chama: decide o tipo, e devolve a resposta com a forma dele. */
export function respostaPlausivel(prompt: string, schema: unknown | null): string {
  const tipo = tipoDoPedido(prompt);
  const n = semente(prompt);
  return schema === null ? textoLivrePlausivel(tipo, n) : JSON.stringify(plausivel(schema, n));
}

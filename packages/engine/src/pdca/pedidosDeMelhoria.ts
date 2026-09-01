/**
 * SPEC-94 (§344) — **o pedido de melhoria: um fluxo só, com estados.**
 *
 * ## O incômodo que originou isto
 *
 * O usuário, olhando a tela do PDCA rodando: *"os pedidos ficam ali colapsados,
 * é difícil explicar, mas tenho impressão que deveria ter mais cara de sistema
 * de atendimento de chamados, e também ter uma visão com métricas"*.
 *
 * E, logo depois: *"não são chamados, apenas quis passar o conceito"* — **a
 * metáfora é da FORMA, não do vocabulário.** O que se toma emprestado de um
 * sistema de atendimento é a fila com estado, o filtro, a ordenação e o detalhe
 * sob demanda. O que **não** se toma é a palavra: isto não é suporte a
 * incidente, é melhoria contínua, e chamar de "chamado" importaria a semântica
 * errada para o vocabulário do produto — o mesmo cuidado que a §1.4 teve com
 * "níveis".
 *
 * O nome fica `PedidoDeMelhoria`, que já é o que o produto diz: a rota é
 * `/ajustes`, a tabela é `solicitacoes_ajuste`, e a tela se chama *"PDCA —
 * melhoria contínua"*.
 *
 * ## O que foi medido
 *
 * Contra a stack: 8 pedidos ocupavam **1086 px** de cards (136 px cada), **sem
 * filtro, sem busca e sem ordenação** — e um pedido *aplicado* há um mês ocupava
 * o mesmo espaço visual de um *pendente* há 19 dias. Com 30, seriam ~4000 px de
 * rolagem para achar o que precisa de ação.
 *
 * E havia **duas listas para o mesmo assunto**: "o que disseram" (o feedback) e
 * "solicitações de ajuste" — sendo que um vira o outro.
 *
 * ## Por que a união acontece AQUI, e não no banco
 *
 * O usuário disse que o banco não é preocupação (o produto está em
 * desenvolvimento), o que autorizaria mesclar as tabelas. **Não é preciso, e por
 * isso não se faz:** os dois registros têm ciclos de vida próprios e legítimos —
 * o feedback é o texto de quem usou, a solicitação é o pedido estruturado com
 * versão-alvo e operação aplicável.
 *
 * O que faltava não era uma tabela: era **uma leitura**. Unir por derivação é
 * puro, testável, não pede migração e é reversível — se a fila se mostrar a
 * ideia errada, some sem deixar coluna órfã.
 *
 * ## O ciclo de vida
 *
 * ```
 *   aberto ──triagem──▶ triado ──decisão──▶ aprovado ──▶ aplicado
 *      │                   │                    │
 *      └──▶ descartado     └──▶ recusado / invalidado
 * ```
 *
 * Um pedido nasce dos dois lados: **pelo feedback** (alguém respondeu ao
 * assistente) ou **direto** (quem já sabe o que quer pedir). Nos dois casos é um
 * pedido — e é isso que a tela precisava dizer.
 */

/** Onde o pedido está. A ordem aqui é a do ciclo. */
export const ESTADOS_DO_PEDIDO = [
  "aberto",
  "triado",
  "aprovado",
  "aplicado",
  "recusado",
  "invalidado",
  "descartado",
] as const;

export type EstadoDoPedido = (typeof ESTADOS_DO_PEDIDO)[number];

/**
 * Os estados que **esperam alguém** — o corte que a fila usa por padrão, porque
 * é a pergunta de quem abre a tela: *o que precisa de mim?*
 *
 * `aprovado` está aqui de propósito: aprovar não aplica (`POST
 * /ajustes/:id/aplicar` é outro passo), e um pedido aprovado e não aplicado é
 * trabalho parado que **parecia** concluído — foi o defeito do §244.
 */
export const ESTADOS_ABERTOS: EstadoDoPedido[] = ["aberto", "triado", "aprovado"];

export interface FeedbackDoPedido {
  id: string;
  email: string;
  timeId: string | null;
  texto: string;
  /** `novo | virou-ajuste | descartado`. */
  estado: string;
  solicitacaoId: string | null;
  criadoEm: Date;
}

export interface SolicitacaoDoPedido {
  id: string;
  timeId: string | null;
  solicitante: string;
  recurso: string;
  descricao: string;
  /** `pendente | aprovada | rejeitada | invalida | aplicada`. */
  estado: string;
  criadoEm: Date;
  decididoEm?: Date | null;
  decididoPor?: string | null;
  motivoDaDecisao?: string | null;
  operacao?: unknown;
}

export interface PedidoDeMelhoria {
  /** Estável e único na fila. Havendo feedback, é o id dele — porque é onde o
   *  pedido começou, e o id não pode mudar quando ele avança de estado. */
  id: string;
  estado: EstadoDoPedido;
  /** O que a fila mostra numa linha. Nunca vazio. */
  titulo: string;
  /** O texto inteiro, para o detalhe e para a busca. */
  texto: string;
  autor: string;
  timeId: string | null;
  /** A área da configuração, quando o pedido já foi triado. */
  recurso?: string;
  abertoEm: Date;
  /** Quando algo aconteceu com ele pela última vez. É por aqui que a fila
   *  ordena os fechados: o que mudou há pouco interessa mais. */
  atualizadoEm: Date;
  /** Há quantos dias existe. É o que revela o esquecido. */
  diasEmAberto: number;
  feedbackId?: string;
  solicitacaoId?: string;
  /** Pedido só em texto não aplica sozinho — a mudança é feita à mão na tela de
   *  configuração. A fila diz isso antes da decisão. */
  temOperacao: boolean;
  motivoDaDecisao?: string | null;
  decididoPor?: string | null;
}

const DIA = 24 * 3600_000;

const ESTADO_DA_SOLICITACAO: Record<string, EstadoDoPedido> = {
  pendente: "triado",
  aprovada: "aprovado",
  aplicada: "aplicado",
  rejeitada: "recusado",
  invalida: "invalidado",
};

/**
 * Une feedbacks e solicitações num fluxo só.
 *
 * `agora` é parâmetro pelo mesmo motivo de `metricasDoCiclo`: `Date.now()`
 * escondido num cálculo é estado, e faz o mesmo dado produzir resultado
 * diferente conforme o dia.
 */
export function montarPedidos(
  feedbacks: FeedbackDoPedido[],
  solicitacoes: SolicitacaoDoPedido[],
  agora: Date,
): PedidoDeMelhoria[] {
  const porId = new Map(solicitacoes.map((s) => [s.id, s]));
  /** As solicitações que já têm um feedback na frente — para o mesmo pedido não
   *  aparecer duas vezes, que é exatamente o que as duas listas faziam. */
  const jaCobertas = new Set<string>();

  const comFeedback = feedbacks.map((f) => {
    const s = f.solicitacaoId ? porId.get(f.solicitacaoId) : undefined;
    if (s) jaCobertas.add(s.id);

    /**
     * O estado vem da SOLICITAÇÃO quando ela existe.
     *
     * O feedback fica em `virou-ajuste` para sempre depois da triagem — ele não
     * sabe se o pedido foi aprovado, recusado ou aplicado. Foi por ler o estado
     * errado que o placar do §276 contava recusa como mudança.
     */
    const estado: EstadoDoPedido = s
      ? (ESTADO_DA_SOLICITACAO[s.estado] ?? "triado")
      : f.estado === "descartado"
        ? "descartado"
        : "aberto";

    return {
      id: f.id,
      estado,
      titulo: resumir(f.texto),
      texto: f.texto,
      autor: f.email,
      timeId: f.timeId,
      recurso: s?.recurso,
      abertoEm: f.criadoEm,
      atualizadoEm: s?.decididoEm ?? s?.criadoEm ?? f.criadoEm,
      diasEmAberto: Math.floor((agora.getTime() - f.criadoEm.getTime()) / DIA),
      feedbackId: f.id,
      solicitacaoId: s?.id,
      temOperacao: !!s?.operacao,
      motivoDaDecisao: s?.motivoDaDecisao ?? null,
      decididoPor: s?.decididoPor ?? null,
    } satisfies PedidoDeMelhoria;
  });

  /** Quem nasceu direto como pedido, sem passar pelo balão do assistente. É um
   *  pedido igual, e sumiria se a fila olhasse só os feedbacks. */
  const diretos = solicitacoes
    .filter((s) => !jaCobertas.has(s.id))
    .map(
      (s) =>
        ({
          id: s.id,
          estado: ESTADO_DA_SOLICITACAO[s.estado] ?? "triado",
          titulo: resumir(s.descricao),
          texto: s.descricao,
          autor: s.solicitante,
          timeId: s.timeId,
          recurso: s.recurso,
          abertoEm: s.criadoEm,
          atualizadoEm: s.decididoEm ?? s.criadoEm,
          diasEmAberto: Math.floor((agora.getTime() - s.criadoEm.getTime()) / DIA),
          solicitacaoId: s.id,
          temOperacao: !!s.operacao,
          motivoDaDecisao: s.motivoDaDecisao ?? null,
          decididoPor: s.decididoPor ?? null,
        }) satisfies PedidoDeMelhoria,
    );

  return ordenar([...comFeedback, ...diretos]);
}

/**
 * A ordem da fila: **quem espera há mais tempo vem primeiro.**
 *
 * É o oposto do que a tela fazia — ela ordenava por mais recente, que é a ordem
 * de um feed. Numa fila de trabalho, o mais novo no topo faz o pedido antigo
 * afundar até ninguém mais o ver; e o esquecido é justamente o que a análise
 * crítica precisa enxergar.
 *
 * Os fechados vão para o fim, e entre eles vale o mais recente: o resolvido é
 * consulta, e consulta se faz do último para trás.
 */
export function ordenar(pedidos: PedidoDeMelhoria[]): PedidoDeMelhoria[] {
  return [...pedidos].sort((a, b) => {
    const abertoA = ESTADOS_ABERTOS.includes(a.estado);
    const abertoB = ESTADOS_ABERTOS.includes(b.estado);
    if (abertoA !== abertoB) return abertoA ? -1 : 1;
    if (abertoA) return a.abertoEm.getTime() - b.abertoEm.getTime();
    return b.atualizadoEm.getTime() - a.atualizadoEm.getTime();
  });
}

export interface FiltroDaFila {
  /** Vazio = todos. */
  estados?: EstadoDoPedido[];
  /** Casa com o texto, o recurso ou o autor — sem diferenciar acento nem caixa. */
  busca?: string;
}

export function filtrar(pedidos: PedidoDeMelhoria[], filtro: FiltroDaFila): PedidoDeMelhoria[] {
  const termo = normalizar(filtro.busca ?? "");
  return pedidos.filter((p) => {
    if (filtro.estados?.length && !filtro.estados.includes(p.estado)) return false;
    if (!termo) return true;
    return normalizar(`${p.texto} ${p.recurso ?? ""} ${p.autor}`).includes(termo);
  });
}

export function contarPorEstado(pedidos: PedidoDeMelhoria[]): Record<EstadoDoPedido, number> {
  const conta = Object.fromEntries(ESTADOS_DO_PEDIDO.map((e) => [e, 0])) as Record<EstadoDoPedido, number>;
  for (const p of pedidos) conta[p.estado] += 1;
  return conta;
}

/**
 * Uma linha de fila precisa de um título, e o que existe é um parágrafo.
 *
 * Corta na primeira quebra de frase, e só então no comprimento — assim o corte
 * cai onde o texto já parava, em vez de no meio de uma palavra. Sem reticências
 * quando coube inteiro: reticência que não esconde nada é ruído.
 */
export function resumir(texto: string, limite = 80): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return "(sem texto)";
  const fim = limpo.search(/[.!?\n]/);
  const base = fim > 0 && fim <= limite ? limpo.slice(0, fim) : limpo;
  return base.length <= limite ? base : `${base.slice(0, limite - 1).trimEnd()}…`;
}

/** Busca que ignora acento: quem procura "invalida" tem que achar "inválida". */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

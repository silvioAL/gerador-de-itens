import { planoDoFluxo, type Fluxo, type NoDoFluxo } from "../config/fluxos.js";

/**
 * SPEC-105 fatia D — **a execução do fluxo, na metade pura.**
 *
 * Quem sabe CHAMAR um conector ou um agente é o servidor (rede, credencial);
 * quem sabe a ORDEM, o que alimenta o quê e o que acontece na falha é isto
 * aqui — testável sem rede, como o executor de um passo da fatia B.
 *
 * §9.3, as três regras:
 * 1. o nó que falha PARA, e os que dependem dele não rodam;
 * 2. os ramos independentes SEGUEM — derrubar tudo perderia trabalho bom;
 * 3. entrada ausente NUNCA vira default — quem barra é o executor do nó
 *    (conector: campo obrigatório; agente: sem entrada nenhuma), e o rastro
 *    diz o porquê.
 */

export interface ExecutoresDoFluxo {
  conector(no: NoDoFluxo, parametros: Record<string, unknown>): Promise<Record<string, unknown>>;
  agente(no: NoDoFluxo, entradas: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** SPEC-107 fatia A — a função do sistema (o motor com contrato). */
  funcao(no: NoDoFluxo, entradas: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** SPEC-107 fatia B — a demanda como capacidade, nas duas direções. */
  projeto(no: NoDoFluxo, entradas: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** SPEC-107 fatia E — a transformação pura (o Set do n8n). */
  transformacao(no: NoDoFluxo, entradas: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export type EstadoDoNo = "sucesso" | "falhou" | "nao-executado";

export interface RastroDoNo {
  noId: string;
  tipo: NoDoFluxo["tipo"];
  refId: string;
  estado: EstadoDoNo;
  erro?: string;
  duracaoMs: number;
  /**
   * SPEC-106 fatia A — o link do que SUBIU, guardado na execução: é a resposta
   * de "onde foi parar?" depois que o rastro descartou as saídas (que são
   * dado, não diagnóstico). Só existe quando a saída do nó trouxe
   * `linkExterno`, que é o contrato de quem publica.
   */
  linkExterno?: string;
  /**
   * SPEC-107 fatia A (§5.4) — as ENTRADAS que um nó de FUNÇÃO recebeu, como
   * chegaram (parâmetros fixos + o que as arestas trouxeram). É a âncora da
   * tese reescrita — "mesma fiação + mesmas entradas → mesmos itens": sem
   * elas, o modo (b) (a derivação aceitando qualquer desenho mapeado) tornaria
   * todo item de origem indizível. Só em nós `funcao`: a saída de um conector
   * pode carregar dado de negócio do outro lado, e o rastro continua
   * diagnóstico, não armazém — mas a ENTRADA de uma função é exatamente o que
   * a auditoria precisa reproduzir.
   */
  entradas?: Record<string, unknown>;
}

export interface ResultadoDoFluxo {
  nos: RastroDoNo[];
  /** A saída de cada nó que rodou — é o que a tela mostra por nó. */
  saidas: Record<string, Record<string, unknown>>;
  /** Presente quando o fluxo nem começou: ciclo é recusa, não falha parcial. */
  ciclo?: string[];
  /**
   * SPEC-107 fatia C (§5.5) — a execução SUSPENDEU no gate deste nó: ele
   * rodou, alguém precisa revisar o stage e continuar (ou descartar). Os nós
   * por vir NÃO entram no rastro — eles não falharam nem foram pulados, estão
   * esperando; quem persiste a execução guarda as saídas para a retomada.
   */
  aguardandoEm?: string;
}

export interface OpcoesDeExecucao {
  /**
   * Executa só ATÉ este nó (ele incluso): o fecho de ancestrais, na mesma
   * ordem. É o "ver o resultado de um agente antes de rodar o próximo" — quem
   * está fiando quer inspecionar o meio sem pagar (nem disparar) o resto, e
   * um conector de escrita no fim do fluxo age no mundo.
   */
  ateNo?: string;
  /**
   * SPEC-107 fatia C — retomar uma execução suspensa: os nós em `concluidos`
   * não rodam de novo (as saídas deles vêm daqui), e a execução segue do
   * ponto exato. Um gate mais adiante suspende de novo — vários pontos de
   * revisão numa fiação são vários, não um.
   */
  retomarDe?: { saidas: Record<string, Record<string, unknown>>; concluidos: string[] };
  /**
   * SPEC-107 fatia D — **o vivo é feedback (§2.4-9)**: quem assiste precisa
   * ver nó a nó acontecendo, não um "rodou" no fim. Os eventos saem na ordem
   * da execução; o TEXTO do agente streama por outro canal (o `onTexto` do
   * executor), porque pedaço de texto é do nó, não do laço.
   */
  aoVivo?: {
    noComecou?(no: NoDoFluxo): void;
    noTerminou?(rastro: RastroDoNo): void;
  };
}

/** O nó pedido e todo mundo de quem ele depende, transitivamente. */
function ancestraisDe(fluxo: Fluxo, noId: string): Set<string> {
  const dentro = new Set<string>([noId]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const aresta of fluxo.arestas) {
      if (dentro.has(aresta.para) && !dentro.has(aresta.de)) {
        dentro.add(aresta.de);
        cresceu = true;
      }
    }
  }
  return dentro;
}

export async function executarFluxo(
  fluxo: Fluxo,
  executores: ExecutoresDoFluxo,
  opcoes: OpcoesDeExecucao = {}
): Promise<ResultadoDoFluxo> {
  const plano = planoDoFluxo(fluxo);
  if (plano.ciclo) return { nos: [], saidas: {}, ciclo: plano.ciclo };

  if (opcoes.ateNo) {
    const dentro = ancestraisDe(fluxo, opcoes.ateNo);
    plano.ordem = plano.ordem.filter((id) => dentro.has(id));
  }

  const porId = new Map(fluxo.nos.map((no) => [no.id, no]));
  const estado = new Map<string, EstadoDoNo>();
  const saidas: Record<string, Record<string, unknown>> = {};
  const rastro: RastroDoNo[] = [];

  // A retomada pré-carrega o que a suspensão deixou: os concluídos não rodam
  // de novo, e as saídas deles alimentam quem vem depois — do ponto exato.
  const concluidos = new Set(opcoes.retomarDe?.concluidos ?? []);
  for (const noId of concluidos) {
    estado.set(noId, "sucesso");
    if (opcoes.retomarDe?.saidas[noId]) saidas[noId] = opcoes.retomarDe.saidas[noId];
  }

  // §368, generalizado pela fatia C (§5.5): o GATE DE CONFIRMAÇÃO. Quando o
  // nó marcado "aguardar" termina, a execução SUSPENDE — nem os ramos
  // independentes seguem, porque o gate é um ponto de REVISÃO do fluxo
  // inteiro (diferente da falha, §9.3, em que derrubar os independentes
  // perderia trabalho bom). Quem revisa continua (ou descarta); os nós por
  // vir ficam FORA do rastro — esperando não é falha nem pulo.
  let aguardandoEm: string | undefined;

  for (const noId of plano.ordem) {
    if (aguardandoEm) break;
    if (concluidos.has(noId)) continue;
    const no = porId.get(noId)!;
    const entrantes = fluxo.arestas.filter((a) => a.para === noId);

    // Regra 1: origem que não deu certo derruba o dependente — com o motivo
    // apontando para ELA, não para este nó, que não fez nada de errado.
    const origemRuim = entrantes.find((a) => estado.get(a.de) !== "sucesso");
    if (origemRuim) {
      const motivo = estado.get(origemRuim.de) === "falhou" ? "falhou" : "não rodou";
      estado.set(noId, "nao-executado");
      rastro.push({
        noId,
        tipo: no.tipo,
        refId: no.refId,
        estado: "nao-executado",
        erro: `a origem "${origemRuim.de}" ${motivo} — entrada ausente não vira default`,
        duracaoMs: 0,
      });
      opcoes.aoVivo?.noTerminou?.(rastro[rastro.length - 1]);
      continue;
    }

    // Os parâmetros fixos do nó, mais o que as arestas trouxeram. O mapeamento
    // é o que faz isto ser fluxo de DADOS: sem ele a aresta é só ordem.
    const parametros: Record<string, unknown> = { ...no.parametros };
    for (const aresta of entrantes) {
      for (const par of aresta.mapeamento) {
        const valor = saidas[aresta.de]?.[par.saida];
        if (valor !== undefined) parametros[par.entrada] = valor;
      }
    }

    // As entradas de um nó de função entram no rastro TAMBÉM na falha: a
    // auditoria da tese reescrita (§5.4) precisa do que chegou, não só do que
    // deu certo.
    const entradasNoRastro = no.tipo === "funcao" ? { entradas: parametros } : {};

    opcoes.aoVivo?.noComecou?.(no);
    const comecou = Date.now();
    try {
      const saida =
        no.tipo === "conector"
          ? await executores.conector(no, parametros)
          : no.tipo === "funcao"
            ? await executores.funcao(no, parametros)
            : no.tipo === "projeto"
              ? await executores.projeto(no, parametros)
              : no.tipo === "transformacao"
                ? await executores.transformacao(no, parametros)
                : await executores.agente(no, parametros);
      estado.set(noId, "sucesso");
      saidas[noId] = saida;
      rastro.push({
        noId,
        tipo: no.tipo,
        refId: no.refId,
        estado: "sucesso",
        duracaoMs: Date.now() - comecou,
        ...(typeof saida.linkExterno === "string" && saida.linkExterno ? { linkExterno: saida.linkExterno } : {}),
        ...entradasNoRastro,
      });
      opcoes.aoVivo?.noTerminou?.(rastro[rastro.length - 1]);
      if (no.confirmacao === "aguardar") aguardandoEm = noId;
    } catch (erro) {
      // Regra 2 mora aqui, por omissão: nada de `throw` — o laço continua, e
      // só quem depende deste nó cai na regra 1.
      estado.set(noId, "falhou");
      rastro.push({
        noId,
        tipo: no.tipo,
        refId: no.refId,
        estado: "falhou",
        erro: erro instanceof Error ? erro.message : String(erro),
        duracaoMs: Date.now() - comecou,
        ...entradasNoRastro,
      });
      opcoes.aoVivo?.noTerminou?.(rastro[rastro.length - 1]);
    }
  }

  return { nos: rastro, saidas, ...(aguardandoEm ? { aguardandoEm } : {}) };
}

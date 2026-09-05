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
}

export type EstadoDoNo = "sucesso" | "falhou" | "nao-executado";

export interface RastroDoNo {
  noId: string;
  tipo: NoDoFluxo["tipo"];
  refId: string;
  estado: EstadoDoNo;
  erro?: string;
  duracaoMs: number;
}

export interface ResultadoDoFluxo {
  nos: RastroDoNo[];
  /** A saída de cada nó que rodou — é o que a tela mostra por nó. */
  saidas: Record<string, Record<string, unknown>>;
  /** Presente quando o fluxo nem começou: ciclo é recusa, não falha parcial. */
  ciclo?: string[];
}

export interface OpcoesDeExecucao {
  /**
   * Executa só ATÉ este nó (ele incluso): o fecho de ancestrais, na mesma
   * ordem. É o "ver o resultado de um agente antes de rodar o próximo" — quem
   * está fiando quer inspecionar o meio sem pagar (nem disparar) o resto, e
   * um conector de escrita no fim do fluxo age no mundo.
   */
  ateNo?: string;
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

  for (const noId of plano.ordem) {
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

    const comecou = Date.now();
    try {
      const saida =
        no.tipo === "conector"
          ? await executores.conector(no, parametros)
          : await executores.agente(no, parametros);
      estado.set(noId, "sucesso");
      saidas[noId] = saida;
      rastro.push({ noId, tipo: no.tipo, refId: no.refId, estado: "sucesso", duracaoMs: Date.now() - comecou });
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
      });
    }
  }

  return { nos: rastro, saidas };
}

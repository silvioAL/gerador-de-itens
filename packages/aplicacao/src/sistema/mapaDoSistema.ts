import type { RegrasConfig } from "@gerador/engine";
import type { PapelConfigurado } from "../config/normalizacao.js";

/**
 * SPEC-59 fatia A — o MAPA DO SISTEMA: a ferramenta explicada a partir da
 * própria configuração dela.
 *
 * ## O que este módulo existe para resolver
 *
 * Três telas de configuração descrevem um **fluxo**, e formulário mostra os
 * campos escondendo a ligação: a esteira de agentes se chama esteira e é
 * mostrada como lista; o motor de regras é uma cadeia (`tech × contexto →
 * requisito → checagem → item`) partida em quatro abas; e o PDCA se chama
 * *ciclo* sem que o ciclo apareça em lugar nenhum.
 *
 * Isto não desenha nada — devolve o **modelo de leitura** de que a tela
 * precisa. Função pura, sem I/O, como o resto do que se pode testar sozinho.
 *
 * ## O que este módulo deliberadamente NÃO faz
 *
 * **Não edita.** A fatia A é vista, e essa restrição é o que a torna barata e
 * sem risco: config quebrada aqui quebraria a ferramenta inteira, não o desenho
 * de uma demanda. Editar pelo canvas é a fatia D, e só depois de a vista provar
 * que vale.
 */

/**
 * O estado do agente, que é metade da razão de existir um avatar.
 *
 * Um papel configurado que nunca roda é o defeito mais silencioso da esteira:
 * hoje só se descobre olhando o item sair vazio. `sem-credencial` é justamente
 * esse caso — o papel está ativo, e não existe modelo para ele falar.
 *
 * **`falhou` chegou na SPEC-60 fatia B (§265).** Ele estava previsto na
 * SPEC-59 §4 e ficou de fora porque o produto não guardava resultado nenhum de
 * execução — e inventar o estado a partir de nada seria pior que não tê-lo, um
 * avatar mentindo sobre saúde é o oposto do que ele existe para fazer. Agora a
 * esteira deixa rastro, e o estado vem de uma linha gravada, não de um palpite.
 */
export type EstadoDoAgente = "ativo" | "desligado" | "sem-credencial" | "falhou";

export interface AgenteDoMapa {
  id: string;
  nome: string;
  /** O que ele escreve no item — é a resposta a "quem escreve os critérios?". */
  escreve: string;
  estado: EstadoDoAgente;
  /** Vazio = vale em qualquer contexto. */
  contextos: string[];
  /** Ordem na esteira: é sequência, e a lista escondia isso. */
  ordem: number;
  /** §265 — a última vez que este papel rodou. Ausente = nunca rodou desde que
   * o rastro existe, que é diferente de "rodou e deu certo". */
  ultimaExecucao?: { ok: boolean; em: string; duracaoMs: number; erro?: string };
}

export interface RegraDoMapa {
  tech: string;
  requisitos: number;
  /** Quantos têm `checagem` — os que o motor confere sozinho (§239). */
  conferiveis: number;
  testes: number;
}

export interface MapaDoSistema {
  agentes: AgenteDoMapa[];
  regras: RegraDoMapa[];
  /** SPEC-57 fatia E — as réguas que valem sobre o CAMINHO, não sobre o nó. */
  regrasDePercurso: number;
  pdca: {
    feedbacksAbertos: number;
    /** `true` quando o laço tem o que processar — é o que a seta de volta acende. */
    temTrabalho: boolean;
  };
  /** O que impede o mapa de ser lido como "está tudo certo". */
  avisos: string[];
}

/** §265 — a última execução de cada papel, vinda do rastro. */
export interface ExecucaoDoPapel {
  papel: string;
  ok: boolean;
  em: string;
  duracaoMs: number;
  erro?: string;
}

export interface EntradaDoMapa {
  papeis?: PapelConfigurado[];
  regras?: RegrasConfig;
  /** Há modelo configurado para os agentes falarem? */
  temCredencialDeIa?: boolean;
  feedbacksAbertos?: number;
  /** Ausente = o rastro não foi lido (tela velha, chamada que falhou). Diferente
   * de lista vazia, que é "ninguém rodou nada ainda". */
  execucoes?: ExecucaoDoPapel[];
}

const ESCREVE_POR_GRUPO: Record<string, string> = {
  po: "história e critérios de aceite",
  arquiteto: "contrato de arquitetura",
  especialista: "refinamento técnico",
  qa: "regras de teste e cenários",
};

export function montarMapaDoSistema(entrada: EntradaDoMapa = {}): MapaDoSistema {
  const { papeis = [], regras, temCredencialDeIa = false, feedbacksAbertos = 0, execucoes } = entrada;

  const ultimaPorPapel = new Map((execucoes ?? []).map((e) => [e.papel, e]));

  const agentes: AgenteDoMapa[] = papeis.map((p, i) => {
    // §265 — o rastro é casado pelo ID do papel, que é o que a rota usa na URL
    // (`/ia/pipeline/:papel`). Casar por nome pareceria mais amigável e
    // quebraria no dia em que alguém renomeasse o papel na tela — o rastro
    // antigo ficaria órfão e o avatar voltaria a verde sem nada ter melhorado.
    const ultimaExecucao = ultimaPorPapel.get(p.id);
    return {
      id: p.id,
      nome: p.nome,
      escreve: ESCREVE_POR_GRUPO[p.grupo] ?? p.grupo,
      // A ordem de checagem importa: um papel DESLIGADO não está esperando
      // credencial — está desligado, e dizer "sem credencial" nele mandaria a
      // pessoa configurar IA para resolver um problema que ela mesma criou.
      //
      // `falhou` entra DEPOIS de desligado e de sem-credencial, e antes de
      // ativo: falha antiga de um papel que hoje está desligado não é notícia,
      // e sem credencial a falha é consequência, não causa.
      estado: !p.ativo
        ? "desligado"
        : !temCredencialDeIa
          ? "sem-credencial"
          : ultimaExecucao && !ultimaExecucao.ok
            ? "falhou"
            : "ativo",
      contextos: p.contextos,
      ordem: i + 1,
      ...(ultimaExecucao
        ? { ultimaExecucao: { ok: ultimaExecucao.ok, em: ultimaExecucao.em, duracaoMs: ultimaExecucao.duracaoMs, ...(ultimaExecucao.erro ? { erro: ultimaExecucao.erro } : {}) } }
        : {}),
    };
  });

  const regrasPorTech: RegraDoMapa[] = Object.entries(regras?.porTech ?? {}).map(([tech, r]) => ({
    tech,
    requisitos: r.checklistTecnico?.length ?? 0,
    conferiveis: (r.checklistTecnico ?? []).filter((req) => req.checagem).length,
    testes: r.testes?.length ?? 0,
  }));

  const regrasDePercurso = regras?.percursos?.length ?? 0;

  // Os avisos são o que impede o mapa de virar um cartaz de "tudo certo". Cada
  // um é uma pergunta que alguém faria olhando a tela — respondida antes.
  const avisos: string[] = [];
  const ativos = agentes.filter((a) => a.estado !== "desligado");
  if (agentes.length === 0) {
    avisos.push("Nenhum papel na esteira: os itens saem só com o que o motor deriva, sem texto escrito por agente.");
  } else if (ativos.length === 0) {
    avisos.push("Todos os papéis estão desligados — a esteira não escreve nada.");
  } else if (!temCredencialDeIa) {
    avisos.push(
      `${ativos.length} papel(éis) ativo(s) e nenhum modelo configurado: a esteira não tem com quem falar, e o item sai vazio na parte escrita.`
    );
  }
  if (regrasPorTech.length > 0 && regrasPorTech.every((r) => r.conferiveis === 0)) {
    avisos.push(
      "Nenhum padrão conferível: as regras existem como texto para alguém ler, e o motor não confere nenhuma sozinho."
    );
  }
  // O aviso que o rastro tornou possível: um papel que falhou não se anuncia
  // sozinho, e o item sai com um pedaço faltando sem ninguém perceber.
  const falharam = agentes.filter((a) => a.estado === "falhou");
  if (falharam.length > 0) {
    avisos.push(
      `${falharam.length} papel(éis) falhou(aram) na última execução (${falharam.map((a) => a.nome).join(", ")}): o item sai sem a parte que eles escrevem.`
    );
  }
  if (regrasDePercurso === 0) {
    avisos.push("Nenhuma régua de percurso: caminhos que estouram o orçamento inteiro não são medidos.");
  }

  return {
    agentes,
    regras: regrasPorTech,
    regrasDePercurso,
    pdca: { feedbacksAbertos, temTrabalho: feedbacksAbertos > 0 },
    avisos,
  };
}

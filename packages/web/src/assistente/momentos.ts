/**
 * SPEC-37 Fase 3 — a DECISÃO de qual momento de condução vale agora, extraída
 * pura: o App e a ReviewScreen só coletam os fatos; a prioridade (que é onde
 * um bug seria silencioso — dois balões brigando ou o mais urgente perdendo)
 * mora aqui, testável.
 *
 * Regra herdada das fases 1–2: todo momento é dispensável, e dispensar
 * silencia aquele momento pela sessão da quebra.
 */

export type MomentoDoCanvas = "m2" | "m3" | "m9" | "m14" | null;

export function momentoDoCanvas(p: {
  nodes: number;
  vermelhos: number;
  temResultado: boolean;
  aplicouProposta: boolean;
  /** §184 — a quebra aberta já tem especificação gerada e salva. */
  temEspecificacaoSalva?: boolean;
  dispensados: readonly string[];
}): MomentoDoCanvas {
  if (p.temResultado) return null;
  // M14 (§184) — a demanda reaberta JÁ TEM especificação completa: o caminho
  // natural é a revisão dela, não recomeçar o desenho.
  if (p.temEspecificacaoSalva && p.nodes > 0 && p.vermelhos === 0 && !p.dispensados.includes("m14")) return "m14";
  // M9 — tudo verde: o mais valioso, porque destrava a saída.
  if (p.nodes > 0 && p.vermelhos === 0 && !p.dispensados.includes("m9")) return "m9";
  // M3 — proposta aplicada, campos por preencher: a continuação do desenho.
  if (p.aplicouProposta && p.nodes > 0 && p.vermelhos > 0 && !p.dispensados.includes("m3")) return "m3";
  // M2 — canvas vazio: o convite de começar conversando.
  if (p.nodes === 0 && !p.dispensados.includes("m2")) return "m2";
  return null;
}

export type MomentoDaRevisao = "m4" | "m5" | "m7" | "m12" | null;

export function momentoDaRevisao(p: {
  semModeloDeIa: boolean;
  demandInfoVazio: boolean;
  /** Ninguém mexeu em item nenhum ainda (tudo rascunho) — o M5 é um aviso de
   * CHEGADA; depois que o trabalho começa, o momento dele passou. */
  revisaoIntocada: boolean;
  tudoRefinado: boolean;
  esteiraRodando: boolean;
  conversaAberta: boolean;
  dispensados: readonly string[];
}): MomentoDaRevisao {
  // Esteira escrevendo ou chat aberto: quem fala é o trabalho, não o balão.
  if (p.esteiraRodando || p.conversaAberta) return null;
  // M4 — sem modelo de IA: o mais bloqueante (a esteira inteira parada).
  if (p.semModeloDeIa && !p.dispensados.includes("m4")) return "m4";
  // M5 — derivou sem contexto do épico: só enquanto a revisão está intocada.
  if (p.demandInfoVazio && p.revisaoIntocada && !p.dispensados.includes("m5")) return "m5";
  // M7 — tudo refinado: fechar o ciclo na especificação.
  if (p.tudoRefinado && !p.dispensados.includes("m7")) return "m7";
  // M12 (SPEC-39) — sem botão de gerar no header, o agente é a porta da
  // especificação também fora do "tudo refinado".
  if (!p.tudoRefinado && !p.dispensados.includes("m12")) return "m12";
  return null;
}

/** M8 — Configurações abertas numa instalação ainda sem padrões do time. */
export function momentoDaConfig(p: {
  configAberta: boolean;
  temPadroesDoTime: boolean;
  dispensados: readonly string[];
}): "m8" | null {
  if (!p.configAberta || p.temPadroesDoTime || p.dispensados.includes("m8")) return null;
  return "m8";
}

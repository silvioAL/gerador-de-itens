import type { Decisao, Diagrama, ExcecaoDePadrao } from "../model/types.js";

/**
 * SPEC-57 fatia C (M5 casos 2 e 3) — o PORQUÊ.
 *
 * A fatia B ensinou o motor a apontar onde o desenho sai do padrão. Sozinha ela
 * é cobrança: o vermelho diz *o quê*, nunca *por quê*, e um vermelho sem porquê
 * é uma ordem. Esta fatia é o que converte a mesma medição em ensino — a régua
 * passa a carregar a razão de existir, e a escolha que a contraria passa a
 * carregar a sua.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

/** Regra 2 da SPEC-57, aplicada à decisão: proposta de agente não vale nada
 * até alguém aceitar. `substituida` também não vale — ela existe para o
 * histórico, não para a leitura do desenho de hoje. */
export function decisaoVigente(d: Decisao): boolean {
  return d.status === "aceita";
}

/** As decisões que valem agora. É esta lista que vai ao placar, à spec e ao agente. */
export function decisoesVigentes(decisoes: Decisao[] = []): Decisao[] {
  return decisoes.filter(decisaoVigente);
}

/** As que esperam alguém — o amarelo do placar, nunca o vermelho. */
export function propostasPendentes(decisoes: Decisao[] = []): Decisao[] {
  return decisoes.filter((d) => d.status === "proposta");
}

/**
 * As decisões vigentes ancoradas neste elemento — é o que o painel do nó mostra
 * e o que a citação leva ao item e à spec.
 *
 * Proposta não aparece aqui de propósito: um item não pode alegar seguir uma
 * decisão que ninguém tomou (mesma disciplina de `necessidadesDoElemento`).
 */
export function decisoesDoElemento(elementoId: string | undefined, decisoes: Decisao[] = []): Decisao[] {
  if (!elementoId) return [];
  return decisoesVigentes(decisoes).filter((d) => d.noId === elementoId || d.arestaId === elementoId);
}

export interface ResumoDeDecisoes {
  vigentes: number;
  /** Aguardando aceite — amarelo, não vermelho. */
  propostas: number;
  /** Ancoradas em elemento que não existe mais. */
  orfas: string[];
  /** Vigentes sem `porque` preenchido. */
  semPorque: string[];
}

/**
 * O que o placar mostra.
 *
 * **`orfas` não são limpas**, pela mesma razão do vínculo quebrado de
 * `analisarLacunas` e do `ALVO_INEXISTENTE` de `dependencias.ts`: apagar o nó
 * sobre o qual se decidiu algo é exatamente o evento que precisa reaparecer.
 * Uma decisão que perdeu o alvo ou está obsoleta — e aí alguém a substitui — ou
 * o nó voltou com outro id, e aí alguém religa. As duas exigem uma pessoa; o
 * silêncio não resolve nenhuma.
 *
 * **`semPorque` existe porque o porquê é a fatia inteira.** Uma decisão que
 * registra a escolha e omite a razão é o formato que fez repositório de ADR
 * virar cemitério: quem lê daqui a um ano fica sabendo o que foi feito e
 * continua sem saber se ainda faz sentido. Não bloqueia nada — é amarelo, como
 * tudo que cobra qualidade em vez de correção.
 *
 * Sem decisão nenhuma não há nada a apontar: uma quebra que nunca registrou
 * decisão não passa a estar errada por causa desta função.
 */
export function resumirDecisoes(diagrama: Diagrama, decisoes: Decisao[] = []): ResumoDeDecisoes {
  const idsVivos = new Set<string>([
    ...diagrama.nodes.map((n) => n.id),
    ...diagrama.edges.map((e) => e.id),
  ]);

  const orfas: string[] = [];
  const semPorque: string[] = [];

  for (const d of decisoes) {
    if (d.status === "substituida") continue;
    const alvo = d.noId ?? d.arestaId;
    // Decisão da quebra inteira (sem âncora) nunca é órfã — ela não tem alvo a perder.
    if (alvo && !idsVivos.has(alvo)) orfas.push(d.id);
    if (decisaoVigente(d) && !d.porque.trim()) semPorque.push(d.id);
  }

  return {
    vigentes: decisoesVigentes(decisoes).length,
    propostas: propostasPendentes(decisoes).length,
    orfas,
    semPorque,
  };
}

/**
 * §242 + fatia C — a exceção de padrão LIDA como decisão.
 *
 * A SPEC-57 chama o caso 3 de *"emenda ao ADR do padrão"*, e a tentação óbvia
 * é fazer o aceite de violação gravar uma `Decisao` de verdade. Não faz, de
 * propósito: seriam duas cópias da mesma verdade, e a que fosse editada depois
 * mentiria sobre a outra. A exceção continua sendo o registro; isto é só a
 * leitura dela na mesma lista, para que quem abre "por que este desenho é
 * assim?" veja as escolhas e as exceções juntas — que é como elas foram
 * tomadas.
 *
 * Derivada, portanto: não persiste, não recebe id estável, não entra em
 * `resumirDecisoes` (senão a exceção seria contada duas vezes, aqui e no
 * placar de conformidade).
 */
export function excecoesComoDecisoes(excecoes: ExcecaoDePadrao[] = []): Decisao[] {
  return excecoes.map((e) => ({
    id: `excecao::${e.noId}::${e.campo}`,
    noId: e.noId,
    titulo: `Contrariar o padrão de "${e.campo}"`,
    alternativas: [{ titulo: `Seguir o padrão de "${e.campo}"` }, { titulo: "Contrariar, com motivo registrado" }],
    escolhida: "Contrariar, com motivo registrado",
    porque: e.motivo,
    status: "aceita" as const,
    origem: "manual" as const,
    autor: e.autor,
    em: e.em,
  }));
}

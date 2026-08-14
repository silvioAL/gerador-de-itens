import type { Diagrama, Necessidade } from "../model/types.js";

/**
 * SPEC-57 fatia A (M6) — a análise de lacunas do PROPÓSITO.
 *
 * É prontidão de outro tipo, e por isso mora ao lado dela e não dentro:
 * `calcularProntidao` responde "o que falta preencher NESTE nó"; isto responde
 * "o que falta ligar NESTA quebra". Uma é por elemento, a outra é do desenho
 * inteiro — juntar as duas numa função só faria a segunda ser recalculada uma
 * vez por nó, sem ganho nenhum.
 *
 * Função pura, sem I/O, como todo o resto do engine.
 */
export interface Lacunas {
  /** Necessidades que contam e não têm nenhum elemento vivo respondendo por elas. */
  semElemento: string[];
  /** Nós que não respondem por necessidade nenhuma. Sinal, não erro (ver abaixo). */
  elementosSemNecessidade: string[];
  /** Vínculo apontando para nó/aresta que não existe mais no diagrama. */
  vinculosQuebrados: { necessidadeId: string; elementoId: string }[];
  /** Ignoradas pela regra 2 — sugeridas e ainda não confirmadas. */
  naoConfirmadas: string[];
}

/** Regra 2 da SPEC-57: `sugerido`/`inferido` só conta depois de confirmado. */
export function necessidadeConta(n: Necessidade): boolean {
  if (n.origem === "sugerido" || n.origem === "inferido") return n.confirmado === true;
  return true;
}

/**
 * `elementosSemNecessidade` é deliberadamente **informativo**, não erro:
 * infraestrutura legítima existe sem responder por necessidade de negócio
 * (um cache, um balanceador), e transformar isso em vermelho pintaria o
 * desenho inteiro no primeiro dia — o jeito mais rápido de ensinar alguém a
 * ignorar a cor. Quem decide se um nó órfão é problema é a pessoa; o produto
 * só mostra.
 *
 * Sem necessidade declarada nenhuma, **não há lacuna**: uma quebra que nunca
 * declarou propósito não passa a estar errada por causa desta função. Isso é o
 * que permite a feature nascer sem tornar vermelho tudo o que já existe.
 */
export function analisarLacunas(diagrama: Diagrama, necessidades: Necessidade[] = []): Lacunas {
  const idsVivos = new Set<string>([
    ...diagrama.nodes.map((n) => n.id),
    ...diagrama.edges.map((e) => e.id),
  ]);

  const semElemento: string[] = [];
  const naoConfirmadas: string[] = [];
  const vinculosQuebrados: { necessidadeId: string; elementoId: string }[] = [];
  const atendem = new Set<string>();

  for (const necessidade of necessidades) {
    if (!necessidadeConta(necessidade)) {
      naoConfirmadas.push(necessidade.id);
      // Nem lacuna nem cobertura: uma necessidade não confirmada não pode
      // ACUSAR nada, e também não pode dar por atendido um nó — senão o agente
      // sugerindo vínculo esconderia o buraco que ele deveria expor.
      continue;
    }

    let vivos = 0;
    for (const elementoId of necessidade.atendidaPor) {
      if (idsVivos.has(elementoId)) {
        vivos++;
        atendem.add(elementoId);
      } else {
        vinculosQuebrados.push({ necessidadeId: necessidade.id, elementoId });
      }
    }
    if (vivos === 0) semElemento.push(necessidade.id);
  }

  // Só nós: uma aresta sem necessidade é o caso comum (ela liga, não entrega),
  // e listá-las afogaria o sinal que interessa.
  const elementosSemNecessidade =
    necessidades.length === 0 ? [] : diagrama.nodes.filter((n) => !atendem.has(n.id)).map((n) => n.id);

  return { semElemento, elementosSemNecessidade, vinculosQuebrados, naoConfirmadas };
}

/**
 * As necessidades que este elemento atende — é o que faz a citação chegar ao
 * item derivado e à spec (SPEC-57 M8). Não confirmada não cita: um item não
 * pode alegar atender um propósito que ninguém confirmou.
 */
export function necessidadesDoElemento(
  elementoId: string | undefined,
  necessidades: Necessidade[] = []
): Necessidade[] {
  if (!elementoId) return [];
  return necessidades.filter((n) => necessidadeConta(n) && n.atendidaPor.includes(elementoId));
}

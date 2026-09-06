import type { Variante } from "@gerador/engine";
import type { QuebraSalva, ResumoQuebra } from "../portas/repositorioDeQuebras.js";
import { comoDesenhoMapeado, EntradaDaFuncaoInvalida } from "./funcoes.js";

/**
 * SPEC-107 fatia B — **a metade PURA do nó `projeto`.**
 *
 * O mesmo corte de sempre (fatias A/B da 105): quem lê e grava quebras é o
 * servidor; o que é decisão de contrato — qual demanda é "a ativa", que forma
 * a saída tem, o que uma proposta vira — mora aqui, testável sem banco.
 */

/**
 * A demanda "ativa", do jeito que o SERVIDOR consegue afirmar: a mais
 * recentemente atualizada do time. O aberto-agora da mesa é estado do
 * navegador e não chega até aqui — e inventar seria pior que aproximar.
 */
export function demandaAtiva(resumos: ResumoQuebra[], timeId?: string): ResumoQuebra | null {
  const candidatas = timeId ? resumos.filter((r) => r.time === timeId) : resumos;
  if (candidatas.length === 0) return null;
  return [...candidatas].sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1))[0];
}

/**
 * A saída da FONTE. `desenho` é o subconjunto que as funções leem
 * (`DesenhoMapeado`) — o diagrama mais o contexto que o botão da mesa passa
 * ao derivar —, não a quebra inteira: o que viaja pela aresta (e fica gravado
 * como entrada de um nó de função, §5.4) é contrato, não despejo.
 *
 * §9.3 — o que a demanda NÃO tem fica FORA da saída (nunca um default):
 * `volumetria` ausente e `markdown` nunca gerado não viram `{}`/`""`; quem os
 * exigir à jusante barra com o nome do que faltou.
 */
export function saidaDoProjeto(quebra: QuebraSalva, itens: unknown[]): Record<string, unknown> {
  return {
    demandaId: quebra.id,
    ...(quebra.titulo ? { titulo: quebra.titulo } : {}),
    desenho: {
      diagrama: quebra.diagrama,
      ...(quebra.time ? { time: quebra.time } : {}),
      excecoes: quebra.excecoes,
      percursos: quebra.percursos,
      necessidades: quebra.necessidades,
      decisoes: quebra.decisoes,
      ...(quebra.volumetria ? { volumetria: quebra.volumetria } : {}),
    },
    itens,
    necessidades: quebra.necessidades,
    ...(quebra.volumetria ? { volumetria: quebra.volumetria } : {}),
    ...(quebra.especificacao ? { markdown: quebra.especificacao } : {}),
  };
}

/**
 * O DESTINO: o desenho mapeado vira uma VARIANTE da demanda (SPEC-88 — a
 * mecânica que já existe para "um desenho guardado que ainda não é O
 * desenho"). A fiação NUNCA toca `quebra.diagrama`: adotar é decisão humana,
 * na mesa, pela comparação de sempre (§2.4-14 — importar não é aceitar).
 *
 * `id` e `criadaEm` vêm de quem chama (o motor não lê relógio nem sorteia).
 */
export function varianteProposta(
  desenho: unknown,
  fluxo: { id: string; nome: string },
  id: string,
  criadaEm: string
): Variante {
  const valido = comoDesenhoMapeado(desenho);
  return {
    id,
    titulo: `Proposta do fluxo "${fluxo.nome}"`,
    diagrama: valido.diagrama,
    criadaEm,
    motivo: `escrita pela fiação "${fluxo.id}" — o desenho da demanda só muda se alguém adotar`,
  };
}

/** §9.3 — a régua de erro do nó, com o nome do que faltou. */
export function erroSemDemanda(timeId?: string): EntradaDaFuncaoInvalida {
  return new EntradaDaFuncaoInvalida(
    timeId
      ? `nenhuma demanda do time "${timeId}" para ser a ativa — informe "demandaId" no nó de projeto`
      : `nenhuma demanda salva para ser a ativa — informe "demandaId" no nó de projeto`
  );
}

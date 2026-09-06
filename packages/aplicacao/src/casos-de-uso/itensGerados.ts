import type {
  DadosItemGerado,
  ItemGeradoSalvo,
  RepositorioDeItensGerados,
} from "../portas/repositorioDeItensGerados.js";

/**
 * SPEC-49 (extraída na SPEC-107 G1) — **a régua de "PRONTO", num lugar só.**
 *
 * Nenhum campo pedindo "✍️ especificar", nenhuma sugestão sem confirmação,
 * e quem já subiu não sobe de novo. A fiação de exportação (o nó `projeto`)
 * e o caso de uso leem a MESMA régua — duas cópias divergiriam na primeira
 * mudança (§263), e "pronto" é exatamente o tipo de régua que não pode
 * divergir: é ela que impede item meia-boca no tracker de alguém.
 */
export function prontosEIgnorados(todos: ItemGeradoSalvo[]): {
  prontos: ItemGeradoSalvo[];
  ignorados: string[];
} {
  const prontos = todos.filter((i) => i.estado !== "exportado" && i.pendencias === 0 && i.sugestoes === 0);
  const ignorados = todos.filter((i) => !prontos.includes(i) && i.estado !== "exportado").map((i) => i.chave);
  return { prontos, ignorados };
}

/**
 * SPEC-41 Parte B — casos de uso dos itens gerados. Quem CALCULA os itens é o
 * engine (`gerarItensDeTrabalho`), no cliente, com o mesmo material do
 * documento; aqui só se persiste e se lê o conjunto. A exportação (Fase 2)
 * entra como caso de uso novo usando a porta `ExportadorDeItens`.
 */
export function criarCasosDeUsoDeItensGerados(repo: RepositorioDeItensGerados) {
  return {
    listarDaQuebra(quebraId: string): Promise<ItemGeradoSalvo[]> {
      return repo.listarDaQuebra(quebraId);
    },

    regerarDaQuebra(quebraId: string, itens: DadosItemGerado[]): Promise<ItemGeradoSalvo[]> {
      return repo.substituirDaQuebra(quebraId, itens);
    },

    // SPEC-49 → SPEC-107 G1: `exportarDaQuebra` morreu — a exportação virou a
    // fiação semeada "exportar-prontos". A régua de "pronto" ficou acima
    // (`prontosEIgnorados`) e a leitura da resposta por item virou
    // `resultadoDaExportacao` (projetoNoFluxo) — as mesmas, num lugar só.
  };
}

export type CasosDeUsoDeItensGerados = ReturnType<typeof criarCasosDeUsoDeItensGerados>;

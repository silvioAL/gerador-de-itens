import {
  normalizarDadosQuebra,
  type DadosQuebra,
  type QuebraSalva,
  type RepositorioDeQuebras,
  type ResumoQuebra,
} from "../portas/repositorioDeQuebras.js";

/**
 * SPEC-31 Fase 1 — os casos de uso de Quebra.
 *
 * Fininhos de propósito. A regra de negócio de verdade (derivação, prontidão,
 * dependências) mora em `packages/engine`, que é puro; a persistência mora nos
 * adaptadores. O que sobra aqui é a orquestração — e é justamente essa camada
 * que estava escrita DUAS vezes, uma em `openApiLocal.ts` e outra em
 * `routes/quebras.ts`, divergindo em silêncio.
 *
 * Se um caso de uso aqui ficar gordo, é sinal de regra vazando da borda para
 * dentro: ela pertence ao engine.
 */

export function criarCasosDeUsoDeQuebras(repo: RepositorioDeQuebras) {
  return {
    listar(): Promise<ResumoQuebra[]> {
      return repo.listar();
    },

    obter(id: string): Promise<QuebraSalva | null> {
      return repo.obter(id);
    },

    /** Aceita corpo parcial: quem chama é uma borda HTTP, e o cliente omite o
     * que não usa. A normalização é uma só (`normalizarDadosQuebra`) para os
     * dois modos devolverem a mesma forma. */
    criar(bruto: Partial<DadosQuebra> | undefined): Promise<QuebraSalva> {
      return repo.criar(normalizarDadosQuebra(bruto));
    },

    atualizar(id: string, bruto: Partial<DadosQuebra> | undefined): Promise<QuebraSalva | null> {
      return repo.atualizar(id, normalizarDadosQuebra(bruto));
    },
  };
}

export type CasosDeUsoDeQuebras = ReturnType<typeof criarCasosDeUsoDeQuebras>;

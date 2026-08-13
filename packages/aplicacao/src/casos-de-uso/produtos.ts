import {
  produtosDoTime,
  type DadosDoProduto,
  type Produto,
  type RepositorioDeProdutos,
  type TermoDeGlossario,
} from "../portas/repositorioDeProdutos.js";

/**
 * SPEC-53 Fase 1 — casos de uso do produto.
 *
 * O que é REGRA mora aqui (quais produtos um time enxerga, o que um termo de
 * glossário precisa ter); o repositório só guarda e devolve.
 */
export interface CasosDeUsoDeProdutos {
  listar(organizacaoId: string, timeId?: string): Promise<Produto[]>;
  obter(id: string): Promise<Produto | null>;
  criar(organizacaoId: string, nome: string, criadoPor: string): Promise<Produto>;
  atualizar(id: string, dados: Partial<DadosDoProduto>): Promise<Produto | null>;
  excluir(id: string): Promise<boolean>;
  definirTimes(id: string, timeIds: string[]): Promise<Produto | null>;
  salvarTermo(produtoId: string, termo: string, definicao: string): Promise<TermoDeGlossario>;
  excluirTermo(termoId: string): Promise<boolean>;
}

export function criarCasosDeUsoDeProdutos(repo: RepositorioDeProdutos): CasosDeUsoDeProdutos {
  return {
    async listar(organizacaoId, timeId) {
      return produtosDoTime(await repo.listar(organizacaoId), timeId);
    },
    obter: (id) => repo.obter(id),
    criar: (organizacaoId, nome, criadoPor) => repo.criar(organizacaoId, nome.trim(), criadoPor),
    atualizar: (id, dados) => repo.atualizar(id, dados),
    excluir: (id) => repo.excluir(id),
    /** Duplicata no conjunto de times é ruído do cliente, não intenção — some
     * aqui, e não em cada adaptador. */
    definirTimes: (id, timeIds) => repo.definirTimes(id, [...new Set(timeIds)]),
    salvarTermo: (produtoId, termo, definicao) => repo.salvarTermo(produtoId, termo.trim(), definicao.trim()),
    excluirTermo: (termoId) => repo.excluirTermo(termoId),
  };
}

import type {
  DadosItemGerado,
  ItemGeradoSalvo,
  RepositorioDeItensGerados,
} from "../portas/repositorioDeItensGerados.js";

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
  };
}

export type CasosDeUsoDeItensGerados = ReturnType<typeof criarCasosDeUsoDeItensGerados>;

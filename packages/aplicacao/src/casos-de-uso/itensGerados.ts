import type { ExportadorDeItens } from "../portas/exportadorDeItens.js";
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

    /**
     * SPEC-49 — exporta os itens PRONTOS (a régua da SPEC-44/47: nenhum campo
     * pedindo "✍️ especificar", nenhuma sugestão sem confirmação). Item pela
     * metade não vira issue meia-boca no tracker de ninguém.
     *
     * Falha é por item: quem subiu fica `exportado` com link, quem falhou
     * continua `gerado` e o motivo volta pra tela.
     */
    async exportarDaQuebra(
      quebraId: string,
      exportador: ExportadorDeItens
    ): Promise<{ exportados: ItemGeradoSalvo[]; erros: { chave: string; erro: string }[]; ignorados: string[] }> {
      const todos = await repo.listarDaQuebra(quebraId);
      const prontos = todos.filter((i) => i.estado !== "exportado" && i.pendencias === 0 && i.sugestoes === 0);
      const ignorados = todos.filter((i) => !prontos.includes(i) && i.estado !== "exportado").map((i) => i.chave);

      const resultados = await exportador.exportar(prontos);
      const exportados: ItemGeradoSalvo[] = [];
      const erros: { chave: string; erro: string }[] = [];
      for (const resultado of resultados) {
        if ("erro" in resultado) {
          erros.push(resultado);
          continue;
        }
        const salvo = await repo.marcarExportado(quebraId, resultado.chave, resultado.linkExterno);
        if (salvo) exportados.push(salvo);
      }
      return { exportados, erros, ignorados };
    },
  };
}

export type CasosDeUsoDeItensGerados = ReturnType<typeof criarCasosDeUsoDeItensGerados>;

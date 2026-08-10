import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  DadosQuebra,
  QuebraSalva,
  RepositorioDeQuebras,
  ResumoQuebra,
} from "@gerador/aplicacao";

/**
 * SPEC-31 Fase 1 — adaptador de arquivo da porta de Quebras.
 *
 * Uma quebra por arquivo em `quebras/<id>.json`. Mantém o comportamento que o
 * modo local já tinha, inclusive a correção do JOURNEY §? que trocou um
 * `quebra.json` fixo por um arquivo por id — com o arquivo único, "Nova quebra"
 * seguida de salvar sobrescrevia a anterior sempre.
 *
 * Os carimbos vêm do sistema de arquivos (`birthtime`/`mtime`), não de campos
 * no JSON: é a fonte que já existia, e gravar data no conteúdo criaria duas
 * verdades sobre a mesma coisa.
 */
export function criarRepositorioDeQuebrasEmArquivo(dirProjeto: string): RepositorioDeQuebras {
  const dirQuebras = resolve(dirProjeto, "quebras");
  const arquivoDe = (id: string) => resolve(dirQuebras, `${id}.json`);

  async function lerConteudo(arquivo: string): Promise<Partial<DadosQuebra> | null> {
    try {
      return JSON.parse(await readFile(arquivo, "utf-8")) as Partial<DadosQuebra>;
    } catch {
      return null;
    }
  }

  async function montar(id: string, arquivo: string): Promise<QuebraSalva | null> {
    let info;
    try {
      info = await stat(arquivo);
    } catch {
      return null;
    }
    const conteudo = await lerConteudo(arquivo);
    return {
      id,
      titulo: conteudo?.titulo ?? null,
      time: conteudo?.time ?? null,
      diagrama: conteudo?.diagrama ?? ({ nodes: [], edges: [] } as never),
      // Persistidos no arquivo desde sempre; já foram esquecidos DUAS vezes na
      // leitura (SPEC-23 Fases 1 e 1b). Agora o contrato da porta cobra.
      respostasItens: conteudo?.respostasItens ?? {},
      demandInfo: conteudo?.demandInfo ?? "",
      anexosContexto: conteudo?.anexosContexto ?? [],
      criadoEm: info.birthtime.toISOString(),
      atualizadoEm: info.mtime.toISOString(),
    };
  }

  async function gravar(id: string, dados: DadosQuebra): Promise<void> {
    await mkdir(dirQuebras, { recursive: true });
    await writeFile(arquivoDe(id), JSON.stringify(dados, null, 2), "utf-8");
  }

  return {
    async listar(): Promise<ResumoQuebra[]> {
      let nomes: string[];
      try {
        nomes = await readdir(dirQuebras);
      } catch {
        // Diretório ausente é "nenhuma quebra ainda", não erro.
        return [];
      }
      const ids = nomes.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -".json".length));
      const salvas = (await Promise.all(ids.map((id) => montar(id, arquivoDe(id))))).filter(
        (q): q is QuebraSalva => q !== null
      );
      salvas.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
      return salvas.map(({ id, titulo, time, criadoEm, atualizadoEm }) => ({
        id,
        titulo,
        time,
        criadoEm,
        atualizadoEm,
      }));
    },

    obter(id: string): Promise<QuebraSalva | null> {
      return montar(id, arquivoDe(id));
    },

    async criar(dados: DadosQuebra): Promise<QuebraSalva> {
      const id = randomUUID();
      await gravar(id, dados);
      // Não pode ser null: acabou de ser escrito.
      return (await montar(id, arquivoDe(id))) as QuebraSalva;
    },

    async atualizar(id: string, dados: DadosQuebra): Promise<QuebraSalva | null> {
      const arquivo = arquivoDe(id);
      try {
        await stat(arquivo);
      } catch {
        return null;
      }
      await gravar(id, dados);
      return montar(id, arquivo);
    },
  };
}

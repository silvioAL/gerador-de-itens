import { describe, expect, it } from "vitest";
import type { Diagrama } from "@gerador/engine";
import { normalizarDadosQuebra, type RepositorioDeQuebras } from "./repositorioDeQuebras.js";

/**
 * SPEC-31 §8 — a suíte de contrato da porta de Quebras.
 *
 * **A mesma pergunta feita aos dois adaptadores.** É esta suíte, e não a
 * disciplina de quem escreve, que impede arquivo e Postgres de divergirem de
 * novo — a divergência que produziu o hospedado sem IA (§105), sem tabela de
 * regras (§108) e sem `respostasItens` (§110).
 *
 * Cada adaptador roda isto no seu próprio pacote, contra a sua infraestrutura
 * de verdade: o de arquivo contra um diretório temporário, o de Postgres contra
 * o `gerador_test`. Adaptador novo (Mongo, na Fase 5) é aprovado quando passa
 * aqui — não quando passa em testes escritos sob medida para ele.
 */

const DIAGRAMA: Diagrama = {
  nodes: [{ id: "n1", type: "service", label: "srv-teste", x: 0, y: 0, status: "novo", spec: {}, specNA: {} }],
  edges: [],
} as unknown as Diagrama;

export interface AmbienteDeContrato {
  repo: RepositorioDeQuebras;
  /** Chamado antes de cada teste — deixa o repositório vazio. */
  limpar: () => Promise<void>;
}

export function testarContratoDeQuebras(nomeDoAdaptador: string, criarAmbiente: () => Promise<AmbienteDeContrato>) {
  describe(`RepositorioDeQuebras — contrato (${nomeDoAdaptador})`, () => {
    async function comRepo() {
      const ambiente = await criarAmbiente();
      await ambiente.limpar();
      return ambiente.repo;
    }

    it("criar devolve a quebra inteira, com identidade e carimbos", async () => {
      const repo = await comRepo();
      const criada = await repo.criar(normalizarDadosQuebra({ titulo: "Crédito", time: "time-a", diagrama: DIAGRAMA }));

      expect(criada.id).toBeTruthy();
      expect(criada.titulo).toBe("Crédito");
      expect(criada.time).toBe("time-a");
      expect(criada.diagrama).toEqual(DIAGRAMA);
      // ISO-8601, não Date nem número — o formato atravessa HTTP.
      expect(criada.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(criada.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("o que a esteira escreveu SOBREVIVE ao salvar e voltar", async () => {
      // O teste que reprova o Postgres de antes da migração 0011: `quebras`
      // tinha seis colunas e o Zod da borda descartava estes três campos em
      // silêncio. Quem rodava a esteira no modo hospedado perdia o trabalho.
      const repo = await comRepo();
      const respostasItens = { "n1::ep0": { historiaUsuario: { valor: "Como cliente…", origem: "sugerido" as const } } };
      const criada = await repo.criar(
        normalizarDadosQuebra({
          diagrama: DIAGRAMA,
          respostasItens,
          demandInfo: "Aprovação de crédito com bureau externo.",
          anexosContexto: ["ata-refinamento.md", "contrato-bureau.pdf"],
        })
      );

      const lida = await repo.obter(criada.id);
      expect(lida?.respostasItens).toEqual(respostasItens);
      expect(lida?.demandInfo).toBe("Aprovação de crédito com bureau externo.");
      expect(lida?.anexosContexto).toEqual(["ata-refinamento.md", "contrato-bureau.pdf"]);
    });

    it("campos omitidos viram o mesmo default nos dois lados", async () => {
      // Antes, cada adaptador inventava o seu: arquivo caía em {}/""/[],
      // Postgres em undefined e depois null. O cliente via formas diferentes.
      const repo = await comRepo();
      const criada = await repo.criar(normalizarDadosQuebra({ diagrama: DIAGRAMA }));

      expect(criada.titulo).toBeNull();
      expect(criada.time).toBeNull();
      expect(criada.respostasItens).toEqual({});
      expect(criada.demandInfo).toBe("");
      expect(criada.anexosContexto).toEqual([]);
    });

    it("obter id inexistente devolve null — ausência é resposta, não exceção", async () => {
      const repo = await comRepo();
      await expect(repo.obter("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
    });

    it("atualizar preserva identidade e data de criação", async () => {
      const repo = await comRepo();
      const criada = await repo.criar(normalizarDadosQuebra({ titulo: "Antes", diagrama: DIAGRAMA }));

      const atualizada = await repo.atualizar(criada.id, normalizarDadosQuebra({ titulo: "Depois", diagrama: DIAGRAMA }));

      expect(atualizada?.id).toBe(criada.id);
      expect(atualizada?.titulo).toBe("Depois");
      expect(atualizada?.criadoEm).toBe(criada.criadoEm);
    });

    it("atualizar id inexistente devolve null — PUT nunca cria por acidente", async () => {
      const repo = await comRepo();
      const r = await repo.atualizar("00000000-0000-0000-0000-000000000000", normalizarDadosQuebra({ diagrama: DIAGRAMA }));
      expect(r).toBeNull();
    });

    it("listar devolve resumo, mais recente primeiro", async () => {
      const repo = await comRepo();
      const primeira = await repo.criar(normalizarDadosQuebra({ titulo: "Primeira", diagrama: DIAGRAMA }));
      // Espera o relógio virar: em disco a resolução do mtime é de milissegundo,
      // e duas escritas no mesmo instante empatariam a ordenação.
      await new Promise((r) => setTimeout(r, 15));
      const segunda = await repo.criar(normalizarDadosQuebra({ titulo: "Segunda", diagrama: DIAGRAMA }));

      const lista = await repo.listar();
      expect(lista.map((q) => q.id)).toEqual([segunda.id, primeira.id]);
      // Resumo é resumo: a tela de abrir não carrega diagrama de todas.
      expect(lista[0]).not.toHaveProperty("diagrama");
    });

    it("listar num repositório vazio é lista vazia, não erro", async () => {
      const repo = await comRepo();
      await expect(repo.listar()).resolves.toEqual([]);
    });
  });
}

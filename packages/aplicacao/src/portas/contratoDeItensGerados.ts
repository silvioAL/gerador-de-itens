import { describe, expect, it, beforeEach } from "vitest";
import type { DadosItemGerado, RepositorioDeItensGerados } from "./repositorioDeItensGerados.js";

/**
 * SPEC-41 Parte B — a suíte compartilhada de `RepositorioDeItensGerados`
 * (mesma disciplina da SPEC-31 §8: a mesma pergunta a qualquer adaptador).
 * `criarQuebra` existe porque item pertence a uma quebra de verdade (FK).
 */
export interface AmbienteDeItensGerados {
  repo: RepositorioDeItensGerados;
  criarQuebra: () => Promise<string>;
  limpar: () => Promise<void>;
  /** Marca um item como exportado direto no armazenamento — simula a Fase 2
   * pra provar que a regeneração preserva o rastro externo. */
  marcarExportado: (quebraId: string, chave: string, link: string) => Promise<void>;
}

function item(chave: string, extra: Partial<DadosItemGerado> = {}): DadosItemGerado {
  return {
    chave,
    titulo: `Item ${chave}`,
    tipo: "atomica",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: `### ${chave}\n\ncorpo`,
    pendencias: 2,
    sugestoes: 1,
    ...extra,
  };
}

export function testarContratoDeItensGerados(
  nomeDoAdaptador: string,
  criarAmbiente: () => Promise<AmbienteDeItensGerados>
): void {
  describe(`RepositorioDeItensGerados (${nomeDoAdaptador})`, () => {
    let ambiente: AmbienteDeItensGerados;

    beforeEach(async () => {
      ambiente = await criarAmbiente();
      await ambiente.limpar();
    });

    it("quebra sem geração devolve lista vazia — ausência é resposta", async () => {
      const quebraId = await ambiente.criarQuebra();
      expect(await ambiente.repo.listarDaQuebra(quebraId)).toEqual([]);
    });

    it("substituir grava o conjunto e lê de volta na ordem de geração", async () => {
      const quebraId = await ambiente.criarQuebra();
      const salvos = await ambiente.repo.substituirDaQuebra(quebraId, [
        item("n1::service"),
        item("n2::datastore", { dependencias: ["enabler → n1::service"], pendencias: 0, sugestoes: 0 }),
      ]);

      expect(salvos.map((s) => s.chave)).toEqual(["n1::service", "n2::datastore"]);
      const lidos = await ambiente.repo.listarDaQuebra(quebraId);
      expect(lidos.map((s) => s.chave)).toEqual(["n1::service", "n2::datastore"]);
      expect(lidos[0].estado).toBe("gerado");
      expect(lidos[0].pendencias).toBe(2);
      expect(lidos[0].sugestoes).toBe(1);
      expect(lidos[1].dependencias).toEqual(["enabler → n1::service"]);
    });

    it("regenerar SUBSTITUI: item que saiu do material some, corpo novo prevalece", async () => {
      const quebraId = await ambiente.criarQuebra();
      await ambiente.repo.substituirDaQuebra(quebraId, [item("a"), item("b")]);
      await ambiente.repo.substituirDaQuebra(quebraId, [item("a", { corpoMarkdown: "### a v2" })]);

      const lidos = await ambiente.repo.listarDaQuebra(quebraId);
      expect(lidos.map((s) => s.chave)).toEqual(["a"]);
      expect(lidos[0].corpoMarkdown).toBe("### a v2");
    });

    it("regenerar preserva estado/link de item exportado com a mesma chave", async () => {
      const quebraId = await ambiente.criarQuebra();
      await ambiente.repo.substituirDaQuebra(quebraId, [item("a")]);
      await ambiente.marcarExportado(quebraId, "a", "https://jira.example/AB-12");

      const depois = await ambiente.repo.substituirDaQuebra(quebraId, [item("a", { corpoMarkdown: "### a v2" })]);

      expect(depois[0].estado).toBe("exportado");
      expect(depois[0].linkExterno).toBe("https://jira.example/AB-12");
      expect(depois[0].corpoMarkdown).toBe("### a v2");
    });

    it("itens de uma quebra não vazam pra outra", async () => {
      const q1 = await ambiente.criarQuebra();
      const q2 = await ambiente.criarQuebra();
      await ambiente.repo.substituirDaQuebra(q1, [item("a")]);
      await ambiente.repo.substituirDaQuebra(q2, [item("b")]);

      expect((await ambiente.repo.listarDaQuebra(q1)).map((s) => s.chave)).toEqual(["a"]);
      expect((await ambiente.repo.listarDaQuebra(q2)).map((s) => s.chave)).toEqual(["b"]);
    });
  });
}

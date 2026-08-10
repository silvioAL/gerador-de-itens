import { describe, expect, it, beforeEach } from "vitest";
import type { RepositorioDePerfisTime } from "./repositorioDePerfisTime.js";

/**
 * SPEC-31 §8 — a suíte compartilhada de `RepositorioDePerfisTime`.
 *
 * Os times que a suíte escreve. O adaptador Postgres tem uma chave estrangeira
 * de `perfis_time` para `times` — perfil de time que não existe é lixo — e o de
 * arquivo não tem tabela de times para referenciar. A porta não promete que
 * qualquer string sirva de `timeId`: promete que times EXISTENTES funcionem.
 * Quem precisa preparar o terreno recebe daqui a lista.
 */
export const TIMES_DO_CONTRATO = ["pagamentos", "credito"] as const;

export interface AmbienteDePerfisTime {
  repo: RepositorioDePerfisTime;
  limpar: () => Promise<void>;
}

export function testarContratoDePerfisTime(
  nomeDoAdaptador: string,
  criarAmbiente: () => Promise<AmbienteDePerfisTime>
): void {
  describe(`RepositorioDePerfisTime (${nomeDoAdaptador})`, () => {
    let repo: RepositorioDePerfisTime;

    beforeEach(async () => {
      const ambiente = await criarAmbiente();
      repo = ambiente.repo;
      await ambiente.limpar();
    });

    it("sem perfil nenhum, listar devolve vazio e obter devolve objeto vazio", async () => {
      expect(await repo.listarTodos()).toEqual({});
      expect(await repo.obter("pagamentos")).toEqual({});
    });

    it("define valores e lê de volta na forma aninhada que a web consome", async () => {
      await repo.definir("pagamentos", "servico", { linguagem: "Java", framework: "Spring Boot" });

      expect(await repo.obter("pagamentos")).toEqual({
        servico: { linguagem: "Java", framework: "Spring Boot" },
      });
      expect(await repo.listarTodos()).toEqual({
        pagamentos: { servico: { linguagem: "Java", framework: "Spring Boot" } },
      });
    });

    /**
     * A UI salva um campo por vez. Se `definir` substituísse em vez de
     * mesclar, preencher "framework" apagaria "linguagem" — e o time perderia
     * a stack a cada edição.
     */
    it("definir MESCLA no que já existe, não substitui", async () => {
      await repo.definir("pagamentos", "servico", { linguagem: "Java" });
      const depois = await repo.definir("pagamentos", "servico", { framework: "Spring Boot" });

      expect(depois).toEqual({ linguagem: "Java", framework: "Spring Boot" });
    });

    it("regravar o mesmo campo corrige o valor", async () => {
      await repo.definir("pagamentos", "servico", { linguagem: "Java" });
      await repo.definir("pagamentos", "servico", { linguagem: "Kotlin" });

      expect(await repo.obter("pagamentos")).toEqual({ servico: { linguagem: "Kotlin" } });
    });

    it("times e tipos de nó são compartimentos separados", async () => {
      await repo.definir("pagamentos", "servico", { linguagem: "Java" });
      await repo.definir("pagamentos", "banco", { motor: "Postgres" });
      await repo.definir("credito", "servico", { linguagem: "Go" });

      expect(await repo.obter("pagamentos")).toEqual({
        servico: { linguagem: "Java" },
        banco: { motor: "Postgres" },
      });
      expect(await repo.obter("credito")).toEqual({ servico: { linguagem: "Go" } });
    });

    it("obter um time que não tem perfil devolve vazio, não erro", async () => {
      await repo.definir("pagamentos", "servico", { linguagem: "Java" });

      expect(await repo.obter("time-que-nunca-existiu")).toEqual({});
    });
  });
}

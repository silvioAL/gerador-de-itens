import { describe, expect, it, beforeEach } from "vitest";
import { CAMPO_GLOBAL, type RepositorioDeConfig } from "./repositorioDeConfig.js";

/** SPEC-31 §8 — a suíte compartilhada de `RepositorioDeConfig`. */
export interface AmbienteDeConfig {
  repo: RepositorioDeConfig;
  limpar: () => Promise<void>;
}

export function testarContratoDeConfig(
  nomeDoAdaptador: string,
  criarAmbiente: () => Promise<AmbienteDeConfig>
): void {
  describe(`RepositorioDeConfig (${nomeDoAdaptador})`, () => {
    let repo: RepositorioDeConfig;

    beforeEach(async () => {
      const ambiente = await criarAmbiente();
      repo = ambiente.repo;
      await ambiente.limpar();
    });

    it("config nunca editada devolve null — quem decide o default é a borda", async () => {
      expect(await repo.obter("regras")).toBeNull();
      expect(await repo.obter("pipeline-agentes", "pagamentos")).toBeNull();
    });

    it("salva um documento e lê de volta idêntico, aninhamento incluído", async () => {
      const documento = {
        porTech: { java: { checklistTecnico: [{ texto: "timeout", contextos: ["Backend"] }] } },
        tipos: ["Feature"],
      };

      const salvo = await repo.salvar("regras", CAMPO_GLOBAL, documento, "0.1.60");

      expect(salvo.documento).toEqual(documento);
      expect((await repo.obter("regras"))?.documento).toEqual(documento);
    });

    it("carimba e devolve a versão de quem gravou", async () => {
      await repo.salvar("regras", CAMPO_GLOBAL, { porTech: {} }, "0.1.60");

      expect((await repo.obter("regras"))?.versaoTemplate).toBe("0.1.60");
    });

    it("versão nula é aceita — é o caso de config vinda de antes desta fase", async () => {
      await repo.salvar("regras", CAMPO_GLOBAL, { porTech: {} }, null);

      expect((await repo.obter("regras"))?.versaoTemplate).toBeNull();
    });

    it("regravar a mesma chave corrige, não acumula versões", async () => {
      await repo.salvar("regras", CAMPO_GLOBAL, { porTech: { java: {} } }, "0.1.59");
      await repo.salvar("regras", CAMPO_GLOBAL, { porTech: { go: {} } }, "0.1.60");

      const lido = await repo.obter("regras");
      expect(lido?.documento).toEqual({ porTech: { go: {} } });
      expect(lido?.versaoTemplate).toBe("0.1.60");
    });

    it("chaves diferentes são documentos independentes", async () => {
      await repo.salvar("regras", CAMPO_GLOBAL, { porTech: { java: {} } }, "0.1.60");
      await repo.salvar("pipeline-agentes", CAMPO_GLOBAL, { papeis: [{ id: "po" }] }, "0.1.60");

      expect((await repo.obter("regras"))?.documento).toEqual({ porTech: { java: {} } });
      expect((await repo.obter("pipeline-agentes"))?.documento).toEqual({ papeis: [{ id: "po" }] });
    });

    it("a config do time vence a global, e time sem config própria cai na global", async () => {
      await repo.salvar("regras", CAMPO_GLOBAL, { porTech: { java: {} } }, "0.1.60");
      await repo.salvar("regras", "pagamentos", { porTech: { kotlin: {} } }, "0.1.60");

      expect((await repo.obter("regras", "pagamentos"))?.documento).toEqual({ porTech: { kotlin: {} } });
      expect((await repo.obter("regras", "credito"))?.documento).toEqual({ porTech: { java: {} } });
      expect((await repo.obter("regras"))?.documento).toEqual({ porTech: { java: {} } });
    });

    it("atualizadoEm é ISO-8601 nos dois adaptadores", async () => {
      const salvo = await repo.salvar("regras", CAMPO_GLOBAL, { porTech: {} }, "0.1.60");

      expect(salvo.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(Number.isNaN(Date.parse(salvo.atualizadoEm))).toBe(false);
    });
  });
}

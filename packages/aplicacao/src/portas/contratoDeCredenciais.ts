import { describe, expect, it, beforeEach } from "vitest";
import type { RepositorioDeCredenciais } from "./repositorioDeCredenciais.js";

/** SPEC-31 §8 — a suíte compartilhada de `RepositorioDeCredenciais`. */
export interface AmbienteDeCredenciais {
  repo: RepositorioDeCredenciais;
  limpar: () => Promise<void>;
}

export function testarContratoDeCredenciais(
  nomeDoAdaptador: string,
  criarAmbiente: () => Promise<AmbienteDeCredenciais>
): void {
  describe(`RepositorioDeCredenciais (${nomeDoAdaptador})`, () => {
    let repo: RepositorioDeCredenciais;

    beforeEach(async () => {
      const ambiente = await criarAmbiente();
      repo = ambiente.repo;
      await ambiente.limpar();
    });

    it("sem credencial, obter devolve null e resumir diz não configurado", async () => {
      expect(await repo.obter("gateway")).toBeNull();
      expect(await repo.resumir("gateway")).toEqual({ configurado: false, baseUrl: undefined, modelo: undefined });
    });

    it("salva e lê de volta todos os campos, cabeçalhos extras incluídos", async () => {
      await repo.salvar("gateway", {
        baseUrl: "https://api.anthropic.com/v1",
        chave: "sk-ant-exemplo-de-chave-longa",
        modelo: "claude-sonnet-5",
        cabecalhos: { "anthropic-version": "2023-06-01" },
        formatoJson: "json_schema",
      });

      expect(await repo.obter("gateway")).toMatchObject({
        baseUrl: "https://api.anthropic.com/v1",
        chave: "sk-ant-exemplo-de-chave-longa",
        modelo: "claude-sonnet-5",
        cabecalhos: { "anthropic-version": "2023-06-01" },
        formatoJson: "json_schema",
      });
    });

    /**
     * A regra que existe por causa do modo hospedado: lá a credencial é da
     * organização e é usada por terceiros. `resumir` é o único caminho que a
     * UI tem, e ele nunca pode devolver a chave inteira.
     */
    it("resumir NUNCA devolve a chave inteira", async () => {
      const chave = "sk-ant-uma-chave-secreta-de-verdade";
      await repo.salvar("gateway", { baseUrl: "https://x/v1", chave, modelo: "m" });

      const resumo = await repo.resumir("gateway");

      expect(resumo.configurado).toBe(true);
      expect(JSON.stringify(resumo)).not.toContain(chave);
      expect(resumo.chaveMascarada).toBe("sk-…dade");
    });

    it("credencial sem chave conta como não configurada", async () => {
      await repo.salvar("gateway", { baseUrl: "https://x/v1", modelo: "m" });

      expect((await repo.resumir("gateway")).configurado).toBe(false);
    });

    it("regravar corrige, e provedores diferentes são compartimentos separados", async () => {
      await repo.salvar("gateway", { baseUrl: "https://a/v1", chave: "k1", modelo: "m1" });
      await repo.salvar("gateway", { baseUrl: "https://b/v1", chave: "k2", modelo: "m2" });
      await repo.salvar("outro", { baseUrl: "https://c/v1", chave: "k3", modelo: "m3" });

      expect((await repo.obter("gateway"))?.chave).toBe("k2");
      expect((await repo.obter("outro"))?.chave).toBe("k3");
    });
  });
}

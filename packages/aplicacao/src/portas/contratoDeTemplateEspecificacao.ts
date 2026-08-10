import { describe, expect, it, beforeEach } from "vitest";
import { CAMPO_GLOBAL, type RepositorioDeTemplateEspecificacao } from "./repositorioDeTemplateEspecificacao.js";

/** SPEC-31 §8 — a suíte compartilhada de `RepositorioDeTemplateEspecificacao`. */
export interface AmbienteDeTemplate {
  repo: RepositorioDeTemplateEspecificacao;
  limpar: () => Promise<void>;
}

export function testarContratoDeTemplateEspecificacao(
  nomeDoAdaptador: string,
  criarAmbiente: () => Promise<AmbienteDeTemplate>
): void {
  describe(`RepositorioDeTemplateEspecificacao (${nomeDoAdaptador})`, () => {
    let repo: RepositorioDeTemplateEspecificacao;

    beforeEach(async () => {
      const ambiente = await criarAmbiente();
      repo = ambiente.repo;
      await ambiente.limpar();
    });

    it("sem template salvo, obter devolve null — quem decide o default é a borda", async () => {
      expect(await repo.obter()).toBeNull();
      expect(await repo.obter("pagamentos")).toBeNull();
    });

    it("salva e lê de volta o conteúdo exato, markdown e acentuação incluídos", async () => {
      const conteudo = "# Especificação\n\n## Contexto\n{{titulo}} — refinamento técnico\n";
      const salvo = await repo.salvar(CAMPO_GLOBAL, conteudo);

      expect(salvo.conteudo).toBe(conteudo);
      expect((await repo.obter())?.conteudo).toBe(conteudo);
    });

    it("salvar duas vezes o mesmo timeId corrige, não cria um segundo template", async () => {
      await repo.salvar(CAMPO_GLOBAL, "versão 1");
      await repo.salvar(CAMPO_GLOBAL, "versão 2");

      expect((await repo.obter())?.conteudo).toBe("versão 2");
    });

    it("o template do time vence o global", async () => {
      await repo.salvar(CAMPO_GLOBAL, "o de todo mundo");
      await repo.salvar("pagamentos", "o de pagamentos");

      expect((await repo.obter("pagamentos"))?.conteudo).toBe("o de pagamentos");
      expect((await repo.obter())?.conteudo).toBe("o de todo mundo");
    });

    it("time sem template próprio cai no global", async () => {
      await repo.salvar(CAMPO_GLOBAL, "o de todo mundo");

      expect((await repo.obter("credito"))?.conteudo).toBe("o de todo mundo");
    });

    it("atualizadoEm é ISO-8601 — a mesma forma nos dois adaptadores", async () => {
      const salvo = await repo.salvar(CAMPO_GLOBAL, "conteúdo");

      expect(salvo.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(Number.isNaN(Date.parse(salvo.atualizadoEm))).toBe(false);
    });
  });
}

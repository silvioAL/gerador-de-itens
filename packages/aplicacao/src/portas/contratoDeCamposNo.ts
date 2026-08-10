import { describe, expect, it, beforeEach } from "vitest";
import {
  CAMPO_GLOBAL,
  normalizarDadosCampoNo,
  type DadosCampoNo,
  type RepositorioDeCamposNo,
} from "./repositorioDeCamposNo.js";

/**
 * SPEC-31 §8 — a suíte que todo adaptador de `RepositorioDeCamposNo` responde.
 *
 * Fica fora do `index.ts` de propósito: importa `vitest`, e código de produção
 * que importasse o índice arrastaria o test runner junto. Quem a usa são os
 * testes dos adaptadores, por caminho direto.
 */
export interface AmbienteDeCamposNo {
  repo: RepositorioDeCamposNo;
  limpar: () => Promise<void>;
}

function campo(parcial: Partial<DadosCampoNo>): DadosCampoNo {
  return normalizarDadosCampoNo({ tipoNo: "servico", key: "runtime", label: "Runtime", ...parcial });
}

export function testarContratoDeCamposNo(
  nomeDoAdaptador: string,
  criarAmbiente: () => Promise<AmbienteDeCamposNo>
): void {
  describe(`RepositorioDeCamposNo (${nomeDoAdaptador})`, () => {
    let repo: RepositorioDeCamposNo;

    beforeEach(async () => {
      const ambiente = await criarAmbiente();
      repo = ambiente.repo;
      await ambiente.limpar();
    });

    it("sem campo nenhum, listar devolve lista vazia — não erro", async () => {
      expect(await repo.listar()).toEqual([]);
      expect(await repo.listar("pagamentos")).toEqual([]);
    });

    it("salva um campo e lê de volta com todos os atributos", async () => {
      const salvo = await repo.salvar(
        campo({ type: "select", opcoes: ["Java", "Go"], required: true, ajuda: "a linguagem", ordem: 3 })
      );

      expect(salvo.id).toBeTruthy();
      const [lido] = await repo.listar();
      expect(lido).toMatchObject({
        timeId: CAMPO_GLOBAL,
        tipoNo: "servico",
        key: "runtime",
        label: "Runtime",
        type: "select",
        opcoes: ["Java", "Go"],
        required: true,
        ajuda: "a linguagem",
        ordem: 3,
      });
    });

    it("itemSpec de um campo tipo lista sobrevive à ida e à volta", async () => {
      await repo.salvar(
        campo({
          key: "endpoints",
          label: "Endpoints",
          type: "lista",
          itemSpec: [
            { key: "metodo", label: "Método", type: "select", options: ["GET", "POST"] },
            { key: "rota", label: "Rota", type: "text" },
          ],
        })
      );

      const [lido] = await repo.listar();
      expect(lido.type).toBe("lista");
      expect(lido.itemSpec).toEqual([
        { key: "metodo", label: "Método", type: "select", options: ["GET", "POST"] },
        { key: "rota", label: "Rota", type: "text" },
      ]);
    });

    /**
     * O defeito que esta suíte foi escrita para pegar: o modo local já tratava
     * salvar a mesma chave como correção, e o hospedado fazia `insert` puro
     * contra uma tabela com restrição única em (time, tipoNo, key). Regravar
     * um campo violava a restrição e virava HTTP 500 — o mesmo gesto, dois
     * comportamentos, e o pior deles sem mensagem que ajudasse.
     */
    it("salvar a MESMA chave natural corrige, não duplica", async () => {
      await repo.salvar(campo({ label: "Runtime" }));
      await repo.salvar(campo({ label: "Runtime da aplicação", ordem: 7 }));

      const todos = await repo.listar();
      expect(todos).toHaveLength(1);
      expect(todos[0].label).toBe("Runtime da aplicação");
      expect(todos[0].ordem).toBe(7);
    });

    it("mesma key em tipoNo diferente, ou em time diferente, são campos distintos", async () => {
      await repo.salvar(campo({ tipoNo: "servico" }));
      await repo.salvar(campo({ tipoNo: "banco" }));
      await repo.salvar(campo({ tipoNo: "servico", timeId: "pagamentos" }));

      expect(await repo.listar("pagamentos")).toHaveLength(3);
    });

    it("listar(timeId) traz o global e o do time — e ignora o de OUTRO time", async () => {
      await repo.salvar(campo({ key: "global" }));
      await repo.salvar(campo({ key: "meu", timeId: "pagamentos" }));
      await repo.salvar(campo({ key: "alheio", timeId: "credito" }));

      const doTime = await repo.listar("pagamentos");
      expect(doTime.map((c) => c.key).sort()).toEqual(["global", "meu"]);

      // Sem time: só o que vale para todo mundo.
      expect((await repo.listar()).map((c) => c.key)).toEqual(["global"]);
    });

    it("atualizar altera só o que veio e preserva o resto", async () => {
      const salvo = await repo.salvar(campo({ label: "Runtime", ajuda: "a linguagem", ordem: 2 }));

      const atualizado = await repo.atualizar(salvo.id, { label: "Linguagem" });

      expect(atualizado).toMatchObject({ label: "Linguagem", ajuda: "a linguagem", ordem: 2, key: "runtime" });
    });

    it("atualizar e excluir um id que não existe respondem ausência, não exceção", async () => {
      expect(await repo.atualizar("nao-existe-mesmo", { label: "x" })).toBeNull();
      expect(await repo.excluir("nao-existe-mesmo")).toBe(false);
      expect(await repo.obter("nao-existe-mesmo")).toBeNull();
    });

    it("excluir tira da listagem e responde que havia o que excluir", async () => {
      const salvo = await repo.salvar(campo({}));

      expect(await repo.excluir(salvo.id)).toBe(true);
      expect(await repo.listar()).toEqual([]);
    });
  });
}

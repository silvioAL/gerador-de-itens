import { describe, expect, it, beforeEach } from "vitest";
import { CAMPO_GLOBAL } from "./repositorioDeCamposNo.js";
import {
  normalizarDadosCampoAresta,
  type DadosCampoAresta,
  type RepositorioDeCamposAresta,
} from "./repositorioDeCamposAresta.js";

/**
 * #303 — a suíte que todo adaptador de `RepositorioDeCamposAresta` responde.
 * Hoje há um adaptador só (Postgres); a suíte existe mesmo assim porque é ela
 * que segura o contrato quando a rota deixa de ser dona do SQL — e porque foi
 * a ausência dela que deixou `campos-aresta` fora da SPEC-31 por omissão.
 *
 * Fora do `index.ts` de propósito: importa `vitest`.
 */
export interface AmbienteDeCamposAresta {
  repo: RepositorioDeCamposAresta;
  limpar: () => Promise<void>;
}

function campo(parcial: Partial<DadosCampoAresta>): DadosCampoAresta {
  return normalizarDadosCampoAresta({ tipoAresta: "http", key: "timeout", label: "Timeout", ...parcial });
}

export function testarContratoDeCamposAresta(
  nomeDoAdaptador: string,
  criarAmbiente: () => Promise<AmbienteDeCamposAresta>
): void {
  describe(`RepositorioDeCamposAresta (${nomeDoAdaptador})`, () => {
    let repo: RepositorioDeCamposAresta;

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
        campo({ type: "select", opcoes: ["curto", "longo"], required: true, ajuda: "o timeout da chamada", ordem: 3 })
      );

      expect(salvo.id).toBeTruthy();
      const [lido] = await repo.listar();
      expect(lido).toMatchObject({
        timeId: CAMPO_GLOBAL,
        tipoAresta: "http",
        key: "timeout",
        label: "Timeout",
        type: "select",
        opcoes: ["curto", "longo"],
        required: true,
        ajuda: "o timeout da chamada",
        ordem: 3,
      });
    });

    /** O mesmo defeito que motivou a suíte de camposNo: insert puro contra a
     * restrição única vira 500; regravar tem que ser correção. */
    it("salvar a MESMA chave natural corrige, não duplica", async () => {
      await repo.salvar(campo({ label: "Timeout" }));
      await repo.salvar(campo({ label: "Timeout da chamada", ordem: 7 }));

      const todos = await repo.listar();
      expect(todos).toHaveLength(1);
      expect(todos[0].label).toBe("Timeout da chamada");
      expect(todos[0].ordem).toBe(7);
    });

    it("mesma key em tipoAresta diferente, ou em time diferente, são campos distintos", async () => {
      await repo.salvar(campo({ tipoAresta: "http" }));
      await repo.salvar(campo({ tipoAresta: "consumes" }));
      await repo.salvar(campo({ tipoAresta: "http", timeId: "pagamentos" }));

      expect(await repo.listar("pagamentos")).toHaveLength(3);
    });

    it("listar(timeId) traz o global e o do time — e ignora o de OUTRO time", async () => {
      await repo.salvar(campo({ key: "global" }));
      await repo.salvar(campo({ key: "meu", timeId: "pagamentos" }));
      await repo.salvar(campo({ key: "alheio", timeId: "credito" }));

      const doTime = await repo.listar("pagamentos");
      expect(doTime.map((c) => c.key).sort()).toEqual(["global", "meu"]);
      expect((await repo.listar()).map((c) => c.key)).toEqual(["global"]);
    });

    it("atualizar altera só o que veio e preserva o resto", async () => {
      const salvo = await repo.salvar(campo({ label: "Timeout", ajuda: "da chamada", ordem: 2 }));

      const atualizado = await repo.atualizar(salvo.id, { label: "Timeout (ms)" });

      expect(atualizado).toMatchObject({ label: "Timeout (ms)", ajuda: "da chamada", ordem: 2, key: "timeout" });
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

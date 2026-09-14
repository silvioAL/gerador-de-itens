import { describe, expect, it } from "vitest";
import { MARCADOR_ESPECIFICAR } from "@gerador/engine";
import type { AnexadorDeSpec } from "../portas/anexadorDeSpec.js";
import type { DadosItemGerado, ItemGeradoSalvo, RepositorioDeItensGerados } from "../portas/repositorioDeItensGerados.js";
import { criarCasosDeUsoDeItensGerados } from "./itensGerados.js";

/**
 * SPEC-114 — a lógica de "o que entra, o que fica de fora, e por quê" de
 * `anexarSpecNaQuebra` é a parte que vale testar isolada: o repositório real
 * já tem sua própria suíte de contrato.
 */
function criarRepoFake(iniciais: ItemGeradoSalvo[]): RepositorioDeItensGerados {
  const itens = new Map(iniciais.map((i) => [i.chave, { ...i }]));
  return {
    async listarDaQuebra() {
      return [...itens.values()];
    },
    async substituirDaQuebra(_quebraId: string, _novos: DadosItemGerado[]) {
      throw new Error("não usado neste teste");
    },
    async marcarExportado(_quebraId, chave, linkExterno) {
      const item = itens.get(chave);
      if (!item) return null;
      item.estado = "exportado";
      item.linkExterno = linkExterno;
      return { ...item };
    },
    async marcarSpecAnexada(_quebraId, chave) {
      const item = itens.get(chave);
      if (!item) return null;
      item.specAnexada = true;
      return { ...item };
    },
  };
}

function item(chave: string, extra: Partial<ItemGeradoSalvo> = {}): ItemGeradoSalvo {
  return {
    id: chave,
    quebraId: "q1",
    chave,
    titulo: `Item ${chave}`,
    tipo: "atomica",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: "corpo",
    pendencias: 0,
    sugestoes: 0,
    estado: "gerado",
    linkExterno: null,
    specAnexada: false,
    criadoEm: new Date().toISOString(),
    ...extra,
  };
}

describe("anexarSpecNaQuebra", () => {
  it("anexa a spec de cada item ao issue correspondente, e marca specAnexada", async () => {
    const repo = criarRepoFake([
      item("a", { estado: "exportado", linkExterno: "https://tracker/A-1" }),
      item("b", { estado: "exportado", linkExterno: "https://tracker/B-2" }),
    ]);
    const chamadas: unknown[] = [];
    const anexador: AnexadorDeSpec = {
      async anexar(pedidos) {
        chamadas.push(pedidos);
        return pedidos.map((p) => ({ chave: p.chave }));
      },
    };
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const resultado = await casos.anexarSpecNaQuebra(
      "q1",
      [
        { chave: "a", conteudo: "# Spec do item a" },
        { chave: "b", conteudo: "# Spec do item b" },
      ],
      anexador
    );

    expect(resultado.anexadas.map((i) => i.chave)).toEqual(["a", "b"]);
    expect(resultado.erros).toEqual([]);
    // Cada item manda o SEU conteúdo — não uma cópia da spec do outro.
    expect(chamadas[0]).toEqual([
      { chave: "a", chaveExterna: "https://tracker/A-1", conteudo: "# Spec do item a" },
      { chave: "b", chaveExterna: "https://tracker/B-2", conteudo: "# Spec do item b" },
    ]);
  });

  it("spec com lacuna nem chega a ser enviada — vira comLacuna, não erro", async () => {
    const repo = criarRepoFake([item("a", { estado: "exportado", linkExterno: "https://tracker/A-1" })]);
    let chamou = false;
    const anexador: AnexadorDeSpec = {
      async anexar(pedidos) {
        chamou = true;
        return pedidos.map((p) => ({ chave: p.chave }));
      },
    };
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const resultado = await casos.anexarSpecNaQuebra(
      "q1",
      [{ chave: "a", conteudo: `# Spec\n_(o que não entra)_ ${MARCADOR_ESPECIFICAR}` }],
      anexador
    );

    expect(chamou).toBe(false);
    expect(resultado.comLacuna).toEqual(["a"]);
    expect(resultado.anexadas).toEqual([]);
  });

  it("item sem linkExterno ainda vira semLinkExterno, não erro", async () => {
    const repo = criarRepoFake([item("a")]); // nunca exportado
    const anexador: AnexadorDeSpec = { async anexar(pedidos) { return pedidos.map((p) => ({ chave: p.chave })); } };
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const resultado = await casos.anexarSpecNaQuebra("q1", [{ chave: "a", conteudo: "# Spec" }], anexador);

    expect(resultado.semLinkExterno).toEqual(["a"]);
    expect(resultado.anexadas).toEqual([]);
  });

  it("item já com specAnexada não entra de novo — reenviar manda só o que falta", async () => {
    const repo = criarRepoFake([
      item("a", { estado: "exportado", linkExterno: "https://tracker/A-1", specAnexada: true }),
    ]);
    let pedidosRecebidos: unknown[] = [];
    const anexador: AnexadorDeSpec = {
      async anexar(pedidos) {
        pedidosRecebidos = pedidos;
        return pedidos.map((p) => ({ chave: p.chave }));
      },
    };
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const resultado = await casos.anexarSpecNaQuebra("q1", [{ chave: "a", conteudo: "# Spec" }], anexador);

    expect(pedidosRecebidos).toEqual([]);
    expect(resultado.anexadas).toEqual([]);
    expect(resultado.erros).toEqual([]);
    expect(resultado.semLinkExterno).toEqual([]);
    expect(resultado.comLacuna).toEqual([]);
  });

  it("falha por item, nunca tudo-ou-nada: um erro não impede o outro de anexar", async () => {
    const repo = criarRepoFake([
      item("a", { estado: "exportado", linkExterno: "https://tracker/A-1" }),
      item("b", { estado: "exportado", linkExterno: "https://tracker/B-2" }),
    ]);
    const anexador: AnexadorDeSpec = {
      async anexar(pedidos) {
        return pedidos.map((p) => (p.chave === "a" ? { chave: "a", erro: "HTTP 500" } : { chave: p.chave }));
      },
    };
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const resultado = await casos.anexarSpecNaQuebra(
      "q1",
      [
        { chave: "a", conteudo: "# Spec a" },
        { chave: "b", conteudo: "# Spec b" },
      ],
      anexador
    );

    expect(resultado.erros).toEqual([{ chave: "a", erro: "HTTP 500" }]);
    expect(resultado.anexadas.map((i) => i.chave)).toEqual(["b"]);
  });

  it("item removido do desenho (chave não existe mais) é ignorado, sem lançar", async () => {
    const repo = criarRepoFake([]);
    const anexador: AnexadorDeSpec = { async anexar(pedidos) { return pedidos.map((p) => ({ chave: p.chave })); } };
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const resultado = await casos.anexarSpecNaQuebra("q1", [{ chave: "fantasma", conteudo: "# Spec" }], anexador);

    expect(resultado.anexadas).toEqual([]);
    expect(resultado.erros).toEqual([]);
    expect(resultado.semLinkExterno).toEqual([]);
    expect(resultado.comLacuna).toEqual([]);
  });
});

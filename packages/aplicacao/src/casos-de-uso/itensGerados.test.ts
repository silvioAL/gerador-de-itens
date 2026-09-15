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
      // SPEC-115 — o dublê segue o contrato do repositório real: quem chegou
      // sai do "indo". Sem isto o teste do pipeline provaria o oposto do que o
      // Postgres faz.
      item.specEnviadaEm = null;
      item.specErro = null;
      return { ...item };
    },
    async marcarSpecEnviando(_quebraId, chaves) {
      for (const chave of chaves) {
        const item = itens.get(chave);
        if (!item) continue;
        item.specEnviadaEm = new Date().toISOString();
        item.specErro = null;
      }
    },
    async marcarFalhaDeSpec(_quebraId, chave, erro) {
      const item = itens.get(chave);
      if (!item) return null;
      item.specEnviadaEm = null;
      item.specErro = erro;
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
    specEnviadaEm: null,
    specErro: null,
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

/**
 * SPEC-115 fatia E — **o envio partido em dois, e por quê.**
 *
 * A SPEC-98 §3.2 decidiu, com o usuário, que o envio é assíncrono — e a
 * consequência que ela mesma nomeou é "o estado do envio mora no BANCO, não na
 * tela". Isso só é possível se o produto marcar o item ANTES de chamar o
 * gateway: marcar depois seria tarde exatamente na janela que dura minutos.
 *
 * O que estes testes guardam é essa ordem, e o que acontece com quem não volta.
 */
describe("planejar e concluir o anexo de spec (SPEC-115 fatia E)", () => {
  const exportado = (chave: string) => item(chave, { estado: "exportado" as const, linkExterno: `https://tracker/${chave}` });

  it("planejar marca os itens como INDO antes de qualquer chamada", async () => {
    // A prova central da fatia: o estado já está no repositório quando o plano
    // volta, e o gateway ainda nem foi tocado. É isso que faz um F5 no segundo
    // seguinte encontrar o envio em vez de não encontrar rastro nenhum.
    const repo = criarRepoFake([exportado("a"), exportado("b")]);
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const plano = await casos.planejarAnexoDeSpec("q1", [
      { chave: "a", conteudo: "# Spec a" },
      { chave: "b", conteudo: "# Spec b" },
    ]);

    expect(plano.pedidos.map((p) => p.chave)).toEqual(["a", "b"]);
    const depois = await repo.listarDaQuebra("q1");
    expect(depois.every((i) => i.specEnviadaEm !== null)).toBe(true);
    expect(depois.every((i) => i.specAnexada === false)).toBe(true);
  });

  it("quem fica de fora NÃO é marcado como indo — spec com lacuna nem entra na fila", async () => {
    const repo = criarRepoFake([exportado("a"), exportado("b")]);
    const casos = criarCasosDeUsoDeItensGerados(repo);

    const plano = await casos.planejarAnexoDeSpec("q1", [
      { chave: "a", conteudo: `# Spec a\n\n${MARCADOR_ESPECIFICAR} o endpoint` },
      { chave: "b", conteudo: "# Spec b" },
    ]);

    expect(plano.comLacuna).toEqual(["a"]);
    const porChave = new Map((await repo.listarDaQuebra("q1")).map((i) => [i.chave, i]));
    expect(porChave.get("a")!.specEnviadaEm).toBeNull();
    expect(porChave.get("b")!.specEnviadaEm).not.toBeNull();
  });

  it("uma tentativa nova limpa o erro da anterior — a cicatriz não sobrevive ao reenvio", async () => {
    const repo = criarRepoFake([item("a", { estado: "exportado", linkExterno: "https://t/a", specErro: "HTTP 500" })]);
    const casos = criarCasosDeUsoDeItensGerados(repo);

    await casos.planejarAnexoDeSpec("q1", [{ chave: "a", conteudo: "# Spec a" }]);

    const [depois] = await repo.listarDaQuebra("q1");
    expect(depois.specErro).toBeNull();
    expect(depois.specEnviadaEm).not.toBeNull();
  });

  it("concluir PERSISTE o erro por item — um envio que falha sozinho deixa rastro", async () => {
    /**
     * A rota não espera `concluir`. Se o erro só existisse no valor de retorno,
     * ele morreria sem ninguém para lê-lo, e o item ficaria "indo" para sempre
     * na próxima vez que alguém abrisse a tela.
     */
    const repo = criarRepoFake([exportado("a"), exportado("b")]);
    const casos = criarCasosDeUsoDeItensGerados(repo);
    const anexador: AnexadorDeSpec = {
      async anexar(pedidos) {
        return pedidos.map((p) => (p.chave === "a" ? { chave: "a", erro: "HTTP 500" } : { chave: p.chave }));
      },
    };

    const plano = await casos.planejarAnexoDeSpec("q1", [
      { chave: "a", conteudo: "# a" },
      { chave: "b", conteudo: "# b" },
    ]);
    await casos.concluirAnexoDeSpec("q1", plano.pedidos, anexador);

    const porChave = new Map((await repo.listarDaQuebra("q1")).map((i) => [i.chave, i]));
    expect(porChave.get("a")!.specErro).toBe("HTTP 500");
    expect(porChave.get("a")!.specEnviadaEm).toBeNull();
    expect(porChave.get("b")!.specAnexada).toBe(true);
    expect(porChave.get("b")!.specEnviadaEm).toBeNull();
  });

  it("adaptador que ESTOURA não deixa o lote preso em “indo”", async () => {
    // O contrato da porta é "falha parcial é resposta, não exceção" — mas um
    // adaptador que o quebra não pode condenar o lote a uma espera infinita.
    const repo = criarRepoFake([exportado("a")]);
    const casos = criarCasosDeUsoDeItensGerados(repo);
    const anexador: AnexadorDeSpec = {
      async anexar() {
        throw new Error("conexão recusada");
      },
    };

    const plano = await casos.planejarAnexoDeSpec("q1", [{ chave: "a", conteudo: "# a" }]);
    const { erros } = await casos.concluirAnexoDeSpec("q1", plano.pedidos, anexador);

    expect(erros).toEqual([{ chave: "a", erro: "conexão recusada" }]);
    const [depois] = await repo.listarDaQuebra("q1");
    expect(depois.specErro).toBe("conexão recusada");
    expect(depois.specEnviadaEm).toBeNull();
  });

  it("item sobre o qual o adaptador se cala vira erro, e não espera eterna", async () => {
    const repo = criarRepoFake([exportado("a"), exportado("b")]);
    const casos = criarCasosDeUsoDeItensGerados(repo);
    // Devolve só um dos dois — é o buraco silencioso que o §5 da SPEC-98 chama
    // de "erro escondido".
    const anexador: AnexadorDeSpec = { async anexar() { return [{ chave: "a" }]; } };

    const plano = await casos.planejarAnexoDeSpec("q1", [
      { chave: "a", conteudo: "# a" },
      { chave: "b", conteudo: "# b" },
    ]);
    const { erros } = await casos.concluirAnexoDeSpec("q1", plano.pedidos, anexador);

    expect(erros).toEqual([{ chave: "b", erro: "o envio terminou sem notícia deste item" }]);
    const porChave = new Map((await repo.listarDaQuebra("q1")).map((i) => [i.chave, i]));
    expect(porChave.get("b")!.specEnviadaEm).toBeNull();
  });
});

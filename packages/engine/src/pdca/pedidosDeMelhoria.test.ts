import { describe, expect, it } from "vitest";
import {
  contarPorEstado,
  filtrar,
  montarPedidos,
  resumir,
  type FeedbackDoPedido,
  type SolicitacaoDoPedido,
} from "./pedidosDeMelhoria.js";

/**
 * SPEC-94 (§344) — a fila de pedidos de melhoria.
 *
 * Data fixa: `agora` é parâmetro, então nenhum caso precisa de mock de relógio
 * nem passa a falhar sozinho daqui a um mês.
 */

const AGORA = new Date("2026-03-01T12:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() - n * 24 * 3600_000);

function fb(p: Partial<FeedbackDoPedido> = {}): FeedbackDoPedido {
  return {
    id: "f1",
    email: "quem@usou.com",
    timeId: null,
    texto: "faltou item de DLQ nas filas",
    estado: "novo",
    solicitacaoId: null,
    criadoEm: dias(3),
    ...p,
  };
}

function sol(p: Partial<SolicitacaoDoPedido> = {}): SolicitacaoDoPedido {
  return {
    id: "s1",
    timeId: null,
    solicitante: "quem@pediu.com",
    recurso: "regras",
    descricao: "adicionar checagem de DLQ",
    estado: "pendente",
    criadoEm: dias(2),
    ...p,
  };
}

describe("o pedido de melhoria, um fluxo só (SPEC-94 §344)", () => {
  it("o mesmo assunto deixa de aparecer duas vezes", () => {
    /**
     * **O defeito que originou a rodada.** A tela tinha duas listas — "o que
     * disseram" e "solicitações de ajuste" — e um feedback que virou pedido
     * aparecia nas duas, com dois vocabulários para a mesma coisa.
     */
    const pedidos = montarPedidos([fb({ solicitacaoId: "s1", estado: "virou-ajuste" })], [sol()], AGORA);

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].feedbackId).toBe("f1");
    expect(pedidos[0].solicitacaoId).toBe("s1");
  });

  it("o estado vem da SOLICITAÇÃO, não do feedback", () => {
    /**
     * O feedback fica em `virou-ajuste` para sempre depois da triagem: ele não
     * sabe se o pedido foi aprovado, recusado ou aplicado. Ler o estado dele era
     * o que fazia o placar do §276 contar recusa como mudança.
     */
    const base = fb({ solicitacaoId: "s1", estado: "virou-ajuste" });

    expect(montarPedidos([base], [sol({ estado: "aplicada" })], AGORA)[0].estado).toBe("aplicado");
    expect(montarPedidos([base], [sol({ estado: "rejeitada" })], AGORA)[0].estado).toBe("recusado");
    expect(montarPedidos([base], [sol({ estado: "invalida" })], AGORA)[0].estado).toBe("invalidado");
    expect(montarPedidos([base], [sol({ estado: "aprovada" })], AGORA)[0].estado).toBe("aprovado");
  });

  it("pedido que nasceu DIRETO também entra na fila", () => {
    // Quem já sabe o que quer pedir não passa pelo balão do assistente. Uma fila
    // que só olhasse feedbacks perderia esses — e são a maioria hoje.
    const pedidos = montarPedidos([], [sol({ id: "s9", descricao: "mudar o papel do QA" })], AGORA);

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].feedbackId).toBeUndefined();
    expect(pedidos[0].titulo).toBe("mudar o papel do QA");
  });

  it("feedback ainda não triado é um pedido ABERTO; descartado é fechado", () => {
    const pedidos = montarPedidos([fb({ id: "a" }), fb({ id: "b", estado: "descartado" })], [], AGORA);

    expect(pedidos.find((p) => p.id === "a")!.estado).toBe("aberto");
    expect(pedidos.find((p) => p.id === "b")!.estado).toBe("descartado");
  });

  it("**quem espera há mais tempo vem primeiro** — e os fechados vão para o fim", () => {
    /**
     * É o oposto do que a tela fazia: ela ordenava por mais recente, que é a
     * ordem de um feed. Numa fila de trabalho, o mais novo no topo faz o pedido
     * antigo afundar até ninguém mais o ver — e o esquecido é justamente o que a
     * análise crítica precisa enxergar.
     */
    const pedidos = montarPedidos(
      [
        fb({ id: "novo", criadoEm: dias(1) }),
        fb({ id: "velho", criadoEm: dias(40) }),
        fb({ id: "fechado", criadoEm: dias(90), estado: "descartado" }),
      ],
      [],
      AGORA,
    );

    expect(pedidos.map((p) => p.id)).toEqual(["velho", "novo", "fechado"]);
    expect(pedidos[0].diasEmAberto).toBe(40);
  });

  it("aprovado ainda ESPERA alguém — aprovar não é aplicar", () => {
    /**
     * O defeito do §244: o card ficava em "aprovada" e o botão parecia não ter
     * feito nada. Um pedido aprovado e não aplicado é trabalho parado que parece
     * concluído, e por isso ele fica no bloco dos abertos.
     */
    const pedidos = montarPedidos(
      [],
      [
        sol({ id: "aprovado", estado: "aprovada", criadoEm: dias(10), decididoEm: dias(9) }),
        sol({ id: "aplicado", estado: "aplicada", criadoEm: dias(20), decididoEm: dias(1) }),
      ],
      AGORA,
    );

    expect(pedidos.map((p) => p.id)).toEqual(["aprovado", "aplicado"]);
  });

  it("diz se o pedido APLICA sozinho — texto puro exige mão na configuração", () => {
    const comOperacao = montarPedidos([], [sol({ operacao: { tipo: "adicionar-checklist" } })], AGORA);
    const soTexto = montarPedidos([], [sol()], AGORA);

    expect(comOperacao[0].temOperacao).toBe(true);
    expect(soTexto[0].temOperacao).toBe(false);
  });

  it("filtra por estado e busca por texto, recurso ou autor — sem acento atrapalhar", () => {
    const pedidos = montarPedidos(
      [fb({ id: "a", texto: "faltou validação de contrato" })],
      [sol({ id: "s2", descricao: "outro assunto", recurso: "pipeline-agentes", estado: "aplicada" })],
      AGORA,
    );

    expect(filtrar(pedidos, { estados: ["aberto"] }).map((p) => p.id)).toEqual(["a"]);
    // "validacao" sem acento acha "validação": quem busca não digita acento.
    expect(filtrar(pedidos, { busca: "validacao" }).map((p) => p.id)).toEqual(["a"]);
    expect(filtrar(pedidos, { busca: "PIPELINE" }).map((p) => p.id)).toEqual(["s2"]);
    expect(filtrar(pedidos, { busca: "quem@pediu" }).map((p) => p.id)).toEqual(["s2"]);
    expect(filtrar(pedidos, {}).length).toBe(2);
  });

  it("conta por estado — é o que os filtros mostram sem ninguém precisar somar", () => {
    const conta = contarPorEstado(
      montarPedidos([fb({ id: "a" }), fb({ id: "b" })], [sol({ estado: "aplicada" })], AGORA),
    );

    expect(conta.aberto).toBe(2);
    expect(conta.aplicado).toBe(1);
    expect(conta.recusado).toBe(0);
  });

  describe("o título da linha", () => {
    it("corta na primeira frase, e não no meio de uma palavra", () => {
      expect(resumir("Faltou DLQ. E também idempotência nas filas de retentativa.")).toBe("Faltou DLQ");
    });

    it("não põe reticência no que coube inteiro — reticência que não esconde nada é ruído", () => {
      expect(resumir("texto curto")).toBe("texto curto");
    });

    it("corta o texto longo sem frase, com reticência", () => {
      const longo = "palavra ".repeat(30).trim();
      const r = resumir(longo, 40);

      expect(r.length).toBeLessThanOrEqual(40);
      expect(r.endsWith("…")).toBe(true);
    });

    it("texto vazio não vira linha sem nome", () => {
      expect(resumir("   ")).toBe("(sem texto)");
    });
  });
});

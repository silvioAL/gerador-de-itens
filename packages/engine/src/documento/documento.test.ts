import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "../config/types.js";
import type { Atividade, Diagrama, No } from "../model/types.js";
import { estruturarDocumento } from "./estruturarDocumento.js";
import { gerarDocumentoHtml } from "./gerarDocumentoHtml.js";
import { gerarEspecificacaoEntrega } from "../especificacao/gerarEspecificacaoEntrega.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: ["Backend-dados"],
      spec: [{ key: "nome", label: "Nome", type: "text", required: true }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function no(id: string): No {
  return { id, type: "service", x: 0, y: 0, label: id, status: "novo", spec: {}, specNA: {} };
}
const diagrama: Diagrama = { nodes: [no("n1"), no("n2")], edges: [] };

const atividade: Atividade = {
  chave: "n1::criacao",
  rotulo: "01",
  tipo: "História",
  tamanho: "P",
  descricao: "Criar n1",
  techs: ["Backend"],
  contextos: ["Backend-dados"],
  dependencias: [],
  origem: { nodeId: "n1" },
};

const DECISAO = {
  id: "d1",
  noId: "n1",
  titulo: "Fila em vez de chamada síncrona",
  alternativas: [{ titulo: "Fila" }, { titulo: "Síncrono", consequencia: "a queda do parceiro derruba o checkout" }],
  escolhida: "Fila",
  porque: "Desacopla a disponibilidade do parceiro.",
  status: "aceita" as const,
  origem: "manual" as const,
  autor: "ana",
  em: "2026-08-15T10:00:00.000Z",
};

describe("estruturarDocumento — a fonte única das três saídas (SPEC-58)", () => {
  it("uma dimensão só entra na faixa de saúde quando é USADA", () => {
    // Documento cheio de indicador zerado ensina a ignorar todos eles — mesma
    // disciplina do placar (§230, §239).
    const vazio = estruturarDocumento([atividade], diagrama, config);
    expect(vazio.saude).toEqual([]);

    const comProposito = estruturarDocumento([atividade], diagrama, config, {
      necessidades: [{ id: "r1", texto: "não cobrar duas vezes", origem: "manual", atendidaPor: [] }],
    });
    expect(comProposito.saude.map((s) => s.icone)).toEqual(["🎯"]);
    expect(comProposito.saude[0].nivel).toBe("amarelo");
  });

  it("necessidade sem componente aparece marcada como não atendida", () => {
    const doc = estruturarDocumento([atividade], diagrama, config, {
      necessidades: [
        { id: "r1", texto: "sem dono", origem: "manual", atendidaPor: [] },
        { id: "r2", texto: "com dono", origem: "manual", atendidaPor: ["n1"] },
      ],
    });

    expect(doc.necessidades).toEqual([
      { texto: "sem dono", atendida: false },
      { texto: "com dono", atendida: true },
    ]);
  });

  it("o item cita só os TÍTULOS das decisões — o corpo mora no topo", () => {
    // SPEC-58 fatia 4: o item aponta, o topo conta. Repetir o corpo em cada
    // item é o que faz pular seção num texto que alguém lê inteiro.
    const doc = estruturarDocumento([atividade], diagrama, config, { decisoes: [DECISAO] });

    expect(doc.itens[0].decisoes).toEqual(["Fila em vez de chamada síncrona"]);
    expect(doc.decisoes).toHaveLength(1);
    expect(doc.decisoes[0].alternativas).toHaveLength(2);
  });

  it("a exceção de padrão entra nas decisões do topo, sem virar cópia", () => {
    const doc = estruturarDocumento([atividade], diagrama, config, {
      excecoes: [{ noId: "n1", campo: "timeoutMs", motivo: "o parceiro é lento", autor: "ana", em: "2026-08-15T10:00:00.000Z" }],
    });

    expect(doc.decisoes.map((d) => d.porque)).toContain("o parceiro é lento");
  });
});

describe("gerarDocumentoHtml — o documento que circula (SPEC-58 fatia 5)", () => {
  it("é autocontido: um arquivo, sem link para CSS ou script externo", () => {
    // O precedente é `gerarDiagramaHtml` (SPEC-21). Um documento que depende de
    // rede para ficar bonito chega feio em quem o abrir offline.
    const html = gerarDocumentoHtml(estruturarDocumento([atividade], diagrama, config));

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it("escapa o que vem do usuário — título de decisão não vira tag", () => {
    const html = gerarDocumentoHtml(
      estruturarDocumento([atividade], diagrama, config, {
        decisoes: [{ ...DECISAO, titulo: "<script>alert(1)</script>" }],
      })
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("mostra a escolhida E as descartadas riscadas — o que serve daqui a um ano", () => {
    const html = gerarDocumentoHtml(estruturarDocumento([atividade], diagrama, config, { decisoes: [DECISAO] }));

    expect(html).toContain("<s>Síncrono</s>");
    expect(html).toContain("derruba o checkout");
  });

  it("demanda sem decisão diz que isso é legítimo, em vez de deixar um buraco", () => {
    // É a SPEC-58 inteira em uma frase: nem toda mudança move arquitetura, e a
    // que não move não pode parecer documento incompleto.
    const html = gerarDocumentoHtml(estruturarDocumento([atividade], diagrama, config));

    expect(html).toContain("nem toda mudança move arquitetura");
  });

  it("a seção escrita por gente é marcada como tal", () => {
    // Proveniência aplicada ao documento: quem lê precisa saber o que uma
    // pessoa afirmou e o que a máquina apurou.
    const html = gerarDocumentoHtml(estruturarDocumento([atividade], diagrama, config), {
      escritas: [{ titulo: "Riscos", texto: "O parceiro pode mudar o contrato sem aviso." }],
    });

    expect(html).toContain("escrito por uma pessoa");
    expect(html).toContain("mudar o contrato sem aviso");
  });

  it("seção escrita VAZIA não vira título órfão", () => {
    const html = gerarDocumentoHtml(estruturarDocumento([atividade], diagrama, config), {
      escritas: [{ titulo: "Riscos", texto: "   " }],
    });

    expect(html).not.toContain("Riscos");
  });

  it("imprime: tem regra de @media print", () => {
    // O PDF sai do Ctrl+P. Sem isto, sai com sombra, fundo cinza e cortando
    // cartão no meio da página.
    expect(gerarDocumentoHtml(estruturarDocumento([atividade], diagrama, config))).toContain("@media print");
  });
});

describe("guarda de divergência — as saídas contam os mesmos fatos (SPEC-58 §7.3)", () => {
  it("o que está na estrutura está no markdown: decisão, necessidade e item", () => {
    // A régua que impede as saídas de divergirem. Sem este teste, a primeira
    // mudança numa delas só apareceria quando alguém reclamasse que o arquivo
    // exportado não tem o que a tela tinha.
    const opcoes = {
      titulo: "Catálogo",
      demandInfo: "Reduzir a latência da vitrine.",
      decisoes: [DECISAO],
      necessidades: [{ id: "r1", texto: "a vitrine responde rápido", origem: "manual" as const, atendidaPor: ["n1"] }],
    };
    const doc = estruturarDocumento([atividade], diagrama, config, opcoes);
    const markdown = gerarEspecificacaoEntrega([atividade], diagrama, config, opcoes);
    const html = gerarDocumentoHtml(doc);

    for (const saida of [markdown, html]) {
      expect(saida).toContain("Fila em vez de chamada síncrona");
      expect(saida).toContain("a vitrine responde rápido");
      expect(saida).toContain("Criar n1");
    }
  });

  it("o markdown tem a seção de decisões UMA vez, no topo — não uma por item", () => {
    const markdown = gerarEspecificacaoEntrega([atividade], diagrama, config, { decisoes: [DECISAO] });

    expect(markdown).toContain("## Decisões");
    // O corpo (a alternativa descartada com a consequência) aparece só lá.
    expect(markdown.match(/derruba o checkout/g) ?? []).toHaveLength(1);
  });

  it("sem decisão, sem trade-offs e sem riscos, o markdown não deixa título órfão", () => {
    const markdown = gerarEspecificacaoEntrega([atividade], diagrama, config, {});

    expect(markdown).not.toContain("## Decisões");
    expect(markdown).not.toContain("## Trade-offs");
    expect(markdown).not.toContain("## Riscos");
    // E os itens continuam lá: a remoção não pode levar seção alheia junto.
    expect(markdown).toContain("## Itens");
    expect(markdown).toContain("Criar n1");
  });

  it("com o que a pessoa escreveu, as seções aparecem no markdown", () => {
    const markdown = gerarEspecificacaoEntrega([atividade], diagrama, config, {
      tradeOffs: "Aceitamos latência maior na escrita.",
      riscos: "O parceiro pode mudar o contrato.",
    });

    expect(markdown).toContain("## Trade-offs e o que ficou de fora");
    expect(markdown).toContain("Aceitamos latência maior na escrita.");
    expect(markdown).toContain("## Riscos e o que pode dar errado");
  });
});

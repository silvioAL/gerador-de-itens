import { describe, expect, it } from "vitest";
import type { Atividade, Decisao, Necessidade } from "../model/types.js";
import { derivarSecoesDeJulgamento } from "./derivarJulgamento.js";
import { gerarSpec } from "./gerarSpec.js";
import { MARCADOR_ESPECIFICAR } from "../refinamento/gerarRefinamento.js";

/**
 * SPEC-115 (§410) — **a spec sai do que foi decidido, não de uma caixa em
 * branco.**
 *
 * A rodada anterior deixou três textareas vazios como conserto, e isso
 * contradizia a tese da própria SPEC-115 §1.1. A correção do usuário: a caixa é
 * a superfície da interação com o agente — *"se coloca input e interage com o
 * agente para passar contexto de projeto e tomar decisões que depois vão
 * derivar para as respectivas specs"*.
 *
 * O que estes testes guardam é a cadeia inteira e, principalmente, **o que ela
 * NÃO afrouxa**: o modelo continua sem escrever julgamento.
 */
function decisao(p: Partial<Decisao> = {}): Decisao {
  return {
    id: "d1",
    titulo: "Fila em vez de síncrono",
    alternativas: [{ titulo: "Fila" }, { titulo: "Síncrono", consequencia: "acopla ao parceiro no pico" }],
    escolhida: "Fila",
    porque: "desacopla o pico",
    status: "aceita",
    origem: "manual",
    autor: "ana",
    em: "2026-09-10T10:00:00.000Z",
    ...p,
  };
}

function necessidade(p: Partial<Necessidade> = {}): Necessidade {
  return {
    id: "n1",
    texto: "A consulta responde em até 2s no pico",
    origem: "manual",
    atendidaPor: [],
    ...p,
  };
}

function atividade(p: Partial<Atividade> = {}): Atividade {
  return {
    chave: "srv::criacao",
    rotulo: "Criar srv-catalogo",
    tipo: "atomica",
    tamanho: "P",
    descricao: "criar o serviço",
    techs: [],
    contextos: [],
    dependencias: [],
    origem: { tipo: "no", nodeId: "srv" },
    ...p,
  } as Atividade;
}

describe("recusas — a alternativa descartada É o que não entra", () => {
  it("cada descartada vira uma recusa, com a consequência de tê-la escolhido", () => {
    const { recusas } = derivarSecoesDeJulgamento({ decisoes: [decisao()] });

    expect(recusas).toContain("Síncrono");
    expect(recusas).toContain("acopla ao parceiro no pico");
    // A marca viaja NO MARKDOWN, não só na tela: a spec sobe para o issue e é
    // lida fora da ferramenta.
    expect(recusas).toContain("derivado de 1 alternativa descartada");
  });

  it("PROPOSTA do agente não deriva nada — proposta não é decisão", () => {
    /**
     * A guarda central da trava da SPEC-80 fatia D com a derivação ligada. Uma
     * `Decisao` que o agente propôs chega `status: "proposta"` e espera alguém.
     * Derivar a partir dela colocaria na spec, como recusa assumida, uma
     * alternativa que ninguém descartou — o modelo escrevendo julgamento por
     * um caminho novo, que é exatamente o que a trava existe para impedir.
     */
    const { recusas } = derivarSecoesDeJulgamento({
      decisoes: [decisao({ status: "proposta", origem: "sugerido" })],
    });

    expect(recusas).toBeUndefined();
  });

  it("decisão SUBSTITUÍDA não volta pela spec", () => {
    const { recusas } = derivarSecoesDeJulgamento({ decisoes: [decisao({ status: "substituida" })] });
    expect(recusas).toBeUndefined();
  });

  it("decisão sem alternativa descartada não recusa nada — e isso é resposta legítima", () => {
    const { recusas } = derivarSecoesDeJulgamento({
      decisoes: [decisao({ alternativas: [{ titulo: "Fila" }] })],
    });
    expect(recusas).toBeUndefined();
  });
});

describe("origem — as palavras de quem pediu são as que alguém digitou", () => {
  it("junta o contexto da demanda e os propósitos declarados", () => {
    const { origem } = derivarSecoesDeJulgamento({
      contextoDaDemanda: "O time de catálogo pediu na reunião de refinamento.",
      necessidades: [necessidade()],
    });

    expect(origem).toContain("reunião de refinamento");
    expect(origem).toContain("A consulta responde em até 2s no pico");
  });

  it("necessidade INFERIDA e não confirmada fica de fora — palpite não é pedido", () => {
    // Enquanto ninguém a assinou, ela não é o que foi pedido: é o que alguém
    // achou que foi. Dar-lhe o peso de um pedido é o defeito da SPEC-80 §2
    // aplicado a dado do próprio motor.
    const { origem } = derivarSecoesDeJulgamento({
      necessidades: [necessidade({ origem: "inferido", confirmado: false })],
    });

    expect(origem).toBeUndefined();
  });

  it("confirmada entra, com a procedência à vista", () => {
    const { origem } = derivarSecoesDeJulgamento({
      necessidades: [necessidade({ origem: "extraido", confirmado: true })],
    });

    expect(origem).toContain("A consulta responde em até 2s no pico");
    expect(origem).toContain("extraido");
  });
});

describe("fatias — cada item derivado é uma fatia, e a prova mora no item", () => {
  it("lista o recorte de cada item e aponta a prova, sem copiá-la", () => {
    /**
     * A omissão é deliberada: os critérios de aceite viajam no corpo do item, no
     * MESMO payload que sobe com a spec. Repeti-los criaria dois textos com o
     * mesmo conteúdo, que divergem no primeiro que alguém editar (§323).
     */
    const { fatias } = derivarSecoesDeJulgamento({ itens: [atividade()] });

    expect(fatias).toContain("Criar srv-catalogo");
    expect(fatias).toContain("atomica, P");
    expect(fatias).toContain("Prova: os critérios de aceite deste item");
  });
});

describe("a derivação dentro de gerarSpec — a ordem é a regra inteira", () => {
  it("o que uma PESSOA escreveu vence a derivação", () => {
    // SPEC-58 regra 3: julgamento de alguém não é sobrescrito por motor nenhum.
    const markdown = gerarSpec({
      escrita: { recusas: "Nada fica de fora nesta rodada.", itensCobertos: ["srv::criacao"] },
      itens: [atividade()],
      julgamento: { decisoes: [decisao()] },
    });

    expect(markdown).toContain("Nada fica de fora nesta rodada.");
    expect(markdown).not.toContain("acopla ao parceiro no pico");
  });

  it("sem texto de gente, a derivação FECHA a lacuna — a spec passa a poder subir", () => {
    /**
     * É o defeito que a rodada §409 encontrou, resolvido pela raiz: as três
     * seções vazias marcavam lacuna, lacuna é recusa de envio (SPEC-98 §6), e
     * por isso o botão "Anexar spec aos itens" nunca anexou nada.
     */
    const markdown = gerarSpec({
      escrita: { itensCobertos: ["srv::criacao"] },
      itens: [atividade()],
      julgamento: {
        contextoDaDemanda: "O time de catálogo pediu.",
        necessidades: [necessidade()],
        decisoes: [decisao()],
      },
    });

    expect(markdown).not.toContain(MARCADOR_ESPECIFICAR);
  });

  it("sem material nenhum, a lacuna CONTINUA — derivação que não tem de onde derivar é silêncio", () => {
    // O comportamento de antes, byte a byte, para quem não decidiu nada. Uma
    // spec que se declara completa sem ninguém ter decidido é exatamente a
    // "plausível-mas-vazia" que a SPEC-80 §2 nomeia.
    const markdown = gerarSpec({ escrita: { itensCobertos: ["srv::criacao"] }, itens: [atividade()], julgamento: {} });

    expect(markdown).toContain(MARCADOR_ESPECIFICAR);
  });

  it("sem `julgamento`, nada muda para quem já usava — a opção é aditiva", () => {
    const antes = gerarSpec({ escrita: { itensCobertos: ["srv::criacao"] }, itens: [atividade()] });
    const depois = gerarSpec({ escrita: { itensCobertos: ["srv::criacao"] }, itens: [atividade()], julgamento: undefined });

    expect(depois).toBe(antes);
    expect(antes).toContain(MARCADOR_ESPECIFICAR);
  });

  it("a spec de UM item lista a fatia daquele item, não as da demanda inteira", () => {
    /**
     * SPEC-114 §2.2 — a spec é recortada por item. Derivar as fatias de tudo
     * que foi passado descreveria um escopo que esta spec não tem, e quem
     * lesse o issue acharia que aquele item entrega os outros também.
     */
    const outro = atividade({ chave: "fila::criacao", rotulo: "Criar a fila" });
    const markdown = gerarSpec({
      escrita: { itensCobertos: ["srv::criacao"] },
      itens: [atividade(), outro],
      julgamento: { decisoes: [decisao()] },
    });

    expect(markdown).toContain("Criar srv-catalogo");
    expect(markdown).not.toContain("Criar a fila");
  });
});

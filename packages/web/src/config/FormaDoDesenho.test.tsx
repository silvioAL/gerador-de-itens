import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import { ConstrutorDeForma, FormaDoDesenho, descreverForma, idDaRegraDeForma } from "./FormaDoDesenho";

const config: DiagramaConfig = {
  nodeTypes: {
    fila: { label: "Fila Rabbit", derives: "queue", techs: ["Backend"], contextos: [], spec: [] },
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
  },
  edgeTypes: { consome: { label: "consome" } },
  edgeRules: {},
};

/**
 * SPEC-63 fatia D — a régua de forma nasce do time, não do JSON.
 */
describe("FormaDoDesenho — o editor da régua de forma", () => {
  it("o editor só oferece tipos que EXISTEM — é o que impede a régua de nascer quebrada", () => {
    // Melhor que validar depois: por aqui não dá para apontar para um tipo
    // inexistente, e `validateRegras` segue guardando quem edita o arquivo.
    render(<FormaDoDesenho config={config} requisitos={[]} onMudar={vi.fn()} />);

    const componente = screen.getByLabelText("Componente da régua") as HTMLSelectElement;
    expect([...componente.options].map((o) => o.textContent)).toEqual(["Fila Rabbit", "Serviço"]);
    const conexao = screen.getByLabelText("Tipo de conexão") as HTMLSelectElement;
    expect([...conexao.options].map((o) => o.textContent)).toEqual(["qualquer conexão", "consome"]);
  });

  it("mostra a FRASE que a régua vai conferir antes de gravar", () => {
    // É o que a pessoa vai ler no placar quando o desenho contrariar a régua.
    render(<FormaDoDesenho config={config} requisitos={[]} onMudar={vi.fn()} />);

    expect(screen.getByTestId("forma-previa").textContent).toContain("Todo Fila Rabbit precisa de uma conexão");
  });

  it("adicionar devolve a régua com id ESTÁVEL, derivado do texto", () => {
    // O id é a chave a que as exceções se prendem; pedir à pessoa que invente
    // um identificador seria pedir a coisa errada no momento errado.
    const onMudar = vi.fn();
    render(<FormaDoDesenho config={config} requisitos={[]} onMudar={onMudar} />);

    fireEvent.change(screen.getByLabelText("Texto da régua de forma"), { target: { value: "Toda fila tem consumidor" } });
    fireEvent.change(screen.getByLabelText("Por que esta régua existe"), { target: { value: "acumula em silêncio" } });
    fireEvent.click(screen.getByTestId("adicionar-forma"));

    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "forma-toda-fila-tem-consumidor",
        texto: "Toda fila tem consumidor",
        porque: "acumula em silêncio",
      }),
    ]);
  });

  it("regravar a mesma régua ATUALIZA em vez de duplicar — id igual, uma linha só", () => {
    const onMudar = vi.fn();
    const existente = {
      id: "forma-toda-fila-tem-consumidor",
      texto: "Toda fila tem consumidor",
      checagem: { tipo: "exige-conexao" as const, tipoNo: "fila", direcao: "sai" as const },
    };
    render(<FormaDoDesenho config={config} requisitos={[existente]} onMudar={onMudar} />);

    fireEvent.change(screen.getByLabelText("Texto da régua de forma"), { target: { value: "Toda fila tem consumidor" } });
    fireEvent.click(screen.getByTestId("adicionar-forma"));

    expect(onMudar.mock.calls[0][0]).toHaveLength(1);
  });

  it("sem permissão na seção, a régua se lê e não se edita", () => {
    render(
      <FormaDoDesenho
        config={config}
        requisitos={[
          { id: "f1", texto: "x", checagem: { tipo: "exige-conexao", tipoNo: "fila", direcao: "sai" } },
        ]}
        onMudar={vi.fn()}
        somenteLeitura
      />
    );

    expect(screen.getByTestId("forma-regra-f1")).toBeInTheDocument();
    expect(screen.queryByTestId("adicionar-forma")).toBeNull();
    expect(screen.queryByTestId("remover-forma-f1")).toBeNull();
  });

  it("o construtor reporta a régua montada — é assim que o estúdio do PDCA a usa", () => {
    // Mesmo formulário nos dois lugares: duas cópias divergiriam na primeira
    // mudança (a lição do `Delta`, §263).
    const onMudou = vi.fn();
    render(<ConstrutorDeForma config={config} onMudou={onMudou} />);

    fireEvent.change(screen.getByLabelText("Texto da régua de forma"), { target: { value: "App não fala com banco" } });

    expect(onMudou).toHaveBeenLastCalledWith(expect.objectContaining({ texto: "App não fala com banco" }));
  });
});

describe("descreverForma / idDaRegraDeForma", () => {
  it("a frase da proibição diz os dois lados", () => {
    expect(descreverForma({ tipo: "proibe-conexao", deTipoNo: "service", paraTipoNo: "fila" }, config)).toBe(
      "Nenhuma conexão pode ligar Serviço a Fila Rabbit"
    );
  });

  it("o id perde acento e espaço, e nunca nasce vazio", () => {
    expect(idDaRegraDeForma("Toda fila tem consumidor")).toBe("forma-toda-fila-tem-consumidor");
    expect(idDaRegraDeForma("   ")).toBe("forma-regra");
  });
});

/**
 * SPEC-67 — a régua de GRAU, e o formulário que abre preenchido.
 */
describe("ConstrutorDeForma — limitar quantas conexões", () => {
  it("a terceira checagem existe, e a prévia diz o máximo E o 'que esperam'", () => {
    // "que esperam resposta" não é enfeite: é o que separa esta régua de um
    // linter de grafo, e quem lê a frase precisa ver a diferença.
    const onMudou = vi.fn();
    render(<ConstrutorDeForma config={config} onMudou={onMudou} />);

    fireEvent.change(screen.getByLabelText("Texto da régua de forma"), { target: { value: "No máximo 2" } });
    fireEvent.change(screen.getByLabelText("Tipo de régua de forma"), { target: { value: "limita-grau" } });

    expect(onMudou).toHaveBeenLastCalledWith(
      expect.objectContaining({
        checagem: expect.objectContaining({ tipo: "limita-grau", maximo: 2, apenasQueEsperam: true }),
      })
    );
  });

  it("dá para contar TODAS as conexões — quem quer grau bruto pode pedir", () => {
    const onMudou = vi.fn();
    render(<ConstrutorDeForma config={config} onMudou={onMudou} />);

    fireEvent.change(screen.getByLabelText("Texto da régua de forma"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Tipo de régua de forma"), { target: { value: "limita-grau" } });
    fireEvent.click(screen.getByLabelText("Contar só as conexões que esperam resposta"));

    expect(onMudou.mock.calls.at(-1)![0].checagem.apenasQueEsperam).toBeUndefined();
  });

  it("abre PREENCHIDO a partir de um fato — é o 'um clique'", () => {
    // Ninguém reconstrói à mão o que o produto acabou de medir.
    const partida = {
      id: "forma-servico-faz-no-maximo-2",
      texto: "Serviço faz no máximo 2 chamadas antes de responder",
      porque: "A resposta é a soma das chamadas que esperam.",
      checagem: { tipo: "limita-grau" as const, tipoNo: "service", direcao: "sai" as const, maximo: 2, apenasQueEsperam: true },
    };
    render(<ConstrutorDeForma config={config} partida={partida} onMudou={vi.fn()} />);

    expect((screen.getByLabelText("Texto da régua de forma") as HTMLInputElement).value).toBe(partida.texto);
    expect((screen.getByLabelText("Por que esta régua existe") as HTMLInputElement).value).toBe(partida.porque);
    expect((screen.getByLabelText("Máximo de conexões") as HTMLInputElement).value).toBe("2");
    // Tudo EDITÁVEL: a frase da leitura é um bom começo e não é a régua do
    // time — quem publica assina, e assinar exige poder mudar.
    fireEvent.change(screen.getByLabelText("Máximo de conexões"), { target: { value: "4" } });
    expect((screen.getByLabelText("Máximo de conexões") as HTMLInputElement).value).toBe("4");
  });

  it("chegando de um fato, a tela DIZ de onde a régua veio", () => {
    // Senão parece que o produto inventou uma régua sozinho.
    render(
      <FormaDoDesenho
        config={config}
        requisitos={[]}
        onMudar={vi.fn()}
        partida={{
          id: "f1",
          texto: "x",
          checagem: { tipo: "limita-grau", tipoNo: "service", direcao: "sai", maximo: 2 },
        }}
      />
    );

    expect(screen.getByTestId("forma-veio-da-leitura")).toHaveTextContent("fato medido no seu desenho");
  });
});

describe("descreverForma — a frase da régua de grau", () => {
  it("diz o número, a direção e que só conta o que espera", () => {
    expect(
      descreverForma(
        { tipo: "limita-grau", tipoNo: "service", direcao: "sai", maximo: 2, apenasQueEsperam: true },
        config
      )
    ).toBe("Todo Serviço pode ter no máximo 2 conexões que esperam resposta saindo");
  });

  it("no singular, 'conexão' — número em frase que erra a concordância soa a rascunho", () => {
    expect(
      descreverForma({ tipo: "limita-grau", tipoNo: "service", direcao: "sai", maximo: 1 }, config)
    ).toBe("Todo Serviço pode ter no máximo 1 conexão saindo");
  });
});

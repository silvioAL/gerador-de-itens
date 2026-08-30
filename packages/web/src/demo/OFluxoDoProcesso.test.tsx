import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OFluxoDoProcesso } from "./OFluxoDoProcesso";
import { CONEXOES } from "./conceito";
import { ESTAGIOS_DO_CICLO, FASES_DA_JORNADA, ROTULO_DA_FASE } from "./ciclo";

/**
 * SPEC-90 — **a jornada, e as travas que a mantêm honesta.**
 *
 * Duas famílias aqui, e a segunda é a que importa mais: a que impede este
 * diagrama de virar a `Jornada` que o §323 tirou desta página por repetição.
 */

describe("o fluxo sai do DADO (SPEC-90 §2)", () => {
  it("toda fase declarada tem pelo menos um estágio — fase vazia não vira caixa bonita", () => {
    /**
     * Fase é AGRUPAMENTO do que existe. Uma fase sem estágio seria uma caixa
     * desenhada porque ficava bem no diagrama, e é exatamente o tipo de promessa
     * que a régua da SPEC-76 proíbe.
     */
    const vazias = FASES_DA_JORNADA.filter((f) => !ESTAGIOS_DO_CICLO.some((e) => e.fase === f));

    expect(vazias, `fases sem estágio nenhum:\n${vazias.join("\n")}`).toEqual([]);
  });

  it("toda conexão aponta para um estágio que EXISTE", () => {
    // Uma conexão ancorada no vazio é um caminho que a página promete e o
    // produto não tem — e o diagrama a desenharia em lugar nenhum, calada.
    const ids = new Set(ESTAGIOS_DO_CICLO.map((e) => e.id));
    const orfas = CONEXOES.filter((c) => !ids.has(c.noEstagio));

    expect(orfas.map((c) => `${c.id} → ${c.noEstagio}`)).toEqual([]);
  });

  it("as fases cobrem os treze estágios, sem sobra nem falta", () => {
    const cobertos = FASES_DA_JORNADA.flatMap((f) => ESTAGIOS_DO_CICLO.filter((e) => e.fase === f));

    expect(cobertos).toHaveLength(ESTAGIOS_DO_CICLO.length);
  });

  it("desenha uma caixa por fase, e um salto por conexão", () => {
    render(<OFluxoDoProcesso />);

    for (const fase of FASES_DA_JORNADA) {
      expect(screen.getByTestId(`fase-${fase}`)).toBeInTheDocument();
    }
    for (const c of CONEXOES) {
      expect(screen.getByTestId(`salto-${c.id}`)).toBeInTheDocument();
    }
  });

  it("o salto que ainda não existe APARECE, e marcado", () => {
    /**
     * Esconder o que falta seria uma história forte e incompleta — a mesma régua
     * do círculo. O caminho ausente vai tracejado e com a palavra ao lado, nunca
     * omitido.
     */
    render(<OFluxoDoProcesso />);
    const ausentes = CONEXOES.filter((c) => c.estado !== "completo");

    for (const c of ausentes) {
      expect(screen.getByTestId(`salto-${c.id}`)).toHaveTextContent(/parcial|ainda não existe/);
    }
  });
});

describe("o fluxo NÃO é a `Jornada` de volta (SPEC-90 §1.1)", () => {
  it("nenhum RESUMO de estágio aparece aqui", () => {
    /**
     * **A trava que define esta rodada.**
     *
     * O §323 tirou a `Jornada` desta página com uma medição: *"4 das 5 etapas
     * dela eram estágios que o círculo acabava de mostrar"* — a mesma narrativa
     * contada três vezes.
     *
     * Este diagrama pode mostrar os NOMES (é o percurso) e não pode explicar o
     * que cada parada faz (é o índice, e ele já está no círculo). Se um resumo
     * aparecer aqui, é a `Jornada` de novo com outro nome.
     */
    render(<OFluxoDoProcesso />);
    const texto = document.body.textContent ?? "";

    const repetidos = ESTAGIOS_DO_CICLO.filter((e) => texto.includes(e.resumo)).map((e) => e.id);

    expect(repetidos, `resumos de estágio repetidos no fluxo:\n${repetidos.join("\n")}`).toEqual([]);
  });

  it("nenhum DETALHE de estágio aparece aqui", () => {
    render(<OFluxoDoProcesso />);
    const texto = document.body.textContent ?? "";

    // O detalhe é longo; comparar o começo basta para pegar a cópia.
    const repetidos = ESTAGIOS_DO_CICLO.filter((e) => texto.includes(e.detalhe.slice(0, 40))).map((e) => e.id);

    expect(repetidos).toEqual([]);
  });

  it("mostra os NOMES das paradas — é isso que faz dele um percurso", () => {
    // A contraprova do teste acima: sem os nomes, não haveria jornada nenhuma,
    // só caixas com rótulo de fase.
    render(<OFluxoDoProcesso />);
    const texto = document.body.textContent ?? "";

    for (const estagio of ESTAGIOS_DO_CICLO) {
      expect(texto, `o nome de "${estagio.id}" sumiu do fluxo`).toContain(estagio.titulo);
    }
  });
});

describe("o que está FORA é dito como fora (SPEC-90 §3)", () => {
  it("as DUAS raias são nomeadas — dentro e fora do sistema", () => {
    /**
     * O usuário olhou a primeira versão rodando: *"não discrimina o que é feito
     * dentro x fora do sistema, como em diagramas mais didáticos de BPM que têm
     * as personas."* Estava certo — havia uma faixa no topo, bonita, e ela não
     * dizia de que lado cada coisa acontece.
     *
     * A asserção mudou com o desenho: antes cobrava o texto da faixa
     * (`"FORA — o gateway do time"`), agora cobra que **as duas raias existem e
     * são nomeadas**. É a fronteira que comunica, não a legenda.
     */
    render(<OFluxoDoProcesso />);
    const fluxo = screen.getByTestId("fluxo-do-processo");

    expect(fluxo).toHaveTextContent("FORA");
    expect(fluxo).toHaveTextContent("DENTRO · este sistema");
  });

  it("o MCP não é desenhado como caixa nossa", () => {
    /**
     * O produto **não implementa MCP**: chama um gateway configurável, e quem
     * fala MCP está do outro lado (SPEC-81). Desenhar o protocolo como peça daqui
     * seria afirmar uma capacidade que não existe — e "MCP" numa caixa é
     * exatamente como isso apareceria.
     */
    render(<OFluxoDoProcesso />);

    expect(screen.getByTestId("fluxo-do-processo")).not.toHaveTextContent(/MCP/);
  });

  it("a volta do PDCA é desenhada — é o que faz disto um ciclo e não uma esteira", () => {
    render(<OFluxoDoProcesso />);

    expect(screen.getByTestId("fluxo-do-processo")).toHaveTextContent("vira ajuste na camada perene");
    expect(ROTULO_DA_FASE.volta).toBeTruthy();
  });
});

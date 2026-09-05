import { describe, expect, it } from "vitest";
import {
  EntradaDoConectorInvalida,
  mapearSaidaDoConector,
  montarChamadaDoConector,
} from "./conectores.js";
import type { Conector } from "../config/conectores.js";

const CONECTOR: Conector = {
  id: "volumetria",
  nome: "Volumetria (Dynatrace)",
  endpoint: "https://gateway.exemplo/volumetria",
  metodo: "POST",
  cabecalhos: { Authorization: "Bearer segredo" },
  envelope: "",
  entrada: [
    { chave: "projetoId", rotulo: "Projeto", tipo: "texto", obrigatorio: true },
    { chave: "janela", rotulo: "Janela", tipo: "texto" },
  ],
  saida: [
    { chave: "rps", rotulo: "Requisições/s", tipo: "numero", caminho: "$.dados.rps", obrigatorio: true },
    { chave: "pico", rotulo: "Pico", tipo: "numero", caminho: "$.dados.pico" },
  ],
};

describe("montarChamadaDoConector (SPEC-105 fatia B — a metade pura)", () => {
  it("monta corpo só com o que o conector declarou, e leva os cabeçalhos", () => {
    const chamada = montarChamadaDoConector(CONECTOR, {
      projetoId: "loja",
      janela: "7d",
      intruso: "não viaja",
    });
    expect(chamada.endpoint).toBe("https://gateway.exemplo/volumetria");
    expect(chamada.metodo).toBe("POST");
    expect(chamada.cabecalhos).toEqual({ "Content-Type": "application/json", Authorization: "Bearer segredo" });
    expect(JSON.parse(chamada.corpo)).toEqual({ projetoId: "loja", janela: "7d" });
  });

  it("§9.3 — obrigatório ausente PARA a chamada, com o nome do que faltou", () => {
    expect(() => montarChamadaDoConector(CONECTOR, { janela: "7d" })).toThrow(EntradaDoConectorInvalida);
    expect(() => montarChamadaDoConector(CONECTOR, { janela: "7d" })).toThrow(/"projetoId"/);
    // `null` é ausência, não valor: mandar `projetoId: null` seria o default
    // disfarçado que a regra existe para impedir.
    expect(() => montarChamadaDoConector(CONECTOR, { projetoId: null })).toThrow(EntradaDoConectorInvalida);
  });

  it("envelope embrulha; vazio vai na raiz", () => {
    const embrulhado = montarChamadaDoConector({ ...CONECTOR, envelope: "data" }, { projetoId: "loja" });
    expect(JSON.parse(embrulhado.corpo)).toEqual({ data: { projetoId: "loja" } });
  });

  it("opcional ausente simplesmente não viaja — não vira chave com undefined", () => {
    const chamada = montarChamadaDoConector(CONECTOR, { projetoId: "loja" });
    expect(JSON.parse(chamada.corpo)).toEqual({ projetoId: "loja" });
  });
});

describe("mapearSaidaDoConector", () => {
  it("lê cada campo pelo caminho; sem caminho, usa $.{chave}", () => {
    const semCaminho: Conector = {
      ...CONECTOR,
      saida: [{ chave: "conteudo", rotulo: "Conteúdo", tipo: "texto", obrigatorio: true }],
    };
    expect(mapearSaidaDoConector(semCaminho, { conteudo: "olá" })).toEqual({
      saida: { conteudo: "olá" },
      ausentes: [],
    });
  });

  it("obrigatório que não veio fica em `ausentes` — visível, nunca inventado", () => {
    const resultado = mapearSaidaDoConector(CONECTOR, { dados: { pico: 340 } });
    expect(resultado.saida).toEqual({ pico: 340 });
    expect(resultado.ausentes).toEqual(["rps"]);
  });

  it("resposta que não é objeto não derruba — tudo obrigatório vira ausente", () => {
    expect(mapearSaidaDoConector(CONECTOR, "um texto")).toEqual({ saida: {}, ausentes: ["rps"] });
  });
});

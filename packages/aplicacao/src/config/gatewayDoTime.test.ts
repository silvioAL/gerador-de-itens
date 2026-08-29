import { describe, expect, it } from "vitest";
import { destinosDaOperacao, normalizarExportador, OPERACOES_DO_GATEWAY } from "./normalizacao.js";

/**
 * SPEC-81 fatia A — **os destinos do time.**
 *
 * A correção que reescreveu a SPEC: o produto não implementa MCP. Ele fala REST
 * com endereços configuráveis, e quem fala MCP com as ferramentas da casa é o
 * gateway — a mesma disciplina que a SPEC-49 já tinha escrito no adaptador de
 * exportação, e que o gateway de IA já usa.
 *
 * E são VÁRIOS endereços, não um: um gateway na frente do MCP do Jira, outro na
 * frente do Confluence, outro para os agentes da casa. Rotas diferentes,
 * payloads diferentes, autenticações possivelmente diferentes.
 */
describe("os destinos do gateway (SPEC-81 fatia A)", () => {
  it("quem já configurou exportação não reconfigura NADA", () => {
    // A garantia mais importante da fatia. Um documento salvo antes desta SPEC
    // atravessa igual, e o `endpoint` de topo continua sendo o dos itens.
    const antes = { endpoint: "https://agente.casa/itens", rotulo: "Jira", cabecalhos: { Authorization: "Bearer x" } };

    expect(normalizarExportador(antes)).toEqual(antes);
  });

  it("o endpoint de topo continua servindo como destino de ITENS", () => {
    const config = normalizarExportador({
      endpoint: "https://agente.casa/itens",
      rotulo: "Jira",
      cabecalhos: { Authorization: "Bearer x" },
    });

    expect(destinosDaOperacao(config, "itens")).toEqual([
      {
        id: "exportador",
        operacao: "itens",
        endpoint: "https://agente.casa/itens",
        rotulo: "Jira",
        cabecalhos: { Authorization: "Bearer x" },
      },
    ]);
  });

  it("três MCPs diferentes, três endereços — é o caso que a SPEC descreve", () => {
    const config = normalizarExportador({
      endpoint: "https://gw.casa/jira",
      rotulo: "Jira",
      cabecalhos: { Authorization: "Bearer compartilhado" },
      destinos: [
        { id: "confluence", operacao: "documento", endpoint: "https://gw.casa/confluence", rotulo: "Confluence" },
        { id: "adr-repo", operacao: "adr", endpoint: "https://gw.casa/adr", rotulo: "ADRs de Engenharia" },
      ],
    });

    expect(destinosDaOperacao(config, "documento")[0].endpoint).toBe("https://gw.casa/confluence");
    expect(destinosDaOperacao(config, "adr")[0].endpoint).toBe("https://gw.casa/adr");
    expect(destinosDaOperacao(config, "itens")[0].endpoint).toBe("https://gw.casa/jira");
    // Operação sem destino configurado devolve lista vazia — e é assim que a
    // tela sabe não oferecer o botão, em vez de oferecer um que falharia.
    expect(destinosDaOperacao(config, "arquiteturaDeNegocio")).toEqual([]);
  });

  it("cabeçalhos ausentes no destino HERDAM os compartilhados", () => {
    const config = normalizarExportador({
      endpoint: "https://gw.casa/jira",
      cabecalhos: { Authorization: "Bearer compartilhado" },
      destinos: [{ id: "c", operacao: "documento", endpoint: "https://gw.casa/confluence", rotulo: "Confluence" }],
    });

    expect(destinosDaOperacao(config, "documento")[0].cabecalhos).toEqual({ Authorization: "Bearer compartilhado" });
  });

  it("e declarados no destino VENCEM os herdados (§306)", () => {
    // É o que permite apontar para três MCPs com autenticações distintas.
    const config = normalizarExportador({
      endpoint: "https://gw.casa/jira",
      cabecalhos: { Authorization: "Bearer compartilhado" },
      destinos: [
        { id: "adr", operacao: "adr", endpoint: "https://adr.casa", rotulo: "ADR", cabecalhos: { "X-Token": "proprio" } },
      ],
    });

    expect(destinosDaOperacao(config, "adr")[0].cabecalhos).toEqual({ "X-Token": "proprio" });
  });

  it("MAIS DE UM destino para a mesma operação é legítimo, e os dois voltam", () => {
    /**
     * Dois trackers numa migração, dois espaços de documentação por unidade de
     * negócio. É por isso que a forma é lista e não `Record<operacao, destino>`:
     * o mapa caberia em um só, e trocar depois exigiria migração.
     *
     * E é por isso que a função devolve os DOIS em vez de escolher: escolher
     * por quem usa publicaria no lugar errado em silêncio.
     */
    const config = normalizarExportador({
      endpoint: "",
      destinos: [
        { id: "conf-eng", operacao: "documento", endpoint: "https://gw/eng", rotulo: "Confluence Engenharia" },
        { id: "conf-prod", operacao: "documento", endpoint: "https://gw/prod", rotulo: "Confluence Produto" },
      ],
    });

    expect(destinosDaOperacao(config, "documento").map((d) => d.id)).toEqual(["conf-eng", "conf-prod"]);
  });

  it("descarta o que não dá para chamar: sem endereço, sem id, id repetido, operação desconhecida", () => {
    const config = normalizarExportador({
      endpoint: "",
      destinos: [
        { id: "ok", operacao: "documento", endpoint: "https://gw/ok", rotulo: "bom" },
        { id: "sem-endereco", operacao: "documento", endpoint: "   ", rotulo: "x" },
        { id: "", operacao: "documento", endpoint: "https://gw/x", rotulo: "x" },
        { id: "ok", operacao: "adr", endpoint: "https://gw/dup", rotulo: "id repetido" },
        { id: "inventada", operacao: "telepatia", endpoint: "https://gw/y", rotulo: "x" },
      ],
    });

    expect(config.destinos?.map((d) => d.id)).toEqual(["ok"]);
  });

  it("lixo no lugar da lista não derruba a normalização", () => {
    // O documento é `jsonb` opaco e nada impede alguém de gravar qualquer coisa
    // por API. Recusar o documento inteiro tiraria a exportação do ar por causa
    // de um campo novo.
    const config = normalizarExportador({ endpoint: "https://gw/jira", destinos: "não é lista" });

    expect(config.destinos).toBeUndefined();
    expect(config.endpoint).toBe("https://gw/jira");
  });

  it("as quatro operações são o conjunto fechado", () => {
    // Fechado pela mesma razão das variáveis de template: endereço com propósito
    // que o produto não conhece é endereço que ninguém consegue chamar.
    expect([...OPERACOES_DO_GATEWAY]).toEqual(["itens", "documento", "adr", "arquiteturaDeNegocio"]);
  });
});

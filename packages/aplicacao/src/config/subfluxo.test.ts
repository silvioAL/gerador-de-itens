import { describe, expect, it } from "vitest";
import {
  ID_DO_FLUXO_DA_ESTEIRA,
  ID_DO_FLUXO_DA_EXPORTACAO,
  ID_DO_FLUXO_DA_JORNADA,
  ID_DO_FLUXO_DA_PUBLICACAO,
  ID_DO_FLUXO_DO_ENSAIO,
  ID_DO_FLUXO_DO_PDCA,
  camposExternosDoFluxo,
  cicloEntreFluxos,
  contratoDoSubfluxo,
  fluxoDaJornada,
  validarEscritaFluxos,
  type Fluxo,
  type FluxoEmVigor,
} from "./fluxos.js";
import { funcaoDoSistema } from "./funcoes.js";
import { telaDoSistema } from "./telas.js";
import { dadoDoSistema } from "./projeto.js";

/**
 * SPEC-110 fatia J (D16) — **um fluxo inteiro como um nó.**
 *
 * *"quais fluxos estão relacionados ao quê? … faria mais sentido ter um fluxo
 * maior com pools ou algo assim"*. A relação entre fluxos era conhecimento de
 * quem os desenhou; aqui ela vira desenho.
 */

/** O contrato de um nó, pelas mesmas fontes que a tela usa. */
const contratoDoNo = (no: { tipo: string; refId: string }) => {
  if (no.tipo === "funcao") return funcaoDoSistema(no.refId) ?? null;
  if (no.tipo === "tela") return telaDoSistema(no.refId) ?? null;
  if (no.tipo === "projeto") return dadoDoSistema(no.refId) ?? null;
  return null;
};

const fluxo = (id: string, nos: Fluxo["nos"], arestas: Fluxo["arestas"] = []): Fluxo => ({ id, nome: id, nos, arestas });
const no = (id: string, tipo: string, refId: string): Fluxo["nos"][number] =>
  ({ id, tipo, refId, posicao: { x: 0, y: 0 }, parametros: {} }) as Fluxo["nos"][number];

describe("o contrato de um fluxo visto de fora", () => {
  it("a ENTRADA é por CAMPO, não por nó — a aresta do gatilho carrega ordem, não dado", () => {
    /**
     * A régua que eu tinha escrito primeiro era "nó sem aresta chegando", e ela
     * dava contrato VAZIO para todas as derivadas: a fatia A pôs um gatilho
     * ligado ao primeiro nó de cada uma, e essa aresta existe para dizer QUANDO,
     * não para trazer dado. Com aquela régua, um subfluxo da esteira nunca
     * receberia `demandaId` — a jornada inteira rodaria sobre a demanda errada,
     * em silêncio. Esta prova é a régua honesta: o campo é externo quando
     * nenhuma aresta chegando o mapeia.
     */
    const f = fluxo("so-ensaio", [no("gatilho", "gatilho", "manual"), no("ensaio", "funcao", "ensaio")], [
      { de: "gatilho", para: "ensaio", mapeamento: [] },
    ]);
    expect(contratoDoSubfluxo(f, contratoDoNo).entrada.map((c) => c.chave)).toContain("desenho");

    // Sem produtor nenhum, idem: é o que o pai tem de alimentar.
    const solto = fluxo("solto", [no("ensaio", "funcao", "ensaio")]);
    expect(contratoDoSubfluxo(solto, contratoDoNo).entrada.map((c) => c.chave)).toContain("desenho");
  });

  it("o campo que uma aresta MAPEIA sai da entrada — o fluxo já o preenche sozinho", () => {
    const f = fluxo(
      "le-e-ensaia",
      [no("demanda", "projeto", "demanda-ler"), no("ensaio", "funcao", "ensaio")],
      [{ de: "demanda", para: "ensaio", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }]
    );
    const chaves = contratoDoSubfluxo(f, contratoDoNo).entrada.map((c) => c.chave);
    expect(chaves).not.toContain("desenho");
    // Mas `demandaId`, que ninguém alimenta, continua sendo o que o pai passa —
    // é ele que faz a jornada inteira falar da MESMA demanda.
    expect(chaves).toContain("demandaId");
  });

  it("o parâmetro FIXADO no nó não se pergunta de novo lá fora", () => {
    // Duas fontes para o mesmo campo é a pessoa adivinhando qual vale. Quem
    // fixou um valor dentro do subfluxo o fixou de propósito.
    const comChave = fluxo("le-config", [
      { ...no("config", "funcao", "config-ler"), parametros: { chave: "regras" } } as Fluxo["nos"][number],
    ]);
    expect(contratoDoSubfluxo(comChave, contratoDoNo).entrada.map((c) => c.chave)).not.toContain("chave");

    const semChave = fluxo("le-config-vazia", [no("config", "funcao", "config-ler")]);
    expect(contratoDoSubfluxo(semChave, contratoDoNo).entrada.map((c) => c.chave)).toContain("chave");
  });

  it("`camposExternosDoFluxo` diz QUAL nó pede cada campo — é como o executor entrega", () => {
    // Espalhar tudo por todos os nós seria mais curto e estaria errado: um
    // `demandaId` nos parâmetros de um nó de agente vira ruído no prompt dele.
    const f = fluxo(
      "le-e-ensaia",
      [no("demanda", "projeto", "demanda-ler"), no("ensaio", "funcao", "ensaio")],
      [{ de: "demanda", para: "ensaio", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }]
    );
    const externos = camposExternosDoFluxo(f, contratoDoNo);
    expect(externos.find((e) => e.campo.chave === "demandaId")?.noId).toBe("demanda");
    expect(externos.some((e) => e.noId === "ensaio" && e.campo.chave === "desenho")).toBe(false);
  });

  it("a SAÍDA é a do último nó da ordem — o que o fluxo entrega ao terminar", () => {
    const f = fluxo(
      "deriva",
      [no("demanda", "projeto", "demanda-ler"), no("gera", "funcao", "derivacao")],
      [{ de: "demanda", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }]
    );
    const contrato = contratoDoSubfluxo(f, contratoDoNo);
    expect(contrato.saida.map((c) => c.chave)).toEqual(["itens", "avisos", "conformidade"]);
  });

  it("fluxo com CICLO não tem contrato — um subfluxo sobre ele nunca rodaria", () => {
    const f = fluxo(
      "circular",
      [no("a", "funcao", "derivacao"), no("b", "funcao", "ensaio")],
      [
        { de: "a", para: "b", mapeamento: [] },
        { de: "b", para: "a", mapeamento: [] },
      ]
    );
    expect(contratoDoSubfluxo(f, contratoDoNo)).toEqual({ entrada: [], saida: [] });
  });

  it("a mesma chave pedida por dois nós entra UMA vez", () => {
    // Senão o painel do subfluxo ofereceria "desenho" duas vezes, e a pessoa
    // teria de adivinhar qual dos dois alimenta qual nó.
    const f = fluxo("dois-pedem", [no("um", "funcao", "derivacao"), no("dois", "funcao", "ensaio")]);
    const chaves = contratoDoSubfluxo(f, contratoDoNo).entrada.map((c) => c.chave);
    expect(chaves.filter((c) => c === "desenho")).toHaveLength(1);
  });
});

describe("o ciclo entre FLUXOS", () => {
  it("A → B → A é recusado, com a MESMA frase do ciclo entre nós", () => {
    const documento = {
      fluxos: [
        fluxo("a", [no("chama-b", "subfluxo", "b")]),
        fluxo("b", [no("chama-a", "subfluxo", "a")]),
      ],
    };
    expect(cicloEntreFluxos(documento.fluxos)).not.toBeNull();
    expect(() => validarEscritaFluxos(documento)).toThrow(/^Ciclo: /);
    expect(() => validarEscritaFluxos(documento)).toThrow(/não pode voltar a quem o chamou/);
  });

  it("um subfluxo que aponta para o PRÓPRIO fluxo é recusado nomeando", () => {
    const documento = { fluxos: [fluxo("eu", [no("eu-mesmo", "subfluxo", "eu")])] };
    expect(() => validarEscritaFluxos(documento)).toThrow(/referencia o PRÓPRIO fluxo/);
  });

  it("cadeia sem volta passa — A → B → C não é ciclo", () => {
    const documento = {
      fluxos: [
        fluxo("a", [no("vai", "subfluxo", "b")]),
        fluxo("b", [no("vai", "subfluxo", "c")]),
        fluxo("c", [no("fim", "funcao", "derivacao")]),
      ],
    };
    expect(cicloEntreFluxos(documento.fluxos)).toBeNull();
    expect(() => validarEscritaFluxos(documento)).not.toThrow();
  });

  it("subfluxo para um fluxo que não existe é recusado — nem declarado, nem de fábrica", () => {
    const documento = { fluxos: [fluxo("meu", [no("chama", "subfluxo", "fantasma")])] };
    expect(() => validarEscritaFluxos(documento)).toThrow(/aponta para "fantasma", que não existe/);
  });

  it("subfluxo para uma FÁBRICA passa — ela existe sem estar declarada", () => {
    // A esteira e o ensaio existem no catálogo em vigor sem linha no
    // documento; recusá-los faria o fluxo-mestre ser insalvável.
    const documento = { fluxos: [fluxo("mestre", [no("etapa", "subfluxo", "ensaio-de-cenarios")])] };
    expect(() => validarEscritaFluxos(documento)).not.toThrow();
  });
});

/**
 * SPEC-110 fatia J (D16) — **o fluxo-mestre "Jornada da demanda".**
 *
 * *"quais fluxos estão relacionados ao quê? … faria mais sentido ter um fluxo
 * maior"*. Estas provas cobram que a relação seja DESENHO derivado do que
 * existe, e não uma lista fixa que mente quando o time não configurou tudo.
 *
 * SPEC-112 fatia C (R3) — **relidas, não só re-executadas.** A cadeia ganhou
 * as TELAS de trabalho (`mesa` antes da sequência, `documento` antes das
 * saídas) e o ensaio virou OPCIONAL (fatia A): os índices de nó e aresta que
 * as provas de fábrica assumiam mudaram de posição.
 */
describe("a jornada da demanda", () => {
  const etapa = (id: string): FluxoEmVigor => ({ id, nome: id, nos: [], arestas: [], origem: "fabrica" });
  const TODAS = [
    etapa(ID_DO_FLUXO_DO_ENSAIO),
    etapa(ID_DO_FLUXO_DA_ESTEIRA),
    etapa(ID_DO_FLUXO_DA_EXPORTACAO),
    etapa(ID_DO_FLUXO_DA_PUBLICACAO),
    etapa(ID_DO_FLUXO_DO_PDCA),
  ];

  it("liga as etapas na ORDEM da jornada, com as telas de trabalho e exportar/publicar em paralelo no fim", () => {
    const jornada = fluxoDaJornada(TODAS)!;
    expect(jornada.id).toBe(ID_DO_FLUXO_DA_JORNADA);
    expect(jornada.origem).toBe("fabrica");
    // Ensaiar antes de derivar, sempre — a ordem é a da jornada, não a do
    // array — e as duas telas de trabalho (M6/D4) entram nos pontos certos:
    // a mesa ANTES do ensaio, o documento DEPOIS da esteira.
    expect(jornada.nos.map((n) => n.id)).toEqual([
      "gatilho",
      "mesa",
      ID_DO_FLUXO_DO_ENSAIO,
      ID_DO_FLUXO_DA_ESTEIRA,
      "documento",
      ID_DO_FLUXO_DA_EXPORTACAO,
      ID_DO_FLUXO_DA_PUBLICACAO,
    ]);
    // As duas saídas penduram na MESMA etapa (o documento revisado): são
    // artefatos distintos (D15), não um depois do outro.
    expect(jornada.arestas.filter((a) => a.de === "documento").map((a) => a.para)).toEqual([
      ID_DO_FLUXO_DA_EXPORTACAO,
      ID_DO_FLUXO_DA_PUBLICACAO,
    ]);
  });

  it("as duas telas são NÓS DO SISTEMA — sem editor, o refId já é o id delas", () => {
    const jornada = fluxoDaJornada(TODAS)!;
    const mesa = jornada.nos.find((n) => n.id === "mesa")!;
    const documento = jornada.nos.find((n) => n.id === "documento")!;
    expect(mesa.tipo).toBe("tela");
    expect(mesa.refId).toBe("mesa");
    expect(documento.tipo).toBe("tela");
    expect(documento.refId).toBe("documento");
  });

  it("SPEC-112 fatia A (D1) — o ensaio é OPCIONAL; a esteira, o gatilho e as telas não são", () => {
    const jornada = fluxoDaJornada(TODAS)!;
    const porId = Object.fromEntries(jornada.nos.map((n) => [n.id, n]));
    expect(porId[ID_DO_FLUXO_DO_ENSAIO]?.opcional).toBe(true);
    expect(porId[ID_DO_FLUXO_DA_ESTEIRA]?.opcional).toBeUndefined();
    expect(porId["mesa"]?.opcional).toBeUndefined();
    expect(porId["documento"]?.opcional).toBeUndefined();
  });

  it("o PDCA fica FORA — melhorar o processo é outro laço, não etapa da demanda (D13)", () => {
    expect(fluxoDaJornada(TODAS)!.nos.some((n) => n.refId === ID_DO_FLUXO_DO_PDCA)).toBe(false);
  });

  it("as arestas carregam ORDEM, não dado — cada etapa lê a demanda por si", () => {
    // Mapear a saída de uma etapa na entrada da outra seria mentira de
    // contrato: o que atravessa a jornada é a DEMANDA, pelo campo externo.
    expect(fluxoDaJornada(TODAS)!.arestas.every((a) => a.mapeamento.length === 0)).toBe(true);
  });

  it("é derivada do que EXISTE: sem destino de exportação, não há nó de exportar (mas as telas continuam)", () => {
    const semSaidas = [etapa(ID_DO_FLUXO_DO_ENSAIO), etapa(ID_DO_FLUXO_DA_ESTEIRA)];
    expect(fluxoDaJornada(semSaidas)!.nos.map((n) => n.id)).toEqual([
      "gatilho",
      "mesa",
      ID_DO_FLUXO_DO_ENSAIO,
      ID_DO_FLUXO_DA_ESTEIRA,
      "documento",
    ]);
  });

  it("com UMA etapa só não há jornada — seria uma moldura em volta de nada", () => {
    expect(fluxoDaJornada([etapa(ID_DO_FLUXO_DO_ENSAIO)])).toBeNull();
    expect(fluxoDaJornada([])).toBeNull();
  });

  it("o mestre é SALVÁVEL: a escrita aceita os subfluxos dele e as duas telas do sistema", () => {
    // A prova de que o desenho de fábrica passa pela mesma régua de quem
    // desenha à mão — uma fábrica que a escrita recusaria seria insalvável na
    // hora de "editar uma cópia".
    const jornada = fluxoDaJornada(TODAS)!;
    expect(() => validarEscritaFluxos({ fluxos: [jornada] })).not.toThrow();
  });
});

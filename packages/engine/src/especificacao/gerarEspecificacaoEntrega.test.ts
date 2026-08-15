import { describe, expect, it } from "vitest";
import type { Diagrama } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { derivar } from "../derive/derivar.js";
import {
  gerarEspecificacaoEntrega,
  extrairVariaveis,
  validarTemplate,
  TEMPLATE_ESPECIFICACAO_PADRAO,
  problemasDoTemplate,
  estruturarEspecificacaoNo,
  montarFichaItem,
  nosDeOrigem,
} from "./gerarEspecificacaoEntrega.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [
        { key: "nome", label: "Nome do serviço", type: "text", required: true },
        { key: "linguagem", label: "Linguagem", type: "text", required: false, permiteNA: true },
      ],
    },
    mongo: {
      label: "Coleção Mongo",
      derives: "datastore",
      techs: ["Backend"],
      contextos: ["Backend-dados"],
      spec: [
        { key: "collection", label: "Nome da coleção", type: "text", required: true },
        { key: "ttlDias", label: "TTL (dias)", type: "number", required: false, permiteNA: true },
      ],
      specResumo: ["collection"],
      cenarioGherkinPadrao: "```gherkin\nDado um documento válido\nQuando ele é gravado\nEntão pode ser lido de volta\n```",
      cenarioGherkinPorAresta: {
        writes: "```gherkin\nDado um documento válido pronto pra escrita\nQuando a operação de escrita ocorre\nEntão o documento é persistido corretamente\n```",
      },
    },
  },
  edgeTypes: {
    writes: { label: "escreve", verbo: "escreve em", tamanhoPadrao: "P" },
  },
  edgeRules: {
    mongo: { valid: ["writes"], default: "writes" },
  },
};

const regras: RegrasConfig = {
  porTech: {
    Backend: {
      checklistTecnico: [{ texto: "Logs relevantes emitidos", contextos: ["Backend-dados"] }],
      testes: [{ tipo: "Teste de migração", validacao: "roda limpo", dev: true, hlg: false, contextos: ["Backend-dados"] }],
      volumetria: { contextos: ["Backend-dados"] },
    },
  },
};

function diagramaBase(): Diagrama {
  return {
    nodes: [
      {
        id: "n1",
        type: "service",
        status: "novo",
        label: "srv-catalogo",
        x: 0,
        y: 0,
        spec: { nome: { valor: "srv-catalogo", origem: "manual" } },
        specNA: { linguagem: { motivo: "ainda não decidido" } },
      },
      {
        id: "n2",
        type: "mongo",
        status: "novo",
        label: "produtos",
        x: 0,
        y: 0,
        spec: { collection: { valor: "produtos", origem: "manual" } },
        specNA: { ttlDias: { motivo: "catálogo não expira" } },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2", type: "writes" }],
  };
}

describe("gerarEspecificacaoEntrega", () => {
  it("com o template padrão: um documento só, com todas as atividades como itens numerados", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config);

    // Contexto e Visão geral aparecem uma vez só, não por atividade.
    expect(doc.match(/## Contexto/g)).toHaveLength(1);
    expect(doc.match(/## Visão geral/g)).toHaveLength(1);
    expect(doc).toContain("# Especificação de solução");
    expect(doc).toContain("## Itens");
    expect(doc).toContain("### 1.");
    expect(doc).toContain("### 2.");
    expect(doc).toContain("produtos (Coleção Mongo, novo)");
    expect(doc).toContain("| Nome da coleção | produtos | manual |");
    expect(doc).toContain("| TTL (dias) | N/A — catálogo não expira | — |");
    expect(doc).toContain("## Definition of Ready");
    expect(doc).toContain("## Definition of Done");
    expect(doc).toContain("- [ ] Código revisado");
  });

  it("demandInfo e times envolvidos entram na seção de contexto, uma vez", () => {
    const diagrama = diagramaBase();
    diagrama.nodes[0].time = "time-catalogo";
    const atividades = derivar(diagrama, config, { time: "time-checkout" });

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      demandInfo: "Cliente pediu catálogo mais rápido.",
    });

    expect(doc.match(/Cliente pediu catálogo mais rápido\./g)).toHaveLength(1);
  });

  it("SPEC-53 — o contexto do PRODUTO abre a seção, antes do da demanda", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      contextoDoProduto: "## Produto: Catálogo\n\n### Glossário\n- **SKU**: unidade vendável",
      demandInfo: "Cliente pediu catálogo mais rápido.",
    });

    // Quem recebe o documento (outro time, um fornecedor, um agente) não tem o
    // contexto que quem escreveu tinha na cabeça — e precisa saber de que
    // negócio se trata ANTES de ler o que muda nesta entrega.
    expect(doc).toContain("**SKU**: unidade vendável");
    expect(doc.indexOf("Produto: Catálogo")).toBeLessThan(doc.indexOf("Cliente pediu catálogo mais rápido."));
  });

  it("SPEC-53 — sem produto, a seção de contexto fica exatamente como era", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { demandInfo: "só a demanda" });
    expect(doc).toContain("só a demanda");
    expect(doc).not.toContain("Produto:");
  });

  it("título customizado substitui o default", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { titulo: "Fluxo de aprovação de crédito" });
    expect(doc).toContain("# Fluxo de aprovação de crédito");
  });

  it("com regras: refinamento técnico de cada item inclui checklist/testes filtrados por techs+contextos", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { regras });

    expect(doc).toContain("Logs relevantes emitidos");
    expect(doc).toContain("Teste de migração");
  });

  it("respostasItens: resposta confirmada da atividade certa aparece interpolada, sem vazar pra outra atividade (Fase 1, SPEC-23)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      regras,
      respostasItens: {
        [chaveMongo]: {
          "Backend::Logs relevantes emitidos": { valor: "sim, via Winston + correlationId", origem: "manual" },
        },
      },
    });

    expect(doc).toContain("Logs relevantes emitidos: sim, via Winston + correlationId");
    expect(doc).not.toContain("correlationId <- ✍️ especificar");
  });

  it("história de usuário: marcador quando não respondida, texto confirmado quando presente (Fase 1d-ii, SPEC-23)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const semResposta = gerarEspecificacaoEntrega(atividades, diagrama, config, {});
    expect(semResposta).toContain("#### História de usuário");
    expect(semResposta).toContain("_(sem história definida)_ <- ✍️ especificar");

    const comResposta = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      respostasItens: {
        [chaveMongo]: {
          _historiaUsuario: { valor: "Como analista, quero ver o catálogo atualizado.", origem: "manual" },
        },
      },
    });
    expect(comResposta).toContain("Como analista, quero ver o catálogo atualizado.");
    // Não presente também é sempre gerado independente de `regras` (item sem regra nenhuma continua com o placeholder).
    expect(comResposta.match(/#### História de usuário/g)?.length).toBe(atividades.length);
  });

  it("critérios de aceite contextuais confirmados aparecem depois do scaffold Gherkin, sem substituí-lo", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      respostasItens: {
        [chaveMongo]: {
          _criteriosAceite: { valor: "Cenário: catálogo vazio não quebra a tela", origem: "manual" },
        },
      },
    });

    expect(doc).toContain("Dado um documento válido"); // scaffold determinístico continua presente
    expect(doc).toContain("_Cenários adicionais (contextuais):_");
    expect(doc).toContain("Cenário: catálogo vazio não quebra a tela");
  });

  it("contrato de arquitetura: sem resposta nenhuma, seção nem aparece; com pelo menos um campo confirmado, mostra só os preenchidos (SPEC-24)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const semResposta = gerarEspecificacaoEntrega(atividades, diagrama, config, {});
    expect(semResposta).not.toContain("Nó vinculado");

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      respostasItens: {
        [chaveMongo]: {
          _contratoRequest: { valor: "POST /v1/produtos {nome, preco}", origem: "manual" },
          _contratoResponse: { valor: "201 {id}", origem: "sugerido", confirmado: true },
        },
      },
    });
    expect(doc).toContain("**Request:** POST /v1/produtos {nome, preco}");
    expect(doc).toContain("**Response:** 201 {id}");
    // Só os campos confirmados aparecem — Erros/Dependências/Nó vinculado ficam de fora, não "(não preenchido)".
    expect(doc).not.toContain("**Erros:**");
  });

  it("regras de teste e cenário Gherkin (papel QA, SPEC-24) só aparecem quando confirmados", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      respostasItens: {
        [chaveMongo]: {
          _regrasTeste: { valor: "Teste de contrato valida schema do payload", origem: "manual" },
          _cenarioFeature: { valor: "Cenário: publicação com payload inválido rejeita a mensagem", origem: "manual" },
        },
      },
    });
    expect(doc).toContain("Teste de contrato valida schema do payload");
    expect(doc).toContain("Cenário: publicação com payload inválido rejeita a mensagem");
  });

  it("com regras que ativam volumetria: documento inclui a seção 'Requisitos de volumetria' com o formato fixo", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { regras });

    expect(doc).toContain("#### Requisitos de volumetria");
    expect(doc).toContain("- Response time: ___ <- ✍️ especificar");
    expect(doc).toContain("- RPS (Requisições por segundo): ___ <- ✍️ especificar");
  });

  it("sem regras que ativem volumetria pro contexto: seção nem aparece", () => {
    const diagramaSemContexto: Diagrama = {
      nodes: [
        {
          id: "n1",
          type: "service",
          status: "novo",
          label: "srv-x",
          x: 0,
          y: 0,
          spec: { nome: { valor: "srv-x", origem: "manual" } },
          specNA: { linguagem: { motivo: "não decidido" } },
        },
      ],
      edges: [],
    };
    const atividades = derivar(diagramaSemContexto, config, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagramaSemContexto, config, { regras });

    expect(doc).not.toContain("Requisitos de volumetria");
  });

  it("sem atividades: itens mostra mensagem clara, não quebra", () => {
    const diagrama: Diagrama = { nodes: [], edges: [] };
    const doc = gerarEspecificacaoEntrega([], diagrama, config);
    expect(doc).toContain("_Nenhum item nesta quebra._");
  });

  it("atividade de aresta: especificação do item mostra origem e destino, nessa ordem", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config);

    const idxOrigem = doc.indexOf("srv-catalogo (Serviço, novo)");
    const idxDestino = doc.indexOf("produtos (Coleção Mongo, novo)");
    expect(idxOrigem).toBeGreaterThan(-1);
    expect(idxDestino).toBeGreaterThan(idxOrigem);
  });

  it("critérios de aceite: usa cenarioGherkinPorAresta do nó alvo quando configurado pro tipo de aresta", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config);

    expect(doc).toContain("Dado um documento válido pronto pra escrita");
  });

  it("critérios de aceite: cai em cenarioGherkinPadrao do nó quando não há override pro tipo de aresta (atividade de criação, sem aresta)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const criacao = atividades.find((a) => a.chave === "n2::criacao")!;

    const doc = gerarEspecificacaoEntrega([criacao], diagrama, config);

    expect(doc).toContain("Dado um documento válido\nQuando ele é gravado");
  });

  it("critérios de aceite: cai no placeholder genérico quando o tipo de nó não tem cenário configurado", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const setup = atividades.find((a) => a.chave === "n1::setup")!; // service não tem cenarioGherkinPadrao configurado

    const doc = gerarEspecificacaoEntrega([setup], diagrama, config);

    expect(doc).toContain("Dado <contexto>");
  });

  it("template customizado: só usa as seções que o autor incluiu", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      template: "TÍTULO: {{titulo}}\nDOD: {{definitionOfDone}}",
    });

    expect(doc.startsWith("TÍTULO: Especificação de solução\nDOD: - [ ] Código revisado")).toBe(true);
    expect(doc).not.toContain("{{");
    expect(doc).not.toContain("## Itens");
  });
});

describe("campo tipo lista (ex.: Endpoints) na especificação técnica", () => {
  const configComLista: DiagramaConfig = {
    nodeTypes: {
      service: {
        label: "Serviço",
        derives: "service",
        techs: ["Backend"],
        contextos: [],
        spec: [
          { key: "nome", label: "Nome do serviço", type: "text", required: true },
          {
            key: "endpoints",
            label: "Endpoints",
            type: "lista",
            required: false,
            permiteNA: true,
            itemSpec: [
              { key: "method", label: "Method", type: "select", options: ["GET", "POST"] },
              { key: "path", label: "Path", type: "text" },
              { key: "request", label: "Contrato de request", type: "textarea" },
            ],
          },
        ],
      },
    },
    edgeTypes: {},
    edgeRules: {},
  };

  function diagramaComEndpoints(valorEndpoints: unknown, comNA = false): Diagrama {
    return {
      nodes: [
        {
          id: "n1",
          type: "service",
          status: "novo",
          label: "srv-checkout",
          x: 0,
          y: 0,
          spec: {
            nome: { valor: "srv-checkout", origem: "manual" },
            ...(comNA ? {} : { endpoints: { valor: valorEndpoints, origem: "manual" } }),
          },
          specNA: comNA ? { endpoints: { motivo: "ainda não expõe REST" } } : {},
        },
      ],
      edges: [],
    };
  }

  it("um item por linha numerada, campos curtos resumidos e textarea em linha própria", () => {
    const diagrama = diagramaComEndpoints([
      { method: "POST", path: "/v1/checkout/fechar", request: "{ pedidoId, itens[] }" },
    ]);
    const atividades = derivar(diagrama, configComLista, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, configComLista);

    expect(doc).toContain("**Endpoints:**");
    expect(doc).toContain("1. Method: POST · Path: /v1/checkout/fechar");
    expect(doc).toContain("   Contrato de request: { pedidoId, itens[] }");
  });

  it("múltiplos itens ficam numerados em sequência", () => {
    const diagrama = diagramaComEndpoints([
      { method: "GET", path: "/v1/a", request: "" },
      { method: "POST", path: "/v1/b", request: "" },
    ]);
    const atividades = derivar(diagrama, configComLista, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, configComLista);

    expect(doc).toContain("1. Method: GET · Path: /v1/a");
    expect(doc).toContain("2. Method: POST · Path: /v1/b");
  });

  it("lista vazia mostra '(nenhum item)', nunca quebra", () => {
    const diagrama = diagramaComEndpoints([]);
    const atividades = derivar(diagrama, configComLista, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, configComLista);

    expect(doc).toContain("**Endpoints:** (nenhum item)");
  });

  it("campo lista marcado N/A mostra o motivo, fora da tabela de campos escalares", () => {
    const diagrama = diagramaComEndpoints(undefined, true);
    const atividades = derivar(diagrama, configComLista, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, configComLista);

    expect(doc).toContain("**Endpoints:** N/A — ainda não expõe REST");
  });

  it("campo lista nunca aparece como linha da tabela de campos escalares", () => {
    const diagrama = diagramaComEndpoints([{ method: "GET", path: "/v1/a", request: "" }]);
    const atividades = derivar(diagrama, configComLista, {});
    const doc = gerarEspecificacaoEntrega(atividades, diagrama, configComLista);

    expect(doc).not.toMatch(/\| Endpoints \|/);
  });
});

describe("estruturarEspecificacaoNo / montarFichaItem (Fase 1a, SPEC-23 — dado estruturado por atividade)", () => {
  it("estruturarEspecificacaoNo: campo escalar preenchido e campo N/A, tipoConhecido true", () => {
    const diagrama = diagramaBase();
    const ficha = estruturarEspecificacaoNo(diagrama.nodes[0], config, diagrama.edges);

    expect(ficha.tipoConhecido).toBe(true);
    expect(ficha.label).toBe("srv-catalogo");
    expect(ficha.tipoLabel).toBe("Serviço");
    expect(ficha.status).toBe("novo");

    const nome = ficha.camposEscalares.find((c) => c.key === "nome")!;
    expect(nome).toEqual({ key: "nome", label: "Nome do serviço", valor: "srv-catalogo", origem: "manual", na: undefined });

    const linguagem = ficha.camposEscalares.find((c) => c.key === "linguagem")!;
    expect(linguagem.na).toBe("ainda não decidido");
  });

  it("estruturarEspecificacaoNo: tipo de nó desconhecido — tipoConhecido false, campos vazios (nunca lança)", () => {
    const no = { ...diagramaBase().nodes[0], type: "tipo-nao-existe" };
    const ficha = estruturarEspecificacaoNo(no, config, []);

    expect(ficha.tipoConhecido).toBe(false);
    expect(ficha.tipoLabel).toBe("tipo-nao-existe");
    expect(ficha.camposEscalares).toEqual([]);
    expect(ficha.camposLista).toEqual([]);
  });

  it("estruturarEspecificacaoNo: campo tipo lista guarda os itens brutos, não texto pré-formatado", () => {
    const configComLista: DiagramaConfig = {
      nodeTypes: {
        service: {
          label: "Serviço", derives: "service", techs: ["Backend"], contextos: [],
          spec: [{
            key: "endpoints", label: "Endpoints", type: "lista", required: false, permiteNA: true,
            itemSpec: [{ key: "method", label: "Method", type: "text" }],
          }],
        },
      },
      edgeTypes: {}, edgeRules: {},
    };
    const no = {
      id: "n1", type: "service", status: "novo" as const, label: "srv-x", x: 0, y: 0,
      spec: { endpoints: { valor: [{ method: "GET" }, { method: "POST" }], origem: "manual" as const } },
      specNA: {},
    };
    const ficha = estruturarEspecificacaoNo(no, configComLista, []);

    expect(ficha.camposLista).toHaveLength(1);
    expect(ficha.camposLista[0].itens).toEqual([{ method: "GET" }, { method: "POST" }]);
    expect(ficha.camposLista[0].itemSpec).toEqual([{ key: "method", label: "Method", type: "text" }]);
  });

  it("montarFichaItem: agrega os nós de origem estruturados + checklist técnico/volumetria via listarPlaceholders, sem resposta", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const criacaoMongo = atividades.find((a) => a.chave.startsWith("n2"))!;

    const ficha = montarFichaItem(1, criacaoMongo, diagrama, config, regras);

    expect(ficha.chave).toBe(criacaoMongo.chave);
    expect(ficha.especificacaoTecnica.map((n) => n.noId)).toEqual(
      nosDeOrigem(criacaoMongo, diagrama).map((n) => n.id)
    );
    expect(ficha.checklistTecnico).toEqual([
      { chave: "Backend::Logs relevantes emitidos", tech: "Backend", rotulo: "Logs relevantes emitidos", resposta: undefined },
    ]);
    expect(ficha.volumetria.map((v) => v.rotulo)).toEqual([
      "Response time", "Max error", "RPS (Requisições por segundo)", "Test duration",
    ]);
  });

  it("SPEC-41: história SUGERIDA pela esteira entra no documento com a marca — nunca mais '(sem história definida)' com conteúdo preenchido", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const chaveMongo = atividades.find((a) => a.chave.startsWith("n2"))!.chave;

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      regras,
      respostasItens: {
        [chaveMongo]: {
          _historiaUsuario: { valor: "Como analista, quero o catálogo atualizado.", origem: "sugerido", confirmado: false },
        },
      },
    });

    expect(doc).toContain("Como analista, quero o catálogo atualizado.");
    expect(doc).toContain("_(sugerido pela esteira — confirmar)_");
    // O item COM história não pode mais dizer que não tem.
    const secaoMongo = doc.split("###").find((s) => s.includes("Como analista"))!;
    expect(secaoMongo).not.toContain("(sem história definida)");
  });

  it("montarFichaItem: resposta confirmada aparece anexada ao placeholder certo", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const criacaoMongo = atividades.find((a) => a.chave.startsWith("n2"))!;
    const resposta = { valor: "sim, via Winston", origem: "manual" as const };

    const ficha = montarFichaItem(1, criacaoMongo, diagrama, config, regras, {
      "Backend::Logs relevantes emitidos": resposta,
    });

    expect(ficha.checklistTecnico[0].resposta).toEqual(resposta);
  });

  it("montarFichaItem: sem regras, checklist/volumetria ficam vazios e os campos markdown-only ficam vazios (nunca lança)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});
    const ficha = montarFichaItem(1, atividades[0], diagrama, config);

    expect(ficha.checklistTecnico).toEqual([]);
    expect(ficha.volumetria).toEqual([]);
    expect(ficha.checklistProcessoMarkdown).toBe("");
    expect(ficha.ciclosTesteMarkdown).toBe("");
    expect(ficha.criteriosAceiteMarkdown).not.toBe("");
  });

  it("montarFichaItem: historiaUsuario/criteriosAceiteContextual sempre presentes, mesmo sem regras (Fase 1d-ii, SPEC-23)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const semRegras = montarFichaItem(1, atividades[0], diagrama, config);
    expect(semRegras.historiaUsuario).toEqual({ chave: "_historiaUsuario", tech: "", rotulo: "História de usuário", resposta: undefined });
    expect(semRegras.criteriosAceiteContextual.chave).toBe("_criteriosAceite");

    const resposta = { valor: "Como PO, quero X.", origem: "manual" as const };
    const comRegras = montarFichaItem(1, atividades[0], diagrama, config, regras, { _historiaUsuario: resposta });
    expect(comRegras.historiaUsuario.resposta).toEqual(resposta);
  });

  it("montarFichaItem: contrato (5 campos)/regrasTeste/cenarioFeature sempre presentes, mesmo sem regras (SPEC-24)", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const semRegras = montarFichaItem(1, atividades[0], diagrama, config);
    expect(semRegras.contrato.noVinculado).toEqual({ chave: "_contratoNoVinculado", tech: "", rotulo: "Nó vinculado", resposta: undefined });
    expect(semRegras.contrato.request.chave).toBe("_contratoRequest");
    expect(semRegras.contrato.response.chave).toBe("_contratoResponse");
    expect(semRegras.contrato.erros.chave).toBe("_contratoErros");
    expect(semRegras.contrato.dependencias.chave).toBe("_contratoDependencias");
    expect(semRegras.regrasTeste.chave).toBe("_regrasTeste");
    expect(semRegras.cenarioFeature.chave).toBe("_cenarioFeature");

    const respostaRequest = { valor: "POST /v1/produtos", origem: "manual" as const };
    const comResposta = montarFichaItem(1, atividades[0], diagrama, config, regras, { _contratoRequest: respostaRequest });
    expect(comResposta.contrato.request.resposta).toEqual(respostaRequest);
    expect(comResposta.contrato.response.resposta).toBeUndefined();
  });
});

describe("extrairVariaveis / validarTemplate", () => {
  it("template padrão só usa variáveis válidas", () => {
    expect(validarTemplate(TEMPLATE_ESPECIFICACAO_PADRAO)).toEqual([]);
  });

  it("aceita as 6 variáveis conhecidas", () => {
    expect(
      validarTemplate("{{titulo}} {{contexto}} {{historiaPo}} {{itens}} {{definitionOfReady}} {{definitionOfDone}}")
    ).toEqual([]);
  });

  it("rejeita variável desconhecida (typo)", () => {
    expect(validarTemplate("{{titulo}} {{especificacaoTecnica}}")).toEqual(["especificacaoTecnica"]);
  });

  it("extrai nomes sem duplicatas", () => {
    expect(extrairVariaveis("{{titulo}} — {{titulo}} de novo — {{itens}}")).toEqual(["titulo", "itens"]);
  });
});

/**
 * SPEC-35 — o motivo que o usuário pediu para ver ("não deveria salvar e sim
 * alertar que é inválido e mostrar o motivo"). Borda e tela importam esta
 * função; se ela erra, os dois erram juntos — por isso os casos aqui são a
 * rede de verdade.
 */
describe("problemasDoTemplate (SPEC-35)", () => {
  it("o template padrão não tem erro nem aviso — o estado de fábrica é válido por construção", () => {
    expect(problemasDoTemplate(TEMPLATE_ESPECIFICACAO_PADRAO)).toEqual({ erros: [], avisos: [] });
  });

  it("apagar {{itens}} é ERRO, com a consequência escrita — o documento sairia sem o corpo", () => {
    const { erros } = problemasDoTemplate("# {{titulo}}\n{{contexto}}");
    expect(erros.some((e) => e.includes("{{itens}}") && e.includes("corpo do documento"))).toBe(true);
  });

  it("variável desconhecida é ERRO e diz quais são as válidas", () => {
    const { erros } = problemasDoTemplate("{{itens}} {{especificacaoTecnica}}");
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("{{especificacaoTecnica}}");
    expect(erros[0]).toContain("{{titulo}}");
  });

  it("template enxuto é escolha legítima: sem {{contexto}} é AVISO com a consequência, não erro", () => {
    const { erros, avisos } = problemasDoTemplate("{{itens}}");
    expect(erros).toEqual([]);
    expect(avisos.some((a) => a.includes("{{contexto}}") && a.includes("Contexto do épico"))).toBe(true);
    expect(avisos).toHaveLength(5);
  });
});

/**
 * SPEC-57 fatia A (M8) — "padrões consistentes que CHEGAM até os itens".
 * Enquanto a citação não estiver no documento, a cadeia
 * propósito → decisão → elemento → item → spec para no penúltimo elo.
 */
describe("necessidades citadas no item (SPEC-57 fatia A)", () => {
  const necessidades = [
    { id: "r1", texto: "o pedido não pode ser cobrado duas vezes", origem: "manual" as const, atendidaPor: ["n1"] },
    { id: "r2", texto: "o catálogo responde em 200ms", origem: "manual" as const, atendidaPor: ["n2"] },
  ];

  it("cada item cita só o propósito do SEU elemento de origem", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { necessidades });

    expect(doc).toContain("#### Necessidades atendidas");
    expect(doc).toContain("- o pedido não pode ser cobrado duas vezes");
    expect(doc).toContain("- o catálogo responde em 200ms");

    // E não cita o propósito do vizinho: o item do n1 não herda o do n2.
    const itemDoN1 = doc.split("---").find((bloco) => bloco.includes("n1::")) ?? doc;
    if (itemDoN1 !== doc) {
      expect(itemDoN1).not.toContain("o catálogo responde em 200ms");
    }
  });

  it("sem necessidade declarada, o documento é o de antes — a seção some inteira", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const semPropósito = gerarEspecificacaoEntrega(atividades, diagrama, config);
    const comListaVazia = gerarEspecificacaoEntrega(atividades, diagrama, config, { necessidades: [] });

    expect(semPropósito).not.toContain("Necessidades atendidas");
    expect(comListaVazia).toBe(semPropósito);
  });

  it("necessidade sugerida e não confirmada NÃO é citada", () => {
    // Regra 2: um item não pode alegar atender um propósito que ninguém
    // confirmou — seria o agente escrevendo propósito no documento final.
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      necessidades: [
        { id: "r1", texto: "propósito ainda não confirmado", origem: "sugerido", atendidaPor: ["n1"] },
      ],
    });

    expect(doc).not.toContain("propósito ainda não confirmado");
    expect(doc).not.toContain("Necessidades atendidas");
  });
});

/**
 * SPEC-57 fatia C (M5 caso 2) — o PORQUÊ chegando ao item.
 *
 * A fatia A levou o propósito ("para que serve"); esta leva a razão ("por que
 * é assim, e o que foi descartado"). Sem ela, quem implementa recebe uma
 * ordem: usa fila. Com ela, recebe um critério.
 */
describe("decisões citadas no item (SPEC-57 fatia C)", () => {
  const decisao = {
    id: "d1",
    noId: "n1",
    titulo: "Fila em vez de chamada síncrona",
    contexto: "O parceiro cai duas vezes por semana.",
    alternativas: [
      { titulo: "Fila com retry" },
      { titulo: "Chamada síncrona", consequencia: "a queda do parceiro derruba o checkout junto" },
    ],
    escolhida: "Fila com retry",
    porque: "Desacopla a disponibilidade do parceiro da nossa.",
    status: "aceita" as const,
    origem: "manual" as const,
    autor: "silvio@exemplo",
    em: "2026-08-15T10:00:00.000Z",
  };

  it("o item cita a escolha, o porquê E o que foi descartado com o custo", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { decisoes: [decisao] });

    expect(doc).toContain("#### Por que este desenho é assim");
    expect(doc).toContain("Desacopla a disponibilidade do parceiro");
    // O descartado é o que serve daqui a um ano — é o elo que um "campo de
    // observação" perderia.
    expect(doc).toContain("~~Chamada síncrona~~");
    expect(doc).toContain("derruba o checkout junto");
  });

  it("sem decisão registrada, o documento é o de antes — a seção some inteira", () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const semDecisao = gerarEspecificacaoEntrega(atividades, diagrama, config);
    const comListaVazia = gerarEspecificacaoEntrega(atividades, diagrama, config, { decisoes: [] });

    expect(semDecisao).not.toContain("Por que este desenho é assim");
    expect(comListaVazia).toBe(semDecisao);
  });

  it("decisão PROPOSTA pelo agente não chega à spec até alguém aceitar", () => {
    // Regra 2: um item não pode alegar seguir uma decisão que ninguém tomou.
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      decisoes: [{ ...decisao, status: "proposta", origem: "sugerido" }],
    });

    expect(doc).not.toContain("Por que este desenho é assim");
  });

  it("§242 — a exceção aceita entra na MESMA seção, sem virar cópia persistida", () => {
    // Contrariar o padrão de propósito é decisão. Quem lê a spec precisa dela
    // junto das outras, não numa seção à parte que ninguém associa.
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      excecoes: [
        { noId: "n1", campo: "timeoutMs", motivo: "O parceiro não suporta menos que 800ms.", autor: "ana", em: "2026-08-15T10:00:00.000Z" },
      ],
    });

    expect(doc).toContain("Por que este desenho é assim");
    expect(doc).toContain("O parceiro não suporta menos que 800ms.");
  });
});

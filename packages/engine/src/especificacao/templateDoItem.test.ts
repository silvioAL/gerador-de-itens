import { describe, expect, it } from "vitest";
import type { Diagrama, DiagramaConfig, RegrasConfig } from "../index.js";
import { derivar } from "../derive/derivar.js";
import {
  TEMPLATE_ITEM_PADRAO,
  aplicarTemplateDoItem,
  problemasDoTemplateItem,
  renderizarItemEspecificacao,
  validarTemplateItem,
} from "./gerarEspecificacaoEntrega.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "nome", label: "Nome", type: "text", required: true }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

const regras: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: { Backend: { checklistTecnico: [{ texto: "Logs emitidos", contextos: [] }], testes: [] } },
};

const diagrama: Diagrama = {
  nodes: [
    { id: "n1", type: "service", status: "novo", label: "srv", x: 0, y: 0, spec: { nome: { valor: "srv", origem: "manual" } }, specNA: {} },
  ],
  edges: [],
};

function itemRenderizado(template?: string, respostas?: Record<string, { valor: string; origem: "manual" | "sugerido"; confirmado?: boolean }>) {
  const atividade = derivar(diagrama, config, {})[0];
  return renderizarItemEspecificacao(1, atividade, diagrama, config, regras, respostas as never, template);
}

describe("template do ITEM (SPEC-47)", () => {
  it("o item sai do template padrão e TERMINA na entrega final — o que faltava", () => {
    const markdown = itemRenderizado();
    expect(markdown).toContain("#### Entrega final");
    expect(markdown).toContain("_(a definir: o que fica pronto quando este item termina)_");
    // A entrega final é a ÚLTIMA seção: é o fecho do item, não uma nota no meio.
    const secoes = markdown.split("\n").filter((l) => l.startsWith("#### "));
    expect(secoes.at(-1)).toBe("#### Entrega final");
  });

  it("a resposta da entrega final entra no lugar do marcador", () => {
    const markdown = itemRenderizado(undefined, {
      _entregaFinal: { valor: "Serviço publicando na fila, com painel mostrando o volume do dia.", origem: "manual" },
    });
    expect(markdown).toContain("Serviço publicando na fila, com painel mostrando o volume do dia.");
    expect(markdown).not.toContain("a definir: o que fica pronto");
  });

  it("template do time troca a ORDEM e os títulos — é o ponto de ser template", () => {
    const markdown = itemRenderizado(`## {{rotulo}}\n\n### O que entregamos\n\n{{entregaFinal}}\n\n### Como validamos\n\n{{criteriosAceite}}\n`);
    expect(markdown).toContain("### O que entregamos");
    expect(markdown).toContain("### Como validamos");
    // O que o template não pediu não aparece.
    expect(markdown).not.toContain("Especificação técnica");
  });

  it("seção sem conteúdo some inteira, título junto — nada de cabeçalho órfão", () => {
    const semNada = aplicarTemplateDoItem("#### A\n\n{{vazio}}\n\n#### B\n\ntem corpo\n", { vazio: "" });
    expect(semNada).not.toContain("#### A");
    expect(semNada).toContain("#### B");
    expect(semNada).toContain("tem corpo");
  });

  it("variável inventada é erro; template sem entrega final é AVISO (o pedido do §196)", () => {
    expect(validarTemplateItem("{{rotulo}} {{inventada}}")).toEqual(["inventada"]);

    const problemas = problemasDoTemplateItem("### {{rotulo}}\n\n{{historiaUsuario}}\n\n{{especificacaoTecnica}}");
    expect(problemas.erros).toHaveLength(0);
    expect(problemas.avisos.join(" ")).toContain("{{entregaFinal}}");

    const completo = problemasDoTemplateItem(TEMPLATE_ITEM_PADRAO);
    expect(completo.erros).toHaveLength(0);
    expect(completo.avisos).toHaveLength(0);
  });
});

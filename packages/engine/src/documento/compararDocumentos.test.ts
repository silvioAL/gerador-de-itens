import { describe, expect, it } from "vitest";
import { compararDocumentos } from "./compararDocumentos.js";

const APROVADO = `# Demanda X

Preâmbulo do template.

## Contexto

O que a demanda resolve.

## Itens

- Criar o serviço

## Riscos

Nenhum.
`;

describe("compararDocumentos — o que mudou desde a aprovação (§264)", () => {
  it("documento idêntico não produz mudança nenhuma", () => {
    expect(compararDocumentos(APROVADO, APROVADO)).toEqual([]);
  });

  it("seção com conteúdo diferente aparece como MUDOU, e só ela", () => {
    // O ponto da fatia: o aviso antigo dizia "algo mudou" sobre o documento
    // inteiro, e quem lia tinha que reler tudo para achar o quê.
    const atual = APROVADO.replace("- Criar o serviço", "- Criar o serviço\n- Criar a fila");

    expect(compararDocumentos(APROVADO, atual)).toEqual([{ titulo: "Itens", tipo: "mudou" }]);
  });

  it("seção nova é ENTROU e seção sumida é SAIU — são coisas diferentes", () => {
    const atual = APROVADO.replace("## Riscos\n\nNenhum.\n", "## Trade-offs\n\nFila em vez de síncrono.\n");

    expect(compararDocumentos(APROVADO, atual)).toEqual([
      { titulo: "Trade-offs", tipo: "entrou" },
      { titulo: "Riscos", tipo: "saiu" },
    ]);
  });

  it("mudança ANTES da primeira seção tem nome próprio", () => {
    // Mudar o título ou o preâmbulo do template é uma informação diferente de
    // "mudou uma seção", e some se a abertura não for tratada.
    const atual = APROVADO.replace("Preâmbulo do template.", "Preâmbulo reescrito.");

    expect(compararDocumentos(APROVADO, atual)).toEqual([{ titulo: "Abertura do documento", tipo: "mudou" }]);
  });

  it("só espaço em branco de diferença não é mudança", () => {
    // O booleano `desatualizado` acusa qualquer byte. Se a comparação repetisse
    // isso, a tela diria "mudou" e listaria nada — pior que o aviso de antes.
    const atual = `${APROVADO}\n\n`;

    expect(compararDocumentos(APROVADO, atual)).toEqual([]);
  });

  it("título repetido não é agrupado — duas seções são duas seções", () => {
    const antes = "## Itens\n\nA\n\n## Itens\n\nB\n";
    const depois = "## Itens\n\nA\n\n## Itens\n\nC\n";

    expect(compararDocumentos(antes, depois)).toEqual([{ titulo: "Itens", tipo: "mudou" }]);
  });

  it("a ordem é a do documento ATUAL, com o que saiu no fim", () => {
    // É o documento que a pessoa tem na frente; o que saiu não tem mais lugar
    // nessa ordem.
    const atual = `# Demanda X

Preâmbulo do template.

## Itens

- Outro item

## Novidade

Texto.
`;

    expect(compararDocumentos(APROVADO, atual)).toEqual([
      { titulo: "Itens", tipo: "mudou" },
      { titulo: "Novidade", tipo: "entrou" },
      { titulo: "Contexto", tipo: "saiu" },
      { titulo: "Riscos", tipo: "saiu" },
    ]);
  });
});

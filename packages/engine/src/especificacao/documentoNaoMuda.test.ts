import { describe, expect, it } from "vitest";
import type { Decisao, Diagrama, Necessidade } from "../model/types.js";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import { derivar } from "../derive/derivar.js";
import { gerarEspecificacaoEntrega } from "./gerarEspecificacaoEntrega.js";

/**
 * SPEC-80 fatia A — **a rede embaixo da mudança, montada antes da mudança.**
 *
 * ## O que esta suíte é, e o que ela não é
 *
 * Não é um teste de comportamento: é um **teste de caracterização**. Ele não
 * afirma que o documento está certo — afirma que ele está **do jeito que estava
 * hoje**, byte a byte. É a diferença entre "o documento tem uma seção Contexto"
 * (que dezenas de asserções já cobrem) e "o documento é exatamente este texto".
 *
 * ## Por que ela precisa existir antes da fatia A
 *
 * A fatia A mexe no que a quebra PRODUZ: `documentoEscrito` deixa de ser um e
 * passa a ser um por tipo de artefato. É a classe de mudança que quebra texto
 * sem quebrar asserção — um espaço a mais, uma seção que troca de ordem, uma
 * linha em branco que some. As asserções por trecho de
 * `gerarEspecificacaoEntrega.test.ts` continuariam verdes com o documento
 * estragado, porque `toContain("## Contexto")` não vê a vizinhança.
 *
 * A SPEC diz: *"nada de `toContain` por seção — comparação por trecho deixa
 * passar exatamente a mudança que esta fatia arrisca introduzir."*
 *
 * ## Por que snapshot em arquivo, e não inline
 *
 * O documento tem centenas de linhas. Inline, ele afogaria o teste e ninguém
 * leria o diff. Em arquivo, o snapshot é um `.md` de verdade: dá para ABRIR e
 * ler o documento que o produto gera, e o diff de um PR mostra exatamente que
 * caractere mudou.
 *
 * > **Como usar quando ficar vermelho:** olhe o diff. Se a mudança é
 * > intencional, atualize o snapshot **no mesmo commit que a causou**, e diga no
 * > commit por que o documento mudou. Se você não consegue explicar a diferença,
 * > ela é o defeito — não atualize.
 *
 * ## A fixture é rica de propósito
 *
 * Um caso mínimo caracterizaria pouco. Esta exercita contexto de produto,
 * contexto de demanda, times envolvidos, necessidades, decisões com
 * alternativas, as três seções escritas, checklist técnico, testes e
 * volumetria — porque cada uma delas é uma parte do documento que a fatia A
 * pode estragar sem que nenhuma outra asserção perceba.
 */

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
  tipos: [],
  tamanhos: [],
  porTech: {
    Backend: {
      checklistTecnico: [
        { texto: "Logs relevantes emitidos", contextos: ["Backend-dados"] },
        { texto: "Idempotência declarada", contextos: [], porque: "reprocessamento acontece" },
      ],
      checklistProcesso: [{ texto: "Plano de migração revisado com o time", contextos: ["Backend-dados"] }],
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

const necessidades: Necessidade[] = [
  {
    id: "nec1",
    texto: "O catálogo precisa responder busca por SKU em menos de meio segundo",
    prioridade: "alta",
    origem: "manual",
    confirmado: true,
    atendidaPor: ["n1"],
    limiteMs: 500,
  },
];

const decisoes: Decisao[] = [
  {
    id: "dec1",
    noId: "n2",
    titulo: "Mongo em vez de SQL para o catálogo",
    contexto: "O catálogo tem forma variável por categoria e é lido muito mais do que escrito.",
    alternativas: [
      { titulo: "Postgres com jsonb", consequencia: "migração de esquema a cada categoria nova" },
      { titulo: "Mongo", consequencia: "sem junção forte entre categorias" },
    ],
    escolhida: "Mongo",
    porque: "A forma varia por categoria, e a leitura domina — a junção que se perde não é usada aqui.",
    status: "aceita",
    origem: "manual",
    autor: "silvio",
    em: "2026-01-15T10:00:00.000Z",
  },
];

describe("o documento de hoje não pode mudar sem alguém dizer por quê (SPEC-80 fatia A)", () => {
  it("o documento inteiro sai caractere a caractere igual", async () => {
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, {
      regras,
      titulo: "Especificação de solução",
      time: "catalogo",
      contextoDoProduto: "Loja online de médio porte. Quem usa: o time de operações do catálogo.",
      demandInfo: "Substituir a busca por SKU, hoje em planilha.",
      necessidades,
      decisoes,
      visaoGeral: "Como operador do catálogo, quero buscar por SKU para não depender da planilha.",
      tradeOffs: "Ganhamos forma flexível por categoria; perdemos junção forte entre elas.",
      riscos: "Se o volume dobrar antes da indexação, a busca degrada.",
    });

    await expect(doc).toMatchFileSnapshot("./__snapshots__/documento-de-hoje.md");
  });

  it("e o documento SEM nenhuma seção escrita também — é o caso de quem acabou de derivar", async () => {
    /**
     * O primeiro caso cobre o documento cheio; este cobre o vazio, que é o que
     * a maioria das pessoas vê primeiro. São os dois extremos do mesmo texto, e
     * a fatia A pode estragar um sem tocar no outro — o caminho de "seção
     * escrita ausente" é justamente o que muda quando `documentoEscrito` deixa
     * de ser um objeto só.
     */
    const diagrama = diagramaBase();
    const atividades = derivar(diagrama, config, {});

    const doc = gerarEspecificacaoEntrega(atividades, diagrama, config, { regras });

    await expect(doc).toMatchFileSnapshot("./__snapshots__/documento-de-hoje-sem-secoes.md");
  });
});

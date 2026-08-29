import { describe, expect, it } from "vitest";
import { MARCADOR_ESPECIFICAR } from "../refinamento/gerarRefinamento.js";
import {
  coberturaDaSpec,
  gerarSpec,
  problemasDoTemplateSpec,
  SECOES_DE_JULGAMENTO,
  TEMPLATE_SPEC_PADRAO,
  VARIAVEIS_SPEC,
} from "./gerarSpec.js";

/**
 * SPEC-80 fatia B — a spec como artefato, com a régua da fatia D embutida.
 */
describe("o template da spec (SPEC-80 fatia B)", () => {
  it("o template padrão não tem erro nem aviso — ele usa todas as variáveis", () => {
    // Um padrão que já nasce com aviso ensina a ignorar aviso.
    expect(problemasDoTemplateSpec(TEMPLATE_SPEC_PADRAO)).toEqual({ erros: [], avisos: [] });
  });

  it("variável que o motor não sabe preencher é ERRO, e a frase lista as válidas", () => {
    const { erros } = problemasDoTemplateSpec("# {{titulo}}\n{{recusas}}\n{{fatias}}\n{{cronograma}}");

    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("{{cronograma}} não existe");
    expect(erros[0]).toContain("{{recusas}}");
  });

  it("sem {{fatias}} ou sem {{recusas}} é ERRO — as duas mudam o que a spec afirma", () => {
    /**
     * `fatias` é o corpo (o análogo de `{{itens}}` no documento). `recusas` é a
     * única cuja ausência muda a AFIRMAÇÃO: uma spec sem recusas se lê como
     * "tudo cabe", que é exatamente como uma spec vira lista de desejos.
     */
    const semFatias = problemasDoTemplateSpec("# {{titulo}}\n{{recusas}}");
    const semRecusas = problemasDoTemplateSpec("# {{titulo}}\n{{fatias}}");

    expect(semFatias.erros.some((e) => e.includes("{{fatias}}"))).toBe(true);
    expect(semRecusas.erros.some((e) => e.includes("{{recusas}}"))).toBe(true);
  });

  it("mas as demais ausências são AVISO — template enxuto é escolha, dita em voz alta", () => {
    const { erros, avisos } = problemasDoTemplateSpec("{{recusas}}\n{{fatias}}");

    expect(erros).toEqual([]);
    expect(avisos.some((a) => a.includes("{{origem}}"))).toBe(true);
    expect(avisos.some((a) => a.includes("{{medicao}}"))).toBe(true);
  });
});

describe("as seções de julgamento (SPEC-80 fatia D)", () => {
  it.each(SECOES_DE_JULGAMENTO)("%s vazia vira LACUNA CONTÁVEL, não texto inventado", (secao) => {
    /**
     * O §311 mediu o custo de fazer diferente: lacuna que o artefato entrega
     * sem marcador não entra em conta nenhuma, e alguém aprova um documento
     * incompleto sem nada acusar. Sumir seria pior que ficar vazio.
     */
    const spec = gerarSpec({ escrita: {} });

    expect(spec).toContain(MARCADOR_ESPECIFICAR);
    // E a lacuna é da SEÇÃO certa: o marcador aparece uma vez por seção não
    // escrita, e não uma vez no documento inteiro.
    const marcadores = spec.match(new RegExp(MARCADOR_ESPECIFICAR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
    expect(marcadores?.length).toBeGreaterThanOrEqual(SECOES_DE_JULGAMENTO.length);
    expect(secao).toBeTruthy();
  });

  it("o que a pessoa escreveu sai como ela escreveu, sem marcador", () => {
    // O `itens` vai preenchido de propósito: sem ele a spec é ÓRFÃ e leva
    // marcador por outro motivo, e o teste passaria a medir a coisa errada.
    // (Foi o que ele fez na primeira escrita, e a regra da órfã o pegou.)
    const spec = gerarSpec({
      // SPEC-80 fatia C — declarar `itensCobertos` passou a ser necessário: passar
      // item sem declarar cobertura deixa a spec ÓRFÃ, e ela leva marcador por
      // isso. A semântica mudou na fatia C, e o teste diz por quê.
      itens: [{ chave: "n1::ep0", rotulo: "01 — Setup" } as never],
      escrita: {
        itensCobertos: ["n1::ep0"],
        origem: "Pedido do time de operações na reunião de refinamento.",
        recusas: "Não entra cache distribuído: a medição não achou número que doesse.",
        fatias: "A: a borda recusa. B: a tela diz o número.",
      },
    });

    expect(spec).toContain("Pedido do time de operações na reunião de refinamento.");
    expect(spec).toContain("Não entra cache distribuído");
    expect(spec).not.toContain(MARCADOR_ESPECIFICAR);
  });

  it("`medicao` vazia NÃO leva marcador — 'o motor não apontou nada' é afirmação, não lacuna", () => {
    /**
     * A distinção que a fatia D existe para preservar: seção derivável vazia
     * é um FATO sobre o desenho; seção de julgamento vazia é trabalho que
     * ninguém fez. Tratar as duas igual encheria a conta de lacuna falsa e
     * ensinaria a ignorar o número — o defeito que o §311 consertou.
     */
    const spec = gerarSpec({
      medicao: [],
      escrita: { origem: "o", recusas: "r", fatias: "f", itensCobertos: ["n1::ep0"] },
      itens: [{ chave: "n1::ep0", rotulo: "01 — Setup" } as never],
    });

    expect(spec).toContain("O motor não apontou nada neste desenho.");
    expect(spec).not.toContain(MARCADOR_ESPECIFICAR);
  });

  it("spec sem item vinculado É lacuna — spec órfã não especifica nada", () => {
    // SPEC-80 §3: uma spec que não cobre nenhum item é órfã, e o produto sabe
    // dizer isso — do mesmo jeito que já diz "esta necessidade não tem
    // componente que responda por ela".
    const spec = gerarSpec({ escrita: { origem: "o", recusas: "r", fatias: "f" }, itens: [] });

    expect(spec).toContain(`_(nenhum item vinculado)_ ${MARCADOR_ESPECIFICAR}`);
  });
});

describe("a spec é determinística, como todo o resto do motor", () => {
  it("a mesma entrada produz o MESMO texto", () => {
    const opcoes = {
      titulo: "SPEC-99 — exemplo",
      contexto: "Loja online.",
      medicao: ["o caminho estoura a régua", "a política não tem porquê registrado"],
      escrita: { origem: "o usuário", recusas: "não entra X", fatias: "A: …" },
      itens: [{ rotulo: "01 — Setup" } as never, { rotulo: "02 — Fila" } as never],
    };

    expect(gerarSpec(opcoes)).toBe(gerarSpec(opcoes));
  });

  it("e toda variável do conjunto fechado é de fato substituída", () => {
    // O defeito que um conjunto fechado existe para impedir: variável válida
    // que o gerador esquece sai como `{{nome}}` literal no artefato publicado.
    const template = VARIAVEIS_SPEC.map((v) => `{{${v}}}`).join("\n");

    const spec = gerarSpec({ template, escrita: { origem: "o", recusas: "r", fatias: "f" } });

    expect(spec).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("o vínculo entre a spec e os itens (SPEC-80 fatia C)", () => {
  const atividades = [
    { chave: "n1::ep0", rotulo: "01 — Setup de srv-catalogo" },
    { chave: "n2::ep0", rotulo: "02 — Coleção produtos" },
    { chave: "e1::ep0", rotulo: "03 — srv-catalogo escreve em produtos" },
  ] as never[];

  it("cobre o que declarou, e diz o que ficou de fora", () => {
    const { cobertas, descobertas, orfas } = coberturaDaSpec(atividades, { itensCobertos: ["n1::ep0", "e1::ep0"] });

    expect(cobertas.map((a) => a.chave)).toEqual(["n1::ep0", "e1::ep0"]);
    expect(descobertas.map((a) => a.chave)).toEqual(["n2::ep0"]);
    expect(orfas).toEqual([]);
  });

  it("chave que não existe MAIS é órfã — e é a que ninguém pensa em olhar", () => {
    /**
     * O caso que envelhece pior: o item foi removido do desenho, e a spec
     * continua parecendo completa apontando para o vazio. É o mesmo defeito
     * que o §315 consertou no tour, aqui do lado do documento.
     */
    const { cobertas, orfas } = coberturaDaSpec(atividades, { itensCobertos: ["n1::ep0", "n9::ep0"] });

    expect(cobertas.map((a) => a.chave)).toEqual(["n1::ep0"]);
    expect(orfas).toEqual(["n9::ep0"]);
  });

  it("e a spec gerada MOSTRA a órfã marcada, em vez de escondê-la", () => {
    const spec = gerarSpec({
      itens: atividades,
      escrita: { origem: "o", recusas: "r", fatias: "f", itensCobertos: ["n1::ep0", "n9::ep0"] },
    });

    expect(spec).toContain("01 — Setup de srv-catalogo");
    expect(spec).toContain("~~n9::ep0~~");
    expect(spec).toContain(MARCADOR_ESPECIFICAR);
  });

  it("spec que não declara item nenhum é ÓRFÃ — não especifica nada", () => {
    const spec = gerarSpec({ itens: atividades, escrita: { origem: "o", recusas: "r", fatias: "f" } });

    expect(spec).toContain(`_(nenhum item vinculado)_ ${MARCADOR_ESPECIFICAR}`);
  });
});

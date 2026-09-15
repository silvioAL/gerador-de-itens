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
        decisoes: "Fila, porque desacopla o pico do parceiro.",
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
      escrita: { origem: "o", decisoes: "d", recusas: "r", fatias: "f", itensCobertos: ["n1::ep0"] },
      itens: [{ chave: "n1::ep0", rotulo: "01 — Setup" } as never],
    });

    expect(spec).toContain("O motor não apontou nada neste desenho.");
    expect(spec).not.toContain(MARCADOR_ESPECIFICAR);
  });

  it("spec sem item vinculado É lacuna — spec órfã não especifica nada", () => {
    // SPEC-80 §3: uma spec que não cobre nenhum item é órfã, e o produto sabe
    // dizer isso — do mesmo jeito que já diz "esta necessidade não tem
    // componente que responda por ela".
    const spec = gerarSpec({ escrita: { origem: "o", decisoes: "d", recusas: "r", fatias: "f" }, itens: [] });

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

    const spec = gerarSpec({ template, escrita: { origem: "o", decisoes: "d", recusas: "r", fatias: "f" } });

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
      escrita: { origem: "o", decisoes: "d", recusas: "r", fatias: "f", itensCobertos: ["n1::ep0", "n9::ep0"] },
    });

    expect(spec).toContain("01 — Setup de srv-catalogo");
    expect(spec).toContain("~~n9::ep0~~");
    expect(spec).toContain(MARCADOR_ESPECIFICAR);
  });

  it("spec que não declara item nenhum é ÓRFÃ — não especifica nada", () => {
    const spec = gerarSpec({ itens: atividades, escrita: { origem: "o", decisoes: "d", recusas: "r", fatias: "f" } });

    expect(spec).toContain(`_(nenhum item vinculado)_ ${MARCADOR_ESPECIFICAR}`);
  });
});

/**
 * SPEC-119 — **a spec como prompt: o leitor final é um agente de código.**
 *
 * O percurso completo, dito com todas as letras pela primeira vez no §6 da
 * SPEC-119: a spec sobe anexada ao issue, o dev pega o issue no Jira e entrega
 * o conteúdo a um agente de código. **O último leitor não é humano** — e o
 * artefato tinha sido desenhado para um consumidor só.
 */
describe("a spec como prompt (SPEC-119)", () => {
  const escrita = { origem: "o", decisoes: "d", recusas: "r", fatias: "f", itensCobertos: ["n1::ep0"] };
  // `dependencias` vai explícito: `derivarFatias` lê a lista, e um fixture sem
  // ela testaria um caminho que a derivação nunca vê.
  const itens = [{ chave: "n1::ep0", rotulo: "01 — Setup", tipo: "tecnico", tamanho: "P", dependencias: [] } as never];

  it("fatia C — as três linhas do contrato de leitura abrem o documento", () => {
    const spec = gerarSpec({ escrita, itens });

    expect(spec).toContain("**Como ler esta spec.**");
    // E ABRE mesmo: antes do título da primeira seção, que é onde o §3.1 diz
    // que instrução funciona. Aberto no meio, seria mais uma seção.
    expect(spec.indexOf("**Como ler esta spec.**")).toBeLessThan(spec.indexOf("## Decisões que restringem"));
  });

  it.each([
    ["decisoes", "## Decisões que restringem", "Restrição"],
    ["recusas", "## O que NÃO entra", "Restrição"],
    ["fatias", "## Fatias", "Escopo"],
    ["medicao", "## O que foi medido", "Diagnóstico"],
    ["origem", "## Origem", "Contexto"],
  ])("fatia B — a seção %s declara a força dela (%s → %s)", (_v, titulo, forca) => {
    /**
     * §3.7: nada na spec dizia que `recusas` é inegociável e `contexto` é pano
     * de fundo. Sem a força declarada, um modelo trata todas as seções igual —
     * e não tem como priorizar quando duas parecem se contradizer.
     */
    const spec = gerarSpec({ escrita, itens, medicao: ["a chamada estoura a régua"] });
    const depoisDoTitulo = spec.slice(spec.indexOf(titulo) + titulo.length);

    expect(depoisDoTitulo.trimStart().startsWith(`> **${forca}.**`)).toBe(true);
  });

  it("fatia D — a medição diz que é diagnóstico, e a origem diz que já foi traduzida", () => {
    /**
     * As duas seções que um agente confunde com tarefa (§3.2 e §3.3). Uma lista
     * de problemas é literalmente o que ele foi treinado para resolver; e
     * "o time pediu que respondesse em 2s" lê como pedido a implementar.
     */
    const spec = gerarSpec({ escrita, itens, medicao: ["a política não tem porquê registrado"] });

    expect(spec).toContain("Não é tarefa — a menos que apareça como item desta spec.");
    expect(spec).toContain("O pedido já foi traduzido nos itens desta spec — não o implemente outra vez.");
  });

  it("fatia E — o que obriga vem ANTES do que orienta, e volta no fim", () => {
    const spec = gerarSpec({ escrita, itens });

    // A ordem que o §3.1 cobra: restrição cedo, contexto depois.
    expect(spec.indexOf("## O que NÃO entra")).toBeLessThan(spec.indexOf("## Contexto"));
    expect(spec.indexOf("## Fatias")).toBeLessThan(spec.indexOf("## O que foi medido"));
    // E repetida no fim, que é a outra metade da mesma régua.
    expect(spec).toContain("**Antes de abrir o PR, releia as restrições.**");
    expect(spec.lastIndexOf("releia as restrições")).toBeGreaterThan(spec.indexOf("## O que foi medido"));
  });

  it("fatia E — o fechamento CITA as decisões, e não copia o texto delas", () => {
    /**
     * Condensar não é repetir: duas cópias do mesmo conteúdo divergem no
     * primeiro que alguém editar (§323), e a spec passaria a dizer duas coisas
     * sobre a mesma restrição.
     */
    const spec = gerarSpec({
      escrita: { ...escrita, decisoes: undefined },
      itens,
      julgamento: { decisoes: [decisaoAceita("Fila em vez de síncrono", "desacopla o pico do parceiro")] },
    });

    expect(spec).toContain("1 decisão restringe esta implementação (Fila em vez de síncrono)");
    // O porquê aparece UMA vez — na seção, não no fechamento.
    expect(spec.match(/desacopla o pico do parceiro/g)).toHaveLength(1);
  });

  it("fatia F — quando a spec viaja no issue do item, ela AFIRMA onde está o aceite", () => {
    /**
     * §3.4 — o ponteiro pendurado. "Na seção dele" pressupõe que o corpo do
     * item viaja junto: viaja no caminho da SPEC-114, não viaja no markdown
     * baixado, e a spec não dizia qual dos dois era.
     */
    const noIssue = gerarSpec({ escrita, itens, corpoDoItem: "mesmo-issue" });
    const avulsa = gerarSpec({ escrita, itens });

    expect(noIssue).toContain("no corpo do issue ao qual esta spec está anexada");
    expect(avulsa).toContain("que NÃO viaja neste arquivo");
  });
});

/**
 * SPEC-119 fatia A — **a seção `Decisões`, derivada pelo lado positivo.**
 *
 * O §410 fez as decisões alimentarem a spec só pelo lado negativo: a
 * alternativa descartada vira `recusas`. A escolhida, com o porquê, não ia a
 * lugar nenhum — e é exatamente a informação de que quem escreve código
 * precisa.
 */
describe("a seção Decisões (SPEC-119 fatia A)", () => {
  // `dependencias` vai explícito: `derivarFatias` lê a lista, e um fixture sem
  // ela testaria um caminho que a derivação nunca vê.
  const itens = [{ chave: "n1::ep0", rotulo: "01 — Setup", tipo: "tecnico", tamanho: "P", dependencias: [] } as never];
  const escrita = { origem: "o", recusas: "r", fatias: "f", itensCobertos: ["n1::ep0"] };

  it("a escolhida entra com o porquê, e o descartado continua só nas recusas", () => {
    const spec = gerarSpec({
      escrita: { ...escrita, recusas: undefined },
      itens,
      julgamento: {
        decisoes: [
          {
            ...decisaoAceita("Transporte do pico", "desacopla o pico do parceiro"),
            escolhida: "Fila",
            alternativas: [
              { titulo: "Fila" },
              { titulo: "Síncrono", consequencia: "acopla ao parceiro" },
            ] as never,
          },
        ],
      },
    });

    // O lado POSITIVO, que é o que faltava: qual padrão usar.
    expect(spec).toContain("use **Fila**");
    expect(spec).toContain("porque desacopla o pico do parceiro");
    // E o negativo continua onde já estava, sem repetição.
    expect(spec).toContain("**Síncrono** — fora porque escolhemos Fila");
  });

  it("a decisão diz ONDE vale, pelo rótulo do componente e não pelo id", () => {
    /**
     * §2.3 — `noId` é o que impede aplicar a restrição ao componente errado, e
     * `n3` não localiza nada para ninguém. Id sem rótulo conhecido volta cru:
     * pior que o nome, melhor que omitir onde a regra vale.
     */
    const comRotulo = gerarSpec({
      escrita,
      itens,
      julgamento: {
        decisoes: [{ ...decisaoAceita("Índice", "cardinalidade alta"), noId: "n3" }],
        rotulos: { n3: "srv-catalogo" },
      },
    });
    const semRotulo = gerarSpec({
      escrita,
      itens,
      julgamento: { decisoes: [{ ...decisaoAceita("Índice", "cardinalidade alta"), noId: "n3" }] },
    });

    expect(comRotulo).toContain("vale em **srv-catalogo**");
    expect(semRotulo).toContain("vale em **n3**");
  });

  it("decisão PROPOSTA não deriva restrição nenhuma — a trava vale para os dois lados", () => {
    /**
     * A régua da SPEC-80 fatia D, aplicada à seção nova. Uma proposta do agente
     * que virasse restrição seria o modelo mandando na implementação por um
     * caminho que ninguém aprovou — e com mais consequência que uma recusa
     * inventada, porque restrição obriga.
     */
    const spec = gerarSpec({
      escrita: { ...escrita, decisoes: undefined },
      itens,
      julgamento: { decisoes: [{ ...decisaoAceita("Fila", "desacopla"), status: "proposta" }] },
    });

    expect(spec).toContain(`_(o que já foi decidido, e por quê)_ ${MARCADOR_ESPECIFICAR}`);
    expect(spec).not.toContain("use **Fila**");
  });
});

function decisaoAceita(titulo: string, porque: string) {
  return {
    id: titulo,
    titulo,
    alternativas: [{ titulo }],
    escolhida: titulo,
    porque,
    status: "aceita",
    origem: "manual",
    autor: "alguém",
    em: "2026-01-01T00:00:00.000Z",
  } as never;
}

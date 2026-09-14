import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SECOES_DE_JULGAMENTO } from "./gerarSpec.js";

/**
 * SPEC-80 fatia D — **a trava que impede esta SPEC de virar o que ela recusa.**
 *
 * ## O que ela guarda
 *
 * A SPEC-75 §2.3, repetida na SPEC-80 §2:
 *
 * > *Uma spec gerada por modelo, com aparência de spec deste repositório, e
 * > conteúdo plausível-mas-vazio, é pior que nenhuma: ela custa a leitura de
 * > alguém e carrega autoridade que não merece.*
 *
 * A mitigação é estrutural — as seções de julgamento são de gente — e hoje ela
 * está garantida por **arquitetura, não por disciplina**: a esteira escreve em
 * `respostasItens[chave][campo]`, e as seções de julgamento moram em
 * `artefatosEscritos.spec`. São dois caminhos que não se tocam.
 *
 * **É exatamente esse não-se-tocar que envelhece calado.** Basta alguém achar
 * razoável pedir ao modelo um rascunho das recusas — e é razoável, à primeira
 * vista — para a garantia sumir sem nada acusar. Este arquivo é o que acusa.
 *
 * ## Por que varredura de fonte
 *
 * Um teste de comportamento provaria que o caminho de hoje não vaza. Não
 * provaria que **ninguém abriu um caminho novo**, que é o risco real. A mesma
 * técnica de `gateway.fronteira.test.ts` e de `useTour.envelhecimento.test.ts`:
 * ler arquivo, barato o bastante para rodar sempre.
 *
 * ## O que NÃO dá para varrer, e por que está dito
 *
 * `origem` é palavra sobrecarregada neste repositório — `ValorSpec.origem`,
 * `Decisao.origem`, `OrigemAtividade` — e varrer por ela produziria ruído em vez
 * de sinal. `recusas` e `fatias` são distintivas, e as duas bastam: quem for
 * pedir julgamento ao modelo vai pedir as três juntas, ou vai começar pelas que
 * parecem mais fáceis de gerar. Um teste que acusa duas das três já obriga a
 * conversa a acontecer.
 */

const RAIZ = resolve(import.meta.dirname, "../../../..");

/** Onde a IA é orquestrada — os arquivos que montam pedido e tratam resposta. */
const ARQUIVOS_DA_IA = [
  "packages/aplicacao/src/casos-de-uso/ia/pedidos.ts",
  "packages/server/src/routes/ia.ts",
  "packages/web/src/review/useEsteiraDeAgentes.ts",
];

/** As duas varríveis (ver o cabeçalho sobre `origem`). */
const DISTINTIVAS = SECOES_DE_JULGAMENTO.filter((s) => s !== "origem");

function ler(rel: string): string {
  return readFileSync(join(RAIZ, rel), "utf-8");
}

describe("nenhuma seção de julgamento pode ser preenchida por modelo (SPEC-80 fatia D)", () => {
  it("os arquivos que orquestram a IA existem — a varredura precisa varrer algo", () => {
    // Um caminho errado transformaria esta suíte inteira em teste sem dentes,
    // verde sobre arquivo nenhum. É o defeito do §292, e ele custa caro porque
    // o falso verde parece proteção.
    for (const rel of ARQUIVOS_DA_IA) {
      expect(() => statSync(join(RAIZ, rel)), `sumiu do lugar: ${rel}`).not.toThrow();
    }
  });

  it.each(ARQUIVOS_DA_IA)("%s não pede seção de julgamento ao modelo", (rel) => {
    const fonte = ler(rel);
    const citadas = DISTINTIVAS.filter((s) => new RegExp(`\\b${s}\\b`).test(fonte));

    expect(
      citadas,
      `este arquivo passou a citar seção de julgamento: ${citadas.join(", ")}.\n` +
        `Se a intenção é pedir um RASCUNHO ao modelo, ele não pode chegar como fato:\n` +
        `precisa entrar marcado, e a SPEC-80 §2 diz por quê.`
    ).toEqual([]);
  });

  it("e a esteira não alcança `artefatosEscritos` — os dois caminhos não se tocam", () => {
    /**
     * A garantia estrutural, afirmada em vez de presumida. A esteira escreve em
     * `respostasItens`; se um destes arquivos passar a mencionar
     * `artefatosEscritos`, alguém ligou os dois caminhos — e é a mudança que
     * faz a régua desta SPEC deixar de valer.
     */
    const alcancam = ARQUIVOS_DA_IA.filter((rel) => ler(rel).includes("artefatosEscritos"));

    expect(
      alcancam,
      `a orquestração da IA passou a alcançar as seções escritas: ${alcancam.join(", ")}`
    ).toEqual([]);
  });

  it("o único lugar que escreve seção de julgamento é a tela, e ela é de gente", () => {
    /**
     * O controle positivo. Os três acima são negativos — provam que a IA não
     * chega lá. Sem este, apagar a funcionalidade inteira deixaria os três
     * verdes, e um teste que passa depois de o recurso sumir não protege nada.
     */
    const escritores = varrer(join(RAIZ, "packages/web/src")).filter((f) =>
      readFileSync(f, "utf-8").includes("artefatosEscritos")
    );

    expect(escritores.length, "ninguém mais escreve seções por artefato — o recurso sumiu?").toBeGreaterThan(0);
  });
});

function varrer(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...varrer(caminho));
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

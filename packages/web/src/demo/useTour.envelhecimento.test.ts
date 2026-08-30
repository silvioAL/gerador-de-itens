import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { passosDeConfiguracao, passosDoProduto, type PassoTour, type UseTourOpts } from "./useTour";
import { AREAS_CONFIG_CONHECIDAS } from "../navegacao/rota";

/**
 * SPEC-78 fatia D — **a prova que impede esta SPEC de ser necessária de novo.**
 *
 * ## O que ela existe para pegar
 *
 * O tour envelhece calado. Três exemplos deste projeto, todos reais:
 *
 * - a SPEC-61 matou a tela `#/itens`, e um passo continuou apontando para ela;
 * - o §306 renomeou "Contexto do épico" para "Contexto da demanda", e o texto
 *   de tour ficou para trás;
 * - o §308 mostrou "⚙ Configura" cortado chegando ao usuário **sem nada
 *   acusar**.
 *
 * As outras três fatias consertam o tour de hoje. Esta conserta o processo que
 * o degradou — e é por isso que ela é a que importa.
 *
 * ## Por que varredura de FONTE, e não o app montado
 *
 * Montar o App inteiro para conferir 24 seletores custaria segundos por passo e
 * exigiria encenar a navegação de cada um (o passo do documento só existe
 * depois de derivar). O que se quer saber é mais simples: **este seletor existe
 * em algum lugar do produto?** Um `data-testid` que ninguém mais escreve é um
 * passo apontando para o vazio, e é exatamente assim que os três casos acima
 * aconteceram.
 *
 * É a mesma técnica de `gateway.fronteira.test.ts`, que caminha o grafo de
 * imports lendo arquivo: barata, e mede o que diz medir.
 */

const AQUI = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const RAIZ_DO_WEB = resolve(AQUI, "..");

function todoOFonte(): string {
  const partes: string[] = [];
  const andar = (pasta: string) => {
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) partes.push(readFileSync(caminho, "utf-8"));
    }
  };
  andar(RAIZ_DO_WEB);
  return partes.join("\n");
}

const FONTE = todoOFonte();

/** As opções são só ganchos de efeito — o que se inspeciona aqui é a LISTA. */
const OPCOES_MUDAS = new Proxy({} as UseTourOpts, {
  get: (_alvo, prop) => (prop === "cenarios" ? [] : () => undefined),
});

const TODOS: [string, PassoTour[]][] = [
  ["produto", passosDoProduto(OPCOES_MUDAS)],
  ["configuração", passosDeConfiguracao(OPCOES_MUDAS)],
];

/** `[data-testid=x]` / `[data-tour=x]` / `.classe` → o que procurar na fonte. */
function alvoProcuravel(selector: string): string {
  const m = /\[data-(testid|tour)=([^\]]+)\]/.exec(selector);
  if (m) return `data-${m[1]}="${m[2].replace(/^["']|["']$/g, "")}"`;
  return selector;
}

describe("o tour não pode apontar para o que não existe (SPEC-78 fatia D)", () => {
  it.each(TODOS)("todo seletor do tour de %s existe no produto", (_nome, passos) => {
    const orfaos = passos
      .filter((p) => p.selector && !p.selector.startsWith("."))
      .filter((p) => !FONTE.includes(alvoProcuravel(p.selector!)))
      .map((p) => `${p.titulo} → ${p.selector}`);

    expect(orfaos, `passos apontando para elemento que ninguém mais escreve:\n${orfaos.join("\n")}`).toEqual([]);
  });

  it.each(TODOS)("e todo passo do tour de %s tem título e texto — passo mudo não ensina", (_nome, passos) => {
    const vazios = passos.filter((p) => !p.titulo.trim() || !p.texto.trim()).map((p) => p.titulo);

    expect(vazios).toEqual([]);
  });

  it("nenhum passo navega para uma área de configuração que não existe mais", () => {
    /**
     * O §308 em forma de teste. Aqui não basta afirmar que a lista de áreas é
     * não-vazia — teste sem dentes passa depois de qualquer estrago. O que se
     * mede é o efeito: RODAR o `onEnter` de cada passo com uma opções que
     * **grava** para onde ele mandou navegar, e cruzar o destino com a lista
     * viva do roteador.
     *
     * O compilador cobre o literal `abrirConfigNaAba("perfis")`; ele não cobre
     * uma área removida do `SEGMENTO_DA_AREA` — foi assim que "⚙ Configura"
     * chegou ao usuário sem nada acusar.
     */
    const visitadas: string[] = [];
    const gravando = new Proxy({} as UseTourOpts, {
      get: (_alvo, prop) => {
        if (prop === "cenarios") return [];
        if (prop === "abrirConfigNaAba") return (aba: string) => visitadas.push(aba);
        return () => undefined;
      },
    });

    for (const passo of [...passosDoProduto(gravando), ...passosDeConfiguracao(gravando)]) passo.onEnter?.();

    const mortas = visitadas.filter((a) => !AREAS_CONFIG_CONHECIDAS.includes(a as never));
    expect(mortas, `passos navegando para área que o roteador não conhece: ${mortas.join(", ")}`).toEqual([]);

    // E a recíproca: o tour de configuração se apresenta como "percorre a
    // administração". Se ele parar de navegar de todo, o teste acima passaria
    // com a lista vazia — por isso o piso é o número de passos que navegam.
    expect(new Set(visitadas).size).toBeGreaterThanOrEqual(6);
  });

  it("nenhum passo cita um rótulo de menu que não existe mais", () => {
    /**
     * O caso do §306: "Contexto do épico" virou "Contexto da demanda" em toda
     * superfície, e um texto de tour que citasse o nome velho continuaria
     * ensinando a procurar um botão que não existe.
     *
     * A régua é conservadora de propósito — só rótulos que o produto REALMENTE
     * renomeou entram na lista. Uma varredura genérica de "toda palavra entre
     * aspas" acusaria prosa e viraria ruído.
     */
    const RENOMEADOS = ["Contexto do épico", "e se ficar lento?", "#/itens", "#/simulacao"];
    const citando = TODOS.flatMap(([nome, passos]) =>
      passos.flatMap((p) =>
        RENOMEADOS.filter((velho) => p.texto.includes(velho) || p.titulo.includes(velho)).map(
          (velho) => `${nome}/${p.titulo}: "${velho}"`
        )
      )
    );

    expect(citando, `passos citando rótulo que o produto já renomeou:\n${citando.join("\n")}`).toEqual([]);
  });
});
/**
 * §340 — **todo passo que abre uma tela com dado REAL de execução tem que ligar
 * a demonstração.**
 *
 * O defeito veio de print do usuário: no tour de configuração, o passo do mapa
 * do sistema mostrava os quatro agentes em vermelho com o erro de crédito da
 * credencial da casa. O passo equivalente do tour de PRODUTO liga o modo antes
 * de abrir o mapa; este não ligava.
 *
 * O §339 tinha trocado o histórico por dados de demonstração e **não bastou** —
 * a correção existia e não alcançava a tela em que o defeito foi visto. Esta
 * trava é o que faz a próxima esquecer doer no CI em vez de numa demonstração.
 */
describe("§340 — quem abre o mapa do sistema liga a demonstração", () => {
  it("nos DOIS tours, o passo que chama `abrirSistema` liga antes", () => {
    const fonte = readFileSync(resolve(import.meta.dirname, "useTour.ts"), "utf-8");

    // Cada `abrirSistema()` precisa de um `ligarDemonstracao(true)` no MESMO
    // `onEnter`. Ler o fonte é grosseiro e é honesto sobre o que faz: o que se
    // guarda aqui é textual, e não custa montar o app inteiro para acusá-lo.
    /**
     * O recorte é o MESMO no filtro e na asserção.
     *
     * A primeira escrita filtrava pelo pedaço inteiro (que vai até o próximo
     * `onEnter:`, varrendo os passos seguintes) e afirmava só até o primeiro
     * `},` — então acusava um passo que nem abre o mapa. Falso positivo do meu
     * teste, não defeito do produto, e ele apareceu no primeiro `npm test`.
     */
    const corpos = fonte
      .split("onEnter:")
      .slice(1)
      .map((b) => b.slice(0, b.indexOf("},") + 2))
      .filter((b) => b.includes("abrirSistema"));

    expect(corpos.length, "ninguém abre o mapa? o passo sumiu").toBeGreaterThan(0);
    for (const corpo of corpos) {
      expect(corpo, `um passo abre o mapa sem ligar a demonstração:
${corpo}`).toContain("ligarDemonstracao(true)");
    }
  });
});

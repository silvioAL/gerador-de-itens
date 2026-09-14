import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPEC-93 fatias A e B — **a trava contra a cor fixa voltar.**
 *
 * A rodada trocou 220 hexes por variáveis. Sem trava, o 221º entra no próximo
 * componente e o modo claro volta a ter um buraco escuro — e ninguém vê, porque
 * `textContent` não sabe de pixel (§333).
 *
 * ## Por que são duas regras e não uma
 *
 * A verificação contra a stack real pegou dois defeitos que a primeira varredura
 * **não** tinha alcançado: o `maskColor` do minimapa e o fundo da legenda do
 * diagrama estavam escritos em `rgba()`, não em hex. No claro, o minimapa virava
 * um bloco quase preto no canto de uma tela branca.
 *
 * Uma trava que só conhece `#rrggbb` teria passado verde nos dois. Por isso a
 * regra 2 olha a PROPRIEDADE (o que pinta superfície) e não a notação da cor.
 */

const RAIZ = resolve(import.meta.dirname, "..");
const CSS = readFileSync(join(RAIZ, "styles.css"), "utf-8");

function arquivosDeCodigo(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return arquivosDeCodigo(caminho);
    if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
    return [caminho];
  });
}

const ARQUIVOS = arquivosDeCodigo(RAIZ).map((f) => ({
  caminho: relative(RAIZ, f).replace(/\\/g, "/"),
  texto: readFileSync(f, "utf-8"),
}));

/** Os valores declarados nos DOIS temas, lidos do CSS de verdade. */
const DECLARADOS = new Map<string, string>();
for (const m of CSS.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  if (!DECLARADOS.has(m[2].toLowerCase())) DECLARADOS.set(m[2].toLowerCase(), m[1]);
}

describe("regra 1 — nenhum hex do código repete um valor que já é variável", () => {
  it("declara variáveis suficientes para a regra valer alguma coisa", () => {
    // Sem isto, um CSS que o teste falhasse em ler daria verde por vacuidade —
    // a trava morreria em silêncio, que é como as anteriores morreram.
    expect(DECLARADOS.size).toBeGreaterThanOrEqual(14);
  });

  it("nenhuma ocorrência", () => {
    const reincidentes = ARQUIVOS.flatMap(({ caminho, texto }) =>
      texto
        .split("\n")
        .flatMap((linha, i) =>
          [...linha.matchAll(/#[0-9a-fA-F]{6}\b/g)]
            .filter((m) => DECLARADOS.has(m[0].toLowerCase()))
            // `var(--x, #hex)` é fallback declarado, não cor solta.
            .filter(() => !/var\(--[a-z0-9-]+,\s*#/.test(linha))
            .map((m) => `${caminho}:${i + 1} ${m[0]} é ${DECLARADOS.get(m[0].toLowerCase())}`),
        ),
    );

    expect(reincidentes).toEqual([]);
  });
});

/**
 * As propriedades que pintam SUPERFÍCIE. Cor de texto branca sobre um botão
 * colorido (`color: "#fff"`, 46 vezes) é certa nos dois temas e fica de fora:
 * o que quebra o tema claro é o fundo, não a tinta em cima dele.
 *
 * `fill` e `stroke` estão aqui porque o diagrama compacto é SVG: os cards dele
 * são `<rect fill=…>`, e um `fill` denso é tão fundo quanto um `background`.
 * A primeira versão desta lista não os tinha, e por isso deixou passar um card
 * `#151b28` e o rastro `#e0f2fe` — invisível sobre branco.
 */
const PINTA_SUPERFICIE = /\b(background|backgroundColor|maskColor|bgColor|fill|stroke)\s*[:=]\s*["']([^"']+)["']/g;

/**
 * O véu de modal é a exceção legítima, e ela é **conceitual**: escurecer o que
 * está atrás de um diálogo é o comportamento certo nos dois temas — um véu
 * claro sobre conteúdo claro não separa nada.
 *
 * A lista é por arquivo e por motivo. Quem acrescentar uma cor de superfície
 * nova vai ver este teste vermelho e ter que escrever aqui por que ela não é um
 * defeito — que é exatamente a conversa que a trava existe para forçar.
 */
const VEUS_JUSTIFICADOS: Record<string, string> = {
  "canvas/Canvas.tsx": "véu do diálogo de exclusão de nó",
  "demo/JourneyModal.tsx": "véu do modal da jornada",
  "demo/TourOverlay.tsx": "véu do tour guiado (e o recorte de 9999px do passo)",
  "navegacao/MenuLateral.tsx": "véu atrás da gaveta do menu",
  "panel/PropertiesPanel.tsx": "véu da confirmação de exclusão",
  "review/FilaDeRevisao.tsx": "véu atrás da fila de revisão",
  "review/SimulacaoEsteira.tsx": "véu da simulação da esteira",
  "summary/AvisosDaDerivacao.tsx": "véu do modal de avisos",
};

/**
 * `fill`/`stroke` também desenham ÍCONE, e aí a régua é outra: um ícone tem cor
 * própria e contraste próprio, e trocá-la por tema o descaracteriza.
 *
 * Branco e preto puros saem por conta — é a mesma tinta dos 46 `color: "#fff"`
 * sobre botão colorido, certa nos dois temas.
 */
const MARCAS_E_ICONES: Record<string, string> = {
  "auth/LoginScreen.tsx": "as quatro cores do 'G' do Google — mudá-las falsifica a marca de outro",
  "demo/CursorFantasma.tsx": "o cursor fantasma: seta branca com contorno escuro, legível sobre qualquer tela",
};

const TINTA_NEUTRA = /^#(fff|ffffff|000|000000)$/i;

/**
 * **O critério é a densidade, não a notação.**
 *
 * A primeira versão desta regra reprovava toda cor crua e vinha com 37 achados —
 * quase todos `rgba(<acento>, 0.14)`, uma LAVAGEM do acento sobre o painel. Essa
 * lavagem funciona nos dois temas justamente porque é translúcida: quem manda na
 * cor final é a superfície de baixo, que já é variável.
 *
 * O que quebra o tema é a cor densa: acima de ~25% de opacidade ela deixa de
 * deixar o tema passar e passa a IMPOR o valor de um tema só — que é exatamente
 * o que os dois defeitos encontrados faziam (`0.72` e `0.7` de azul-quase-preto).
 *
 * `undefined` (hex opaco, sem alfa) conta como 1 e reprova.
 */
const TETO_DE_LAVAGEM = 0.25;

function opacidade(valor: string): number {
  const m = valor.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)|hsla?\([^)]*?,\s*([\d.]+)\s*\)/);
  const a = m?.[1] ?? m?.[2];
  return a === undefined ? 1 : Number(a);
}

describe("regra 2 — cor densa em superfície aponta para variável", () => {
  it("o critério de densidade reconhece os dois casos que a stack real pegou", () => {
    // Sem isto, um regex quebrado deixaria `opacidade()` devolver 1 pra tudo, ou
    // 0 pra tudo, e a regra passaria a medir outra coisa em silêncio.
    expect(opacidade("rgba(12, 17, 26, 0.72)")).toBeGreaterThan(TETO_DE_LAVAGEM);
    expect(opacidade("rgba(99, 102, 241, 0.14)")).toBeLessThanOrEqual(TETO_DE_LAVAGEM);
    expect(opacidade("#3a1d1d")).toBe(1);
  });

  it("nenhuma cor densa fora dos véus declarados", () => {
    const densas = ARQUIVOS.flatMap(({ caminho, texto }) =>
      texto
        .split("\n")
        .flatMap((linha, i) =>
          [...linha.matchAll(PINTA_SUPERFICIE)]
            .map((m) => m[2].trim())
            .filter((v) => /(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/.test(v))
            .filter((v) => opacidade(v) > TETO_DE_LAVAGEM)
            .filter((v) => !TINTA_NEUTRA.test(v))
            .filter(() => !VEUS_JUSTIFICADOS[caminho] && !MARCAS_E_ICONES[caminho])
            .map((v) => `${caminho}:${i + 1} ${v}`),
        ),
    );

    expect(densas).toEqual([]);
  });

  it("a lista de véus não tem entrada morta", () => {
    // Um véu que sumiu do código e ficou na lista transforma a exceção em porta
    // aberta: o arquivo inteiro para de ser verificado por um motivo que já não
    // existe.
    const semCorDensa = Object.keys(VEUS_JUSTIFICADOS).filter((caminho) => {
      const arq = ARQUIVOS.find((a) => a.caminho === caminho);
      if (!arq) return true;
      return ![...arq.texto.matchAll(PINTA_SUPERFICIE)].some(
        (m) => /(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/.test(m[2]) && opacidade(m[2]) > TETO_DE_LAVAGEM,
      );
    });

    expect(semCorDensa).toEqual([]);
  });
});

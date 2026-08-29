/**
 * SPEC-79 fatia C — **o contraste, que é aritmética.**
 *
 * ## Por que isto existe, e por que é o coração da SPEC-79
 *
 * Um design system só entra neste produto se virar **checagem**. O produto
 * inteiro é construído sobre a diferença entre *"chamada externa tem que ter
 * timeout curto"* (opinião) e *`timeout ≤ 500ms`* (padrão) — e sem essa
 * diferença, "está de acordo com o design system?" seria a primeira pergunta que
 * a ferramenta faria sem saber responder.
 *
 * A boa notícia é que boa parte dela **é** respondível: contraste é uma razão
 * definida entre luminâncias relativas, não uma impressão. A conta é a da WCAG
 * 2.x, e ela é curta.
 *
 * > A régua que a SPEC-79 §3 declara: **se dá para calcular, é `checagem`; se não
 * > dá, é `Requisito` sem checagem** — um item de checklist que uma pessoa
 * > responde. "Contraste ≥ 4.5" entra aqui; "a tela parece nossa" não entra em
 * > lugar nenhum que se meça.
 *
 * ## O que ele NÃO faz
 *
 * Não julga paleta, não sugere cor, não opina sobre harmonia. Devolve um número,
 * e quem decide o que fazer com ele é a regra que o time escreveu.
 */

/** `#rgb`, `#rrggbb` e `#rrggbbaa` — o alfa é lido e descartado (ver `contraste`). */
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `undefined` quando não é cor que a gente saiba ler — e isso é resposta, não
 * erro.
 *
 * A mesma disciplina de `numeroDe` em `conformidade.ts`: campo que não dá para
 * interpretar faz a checagem **se calar**, em vez de acusar o desenho por uma
 * regra que pressupõe um formato que o tipo não garante. Acusar aqui produziria
 * violação em cima de `var(--painel)`, que é uma cor perfeitamente válida cujo
 * valor o motor simplesmente não tem.
 */
export function rgbDe(cor: string): [number, number, number] | undefined {
  const m = HEX.exec(cor.trim());
  if (!m) return undefined;

  let hex = m[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  // `#rrggbbaa`: o alfa sai. Contraste sobre transparência depende do que está
  // ATRÁS, e o motor não sabe o que está atrás — fingir que sabe daria um número
  // com aparência de medição.
  if (hex.length === 8) hex = hex.slice(0, 6);

  const n = Number.parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminância relativa da WCAG 2.x — a linearização sRGB, exatamente como a
 * especificação a define. Os números mágicos são dela, e não escolha nossa. */
function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * A razão de contraste entre duas cores, de 1 (idênticas) a 21 (preto no
 * branco). `undefined` se alguma das duas não for legível como cor.
 *
 * Simétrica de propósito — a WCAG define a razão com a mais clara no numerador,
 * então trocar texto e fundo dá o mesmo número. Uma regra escrita ao contrário
 * mede a mesma coisa, e é melhor que ela funcione do que exigir que o time
 * acerte a ordem.
 */
export function contraste(corA: string, corB: string): number | undefined {
  const a = rgbDe(corA);
  const b = rgbDe(corB);
  if (!a || !b) return undefined;

  const la = luminancia(a);
  const lb = luminancia(b);
  const clara = Math.max(la, lb);
  const escura = Math.min(la, lb);
  return (clara + 0.05) / (escura + 0.05);
}

/** Arredondado para uma casa, que é como uma razão de contraste se lê e se
 * escreve numa regra ("≥ 4.5"). A frase de violação usa isto. */
export function contrasteArredondado(corA: string, corB: string): number | undefined {
  const r = contraste(corA, corB);
  return r === undefined ? undefined : Math.round(r * 10) / 10;
}

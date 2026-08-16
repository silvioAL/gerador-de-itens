/**
 * SPEC-60 fatia C — o que mudou desde a aprovação.
 *
 * ## O aviso que era verdadeiro e inútil
 *
 * `documentoDesatualizado` é `especificacao !== markdownDoDocumento`: um
 * booleano. A tela dizia *"o desenho mudou depois da aprovação"* e parava ali —
 * quem lê tinha que reler o documento inteiro para descobrir se mudou uma
 * vírgula do preâmbulo ou a lista de itens.
 *
 * O aviso inútil não é neutro: ele **treina a pessoa a reaprovar sem olhar**,
 * que é exatamente o carimbo que o §233 quis evitar.
 *
 * ## Por que por SEÇÃO, e não por linha
 *
 * "Mudou a seção Itens" é uma frase que leva a uma ação. "A linha 340 mudou"
 * não é — ninguém tem o documento aprovado aberto em outra janela com os
 * números de linha à mão. A seção é a unidade em que o documento foi escrito e
 * é a unidade em que ele é revisado.
 *
 * ## O que isto NÃO é
 *
 * Não é versionamento, e continua não sendo — a SPEC-58 adiou histórico com
 * razão. Isto compara **duas** coisas que já estão na mão: a foto da aprovação
 * e o texto de agora. Nenhuma linha nova no banco.
 *
 * Função pura, sem I/O, como o resto do engine.
 */
export interface MudancaDeSecao {
  titulo: string;
  tipo: "entrou" | "saiu" | "mudou";
}

/** O que fica antes do primeiro `## ` — cabeçalho, título, preâmbulo do
 * template. Tem nome próprio porque "mudou o começo do documento" é uma
 * informação diferente de "mudou uma seção". */
const ABERTURA = "Abertura do documento";

/**
 * As seções, na ordem em que aparecem.
 *
 * Título repetido não é agrupado: dois `## Itens` são duas seções, e somar o
 * conteúdo das duas esconderia a mudança que passou de uma para a outra. O
 * segundo recebe um sufixo invisível na chave e o mesmo título na saída — quem
 * lê não precisa saber do desempate.
 */
function seccionar(markdown: string): { chave: string; titulo: string; corpo: string }[] {
  const linhas = markdown.split("\n");
  const secoes: { chave: string; titulo: string; corpo: string[] }[] = [
    { chave: ABERTURA, titulo: ABERTURA, corpo: [] },
  ];
  const vistos = new Map<string, number>();

  for (const linha of linhas) {
    const titulo = /^##\s+(.*\S)\s*$/.exec(linha)?.[1];
    if (titulo === undefined) {
      secoes[secoes.length - 1].corpo.push(linha);
      continue;
    }
    const n = (vistos.get(titulo) ?? 0) + 1;
    vistos.set(titulo, n);
    secoes.push({ chave: n === 1 ? titulo : `${titulo}#${n}`, titulo, corpo: [] });
  }

  return secoes
    .map((s) => ({ chave: s.chave, titulo: s.titulo, corpo: s.corpo.join("\n").trim() }))
    // A abertura só existe se tiver conteúdo: todo documento tem a lista
    // começando com ela, e uma seção vazia igual dos dois lados nunca aparece
    // mesmo — mas uma abertura vazia de um lado e cheia do outro é mudança real.
    .filter((s, i) => i > 0 || s.corpo !== "");
}

/**
 * O que entrou, o que saiu e o que mudou entre a foto e o texto de agora.
 *
 * Na ordem do documento **atual**, porque é o que a pessoa tem na frente; o que
 * saiu vem no fim, já que não tem mais lugar nessa ordem.
 *
 * Documentos iguais devolvem lista vazia — e vazio aqui é uma afirmação, não
 * uma falha: se o booleano diz "desatualizado" e isto não acha nada, a
 * diferença é só espaço em branco, e a tela tem o direito de dizer isso.
 */
export function compararDocumentos(aprovado: string, atual: string): MudancaDeSecao[] {
  const antes = new Map(seccionar(aprovado).map((s) => [s.chave, s]));
  const depois = seccionar(atual);
  const mudancas: MudancaDeSecao[] = [];

  for (const s of depois) {
    const anterior = antes.get(s.chave);
    if (!anterior) mudancas.push({ titulo: s.titulo, tipo: "entrou" });
    else if (anterior.corpo !== s.corpo) mudancas.push({ titulo: s.titulo, tipo: "mudou" });
    antes.delete(s.chave);
  }

  for (const restante of antes.values()) {
    mudancas.push({ titulo: restante.titulo, tipo: "saiu" });
  }

  return mudancas;
}

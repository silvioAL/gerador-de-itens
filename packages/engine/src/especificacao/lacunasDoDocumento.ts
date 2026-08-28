import { MARCADOR_ESPECIFICAR } from "../refinamento/gerarRefinamento.js";

/**
 * SPEC-73 — **toda lacuna que o documento entrega tem que ser CONTÁVEL.**
 *
 * ## O que isto varre, e por quê
 *
 * O motor escreve, em alguns lugares, um esqueleto esperando que alguém
 * complete: `Como <papel>, quero <ação>…`, `Dado <contexto>`. A forma
 * `<algo>` é o sinal — é assim que se escreve "preencha aqui" em português
 * técnico, e é assim que os quatro casos medidos aparecem.
 *
 * O que separa lacuna **endereçada** de placeholder esquecido é o
 * `MARCADOR_ESPECIFICAR`: com ele, o documento diz o que falta, a tela conta
 * quantos faltam (`gerarItensDeTrabalho` conta por texto) e a esteira sabe onde
 * escrever. Sem ele, existe um terceiro estado — **texto de formulário que não
 * é lacuna declarada nem conteúdo real** —, e é ele que o §248 chama de verde
 * falso quando passa por um documento aprovado.
 *
 * ## As três decisões de forma, e o motivo de cada uma
 *
 * **1. Bloco de código NÃO é exceção.** A primeira versão desta régua ignorava
 * ```` ``` ```` porque `<T>` de um exemplo de código não é lacuna. Só que o
 * Gherkin genérico — um dos dois casos que a SPEC mediu — sai justamente dentro
 * de um bloco ```` ```gherkin ````, e a régua passaria ao largo do defeito que
 * ela existe para pegar. Bloco de código entra na varredura; o que fica de fora
 * é `<algo>` **com marcador na mesma vizinhança**.
 *
 * **2. O marcador vale para o BLOCO, não para a linha.** Pôr
 * `<- ✍️ especificar` dentro de um bloco gherkin quebra a sintaxe para quem
 * colar em ferramenta de BDD. Então a vizinhança é o parágrafo — o trecho entre
 * linhas em branco —, e o marcador pode vir na linha seguinte ao bloco.
 *
 * **3. Só `<...>` que pareça português, e que esteja SOLTO na frase.**
 * `<https://…>` é URL (tem `:` e `/`), `` `<div>` `` é citação, e
 * `Map<string, X>` é genérico — este último se reconhece pelo `<` colado a uma
 * palavra. Uma lacuna de prosa vem depois de espaço ou no começo da linha, e é
 * essa a diferença que a régua usa.
 */

/** Uma lacuna que o documento entrega sem dizer que é lacuna. */
export interface LacunaSemMarcador {
  /** O trecho literal encontrado, ex.: `<papel>`. */
  trecho: string;
  /** A linha inteira onde ele apareceu — é o que dá o endereço a quem lê. */
  linha: string;
  /** 1-based, como um editor conta. */
  numeroDaLinha: number;
}

/**
 * `<algo>` SOLTO na frase: precedido por começo de linha, espaço ou pontuação —
 * nunca colado a uma palavra, que é o que denuncia um genérico (`Map<string>`).
 * Sem os caracteres que denunciam código (`/`, `:`, `=`, `{`, `"`).
 */
const FORMA_DE_LACUNA = /(^|[^\w`])<([^<>/:="{}\n]{2,60})>/g;

/** O trecho entre linhas em branco onde a linha está — o "parágrafo" dela. */
function vizinhancaDa(linhas: string[], indice: number): string {
  let inicio = indice;
  while (inicio > 0 && linhas[inicio - 1].trim() !== "") inicio--;
  let fim = indice;
  while (fim < linhas.length - 1 && linhas[fim + 1].trim() !== "") fim++;
  // Uma linha depois do fim do parágrafo: é onde o marcador de um BLOCO cabe
  // sem quebrar a sintaxe de dentro dele.
  return linhas.slice(inicio, Math.min(fim + 2, linhas.length)).join("\n");
}

/**
 * As lacunas que o documento entrega **sem** o marcador que as torna contáveis.
 *
 * Lista vazia = todo `<algo>` que sai daqui está endereçado.
 */
export function lacunasSemMarcador(markdown: string): LacunaSemMarcador[] {
  const linhas = markdown.split("\n");
  const achados: LacunaSemMarcador[] = [];

  linhas.forEach((linha, i) => {
    FORMA_DE_LACUNA.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FORMA_DE_LACUNA.exec(linha))) {
      // O grupo do "antes" consome um caractere, e ele pode ser o espaço que
      // separa duas lacunas seguidas. Sem devolvê-lo, `quero <a> para <b>`
      // acharia só a primeira.
      FORMA_DE_LACUNA.lastIndex--;

      const dentro = m[2];
      const trecho = `<${dentro}>`;
      // Palavra única em MAIÚSCULAS ou CamelCase é quase sempre tipo/sigla, não
      // um "preencha aqui". O que o motor escreve é minúsculo e em português.
      if (!/[\sà-úÀ-Ú-]/.test(dentro) && dentro !== dentro.toLowerCase()) continue;
      // Entre crases é código CITADO (`<div>`), e citar não é pedir para
      // preencher. Diferente do bloco ```` ``` ````, que entra na varredura de
      // propósito — é lá que mora o Gherkin genérico.
      if (linha.includes(`\`${trecho}\``)) continue;
      if (vizinhancaDa(linhas, i).includes(MARCADOR_ESPECIFICAR)) continue;
      achados.push({ trecho, linha: linha.trim(), numeroDaLinha: i + 1 });
    }
  });

  return achados;
}

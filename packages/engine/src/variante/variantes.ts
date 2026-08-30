import type { Decisao, Diagrama, Quebra, Variante } from "../model/types.js";
import type { DiagramaConfig } from "../config/types.js";
import { lerDesenho, type LeituraDoDesenho } from "../leitura/lerDesenho.js";

/**
 * SPEC-88 (P6) — **a variante, e a troca que registra a escolha.**
 *
 * ## A armadilha que a SPEC-56 §8 nomeou antes de alguém cair nela
 *
 * > *"variante não pode ser 'copiar a quebra e editar', ou as duas divergem e
 * > ninguém sabe qual venceu."*
 *
 * Duas quebras seria o desenho errado: contexto, necessidades, decisões, produto
 * e volume são **da demanda**, não do desenho. Copiá-los produz dois lugares para
 * editar a mesma coisa, e eles divergem na primeira semana.
 *
 * ## Uma verdade por vez, com histórico
 *
 * A quebra continua tendo **um** `diagrama`, e ele é sempre o adotado.
 * `variantes` guarda as alternativas **não adotadas**. Adotar troca os dois de
 * lugar e registra uma `Decisao`.
 *
 * Em nenhum instante existem dois desenhos válidos ao mesmo tempo — e é por isso
 * que prontidão, itens, documento e spec não precisam aprender o que é variante.
 */

export class AdocaoSemPorque extends Error {
  constructor() {
    super("adotar uma variante exige o porquê da escolha");
    this.name = "AdocaoSemPorque";
  }
}

export class VarianteInexistente extends Error {
  constructor(id: string) {
    super(`variante não encontrada: ${id}`);
    this.name = "VarianteInexistente";
  }
}

export interface ResultadoDaAdocao {
  /** A quebra depois da troca — o diagrama de antes virou variante. */
  quebra: Quebra;
  /**
   * A decisão que NASCE da adoção, com as duas na lista e o porquê.
   *
   * Devolvida separada em vez de já enfiada na quebra: quem chama decide onde
   * ela entra (a quebra já tem `decisoes`, e a rota tem auditoria a fazer), e uma
   * função pura que grava em dois lugares esconde metade do que faz.
   */
  decisao: Decisao;
}

/**
 * Adota uma variante. Pura: não gera id nem lê relógio — os dois entram por
 * parâmetro, pela mesma razão de sempre (o motor é determinístico, e teste que
 * depende de `Date.now()` é teste que falha em fevereiro).
 *
 * **Recusa sem `porque`.** É a mesma régua do §230 pelo outro lado: não
 * bloqueamos aprovar com lacuna marcada, mas bloqueamos gravar decisão vazia —
 * decisão vazia não é lacuna marcada, é ausência disfarçada de registro. Sem
 * ela, adotar seria "copiar e editar" com um passo a mais.
 */
export function adotarVariante(
  quebra: Quebra,
  varianteId: string,
  porque: string,
  /**
   * `autor` é OBRIGATÓRIO, e não opcional com um vazio de reserva: `Decisao`
   * exige autor desde sempre, e uma decisão sem dono é a que ninguém consegue
   * discutir três meses depois.
   */
  agora: { id: string; em: string; autor: string }
): ResultadoDaAdocao {
  if (!porque.trim()) throw new AdocaoSemPorque();

  const variantes = quebra.variantes ?? [];
  const escolhida = variantes.find((v) => v.id === varianteId);
  if (!escolhida) throw new VarianteInexistente(varianteId);

  /**
   * O desenho de agora vira variante, e leva o TÍTULO da quebra.
   *
   * Sem título ele viraria "variante sem nome" numa lista onde o nome é a única
   * forma de saber o que se está comparando. E o título da quebra é o nome que
   * essa pessoa já deu a este desenho.
   */
  const anterior: Variante = {
    id: agora.id,
    titulo: quebra.titulo?.trim() || "Desenho anterior",
    diagrama: quebra.diagrama,
    criadaEm: agora.em,
    motivo: `Substituído por "${escolhida.titulo}"`,
  };

  const decisao: Decisao = {
    id: `variante:${agora.id}`,
    titulo: `Desenho adotado: ${escolhida.titulo}`,
    // A lista é o leque INTEIRO que estava na mesa, incluindo a escolhida —
    // é o que `Decisao.alternativas` já documenta.
    alternativas: [
      { titulo: escolhida.titulo, consequencia: escolhida.motivo },
      { titulo: anterior.titulo, consequencia: "não adotado" },
    ],
    escolhida: escolhida.titulo,
    porque: porque.trim(),
    status: "aceita",
    // `manual`: quem adota é uma pessoa, sempre. Não existe caminho de IA para
    // esta operação, e marcar como `sugerido` seria mentir sobre a procedência.
    origem: "manual",
    autor: agora.autor,
    em: agora.em,
  };

  return {
    quebra: {
      ...quebra,
      diagrama: escolhida.diagrama,
      // A escolhida sai da lista (virou o desenho) e a anterior entra.
      variantes: [...variantes.filter((v) => v.id !== varianteId), anterior],
      decisoes: [...(quebra.decisoes ?? []), decisao],
    },
    decisao,
  };
}

/**
 * Guarda o desenho de agora como uma alternativa, **sem trocar nada**.
 *
 * É o passo que vem antes de comparar: a pessoa desenha B, guarda, volta para A.
 * Não registra decisão nenhuma de propósito — guardar uma opção não é escolhê-la,
 * e um ADR nascido de um "salvar como" seria ruído no histórico de decisões.
 */
export function guardarComoVariante(
  quebra: Quebra,
  titulo: string,
  diagrama: Diagrama,
  agora: { id: string; em: string },
  motivo?: string
): Quebra {
  return {
    ...quebra,
    variantes: [
      ...(quebra.variantes ?? []),
      { id: agora.id, titulo: titulo.trim() || "Alternativa", diagrama, criadaEm: agora.em, motivo },
    ],
  };
}

export interface LadoDaComparacao {
  titulo: string;
  leitura: LeituraDoDesenho;
  /** ms do pior trecho, ou `undefined` quando o desenho não declara tempo. */
  piorTrechoMs?: number;
  /** Quantos pontos o motor apontou como esperando por mais de um. */
  pontosDeFanOut: number;
  /** §57 — o que ficou de fora da leitura, para a comparação não parecer completa. */
  naoMedido: number;
}

export interface ComparacaoDeVariantes {
  a: LadoDaComparacao;
  b: LadoDaComparacao;
  /**
   * `b - a` em ms, e **só quando os dois lados têm número**.
   *
   * `undefined` quando algum dos dois não declara tempo — e essa é a diferença
   * que importa: tratar "não medido" como zero faria o desenho sem dado nenhum
   * parecer o mais rápido dos dois, que é exatamente ao contrário.
   */
  diferencaMs?: number;
}

function ladoDe(titulo: string, diagrama: Diagrama, config: DiagramaConfig): LadoDaComparacao {
  const leitura = lerDesenho(diagrama, config);
  return {
    titulo,
    leitura,
    piorTrechoMs: leitura.tempoDoPiorTrecho?.ms,
    pontosDeFanOut: leitura.fanOut.length,
    naoMedido: leitura.conexoesNaoClassificadas.reduce((soma, c) => soma + c.quantas, 0),
  };
}

/**
 * Compara dois desenhos com a MESMA leitura que o produto já faz.
 *
 * Não há motor novo aqui: `lerDesenho` é pura e roda sobre um diagrama, então
 * comparar é chamá-la duas vezes. Um cálculo próprio para a comparação seria uma
 * segunda verdade sobre o mesmo desenho, e elas divergiriam na primeira mudança
 * de régua (§263).
 */
export function compararVariantes(
  a: { titulo: string; diagrama: Diagrama },
  b: { titulo: string; diagrama: Diagrama },
  config: DiagramaConfig
): ComparacaoDeVariantes {
  const ladoA = ladoDe(a.titulo, a.diagrama, config);
  const ladoB = ladoDe(b.titulo, b.diagrama, config);
  const temOsDois = ladoA.piorTrechoMs !== undefined && ladoB.piorTrechoMs !== undefined;

  return {
    a: ladoA,
    b: ladoB,
    diferencaMs: temOsDois ? ladoB.piorTrechoMs! - ladoA.piorTrechoMs! : undefined,
  };
}

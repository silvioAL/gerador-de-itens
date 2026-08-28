import type { DiagramaConfig } from "../config/types.js";
import type {
  AjusteDeCenario,
  CenarioDeLentidao,
  Diagrama,
  EstadoDoEnsaio,
  ValorSpec,
  VolumetriaDaDemanda,
} from "../model/types.js";
import {
  CAMPO_DE_TEMPO_PADRAO,
  arestaEspera,
  formatarDuracao,
  lerDesenho,
  type ElementoDaLeitura,
  type LeituraDoDesenho,
} from "./lerDesenho.js";
import { avaliarResiliencia, insistenciaDe, type ContradicaoDeResiliencia } from "./resiliencia.js";

/**
 * SPEC-66 fatia A — a mesa como bancada de ensaio.
 *
 * ## O cálculo não é da IA
 *
 * "Se o bureau responder em 8 s em vez de 3 s, quanto passa a demorar a
 * resposta?" é **aritmética sobre o grafo**: trocar um número e recorrer
 * `lerDesenho`. Determinístico, instantâneo, e **o mesmo resultado toda vez**.
 * Um modelo trocaria uma resposta exata por uma plausível, e ninguém deveria
 * decidir arquitetura com número que muda entre execuções.
 *
 * O que a IA propõe é a **pauta** — quais cenários merecem ensaio —, nunca o
 * resultado. Ver SPEC-66 §1.
 *
 * ## O cenário nunca escreve no desenho
 *
 * Ele é uma lente sobre uma **cópia**. Um "e se" que altera o diagrama de
 * verdade transformaria ensaio em mudança, e a pessoa perderia o original no
 * primeiro clique.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

/**
 * SPEC-71 — estes quatro tipos MUDARAM DE CASA, e o motivo está em
 * `model/types.ts`: o que é persistido é do modelo, e manter uma segunda
 * versão lá fez o Zod da borda ser escrito contra a forma errada.
 *
 * A reexportação existe para quem já importava daqui — que é praticamente
 * toda a UI de ensaios — não precisar saber que a fronteira mudou.
 */
export type {
  AjusteDeCenario,
  CenarioDeLentidao,
  DebitoAssumido,
  EstadoDoEnsaio,
} from "../model/types.js";

/**
 * O estado, tolerando a quebra gravada antes desta SPEC.
 *
 * `aceito: true` de antes vira `aceito` — quem já tinha marcado não perde o
 * gesto. E ausência total vira `por-avaliar`: um ensaio que ninguém olhou
 * cobra, que é a inversão que dá nome a esta SPEC.
 */
export function estadoDoEnsaio(c: CenarioDeLentidao): EstadoDoEnsaio {
  if (c.estado) return c.estado;
  return c.aceito === true ? "aceito" : "por-avaliar";
}

/** O que ainda cobra alguém — o que vai ao placar. */
export function ensaioCobra(c: CenarioDeLentidao): boolean {
  return estadoDoEnsaio(c) !== "aceito";
}

export interface ResultadoDoCenario {
  cenarioId: string;
  nome: string;
  /** A leitura inteira do desenho ajustado — o chamador escolhe o que mostrar. */
  leitura: LeituraDoDesenho;
  /** O pior trecho, que é o número da tabela. `undefined` = não há o que somar. */
  ms?: number;
  /** `false` = a soma é piso (§248). O `≥` sobrevive ao cenário: ele não
   * inventa número que o desenho não deu. */
  completo: boolean;
  /** Quem mais pesa. Empate devolve os dois. */
  dominantes: { elemento: ElementoDaLeitura; ms: number }[];
  /**
   * Contra o desenho de HOJE, nunca contra o cenário anterior: comparar em
   * cadeia faria a ordem das linhas mudar o significado dos números.
   * `undefined` quando um dos dois lados não tem número a comparar.
   */
  delta?: number;
  /** Ajustes que não encontraram elemento — o desenho mudou depois do cenário.
   * §57: um ensaio que ignorou parte do que lhe pediram tem que dizer. */
  ajustesSemAlvo: AjusteDeCenario[];
  /**
   * SPEC-68 — o que este ensaio faz o desenho passar a contradizer.
   *
   * É a coluna que transforma a tabela de placar em ferramenta: "com o pico de
   * 100 req/s, o pool de 10 satura" é uma consequência que ninguém enxerga
   * olhando dois campos em telas diferentes.
   */
  contradicoes: ContradicaoDeResiliencia[];
  /** Por quanto tempo o trecho mais demorado INSISTE antes de desistir. */
  insistenciaMs?: number;
}

export interface ElementoAjustavel {
  tipo: "no" | "aresta";
  id: string;
  rotulo: string;
  /** O tempo declarado hoje. Ausente = o campo existe e ninguém respondeu. */
  msAtual?: number;
  /** SPEC-66 — o que não é de vocês merece atenção especial no ensaio. */
  externo?: boolean;
}

/**
 * Os elementos que PODEM ficar lentos — os que declaram o campo de tempo.
 *
 * Só eles entram na lista de ajustáveis e no pedido à IA: oferecer um slider
 * para um elemento sem duração seria oferecer um controle que não controla
 * nada, e deixar o modelo escolher entre eles produziria ajuste que a conta
 * ignora em silêncio.
 */
export function elementosComTempo(
  diagrama: Diagrama,
  config: DiagramaConfig,
  campo: string = CAMPO_DE_TEMPO_PADRAO
): ElementoAjustavel[] {
  const rotulo = (id: string) => diagrama.nodes.find((n) => n.id === id)?.label?.trim() || id;

  const nos: ElementoAjustavel[] = diagrama.nodes
    .filter((n) => (config.nodeTypes[n.type]?.spec ?? []).some((c) => c.key === campo))
    .map((n) => ({
      tipo: "no",
      id: n.id,
      rotulo: rotulo(n.id),
      msAtual: valorNumerico(n.spec?.[campo]),
      externo: config.nodeTypes[n.type]?.derives === "external",
    }));

  const arestas: ElementoAjustavel[] = diagrama.edges
    .filter((e) => (config.edgeTypes[e.type]?.spec ?? []).some((c) => c.key === campo))
    .map((e) => ({
      tipo: "aresta",
      id: e.id,
      rotulo: `${rotulo(e.source)} → ${rotulo(e.target)}`,
      msAtual: valorNumerico(e.spec?.[campo]),
    }));

  return [...nos, ...arestas];
}

function valorNumerico(v: ValorSpec | undefined): number | undefined {
  const bruto = v?.valor;
  if (bruto === undefined || bruto === null || bruto === "") return undefined;
  const n = typeof bruto === "number" ? bruto : Number(bruto);
  return Number.isFinite(n) ? n : undefined;
}

/** O tempo depois do ajuste. `ms` manda sobre `fator`: valor absoluto é uma
 * afirmação, multiplicador é uma variação sobre o que existe. */
function aplicar(atual: number | undefined, ajuste: AjusteDeCenario): number | undefined {
  if (ajuste.ms !== undefined) return ajuste.ms;
  if (ajuste.fator !== undefined && atual !== undefined) return atual * ajuste.fator;
  // Multiplicar o que ninguém declarou daria um número inventado com cara de
  // medida. O elemento segue sem valor, e a soma segue sendo piso.
  return atual;
}

/**
 * SPEC-68 — os campos que o ensaio sobrescreve além do tempo.
 *
 * Só entram os que o ajuste DECLARA: um ensaio sobre taxa não deve zerar o
 * retry que a pessoa configurou no desenho, e omissão aqui significa "como
 * está", nunca "nenhum".
 */
function outrosCampos(ajuste: AjusteDeCenario): Record<string, ValorSpec> {
  const campos: Record<string, ValorSpec> = {};
  if (ajuste.tentativas !== undefined) campos.tentativas = { valor: ajuste.tentativas, origem: "manual" };
  if (ajuste.disjuntor !== undefined) campos.disjuntor = { valor: ajuste.disjuntor, origem: "manual" };
  if (ajuste.taxaRps !== undefined) campos.taxaEsperadaRps = { valor: ajuste.taxaRps, origem: "manual" };
  return campos;
}

/**
 * Roda o cenário e devolve o que a tabela mostra.
 *
 * `hoje` entra como parâmetro (e não é recalculado aqui) porque a tabela
 * inteira compara contra a MESMA âncora: recalculá-la por linha abriria a porta
 * para duas linhas compararem contra leituras diferentes do mesmo desenho.
 */
export function simularCenario(
  diagrama: Diagrama,
  config: DiagramaConfig,
  cenario: CenarioDeLentidao,
  hoje?: LeituraDoDesenho,
  campoDeTempo: string = CAMPO_DE_TEMPO_PADRAO,
  /** SPEC-70 — o volume da demanda, para a saturação não depender de alguém
   * digitar a taxa nó a nó. O `fatorDeVolume` do cenário multiplica este
   * número, e o pico chega a todos de uma vez. */
  volumetria?: VolumetriaDaDemanda
): ResultadoDoCenario {
  const nosPorId = new Map(diagrama.nodes.map((n) => [n.id, n]));
  const arestasPorId = new Map(diagrama.edges.map((e) => [e.id, e]));
  const ajustesSemAlvo: AjusteDeCenario[] = [];

  // A cópia é rasa nos elementos NÃO tocados e profunda só onde o ajuste mexe:
  // clonar o diagrama inteiro a cada arrastar de slider seria caro à toa.
  const nodes = diagrama.nodes.map((n) => n);
  const edges = diagrama.edges.map((e) => e);

  for (const ajuste of cenario.ajustes) {
    if (ajuste.tipo === "no") {
      const no = nosPorId.get(ajuste.id);
      if (!no) {
        ajustesSemAlvo.push(ajuste);
        continue;
      }
      const novo = aplicar(valorNumerico(no.spec?.[campoDeTempo]), ajuste);
      const extras = outrosCampos(ajuste);
      if (novo === undefined && Object.keys(extras).length === 0) continue;
      const i = nodes.findIndex((n) => n.id === ajuste.id);
      nodes[i] = {
        ...no,
        spec: {
          ...no.spec,
          ...(novo === undefined
            ? {}
            : { [campoDeTempo]: { ...no.spec?.[campoDeTempo], valor: novo, origem: "manual" } }),
          ...extras,
        },
      };
    } else {
      const aresta = arestasPorId.get(ajuste.id);
      if (!aresta) {
        ajustesSemAlvo.push(ajuste);
        continue;
      }
      const novo = aplicar(valorNumerico(aresta.spec?.[campoDeTempo]), ajuste);
      const extras = outrosCampos(ajuste);
      if (novo === undefined && Object.keys(extras).length === 0) continue;
      const i = edges.findIndex((e) => e.id === ajuste.id);
      edges[i] = {
        ...aresta,
        spec: {
          ...aresta.spec,
          ...(novo === undefined
            ? {}
            : { [campoDeTempo]: { ...aresta.spec?.[campoDeTempo], valor: novo, origem: "manual" } }),
          ...extras,
        },
      };
    }
  }

  const ensaiado = { ...diagrama, nodes, edges };
  const leitura = lerDesenho(ensaiado, config, { campoDeTempo });
  const t = leitura.tempoDoPiorTrecho;
  const base = hoje?.tempoDoPiorTrecho?.ms;

  // SPEC-68 — a insistência do trecho que responde, e o que este ensaio faz o
  // desenho passar a contradizer. É o que separa "ficou mais lento" de "agora
  // isto não pode dar certo".
  const insistencias = edges
    .filter((e) => arestaEspera(e, config) === true)
    .map((e) => insistenciaDe(e))
    .filter((i): i is NonNullable<typeof i> => i !== undefined && i.insiste);

  return {
    cenarioId: cenario.id,
    nome: cenario.nome,
    leitura,
    ms: t?.ms,
    completo: t?.completo ?? true,
    dominantes: t?.dominantes ?? [],
    delta: t?.ms !== undefined && base !== undefined ? t.ms - base : undefined,
    ajustesSemAlvo,
    contradicoes: avaliarResiliencia(ensaiado, config, undefined, {
      volume: volumetria,
      fator: cenario.fatorDeVolume,
    }),
    insistenciaMs: insistencias.length > 0 ? Math.max(...insistencias.map((i) => i.ms)) : undefined,
  };
}

/**
 * SPEC-69 §3 — o prazo do negócio estourado.
 *
 * "24 s" sozinho não decide nada; "24 s contra os 5 s que o negócio pede"
 * decide. Sem `limiteMs` declarado não há confronto, e o silêncio é honesto:
 * ninguém prometeu nada.
 *
 * Com várias necessidades, vale **a mais apertada** — a mesma escolha que
 * `avaliarResiliencia` faz com a paciência de quem chama, e pelo mesmo motivo:
 * basta uma promessa curta para o prazo ser furado.
 */
export function prazoEstourado(
  ms: number | undefined,
  necessidades: { texto: string; limiteMs?: number }[] = []
): { limiteMs: number; texto: string } | undefined {
  if (ms === undefined) return undefined;
  const comPrazo = necessidades.filter((n) => typeof n.limiteMs === "number" && n.limiteMs > 0);
  if (comPrazo.length === 0) return undefined;
  const apertada = comPrazo.reduce((a, b) => (a.limiteMs! <= b.limiteMs! ? a : b));
  return ms > apertada.limiteMs! ? { limiteMs: apertada.limiteMs!, texto: apertada.texto } : undefined;
}

/**
 * SPEC-69 §4.0.1 — a conclusão escrita, para quem avalia não ter que montá-la.
 *
 * A linha entregava números crus (`≥ 24 s`, `+21 s`, `bureau (24 s)`) e pedia
 * que a pessoa cruzasse quatro colunas para chegar ao que o motor já sabia.
 *
 * Três regras:
 *
 * 1. **compara com o que o negócio pediu** quando há prazo; sem ele, compara
 *    com hoje e não inventa julgamento;
 * 2. **nomeia o dominante** — é o que transforma "está ruim" em "está ruim por
 *    causa disto";
 * 3. **é derivada, nunca escrita pela IA.** O texto do modelo é o *porquê do
 *    cenário* ("fins de semana concentram 40% das solicitações"), que é
 *    conhecimento de mundo. A conclusão sobre a conta é aritmética, e misturar
 *    as duas seria a IA opinando sobre o número.
 */
export function concluirEnsaio(
  r: ResultadoDoCenario,
  hojeMs: number | undefined,
  necessidades: { texto: string; limiteMs?: number }[] = []
): string | undefined {
  if (r.ms === undefined) return undefined;
  const dur = (n: number) => formatarDuracao(n);

  const partes: string[] = [];
  const prazo = prazoEstourado(r.ms, necessidades);
  if (prazo) {
    const vezes = r.ms / prazo.limiteMs;
    partes.push(
      `A resposta vai a ${dur(r.ms)} — ${
        vezes >= 2 ? `${vezes.toFixed(1).replace(".", ",")}× ` : ""
      }acima do prazo de ${dur(prazo.limiteMs)} que o negócio pede.`
    );
  } else if (hojeMs !== undefined && r.ms !== hojeMs) {
    partes.push(`A resposta vai de ${dur(hojeMs)} para ${dur(r.ms)}.`);
  } else {
    partes.push(`A resposta fica em ${dur(r.ms)}.`);
  }

  if (r.dominantes.length > 0) {
    const nomes = r.dominantes.map((d) => d.elemento.rotulo).join(" e ");
    partes.push(`${nomes} responde${r.dominantes.length > 1 ? "m" : ""} por ${dur(r.dominantes[0].ms)} disso.`);
  }

  if (r.contradicoes.length > 0) {
    partes.push(
      `E ${r.contradicoes.length === 1 ? "aparece uma contradição" : `aparecem ${r.contradicoes.length} contradições`} que não existe${r.contradicoes.length === 1 ? "" : "m"} hoje.`
    );
  }

  return partes.join(" ");
}

/**
 * A tabela inteira, com a âncora de hoje calculada uma vez.
 *
 * Devolve `hoje` junto porque a tela mostra a âncora como primeira linha: sem a
 * referência na mesma tabela, todo número vira solto.
 */
export function simularCenarios(
  diagrama: Diagrama,
  config: DiagramaConfig,
  cenarios: CenarioDeLentidao[],
  campoDeTempo: string = CAMPO_DE_TEMPO_PADRAO,
  volumetria?: VolumetriaDaDemanda
): { hoje: LeituraDoDesenho; resultados: ResultadoDoCenario[] } {
  const hoje = lerDesenho(diagrama, config, { campoDeTempo });
  return {
    hoje,
    resultados: cenarios.map((c) => simularCenario(diagrama, config, c, hoje, campoDeTempo, volumetria)),
  };
}

/**
 * SPEC-69 §4.3 — o ensaio assumido, pronto para VIAJAR.
 *
 * Um ensaio aceito é um débito consciente: alguém leu o número, disse "sabemos
 * e assumimos" e assinou o porquê. Até aqui isso morria na tela de Ensaios —
 * era o "botão que não levava a lugar nenhum" do §1 desta SPEC, uma casa
 * adiante.
 *
 * Esta forma é o que o documento e o item precisam ler, e nada além: o nome, a
 * conclusão derivada (§4.0.1) e a assinatura. Deliberadamente **sem** a leitura
 * inteira — quem lê o documento não vai reabrir a simulação, e carregar o
 * `ResultadoDoCenario` inteiro para dentro do markdown seria oferecer detalhe
 * onde se precisa de conclusão.
 */
export interface EnsaioAssumido {
  id: string;
  nome: string;
  /** A conclusão derivada. Ausente quando o desenho não deu número. */
  conclusao?: string;
  /** O porquê de quem assumiu — obrigatório para aceitar (§4.0). */
  motivo: string;
  autor?: string;
  /** ISO-8601. */
  em?: string;
  /** O que a pessoa escreveu sobre o CENÁRIO (conhecimento de mundo), não sobre
   * a conta. Ver a regra 3 do §4.0.1. */
  porque?: string;
}

/**
 * Os ensaios ACEITOS de uma quebra, já com a conclusão calculada.
 *
 * Um dono só para esta conta: a tela de Ensaios, o documento e o item leem a
 * mesma frase. Recalculá-la em cada lugar seria a segunda versão de uma
 * verdade — e ela divergiria em silêncio, porque duas frases parecidas sobre o
 * mesmo número não parecem um defeito ao lado uma da outra (§263).
 *
 * `aceito` e não "todos": o que ainda cobra pertence ao placar, não ao registro
 * — misturar os dois faria o documento afirmar que se assumiu algo que ninguém
 * olhou, que é o oposto do que esta SPEC existe para fazer.
 */
export function ensaiosAssumidos(
  diagrama: Diagrama,
  config: DiagramaConfig,
  cenarios: CenarioDeLentidao[],
  necessidades: { texto: string; limiteMs?: number }[] = [],
  campoDeTempo: string = CAMPO_DE_TEMPO_PADRAO,
  volumetria?: VolumetriaDaDemanda
): EnsaioAssumido[] {
  const aceitos = cenarios.filter((c) => estadoDoEnsaio(c) === "aceito");
  if (aceitos.length === 0) return [];
  const { hoje, resultados } = simularCenarios(diagrama, config, aceitos, campoDeTempo, volumetria);
  return aceitos.map((c, i) => ({
    id: c.id,
    nome: c.nome,
    conclusao: concluirEnsaio(resultados[i], hoje.tempoDoPiorTrecho?.ms, necessidades),
    // O motivo é exigido para aceitar; quebra gravada antes da máquina de
    // estados pode ter `aceito: true` sem `debito` — e aí a frase diz isso em
    // vez de inventar um porquê que ninguém escreveu (§57).
    motivo: c.debito?.motivo ?? "assumido antes de o motivo ser exigido",
    autor: c.debito?.autor,
    em: c.debito?.em,
    porque: c.porque,
  }));
}

/** Os ensaios que sustentam uma decisão, na ordem em que ela os anexou. */
export function ensaiosDaDecisao(
  decisao: { ensaioIds?: string[] },
  assumidos: EnsaioAssumido[]
): EnsaioAssumido[] {
  const porId = new Map(assumidos.map((e) => [e.id, e]));
  return (decisao.ensaioIds ?? []).map((id) => porId.get(id)).filter((e): e is EnsaioAssumido => e !== undefined);
}

/**
 * SPEC-69 §4.1 — o que um ensaio COBRA no placar.
 *
 * Esta é a inversão que dá nome à SPEC, e ela veio do usuário: **"na realidade
 * todo ensaio cobra."** O desenho anterior era o contrário — só o aceito
 * cobraria —, e estava errado pelo próprio propósito declarado: se só o que
 * alguém aceitou cobra, o débito que ninguém olhou continua invisível. E débito
 * que ninguém olhou é exatamente o inconsciente que esta SPEC existe para
 * acabar.
 *
 * Duas regras que o desenho impõe:
 *
 * 1. **"por avaliar" e "em revisão" cobram igual.** O que tira do placar é
 *    ACEITAR, não olhar — sair da cobrança por ter aberto a linha seria a
 *    fórmula de fazer as pessoas abrirem tudo sem ler.
 * 2. **Só o que o ensaio CRIA.** Contradição que já existe hoje é do desenho, e
 *    atribuí-la ao ensaio faria o placar contar duas vezes o mesmo problema — e
 *    pior, faria parecer condicional o que é atual.
 *
 * A marcação com o nome do ensaio não é enfeite: ela diz na própria frase que
 * aquilo é **condicional**, e é o que impede o placar de confundir *o que é*
 * com *o que seria* — a régua que a SPEC-65 traçou entre leitura e cobrança.
 */
export interface CobrancaDeEnsaio {
  ensaioId: string;
  nome: string;
  /** Uma frase por cobrança, já com o nome do ensaio implícito no agrupamento. */
  avisos: string[];
}

export function cobrancasDeEnsaio(
  diagrama: Diagrama,
  config: DiagramaConfig,
  cenarios: CenarioDeLentidao[],
  necessidades: { texto: string; limiteMs?: number }[] = [],
  campoDeTempo: string = CAMPO_DE_TEMPO_PADRAO,
  volumetria?: VolumetriaDaDemanda
): CobrancaDeEnsaio[] {
  const cobram = cenarios.filter(ensaioCobra);
  if (cobram.length === 0) return [];

  const hoje = lerDesenho(diagrama, config, { campoDeTempo });
  // A assinatura de uma contradição é o par elemento+tipo: o texto muda com os
  // números, e comparar por texto faria "já existia" virar "é novo" só porque
  // o valor mudou.
  //
  // SPEC-70 — com o volume da demanda, mas SEM o fator do ensaio: o que já é
  // verdade hoje é o desenho a 1× o volume. Incluir o pico aqui faria a
  // saturação que o pico cria parecer preexistente, e o ensaio deixaria de
  // acusar justamente o que ele revela.
  const jaExistia = new Set(
    avaliarResiliencia(diagrama, config, undefined, { volume: volumetria }).map(
      (c) => `${c.tipo}:${c.noId ?? c.arestaId ?? c.rotulo}`
    )
  );

  return cobram
    .map((c) => {
      const r = simularCenario(diagrama, config, c, hoje, campoDeTempo, volumetria);
      const avisos = r.contradicoes
        .filter((x) => !jaExistia.has(`${x.tipo}:${x.noId ?? x.arestaId ?? x.rotulo}`))
        .map((x) => `${x.rotulo}: ${x.esperado}, e ${x.atual}`);

      const prazo = prazoEstourado(r.ms, necessidades);
      if (prazo) {
        avisos.push(
          `a resposta vai a ${formatarDuracao(r.ms!)} — acima do prazo de ${formatarDuracao(
            prazo.limiteMs
          )} de "${prazo.texto}"`
        );
      }
      return { ensaioId: c.id, nome: c.nome, avisos };
    })
    // Ensaio que não cria nada não cobra nada: uma linha vazia no placar seria
    // ruído com aparência de problema.
    .filter((c) => c.avisos.length > 0);
}

/**
 * §305 — o que FALTA para este desenho poder ser ensaiado.
 *
 * ## O defeito que isto fecha
 *
 * A SPEC-66 escreveu uma guarda para o §248 — *"sem número declarado não há o
 * que ensaiar, e dizer isso é melhor do que uma tabela de zeros que parece uma
 * medição"* — e a guarda testava `tempoDoPiorTrecho === undefined`.
 *
 * Só que um desenho com conexões que ESPERAM e nenhum número declarado devolve
 * `ms: 0`, e não `undefined`. A guarda nunca disparava no caso que existe de
 * verdade: medido, a bancada mostrava "hoje ≥ 0 ms" e um ensaio concluindo "a
 * resposta fica em 0 ms" — exatamente a tabela de zeros que ela existia para
 * impedir.
 *
 * A pergunta certa não é "o motor devolveu alguma coisa?", é **"há número para
 * somar?"**.
 *
 * ## Por que devolve os ELEMENTOS, e não só um motivo
 *
 * §57 — dizer "falta preencher" sem dizer ONDE transfere a busca para quem já
 * não sabia o que procurar. Com a lista, a mesma frase que barra a porta é a
 * que leva ao campo.
 *
 * `undefined` = dá para ensaiar. Um dono só desta resposta: a porta e a
 * bancada precisam concordar, e duas versões desta conta divergiriam na
 * primeira mudança (§263).
 */
export interface FaltaParaEnsaiar {
  /** A frase pronta, na voz do produto. */
  motivo: string;
  /** Onde preencher. Vazia quando não há nem onde — o desenho é todo assíncrono. */
  ondePreencher: ElementoAjustavel[];
}

export function faltaParaEnsaiar(
  diagrama: Diagrama,
  config: DiagramaConfig,
  campoDeTempo: string = CAMPO_DE_TEMPO_PADRAO
): FaltaParaEnsaiar | undefined {
  const ajustaveis = elementosComTempo(diagrama, config, campoDeTempo);

  // Nem lugar para o número existir: um desenho só de mensageria não tem o que
  // ser ensaiado em tempo, e isso não é um erro de preenchimento — é o desenho.
  if (ajustaveis.length === 0) {
    return {
      motivo:
        "Nenhum componente deste desenho declara tempo de resposta — não há o que somar. Ligue uma chamada que espera resposta e volte.",
      ondePreencher: [],
    };
  }

  const preenchidos = ajustaveis.filter((e) => e.msAtual !== undefined && e.msAtual > 0);
  if (preenchidos.length === 0) {
    return {
      motivo:
        "Nenhum componente tem o tempo preenchido, então o ensaio partiria de zero — e zero não é uma medição.",
      ondePreencher: ajustaveis,
    };
  }

  return undefined;
}

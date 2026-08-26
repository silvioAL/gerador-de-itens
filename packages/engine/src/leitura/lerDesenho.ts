import type { DiagramaConfig } from "../config/types.js";
import type { Aresta, Diagrama, LeituraDispensada, No, Percurso } from "../model/types.js";
import { inferirPercursos } from "../percurso/percursos.js";

/**
 * SPEC-65 fatias A e B — o desenho lido em voz alta.
 *
 * ## O que isto NÃO é
 *
 * Não é régua. A SPEC-63 §1 traçou a linha que impede este produto de virar um
 * linter de grafo, e ela continua valendo. A diferença é de natureza:
 *
 * > **Uma régua diz "isto está errado". Uma leitura diz "isto é o que você
 * > desenhou".**
 *
 * Por isso nada aqui entra no placar ⚖, bloqueia derivação, vira item de
 * backlog ou pede exceção com motivo — não há o que excepcionar num fato. E por
 * isso nada aqui depende de config de regras nem de caminho **confirmado**: o
 * relato foi *"precisa aparecer sem precisar abrir e especificar tudo"*, e uma
 * leitura que exige preparo não é uma leitura, é mais um formulário.
 *
 * ## A ligação que organiza o arquivo
 *
 * Tempo e sincronia não são duas perguntas: **são a mesma**. O timeout de uma
 * chamada só entra na conta da resposta se quem chamou estiver esperando — quem
 * publica numa fila não espera, e a soma para ali. Medir tempo sem saber o que
 * espera produziria o pior resultado possível: um número grande e confiante
 * sobre uma cadeia que na verdade responde na hora.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

/** O nome do campo de duração é CONVENÇÃO da config padrão, não hardcode: quem
 * chama passa o seu. `timeoutMs` é o que `http`, `grpc` e `external` usam. */
export const CAMPO_DE_TEMPO_PADRAO = "timeoutMs";

export interface ElementoDaLeitura {
  tipo: "no" | "aresta";
  id: string;
  rotulo: string;
}

/**
 * O tempo de um trecho que espera do início ao fim.
 *
 * `completo: false` é o §248 aplicado aqui: se um elemento declara o campo e
 * não o preencheu, a soma é **piso**, nunca total. Um número que parece
 * completo sem ser é um verde falso, que é o pior resultado de uma medição.
 */
export interface TempoDoTrecho {
  percursoId: string;
  rotulo: string;
  ms: number;
  completo: boolean;
  /** Quem declarou o campo e não respondeu — o endereço de como fechar a conta. */
  semValor: ElementoDaLeitura[];
  /** Quantos elementos entraram na soma; sem isto "0 ms" é ambíguo. */
  contribuintes: number;
}

export interface FanOutQueEspera {
  noId: string;
  rotulo: string;
  /** As chamadas que esperam saindo daqui — a resposta é a soma delas. */
  chamadas: ElementoDaLeitura[];
}

export interface CadeiaQueEspera {
  percursoId: string;
  rotulo: string;
  /** Saltos que esperam — a disponibilidade é o produto deles. */
  saltos: number;
  /** O nó do fim da cadeia, que é o endereço para onde olhar. */
  fim: ElementoDaLeitura;
  /** SPEC-65 fatia C — as conexões a acender no canvas. A leitura vira
   * visível NA FIGURA, que é onde a pessoa está olhando. */
  arestasIds: string[];
  /** O começo da cadeia — é dele que a marca no canvas pendura. */
  inicioNoId: string;
}

export interface TerceiroNoCaminho {
  noId: string;
  rotulo: string;
  /** Por onde a resposta depende dele. */
  atravesDe: string;
}

export interface LeituraDoDesenho {
  /** O trecho que espera mais demorado — o "pior caso" da resposta. */
  tempoDoPiorTrecho?: TempoDoTrecho;
  /** Todos os trechos com tempo, do mais lento ao mais rápido. */
  tempos: TempoDoTrecho[];
  fanOut: FanOutQueEspera[];
  cadeiaMaisFunda?: CadeiaQueEspera;
  terceiros: TerceiroNoCaminho[];
  /**
   * §57 — os tipos de conexão sem `espera` declarado, que ficaram de fora.
   * Leitura que ignorou parte do desenho sem dizer é pior que leitura nenhuma.
   */
  conexoesNaoClassificadas: { tipo: string; quantas: number }[];
}

export interface LimiaresDaLeitura {
  /** A partir de quantas chamadas que esperam o fan-out é dizível. Dois já é a
   * propriedade — a soma começa no segundo. */
  fanOutMinimo?: number;
  /** A partir de quantos saltos a cadeia é dizível. */
  saltosMinimos?: number;
  campoDeTempo?: string;
}

function numeroDe(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

function rotuloDoNo(no: No | undefined, id: string): string {
  return no?.label?.trim() || id;
}

/**
 * Esta conexão espera resposta?
 *
 * A INSTÂNCIA manda sobre o tipo. `consumes` traz um campo `sincrono` desde a
 * SPEC-21, e uma pessoa que o respondeu disse algo mais específico do que o
 * padrão do tipo sabe — ignorá-la seria descartar o dado mais confiável que
 * existe sobre aquela conexão.
 *
 * `undefined` = não se sabe, e quem chama trata isso como lacuna, não como não.
 */
export function arestaEspera(aresta: Aresta, config: DiagramaConfig): boolean | undefined {
  const daInstancia = aresta.spec?.sincrono?.valor;
  if (typeof daInstancia === "boolean") return daInstancia;
  return config.edgeTypes[aresta.type]?.espera;
}

function declaraTempo(
  elemento: { spec?: unknown; type: string },
  specDoTipo: { key: string }[] | undefined,
  campo: string
): boolean {
  return (specDoTipo ?? []).some((c) => c.key === campo);
}

/**
 * Quebra o caminho nos trechos CONTÍNUOS que esperam.
 *
 * Um caminho `api →http→ srv →publica→ fila →consome→ worker` tem um trecho que
 * espera (`api → srv`) e para ali: quem publica não espera, então o tempo do
 * worker não é sentido por quem chamou. Somar o caminho inteiro daria um número
 * que ninguém experimenta.
 */
function trechosQueEsperam(
  percurso: Percurso,
  diagrama: Diagrama,
  config: DiagramaConfig
): { nos: string[]; arestas: Aresta[] }[] {
  const trechos: { nos: string[]; arestas: Aresta[] }[] = [];
  let atual: { nos: string[]; arestas: Aresta[] } | null = null;

  for (let i = 0; i < percurso.nos.length - 1; i++) {
    const de = percurso.nos[i];
    const para = percurso.nos[i + 1];
    const aresta = diagrama.edges.find((e) => e.source === de && e.target === para);
    if (aresta && arestaEspera(aresta, config) === true) {
      if (!atual) atual = { nos: [de], arestas: [] };
      atual.nos.push(para);
      atual.arestas.push(aresta);
    } else if (atual) {
      trechos.push(atual);
      atual = null;
    }
  }
  if (atual) trechos.push(atual);
  return trechos;
}

function somarTempo(
  trecho: { nos: string[]; arestas: Aresta[] },
  diagrama: Diagrama,
  config: DiagramaConfig,
  campo: string
): { ms: number; semValor: ElementoDaLeitura[]; contribuintes: number } {
  const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));
  let ms = 0;
  let contribuintes = 0;
  const semValor: ElementoDaLeitura[] = [];

  for (const id of trecho.nos) {
    const no = porId.get(id);
    if (!no || !declaraTempo(no, config.nodeTypes[no.type]?.spec, campo)) continue;
    contribuintes++;
    const valor = numeroDe(no.spec[campo]?.valor);
    if (valor === undefined) semValor.push({ tipo: "no", id, rotulo: rotuloDoNo(no, id) });
    else ms += valor;
  }

  for (const aresta of trecho.arestas) {
    if (!declaraTempo(aresta, config.edgeTypes[aresta.type]?.spec, campo)) continue;
    contribuintes++;
    const valor = numeroDe(aresta.spec?.[campo]?.valor);
    const rotulo = `${rotuloDoNo(porId.get(aresta.source), aresta.source)} → ${rotuloDoNo(
      porId.get(aresta.target),
      aresta.target
    )}`;
    if (valor === undefined) semValor.push({ tipo: "aresta", id: aresta.id, rotulo });
    else ms += valor;
  }

  return { ms, semValor, contribuintes };
}

export function lerDesenho(
  diagrama: Diagrama,
  config: DiagramaConfig,
  limiares: LimiaresDaLeitura = {}
): LeituraDoDesenho {
  const fanOutMinimo = limiares.fanOutMinimo ?? 2;
  const saltosMinimos = limiares.saltosMinimos ?? 3;
  const campo = limiares.campoDeTempo ?? CAMPO_DE_TEMPO_PADRAO;
  const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));

  // Sem confirmar nada: a leitura roda sobre o que o desenho produz AGORA.
  const { percursos } = inferirPercursos(diagrama);

  const tempos: TempoDoTrecho[] = [];
  let cadeiaMaisFunda: CadeiaQueEspera | undefined;
  const terceirosVistos = new Map<string, TerceiroNoCaminho>();

  for (const percurso of percursos) {
    for (const trecho of trechosQueEsperam(percurso, diagrama, config)) {
      const { ms, semValor, contribuintes } = somarTempo(trecho, diagrama, config, campo);
      const rotulo = trecho.nos.map((id) => rotuloDoNo(porId.get(id), id)).join(" → ");
      if (contribuintes > 0) {
        tempos.push({
          percursoId: percurso.id,
          rotulo,
          ms,
          completo: semValor.length === 0,
          semValor,
          contribuintes,
        });
      }

      const saltos = trecho.arestas.length;
      if (saltos >= saltosMinimos && saltos > (cadeiaMaisFunda?.saltos ?? 0)) {
        const ultimoId = trecho.nos[trecho.nos.length - 1];
        cadeiaMaisFunda = {
          percursoId: percurso.id,
          rotulo,
          saltos,
          fim: { tipo: "no", id: ultimoId, rotulo: rotuloDoNo(porId.get(ultimoId), ultimoId) },
          arestasIds: trecho.arestas.map((a) => a.id),
          inicioNoId: trecho.nos[0],
        };
      }

      // Terceiro: só conta quando está DENTRO de um trecho que espera. Um
      // sistema externo alimentado por fila não segura a resposta de ninguém.
      for (const id of trecho.nos) {
        const no = porId.get(id);
        if (!no || config.nodeTypes[no.type]?.derives !== "external") continue;
        if (!terceirosVistos.has(id)) {
          terceirosVistos.set(id, { noId: id, rotulo: rotuloDoNo(no, id), atravesDe: rotulo });
        }
      }
    }
  }

  tempos.sort((a, b) => b.ms - a.ms);

  const fanOut: FanOutQueEspera[] = [];
  for (const no of diagrama.nodes) {
    const chamadas = diagrama.edges
      .filter((e) => e.source === no.id && e.target !== no.id && arestaEspera(e, config) === true)
      .map((e) => ({
        tipo: "aresta" as const,
        id: e.id,
        rotulo: `${rotuloDoNo(no, no.id)} → ${rotuloDoNo(porId.get(e.target), e.target)}`,
      }));
    if (chamadas.length >= fanOutMinimo) {
      fanOut.push({ noId: no.id, rotulo: rotuloDoNo(no, no.id), chamadas });
    }
  }
  fanOut.sort((a, b) => b.chamadas.length - a.chamadas.length);

  // A lacuna que se declara: tipo usado no desenho sem `espera` no config.
  const naoClassificadas = new Map<string, number>();
  for (const e of diagrama.edges) {
    if (arestaEspera(e, config) !== undefined) continue;
    naoClassificadas.set(e.type, (naoClassificadas.get(e.type) ?? 0) + 1);
  }

  return {
    tempoDoPiorTrecho: tempos[0],
    tempos,
    fanOut,
    cadeiaMaisFunda,
    terceiros: [...terceirosVistos.values()],
    conexoesNaoClassificadas: [...naoClassificadas.entries()].map(([tipo, quantas]) => ({ tipo, quantas })),
  };
}

/** "1,2 s" / "350 ms" — o número que a pessoa lê no chip, sem abrir nada. */
export function formatarDuracao(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  // Uma casa até 10 s; acima disso a fração não informa nada.
  return s < 10 ? `${s.toFixed(1).replace(".", ",")} s` : `${Math.round(s)} s`;
}

/**
 * A frase do chip — o que a pessoa lê **sem abrir nada**.
 *
 * Medido no cenário `credito-completo`: nenhum `timeoutMs` está preenchido, e
 * é o estado normal de quem acabou de desenhar. Um chip que só soubesse falar
 * de milissegundos ficaria mudo exatamente para a pessoa que a SPEC existe para
 * atender. Então a frase **degrada**, sempre dizendo o que sabe:
 *
 * - com os números: `"até 1,2 s de resposta"`;
 * - com números pela metade: `"≥ 300 ms · 2 por preencher"` — o `≥` é o §248
 *   na largura de um caractere: a soma é piso, e a frase não deixa lê-la como
 *   total;
 * - sem número nenhum: `"4 saltos que esperam"` — a estrutura já é fato, e
 *   fato é o que esta leitura serve.
 *
 * `undefined` = não há o que dizer, e aí o chip **não existe**. Chip que
 * aparece sempre vira moldura: some da vista junto com o que ele deveria
 * mostrar.
 */
export function resumirLeitura(leitura: LeituraDoDesenho): string | undefined {
  const t = leitura.tempoDoPiorTrecho;
  if (t && t.ms > 0) {
    const base = t.completo ? `até ${formatarDuracao(t.ms)} de resposta` : `≥ ${formatarDuracao(t.ms)} de resposta`;
    return t.completo ? base : `${base} · ${t.semValor.length} por preencher`;
  }
  if (leitura.cadeiaMaisFunda) return `${leitura.cadeiaMaisFunda.saltos} saltos que esperam`;
  if (leitura.fanOut.length > 0) {
    const maior = leitura.fanOut[0];
    return `${maior.chamadas.length} chamadas antes de responder`;
  }
  return undefined;
}

/** SPEC-65 fatia C — o que uma marca no canvas precisa saber. */
export interface MarcaDaLeitura {
  noId: string;
  /** O número que se lê no nó: chamadas, ou saltos. */
  numero: number;
  /** A frase do tooltip — o número sozinho não ensina nada. */
  titulo: string;
  /** As conexões a acender quando se olha para a marca. */
  arestasIds: string[];
  /** A chave da dispensa, estável por (nó, tipo de leitura). */
  tipo: "fan-out" | "cadeia";
}

/**
 * As marcas por nó, prontas para o canvas.
 *
 * **Uma marca por nó, nunca duas.** Um nó pode ser fan-out E começo da cadeia
 * mais funda; duas marcas no mesmo canto viram enfeite, e enfeite é o que se
 * para de ver. Quando os dois coincidem, o fan-out ganha: ele é sobre o nó em
 * si ("este componente faz N chamadas"), enquanto a cadeia é sobre o caminho
 * que passa por ele — e o canto de um nó fala do nó.
 */
export function marcasPorNo(
  leitura: LeituraDoDesenho,
  dispensadas: LeituraDispensada[] = []
): MarcaDaLeitura[] {
  const marcas = new Map<string, MarcaDaLeitura>();

  if (leitura.cadeiaMaisFunda) {
    const c = leitura.cadeiaMaisFunda;
    marcas.set(c.inicioNoId, {
      noId: c.inicioNoId,
      numero: c.saltos,
      titulo: `${c.saltos} saltos que esperam até ${c.fim.rotulo} — o tempo é a soma deles, e a disponibilidade é o produto deles`,
      arestasIds: c.arestasIds,
      tipo: "cadeia",
    });
  }

  for (const f of leitura.fanOut) {
    marcas.set(f.noId, {
      noId: f.noId,
      numero: f.chamadas.length,
      titulo: `${f.chamadas.length} chamadas que esperam antes de responder — a resposta é a soma delas, e qualquer uma que falhe derruba as outras`,
      arestasIds: f.chamadas.map((c) => c.id),
      tipo: "fan-out",
    });
  }

  // A dispensa é por PAR (nó, tipo). Filtrar no fim, e não na hora de montar,
  // mantém a regra de "uma marca por nó" valendo antes de qualquer silêncio:
  // do contrário, dispensar o fan-out faria a cadeia reaparecer no mesmo canto
  // como se fosse a mesma marca voltando.
  const calada = (m: MarcaDaLeitura) => dispensadas.some((d) => d.noId === m.noId && d.tipo === m.tipo);
  return [...marcas.values()].filter((m) => !calada(m));
}

/**
 * As dispensas que ainda dizem respeito ao desenho de agora.
 *
 * §283 aplicado aqui: dispensa de uma leitura que não existe mais não deve
 * aparecer na lista de "caladas" — ela não está calando nada. E some sozinha,
 * sem exigir limpeza: o registro fica na quebra, mas a tela só mostra o que
 * tem efeito.
 */
export function dispensasComEfeito(
  leitura: LeituraDoDesenho,
  dispensadas: LeituraDispensada[] = []
): { dispensa: LeituraDispensada; marca: MarcaDaLeitura }[] {
  const vivas = new Map(marcasPorNo(leitura).map((m) => [`${m.noId}::${m.tipo}`, m]));
  return dispensadas
    .map((d) => ({ dispensa: d, marca: vivas.get(`${d.noId}::${d.tipo}`) }))
    .filter((x): x is { dispensa: LeituraDispensada; marca: MarcaDaLeitura } => x.marca !== undefined);
}

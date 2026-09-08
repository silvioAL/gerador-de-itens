/**
 * SPEC-110 fatia E (D7) — **o relógio, em cinco campos.**
 *
 * *"senti falta de componente scheduler para outros desenhos"*. O gatilho de
 * agendamento precisa de uma expressão que diga QUANDO, e cron de 5 campos é
 * a notação que quem opera já conhece — inventar outra seria ensinar duas.
 *
 * ## Por que um parser próprio, e o que ele NÃO faz
 *
 * A SPEC deixou a escolha em aberto ("parser próprio e pequeno ou dependência
 * mínima"). Próprio, e a razão é o tamanho do que precisamos: minuto, hora,
 * dia, mês, dia-da-semana, com `*`, número, lista (`1,15`), intervalo (`1-5`)
 * e passo (`*&#47;15`). Uma dependência traria fuso horário, segundos,
 * `@yearly`, `L`/`W`/`#` — superfície que ninguém pediu e que teria de ser
 * mantida na cabeça de quem lê o painel.
 *
 * **Os limites, ditos em voz alta** (§2.4-6 — o implícito documentado):
 * - **UTC**, sempre. Fuso por time é decisão de produto que ninguém tomou, e
 *   um default silencioso (o do servidor) faria "todo dia às 9h" significar
 *   coisas diferentes conforme a máquina.
 * - Sem segundos: o tick é de 30s, e prometer precisão que o runner não tem
 *   seria mentir.
 * - Sem `@atalhos`, sem `L`/`W`/`#`, sem nomes de mês/dia ("JAN", "MON").
 * - Dia-do-mês e dia-da-semana com AND, não com o OR do cron clássico: o OR
 *   é a regra que mais surpreende quem escreve, e aqui a expressão é editada
 *   num painel por quem não vai ler man page.
 */

export interface CampoDeCron {
  min: number;
  max: number;
  nome: string;
}

const CAMPOS: CampoDeCron[] = [
  { min: 0, max: 59, nome: "minuto" },
  { min: 0, max: 23, nome: "hora" },
  { min: 1, max: 31, nome: "dia do mês" },
  { min: 1, max: 12, nome: "mês" },
  { min: 0, max: 6, nome: "dia da semana (0=domingo)" },
];

/** Os valores que um campo aceita, ou a mensagem do problema. */
function valoresDoCampo(texto: string, campo: CampoDeCron): { valores: Set<number> } | { erro: string } {
  const valores = new Set<number>();
  for (const parte of texto.split(",")) {
    const [faixa, passoTexto] = parte.split("/");
    const passo = passoTexto === undefined ? 1 : Number(passoTexto);
    if (!Number.isInteger(passo) || passo < 1) {
      return { erro: `o passo "${passoTexto}" no campo ${campo.nome} precisa ser um número inteiro maior que zero` };
    }
    let de: number;
    let ate: number;
    if (faixa === "*") {
      de = campo.min;
      ate = campo.max;
    } else if (faixa.includes("-")) {
      const [a, b] = faixa.split("-").map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return { erro: `"${faixa}" não é um intervalo do campo ${campo.nome}` };
      de = a;
      ate = b;
    } else {
      const n = Number(faixa);
      if (!Number.isInteger(n)) return { erro: `"${faixa}" não é um número do campo ${campo.nome}` };
      de = n;
      ate = n;
    }
    if (de < campo.min || ate > campo.max || de > ate) {
      return { erro: `"${parte}" está fora da faixa do campo ${campo.nome} (${campo.min}-${campo.max})` };
    }
    for (let v = de; v <= ate; v += passo) valores.add(v);
  }
  return { valores };
}

export interface CronAnalisado {
  minutos: Set<number>;
  horas: Set<number>;
  diasDoMes: Set<number>;
  meses: Set<number>;
  diasDaSemana: Set<number>;
}

/** `null` quando a expressão não vale — e a razão vem em `problemaNoCron`. */
export function analisarCron(expressao: string): CronAnalisado | null {
  return problemaNoCron(expressao) === null ? (montarCron(expressao) as CronAnalisado) : null;
}

function montarCron(expressao: string): CronAnalisado | string {
  const partes = expressao.trim().split(/\s+/);
  if (partes.length !== 5) {
    return `a expressão precisa ter 5 campos (minuto hora dia mês dia-da-semana) — veio ${partes.length}`;
  }
  const conjuntos: Set<number>[] = [];
  for (const [i, campo] of CAMPOS.entries()) {
    const r = valoresDoCampo(partes[i], campo);
    if ("erro" in r) return r.erro;
    if (r.valores.size === 0) return `o campo ${campo.nome} não aceita nenhum valor`;
    conjuntos.push(r.valores);
  }
  return {
    minutos: conjuntos[0],
    horas: conjuntos[1],
    diasDoMes: conjuntos[2],
    meses: conjuntos[3],
    diasDaSemana: conjuntos[4],
  };
}

/** A mensagem do problema, ou `null`. É o que a escrita e o painel mostram. */
export function problemaNoCron(expressao: string): string | null {
  if (typeof expressao !== "string" || !expressao.trim()) return "a expressão de agendamento está vazia";
  const r = montarCron(expressao);
  return typeof r === "string" ? r : null;
}

/**
 * **A próxima ocorrência DEPOIS de `desde`**, em UTC.
 *
 * Varre minuto a minuto a partir do próximo — força bruta de propósito: o teto
 * é ~4 anos de minutos, e a alternativa (aritmética de calendário por campo) é
 * onde os parsers de cron guardam os bugs de fevereiro. Com o teto, uma
 * expressão impossível (31 de fevereiro) devolve `null` em vez de girar.
 */
export function proximaOcorrencia(expressao: string, desde: Date): Date | null {
  const cron = analisarCron(expressao);
  if (!cron) return null;

  const t = new Date(desde.getTime());
  // Do PRÓXIMO minuto cheio: "agora" nunca é a próxima ocorrência, senão um
  // tick no minuto exato re-dispararia o mesmo agendamento.
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);

  // 4 anos em minutos: cobre 29 de fevereiro (o único ciclo longo que os
  // nossos cinco campos alcançam) e ainda para em vez de girar para sempre.
  const TETO = 4 * 366 * 24 * 60;
  for (let i = 0; i < TETO; i++) {
    if (
      cron.minutos.has(t.getUTCMinutes()) &&
      cron.horas.has(t.getUTCHours()) &&
      cron.diasDoMes.has(t.getUTCDate()) &&
      cron.meses.has(t.getUTCMonth() + 1) &&
      cron.diasDaSemana.has(t.getUTCDay())
    ) {
      return t;
    }
    t.setUTCMinutes(t.getUTCMinutes() + 1);
  }
  return null;
}

/** A próxima ocorrência em português, para o painel dizer o que vai acontecer
 * — uma expressão de cron sozinha não é resposta para quem a escreveu. */
export function proximaOcorrenciaLegivel(expressao: string, desde: Date): string {
  const problema = problemaNoCron(expressao);
  if (problema) return problema;
  const proxima = proximaOcorrencia(expressao, desde);
  if (!proxima) return "esta expressão nunca acontece (confira o dia e o mês)";
  return `${proxima.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

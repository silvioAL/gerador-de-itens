import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type {
  Atividade,
  Decisao,
  Diagrama,
  ExcecaoDePadrao,
  Necessidade,
  Percurso,
} from "../model/types.js";
import { analisarLacunas, necessidadesDoElemento } from "../proposito/lacunas.js";
import { avaliarConformidade, violacoesAceitas, violacoesEmAberto, type Violacao } from "../conformidade/conformidade.js";
import { decisoesDoElemento, decisoesVigentes, excecoesComoDecisoes, propostasPendentes } from "../decisao/decisoes.js";
import { avaliarPercursos, type PercursoNaoMedido, type ViolacaoDePercurso } from "../percurso/conformidadeDePercurso.js";
import { percursoConta, percursosQueContam } from "../percurso/percursos.js";

/**
 * SPEC-58 — o DOCUMENTO DE DESENHO, como estrutura.
 *
 * ## Por que uma estrutura, e não só o markdown que já existe
 *
 * O documento passa a ter três saídas: a tela (`#/documento`), um HTML
 * autocontido que circula, e o markdown de sempre. A SPEC-58 §7.3 fixou a
 * régua que impede as três de divergirem: **elas partem da mesma estrutura**.
 * Três montagens paralelas divergem na primeira mudança, e o jeito de
 * descobrir é alguém reclamar que o arquivo exportado não tem o que a tela
 * tinha.
 *
 * ## O limite honesto desta função
 *
 * O markdown continua sendo produzido por `gerarEspecificacaoEntrega`, que é
 * dirigido por TEMPLATE configurável (SPEC-47) — e template configurável é
 * texto, não estrutura. Então a régua vale para tela e HTML, que saem daqui, e
 * o markdown permanece a renderização textual canônica. Um teste de guarda
 * afirma que os dois carregam os mesmos fatos; é o que se pode prometer sem
 * quebrar o template do time.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

export type NivelSaude = "verde" | "amarelo" | "vermelho";

/**
 * SPEC-61 §4 — de que LADO da faixa o chip mora.
 *
 * A faixa tinha os três chips com o mesmo peso visual, separados só pela cor:
 * `🎯 1 necessidade sem componente` e `⚖ 1 fora do padrão` **cobram ação**,
 * `🧭 1 decisão(ões)` é **contagem**. Ler a diferença exigia decodificar a cor
 * de cada um, um a um.
 *
 * A régua que decide o lado: **está em `atencao` o que alguém precisa
 * resolver, em `jaTem` o que já foi resolvido.** Nada de cor nova — o que muda
 * é onde a coisa está, e lugar comunica antes de cor.
 */
export type LadoDaSaude = "atencao" | "jaTem";

/** Um chip da faixa de saúde — o mesmo vocabulário do placar da mesa. */
export interface IndicadorDeSaude {
  /** O emoji do placar: quem viu a mesa reconhece sem legenda. */
  icone: string;
  rotulo: string;
  nivel: NivelSaude;
  lado: LadoDaSaude;
}

export interface ItemDoDocumento {
  numero: number;
  chave: string;
  rotulo: string;
  descricao: string;
  tipo: Atividade["tipo"];
  tamanho: Atividade["tamanho"];
  techs: string[];
  contextos: string[];
  timesEnvolvidos?: string[];
  /** Textos das necessidades que este item atende. */
  necessidades: string[];
  /**
   * SPEC-58 §4 — só os TÍTULOS das decisões. O corpo (alternativas, porquê)
   * vive uma vez no topo do documento; repeti-lo em cada item foi tratar o
   * documento como export, e num texto que alguém lê do começo ao fim isso é
   * ruído que faz pular seção.
   */
  decisoes: string[];
  /** Rótulos dos caminhos de que o elemento deste item participa. */
  percursos: string[];
}

export interface DocumentoDeDesenho {
  titulo: string;
  /** `demandInfo` + produto + times, como já vai para o markdown. */
  contexto: string;
  /**
   * SPEC-61 §3 — o desenho, para a seção que o mostra como FIGURA.
   *
   * Vem daqui, e não como uma segunda prop da tela, pela mesma razão do §7.3
   * da SPEC-58: o que o documento mostra sai de uma estrutura só. Duas
   * entradas paralelas para "o documento" e "o desenho do documento"
   * divergiriam na primeira vez que alguém passasse a quebra numa e a foto
   * noutra.
   */
  diagrama: Diagrama;
  /** A faixa do topo: o estado do desenho em dois segundos. */
  saude: IndicadorDeSaude[];
  necessidades: { texto: string; atendida: boolean }[];
  /** Vigentes + as exceções lidas como decisão (§242). Uma vez, no topo. */
  decisoes: Decisao[];
  conferencias: {
    violacoes: Violacao[];
    aceitas: Violacao[];
    percursos: Percurso[];
    violacoesDePercurso: ViolacaoDePercurso[];
    naoMedidos: PercursoNaoMedido[];
  };
  itens: ItemDoDocumento[];
}

export interface OpcoesEstruturarDocumento {
  titulo?: string;
  demandInfo?: string;
  contextoDoProduto?: string;
  time?: string;
  regras?: RegrasConfig;
  necessidades?: Necessidade[];
  decisoes?: Decisao[];
  excecoes?: ExcecaoDePadrao[];
  percursos?: Percurso[];
}

/**
 * A faixa de saúde é montada dentro de `estruturarDocumento`, e uma dimensão só
 * aparece quando é USADA — mesma disciplina do placar (§230, §239): a régua
 * nova não acusa quem nunca a usou, e um documento cheio de indicador zerado
 * ensina a ignorar todos eles.
 */
export function estruturarDocumento(
  atividades: Atividade[],
  diagrama: Diagrama,
  config: DiagramaConfig,
  opcoes: OpcoesEstruturarDocumento = {}
): DocumentoDeDesenho {
  const necessidades = opcoes.necessidades ?? [];
  const lacunas = analisarLacunas(diagrama, necessidades);
  const todasViolacoes = avaliarConformidade(diagrama, config, opcoes.regras, opcoes.excecoes ?? []);
  const violacoes = violacoesEmAberto(todasViolacoes);
  const aceitas = violacoesAceitas(todasViolacoes);
  const percursos = percursosQueContam(opcoes.percursos ?? []);
  const { violacoes: violacoesDePercurso, naoMedidos } = avaliarPercursos(diagrama, config, percursos, opcoes.regras);
  const decisoes = [...decisoesVigentes(opcoes.decisoes ?? []), ...excecoesComoDecisoes(opcoes.excecoes)];

  const propostas = propostasPendentes(opcoes.decisoes ?? []).length;
  /**
   * §261 — o caminho que o motor inferiu e que ninguém olhou ainda. Recusado
   * (`confirmado === false`) fica de fora: a pessoa já resolveu, dizendo que
   * aquilo não é caminho. É trabalho de uma pessoa que ninguém fez, e por isso
   * fica do lado que cobra.
   */
  const percursosAConfirmar = (opcoes.percursos ?? []).filter(
    (p) => !percursoConta(p) && p.confirmado === undefined
  ).length;

  const saude: IndicadorDeSaude[] = [];
  const pedeAtencao = (icone: string, rotulo: string) =>
    saude.push({ icone, rotulo, nivel: "amarelo", lado: "atencao" });
  const jaTem = (icone: string, rotulo: string) => saude.push({ icone, rotulo, nivel: "verde", lado: "jaTem" });

  if (necessidades.length > 0) {
    const cobertas = necessidades.length - lacunas.semElemento.length;
    if (lacunas.semElemento.length > 0)
      pedeAtencao("🎯", `${lacunas.semElemento.length} necessidade(s) sem componente`);
    if (cobertas > 0) jaTem("🎯", `${cobertas} necessidade(s) coberta(s)`);
  }
  if ((opcoes.regras?.porTech && Object.keys(opcoes.regras.porTech).length > 0) || violacoes.length + aceitas.length > 0) {
    if (violacoes.length > 0) pedeAtencao("⚖", `${violacoes.length} fora do padrão`);
    // A exceção aceita não é uma violação menor: é uma escolha registrada com
    // motivo. Somá-la ao vermelho apagaria justamente o que ela tem de bom.
    if (aceitas.length > 0) jaTem("⚖", `${aceitas.length} exceção(ões) aceita(s)`);
    if (violacoes.length + aceitas.length === 0) jaTem("⚖", "dentro do padrão");
  }
  if (percursos.length > 0 || percursosAConfirmar > 0) {
    // Três chips e não um em cascata: "fora do padrão", "sem medir" e "a
    // confirmar" são três trabalhos DIFERENTES, e a cascata escondia dois
    // deles atrás do primeiro. Cabem porque agora há um lado só para o que
    // cobra — era a mistura com o inventário que fazia a faixa ficar longa.
    if (violacoesDePercurso.length > 0) pedeAtencao("🛣", `${violacoesDePercurso.length} caminho(s) fora do padrão`);
    if (naoMedidos.length > 0) pedeAtencao("🛣", `${naoMedidos.length} caminho(s) sem medir`);
    if (percursosAConfirmar > 0) pedeAtencao("🛣", `${percursosAConfirmar} caminho(s) a confirmar`);
    if (percursos.length > 0) jaTem("🛣", `${percursos.length} caminho(s) confirmado(s)`);
  }
  if (decisoes.length > 0 || propostas > 0) {
    const semPorque = decisoes.filter((d) => !d.porque.trim()).length;
    if (propostas > 0) pedeAtencao("🧭", `${propostas} proposta(s) esperando`);
    if (semPorque > 0) pedeAtencao("🧭", `${semPorque} decisão(ões) sem porquê`);
    if (decisoes.length > 0) jaTem("🧭", `${decisoes.length} decisão(ões) vigente(s)`);
  }

  const partesContexto: string[] = [];
  if (opcoes.contextoDoProduto?.trim()) partesContexto.push(opcoes.contextoDoProduto.trim());
  if (opcoes.demandInfo?.trim()) partesContexto.push(opcoes.demandInfo.trim());

  const itens: ItemDoDocumento[] = atividades.map((a, i) => {
    const elemento = a.origem.nodeId ?? a.origem.edgeId;
    return {
      numero: i + 1,
      chave: a.chave,
      rotulo: a.rotulo,
      descricao: a.descricao,
      tipo: a.tipo,
      tamanho: a.tamanho,
      techs: a.techs,
      contextos: a.contextos,
      timesEnvolvidos: a.timesEnvolvidos,
      necessidades: [
        ...necessidadesDoElemento(a.origem.nodeId, necessidades),
        ...necessidadesDoElemento(a.origem.edgeId, necessidades),
      ].map((n) => n.texto),
      decisoes: [
        ...decisoesDoElemento(a.origem.nodeId, opcoes.decisoes ?? []),
        ...decisoesDoElemento(a.origem.edgeId, opcoes.decisoes ?? []),
      ].map((d) => d.titulo),
      percursos: elemento ? percursos.filter((p) => p.nos.includes(elemento)).map((p) => p.rotulo) : [],
    };
  });

  return {
    titulo: opcoes.titulo ?? "Documento de desenho",
    contexto: partesContexto.join("\n\n"),
    diagrama,
    saude,
    necessidades: necessidades.map((n) => ({
      texto: n.texto,
      atendida: !lacunas.semElemento.includes(n.id),
    })),
    decisoes,
    conferencias: { violacoes, aceitas, percursos, violacoesDePercurso, naoMedidos },
    itens,
  };
}

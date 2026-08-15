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
import { decisoesDoElemento, decisoesVigentes, excecoesComoDecisoes } from "../decisao/decisoes.js";
import { avaliarPercursos, type PercursoNaoMedido, type ViolacaoDePercurso } from "../percurso/conformidadeDePercurso.js";
import { percursosQueContam } from "../percurso/percursos.js";

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

/** Um chip da faixa de saúde — o mesmo vocabulário do placar da mesa. */
export interface IndicadorDeSaude {
  /** O emoji do placar: quem viu a mesa reconhece sem legenda. */
  icone: string;
  rotulo: string;
  nivel: NivelSaude;
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

  const saude: IndicadorDeSaude[] = [];
  if (necessidades.length > 0) {
    saude.push({
      icone: "🎯",
      rotulo:
        lacunas.semElemento.length > 0
          ? `${lacunas.semElemento.length} necessidade(s) sem componente`
          : "propósito coberto",
      nivel: lacunas.semElemento.length > 0 ? "amarelo" : "verde",
    });
  }
  if ((opcoes.regras?.porTech && Object.keys(opcoes.regras.porTech).length > 0) || violacoes.length > 0) {
    saude.push({
      icone: "⚖",
      rotulo: violacoes.length > 0 ? `${violacoes.length} fora do padrão` : "dentro do padrão",
      nivel: violacoes.length > 0 ? "amarelo" : "verde",
    });
  }
  if (decisoes.length > 0) {
    const semPorque = decisoes.filter((d) => !d.porque.trim()).length;
    saude.push({
      icone: "🧭",
      rotulo: semPorque > 0 ? `${semPorque} decisão(ões) sem porquê` : `${decisoes.length} decisão(ões)`,
      nivel: semPorque > 0 ? "amarelo" : "verde",
    });
  }
  if (percursos.length > 0) {
    const cobra = violacoesDePercurso.length + naoMedidos.length;
    saude.push({
      icone: "🛣",
      rotulo:
        violacoesDePercurso.length > 0
          ? `${violacoesDePercurso.length} caminho(s) fora do padrão`
          : naoMedidos.length > 0
            ? `${naoMedidos.length} caminho(s) sem medir`
            : `${percursos.length} caminho(s) conferido(s)`,
      nivel: cobra > 0 ? "amarelo" : "verde",
    });
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

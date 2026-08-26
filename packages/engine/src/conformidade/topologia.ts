import type { ChecagemDeTopologia, DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Aresta, Diagrama, ExcecaoDePadrao, No } from "../model/types.js";
import { arestaEspera } from "../leitura/lerDesenho.js";

/**
 * SPEC-63 — a régua sobre a FORMA do desenho.
 *
 * ## A assimetria que isto fecha
 *
 * A mesa sabia cobrar duas coisas e não sabia a terceira:
 *
 * | Escopo | Pergunta |
 * |---|---|
 * | `porTech[].checagem` | este COMPONENTE declara o que o padrão exige? |
 * | `percursos[].checagem` | este CAMINHO soma dentro do que o padrão permite? |
 * | **`topologia[].checagem`** | **este DESENHO tem a forma que o padrão exige?** |
 *
 * A classe de defeito que não mora em elemento nenhum **nem em caminho nenhum**:
 * mora na *ausência* ou na *presença* de uma ligação. Fila sem consumidor — cada
 * nó completo, cada campo preenchido, e a mensagem não chega a lugar nenhum.
 * Aresta direta do app para o banco — nenhum campo errado; o que está errado é
 * existir a seta.
 *
 * ## A régua que impede isto de virar linter de grafo
 *
 * > A regra de topologia responde à MESMA pergunta das outras duas — *"este
 * > desenho contraria o padrão do time?"* — e nunca a *"este grafo é válido?"*.
 *
 * Não se cobra ciclo, nó solto ou componente desconectado por serem "feios":
 * cobra-se o que o time declarou como padrão, com o porquê junto. Ciclo é papel
 * de `detectarConflitos`, sobre as atividades derivadas.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

export interface ViolacaoDeTopologia {
  regraId: string;
  texto: string;
  porque?: string;
  /**
   * Onde a violação MORA. `exige-conexao` acusa o NÓ que ficou sem a ligação;
   * `proibe-conexao` acusa a ARESTA que não devia existir. Um dos dois, nunca
   * os dois — é o que permite ao painel do elemento mostrar o que é dele.
   */
  noId?: string;
  arestaId?: string;
  /** O rótulo do elemento, para a mensagem não obrigar quem lê a procurar o id. */
  rotulo: string;
  esperado: string;
  atual: string;
  /** §242 — presente quando alguém aceitou esta violação de propósito. */
  excecao?: ExcecaoDePadrao;
}

function rotuloDoTipoNo(config: DiagramaConfig, tipo: string): string {
  return config.nodeTypes[tipo]?.label ?? tipo;
}

function rotuloDoTipoAresta(config: DiagramaConfig, tipo?: string): string | undefined {
  if (!tipo) return undefined;
  return config.edgeTypes[tipo]?.label ?? tipo;
}

function rotuloDoNo(no: No): string {
  return no.label?.trim() || no.id;
}

function rotuloDaAresta(aresta: Aresta, porId: Map<string, No>, config: DiagramaConfig): string {
  const de = porId.get(aresta.source);
  const para = porId.get(aresta.target);
  const verbo = rotuloDoTipoAresta(config, aresta.type) ?? aresta.type;
  return `${de ? rotuloDoNo(de) : aresta.source} —${verbo}→ ${para ? rotuloDoNo(para) : aresta.target}`;
}

/** "uma conexão `consome` saindo, para uma Fila" — a frase do que o padrão pede. */
function descreverExigencia(c: Extract<ChecagemDeTopologia, { tipo: "exige-conexao" }>, config: DiagramaConfig): string {
  const partes = ["uma conexão"];
  const aresta = rotuloDoTipoAresta(config, c.tipoAresta);
  if (aresta) partes.push(`"${aresta}"`);
  partes.push(c.direcao === "sai" ? "saindo" : "entrando");
  if (c.tipoNoOposto) partes.push(`${c.direcao === "sai" ? "para" : "de"} ${rotuloDoTipoNo(config, c.tipoNoOposto)}`);
  return partes.join(" ");
}

function descreverProibicao(c: Extract<ChecagemDeTopologia, { tipo: "proibe-conexao" }>, config: DiagramaConfig): string {
  const aresta = rotuloDoTipoAresta(config, c.tipoAresta);
  return `nenhuma conexão${aresta ? ` "${aresta}"` : ""} de ${rotuloDoTipoNo(config, c.deTipoNo)} para ${rotuloDoTipoNo(
    config,
    c.paraTipoNo
  )}`;
}

/** "no máximo 2 conexões que esperam saindo" — a frase do que o padrão pede. */
function descreverLimite(c: Extract<ChecagemDeTopologia, { tipo: "limita-grau" }>, config: DiagramaConfig): string {
  const partes = [`no máximo ${c.maximo}`];
  const aresta = rotuloDoTipoAresta(config, c.tipoAresta);
  partes.push(c.maximo === 1 ? "conexão" : "conexões");
  if (aresta) partes.push(`"${aresta}"`);
  if (c.apenasQueEsperam) partes.push("que esperam resposta");
  partes.push(c.direcao === "sai" ? "saindo" : "entrando");
  return partes.join(" ");
}

/**
 * §242 aplicado à forma: a exceção identifica o par `(elemento, regra)`.
 *
 * `campo` fica vazio numa exceção de topologia — o que foi aceito não é um
 * campo, é uma regra sobre a forma —, e quem identifica é `regraId`. Mesma
 * coleção de `quebra.excecoes`, sem tabela nova: duas coleções de exceção
 * seriam duas verdades sobre o mesmo assunto.
 */
function excecaoDe(excecoes: ExcecaoDePadrao[], elementoId: string, regraId: string): ExcecaoDePadrao | undefined {
  return excecoes.find((e) => e.noId === elementoId && e.regraId === regraId);
}

export function avaliarTopologia(
  diagrama: Diagrama,
  config: DiagramaConfig,
  regras?: RegrasConfig,
  excecoes: ExcecaoDePadrao[] = []
): ViolacaoDeTopologia[] {
  const requisitos = regras?.topologia ?? [];
  if (requisitos.length === 0) return [];

  const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));
  const violacoes: ViolacaoDeTopologia[] = [];

  for (const requisito of requisitos) {
    const c = requisito.checagem;

    if (c.tipo === "exige-conexao") {
      const esperado = descreverExigencia(c, config);
      for (const no of diagrama.nodes) {
        // §4.1 — nó `existente` também é cobrado. O desenho é a verdade que a
        // mesa mede; um desenho que omite o consumidor está incompleto, e
        // desenho incompleto é o que esta ferramenta existe para revelar. Quem
        // tem o caso legítimo tem a válvula da exceção.
        if (no.type !== c.tipoNo) continue;

        const atende = diagrama.edges.some((e) => {
          const ponta = c.direcao === "sai" ? e.source : e.target;
          if (ponta !== no.id) return false;
          if (c.tipoAresta && e.type !== c.tipoAresta) return false;
          if (!c.tipoNoOposto) return true;
          const outroId = c.direcao === "sai" ? e.target : e.source;
          return porId.get(outroId)?.type === c.tipoNoOposto;
        });
        if (atende) continue;

        violacoes.push({
          regraId: requisito.id,
          texto: requisito.texto,
          porque: requisito.porque,
          noId: no.id,
          rotulo: rotuloDoNo(no),
          esperado,
          atual: "nenhuma",
          excecao: excecaoDe(excecoes, no.id, requisito.id),
        });
      }
      continue;
    }

    if (c.tipo === "limita-grau") {
      const esperado = descreverLimite(c, config);
      for (const no of diagrama.nodes) {
        if (no.type !== c.tipoNo) continue;

        const contadas = diagrama.edges.filter((e) => {
          const ponta = c.direcao === "sai" ? e.source : e.target;
          if (ponta !== no.id) return false;
          // Auto-laço não é chamada a outro componente: contá-lo inflaria o
          // grau por uma seta que não sai do lugar.
          if (e.source === e.target) return false;
          if (c.tipoAresta && e.type !== c.tipoAresta) return false;
          // §3.1 — `=== true`, e não "diferente de false": conexão de tipo sem
          // `espera` declarado fica de FORA. Contar o que não se sabe inflaria
          // o grau e acusaria por ignorância, que é o oposto do §248.
          if (c.apenasQueEsperam && arestaEspera(e, config) !== true) return false;
          return true;
        });
        if (contadas.length <= c.maximo) continue;

        violacoes.push({
          regraId: requisito.id,
          texto: requisito.texto,
          porque: requisito.porque,
          // O EXCESSO é propriedade do nó, não de uma aresta. Apontar quatro
          // arestas obrigaria a pessoa a escolher qual sobra — e essa decisão é
          // dela, não da régua.
          noId: no.id,
          rotulo: rotuloDoNo(no),
          esperado,
          // O número real, e não "acima do máximo": sem ele, a frase não diz de
          // quanto é o excesso.
          atual: `${contadas.length} ${contadas.length === 1 ? "conexão" : "conexões"}${
            c.apenasQueEsperam ? " que esperam" : ""
          }`,
          excecao: excecaoDe(excecoes, no.id, requisito.id),
        });
      }
      continue;
    }

    const esperado = descreverProibicao(c, config);
    for (const aresta of diagrama.edges) {
      if (c.tipoAresta && aresta.type !== c.tipoAresta) continue;
      if (porId.get(aresta.source)?.type !== c.deTipoNo) continue;
      if (porId.get(aresta.target)?.type !== c.paraTipoNo) continue;

      violacoes.push({
        regraId: requisito.id,
        texto: requisito.texto,
        porque: requisito.porque,
        arestaId: aresta.id,
        rotulo: rotuloDaAresta(aresta, porId, config),
        esperado,
        // A frase diz o que ESTÁ ali, e não só que está errado: é o que a
        // pessoa procura no desenho para resolver.
        atual: rotuloDaAresta(aresta, porId, config),
        excecao: excecaoDe(excecoes, aresta.id, requisito.id),
      });
    }
  }

  return violacoes;
}

/** As que ainda cobram alguém — o que vai ao placar. */
export function violacoesDeFormaEmAberto(violacoes: ViolacaoDeTopologia[]): ViolacaoDeTopologia[] {
  return violacoes.filter((v) => !v.excecao);
}

/** §242 — as aceitas de propósito. Somem do vermelho, não do histórico. */
export function violacoesDeFormaAceitas(violacoes: ViolacaoDeTopologia[]): ViolacaoDeTopologia[] {
  return violacoes.filter((v) => !!v.excecao);
}

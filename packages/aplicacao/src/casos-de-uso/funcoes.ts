import {
  avisosDaDerivacao,
  derivar,
  resolverDependencias,
  simularCenarios,
  type CenarioDeLentidao,
  type Decisao,
  type Diagrama,
  type DiagramaConfig,
  type ExcecaoDePadrao,
  type Necessidade,
  type Percurso,
  type RegrasConfig,
  type Token,
  type VolumetriaDaDemanda,
} from "@gerador/engine";
import { funcaoDoSistema, type FuncaoDoSistema } from "../config/funcoes.js";

/**
 * SPEC-107 fatia A — **o executor de FUNÇÕES, puro.**
 *
 * O mesmo corte do executor de conector (fatia B da 105): montar a chamada e
 * validar a entrada são decisões de contrato, testáveis sem rede e sem banco.
 * O que só o servidor tem — o vocabulário do time resolvido (diagrama +
 * campos customizados + regras + tokens) — chega pronto no `contexto`,
 * montado pelo MESMO montador que o web usa (`diagramaDoTime.ts`, §263).
 *
 * `derivar()` e `simularCenarios()` são o motor de sempre, sem cópia: é a
 * prova da fatia — derivar pelo botão da mesa e pela função passam pela mesma
 * função do engine, com o mesmo vocabulário.
 */

export class EntradaDaFuncaoInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "EntradaDaFuncaoInvalida";
  }
}

/**
 * A forma que o produto salva de uma demanda (o subconjunto que as funções
 * leem): o `diagrama` obrigatório, e o contexto que a derivação da MESA já
 * passa hoje (App.tsx) — sem ele os itens de conformidade/percurso não
 * nasceriam pela função e nasceriam pelo botão, e o byte a byte quebraria.
 */
export interface DesenhoMapeado {
  diagrama: Diagrama;
  time?: string;
  excecoes?: ExcecaoDePadrao[];
  percursos?: Percurso[];
  necessidades?: Necessidade[];
  decisoes?: Decisao[];
  volumetria?: VolumetriaDaDemanda;
}

export interface ContextoDasFuncoes {
  diagramaConfig: DiagramaConfig;
  regrasConfig?: RegrasConfig;
  tokens?: Token[];
}

/** §9.3, a mesma régua do conector: obrigatório ausente não vira default —
 * a execução não acontece, com o NOME do que faltou. */
function exigirObrigatorios(funcao: FuncaoDoSistema, entradas: Record<string, unknown>): void {
  const faltando = funcao.entrada
    .filter((campo) => campo.obrigatorio && (entradas[campo.chave] === undefined || entradas[campo.chave] === null))
    .map((campo) => campo.chave);
  if (faltando.length > 0) {
    throw new EntradaDaFuncaoInvalida(
      `a função "${funcao.nome}" precisa de ${faltando.map((c) => `"${c}"`).join(", ")} — entrada ausente não vira default`
    );
  }
}

/** O `desenho` veio mapeado de qualquer lugar (modo b) — então a forma é
 * conferida aqui, com o erro dizendo o que se esperava (§9.3). */
function comoDesenho(valor: unknown): DesenhoMapeado {
  const bruto = valor as Partial<DesenhoMapeado> | null;
  const diagrama = bruto?.diagrama as Partial<Diagrama> | undefined;
  if (!diagrama || !Array.isArray(diagrama.nodes) || !Array.isArray(diagrama.edges)) {
    throw new EntradaDaFuncaoInvalida(
      `o "desenho" mapeado não tem a forma de um desenho — esperado um objeto com "diagrama" ({ nodes, edges })`
    );
  }
  return bruto as DesenhoMapeado;
}

export function executarFuncao(
  funcaoId: string,
  entradas: Record<string, unknown>,
  contexto: ContextoDasFuncoes
): Record<string, unknown> {
  const funcao = funcaoDoSistema(funcaoId);
  if (!funcao) {
    throw new EntradaDaFuncaoInvalida(`não conheço a função "${funcaoId}" — veja GET /funcoes`);
  }
  exigirObrigatorios(funcao, entradas);

  if (funcao.id === "derivacao") {
    const desenho = comoDesenho(entradas.desenho);
    // A MESMA chamada do botão da mesa (App.tsx, executarDerivacao), com o
    // mesmo contexto — é o §263 em código: um executor só.
    const atividades = derivar(desenho.diagrama, contexto.diagramaConfig, {
      time: desenho.time,
      regras: contexto.regrasConfig,
      excecoes: desenho.excecoes,
      percursos: desenho.percursos,
      tokens: contexto.tokens,
    });
    const resolucao = resolverDependencias(atividades);
    const avisos = avisosDaDerivacao(desenho.diagrama, contexto.diagramaConfig, {
      regras: contexto.regrasConfig,
      excecoes: desenho.excecoes,
      necessidades: desenho.necessidades,
      decisoes: desenho.decisoes,
      percursos: desenho.percursos,
    });
    return {
      itens: resolucao.atividades,
      avisos,
      conformidade: {
        podeDerivar: resolucao.podeDerivar,
        ciclos: resolucao.ciclos,
        conflitos: resolucao.conflitos,
      },
    };
  }

  if (funcao.id === "ensaio") {
    const desenho = comoDesenho(entradas.desenho);
    const cenario = entradas.cenario as CenarioDeLentidao | undefined;
    const { hoje, resultados } = simularCenarios(
      desenho.diagrama,
      contexto.diagramaConfig,
      cenario ? [cenario] : [],
      undefined,
      desenho.volumetria
    );
    // Sem cenário a leitura ainda vale: é a âncora de hoje, que toda tabela
    // de ensaio mostra como primeira linha.
    return { leitura: { hoje, ...(resultados[0] ? { resultado: resultados[0] } : {}) } };
  }

  // O registro é fechado e os dois ids acima o cobrem; chegar aqui é registro
  // e executor fora de sincronia — o erro diz isso em vez de devolver vazio.
  throw new EntradaDaFuncaoInvalida(`a função "${funcao.id}" está registrada sem executor — registro e executor andam juntos`);
}

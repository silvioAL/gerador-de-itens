import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Decisao, Diagrama, ExcecaoDePadrao, Percurso } from "../model/types.js";
import { decisoesVigentes, propostasPendentes, resumirDecisoes } from "../decisao/decisoes.js";
import { avaliarPercursos } from "../percurso/conformidadeDePercurso.js";
import { percursosQueContam } from "../percurso/percursos.js";
import { derivar } from "../derive/derivar.js";

/**
 * SPEC-60 fatia A — a REMEDIÇÃO: o que muda nas medidas se você aceitar.
 *
 * ## A quarta batida do laço
 *
 * O §6 da SPEC-57 desenha **medir → conversar → decidir → remedir**, e a quarta
 * existia num lugar só: o `delta-da-proposta` das necessidades, que roda o
 * motor duas vezes — como está, e como ficaria — e mostra a diferença antes do
 * clique. Aceitar uma decisão e confirmar um caminho não diziam nada.
 *
 * ## A régua: a moeda em que a consequência aparece
 *
 * Decisão se mede no placar de decisões. Caminho se mede no **backlog** —
 * porque confirmar um caminho é o que faz a régua passar a valer sobre ele, e
 * régua que passa a valer **gera item** (§249). Esse é o preço que hoje é
 * cobrado depois do clique, sem aviso.
 *
 * Usar o mesmo número nos dois lugares seria simetria bonita e informação
 * inútil, que é exatamente o defeito que esta SPEC combate.
 *
 * ## O que estas funções NÃO fazem
 *
 * Não montam frase. Devolvem pares de números comparáveis e, quando cabe, o
 * motivo de a piora existir — a redação é da tela. Motor que devolve texto
 * pronto é motor que a tela não consegue reaproveitar.
 *
 * Funções puras, sem I/O, como o resto do engine.
 */
export interface LinhaDeDelta {
  rotulo: string;
  antes: number;
  depois: number;
}

export interface Remedicao {
  linhas: LinhaDeDelta[];
  /**
   * O trabalho que aceitar CRIA, quando cria. Ausente é afirmação: não piora
   * nada. É o campo que o §M4 da SPEC-57 chamava de "confiança que cai" — aqui
   * ele é dito em português, porque cada caso piora por um motivo diferente.
   */
  alerta?: string;
}

/** `true` quando a linha piorou — a tela pinta, e só ela sabe com que cor. */
export function piorou(l: LinhaDeDelta): boolean {
  return l.depois > l.antes;
}

/**
 * Aceitar ESTA proposta de decisão: o que acontece com o placar.
 *
 * A proposta que não existe (ou que já foi aceita) devolve delta vazio em vez
 * de erro: a tela chama isto durante o render, e um lançamento aqui apagaria o
 * painel inteiro por causa de um id velho.
 */
export function deltaDeDecisao(diagrama: Diagrama, decisoes: Decisao[], idDaProposta: string): Remedicao {
  const proposta = decisoes.find((d) => d.id === idDaProposta && d.status === "proposta");
  if (!proposta) return { linhas: [] };

  const depoisDeAceitar = decisoes.map((d) => (d.id === idDaProposta ? { ...d, status: "aceita" as const } : d));

  const semPorqueAntes = resumirDecisoes(diagrama, decisoes).semPorque.length;
  const semPorqueDepois = resumirDecisoes(diagrama, depoisDeAceitar).semPorque.length;

  const linhas: LinhaDeDelta[] = [
    {
      rotulo: "propostas esperando",
      antes: propostasPendentes(decisoes).length,
      depois: propostasPendentes(depoisDeAceitar).length,
    },
    {
      rotulo: "decisões vigentes",
      antes: decisoesVigentes(decisoes).length,
      depois: decisoesVigentes(depoisDeAceitar).length,
    },
  ];

  // Só aparece quando é o caso: uma linha "0 → 0" ensina a não ler as outras.
  if (semPorqueDepois > semPorqueAntes) {
    linhas.push({ rotulo: "decisões sem o porquê", antes: semPorqueAntes, depois: semPorqueDepois });
  }

  return {
    linhas,
    alerta:
      semPorqueDepois > semPorqueAntes
        ? "Esta proposta não traz o porquê — aceitar assim registra uma escolha que ninguém vai conseguir explicar depois."
        : undefined,
  };
}

export interface ContextoDaRemedicao {
  regras?: RegrasConfig;
  excecoes?: ExcecaoDePadrao[];
  time?: string;
}

/**
 * Confirmar ESTE caminho: quantos itens isso põe no backlog.
 *
 * O motor deriva duas vezes. Caro? É o mesmo custo do delta das necessidades, e
 * a alternativa — reimplementar aqui a conta que a derivação já faz — é a
 * receita de os dois números divergirem no dia em que a derivação mudar.
 */
export function deltaDePercurso(
  diagrama: Diagrama,
  config: DiagramaConfig,
  percursos: Percurso[],
  idDoPercurso: string,
  contexto: ContextoDaRemedicao = {}
): Remedicao {
  const alvo = percursos.find((p) => p.id === idDoPercurso);
  if (!alvo || alvo.confirmado === true) return { linhas: [] };

  const depoisDeConfirmar = percursos.map((p) => (p.id === idDoPercurso ? { ...p, confirmado: true } : p));

  const derivarCom = (lista: Percurso[]) =>
    derivar(diagrama, config, { ...contexto, percursos: percursosQueContam(lista) }).length;

  const linhas: LinhaDeDelta[] = [
    { rotulo: "itens no backlog", antes: derivarCom(percursos), depois: derivarCom(depoisDeConfirmar) },
  ];

  // "Não dá para medir" não vira item (§249, porque já é vermelho de completude
  // no nó) e por isso não aparece na linha de cima. Sem esta frase, confirmar um
  // caminho que falta campo mostraria "0 → 0" e leria como "não custa nada".
  const naoMedido = avaliarPercursos(
    diagrama,
    config,
    percursosQueContam(depoisDeConfirmar),
    contexto.regras
  ).naoMedidos.find((n) => n.percursoId === idDoPercurso);

  return {
    linhas,
    alerta: naoMedido
      ? `Confirmar não vai medir este caminho: falta ${naoMedido.campo} em ${naoMedido.nosSemValor.length} componente(s).`
      : linhas[0].depois > linhas[0].antes
        ? "Confirmar faz a régua valer sobre este caminho — e ele já está fora dela."
        : undefined,
  };
}

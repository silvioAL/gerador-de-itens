import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Decisao, Diagrama, Necessidade, Percurso } from "../model/types.js";
import { analisarLacunas } from "../proposito/lacunas.js";
import { avaliarPercursos } from "../percurso/conformidadeDePercurso.js";
import { percursosQueContam } from "../percurso/percursos.js";
import { propostasPendentes, resumirDecisoes } from "../decisao/decisoes.js";

/**
 * §261 — o que se está IGNORANDO ao derivar.
 *
 * ## O buraco que isto fecha
 *
 * A SPEC-57 M7 previa *"vermelho bloqueia, amarelo avisa — agora sobre todas as
 * dimensões"*, e ficou pela metade: o portão consulta só completude
 * (`vermelhos.length > 0`). As dimensões construídas depois são todas amarelas,
 * e amarelo que ninguém lê no momento da decisão é a mesma coisa que medida
 * nenhuma.
 *
 * ## Por que AVISA e não BLOQUEIA
 *
 * Porque bloquear no primeiro dia ensina a ignorar a cor — é a regra que este
 * produto repete desde o §230, e ela continua valendo. O que muda aqui é
 * outra coisa: hoje derivar com uma necessidade órfã e um caminho estourado
 * acontece em **silêncio**. Isto transforma o silêncio em **reconhecimento
 * explícito**: a pessoa segue em frente sabendo o que deixou para trás, e um
 * clique é o preço.
 *
 * ## A régua que decide o que entra: só o que a derivação NÃO resolve
 *
 * Violação de padrão vira item (§240). Caminho fora da régua vira item (§249).
 * Avisar sobre eles antes de derivar seria avisar sobre exatamente aquilo que
 * o clique está prestes a resolver — e um diálogo que aparece toda vez, dizendo
 * o que já vai ser tratado, é o jeito mais rápido de ensinar a fechá-lo sem ler.
 *
 * O que entra é o que **passa batido**: necessidade sem dono, caminho que não
 * dá para medir, decisão proposta que ninguém aceitou, decisão sem porquê.
 * Nenhum deles vira item, e nenhum deles reaparece depois.
 *
 * Função pura, sem I/O, como o resto do engine.
 */
export interface AvisoDaDerivacao {
  /**
   * A dimensão, para a tela agrupar e para o teste não depender do texto.
   *
   * `padrao` NÃO está aqui, e a ausência é a régua: violação de padrão vira
   * item (§240), então ela não passa batido — a derivação a trata.
   */
  dimensao: "proposito" | "caminho" | "decisao";
  texto: string;
}

export interface EntradaDosAvisos {
  regras?: RegrasConfig;
  necessidades?: Necessidade[];
  decisoes?: Decisao[];
  percursos?: Percurso[];
}

export function avisosDaDerivacao(
  diagrama: Diagrama,
  config: DiagramaConfig,
  entrada: EntradaDosAvisos = {}
): AvisoDaDerivacao[] {
  const avisos: AvisoDaDerivacao[] = [];

  // PROPÓSITO — necessidade declarada e sem ninguém que responda por ela.
  // Elemento sem necessidade NÃO entra: ele é informativo por decisão do §230
  // (infraestrutura legítima existe), e cobrar aqui pintaria todo desenho.
  const lacunas = analisarLacunas(diagrama, entrada.necessidades ?? []);
  if (lacunas.semElemento.length > 0) {
    avisos.push({
      dimensao: "proposito",
      texto: `${lacunas.semElemento.length} necessidade(s) sem nenhum componente que responda por ela`,
    });
  }

  // CAMINHO — só o que NÃO VIRA ITEM. Veja a régua abaixo: caminho fora da
  // régua vira item de trabalho (§249), então avisar sobre ele seria avisar
  // sobre algo que a própria derivação está resolvendo. "Não deu para medir"
  // é diferente: ele não vira item nenhum (§249 decidiu isso, porque já é
  // vermelho de completude no nó) e some se ninguém disser nada.
  const percursos = percursosQueContam(entrada.percursos ?? []);
  const { naoMedidos } = avaliarPercursos(diagrama, config, percursos, entrada.regras);
  if (naoMedidos.length > 0) {
    avisos.push({
      dimensao: "caminho",
      texto: `${naoMedidos.length} caminho(s) que não dá para medir por falta de campo`,
    });
  }

  // DECISÃO — proposta pendente é trabalho de uma pessoa que ninguém fez, e
  // derivar por cima dela congela o desenho sem a escolha ter sido tomada.
  const propostas = propostasPendentes(entrada.decisoes ?? []);
  if (propostas.length > 0) {
    avisos.push({ dimensao: "decisao", texto: `${propostas.length} decisão(ões) proposta(s) esperando alguém` });
  }
  const semPorque = resumirDecisoes(diagrama, entrada.decisoes ?? []).semPorque.length;
  if (semPorque > 0) {
    avisos.push({ dimensao: "decisao", texto: `${semPorque} decisão(ões) registrada(s) sem o porquê` });
  }

  return avisos;
}

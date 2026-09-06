import type { CampoDoConector } from "./conectores.js";
import type { GovernancaDaFuncao } from "./funcoes.js";

/**
 * SPEC-107 fatia B — **o PROJETO como nó, nas duas direções.**
 *
 * A demanda (a mesa de projeto) vira capacidade com contrato, como conector,
 * agente e função — o mesmo molde (`CampoDoConector`), outro transporte: o
 * repositório de quebras. `demandaId` é só um PARÂMETRO do nó (§5.1); sem
 * ele, vale a demanda "ativa" — que o servidor não conhece (o aberto-agora é
 * estado do navegador), então o default honesto é a mais recentemente
 * atualizada DO TIME da execução, e o erro diz isso quando não há nenhuma.
 *
 * ## As duas direções num nó só (§5.1 — input/output universal)
 *
 * Sem `desenho` mapeado o nó é FONTE: emite o desenho e o que a demanda
 * carrega. Com `desenho` mapeado é DESTINO — e a escrita NUNCA toca o
 * desenho da demanda: ela vira uma VARIANTE ("Proposta do fluxo…"), a
 * mecânica da SPEC-88 que já existe para "um desenho guardado que ainda não
 * é O desenho". Adotar é decisão humana, na mesa, pela comparação de sempre
 * (§2.4-14: importar não é aceitar, e nenhuma fiação muda isso por baixo).
 *
 * ## O que cada saída é, dito em voz alta (§2.4-6)
 *
 * - `desenho` — o subconjunto que as funções leem (`DesenhoMapeado`): o
 *   diagrama mais o contexto que o botão da mesa passa ao derivar.
 * - `itens` — os itens GERADOS e persistidos (quem calcula é a derivação; uma
 *   demanda nunca derivada emite lista vazia).
 * - `markdown` — a última especificação GERADA (foto persistida, não
 *   montagem viva: o documento é montado pelo cliente com templates e
 *   contexto de produto — um segundo montador no servidor é o §263 de novo).
 *   Nunca gerada = o campo NÃO SAI, e quem o exigir à jusante barra (§9.3).
 * - `volumetria` — ausente quando a demanda não declarou volume (a régua da
 *   SPEC-70: ausência não vira `{}`).
 */
export interface ProjetoDoSistema {
  id: "projeto";
  nome: string;
  descricao: string;
  entrada: CampoDoConector[];
  saida: CampoDoConector[];
  governanca: GovernancaDaFuncao;
}

export const REF_DO_PROJETO = "projeto";

export const PROJETO_DO_SISTEMA: ProjetoDoSistema = {
  id: "projeto",
  // §2.3 — "mesa" é o nome DA TELA; o componente chama-se Projeto.
  nome: "Projeto",
  descricao:
    "A demanda como fonte (desenho, itens, documento, volumetria, necessidades) ou destino (o desenho mapeado vira proposta, para alguém adotar na mesa).",
  entrada: [
    { chave: "demandaId", rotulo: "Demanda (id — vazio = a mais recente do time)", tipo: "texto" },
    { chave: "desenho", rotulo: "Desenho proposto (vira variante da demanda)", tipo: "objeto" },
  ],
  saida: [
    { chave: "desenho", rotulo: "Desenho (demanda)", tipo: "objeto" },
    { chave: "itens", rotulo: "Itens gerados (persistidos)", tipo: "lista" },
    { chave: "markdown", rotulo: "Documento (última especificação gerada)", tipo: "texto" },
    { chave: "volumetria", rotulo: "Volumetria da demanda", tipo: "objeto" },
    { chave: "necessidades", rotulo: "Necessidades", tipo: "lista" },
    { chave: "demandaId", rotulo: "Demanda (id)", tipo: "texto" },
    { chave: "titulo", rotulo: "Título da demanda", tipo: "texto" },
    { chave: "varianteId", rotulo: "Variante proposta (id)", tipo: "texto" },
  ],
  // A leitura roda no nível de quem executa o fluxo (`operar`); a ESCRITA da
  // proposta re-checa o nível no time da PRÓPRIA demanda, dentro do executor —
  // o gate da rota cobre o time do corpo, não o da quebra que o `demandaId`
  // apontar.
  governanca: { nivel: "operar", recurso: "fluxos.executar" },
};

/**
 * SPEC-109 fatia C — **o que sobreviveu à morte do mapa do sistema.**
 *
 * `montarMapaDoSistema` e a SistemaScreen morreram juntos: o canvas de fluxos
 * passou a mostrar o encanamento VIVO (executável), e a segunda narração dele
 * era a repetição que o usuário apontou. O que fica é o RASTRO — a última
 * execução de cada papel, que a rota `/ia/execucoes` devolve e o painel do nó
 * agente mostra ("falhou há 3 min" continua sendo notícia; §265).
 */
export interface ExecucaoDoPapel {
  papel: string;
  ok: boolean;
  em: string;
  duracaoMs: number;
  erro?: string;
}

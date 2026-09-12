import { CAMPO_GLOBAL } from "@gerador/aplicacao";
import type { FastifyRequest } from "fastify";

/**
 * **A régua de quem vê o quê, num lugar só.**
 *
 * Ela nasceu de um defeito REAL, relatado por quem usava: uma pessoa abriu o
 * fluxo de ensaio pelo time dela, o canvas listou uma execução suspensa de
 * OUTRO time (o ensaio é fluxo de fábrica — todo time tem um, com o mesmo id),
 * ela clicou em "abrir →" e caiu numa tela que mostrava dado alheio e cujos
 * dois botões recusavam por falta de nível. Vazamento e beco sem saída no mesmo
 * clique.
 *
 * A causa não era uma rota distraída: eram QUATRO, todas com `exigirSessao` e
 * nada mais, cada uma escrita numa fatia diferente. O padrão certo já existia
 * (`GET /pdca/metricas` filtrava assim desde a §273) — o que faltava era ele
 * ter NOME, para a quinta rota nascer certa em vez de repetir a distração.
 *
 * ## As duas metades da régua
 *
 * - **`timesVisiveis`**: os times da sessão, opcionalmente estreitados ao que a
 *   consulta pediu. Pedir um time de que não se participa devolve lista vazia —
 *   não erro: quem pergunta pelo que não é dele recebe nada, não um mapa do que
 *   existe.
 * - **`visivelPara`**: uma linha é visível quando é GLOBAL (sem dono de time) ou
 *   quando o dono está entre os visíveis. O global entra porque a organização
 *   inteira o compartilha — é o pedido de ajuste sem time, a configuração de
 *   fábrica. Duas convenções de "global" convivem no banco (`null` nas tabelas
 *   antigas, o sentinela `__global__` nas novas), e esconder essa diferença aqui
 *   é o que impede cada chamador de lembrar dela.
 */
export function timesVisiveis(req: FastifyRequest, timeIdPedido?: string): string[] {
  const meus = req.usuario?.timeIds ?? [];
  return timeIdPedido ? meus.filter((t) => t === timeIdPedido) : meus;
}

export function visivelPara(visiveis: string[], timeIdDaLinha: string | null | undefined): boolean {
  if (timeIdDaLinha === null || timeIdDaLinha === undefined || timeIdDaLinha === CAMPO_GLOBAL) return true;
  return visiveis.includes(timeIdDaLinha);
}

/**
 * **Execução é EVENTO, não política — e por isso "sem time" não quer dizer "de
 * todos".**
 *
 * A régua acima trata o global como da organização, e para configuração e
 * feedback isso está certo: um pedido de ajuste sem time é da casa, e esconder
 * a política de quem ela governa seria absurdo.
 *
 * Uma execução não é nada disso. Ela é o registro de que ALGUÉM rodou alguma
 * coisa, com o rastro do que saiu de cada nó — e uma execução gravada sem time
 * (acontece quando o disparo não declarou um) pertence a quem a disparou, não à
 * organização. Aplicar a régua da política aqui reabriria o vazamento
 * exatamente para as execuções sem dono de time: foi o que a prova mostrou, dez
 * ensaios suspensos em `__global__` aparecendo para qualquer sessão.
 *
 * Então: time visível, ou global E minha.
 */
export function execucaoVisivelPara(
  visiveis: string[],
  email: string,
  linha: { timeId: string | null | undefined; email: string | null },
  /**
   * Quando a consulta PEDE um time, ela quer aquele time — e mais nada. Sem
   * esta distinção, perguntar "o que rodou no time X?" devolvia junto as minhas
   * execuções sem time, o que não é vazamento mas é resposta errada: quem
   * estreita o escopo espera uma lista estreita.
   */
  timeIdPedido?: string
): boolean {
  const dono = linha.timeId;
  const semTime = dono === null || dono === undefined || dono === CAMPO_GLOBAL;
  if (timeIdPedido) return !semTime && dono === timeIdPedido && visiveis.includes(timeIdPedido);
  if (semTime) return linha.email === email;
  return visiveis.includes(dono);
}

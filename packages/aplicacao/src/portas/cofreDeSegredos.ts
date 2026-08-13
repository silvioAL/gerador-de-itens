/**
 * SPEC-54 — a porta do COFRE.
 *
 * Três métodos, de propósito: é o mínimo que "guardar um segredo por nome"
 * exige, e é o que torna o Infisical trocável por qualquer outro vault sem
 * tocar em quem usa credencial.
 *
 * O que NÃO está aqui é tão decisão quanto o que está: nada de listar, nada de
 * versionar, nada de política de acesso. Quem faz isso é a UI do cofre, que
 * já existe e é melhor nisso do que qualquer coisa que se escrevesse aqui.
 */
export interface CofreDeSegredos {
  /** `null` = não existe. Cofre fora do ar LANÇA — ausência e indisponível são
   * respostas diferentes, e confundi-las faria a tela dizer "configure sua
   * chave" para quem já configurou (SPEC-54 §4). */
  ler(nome: string): Promise<string | null>;
  gravar(nome: string, valor: string): Promise<void>;
  /** Idempotente: apagar o que não existe não é erro. */
  apagar(nome: string): Promise<void>;
}

/**
 * O nome do segredo de um provedor. Um lugar só porque o decorator grava por
 * este nome e o operador procura por ele na UI do cofre — se as duas pontas
 * discordarem, a chave "some" sem que nada falhe.
 *
 * Formato explícito e legível (`GERADOR_IA_<PROVEDOR>`): quem abre o Infisical
 * precisa entender o que está vendo sem consultar o código.
 */
export function nomeDoSegredoDeCredencial(provedorId: string): string {
  return `GERADOR_IA_${provedorId.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
}

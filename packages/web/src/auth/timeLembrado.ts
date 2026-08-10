/**
 * Lembra qual time a pessoa estava usando, entre recargas.
 *
 * ACHADO (#280): `timeEscolhido` e `timeAtivo` eram `useState` puro. Recarregar
 * a página zerava os dois, e quem tem mais de um time caía de volta no "Qual
 * time?" **toda vez** — inclusive num F5 acidental no meio do trabalho. Pior:
 * quem tinha trocado de time voltava para o primeiro da lista sem aviso, e as
 * sugestões e campos customizados passavam a vir do time errado.
 *
 * Duas decisões que valem registro:
 *
 * 1. **Por usuário.** A chave inclui o e-mail da sessão. Sem isso, trocar de
 *    conta na mesma máquina herdaria o time da conta anterior — e o sintoma
 *    seria "por que estou vendo os campos de outro time?".
 *
 * 2. **Sempre validado contra a sessão.** Um valor lembrado só é aceito se
 *    ainda estiver em `sessao.timeIds`. Perder acesso a um time é justamente o
 *    caso em que uma lembrança teimosa faria mais estrago que ajuda: a pessoa
 *    ficaria presa numa tela pedindo dados de um time que o servidor recusa.
 *
 * `localStorage` pode não existir (modo privado, storage desabilitado). Isso
 * não é motivo pra derrubar o app — falha para "não lembro", que é exatamente
 * o comportamento de antes.
 */
const PREFIXO = "gerador:time-ativo:";

function chave(email: string): string {
  return `${PREFIXO}${email}`;
}

export function lerTimeLembrado(email: string, timesValidos: string[]): string | undefined {
  try {
    const salvo = window.localStorage.getItem(chave(email));
    return salvo && timesValidos.includes(salvo) ? salvo : undefined;
  } catch {
    return undefined;
  }
}

export function lembrarTime(email: string, timeId: string): void {
  try {
    window.localStorage.setItem(chave(email), timeId);
  } catch {
    // Sem storage a pessoa volta a escolher a cada recarga — degradação
    // aceitável, e melhor que uma tela branca por causa de um setItem.
  }
}

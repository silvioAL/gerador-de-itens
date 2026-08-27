import { expect, type Page } from "@playwright/test";

/**
 * Login em modo dev (AUTH_MODE=dev, ver SPEC-08 §2.1) — o app agora sempre
 * exige sessão antes de renderizar qualquer coisa, então isso substitui
 * `page.goto("/")` como primeiro passo de praticamente todo spec.
 * "dev@gerador.local" pertence a time-pagamentos/time-portabilidade/time-checkout
 * (seed de `packages/server/migrations/0001_auth_e_campos_no.sql`) — o login em
 * si não pede time (SPEC-09 revisado: um e-mail pode ter vários, não dá pra
 * escolher antes de saber quais), então sempre cai na tela de escolha depois.
 */
export async function entrar(page: Page, timeId = "time-pagamentos", email = "dev@gerador.local") {
  await page.goto("/");
  // Landing pública (SPEC-11) aparece primeiro, sem sessão — "Entrar" no
  // header dela é que leva pro formulário de fato.
  await page.getByRole("button", { name: "Entrar" }).first().click();
  await page.getByPlaceholder("voce@empresa.com").fill(email);
  await page.getByRole("button", { name: "Entrar" }).click();
  // dev@gerador.local tem mais de um time -> EscolherTimeScreen decide qual fica
  // ativo. Quem tem UM só time não passa por essa tela (o app já entra nele), e
  // esperar por um botão que nunca vai existir travava o spec inteiro em
  // silêncio até o timeout do teste — daí a corrida entre as duas telas.
  const escolherTime = page.getByRole("button", { name: timeId, exact: true });
  const jaDentro = page.getByRole("button", { name: "+ Serviço", exact: true });
  await Promise.race([
    escolherTime.waitFor({ state: "visible", timeout: 15000 }),
    jaDentro.waitFor({ state: "visible", timeout: 15000 }),
  ]).catch(() => {});
  if (await escolherTime.isVisible().catch(() => false)) await escolherTime.click();
  // Landing E tela de login também mostram "Gerador de Itens" (título) — não
  // dá pra usar isso como prova de login bem-sucedido. O botão "+ Serviço" só
  // existe depois de autenticado de verdade (achado real: sem essa asserção
  // específica, um 429 de rate limit no login passava batido pelo teste).
  // `exact: true` porque a paleta ganhou "+ Serviço de Batch (Spring Batch)"
  // depois que este helper foi escrito, e o seletor solto passou a casar com
  // dois botões — o Playwright falha em modo estrito, então TODA spec que
  // chama `entrar()` estava vermelha por um motivo que não era o dela.
  await expect(page.getByRole("button", { name: "+ Serviço", exact: true })).toBeVisible({ timeout: 10000 });
}

/**
 * §303 — entra num time EXCLUSIVO deste spec.
 *
 * O documento de regras é por time desde que o cliente passou a mandar o
 * `timeId` (o servidor sempre resolveu assim: time → global → template). Um
 * spec que grava regras entrando no seu próprio time **não colide com vizinho
 * nenhum, por construção** — não por ordem de execução, não por `finally` bem
 * escrito, que foi o que o §281 e o §299 tentaram e não bastou.
 *
 * O time não precisa de régua própria para começar: sem documento dele, o
 * servidor devolve o global, e o spec parte exatamente do mesmo estado de
 * antes. O primeiro `PUT` é que cria a linha do time.
 *
 * Os times são criados no `globalSetup` — são de teste, e não têm por que
 * existir num banco de produção.
 *
 * ## E-mail próprio, e não o `dev@gerador.local`
 *
 * Pendurar estes cinco times no `dev` levou a lista dele a 11, e `ListaDeTimes`
 * liga o campo de busca acima de 8: a tela de escolher time da suíte INTEIRA
 * mudava de forma por causa de um dado de teste, e o caminho comum — poucos
 * times, sem busca — deixava de ser exercido por qualquer spec.
 *
 * Com e-mail próprio, o `dev` volta aos 6 dele e este fica com 5: os dois
 * abaixo do limite, os dois vendo a mesma tela que a maioria vê.
 *
 * Devolve o id do time porque o spec precisa dele nas chamadas de API que faz
 * por fora do navegador (`?timeId=`, e o `timeId` do corpo no `PUT`). Deixar o
 * spec remontar a string a partir do sufixo seria a segunda cópia de uma
 * verdade só (§263): mudar o prefixo aqui deixaria as duas metades apontando
 * para times diferentes, e o teste ficaria verde lendo a linha errada.
 */
export const EMAIL_DAS_REGRAS = "regras-e2e@gerador.local";

export async function entrarEmTimeProprio(page: Page, sufixo: string): Promise<string> {
  const timeId = `time-e2e-${sufixo}`;
  await entrar(page, timeId, EMAIL_DAS_REGRAS);
  return timeId;
}

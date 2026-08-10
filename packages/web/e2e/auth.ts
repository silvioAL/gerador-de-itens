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
  // dev@gerador.local tem mais de um time -> EscolherTimeScreen decide qual fica ativo.
  await page.getByRole("button", { name: timeId, exact: true }).click();
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

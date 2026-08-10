import { expect, test } from "@playwright/test";
import { entrar } from "./auth";

/**
 * #280 — recarregar a página perdia o time ativo.
 *
 * Este é um caso que SÓ o navegador prova: o estado vivia em `useState`, e
 * "recarregar" não existe num teste de unidade — o componente é remontado com
 * as mesmas props, o que passa. O que quebrava era o `localStorage` não
 * existir, e isso só aparece num reload de verdade.
 */
test("recarregar mantém o time ativo, em vez de voltar pro 'Qual time?'", async ({ page }) => {
  await entrar(page, "time-portabilidade");

  await page.reload();

  // A tela de escolha não pode voltar...
  await expect(page.getByRole("heading", { name: /qual time/i })).toBeHidden();
  // ...e o app tem que estar utilizável direto.
  await expect(page.getByRole("button", { name: "+ Serviço", exact: true })).toBeVisible({ timeout: 10000 });
});

test("trocar de time e recarregar mantém o NOVO time, não o primeiro da lista", async ({ page }) => {
  // A metade mais perigosa do defeito: cair no "Qual time?" é chato mas
  // visível. Voltar calado pro primeiro time da lista muda quais campos
  // customizados e quais perfis de stack aparecem — e ninguém percebe.
  await entrar(page, "time-portabilidade");

  await page.getByRole("combobox", { name: /time/i }).selectOption("time-checkout");
  await expect(page.getByRole("combobox", { name: /time/i })).toHaveValue("time-checkout");

  await page.reload();

  await expect(page.getByRole("combobox", { name: /time/i })).toHaveValue("time-checkout", { timeout: 10000 });
});

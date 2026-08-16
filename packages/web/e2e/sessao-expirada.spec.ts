import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * §267 — a sessão que morre com a aba aberta.
 *
 * ACHADO REAL (print do usuário): abrir "Contexto do produto" mostrava a tela
 * vazia com um "sessão inválida ou ausente" vermelho no canto — enquanto o
 * cabeçalho seguia exibindo o time ativo, como se estivesse tudo bem. O cookie
 * dura 12h e só era conferido no boot; depois disso o app continuava se achando
 * logado e cada chamada virava um aviso local que não diz o que fazer.
 *
 * Limpar o cookie é exatamente o que o navegador faz quando ele expira — é o
 * jeito de provar isto sem esperar doze horas.
 */
test("sessão expirada leva ao login explicando, em vez de um erro vermelho por tela", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await expect(page.getByRole("button", { name: "☰ Menu" })).toBeVisible();

  // O cookie some, e a aba não sabe disso — que é a situação real.
  await page.context().clearCookies();

  // QUALQUER chamada serve de gatilho, e é isso que o teste não pode fixar: em
  // suíte cheia uma requisição de fundo chega primeiro e o app já saiu para o
  // login antes deste clique — o que é o comportamento certo, e derrubava um
  // teste que insistia em ser ele a disparar. (Passou isolado e falhou na
  // suíte: o formato exato do §262.)
  const jaVoltouAoLogin = await page
    .getByText(/Sua sessão expirou/)
    .isVisible()
    .catch(() => false);
  if (!jaVoltouAoLogin) {
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Contexto do produto" }).click();
  }

  // O que a pessoa vê agora é o caminho de volta, e não um diagnóstico solto.
  await expect(page.getByText(/Sua sessão expirou/)).toBeVisible();
  await expect(page.getByPlaceholder("voce@empresa.com")).toBeVisible();
  // E NÃO a landing: quem estava trabalhando não precisa reler a página de
  // apresentação para descobrir que é só entrar de novo.
  await expect(page.getByRole("button", { name: /Começar/ })).toHaveCount(0);
});

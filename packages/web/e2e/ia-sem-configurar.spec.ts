import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-89 — **a instalação nova responde, sem ninguém configurar nada.**
 *
 * ## O que só este teste prova
 *
 * Todos os outros E2E de IA configuram a credencial antes (`ia-hospedada.spec.ts`
 * grava o preset e testa a conexão). Este NÃO configura nada — e é justamente
 * essa ausência que ele afirma.
 *
 * É a última frase que a pessoa lê no tour: *"a mesa à sua frente está vazia, e
 * a conversa está aberta. Descreva a sua demanda em uma frase e o agente propõe
 * os primeiros componentes."* Antes desta rodada, isso devolvia 503.
 */
test("sem credencial cadastrada, a conversa responde — e vem marcada como simulada", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  /**
   * O status tem que contar a MESMA história das rotas: `pronto` e `simulado`
   * juntos. `pronto` sem `simulado` seria o produto respondendo com texto
   * inventado sem marca — o defeito que a SPEC-74 fatia D existe para evitar.
   */
  const status = await (await page.request.get("http://localhost:4100/ia/status")).json();
  expect(status.pronto, "sem credencial, o dublê declarado deveria responder").toBe(true);
  expect(status.simulado, "respondeu sem dizer que é simulado").toBe(true);

  // E a conversa funciona de verdade: nenhuma tela precisou ser configurada.
  await page.getByTestId("assistente-flutuante").click();
  const campo = page.getByLabel("Descreva a demanda");
  await expect(campo).toBeVisible();
  await campo.pressSequentially("um serviço de catálogo que guarda os produtos");
  await page.getByRole("button", { name: "Enviar" }).click();

  /**
   * A proposta chega — do dublê, com a forma certa e conteúdo inventado.
   *
   * A asserção é sobre a FRASE que o painel escreve ("Proposta: N
   * componente(s)…"), e não sobre um `data-testid`: as duas primeiras escritas
   * deste teste caçaram testids que não existem neste painel (`conversa-proposta`
   * é invenção minha; `proposta-0` é do painel de CONFIGURAÇÃO). A frase é o que
   * a pessoa lê, e é ela que prova que houve resposta.
   */
  await expect(page.getByTestId("conversa-desenho")).toContainText(/Proposta: \d+ componente/, { timeout: 30000 });
});

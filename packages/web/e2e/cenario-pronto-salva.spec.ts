import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * §418 — **carregar um cenário pronto e derivar SALVA a demanda.**
 *
 * ## O relato, com print
 *
 * Cenário pronto carregado, "Derivar Quebra" clicado, nome preenchido,
 * "Derivar e salvar" clicado — e a seção dos itens dizia *"Salve a demanda
 * antes de exportar — sem id da quebra não há o que mandar"*.
 *
 * ## A causa, achada pelo rastro de rede
 *
 * ```
 * -> POST /quebras
 * <- 403
 * ```
 *
 * Os cenários carregam `time` dentro do arquivo (`credito-completo.json` traz
 * `"time-credito"`), e carregá-los copiava esse time para a quebra da pessoa.
 * `podeOperarNaQuebra` exige nível `operar` no time do CORPO — e ninguém opera
 * num time que existe só num arquivo de exemplo.
 *
 * ## Por que E2E, e não teste de unidade
 *
 * Porque o defeito vivia na costura: a tela montava um corpo que o servidor
 * recusava, e **os dois lados estavam certos sozinhos**. Nenhum teste de
 * unidade dos dois lados pegaria isso — foi preciso o navegador falando com o
 * Postgres de verdade. É a régua do §353 desta casa, pela enésima vez.
 */
test.beforeEach(async ({ page }) => {
  // Sem IA configurada: este fluxo é determinístico e não deve depender da
  // credencial que outros specs criam em paralelo (§162).
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("cenário pronto + derivar: a demanda é criada no SEU time, não no do arquivo", async ({ page }) => {
  test.setTimeout(90000);

  const chamadas: { metodo: string; status: number }[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/quebras") {
      chamadas.push({ metodo: r.request().method(), status: r.status() });
    }
  });

  await entrar(page);

  const modal = page.locator('[data-tour="journey-modal-content"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.getByRole("button", { name: /Cenários prontos/ }).click();
  // `credito-completo.json` é o que traz `time: "time-credito"` — é ele que
  // reproduzia o 403, e por isso é ele que este teste carrega.
  await modal.getByRole("button", { name: /crédito/i }).first().click();

  await page.locator('[data-tour="derivar-button"]').click();

  const balao = page.getByTestId("assistente-balao");
  await expect(balao).toContainText("qual é o nome da demanda");
  await balao.getByRole("textbox").fill(`cenário pronto e2e ${Date.now()}`);
  await balao.getByRole("button", { name: "Derivar e salvar" }).click();

  await expect(page.getByTestId("barra-pendencias")).toBeVisible({ timeout: 20000 });

  // A prova direta: a criação foi ACEITA. Era 403 antes da correção.
  await expect
    .poll(() => chamadas.find((c) => c.metodo === "POST")?.status, { timeout: 15000 })
    .toBe(201);

  /**
   * E a prova de que isso chega à TELA: a seção dos itens deixa de pedir que
   * se salve a demanda. É a frase exata do print do relato — se ela voltar,
   * este teste falha.
   */
  for (const id of ["balao-sem-ia", "balao-sem-contexto"]) {
    if (await page.getByTestId(id).isVisible().catch(() => false)) {
      await page.getByTestId(id).getByRole("button", { name: "Dispensar sugestão" }).click();
      await page.waitForTimeout(500);
    }
  }
  const botaoItens = page.getByTestId("balao-gerar-itens").or(page.getByTestId("balao-especificacao-itens")).first();
  await botaoItens.waitFor({ timeout: 20000 });
  await botaoItens.click();

  await expect(page.getByTestId("secao-dos-itens")).toBeVisible();
  await expect(page.getByTestId("motivo-exportar-desabilitado")).not.toContainText("Salve a demanda antes de exportar");
});

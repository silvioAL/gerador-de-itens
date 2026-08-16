import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * Revisão de cobertura — dois caminhos entregáveis que não tinham E2E nenhum.
 *
 * 1. Baixar o diagrama completo (.html): a SPEC-21 construiu um artefato que
 *    sai da ferramenta e vai parar num chat, num wiki, num anexo de ticket.
 *    Só teste de unidade do gerador existia — nada provava que o BOTÃO produz
 *    arquivo, e "o download veio vazio" é o tipo de defeito que só aparece com
 *    alguém baixando.
 * 2. Ajuste de PAPEL da esteira (SPEC-50) aplicado pela tela: o PDCA já tinha
 *    E2E para regras (`pdca-jornada`) e para a ficha (`pdca-ficha`), e o
 *    terceiro alvo — o pipeline — nunca foi percorrido no navegador.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("baixar o diagrama completo entrega um HTML com os componentes desenhados", async ({ page }) => {
  test.setTimeout(60000);
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await derivarNaMesa(page);
  await page.getByTestId("assistente-balao-secundaria").click(); // sem título

  await page.getByRole("button", { name: "🔍 Ver diagrama completo" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar diagrama (.html)" }).click();

  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toMatch(/\.html$/);

  // O conteúdo importa: um HTML vazio baixaria igualzinho e passaria num teste
  // que só olhasse o nome do arquivo.
  const caminho = await arquivo.path();
  const conteudo = await (await import("node:fs/promises")).readFile(caminho!, "utf-8");
  expect(conteudo).toContain("<html");
  expect(conteudo.toLowerCase()).toContain("mongo");
  expect(conteudo.length).toBeGreaterThan(1000);
});

test("SPEC-50 pela tela: ajuste de papel aprovado e aplicado desliga o papel na esteira", async ({ page }) => {
  test.setTimeout(60000);
  await entrar(page);

  const original = (await (await page.request.get(`${API}/config/pipeline-agentes`)).json()).documento;
  const marca = `QA sobra nos itens — e2e ${Date.now()}`;
  try {
    // Um pipeline conhecido, para o teste não depender do que estiver salvo.
    await page.request.put(`${API}/config/pipeline-agentes`, {
      data: {
        documento: {
          confirmacaoObrigatoria: true,
          papeis: [
            { id: "po", nome: "PO", grupo: "po", ativo: true, contextos: [] },
            { id: "qa", nome: "QA", grupo: "qa", ativo: true, contextos: [] },
          ],
        },
      },
    });
    await page.request.post(`${API}/pdca/feedback`, { data: { texto: marca } });

    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: /PDCA/ }).click();

    const feedback = page.locator('[data-testid^="feedback-"]', { hasText: marca });
    await expect(feedback).toBeVisible({ timeout: 10000 });
    await feedback.getByRole("button", { name: "✨ Propor ajuste" }).click();

    // O alvo que faltava: a esteira de agentes.
    await page.getByLabel("Documento a ajustar").selectOption("pipeline-agentes");
    await page.getByLabel("Papel da esteira").selectOption("qa");
    await expect(page.getByLabel("Ligar ou desligar")).toHaveValue("desligar");
    // A prévia do pipeline responde outra pergunta que não a das regras: o que
    // deixa de ter dono no item.
    await expect(page.getByTestId("previa-do-pipeline")).toContainText("para de escrever");

    await page.getByTestId("salvar-ajuste").click();

    const ajuste = page.locator('[data-testid^="ajuste-"]', { hasText: marca });
    await expect(ajuste).toBeVisible();
    await expect(ajuste).toContainText("Desligar o papel");
    await ajuste.getByRole("button", { name: "Aprovar" }).click();
    await ajuste.getByRole("button", { name: "Aplicar agora" }).click();
    await expect(ajuste).toContainText("aplicada");

    // O documento mudou de verdade — e só o papel pedido.
    const depois = (await (await page.request.get(`${API}/config/pipeline-agentes`)).json()).documento;
    const porId = (id: string) => depois.papeis.find((p: { id: string }) => p.id === id);
    expect(porId("qa").ativo).toBe(false);
    expect(porId("po").ativo).toBe(true);
    expect(depois.confirmacaoObrigatoria).toBe(true);
  } finally {
    await page.request.put(`${API}/config/pipeline-agentes`, { data: { documento: original } });
  }
});

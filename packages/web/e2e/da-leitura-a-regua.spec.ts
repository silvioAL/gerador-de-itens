import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-67 — o clique que faltava.
 *
 * O ciclo que nenhum teste de unidade prova: o produto **lê** um fato do
 * desenho, a pessoa clica uma vez, o construtor abre **preenchido**, ela
 * publica — e o mesmo desenho que produziu o fato passa a ser acusado pela
 * régua que ele gerou.
 *
 * É o elo que a SPEC-65 §6.3 prometeu e o §292 não entregou, porque
 * `limita-grau` não existia.
 *
 * ## Sobre config global
 *
 * Este spec GRAVA em `regras.topologia`, e o `forma-do-desenho` também.
 *
 * §299 — por isso o restore remove **só o item que este spec criou**, relendo o
 * documento na hora. Restaurar a LISTA que se leu no começo apaga o que o
 * vizinho gravou no intervalo: o sintoma aparece no teste dele, e a causa está
 * aqui — a assinatura do §281.
 */
test("§295 — do fato à régua num clique, e o desenho que a gerou passa a ser acusado", async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  try {
    // O cenário do §290: `srv-credito-api` faz três chamadas que esperam.
    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

    // ── A leitura diz o fato ──
    await page.getByTestId("leitura-resumo").click();
    const fanout = page.getByTestId("leitura-fanout-n1");
    await expect(fanout).toContainText("3");

    // ── UM clique ──
    await fanout.getByTestId("virar-regua-n1-fan-out").click();

    // O construtor abriu, na seção certa, e preenchido. Ninguém digitou nada.
    await expect(page.getByTestId("forma-veio-da-leitura")).toBeVisible();
    const texto = page.getByLabel("Texto da régua de forma");
    // §4 — o máximo nasce em `atual - 1`: a régua tem que cobrar o desenho que
    // a motivou, e nascer permitindo-o faria o primeiro uso parecer quebrado.
    await expect(texto).toHaveValue(/no máximo 2 chamadas antes de responder/);
    await expect(page.getByLabel("Máximo de conexões")).toHaveValue("2");
    // §242 — o porquê veio junto.
    await expect(page.getByLabel("Por que esta régua existe")).toHaveValue(/derruba as outras/);
    // A prévia confirma que a régua só conta o que espera — sem isso ela
    // acusaria o desenho assíncrono correto.
    await expect(page.getByTestId("forma-previa")).toContainText("que esperam resposta");

    // ── Publicar continua sendo um gesto próprio ──
    await page.getByTestId("adicionar-forma").click();
    await expect
      .poll(async () => {
        const doc = await (await page.request.get(`${API}/config/regras`)).json();
        return (doc.documento?.topologia ?? []).filter(
          (r: { checagem?: { tipo?: string } }) => r.checagem?.tipo === "limita-grau"
        ).length;
      }, { timeout: 10000 })
      .toBe(1);

    // ── E o desenho que gerou a régua passa a ser acusado por ela ──
    await page.getByRole("button", { name: /Voltar à mesa de projeto/ }).click();
    const chip = page.getByTestId("conformidade-resumo");
    await expect(chip).toContainText("fora do padrão");
    await chip.click();
    const lista = page.getByTestId("conformidade-lista");
    await expect(lista).toContainText("no máximo 2 chamadas antes de responder");
    // O número real, e não "acima do máximo": sem ele a frase não diz de
    // quanto é o excesso.
    await expect(lista).toContainText("3 conexões que esperam");
  } finally {
    // Remove só o PRÓPRIO item, relendo agora.
    //
    // §299 — devolver "só o campo `topologia`" não bastou: o
    // `forma-do-desenho` também mexe nele, e restaurar a LISTA que este spec
    // leu no começo apaga a régua que o vizinho gravou no intervalo. Passou
    // local por sorte de timing e falhou na CI. A unidade certa de restauração
    // é o item, não o campo.
    const atual = (await (await page.request.get(`${API}/config/regras`)).json()).documento ?? {};
    await page.request.put(`${API}/config/regras`, {
      data: {
        documento: {
          ...atual,
          topologia: (atual.topologia ?? []).filter(
            (r: { checagem?: { tipo?: string } }) => r.checagem?.tipo !== "limita-grau"
          ),
        },
      },
    });
  }
});

test("§295 — a leitura de CADEIA não oferece o verbo, porque ele não levaria a lugar nenhum", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();
  await page.getByTestId("leitura-resumo").click();

  // §4.2 — profundidade é sobre CAMINHO, e caminho já tem escopo próprio
  // (`percursos[]`). Uma checagem de topologia para isso seria a mesma
  // pergunta em dois lugares.
  const cadeia = page.getByTestId("leitura-cadeia");
  await expect(cadeia).toContainText("saltos que esperam");
  await expect(cadeia.locator('[data-testid^="virar-regua-"]')).toHaveCount(0);
  // E o fan-out, ao lado, oferece — o verbo aparece só onde leva a algum lugar.
  await expect(page.getByTestId("leitura-fanout-n1").locator('[data-testid^="virar-regua-"]')).toHaveCount(1);
});

import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * §299 — os dois specs desta suíte gravam em `regras.topologia`, e por isso
 * moram no MESMO arquivo, em série.
 *
 * Estavam separados, cada um restaurando a lista que leu no começo — e o
 * `finally` de um apagava a régua que o outro tinha acabado de gravar. Passou
 * local por sorte de timing e falhou na CI. Restaurar "só o campo" não resolve
 * quando dois specs disputam o mesmo campo: a única garantia é não disputá-lo.
 *
 * Mesma disciplina (e mesmo remédio) do `conformidade` e do
 * `rbac-cadeado-e-pedido`: um por vez.
 */
test.describe.configure({ mode: "serial" });


/**
 * SPEC-63 — a régua sobre a FORMA do desenho, do ciclo inteiro.
 *
 * O que só o navegador prova: a régua criada **pela tela** chega ao documento
 * de regras do deploy, o motor a aplica sobre um desenho de verdade, ela acusa
 * no placar, e a exceção com motivo a silencia sem apagá-la.
 *
 * ## Sobre mexer em config global
 *
 * O §281 custou três specs vizinhos ensinando que config global em suíte
 * paralela é estado compartilhado.
 *
 * §299 — quando isto foi escrito, a nota aqui dizia que "as réguas de forma não
 * existem em nenhum outro spec". **Deixou de ser verdade** no §295, e o custo
 * apareceu na CI: dois specs disputando `regras.topologia`, cada um restaurando
 * a lista que leu no começo. Por isso os dois moram neste arquivo, em série —
 * ver a nota do topo.
 */
test("§287 — a régua de forma nasce na tela, acusa o desenho e a exceção a silencia", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  try {
    // ── A régua nasce pela TELA, não por JSON (fatia D) ──
    await page.goto("/#/config/regras");
    await page.getByTestId("secao-forma").click();
    await expect(page.getByTestId("forma-vazia")).toBeVisible();

    await page.getByLabel("Texto da régua de forma").fill("Toda fila tem consumidor");
    await page
      .getByLabel("Por que esta régua existe")
      .fill("fila sem quem consuma acumula em silêncio até estourar o disco");
    await page.getByLabel("Componente da régua").selectOption({ label: "Fila Rabbit" });
    // A frase que a pessoa vai ler no placar, montada antes de gravar.
    await expect(page.getByTestId("forma-previa")).toContainText("Todo Fila Rabbit precisa de uma conexão");
    await page.getByTestId("adicionar-forma").click();

    await expect(page.getByTestId("forma-regra-forma-toda-fila-tem-consumidor")).toBeVisible();
    // Chegou ao documento de regras do deploy — não só ao estado da tela.
    await expect
      .poll(async () => {
        const doc = await (await page.request.get(`${API}/config/regras`)).json();
        return (doc.documento?.topologia ?? []).length;
      }, { timeout: 10000 })
      .toBe(1);

    // ── O motor aplica sobre um desenho de verdade (fatias A e B) ──
    await page.getByRole("button", { name: /Voltar à mesa de projeto/ }).click();
    await page.getByRole("button", { name: "+ Fila Rabbit" }).click();

    const chip = page.getByTestId("conformidade-resumo");
    await expect(chip).toContainText("fora do padrão");
    await chip.click();
    const lista = page.getByTestId("conformidade-lista");
    await expect(lista).toContainText("Toda fila tem consumidor");
    // §242 — o porquê é o que separa ensinar de cobrar.
    await expect(lista).toContainText("acumula em silêncio");

    // ── A válvula: aceitar com motivo tira do que cobra (fatia C) ──
    await lista.getByRole("button", { name: /Aceitar de propósito/ }).first().click();
    await lista.getByLabel(/Motivo para aceitar/).first().fill("o consumidor entra na próxima demanda");
    await lista.getByRole("button", { name: /Confirmar exceção/ }).first().click();

    // Sai do vermelho sem sair do histórico: o chip some porque nada mais cobra.
    await expect(page.getByTestId("conformidade-resumo")).toHaveCount(0);
  } finally {
    // §299 — remove só o PRÓPRIO item, relendo agora. Restaurar a lista
    // `topologia` que este spec leu no começo apagaria a régua que o
    // `da-leitura-a-regua` gravou no intervalo: os dois mexem no mesmo campo,
    // e a unidade certa de restauração é o item, não o campo.
    const atual = (await (await page.request.get(`${API}/config/regras`)).json()).documento ?? {};
    await page.request.put(`${API}/config/regras`, {
      data: {
        documento: {
          ...atual,
          topologia: (atual.topologia ?? []).filter(
            (r: { id?: string }) => r.id !== "forma-toda-fila-tem-consumidor"
          ),
        },
      },
    });
  }
});

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
 * Este spec GRAVA em `regras.topologia`. O restore devolve **só o próprio
 * item**, relendo o documento na hora — e o arquivo inteiro roda em série,
 * porque o vizinho acima disputa o mesmo campo (§299).
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

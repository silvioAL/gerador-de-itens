import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import {
  BASE_URL_GATEWAY_FALSO,
  CHAVE_GATEWAY_FALSO,
  MODELO_GATEWAY_FALSO,
  PEDIR_FALHA_AO_GATEWAY,
} from "./gatewayFalso";

const API = "http://localhost:4100";

// §265 — em série: os dois testes mexem na MESMA esteira (estado da
// organização, não da aba). Em paralelo, o toggle de um caía no meio da
// asserção do outro — e a falha aparecia como "esperava falhou, veio
// desligado", que aponta para o lugar errado.
test.describe.configure({ mode: "serial" });

/**
 * SPEC-59 fatias A/B/D — o mapa do sistema, ponta a ponta.
 *
 * As unidades provam o modelo de leitura e a tela em separado. O que só o
 * navegador prova é que a edição feita AQUI chega ao servidor: um toggle que
 * pinta a tela e não grava é a pior versão desta feature, porque a pessoa sai
 * achando que configurou.
 */
test("o mapa mostra a esteira, e ligar/desligar por ele grava de verdade", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByTestId("menu-sistema").click();
  await expect(page.getByTestId("sistema-screen")).toBeVisible();

  // A esteira de fábrica, como sequência.
  await expect(page.getByTestId("agente-po")).toBeVisible();
  await expect(page.getByTestId("agente-qa")).toBeVisible();

  const estadoInicial = await page.getByTestId("agente-po").getAttribute("data-estado");
  expect(estadoInicial).not.toBe("desligado");

  // Desligar pelo mapa.
  await page.getByTestId("alternar-po").click();
  await expect(page.getByTestId("agente-po")).toHaveAttribute("data-estado", "desligado");

  // O que importa não é a tela ter pintado: é o servidor ter recebido.
  await expect
    .poll(
      async () => {
        const cfg = await (await page.request.get(`${API}/config/pipeline-agentes`)).json();
        return cfg.documento.papeis.find((p: { id: string }) => p.id === "po")?.ativo;
      },
      { timeout: 15000 }
    )
    .toBe(false);

  // E religar volta ao que era — a ação é reversível em um clique, que é o que
  // dispensa o modal de "ver o efeito antes de aplicar": o efeito é o mapa.
  await page.getByTestId("alternar-po").click();
  await expect
    .poll(
      async () => {
        const cfg = await (await page.request.get(`${API}/config/pipeline-agentes`)).json();
        return cfg.documento.papeis.find((p: { id: string }) => p.id === "po")?.ativo;
      },
      { timeout: 15000 }
    )
    .toBe(true);
});

/**
 * SPEC-60 fatia B (§265) — o rastro da esteira acendendo (e apagando) o avatar.
 *
 * As unidades provam o mapa e a tela; o servidor prova o registro. O que só o
 * navegador prova é a costura: a chamada falha de verdade contra um gateway de
 * verdade, o servidor grava, a tela lê e o avatar muda de cor.
 *
 * A falha viaja no PEDIDO (`PEDIR_FALHA_AO_GATEWAY`) em vez de numa credencial
 * quebrada: credencial é estado da organização inteira, e sabotá-la com specs
 * rodando em paralelo seria um teste derrubando os vizinhos.
 */
test("falha de um papel acende o avatar no mapa, e a execução seguinte o apaga", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Modelo de IA" }).click();
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");

  const pedirAoPapel = (texto: string) =>
    page.request.post(`${API}/ia/pipeline/po`, {
      data: {
        itens: [
          {
            chave: "item-1",
            rotulo: texto,
            contextoNo: "Backend",
            placeholders: [{ chave: "regra", tech: "Backend", rotulo: "regra de negócio" }],
          },
        ],
      },
    });

  // Reabrir o mapa é o que refaz a leitura do rastro: a busca acontece quando a
  // tela monta. Voltar antes é obrigatório — com o mapa aberto, o "☰ Menu" fica
  // atrás do "← Voltar à mesa de projeto" e o clique nunca chega.
  const abrirMapa = async () => {
    const voltar = page.getByRole("button", { name: "← Voltar à mesa de projeto" });
    if (await voltar.isVisible().catch(() => false)) await voltar.click();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByTestId("menu-sistema").click();
    await expect(page.getByTestId("sistema-screen")).toBeVisible();
  };

  await abrirMapa();
  // O papel precisa estar LIGADO para que "falhou" seja o estado esperado —
  // desligado ganha de falhou, e com razão. O teste anterior deste arquivo
  // mexe justamente nesse interruptor, então garantir aqui é mais honesto do
  // que depender da ordem.
  if ((await page.getByTestId("agente-po").getAttribute("data-estado")) === "desligado") {
    await page.getByTestId("alternar-po").click();
    await expect(page.getByTestId("agente-po")).not.toHaveAttribute("data-estado", "desligado");
  }

  const falha = await pedirAoPapel(PEDIR_FALHA_AO_GATEWAY);
  expect(falha.status()).toBe(502);

  await abrirMapa();
  await expect(page.getByTestId("agente-po")).toHaveAttribute("data-estado", "falhou");
  // O conteúdo, não só o estado (§234): a frase que o gateway disse é o que
  // resolve o problema de quem abriu o mapa por causa da falha.
  await expect(page.getByTestId("ultima-execucao-po")).toContainText("última execução");
  // E o mapa não deixa isso só na bolinha: o aviso diz o que a falha custa.
  await expect(page.getByTestId("sistema-screen")).toContainText("o item sai sem a parte que eles escrevem");

  // A execução seguinte, boa, APAGA o vermelho. Um estado que só acende é um
  // alarme que se aprende a ignorar.
  const ok = await pedirAoPapel("um item comum");
  expect(ok.status()).toBe(200);

  await abrirMapa();
  await expect(page.getByTestId("agente-po")).toHaveAttribute("data-estado", "ativo");
  await expect(page.getByTestId("ultima-execucao-po")).toBeVisible();
});

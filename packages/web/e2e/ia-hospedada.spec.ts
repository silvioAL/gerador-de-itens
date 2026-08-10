import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";
import {
  BASE_URL_GATEWAY_FALSO,
  CHAVE_GATEWAY_FALSO,
  MARCA_GATEWAY_FALSO,
  MODELO_GATEWAY_FALSO,
} from "./gatewayFalso";

/**
 * SPEC-31 Fase 4 — o modo hospedado exercitado NO NAVEGADOR.
 *
 * A pergunta que este arquivo responde é a da retrospectiva: *por que a suíte
 * estava verde e quatro defeitos chegaram ao usuário mesmo assim?* Porque a
 * suíte do server usa `app.inject()`, que chama o handler direto — sem CORS,
 * sem navegador, sem tela. Os quatro defeitos moravam justamente nesse vão.
 *
 * Aqui não há mock nenhum: o Chromium fala com o Fastify de verdade, que fala
 * HTTP de verdade com o gateway falso (`gatewayFalso.ts`), que responde SSE de
 * verdade. A única mentira é o conteúdo da resposta, que precisa ser fixo pro
 * teste poder afirmar algo.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

/** A aba "Modelo de IA" dentro da tela de Configurações. */
async function abrirModeloIa(page: Page) {
  await page.getByRole("button", { name: "⚙ Configurações" }).click();
  await page.getByRole("button", { name: "Modelo de IA" }).click();
}

test("aba Modelo de IA no hospedado mostra o formulário do gateway, não um comando que não existe", async ({
  page,
}) => {
  await entrar(page);
  await abrirModeloIa(page);

  // ACHADO REAL (print do usuário): a tela mostrava SÓ "o modelo de embedding
  // não está instalado — rode `gerador ia instalar`", sem formulário nenhum.
  // O comando não existe em container e, por decisão da Fase 4, nunca vai
  // existir. O erro não era da tela: era `/ia/status` devolvendo
  // `modelosChat: []` e `embeddingInstalado: false` — valores honestos sobre
  // "não tenho modelo local", lidos com a semântica do outro modo.
  await expect(page.getByText(/gerador ia instalar/)).toHaveCount(0);

  const card = page.getByTestId("modelo-ia-gateway");
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Base URL do gateway")).toBeVisible();
  await expect(card.getByLabel("Chave de API")).toBeVisible();
  await expect(card.getByLabel("Nome do modelo")).toBeVisible();
});

test("configurar o gateway pela tela: testar antes de salvar, salvar, e a base URL sobreviver ao reload", async ({
  page,
}) => {
  await entrar(page);
  await abrirModeloIa(page);

  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);

  // ACHADO REAL: "Testar conexão" é o botão que se usa ANTES de salvar — é o
  // ponto dele. A primeira versão da rota só olhava a credencial gravada, então
  // o primeiro teste da vida sempre respondia "nenhuma credencial configurada"
  // enquanto a pessoa olhava pros três campos preenchidos.
  await card.getByRole("button", { name: "Testar conexão" }).click();
  const resultado = page.getByTestId("gateway-resultado");
  await expect(resultado).toContainText(MARCA_GATEWAY_FALSO, { timeout: 15000 });

  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(resultado).toContainText("Credencial salva");

  // A chave NUNCA volta do servidor: o campo fica vazio e o placeholder mostra
  // só a máscara. Se um dia a chave inteira voltar, esta asserção é a que grita.
  await page.reload();
  // O time ativo mora em memória, não na sessão: recarregar a página cai de
  // volta em "Qual time?". Não é o alvo deste teste — mas é um atrito real,
  // registrado como tarefa própria em vez de escondido atrás de um helper.
  await page.getByRole("button", { name: "time-pagamentos", exact: true }).click();
  await abrirModeloIa(page);
  const cardRecarregado = page.getByTestId("modelo-ia-gateway");
  await expect(cardRecarregado.getByLabel("Base URL do gateway")).toHaveValue(BASE_URL_GATEWAY_FALSO);
  const chave = cardRecarregado.getByLabel("Chave de API");
  await expect(chave).toHaveValue("");
  await expect(chave).toHaveAttribute("placeholder", /chave atual: /);
  await expect(chave).not.toHaveAttribute("placeholder", new RegExp(CHAVE_GATEWAY_FALSO));
});

test("a esteira roda no navegador e o texto do gateway chega nos campos (o defeito de CORS)", async ({ page }) => {
  await entrar(page);

  // Erros de console viram falha: o defeito de CORS se manifestava como um
  // `fetch` rejeitado que a tela engolia — todos os campos vazios, nenhuma
  // mensagem. Sem esta captura, um teste que só olha a tela poderia dar o
  // mesmo veredito silencioso.
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });

  await abrirModeloIa(page);
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();

  // Um nó completo o bastante pra derivar — mesmo caminho de
  // `derivar-e-revisar.spec.ts`.
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
  await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  await page.getByRole("button", { name: "Derivar Quebra" }).click();
  await expect(page.getByText("1 itens")).toBeVisible();

  // A esteira começa sozinha quando `/ia/status` diz que dá pra usar IA — com a
  // credencial salva, diz. Este é o ponto exato do defeito: com o `curl` o JSON
  // chegava inteiro, e no navegador o `fetch` era rejeitado por falta dos
  // cabeçalhos de CORS (o `reply.raw.writeHead` pulava os hooks do Fastify).
  // O resultado era o relato do usuário: "todos os campos vazios".
  await expect(page.getByText(new RegExp(MARCA_GATEWAY_FALSO)).first()).toBeVisible({ timeout: 60000 });

  await page.screenshot({ path: "e2e/screenshots/ia-hospedada.png", fullPage: true });

  expect(erros, `Erros no console do browser:\n${erros.join("\n")}`).toEqual([]);
});

test("credencial errada é reportada como resultado do teste, não como erro genérico de rede", async ({ page }) => {
  await entrar(page);
  await abrirModeloIa(page);

  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill("chave-errada");
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByRole("button", { name: "Testar conexão" }).click();

  // O gateway falso devolve 401 pra chave errada, e o provedor traduz isso
  // numa frase que diz o que fazer. "Failed to fetch" seria a mesma informação
  // que nenhuma informação.
  await expect(page.getByTestId("gateway-resultado")).toContainText(/Credencial recusada/i, { timeout: 15000 });
});

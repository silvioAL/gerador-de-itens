import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-57 fatia B (§239) — o padrão virando régua, no navegador.
 *
 * O que só o navegador prova é a costura: o valor digitado no painel do
 * componente chega ao motor, e a violação aparece no placar do topo — onde a
 * decisão é tomada, não numa aba de relatório.
 *
 * Duas coisas que este teste aprendeu apanhando, e que valem para os próximos:
 *
 * 1. **As regras vivem no DOCUMENTO do banco** (SPEC-36), não em
 *    `regras.example.json` — editar o arquivo não muda o app rodando.
 * 2. **O documento é por TIME**: o global vem vazio, e é o do time que a
 *    derivação lê.
 *
 * Daí o time próprio: regras são estado global do time, e sobrescrever as de um
 * time compartilhado quebraria specs vizinhos em paralelo — a mesma fragilidade
 * que já custou duas rodadas com a credencial de IA (§233). Time novo é
 * isolamento de graça, porque quem cria vira owner.
 */
/**
 * Os obrigatórios da API Externa, para o portão de prontidão liberar a
 * derivação — vermelho bloqueia, e é assim que deve ser. Preenchidos por nome
 * (e não varrendo a tela): campo obrigatório novo no tipo deve QUEBRAR este
 * teste, para alguém decidir o que ele vale aqui.
 */
async function preencherObrigatorios(painel: import("@playwright/test").Locator) {
  await painel.getByRole("textbox", { name: "Nome da API" }).fill("api-parceiro");
  await painel.getByRole("combobox", { name: "Autenticação" }).selectOption({ index: 1 });
  await painel.getByRole("checkbox", { name: /Rate limit/ }).check();
}

test("valor fora do padrão aparece no placar, chega ao item, e some quando entra na régua", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // O documento GLOBAL, e não o do time: o cliente web lê `/config/regras`
  // SEM `timeId` (`loadConfig.ts`), então o override por time — que a API
  // suporta — nunca chega à tela. Escrever no do time faria este teste
  // configurar um padrão que o app jamais aplicaria.
  const antes = await (await page.request.get(`${API}/config/regras`)).json();
  const documento = JSON.parse(JSON.stringify(antes.documento));
  documento.porTech = documento.porTech ?? {};
  documento.porTech.Backend = documento.porTech.Backend ?? { checklistTecnico: [], testes: [] };
  // Escopado em "Backend-chamadas http": nenhum outro spec desenha API Externa,
  // então a janela em que o padrão existe não muda o resultado de ninguém.
  documento.porTech.Backend.checklistTecnico = [
    ...(documento.porTech.Backend.checklistTecnico ?? []),
    {
      texto: "Definir timeout da chamada externa",
      contextos: ["Backend-chamadas http"],
      checagem: { campo: "timeoutMs", operador: "lte", valor: 500, unidade: "ms" },
    },
  ];
  expect((await page.request.put(`${API}/config/regras`, { data: { documento } })).status()).toBe(200);

  try {
  await page.reload();

  await page.getByRole("button", { name: "+ API Externa" }).click();
  await page.locator(".react-flow__node", { hasText: "API Externa" }).click();

  const painel = page.locator("aside");
  const timeout = painel.getByRole("spinbutton", { name: /Timeout/ });

  // Dentro do padrão: nada a acusar.
  await timeout.fill("300");
  await expect(page.getByTestId("conformidade-resumo")).toHaveCount(0);

  // Fora: o placar conta, e o título diz o que se esperava — número sem o
  // esperado ao lado não ensina o conserto.
  await timeout.fill("800");
  const chip = page.getByTestId("conformidade-resumo");
  await expect(chip).toContainText("1 fora do padrão");
  await expect(chip).toHaveAttribute("title", /≤ 500ms/);

  // §240 — e o padrão CHEGA AO ITEM: com o valor fora da régua, derivar produz
  // um item de ajuste, com o esperado e o atual dentro. Enquanto a violação só
  // existia no placar, ela morria na tela — quem implementa lê o backlog.
  await timeout.fill("800");
  await preencherObrigatorios(painel);
  await page.locator('[data-tour="derivar-button"]').click();
  const perguntaNome = page.getByLabel("ex.: Fatura mensal em lote");
  if (await perguntaNome.count()) {
    await perguntaNome.fill("Chamada fora do padrão");
    await page.getByTestId("assistente-balao-confirmar").click();
  }
  await expect(page.getByTestId("contagem-itens")).toBeVisible();

  // O card do item usa a CHAVE como testid, e a chave da conformidade termina
  // no campo violado — seletor estável sem depender do id gerado do nó.
  // A chave é `<idDoNo>::padrao::<campo>`, e o id do primeiro nó de uma mesa
  // vazia é `n1` — determinístico, como todo o resto da derivação. Tentei
  // seletor por sufixo (CSS `$=` e `getByTestId` com regex) e nenhum casou com
  // os `::` da chave; o valor exato casa.
  const cardDoPadrao = page.locator('[data-testid="item-n1::padrao::timeoutMs"]');
  await expect(cardDoPadrao).toHaveCount(1);
  await cardDoPadrao.click();
  // A ficha traz os DOIS números: sem eles quem implementa volta ao desenho.
  await expect(page.getByText(/Ajustar timeoutMs .* para ≤ 500ms/)).toBeVisible();
  await expect(page.getByText(/está 800/)).toBeVisible();

  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  // Corrigir faz sumir — a régua é sobre o VALOR, não sobre ter mexido.
  await timeout.fill("450");
  await expect(page.getByTestId("conformidade-resumo")).toHaveCount(0);
  } finally {
    // Regras são estado GLOBAL — devolver é a disciplina do §162 com os papéis.
    await page.request.put(`${API}/config/regras`, { data: { documento: antes.documento } });
  }
});

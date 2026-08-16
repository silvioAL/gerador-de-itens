import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * Confere o texto de uma seção por `textContent`, e não por `toContainText`.
 *
 * Não é preferência: `toContainText` lê o texto RENDERIZADO (innerText), e
 * nesta subárvore o innerText volta só com o título — verificado com sete
 * amostragens ao longo de três segundos, em que `textContent` tinha o texto o
 * tempo todo e o matcher continuava vendo o estado anterior. O produto está
 * certo; o matcher é que não serve aqui.
 */
async function textoDaSecao(page: import("@playwright/test").Page, testid: string, esperado: string) {
  await expect
    .poll(async () => (await page.getByTestId(testid).evaluate((e) => e.textContent ?? "")), { timeout: 10000 })
    .toContain(esperado);
}

/**
 * SPEC-58 — o documento de desenho, ponta a ponta no navegador.
 *
 * As unidades provam a estrutura, o HTML e a tela em separado. O que só o
 * navegador prova é a costura: o que a mesa sabe aparece no documento, o que a
 * pessoa escreve nele SOBREVIVE ao recarregar (é a regra 3 — se falhar uma
 * vez, ninguém escreve de novo), e o "aprovado" para de mentir quando o
 * desenho muda depois.
 */
test("o documento tem leitor, guarda o que a pessoa escreveu, e o aprovado para de mentir", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Semeado pela API (padrão do §213): o que este spec exercita é o DOCUMENTO,
  // e passar pelo fluxo de nomear a demanda só acrescentaria pontos de falha
  // que outras suítes já cobrem.
  const titulo = `documento ${Date.now()}`;
  const criada = await page.request.post(`${API}/quebras`, {
    data: {
      titulo,
      time: "time-pagamentos",
      demandInfo: "Reduzir a latência da vitrine.",
      diagrama: {
        nodes: [
          {
            id: "n1",
            type: "service",
            x: 120,
            y: 120,
            label: "srv-catalogo",
            status: "novo",
            spec: { nome: { valor: "srv-catalogo", origem: "manual" } },
            specNA: {},
          },
        ],
        edges: [],
      },
    },
  });
  expect(criada.status()).toBe(201);
  const idDaQuebra = (await criada.json()).id as string;
  await page.reload();

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
  await page.getByRole("button", { name: new RegExp(titulo) }).click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(titulo);

  // O documento pelo menu — o caminho que a pessoa usa.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByTestId("menu-documento").click();
  await expect(page.getByTestId("documento-screen")).toBeVisible();

  // O que a mesa sabe está no documento: título, contexto e o desenho embutido.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(titulo);
  await expect(page.getByText("Reduzir a latência da vitrine.")).toBeVisible();
  await expect(page.getByTestId("documento-diagrama")).toBeVisible();
  // Demanda sem decisão arquitetural NÃO parece incompleta — a SPEC inteira.
  await expect(page.getByText(/nem toda mudança move arquitetura/)).toBeVisible();

  // Fatia 2 — o que a pessoa escreve.
  const riscos = `o parceiro pode mudar o contrato ${Date.now()}`;
  await page.getByTestId("secao-riscos").getByText(/aceitando correr/).click();
  const campo = page.getByLabel("Riscos e o que pode dar errado");
  // `pressSequentially` e não `fill`: em componente controlado, `fill` escreve
  // direto no DOM e o React pode não disparar `onChange` — e aí `toHaveValue`
  // passa lendo o valor que o próprio teste escreveu, sem estado nenhum ter
  // mudado. Falso positivo clássico, e foi o que este teste pegou.
  await campo.pressSequentially(riscos);
  await campo.blur();

  // A pergunta que importa não é "o DOM pintou?", é "SOBREVIVEU?" — é a regra
  // 3 da SPEC-58. Conferir no servidor separa as duas causas possíveis de
  // falha: não salvou, ou salvou e não voltou.
  await expect
    .poll(async () => (await (await page.request.get(`${API}/quebras/${idDaQuebra}`)).json()).documentoEscrito?.riscos, {
      timeout: 15000,
    })
    .toBe(riscos);

  // Fatia 3 — aprovar carimba o documento do momento.
  await page.getByTestId("status-documento").click();
  await page.getByTestId("status-aprovado").click();
  await expect(page.getByTestId("status-documento")).toContainText("aprovado");
  await expect(page.getByTestId("documento-desatualizado")).toHaveCount(0);

  // O autosave é debounced (2s): recarregar antes dele perderia a aprovação, e
  // o teste acusaria o produto por uma corrida que ele mesmo criou.
  await expect
    .poll(async () => (await (await page.request.get(`${API}/quebras/${idDaQuebra}`)).json()).documentoStatus, {
      timeout: 15000,
    })
    .toBe("aprovado");

  // REABRIR é o teste de verdade da regra 3 — e é o caminho onde o §250
  // encontrou o defeito: `abrirPorId` reconstruía a quebra campo a campo e
  // deixava de fora tudo que foi acrescentado desde o §184.
  await page.reload();
  // O F5 preserva a rota (`#/documento`, hash), e a tela do documento cobre o
  // header — inclusive o ☰. Voltar à mesa primeiro é o que uma pessoa faria.
  await page.getByRole("button", { name: "← Voltar à mesa de projeto" }).click();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
  await page.getByRole("button", { name: new RegExp(titulo) }).click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(titulo);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByTestId("menu-documento").click();
  await textoDaSecao(page, "secao-riscos", riscos);
  await expect(page.getByTestId("status-documento")).toContainText("aprovado");

  // Mudar o desenho depois da aprovação: o selo para de mentir.
  await page.getByRole("button", { name: "← Voltar à mesa de projeto" }).click();
  await page.locator(".react-flow__node").first().click();
  const nome = page.locator("aside").getByRole("textbox", { name: "Nome do serviço" });
  await nome.click();
  await nome.press("End");
  await nome.pressSequentially("-v2");
  await nome.blur();
  // O desenho precisa ter mudado DE VERDADE antes de conferir o selo — senão o
  // teste acusaria a regra por uma edição que não chegou ao estado.
  await expect
    .poll(async () => {
      const q = await (await page.request.get(`${API}/quebras/${idDaQuebra}`)).json();
      return q.diagrama.nodes[0]?.spec?.nome?.valor;
    }, { timeout: 15000 })
    .toBe("srv-catalogo-v2");

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByTestId("menu-documento").click();
  await expect(page.getByTestId("documento-desatualizado")).toBeVisible();
  // §264 — e o aviso diz O QUÊ mudou. Renomear o serviço muda o corpo dos
  // itens derivados, então a seção "Itens" tem que aparecer nominalmente: o
  // aviso genérico de antes obrigava a reler o documento inteiro, e é assim que
  // se aprende a reaprovar sem olhar.
  await expect(page.getByTestId("mudancas-desde-aprovacao")).toContainText("Itens");
  // E continua "aprovado": o trabalho de revisão não se perdeu, só deixou de
  // valer para o desenho de agora.
  await expect(page.getByTestId("status-documento")).toContainText("aprovado");
});

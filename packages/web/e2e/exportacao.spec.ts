import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * SPEC-49 — a exportação pelo caminho real: derivar com nome (a quebra é
 * salva), confirmar o que a esteira escreveu até um item ficar PRONTO, gerar
 * os itens e mandar pro destino configurado.
 *
 * O "agente" aqui é o `/health` do próprio servidor, que só aceita GET: o
 * POST volta 404 e o motivo REAL do destino atravessa até a tela, por item.
 * É o que o teste prova — o caminho inteiro do produto (quem pode sair, quem
 * fica, e o porquê visível), sem depender do tracker de ninguém.
 */
test("configurar destino, exportar os prontos e mostrar o motivo — item com pendência fica de fora", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await page.route(
    (url) => url.pathname === "/pdca/uso",
    (rota) => rota.fulfill({ json: { contagem: 1, momento: false, ultimosItens: [] } })
  );
  await page.route(
    (url) => url.pathname === "/ia/sugerir",
    (rota) => rota.fulfill({ contentType: "text/plain", body: "Texto sugerido pela IA de teste" })
  );
  await entrar(page);

  const configOriginal = (await (await page.request.get(`${API}/config/exportador`)).json()).documento;
  try {
    await page.request.put(`${API}/config/exportador`, {
      data: { documento: { endpoint: `${API}/health`, rotulo: "Agente de teste", cabecalhos: {} } },
    });

    // Cenário + derivar COM nome: a quebra é salva, e só quebra salva exporta.
    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await derivarNaMesa(page);
    const TITULO = `exportação e2e ${Date.now()}`;
    await page.getByLabel("ex.: Fatura mensal em lote").fill(TITULO);
    await page.getByTestId("assistente-balao-confirmar").click();

    // G5c-3 — derivar JÁ escreveu os itens e abriu o documento. Deixar um
    // item PRONTO: as respostas entram pela API (o refinador do card tem
    // prova própria — unidade + a jornada da fiação); as CHAVES dos campos
    // vêm do rastro da fiação, cujo nó fonte emite a fila mesmo sem IA.
    await expect(page.getByTestId("documento-screen")).toBeVisible();
    // Drena o autosave ANTES do PUT por fora: um pendente com o estado velho
    // gravaria o vazio por cima no reload (a corrida do §250).
    await page.getByTestId("documento-screen").getByRole("button", { name: /Voltar à mesa de projeto/ }).click();
    await expect(page.getByText(/· salva$/)).toBeVisible({ timeout: 15000 });
    const lista = (await (await page.request.get(`${API}/quebras`)).json()) as { id: string; titulo?: string }[];
    const demandaId = lista.find((q) => q.titulo === TITULO)!.id;
    const exec = await page.request.post(`${API}/fluxos/esteira-de-agentes/executar`, {
      data: { timeId: "time-pagamentos", parametrosPorNo: { demanda: { demandaId } } },
    });
    const { saidas } = (await exec.json()) as {
      saidas: Record<string, { filaDaEsteira?: { atividadeChave: string; placeholdersPorPapel: Record<string, { chave: string }[]> }[] }>;
    };
    const fila = saidas["demanda"]?.filaDaEsteira ?? [];
    expect(fila.length).toBeGreaterThan(0);
    const item0 = fila[0];
    const respostas = Object.fromEntries(
      Object.values(item0.placeholdersPorPapel)
        .flat()
        .map((p) => [p.chave, { valor: "resposta escrita para exportar", origem: "manual" }])
    );
    const quebraCrua = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as Record<string, unknown>;
    const put = await page.request.put(`${API}/quebras/${demandaId}`, {
      data: { ...quebraCrua, respostasItens: { [item0.atividadeChave]: respostas } },
    });
    expect(put.status()).toBe(200);

    // Regerar atualiza a foto dos contadores — REABRINDO antes: o estado da
    // mesa não sabe do PUT, e derivar com ele gravaria o vazio por cima
    // (a corrida do §250; a reabertura é a sincronização honesta).
    await page.goto("/#/");
    await page.reload();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Abrir…" }).click();
    await page.getByPlaceholder("ex.: aprovação de crédito").fill(TITULO);
    await page.getByRole("button", { name: new RegExp(TITULO) }).click();
    await expect(page.getByTestId("titulo-da-quebra")).toContainText(TITULO);
    await derivarNaMesa(page);
    await expect(page.getByTestId("documento-screen")).toBeVisible();
    // SPEC-61 — a exportação veio junto com os cards para a seção do documento.
    // Ela não morreu com a tela que a hospedava: exportar é o que se faz com o
    // resultado pronto, e o documento é onde ele se lê.
    await expect(page.getByTestId("secao-dos-itens")).toBeVisible();

    // A seção diz o destino e conta só os prontos.
    await expect(page.getByText(/destino: Agente de teste/)).toBeVisible();
    await expect(page.getByTestId("exportar-prontos")).toBeEnabled();

    await page.getByTestId("exportar-prontos").click();
    const resultado = page.getByTestId("resultado-exportacao");
    await expect(resultado).toBeVisible({ timeout: 20000 });
    // O "agente" recusa POST (o /health só faz GET): o motivo REAL do destino
    // chega até a tela, por item, em vez de um erro genérico — e os itens com
    // pendência nem foram tentados.
    await expect(resultado).toContainText("HTTP 404");
    await expect(resultado).toContainText("ficaram de fora por ainda ter pendência");
  } finally {
    await page.request.put(`${API}/config/exportador`, { data: { documento: configOriginal } });
  }
});

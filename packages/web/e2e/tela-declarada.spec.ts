import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { DESENHO_DO_GATEWAY_FALSO } from "@gerador/gateway-falso";

const API = "http://localhost:4100";

/**
 * SPEC-110 fatia C (D5) — **criar uma tela, fiá-la, e usá-la.**
 *
 * O caminho que a SPEC pede, inteiro e no navegador: criar a tela com um
 * `dado` e um `campo` obrigatório, fiar `mesa → tela` num fluxo novo, rodar,
 * abrir o stage, ver o dado que a fiação trouxe, encontrar o **Avançar
 * travado com o motivo à mostra**, preencher, avançar — e a saída da tela
 * aparecer no rastro.
 *
 * Time próprio: este spec escreve os documentos `telas` e `fluxos` do time
 * inteiros; dois specs no mesmo time se apagam por lost update (a lição da
 * SPEC-107 D).
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page, "time-portabilidade");
});

test("criar a tela pelo editor, fiá-la, e o Avançar travar até preencher", async ({ page }) => {
  test.setTimeout(120000);
  const telasOriginais = (await (await page.request.get(`${API}/config/telas?timeId=time-portabilidade`)).json()).documento;
  const fluxosOriginais = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;

  try {
    // ── 1. Criar a tela PELO EDITOR (o deep-link, fora do menu) ──
    await page.goto("/#/config/telas");
    await expect(page.getByTestId("telas-tab")).toBeVisible({ timeout: 20000 });
    // Sem telas do time, a tela DIZ que as do sistema já existem — em vez de
    // uma lista vazia que parece defeito (§244).
    await expect(page.getByTestId("sem-telas")).toBeVisible();

    await page.getByLabel("Nome da tela nova").fill("Revisar a proposta");
    await page.getByTestId("criar-tela").click();
    // Criar já abre o editor DAQUELA tela: o endereço é mandável.
    await expect(page.getByTestId("editor-de-tela")).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/#\/config\/telas\/revisar-a-proposta/);

    // ── 2. Os blocos: um `dado` da fiação e um `campo` obrigatório ──
    await page.getByTestId("add-bloco-dado").click();
    await page.getByLabel("Chave do bloco 2").fill("desenho");
    await page.getByLabel("Rótulo do bloco 2").fill("Desenho da demanda");
    await page.getByLabel("Formato do bloco 2").selectOption("objeto");

    await page.getByTestId("add-bloco-campo").click();
    await page.getByLabel("Chave do bloco 3").fill("parecer");
    await page.getByLabel("Rótulo do bloco 3").fill("Seu parecer");
    await page.getByTestId("editor-bloco-2").getByRole("checkbox").check();

    // A PRÉVIA usa o mesmo renderizador do stage — e já mostra o motivo do
    // Avançar travado, antes de a tela existir num fluxo.
    await expect(page.getByTestId("preview-da-tela")).toContainText("Seu parecer");
    await expect(page.getByTestId("preview-da-tela")).toContainText("preencha");

    await page.getByTestId("salvar-tela").click();
    await expect(page.getByTestId("salvar-tela")).toContainText("Salvo", { timeout: 20000 });

    // ── 3. O editor sobrevive a F5 (D18: a config está NA BASE) ──
    await page.reload();
    await expect(page.getByTestId("editor-de-tela")).toBeVisible({ timeout: 20000 });
    await expect(page.getByLabel("Chave do bloco 3")).toHaveValue("parecer");

    // ── 4. Fiar `mesa → tela` num fluxo novo, e rodar ──
    const criada = await page.request.post(`${API}/quebras`, {
      data: { titulo: `tela declarada e2e ${Date.now()}`, time: "time-portabilidade", diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
    });
    expect(criada.status()).toBe(201);
    const { id: demandaId } = (await criada.json()) as { id: string };

    const salvo = await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "com-tela-do-time",
              nome: "Com a tela do time",
              nos: [
                { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 0 }, parametros: {} },
                { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 240, y: 0 }, parametros: { demandaId } },
                // O refId da tela DO TIME leva o prefixo — é ele que a
                // distingue de uma tela do sistema com o mesmo nome.
                { id: "revisa", tipo: "tela", refId: "tela:revisar-a-proposta", posicao: { x: 480, y: 0 }, parametros: {} },
              ],
              arestas: [
                { de: "gatilho", para: "demanda", mapeamento: [] },
                { de: "demanda", para: "revisa", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
              ],
            },
          ],
        },
      },
    });
    expect(salvo.status()).toBe(200);

    const exec = await page.request.post(`${API}/fluxos/com-tela-do-time/executar`, {
      data: { timeId: "time-portabilidade" },
    });
    expect(exec.status()).toBe(200);
    const suspensa = (await exec.json()) as { execucaoId: string; aguardandoTela?: { noId: string } };
    expect(suspensa.aguardandoTela?.noId).toBe("revisa");

    // ── 5. O STAGE: os blocos do time desenhados, com o dado que chegou ──
    await page.goto(`/#/tela/${suspensa.execucaoId}`);
    await expect(page.getByTestId("tela-declarada")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("bloco-dado-desenho")).toContainText("Desenho da demanda");
    // O dado veio da FIAÇÃO, não de um exemplo: o desenho da demanda tem nós.
    await expect(page.getByTestId("bloco-dado-desenho")).toContainText("diagrama");

    // ── 6. O Avançar TRAVADO, com o motivo à mostra (D5/D17b) ──
    await expect(page.getByTestId("tela-avancar")).toBeDisabled();
    await expect(page.getByTestId("tela-avancar-travado")).toContainText("Seu parecer");

    // ── 7. Preencher destrava, e a saída da tela vai adiante ──
    await page.getByLabel("Seu parecer").fill("aprovado com ressalvas");
    await expect(page.getByTestId("tela-avancar")).toBeEnabled();
    await page.getByTestId("tela-avancar").click();

    await expect
      .poll(
        async () => {
          const r = await page.request.get(`${API}/fluxos/com-tela-do-time/execucoes`);
          const { execucoes } = (await r.json()) as { execucoes: { id: string; estado: string; nos: { noId: string }[] }[] };
          const minha = execucoes.find((e) => e.id === suspensa.execucaoId);
          return minha ? `${minha.estado}:${minha.nos.map((n) => n.noId).join(",")}` : "sumiu";
        },
        { timeout: 30000 }
      )
      .toBe("concluida:gatilho,demanda,revisa");
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: fluxosOriginais, timeId: "time-portabilidade" } });
    await page.request.put(`${API}/config/telas`, { data: { documento: telasOriginais, timeId: "time-portabilidade" } });
  }
});

test("a escrita RECUSA a tela pela metade, nomeando o bloco (SPEC-35)", async ({ page }) => {
  // O que a leitura descartaria em silêncio some do documento salvo — e a
  // pessoa só descobriria quando a tela abrisse sem o bloco que ela criou.
  const r = await page.request.put(`${API}/config/telas`, {
    data: {
      timeId: "time-portabilidade",
      documento: { telas: [{ id: "t", nome: "T", blocos: [{ tipo: "campo", chave: "c", entrada: "escolha" }] }] },
    },
  });
  expect(r.status()).toBe(400);
  expect(JSON.stringify(await r.json())).toContain("sem opções");
});

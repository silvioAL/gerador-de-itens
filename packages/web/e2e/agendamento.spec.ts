import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-110 fatia E (D7) — **o relógio, provado sem esperar o relógio.**
 *
 * *"senti falta de componente scheduler para outros desenhos"*.
 *
 * A prova é DETERMINÍSTICA por desenho: o agendamento nasce com uma expressão
 * que já venceu (todo minuto), o tick é FORÇADO pelo endpoint que só existe em
 * `AUTH_MODE=dev`, e o histórico mostra a execução com origem `agendamento`.
 * Esperar 30s pelo tick real tornaria a suíte lenta e instável, e não provaria
 * mais nada — o disparo é o MESMO caminho nos dois casos (§263).
 *
 * Time próprio: este spec escreve o documento `fluxos` do time inteiro.
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

test("salvar o fluxo agenda; o tick dispara; o histórico diz que foi o relógio", async ({ page }) => {
  test.setTimeout(120000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;

  try {
    // ── 1. O DESENHO manda: salvar com um gatilho de agendamento cria a linha ──
    const salvo = await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "agendado-e2e",
              nome: "Agendado",
              nos: [
                // "todo minuto": a próxima ocorrência já venceu quando o tick
                // roda — é o que torna a prova determinística sem relógio.
                { id: "gatilho", tipo: "gatilho", refId: "agendamento", posicao: { x: 0, y: 0 }, parametros: { expressao: "* * * * *" } },
                { id: "molda", tipo: "transformacao", refId: "transformacao", posicao: { x: 240, y: 0 }, parametros: { campos: [{ chave: "quando", modelo: "rodou pelo relógio" }] } },
              ],
              arestas: [{ de: "gatilho", para: "molda", mapeamento: [] }],
            },
          ],
        },
      },
    });
    expect(salvo.status()).toBe(200);

    /**
     * ── 2. O tick FORÇADO, com a HORA de fora (só em `AUTH_MODE=dev`) ──
     *
     * Salvar o fluxo já calcula a próxima ocorrência, e mesmo com
     * `* * * * *` ela cai no próximo minuto cheio — até 60s à frente. A
     * primeira versão desta prova forçava o tick "agora" e torcia para a
     * virada do minuto chegar dentro do timeout: passou aqui e caiu na CI.
     * Dizer a hora mata o acaso.
     */
    const daquiADoisMinutos = new Date(Date.now() + 2 * 60_000).toISOString();
    const tick = await page.request.post(`${API}/fluxos/agendamentos/tick`, { data: { agora: daquiADoisMinutos } });
    expect(tick.status()).toBe(200);
    expect(((await tick.json()) as { disparados: number }).disparados).toBe(1);

    // ── 3. O histórico: a execução existe, e diz QUEM a disparou ──
    await expect
      .poll(
        async () => {
          const r = await page.request.get(`${API}/fluxos/agendado-e2e/execucoes`);
          const { execucoes } = (await r.json()) as {
            execucoes: { email: string | null; nos: { noId: string; estado: string; origem?: string }[] }[];
          };
          const doRelogio = execucoes.find((e) => e.nos.some((n) => n.origem === "agendamento"));
          if (!doRelogio) return "sem execução do relógio";
          return `${doRelogio.email}:${doRelogio.nos.map((n) => `${n.noId}=${n.estado}`).join(",")}`;
        },
        { timeout: 30000 }
      )
      // A auditoria pergunta "quem fez?", e o relógio responde com nome.
      .toBe("agendamento@gerador.local:gatilho=sucesso,molda=sucesso");

    // ── 4. Tirar o gatilho do desenho PARA o relógio ──
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "agendado-e2e",
              nome: "Agendado (sem relógio)",
              nos: [{ id: "molda", tipo: "transformacao", refId: "transformacao", posicao: { x: 0, y: 0 }, parametros: { campos: [{ chave: "quando", modelo: "x" }] } }],
              arestas: [],
            },
          ],
        },
      },
    });
    const antes = (await (await page.request.get(`${API}/fluxos/agendado-e2e/execucoes`)).json()) as { execucoes: unknown[] };
    // Bem adiante: se o relógio ainda estivesse ligado, ele teria disparado.
    const daquiAUmaHora = new Date(Date.now() + 60 * 60_000).toISOString();
    const tickMudo = await page.request.post(`${API}/fluxos/agendamentos/tick`, { data: { agora: daquiAUmaHora } });
    // Nada disparou — o desenho é a verdade, e ele não pede mais relógio.
    expect(((await tickMudo.json()) as { disparados: number }).disparados).toBe(0);
    const depois = (await (await page.request.get(`${API}/fluxos/agendado-e2e/execucoes`)).json()) as { execucoes: unknown[] };
    expect(depois.execucoes.length).toBe(antes.execucoes.length);
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-portabilidade" } });
  }
});

test("a escrita RECUSA o cron torto, nomeando o campo", async ({ page }) => {
  // Um cron errado só apareceria quando o relógio NÃO disparasse, e "não
  // rodou" é o silêncio mais caro de diagnosticar (SPEC-35).
  const r = await page.request.put(`${API}/config/fluxos`, {
    data: {
      timeId: "time-portabilidade",
      documento: {
        fluxos: [
          {
            id: "cron-torto-e2e",
            nome: "Torto",
            nos: [{ id: "gatilho", tipo: "gatilho", refId: "agendamento", posicao: { x: 0, y: 0 }, parametros: { expressao: "60 * * * *" } }],
            arestas: [],
          },
        ],
      },
    },
  });
  expect(r.status()).toBe(400);
  expect(JSON.stringify(await r.json())).toContain("minuto");
});

test("o painel mostra a PRÓXIMA ocorrência — um cron sozinho não é resposta", async ({ page }) => {
  test.setTimeout(90000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;
  try {
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "previsao-e2e",
              nome: "Com previsão",
              nos: [{ id: "gatilho", tipo: "gatilho", refId: "agendamento", posicao: { x: 0, y: 0 }, parametros: { expressao: "0 9 * * 1-5" } }],
              arestas: [],
            },
          ],
        },
      },
    });

    await page.goto("/#/fluxo/previsao-e2e");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.locator('.react-flow__node[data-id="gatilho"]').click();
    await expect(page.getByTestId("expressao-do-agendamento")).toHaveValue("0 9 * * 1-5");
    // A previsão é uma DATA, não a expressão repetida.
    await expect(page.getByTestId("proxima-ocorrencia")).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-portabilidade" } });
  }
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";
const GATEWAY_FALSO = "http://localhost:4123";

/**
 * SPEC-107 G2 — **publicar o documento pela FIAÇÃO, ponta a ponta.**
 *
 * O E2E que a tabela da §3.1 cobrava e nunca existiu: configurar o destino,
 * publicar pela tela (o botão é um atalho da fiação semeada
 * "publicar-documento"), ver o link — e o link SOBREVIVER ao F5, porque a
 * demanda o guarda (SPEC-106 C).
 *
 * O destino entra por read-modify-write só do NOSSO id no documento do
 * exportador (a convenção da suíte para documentos globais).
 */
test.describe.configure({ mode: "serial" });

const MEU_DESTINO = "doc-g2-e2e";

async function comDestinoDeDocumento(page: Page) {
  const atual = (await (await page.request.get(`${API}/config/exportador`)).json()).documento as {
    endpoint?: string;
    rotulo?: string;
    cabecalhos?: Record<string, string>;
    destinos?: { id: string }[];
  };
  const dosOutros = (atual?.destinos ?? []).filter((d) => d.id !== MEU_DESTINO);
  await page.request.put(`${API}/config/exportador`, {
    data: {
      documento: {
        endpoint: atual?.endpoint ?? "",
        rotulo: atual?.rotulo ?? "",
        cabecalhos: atual?.cabecalhos ?? {},
        destinos: [
          ...dosOutros,
          { id: MEU_DESTINO, operacao: "documento", endpoint: `${GATEWAY_FALSO}/v1/documento`, rotulo: "Wiki do E2E" },
        ],
      },
    },
  });
}

async function semMeuDestino(page: Page) {
  const atual = (await (await page.request.get(`${API}/config/exportador`)).json()).documento as {
    endpoint?: string;
    rotulo?: string;
    cabecalhos?: Record<string, string>;
    destinos?: { id: string }[];
  };
  await page.request.put(`${API}/config/exportador`, {
    data: {
      documento: {
        endpoint: atual?.endpoint ?? "",
        rotulo: atual?.rotulo ?? "",
        cabecalhos: atual?.cabecalhos ?? {},
        destinos: (atual?.destinos ?? []).filter((d) => d.id !== MEU_DESTINO),
      },
    },
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);
});

test("publicar pela fiação: o botão publica, o link aparece — e sobrevive ao F5 na demanda", async ({ page }) => {
  test.setTimeout(150000);
  const titulo = `publicacao-g2-e2e ${Date.now()}`;
  try {
    await comDestinoDeDocumento(page);

    // A demanda nasce pela API com um diagrama COMPLETO (o cenário do mongo,
    // sem obrigatório em aberto — o botão de derivar não habilita com
    // vermelho) e abre pela tela.
    const { diagrama } = (
      JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../config/cenarios/mongo.json"), "utf-8")) as {
        quebra: { diagrama: { nodes: unknown[]; edges: unknown[] } };
      }
    ).quebra;
    const criada = await page.request.post(`${API}/quebras`, {
      data: { titulo, time: "time-pagamentos", diagrama },
    });
    expect(criada.status()).toBe(201);
    const { id: demandaId } = (await criada.json()) as { id: string };

    await page.reload();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Abrir…" }).click();
    await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
    await page.getByRole("button", { name: new RegExp(titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await expect(page.getByTestId("titulo-da-quebra")).toContainText("publicacao-g2-e2e");

    await derivarNaMesa(page);
    await page.getByTestId("ir-ao-documento").click();

    await expect(page.getByTestId("publicar-documento")).toBeVisible();
    await page.getByTestId("publicar-documento").click();

    // O link do dublê aparece — publicado pela FIAÇÃO.
    await expect(page.getByTestId("documento-publicado")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("documento-publicado")).toContainText("Wiki do E2E");

    // A demanda GUARDA o link (SPEC-106 C) — e o que se publicou ficou
    // persistido como especificação (G2).
    const quebra = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as {
      documentoLinkExterno: string | null;
      especificacao: string | null;
    };
    expect(String(quebra.documentoLinkExterno)).toContain("exemplo.invalido/wiki");
    expect(String(quebra.especificacao)).toContain("#");

    // F5 — o link sobrevive: reabrir a demanda mostra "última publicação ↗".
    await page.reload();
    // O hash #/documento persiste no F5 e a tela do documento cobre o menu —
    // volta para a mesa antes de reabrir a demanda.
    await page.getByRole("button", { name: "← Voltar à mesa de projeto" }).click();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Abrir…" }).click();
    await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
    await page.getByRole("button", { name: new RegExp(titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await derivarNaMesa(page);
    // A demanda agora TEM especificação — a conversa de refino abre sozinha
    // e cobre o caminho; o mesmo botão que a abre a fecha.
    if (await page.getByTestId("conversa-especificacao").isVisible().catch(() => false)) {
      await page.getByTestId("abrir-conversa-especificacao").click();
      await expect(page.getByTestId("conversa-especificacao")).toHaveCount(0);
    }
    await page.getByTestId("ir-ao-documento").click();
    await expect(page.getByTestId("link-do-documento-publicado")).toBeVisible();
    await expect(page.getByTestId("link-do-documento-publicado")).toContainText("última publicação");
  } finally {
    await semMeuDestino(page);
  }
});

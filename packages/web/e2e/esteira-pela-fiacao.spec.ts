import { test, expect, type Page } from "@playwright/test";
import { BASE_URL_GATEWAY_FALSO, CHAVE_GATEWAY_FALSO, MARCA_GATEWAY_FALSO, MODELO_GATEWAY_FALSO } from "@gerador/gateway-falso";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * SPEC-107 G5b — **a prova da SPEC-105 F: resultado idêntico item a item.**
 *
 * A mesma demanda, os mesmos papéis, o mesmo dublê determinístico — primeiro
 * a REVISÃO roda a esteira no navegador (o motor de sempre), depois a FIAÇÃO
 * semeada `esteira-de-agentes` roda no servidor. O dublê semeia a resposta
 * com o prompt INTEIRO (FNV-1a), então valores iguais aqui significam
 * prompts iguais byte a byte: a fila, os lotes, o contexto e o esquema dos
 * dois motores são UM (§263) — que é exatamente o que a G5a construiu.
 *
 * É o molde da equivalência da derivação ("derivar pelo botão ≡ derivar pela
 * função", `fluxo-de-funcoes.spec.ts`), agora para a última morte da §3.1: a
 * tela de revisão só morre com esta prova verde (recusa da SPEC-105 §7).
 */
test("SPEC-105 F — a esteira da revisão e a fiação escrevem O MESMO, item a item", async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  // ── A credencial do dublê, na CONVENÇÃO da suíte (uma por organização:
  //    todos os specs gravam a MESMA, com visão — regravar diferente derruba
  //    testes vizinhos) ──
  await abrirModeloIa(page);
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByLabel("Este modelo enxerga imagem").check();
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  // ── Um nó completo o bastante para derivar (o caminho de ia-hospedada) ──
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
  await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("prova.g5.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  const TITULO = "Prova item a item G5";
  await derivarNaMesa(page);
  await page.getByLabel("ex.: Fatura mensal em lote").fill(TITULO);
  await page.getByTestId("assistente-balao-confirmar").click();
  await expect(page.getByTestId("contagem-itens")).toHaveText("1 itens");

  // ── O motor DE SEMPRE: a esteira auto-roda no navegador contra o dublê ──
  await expect(page.getByText(new RegExp(MARCA_GATEWAY_FALSO)).first()).toBeVisible({ timeout: 60000 });
  // M1 — a esteira TERMINOU (é a única conduta que abre o chat sem clique).
  await expect(page.getByTestId("conversa-especificacao")).toBeVisible({ timeout: 60000 });

  // ── O que a REVISÃO escreveu, do banco (auto-save ~2s): item→campo→valor ──
  let demandaId = "";
  await expect
    .poll(
      async () => {
        const lista = (await (await page.request.get(`${API}/quebras`)).json()) as { id: string; titulo?: string }[];
        demandaId = lista.find((q) => q.titulo === TITULO)?.id ?? "";
        return demandaId;
      },
      { timeout: 20000 }
    )
    .not.toBe("");

  const respostasNoBanco = async () => {
    const q = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as {
      respostasItens?: Record<string, Record<string, { valor: string; origem: string; confirmado?: boolean }>>;
    };
    return q.respostasItens ?? {};
  };
  // Espera o auto-save assentar: a contagem de campos escritos estabiliza.
  await expect
    .poll(async () => Object.values(await respostasNoBanco()).reduce((n, campos) => n + Object.keys(campos).length, 0), {
      timeout: 30000,
    })
    .toBeGreaterThan(0);
  const antes = await respostasNoBanco();
  const valoresDe = (r: Record<string, Record<string, { valor: string }>>) =>
    Object.fromEntries(
      Object.entries(r).map(([item, campos]) => [
        item,
        Object.fromEntries(Object.entries(campos).map(([chave, v]) => [chave, v.valor])),
      ])
    );

  // ── O motor NOVO: a fiação semeada, apontada para a MESMA demanda ──
  // As sugestões da revisão continuam PENDENTES (ninguém confirmou), então a
  // fila da fiação é a MESMA da corrida acima — e o dublê, determinístico.
  const exec = await page.request.post(`${API}/fluxos/esteira-de-agentes/executar`, {
    data: { timeId: "time-pagamentos", parametrosPorNo: { demanda: { demandaId } } },
  });
  expect(exec.status()).toBe(200);
  const rastro = (await exec.json()) as {
    nos: { noId: string; estado: string; erro?: string }[];
    saidas: Record<string, Record<string, unknown>>;
  };
  for (const no of rastro.nos) {
    expect(no.estado, `nó ${no.noId}: ${no.erro ?? ""}`).toBe("sucesso");
  }
  expect((rastro.saidas["grava"]?.aplicadas as number) ?? 0).toBeGreaterThan(0);

  // ── A PROVA: item a item, campo a campo, o MESMO valor ──
  const depois = await respostasNoBanco();
  expect(valoresDe(depois)).toEqual(valoresDe(antes));
  // E o julgamento continua na demanda (§5.5): tudo segue SUGESTÃO pendente.
  for (const campos of Object.values(depois)) {
    for (const v of Object.values(campos)) {
      expect(v.origem).toBe("sugerido");
      expect(v.confirmado).toBe(false);
    }
  }
});

/**
 * SPEC-107 G5c — **assistir a esteira rodando NO CANVAS, sobre a demanda
 * aberta.** É a metade "o vivo" da última morte da §3.1: a URL
 * `#/fluxo/esteira-de-agentes` é mandável, o canvas abre na fiação certa, e
 * executar dali aponta a demanda aberta na mesa (`parametrosPorNo`) — o nó
 * pulsa, o texto streama, e as sugestões chegam PENDENTES na demanda (§5.5).
 */
test("SPEC-107 G5c — o canvas roda a esteira da demanda aberta, ao vivo", async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  // A credencial na convenção da suíte (a mesma do teste acima).
  await abrirModeloIa(page);
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByLabel("Este modelo enxerga imagem").check();
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  // Uma demanda com desenho derivável, SALVA e aberta na mesa.
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
  await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("canvas.vivo.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");
  const TITULO = "Esteira ao vivo no canvas G5c";
  await page.getByRole("button", { name: "Salvar" }).first().click();
  await page.getByLabel("ex.: Fatura mensal em lote").fill(TITULO);
  await page.getByTestId("assistente-balao-confirmar").click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(TITULO);

  // Uma SEGUNDA demanda, mais recente, criada por fora: é ela que o servidor
  // chamaria de "a ativa". Se as sugestões caírem nela, o canvas não está
  // apontando a demanda ABERTA — está chutando (§248 morde aqui).
  const outra = await page.request.post(`${API}/quebras`, {
    data: { titulo: "Outra demanda mais recente G5c", time: "time-pagamentos", diagrama: { nodes: [], edges: [] } },
  });
  const outraId = ((await outra.json()) as { id: string }).id;

  // ── A URL mandável: o canvas abre NA esteira ──
  await page.goto("/#/fluxo/esteira-de-agentes");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("esteira-de-agentes", { timeout: 15000 });
  // A fiação completa está no canvas: a fonte e o destino nomeados (o número
  // de papéis é do TIME — outro spec pode ter configurado um contextual).
  await expect(page.locator('.react-flow__node[data-id="demanda"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="grava"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="po"]')).toBeVisible();

  // ── Executar dali: o VIVO (nó pulsando + texto streamando) ──
  await page.getByTestId("executar-fluxo").click();
  await expect(page.locator('[data-testid^="rastro-vivo-"]')).toBeVisible({ timeout: 30000 });

  // A corrida termina com a fiação inteira verde no rastro (✓ por nó).
  await expect(page.getByTestId("rastro-da-execucao")).toBeVisible({ timeout: 60000 });
  for (const no of ["demanda", "po", "arquiteto", "especialista", "qa", "grava"]) {
    await expect(page.getByTestId(`rastro-${no}`)).toContainText(`✓ ${no}`);
  }

  // ── E as sugestões chegaram na DEMANDA ABERTA, pendentes (§5.5) ──
  const lista = (await (await page.request.get(`${API}/quebras`)).json()) as { id: string; titulo?: string }[];
  const demandaId = lista.find((q) => q.titulo === TITULO)!.id;
  const q = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as {
    respostasItens?: Record<string, Record<string, { origem: string; confirmado?: boolean }>>;
  };
  const campos = Object.values(q.respostasItens ?? {}).flatMap((c) => Object.values(c));
  expect(campos.length).toBeGreaterThan(0);
  for (const v of campos) {
    expect(v.origem).toBe("sugerido");
    expect(v.confirmado).toBe(false);
  }
  // E a "mais recente" ficou INTOCADA: o canvas apontou a aberta, não chutou.
  const daOutra = (await (await page.request.get(`${API}/quebras/${outraId}`)).json()) as {
    respostasItens?: Record<string, unknown>;
  };
  expect(Object.keys(daOutra.respostasItens ?? {})).toHaveLength(0);

  // ── G5c-2: o JULGAMENTO na casa da demanda (§5.5) — a seção dos itens do
  //    documento mostra as sugestões aguardando, e Confirmar todas assina ──
  //
  // A fiação gravou NO BANCO; o estado do navegador é o de antes da corrida.
  // O caso real é reabrir a demanda (F5 + Abrir…) — é o que sincroniza.
  // O F5 é NA MESA: o menu de abrir demanda mora lá, não no canvas do fluxo.
  await page.goto("/#/");
  await page.reload();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(TITULO);
  await page.getByRole("button", { name: new RegExp(TITULO) }).click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(TITULO);
  await page.goto("/#/documento");
  await expect(page.getByTestId("pendencias-dos-itens")).toContainText("sugestões da esteira aguardando");
  await page.getByTestId("confirmar-todas-itens").click();
  // A barra some porque nada mais aguarda — a régua é viva, das fichas.
  await expect(page.getByTestId("pendencias-dos-itens")).toHaveCount(0);
  // E no banco (auto-save ~2s): tudo assinado, procedência preservada.
  await expect
    .poll(
      async () => {
        const dq = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as {
          respostasItens?: Record<string, Record<string, { origem: string; confirmado?: boolean }>>;
        };
        const cs = Object.values(dq.respostasItens ?? {}).flatMap((c) => Object.values(c));
        return cs.length > 0 && cs.every((v) => v.origem === "sugerido" && v.confirmado === true);
      },
      { timeout: 25000 }
    )
    .toBe(true);
});

/** A aba "Modelo de IA" dentro da tela de Configurações. */
async function abrirModeloIa(page: Page) {
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Modelo de IA" }).click();
}

import { test, expect } from "@playwright/test";
import { entrarEmTimeProprio } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-111 fatia A — **a tela que vale sozinha.**
 *
 * A promessa da §2.1: *"uma screen declarada pode ser aberta e usada direto da
 * galeria e por link mandável"*. Até aqui a tela só existia para ser fiada num
 * fluxo — quem a criava não tinha como usá-la.
 *
 * ## O que só o navegador prova
 *
 * As provas de rota já cobrem a derivação e a permissão. O que só aqui se vê é
 * a COSTURA do gesto: que o botão existe no card, que ele leva a uma tela
 * preenchível, que a tela AVISA que ainda não entrega a ninguém (D4), que o
 * obrigatório trava o Avançar, e que recarregar continua a MESMA sessão em vez
 * de abrir outra.
 *
 * Time próprio: este spec escreve o documento de telas do time.
 */
test.describe.configure({ mode: "serial" });

const TELA = {
  id: "aprovacao-e2e",
  nome: "Aprovação de despesa",
  icone: "🧾",
  blocos: [
    { tipo: "texto", markdown: "Confira o valor e aprove." },
    { tipo: "campo", chave: "valor", rotulo: "Valor", entrada: "numero", obrigatorio: true },
  ],
};

test("abrir a tela pela galeria, preencher e avançar — sem fluxo nenhum", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  const time = await entrarEmTimeProprio(page, "standalone");

  // A tela nasce pela API: o assunto deste spec é USÁ-LA, e criar pelo editor
  // já tem prova própria (`tela-declarada.spec.ts`).
  const criada = await page.request.put(`${API}/config/telas`, {
    data: { timeId: time, documento: { telas: [TELA] } },
  });
  expect(criada.status()).toBe(200);

  await page.goto("/#/fluxo");
  await expect(page.getByTestId("galeria-de-fluxos")).toBeVisible();

  /**
   * O fluxo implícito NÃO aparece como fluxo: o card da tela é o dono do
   * assunto. Mostrar os dois seria o mesmo componente duas vezes na mesma tela
   * — a queixa M9 da SPEC-110 renascendo.
   */
  await expect(page.getByTestId(`card-fluxo-tela-standalone:${TELA.id}`)).toHaveCount(0);

  const card = page.getByTestId(`card-tela-${TELA.id}`);
  await expect(card).toBeVisible();
  await card.getByTestId(`abrir-tela-${TELA.id}`).click();

  // O endereço vira o da EXECUÇÃO: abrir criou uma sessão de trabalho.
  await expect(page).toHaveURL(/#\/tela\/[0-9a-f-]{36}/i, { timeout: 15000 });
  await expect(page.getByTestId("tela-do-stage-titulo")).toContainText("Aprovação de despesa");

  // D4 — a tela DIZ que ainda não entrega a ninguém, antes de a pessoa decidir.
  await expect(page.getByTestId("tela-sem-destino")).toContainText("registrada no histórico");

  // O obrigatório trava o Avançar com o motivo (110-C), aqui também.
  await expect(page.getByTestId("tela-avancar-travado")).toBeVisible();
  await page.getByTestId("bloco-campo-valor").locator("input").fill("1234");
  await expect(page.getByTestId("tela-avancar-travado")).toHaveCount(0);

  await page.getByTestId("tela-avancar").click();

  // A resposta ficou no histórico da execução — que é o que a v1 promete.
  await expect
    .poll(
      async () => {
        const r = await page.request.get(
          `${API}/fluxos/${encodeURIComponent(`tela-standalone:${TELA.id}`)}/execucoes?timeId=${time}`
        );
        const { execucoes } = (await r.json()) as { execucoes: { estado: string }[] };
        return execucoes[0]?.estado ?? "(nenhuma)";
      },
      { timeout: 15000 }
    )
    .toBe("concluida");
});

test("o endereço é mandável e o F5 continua a MESMA sessão — não abre outra", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  const time = await entrarEmTimeProprio(page, "standalone");
  await page.request.put(`${API}/config/telas`, { data: { timeId: time, documento: { telas: [TELA] } } });

  /**
   * A contagem é RELATIVA, não absoluta: o banco é compartilhado entre specs e
   * entre rodadas, e afirmar "existe UMA aguardando" quebraria pelo resíduo de
   * quem rodou antes — a armadilha que a casa já registrou (a 1ª rodada
   * envenena as seguintes). O que importa é a DIFERENÇA que o F5 provoca.
   */
  const quantasAguardando = async () => {
    const r = await page.request.get(
      `${API}/fluxos/${encodeURIComponent(`tela-standalone:${TELA.id}`)}/execucoes?timeId=${time}`
    );
    const { execucoes } = (await r.json()) as { execucoes: { estado: string }[] };
    return execucoes.filter((e) => e.estado === "aguardando-tela").length;
  };
  const antes = await quantasAguardando();

  await page.goto(`/#/tela/s/${TELA.id}`);
  await expect(page.getByTestId("tela-do-stage-titulo")).toBeVisible({ timeout: 15000 });
  const enderecoDaExecucao = page.url();
  expect(enderecoDaExecucao).toMatch(/#\/tela\/[0-9a-f-]{36}/i);
  expect(await quantasAguardando()).toBe(antes + 1);

  /**
   * O F5 é a prova que importa: o endereço de ABRIR age ao ser visitado, e sem
   * o `replaceState` do redirecionamento cada recarga criaria uma execução
   * nova — a pessoa perderia o que preencheu e o histórico encheria de sessões
   * fantasma.
   */
  await page.reload();
  await expect(page.getByTestId("tela-do-stage-titulo")).toBeVisible({ timeout: 15000 });
  expect(page.url()).toBe(enderecoDaExecucao);

  // Nenhuma execução NOVA: o F5 continuou a mesma sessão de trabalho.
  expect(await quantasAguardando()).toBe(antes + 1);
});

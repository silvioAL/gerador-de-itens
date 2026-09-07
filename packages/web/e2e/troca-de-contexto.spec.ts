import { test, expect } from "@playwright/test";
import { BASE_URL_GATEWAY_FALSO, CHAVE_GATEWAY_FALSO, DESENHO_DO_GATEWAY_FALSO, MODELO_GATEWAY_FALSO } from "@gerador/gateway-falso";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * §214 — a mesma varredura do §213, nas outras trocas de contexto que a
 * ferramenta tem: o PRODUTO da demanda e a PESSOA na sessão.
 *
 * A classe de defeito é sempre a mesma: um estado que descreve "o que estou
 * vendo agora" e sobrevive à troca. Nos itens escritos (§210) e no rascunho do
 * assistente (§213) ele existia; aqui a pergunta é se existe também quando o
 * que muda é o produto ou quem está logado — e neste segundo caso o vazamento
 * não seria só confuso, seria material de uma pessoa aparecendo para outra.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("§214 — trocar o produto da demanda troca o que o modelo recebe (pela fiação)", async ({ page }) => {
  test.setTimeout(120000);
  await entrar(page);

  /**
   * SPEC-107 G5c-3 — a prova mudou de instrumento com a morte da revisão: a
   * simulação de prompt era client-side e morreu. Quem prova agora é a
   * FIAÇÃO contra o dublê determinístico, que assina cada resposta com o
   * hash do prompt inteiro (§382): rodar a esteira com o produto A e depois
   * com o produto B tem que produzir VALORES diferentes — se o contexto do
   * produto não entrasse no prompt, as assinaturas seriam idênticas.
   */
  const nomeA = `Produto A ${Date.now()}`;
  const nomeB = `Produto B ${Date.now()}`;
  const ids: string[] = [];
  try {
    for (const [nome, termo] of [
      [nomeA, `termo exclusivo de A ${Date.now()}`],
      [nomeB, `termo exclusivo de B ${Date.now()}`],
    ]) {
      const criado = await page.request.post(`${API}/produtos`, { data: { nome } });
      expect(criado.status()).toBe(201);
      const { id } = await criado.json();
      ids.push(id);
      await page.request.post(`${API}/produtos/${id}/glossario`, { data: { termo, definicao: "definição" } });
    }

    // A credencial do dublê, na convenção da suíte (uma por organização).
    await page.request.put(`${API}/ia/credencial`, {
      data: { baseUrl: BASE_URL_GATEWAY_FALSO, chave: CHAVE_GATEWAY_FALSO, modelo: MODELO_GATEWAY_FALSO },
    });

    // Uma demanda derivável, já com o produto A.
    const criada = await page.request.post(`${API}/quebras`, {
      data: { titulo: `troca de produto ${Date.now()}`, time: "time-pagamentos", produtoId: ids[0], diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
    });
    expect(criada.status()).toBe(201);
    const { id: demandaId } = (await criada.json()) as { id: string };

    const rodar = async () => {
      const exec = await page.request.post(`${API}/fluxos/esteira-de-agentes/executar`, {
        data: { timeId: "time-pagamentos", parametrosPorNo: { demanda: { demandaId } } },
      });
      expect(exec.status()).toBe(200);
      const q = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as {
        respostasItens?: Record<string, Record<string, { valor: string }>>;
      };
      return JSON.stringify(
        Object.fromEntries(
          Object.entries(q.respostasItens ?? {}).map(([k, c]) => [k, Object.fromEntries(Object.entries(c).map(([ck, v]) => [ck, v.valor]))])
        )
      );
    };

    const comProdutoA = await rodar();
    expect(comProdutoA.length).toBeGreaterThan(2);

    // Troca o produto (RMW da quebra inteira) e LIMPA as sugestões pendentes:
    // a fila volta a ter os mesmos campos, e só o contexto muda.
    const quebra = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as Record<string, unknown>;
    const atualizada = await page.request.put(`${API}/quebras/${demandaId}`, {
      data: { ...quebra, produtoId: ids[1], respostasItens: {} },
    });
    expect(atualizada.status()).toBe(200);

    const comProdutoB = await rodar();
    expect(comProdutoB.length).toBeGreaterThan(2);

    // O §214 na fiação: produto diferente → prompt diferente → assinatura
    // diferente. Um contexto "pregado" produziria strings idênticas.
    expect(comProdutoB).not.toBe(comProdutoA);
  } finally {
    for (const id of ids) await page.request.delete(`${API}/produtos/${id}`);
  }
});

test("§214 — sair e entrar com outra pessoa não deixa a demanda da anterior na tela", async ({ page }) => {
  test.setTimeout(90000);
  await entrar(page);

  // Alguém trabalha: cenário no canvas e contexto do épico escrito.
  const contexto = `rascunho de quem estava antes ${Date.now()}`;
  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();

  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto da demanda" }).click();
  await janela.getByLabel("Contexto da demanda (texto)").fill(contexto);
  await janela.getByRole("button", { name: "Salvar" }).click();

  // Sai e entra como OUTRA pessoa, no mesmo navegador.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Sair" }).click();
  await entrar(page, "time-pagamentos", "outro@gerador.local");

  // Nada da sessão anterior pode estar na tela: nem o desenho, nem o rascunho.
  // Aqui o vazamento não seria só confuso — seria material de uma pessoa
  // aparecendo para outra.
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.getByTestId("assistente-flutuante").click();
  await page.getByTestId("assistente-janela").getByRole("button", { name: "📎 Contexto da demanda" }).click();
  await expect(page.getByTestId("assistente-janela").getByLabel("Contexto da demanda (texto)")).toHaveValue("");
});

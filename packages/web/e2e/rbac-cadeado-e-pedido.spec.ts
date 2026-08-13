import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";
const EMAIL_BLOQUEADO = "bloqueado-e2e@gerador.local";
const TIME = "time-pagamentos";

/**
 * SPEC-51 (§203) — o caminho NEGADO, com o RBAC ligado de verdade.
 *
 * Este spec liga o controle de acesso da ORGANIZAÇÃO (criar um papel é o que
 * liga), então roda no projeto `rbac`, que depende do `app`: sozinho, depois
 * de todos os outros. Sem isso, qualquer spec vizinho que assume o modo
 * aberto passaria a levar 403 no meio da corrida.
 *
 * O usuário do teste entra com nível `operar` — owner passaria pelo bypass da
 * SPEC-38 e o teste mediria o portão errado.
 */
test("com RBAC ligado: cadeado no menu, área negada explicada e pedido de ajuste nascendo dali", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );

  // Sessão de quem administra, pra montar o cenário.
  await entrar(page);
  const respPapel = await page.request.post(`${API}/acessos/papeis`, {
    data: { nome: `Curadoria e2e ${Date.now()}`, permissoes: [{ recurso: "campos-no", acao: "editar" }] },
  });
  expect(respPapel.status(), "papel criado (é o que LIGA o RBAC)").toBe(201);
  const papel = await respPapel.json();

  try {
    const rAtrib = await page.request.post(`${API}/acessos/papeis/${papel.id}/membros`, { data: { email: EMAIL_BLOQUEADO } });
    const rMembro = await page.request.post(`${API}/times/${TIME}/membros`, {
      data: { email: EMAIL_BLOQUEADO, nivel: "operar" },
    });
    expect(rAtrib.status(), "papel atribuído").toBe(201);
    expect(rMembro.status(), "membro do time").toBe(201);

    // Agora entra quem SÓ pode mexer em campos por componente.
    await page.context().clearCookies();
    await entrar(page, TIME, EMAIL_BLOQUEADO);

    await page.getByRole("button", { name: "☰ Menu" }).click();
    const permitido = page.getByRole("button", { name: /Padrões por componente/ });
    const bloqueado = page.getByRole("button", { name: /Modelo de IA/ });

    await expect(bloqueado).toHaveAttribute("data-bloqueada", "sim");
    await expect(bloqueado).toContainText("🔒");
    await expect(permitido).not.toHaveAttribute("data-bloqueada", "sim");

    // Clicar no bloqueado NÃO cai noutra tela: diz que é permissão.
    await bloqueado.click();
    await expect(page.getByTestId("area-sem-permissao")).toContainText("não tem permissão");

    // Área de acesso não se pede — manda falar com um owner.
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Acessos" }).click();
    await expect(page.getByTestId("area-sem-permissao")).toContainText("owner do time");
    await expect(page.getByTestId("pedir-ajuste")).toHaveCount(0);

    // Área solicitável: o pedido nasce ali e vira solicitação de verdade.
    const pedido = `pipeline sem o papel de QA — e2e ${Date.now()}`;
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: /Pipeline de IA/ }).click();
    await page.getByLabel("O que precisa mudar").fill(pedido);
    await page.getByTestId("pedir-ajuste").click();
    await expect(page.getByTestId("pedido-enviado")).toBeVisible();

    const ajustes = await (await page.request.get(`${API}/ajustes`)).json();
    const meu = ajustes.find((a: { descricao: string }) => a.descricao === pedido);
    expect(meu).toBeDefined();
    expect(meu.recurso).toBe("pipeline-agentes");
    expect(meu.solicitante).toBe(EMAIL_BLOQUEADO);

    // E a área PERMITIDA continua abrindo normalmente — o aviso é sobre
    // ausência de permissão, não decoração.
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: /Padrões por componente/ }).click();
    await expect(page.getByTestId("area-sem-permissao")).toHaveCount(0);
  } finally {
    // Apagar o papel DESLIGA o RBAC (se era o único) — é o que devolve a
    // organização ao modo aberto pros próximos.
    await page.context().clearCookies();
    await entrar(page);
    await page.request.delete(`${API}/times/${TIME}/membros/${EMAIL_BLOQUEADO}`);
    // TODOS os papéis, não só o meu: criar o primeiro papel faz o servidor
    // criar junto o "Administrador" (a tranca que impede de trancar quem ligou
    // o RBAC, ver NOME_PAPEL_ADMINISTRADOR). Apagar só o meu deixava esse de
    // pé — e papel existindo é o que MANTÉM o RBAC ligado, então a suíte
    // seguinte inteira levava 403 por um motivo nascido aqui.
    const papeis = (await (await page.request.get(`${API}/acessos/papeis`)).json()) as Array<{ id: string }>;
    for (const p of papeis) await page.request.delete(`${API}/acessos/papeis/${p.id}`);
    // Aferido, não presumido: sobrar um papel é justamente o que não dá pra
    // descobrir daqui — o estrago aparece na próxima corrida.
    expect((await (await page.request.get(`${API}/acessos/papeis`)).json()).length, "RBAC desligado de volta").toBe(0);
  }
});

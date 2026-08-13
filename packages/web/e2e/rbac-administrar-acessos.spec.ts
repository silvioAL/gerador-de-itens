import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * Revisão de cobertura — administrar acessos PELA TELA.
 *
 * O `rbac-cadeado-e-pedido` cobre o lado de quem é barrado, mas monta o
 * cenário pela API. O caminho de quem ADMINISTRA — criar papel, marcar
 * permissão na matriz, colocar alguém dentro — nunca foi percorrido no
 * navegador, e é o que liga o RBAC da organização inteira: um defeito aqui
 * tranca todo mundo, ou libera todo mundo, sem aviso.
 *
 * Roda no projeto `rbac` (depois de todos os outros) porque existir um papel
 * muda o comportamento da organização inteira — ver playwright.config.ts.
 */
test("criar papel, marcar permissão e colocar alguém dentro — tudo pela tela", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const nomeDoPapel = `Agilidade e2e ${Date.now()}`;
  const convidado = "curador-e2e@gerador.local";
  try {
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Acessos" }).click();

    // Antes do primeiro papel, a organização está em MODO ABERTO — e a tela
    // diz isso, em vez de mostrar uma lista vazia sem explicação.
    await expect(page.getByTestId("acessos-modo-aberto")).toBeVisible();

    await page.getByLabel("Nome do novo papel").fill(nomeDoPapel);
    await page.getByRole("button", { name: "Criar papel" }).click();

    const cartao = page.getByTestId(`papel-${nomeDoPapel}`);
    await expect(cartao).toBeVisible();

    // A matriz recurso × ação: marcar "editar" no checklist de processo é
    // exatamente o pedido que originou a SPEC-28 ("Agilidade cuida do
    // processo").
    // `click` + asserção, e não `check()`: a marcação só vira verdade quando o
    // servidor responde e a lista recarrega (o checkbox é controlado pelo que
    // veio de lá). `check()` exige mudança síncrona e falharia por um motivo
    // que não é defeito — mas a espera pelo estado final é justamente o que se
    // quer provar aqui.
    const permissao = cartao.getByRole("checkbox", { name: `${nomeDoPapel}: editar regras.checklistProcesso` });
    await permissao.click();
    await expect(permissao).toBeChecked();

    await cartao.getByLabel(`Adicionar pessoa em ${nomeDoPapel}`).fill(convidado);
    await cartao.getByRole("button", { name: "Adicionar" }).click();
    await expect(cartao).toContainText(convidado);

    // O que a tela mostra tem que ser o que o SERVIDOR guardou — não estado
    // de formulário que some no F5.
    await page.reload();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Acessos" }).click();
    const depoisDoReload = page.getByTestId(`papel-${nomeDoPapel}`);
    await expect(depoisDoReload).toContainText(convidado);
    await expect(
      depoisDoReload.getByRole("checkbox", { name: `${nomeDoPapel}: editar regras.checklistProcesso` })
    ).toBeChecked();

    // E o modo aberto acabou: existir papel é o que LIGA o controle de acesso.
    await expect(page.getByTestId("acessos-modo-aberto")).toHaveCount(0);
  } finally {
    // Todos os papéis, não só o meu: criar o primeiro faz o servidor criar
    // junto o "Administrador" (a tranca que impede de trancar quem ligou o
    // RBAC), e deixá-lo de pé manteria o controle ligado para a próxima
    // corrida — o estrago que a §203 documentou.
    const papeis = (await (await page.request.get(`${API}/acessos/papeis`)).json()) as { id: string }[];
    for (const p of papeis) await page.request.delete(`${API}/acessos/papeis/${p.id}`);
    expect((await (await page.request.get(`${API}/acessos/papeis`)).json()).length, "RBAC desligado de volta").toBe(0);
  }
});

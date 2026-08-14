import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";
const EMAIL_BLOQUEADO = "bloqueado-e2e@gerador.local";
const TIME = "time-pagamentos";

/**
 * SPEC-51 (§203) — o caminho NEGADO, com o RBAC ligado de verdade.
 *
 * §221 trocou o mecanismo: onde havia cadeado clicável no menu, agora há
 * AUSÊNCIA. A tela de "sem permissão" e o pedido de ajuste continuam existindo
 * e continuam cobertos aqui — o caminho até eles é o link direto, já que as
 * áreas são deep-linkáveis (`rota.ts`).
 *
 * Este spec liga o controle de acesso da ORGANIZAÇÃO (criar um papel é o que
 * liga), então roda no projeto `rbac`, que depende do `app`: sozinho, depois
 * de todos os outros. Sem isso, qualquer spec vizinho que assume o modo
 * aberto passaria a levar 403 no meio da corrida.
 *
 * O usuário do teste entra com nível `operar` — owner passaria pelo bypass da
 * SPEC-38 e o teste mediria o portão errado.
 */
/**
 * Os dois testes deste arquivo mexem no MESMO estado global: os papéis da
 * organização. Em paralelo, o `finally` de um apaga os papéis que o outro
 * ainda está usando — e o efeito é o cadeado sumindo no meio do vizinho, uma
 * falha que não tem nada a ver com o que ele testa (aconteceu; a CI pegou).
 *
 * `serial` no mesmo arquivo é o que garante um por vez: `fullyParallel: false`
 * no projeto não bastaria, porque o Playwright ainda distribui ARQUIVOS
 * diferentes entre workers.
 */
test.describe.configure({ mode: "serial" });

test("com RBAC ligado: área negada some do menu, e o pedido de ajuste vive no link direto", async ({ page }) => {
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

    // §221 — o menu OCULTA o que ela não edita, em vez de mostrar com cadeado.
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await expect(page.getByRole("button", { name: /Padrões por componente/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Modelo de IA/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Acessos" })).toHaveCount(0);
    await expect(page.getByText("🔒")).toHaveCount(0);
    // Fechar de verdade: navegar por hash não remonta o app, e o menu aberto
    // fica na frente interceptando os cliques da tela de destino.
    await page.getByRole("button", { name: "Fechar menu" }).click();
    await expect(page.getByTestId("menu-lateral")).toHaveCount(0);

    // Sumir do menu NÃO abre a porta: quem chega por link (as áreas são
    // deep-linkáveis, `rota.ts`) continua barrado, e é ali que o pedido vive
    // agora que o cadeado clicável saiu.
    await page.goto("/#/config/modelo-ia");
    await expect(page.getByTestId("area-sem-permissao")).toContainText("não tem permissão");

    // Área de acesso não se pede — manda falar com um owner.
    await page.goto("/#/config/acessos");
    await expect(page.getByTestId("area-sem-permissao")).toContainText("owner do time");
    await expect(page.getByTestId("pedir-ajuste")).toHaveCount(0);

    // Área solicitável: o pedido nasce ali e vira solicitação de verdade.
    const pedido = `pipeline sem o papel de QA — e2e ${Date.now()}`;
    await page.goto("/#/config/pipeline");
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

/**
 * §220 — o lado OWNER, que faltava, e que era exatamente onde o defeito morava.
 *
 * O primeiro spec deste arquivo entra com nível `operar` e explica por quê:
 * *"owner passaria pelo bypass da SPEC-38 e o teste mediria o portão errado"*.
 * O comentário estava certo sobre o SERVIDOR e ninguém foi conferir a TELA —
 * onde o `pode()` só olhava o grant RBAC. Efeito, reproduzido contra o banco de
 * desenvolvimento antes de virar teste: um owner com um único grant via cadeado
 * em TUDO no instante em que a organização ganhava o primeiro papel, enquanto
 * `POST /campos-no` respondia 400 de validação — não 403.
 *
 * Aqui os dois eixos aparecem na mesma tela, e é isso que faz o teste valer:
 * o recurso CURADO por outro papel fica trancado até para o owner, e o não
 * curado abre.
 */
test("owner com RBAC ligado: só some do menu onde há curadoria de outro papel", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );

  await entrar(page);
  // Papel de OUTRA pessoa: liga o RBAC da organização E liga a curadoria de
  // `perfis-stack` — sem dar grant nenhum de `perfis-stack` a quem é owner.
  const respPapel = await page.request.post(`${API}/acessos/papeis`, {
    data: { nome: `Curador de stack e2e ${Date.now()}`, permissoes: [{ recurso: "perfis-stack", acao: "editar" }] },
  });
  expect(respPapel.status(), "papel criado (LIGA o RBAC e a curadoria)").toBe(201);
  const papel = await respPapel.json();

  try {
    const rAtrib = await page.request.post(`${API}/acessos/papeis/${papel.id}/membros`, {
      data: { email: "curador-stack-e2e@gerador.local" },
    });
    expect(rAtrib.status(), "papel atribuído a OUTRA pessoa").toBe(201);

    await page.reload();
    await page.getByRole("button", { name: "☰ Menu" }).click();

    // Sem curadoria: o owner edita — é o `exigirPermissao` da SPEC-38, e era
    // isto que aparecia trancado antes do §220.
    for (const area of [/Padrões por componente/, /Campos por tipo de conexão/, /Especificação de solução/, /Pipeline de IA/]) {
      await expect(page.getByRole("button", { name: area }), `${area} visível`).toBeVisible();
    }

    // Com curadoria de outro papel: negado INCLUSIVE para o owner — é o
    // `exigirEdicaoCurada`, a exceção deliberada ao bypass. Desde o §221 isso
    // se manifesta como AUSÊNCIA no menu, não como cadeado.
    await expect(page.getByRole("button", { name: /Stacks conhecidas/ })).toHaveCount(0);
    await expect(page.getByText("🔒")).toHaveCount(0);

    // E o servidor continua sendo quem nega de fato — a ocultação é conveniência.
    await page.goto("/#/config/perfis-stack");
    await expect(page.getByTestId("area-sem-permissao")).toBeVisible();
  } finally {
    const papeis = (await (await page.request.get(`${API}/acessos/papeis`)).json()) as { id: string }[];
    for (const p of papeis) await page.request.delete(`${API}/acessos/papeis/${p.id}`);
    expect((await (await page.request.get(`${API}/acessos/papeis`)).json()).length, "RBAC desligado de volta").toBe(0);
  }
});

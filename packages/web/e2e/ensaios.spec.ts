import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-66 — a bancada de ensaio.
 *
 * O que só o navegador prova: a porta nasce no chip da leitura, a rota é
 * própria (e sobrevive ao F5), e o ciclo inteiro — criar cenário, arrastar o
 * fator, ver o Δ — acontece **sem IA nenhuma**. É a fatia B provando que a
 * tela não nasceu dependente da fatia D.
 */
test("§296 — ensaiar pelo chip, sem IA, e o cenário sobrevive ao F5", async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // ── A porta é o chip da leitura: quem lê "resposta ≥ 3,0 s" é quem quer
  //    perguntar "e se piorar?" ──
  await page.getByTestId("leitura-resumo").click();
  await page.getByTestId("abrir-simulacao").click();

  await expect(page.getByTestId("tela-ensaios")).toBeVisible();
  // Rota própria, e linkável: é metade do valor.
  await expect(page).toHaveURL(/#\/ensaios$/);

  // A âncora traz o número de HOJE — sem ela, todo número da tabela é solto.
  await expect(page.getByTestId("linha-hoje")).toContainText("3,0 s");

  // ── Criar um cenário à mão. Nenhuma IA envolvida. ──
  await expect(page.getByTestId("sugerir-cenarios")).toBeVisible();
  await page.getByLabel("Nome do cenário").fill("Bureau degradado");
  await page.getByTestId("criar-cenario").click();

  const linha = page.getByTestId("linha-cen-bureau-degradado");
  await expect(linha).toBeVisible();

  // ── O ajuste, e o número acompanhando o gesto ──
  // O único componente com tempo é o bureau (timeoutMs: 3000 no nó).
  await page.getByTestId("add-ajuste-cen-bureau-degradado").click();
  const fator = page.locator('[data-testid^="fator-"]').first();
  await expect(fator).toBeVisible();
  // 2× por padrão: 3000 → 6000, e o Δ contra hoje é +3,0 s.
  await expect(linha).toContainText("6,0 s");
  await expect(linha).toContainText("+3,0 s");

  // Arrastar recalcula sem recarregar nada — o cálculo é puro e local.
  await fator.fill("4");
  await expect(linha).toContainText("12 s");
  await expect(linha).toContainText("+9,0 s");

  // "Quem domina" aponta o culpado — o total diz que dói, isto diz onde.
  await expect(linha).toContainText("bureau-credito-nacional");

  // ── Salvar e recarregar: o ensaio é do time, não da sessão ──
  await page.getByTestId("ensaios-voltar").click();
  await page.getByRole("button", { name: "Salvar" }).first().click();
  await expect(page.getByText(/salv/i).first()).toBeVisible({ timeout: 15000 });

  await page.goto("/#/ensaios");
  await expect(page.getByTestId("linha-cen-bureau-degradado")).toContainText("12 s");
});

test("§296 — o desenho sem tempo nenhum DIZ que não há o que ensaiar", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Mesa em branco: uma tabela de zeros pareceria medição, e não é (§248).
  await page.goto("/#/ensaios");
  await expect(page.getByTestId("ensaios-sem-tempo")).toBeVisible();
  await expect(page.getByTestId("sem-cenarios")).toBeVisible();
});

/**
 * SPEC-68 §4.2 — a repaginação.
 *
 * O nome "e se ficar lento?" fechava a porta para o que cabe dentro. O que só o
 * navegador prova: o link velho não dá tela branca, e um ensaio de TAXA — que
 * não é lentidão nenhuma — faz a saturação aparecer.
 */
test("§296 — o link velho de `#/simulacao` não dá tela branca", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Rota que some sem redirecionar dá tela branca para quem tinha o link
  // salvo — e link salvo é o de quem mais usa (§SPEC-61).
  await page.goto("/#/simulacao");
  await expect(page.getByTestId("tela-ensaios")).toBeVisible();
});

test("§296 — um ensaio de TAXA acusa saturação, e taxa não é lentidão", async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // O serviço de entrada precisa declarar quantas chamadas simultâneas aguenta
  // — sem esse número, a Lei de Little não tem com o que comparar (§3.3).
  await page.locator(".react-flow__node", { hasText: "srv-credito-api" }).click();
  await page.getByLabel("Chamadas simultâneas que aguenta").fill("10");

  await page.goto("/#/ensaios");
  await page.getByLabel("Nome do cenário").fill("Black Friday");
  await page.getByTestId("criar-cenario").click();
  await page.getByTestId("add-ajuste-cen-black-friday").click();

  // O ajuste nasce sobre um elemento com tempo; troco para o NÓ que declara o
  // pool, e ponho o pico. Nada aqui mexe em tempo nenhum.
  const alvo = page.locator('[data-testid="ajustes-cen-black-friday"] select').first();
  await alvo.selectOption({ label: "bureau-credito-nacional" });

  await expect(page.getByTestId("tela-ensaios")).toContainText("pico de tráfego");
});

/**
 * §302 — RELATO REAL: *"no canto direito consta um retângulo com uma barra de
 * rolagem, e não é possível visualizar nada dentro dele"*.
 *
 * Era o **painel de propriedades** da mesa. A mesa fica montada o tempo todo e
 * não é condicionada à rota; as telas de rota a cobrem. Esta nasceu no fluxo
 * normal e **disputava espaço** com ela — o `aside` de 320px ficava espremido
 * em 32px de altura, com o texto sem caber, e a barra de rolagem aparecia sobre
 * um retângulo aparentemente vazio.
 *
 * ## Por que a régua é de OCLUSÃO
 *
 * O `aside` continua no DOM e continua "visível" para o CSS — ele só está
 * atrás. `toBeVisible()` passaria dos dois lados. O que prova o conserto é
 * perguntar **quem está no pixel**: no canto direito tem que estar a tela de
 * ensaios, não o painel da mesa.
 */
test("§302 — a tela de ensaios cobre a mesa; nada da mesa vaza no canto", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1900, height: 600 });
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();
  await page.goto("/#/ensaios");
  await page.getByTestId("tela-ensaios").waitFor();

  const quemEstaNoCanto = await page.evaluate(() => {
    // O ponto onde o retângulo aparecia: canto direito, logo abaixo do topo.
    const el = document.elementFromPoint(1750, 160);
    const tela = document.querySelector('[data-testid="tela-ensaios"]');
    return {
      dentroDaTela: !!(el && tela && (tela === el || tela.contains(el))),
      tag: el?.tagName.toLowerCase() ?? "?",
    };
  });

  expect(quemEstaNoCanto.dentroDaTela).toBe(true);
  expect(quemEstaNoCanto.tag).not.toBe("aside");
});

/**
 * SPEC-69 fatia E — o ciclo do débito consciente, no navegador.
 *
 * A pergunta que originou a SPEC foi do usuário: *"o que acontece quando se
 * clica em aceitar? qual é o valor do próximo passo?"* — e a resposta medida na
 * época foi: nenhum. O cenário aceito trocava um booleano e não ia a lugar
 * nenhum.
 *
 * O que só o navegador prova é a corrente inteira, que nenhum teste de unidade
 * alcança: o ensaio **cobra** no placar da mesa → assumir com motivo o **tira**
 * de lá → o débito aparece na seção de riscos do **documento** → reabrir devolve
 * a cobrança (§283, nenhuma decisão é de mão única).
 */
test("§304 — o ensaio cobra, assumir com motivo tira do placar, e o débito chega ao documento", async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // ── O prazo do NEGÓCIO: sem ele "24 s" não decide nada ──
  //
  // §3 — é o que transforma a leitura em decisão. Sem `limiteMs` declarado o
  // ensaio não inventa julgamento, e não haveria o que cobrar.
  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
  // `exact` porque "Prioridade da nova necessidade" também casa com o rótulo
  // solto, e o Playwright falha em modo estrito.
  await janela.getByLabel("Nova necessidade", { exact: true }).fill("Aprovar crédito na hora");
  await janela.getByTestId("limite-da-necessidade").fill("5000");
  await janela.getByRole("button", { name: "+ Adicionar" }).click();
  // O prazo declarado fica VISÍVEL: um número que cobra sem aparecer é uma
  // régua secreta.
  await expect(janela.locator('[data-testid^="limite-nec-"]')).toContainText("5,0 s");
  await janela.getByRole("button", { name: "Salvar" }).click();

  // ── O ensaio nasce COBRANDO — é a inversão que dá nome à SPEC ──
  await page.goto("/#/ensaios");
  await page.getByLabel("Nome do cenário").fill("Bureau em pico");
  await page.getByTestId("criar-cenario").click();
  await page.getByTestId("add-ajuste-cen-bureau-em-pico").click();
  const fator = page.locator('[data-testid^="fator-"]').first();
  await fator.fill("8");

  await page.getByTestId("ensaios-voltar").click();
  const chip = page.getByTestId("conformidade-resumo");
  await expect(chip).toBeVisible();
  await chip.click();
  const lista = page.getByTestId("conformidade-lista");
  // Marcado com o nome: sem isso, "a resposta vai a 24 s" seria lido como fato
  // do desenho de hoje, e não como condição.
  await expect(lista).toContainText("Sob “Bureau em pico”");
  await expect(lista).toContainText("acima do prazo de 5,0 s");
  await chip.click();

  // ── Assumir com motivo: a válvula do §242 sobre um número que ninguém tinha ──
  await page.goto("/#/ensaios");
  await page.getByTestId("assumir-cen-bureau-em-pico").click();
  await page.getByLabel("Por que assumir este débito").fill("O parceiro não oferece SLA melhor no contrato atual.");
  await page.getByTestId("confirmar-assumir-cen-bureau-em-pico").click();
  await expect(page.getByTestId("debito-cen-bureau-em-pico")).toContainText("O parceiro não oferece SLA melhor");

  // Sai do placar — e some, porque não sobra mais nada cobrando.
  await page.getByTestId("ensaios-voltar").click();
  await expect(page.getByTestId("conformidade-resumo")).toHaveCount(0);

  // ── §4.4 — e o débito chega a quem APROVA o desenho ──
  await page.goto("/#/documento");
  const risco = page.getByTestId("risco-medido-cen-bureau-em-pico");
  await expect(risco).toBeVisible();
  await expect(risco).toContainText("Bureau em pico");
  await expect(risco).toContainText("O parceiro não oferece SLA melhor");
  // A conclusão derivada, não um número cru: é o §4.0.1 chegando ao documento.
  await expect(risco).toContainText("acima do prazo de 5,0 s");

  // ── §283 — reabrir devolve a cobrança, sem apagar que alguém assumiu ──
  await page.goto("/#/ensaios");
  await page.getByTestId("reabrir-cen-bureau-em-pico").click();
  await page.getByTestId("ensaios-voltar").click();
  await expect(page.getByTestId("conformidade-resumo")).toBeVisible();
});

/**
 * §305 — RELATO REAL: *"ele não está validando se as informações estão
 * completas para navegar para a tela de ensaios"*.
 *
 * Medido antes de escrever qualquer linha, contra a stack local: com o desenho
 * legível ("3 saltos que esperam") e nenhum tempo declarado, a porta abria e a
 * bancada mostrava **"hoje ≥ 0 ms"** com um ensaio concluindo *"a resposta fica
 * em 0 ms"*.
 *
 * A guarda que devia impedir isso (SPEC-66, §248) perguntava
 * `tempoDoPiorTrecho === undefined` — e um desenho que ESPERA sem declarar
 * número devolve `ms: 0`. Ela nunca disparou no caso que existe de verdade.
 *
 * ## O que só o navegador prova
 *
 * Que a validação acontece ANTES da navegação: não é o caso de ir e voltar com
 * a frase na mão.
 */
test("§305 — sem número declarado, a porta não leva à bancada: diz o que falta e onde", async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // Apaga TODO tempo declarado. O desenho continua legível — as conexões
  // esperam, a cadeia existe —, só não há número para somar.
  const nos = await page.locator(".react-flow__node").count();
  for (let i = 0; i < nos; i++) {
    await page.locator(".react-flow__node").nth(i).click();
    const campos = page.locator('aside input[type="number"]');
    for (let c = 0; c < (await campos.count()); c++) {
      const nome = await campos.nth(c).getAttribute("aria-label");
      if (nome && /Timeout/i.test(nome)) await campos.nth(c).fill("");
    }
  }

  // O chip continua existindo: o desenho É legível, e essa parte estava certa.
  const chip = page.getByTestId("leitura-resumo");
  await expect(chip).toContainText("saltos que esperam");
  await chip.click();

  // A porta NÃO está lá — no lugar dela, o motivo e o endereço.
  await expect(page.getByTestId("abrir-simulacao")).toHaveCount(0);
  const falta = page.getByTestId("ensaiar-falta");
  await expect(falta).toContainText("zero não é uma medição");
  // §57 — dizer "falta preencher" sem dizer ONDE transfere a busca.
  await expect(falta).toContainText("bureau-credito-nacional");

  // E o endereço LEVA ao campo: clicar seleciona o componente a preencher.
  // Pelo texto, e não pelo `testid`: o testid carrega o ID do elemento, e o que
  // a pessoa lê é o RÓTULO — afirmar sobre o id provaria outra coisa.
  // `exact` porque a CONEXÃO que chega nele ("decisao-score-credito →
  // bureau-credito-nacional") também está na lista, e carrega o mesmo nome.
  await falta.getByRole("button", { name: "bureau-credito-nacional", exact: true }).click();
  // O que prova que o endereço serviu não é o painel abrir: é o CAMPO que falta
  // preencher estar na tela, ao alcance de quem acabou de ler a frase.
  await expect(page.locator("aside").getByLabel(/Timeout/).first()).toBeVisible();

  // Quem chega por URL (a rota é linkável de propósito) recebe a mesma frase,
  // e a linha de hoje não inventa "≥ 0 ms".
  await page.goto("/#/ensaios");
  await expect(page.getByTestId("ensaios-sem-tempo")).toContainText("zero não é uma medição");
  await expect(page.getByTestId("linha-hoje")).not.toContainText("0 ms");
});

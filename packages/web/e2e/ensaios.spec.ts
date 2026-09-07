import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-110 fatia B (D4) — **abrir a bancada é DISPARAR o fluxo do ensaio.**
 *
 * Ela deixou de ser um painel com endereço próprio (`#/ensaios`) e virou a
 * TELA `bancada-de-ensaios` no meio da fiação: a execução roda a demanda e o
 * ensaio e PARA nela. Este atalho é exatamente o que o produto faz nos dois
 * gestos que levam lá — o chip "e se piorar?" da leitura e o "Simular" da
 * mesa. Os links legados continuam vivos: caem no canvas do fluxo, onde a
 * fiação (com a bancada desenhada nela) está à vista.
 *
 * Sem `demandaId`: o servidor usa a mais recentemente atualizada do time, que
 * é a que estes testes acabaram de salvar — o mesmo default de sempre.
 */
/** O id da demanda ABERTA, se ela já existe no banco. O casamento é pelo
 * título porque é o que a mesa mostra — e o poll existe porque o salvamento é
 * assíncrono (o título aparece na tela antes de a linha existir). */
async function idDaDemandaAberta(page: Page, timeoutMs: number): Promise<string | undefined> {
  const titulo = (await page.getByTestId("titulo-da-quebra").innerText().catch(() => "")).trim();
  if (!titulo) return undefined;
  let achado: string | undefined;
  const ate = Date.now() + timeoutMs;
  do {
    const lista = (await (await page.request.get(`${API}/quebras`)).json()) as { id: string; titulo?: string }[];
    achado = lista.find((q) => q.titulo && titulo.includes(q.titulo))?.id;
    if (achado) return achado;
    await page.waitForTimeout(500);
  } while (Date.now() < ate);
  return undefined;
}

async function abrirBancada(page: Page) {
  /**
   * SPEC-110 fatia B — **abrir exige demanda SALVA**, e isso é consequência do
   * desenho, não acidente: a porta virou uma execução, e a execução lê a
   * demanda pelo id. Antes, abrir era grátis e só MEDIR exigia o banco (desde
   * a 107-G4) — um estado meio útil, em que a tela abria para não medir nada.
   *
   * Salvar só quando ainda NÃO há linha no banco: o produto faz o mesmo (o
   * "Simular" chama `persistencia.salvar()`, que é idempotente), e clicar
   * "Salvar" a esmo no meio de um teste acerta o botão de outro painel — foi
   * o que aconteceu no §304, com a janela das necessidades aberta por cima.
   */
  let demandaId = await idDaDemandaAberta(page, 4000);
  if (!demandaId) {
    await page.getByRole("button", { name: "Salvar" }).first().click();
    const campoTitulo = page.getByLabel("ex.: Fatura mensal em lote");
    if (await campoTitulo.isVisible().catch(() => false)) {
      await campoTitulo.fill(`ensaio e2e ${Date.now()}`);
      await page.getByTestId("assistente-balao-confirmar").click();
    }
    await expect(page.getByTestId("titulo-da-quebra")).toBeVisible({ timeout: 20000 });
    /**
     * Salvar acorda o balão do assistente ("Tudo verde — a quebra está pronta
     * para derivar…"), que FLUTUA sobre o resto e intercepta cliques. Ele é
     * consequência do salvamento que este atalho passou a fazer — e na CI, mais
     * lenta, ainda estava aberto quando o teste tentava clicar num botão da
     * bancada. Fechá-lo aqui é o que a pessoa faria antes de seguir.
     */
    const fecharBalao = page.getByRole("button", { name: "Dispensar sugestão" });
    if (await fecharBalao.isVisible().catch(() => false)) await fecharBalao.click();
    demandaId = await idDaDemandaAberta(page, 20000);
  }
  if (!demandaId) throw new Error("a demanda aberta não chegou ao banco — sem ela não há o que ensaiar");

  /**
   * O `demandaId` vai EXPLÍCITO, como o produto faz (`parametrosPorNo` com a
   * demanda aberta, SPEC-107 G5c). O default do servidor — "a mais recente do
   * time" — é uma adivinhação honesta para quem não sabe, e péssima para um
   * teste: dois specs em paralelo no mesmo time ensaiariam a demanda do outro.
   */
  const r = await page.request.post(`${API}/fluxos/ensaio-de-cenarios/executar`, {
    data: { parametrosPorNo: { demanda: { demandaId } } },
  });
  const corpo = (await r.json()) as { execucaoId?: string; aguardandoTela?: { noId: string }; nos?: { noId: string; erro?: string }[] };
  if (!corpo.aguardandoTela) {
    const falha = corpo.nos?.find((n) => n.erro);
    throw new Error(`a execução do ensaio não parou na bancada${falha ? `: ${falha.noId} — ${falha.erro}` : ""}`);
  }
  await page.goto(`/#/tela/${corpo.execucaoId}`);
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });
}

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

  /**
   * SPEC-107 G4 — o desenho é montado À MÃO, no time de quem está logado, e
   * SALVO antes de ensaiar. A bancada deixou de simular no navegador: cada
   * número vem de uma execução da fiação semeada `ensaio-de-cenarios`, que lê
   * a demanda SALVA — e o cenário de demonstração é do `time-credito`, onde o
   * usuário do E2E não salva (403; a mesma medição do teste do F5, abaixo).
   * A LEITURA é a mesma de sempre: 3,0 s de hoje, o Δ contra hoje, quem domina.
   */
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.getByRole("button", { name: "+ API Externa" }).click();
  const svc = page.locator(".react-flow__node", { hasText: "Serviço" }).first();
  const api = page.locator(".react-flow__node", { hasText: "API Externa" }).first();
  await svc.waitFor();
  await api.waitFor();
  const origem = svc.locator(".react-flow__handle-right.source");
  const destino = api.locator(".react-flow__handle-left.target");
  const caixaOrigem = await origem.boundingBox();
  const caixaDestino = await destino.boundingBox();
  if (!caixaOrigem || !caixaDestino) throw new Error("handle de conexão não encontrado no DOM");
  await page.mouse.move(caixaOrigem.x + caixaOrigem.width / 2, caixaOrigem.y + caixaOrigem.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixaDestino.x + caixaDestino.width / 2, caixaDestino.y + caixaDestino.height / 2, { steps: 15 });
  await page.mouse.up();
  // O tempo vai no NÓ da API externa (como o bureau do cenário pronto): é ele
  // que o primeiro ajuste da bancada vai mirar — ajuste sobre elemento sem
  // tempo multiplicaria nada e o Δ diria "igual".
  await api.click();
  await page.locator("aside").getByLabel(/Timeout/).first().fill("3000");

  await page.getByRole("button", { name: "Salvar" }).first().click();
  await page.getByLabel("ex.: Fatura mensal em lote").fill("Ensaio pelo chip");
  await page.getByTestId("assistente-balao-confirmar").click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText("Ensaio pelo chip");

  // ── A porta é o chip da leitura: quem lê "resposta ≥ 3,0 s" é quem quer
  //    perguntar "e se piorar?" ──
  await page.getByTestId("leitura-resumo").click();
  await page.getByTestId("abrir-simulacao").click();

  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });
  /**
   * SPEC-110 fatia B (D4) — a bancada mudou de casa: ela é a TELA
   * `bancada-de-ensaios` no meio da fiação do ensaio, e o chip agora EXECUTA o
   * fluxo. A execução para nela, e o endereço é o do STAGE — mandável para
   * quem revisa, que é o que a SPEC-66 §5 sempre prometeu.
   */
  await expect(page).toHaveURL(/#\/tela\//, { timeout: 30000 });
  // A moldura Retornar/Avançar é do SHELL, ao redor da bancada (D17c): a
  // bancada não mudou por dentro, e agora tem uma decisão de saída.
  await expect(page.getByTestId("tela-do-stage")).toBeVisible();
  await expect(page.getByTestId("tela-avancar")).toBeVisible();
  await expect(page.getByTestId("tela-retornar")).toBeVisible();

  // A âncora traz o número de HOJE — sem ela, todo número da tabela é solto.
  await expect(page.getByTestId("linha-hoje")).toContainText("3,0 s");

  // ── Criar um cenário à mão. Nenhuma IA envolvida. ──
  await expect(page.getByTestId("sugerir-cenarios")).toBeVisible();
  await page.getByLabel("Nome do cenário").fill("Bureau degradado");
  await page.getByTestId("criar-cenario").click();

  const linha = page.getByTestId("linha-cen-bureau-degradado");
  await expect(linha).toBeVisible();

  // ── O ajuste, e o número acompanhando o gesto ──
  // O único elemento com tempo é a conexão (Timeout: 3000).
  await page.getByTestId("add-ajuste-cen-bureau-degradado").click();
  const fator = page.locator('[data-testid^="fator-"]').first();
  await expect(fator).toBeVisible();
  // 2× por padrão: 3000 → 6000, e o Δ contra hoje é +3,0 s. O número agora
  // atravessa a fiação — o `expect` espera a leitura voltar.
  await expect(linha).toContainText("6,0 s");
  await expect(linha).toContainText("+3,0 s");

  // Arrastar recalcula — a MESMA leitura, agora medida no servidor.
  await fator.fill("4");
  await expect(linha).toContainText("12 s");
  await expect(linha).toContainText("+9,0 s");

  // "Quem domina" aponta o culpado — o total diz que dói, isto diz onde.
  await expect(linha).toContainText("API Externa");

  /**
   * O F5 saiu DAQUI, e não por preguiça — por três medições.
   *
   * Este trecho terminava com `Salvar` + `page.goto("/#/ensaios")` e afirmava
   * *"o ensaio é do time, não da sessão"*. Trocar o `goto` por um `reload()` de
   * verdade descascou três mentiras empilhadas, todas verdes:
   *
   * 1. **`goto` de fragmento é same-document.** Não recarrega nada; o estado em
   *    memória sobrevive, e a asserção lia a própria sessão. A armadilha já
   *    estava documentada num spec vizinho (`regras-por-componente.spec.ts`).
   * 2. **A demanda nunca era salva.** O cenário de demonstração vem sem título,
   *    e `salvarQuebra` sem título abre a pergunta do nome. O teste conferia
   *    `getByText(/salv/i)` — que casa com *"dê um título antes de salvar"* tão
   *    bem quanto com *"salvo"*.
   * 3. **E não poderia ser salva.** O cenário pronto é do `time-credito`, e o
   *    usuário do E2E não tem nível `operar` nele: o POST volta 403.
   *
   * O que este teste prova de verdade — a porta pelo chip, o ajuste, o Δ e o
   * "quem domina" — continua aqui inteiro. A prova de PERSISTÊNCIA virou teste
   * próprio, logo abaixo, com uma demanda montada à mão no time de quem está
   * logado: é a única forma de o F5 medir o que ele diz medir.
   */
});

/**
 * SPEC-71 fatia D — o F5 DE VERDADE.
 *
 * A pergunta: *assumir um ensaio, dar F5, e o débito continuar assumido?*
 * Medido contra o servidor real antes desta rodada, a resposta era não — o
 * `cenariosDeLentidao` inteiro sumia no salvamento, e com ele o estado, o
 * débito, o autor e o motivo.
 *
 * Três decisões deste teste, e as três vieram de o anterior estar mentindo:
 *
 * - **`reload()`, nunca `goto` de fragmento.** Só o reload joga fora a memória.
 * - **Reabrir pelo menu**, como quem volta no dia seguinte — é o caso real.
 * - **Demanda montada à mão, no time de quem está logado.** O cenário de
 *   demonstração é de outro time, e salvá-lo volta 403.
 */
test("SPEC-71 — o ensaio assumido sobrevive ao F5, com o débito e o motivo", async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Um desenho mínimo com tempo declarado — sem número, não há o que ensaiar
  // (§305). Mesmo caminho do teste do §306, e pelo mesmo motivo: o cenário
  // pronto não declara `timeoutMs` em conexão nenhuma.
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.getByRole("button", { name: "+ API Externa" }).click();
  const svc = page.locator(".react-flow__node", { hasText: "Serviço" }).first();
  const api = page.locator(".react-flow__node", { hasText: "API Externa" }).first();
  await svc.waitFor();
  await api.waitFor();
  const origem = svc.locator(".react-flow__handle-right.source");
  const destino = api.locator(".react-flow__handle-left.target");
  const caixaOrigem = await origem.boundingBox();
  const caixaDestino = await destino.boundingBox();
  if (!caixaOrigem || !caixaDestino) throw new Error("handle de conexão não encontrado no DOM");
  await page.mouse.move(caixaOrigem.x + caixaOrigem.width / 2, caixaOrigem.y + caixaOrigem.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixaDestino.x + caixaDestino.width / 2, caixaDestino.y + caixaDestino.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.locator(".react-flow__edge").first().click();
  await page.locator("aside").getByLabel(/Timeout/).first().fill("1000");

  // ── Salvar ANTES de ensaiar (SPEC-107 G4): a bancada mede pela fiação, e a
  //    fiação lê a demanda SALVA — sem endereço no banco não há o que medir ──
  const TITULO = "Ensaio que sobrevive ao F5";
  await page.getByRole("button", { name: "Salvar" }).first().click();
  await page.getByLabel("ex.: Fatura mensal em lote").fill(TITULO);
  await page.getByTestId("assistente-balao-confirmar").click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(TITULO);

  // ── O ensaio, e o débito assumido com motivo ──
  await abrirBancada(page);
  await page.getByLabel("Nome do cenário").fill("Parceiro degradado");
  await page.getByTestId("criar-cenario").click();
  await page.getByTestId("add-ajuste-cen-parceiro-degradado").click();
  const fator = page.locator('[data-testid^="fator-"]').first();
  await expect(fator).toBeVisible();
  await fator.fill("4");
  // Antes de salvar: o ajuste está aplicado. A âncora é o VALOR do controle, e
  // não o tempo formatado — o tempo depende da aritmética do desenho, e o que
  // esta rodada mede é se o ajuste sobrevive ao banco, não quanto ele soma.
  // Sem esta linha, um vermelho depois do F5 não diria se a perda foi no
  // salvamento ou se o gesto nunca chegou a valer.
  await expect(fator).toHaveValue("4");

  const MOTIVO = "o pico dura 2h/mês e o negócio aceita a espera";
  await page.getByTestId("assumir-cen-parceiro-degradado").click();
  await page.getByLabel("Por que assumir este débito").fill(MOTIVO);
  await page.getByTestId("confirmar-assumir-cen-parceiro-degradado").click();
  await expect(page.getByTestId("debito-cen-parceiro-degradado")).toContainText(MOTIVO);

  // A frase de resultado ANTES do F5 — é contra ela que a reaberta é
  // comparada. Extraída em vez de escrita à mão: o número sai da aritmética do
  // desenho, e fixá-lo aqui faria este teste falhar por uma mudança no motor
  // que não tem nada a ver com persistência.
  const frase = /A resposta fica em [^.]+\./;
  // G4 — a conclusão chega com a leitura da fiação (debounce + servidor):
  // esperar por ela antes de extrair, senão o innerText lê a linha em "—".
  await expect(page.getByTestId("linha-cen-parceiro-degradado")).toContainText("A resposta fica em", { timeout: 15000 });
  const respostaAntes = (await page.getByTestId("linha-cen-parceiro-degradado").innerText()).match(frase)?.[0];
  expect(respostaAntes).toBeTruthy();

  // ── De volta à mesa; o cenário e o débito seguem pelo auto-save ──
  await page.getByTestId("ensaios-voltar").click();

  // A conferência é NO SERVIDOR, e não na tela: é o único jeito de saber que o
  // debounce de 2 s chegou ao banco antes de recarregar. Recarregar cedo
  // testaria a memória mais uma vez.
  const salvaNoServidor = async () => {
    const lista = await (await page.request.get(`${API}/quebras`)).json();
    const q = lista.find((x: { titulo?: string }) => x.titulo === TITULO);
    if (!q) return null;
    return (await (await page.request.get(`${API}/quebras/${q.id}`)).json()) as {
      cenariosDeLentidao?: { estado?: string; debito?: { motivo?: string }; ajustes?: { fator?: number }[] }[];
    };
  };
  await expect
    .poll(async () => (await salvaNoServidor())?.cenariosDeLentidao?.[0]?.debito?.motivo, { timeout: 25000 })
    .toBe(MOTIVO);

  // E o ensaio chegou INTEIRO ao banco, não só o débito: o estado e o ajuste
  // com o fator escolhido. São campos diferentes, perdidos por motivos
  // diferentes — o estado morria no Zod, o ajuste na falta de coluna.
  const noBanco = await salvaNoServidor();
  expect(noBanco?.cenariosDeLentidao?.[0]?.estado).toBe("aceito");
  expect(noBanco?.cenariosDeLentidao?.[0]?.ajustes?.[0]?.fator).toBe(4);

  // ── O F5 ──
  await page.reload();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(TITULO);
  await page.getByRole("button", { name: new RegExp(TITULO) }).click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(TITULO);

  await abrirBancada(page);
  const reaberta = page.getByTestId("linha-cen-parceiro-degradado");
  await expect(reaberta).toBeVisible({ timeout: 15000 });
  // O ensaio voltou com o MESMO resultado — o que só acontece se o ajuste
  // tiver voltado junto. (O controle de fator não aparece num ensaio já
  // assumido: a linha fica em modo de leitura, e por isso o fator gravado é
  // conferido no banco, acima.)
  await expect(reaberta).toContainText(respostaAntes!);
  // …e o DÉBITO, que é o que a SPEC-69 criou e a SPEC-71 mediu sumindo. Sem
  // ele o ensaio volta cobrando quem já tinha decidido, e a decisão registrada
  // — com autor e motivo — desaparece sem aviso.
  await expect(page.getByTestId("debito-cen-parceiro-degradado")).toContainText(MOTIVO);
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
  await abrirBancada(page);
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

  /**
   * Rota que some sem redirecionar dá tela branca para quem tinha o link
   * salvo — e link salvo é o de quem mais usa (§SPEC-61).
   *
   * SPEC-110 fatia B (D4) — o DESTINO mudou, a promessa não: a bancada virou
   * a TELA no meio da fiação do ensaio, então o link velho abre o FLUXO onde
   * ela mora (com o nó dela à vista). Quem quer ensaiar dispara dali — e o
   * chip da leitura e o "Simular" da mesa continuam levando direto.
   */
  await page.goto("/#/simulacao");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("ensaio-de-cenarios", { timeout: 15000 });
  await expect(page.locator('.react-flow__node[data-id="bancada"]')).toBeVisible();
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

  await abrirBancada(page);
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
  await abrirBancada(page);
  await page.getByTestId("tela-ensaios").waitFor();

  /**
   * SPEC-110 fatia B — a promessa é a MESMA, o mecanismo mudou. O §302 nasceu
   * quando a bancada era uma GAVETA sobre a mesa e um `aside` dela vazava no
   * canto em telas largas. Agora a bancada é o CORPO de um stage: quem manda
   * na tela inteira é a moldura. O que se cobra continua sendo "nada da mesa
   * aparece atrás" — só que o dono do ponto passou a ser o stage.
   */
  const quemEstaNoCanto = await page.evaluate(() => {
    // O ponto onde o retângulo aparecia: canto direito, logo abaixo do topo.
    const el = document.elementFromPoint(1750, 160);
    return { tag: el?.tagName.toLowerCase() ?? "?" };
  });

  /**
   * A afirmação é sobre o que NÃO pode estar ali — o `aside` da mesa vazando
   * no canto, que é o defeito do §302. Perguntar "está dentro do stage?"
   * media outra coisa: com a bancada como bloco (e não mais gaveta), o que
   * ocupa aquele ponto depende da altura do conteúdo, que muda com a fonte da
   * CI (a lição do §0.9). O guarda continua guardando; o que caiu foi a parte
   * que só media layout.
   */
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
  await janela.getByRole("button", { name: "📎 Contexto da demanda" }).click();
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
  await abrirBancada(page);
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
  await abrirBancada(page);
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
  await abrirBancada(page);
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
  await abrirBancada(page);
  await expect(page.getByTestId("ensaios-sem-tempo")).toContainText("zero não é uma medição");
  await expect(page.getByTestId("linha-hoje")).not.toContainText("0 ms");
});

/**
 * SPEC-70 fatia D — o volume dito UMA vez, e a conta fechando sozinha.
 *
 * RELATO: *"talvez adicionar uma volumetria geral em algum lugar determinístico
 * relacionado a demanda — distribuir já de forma determinística para o motor,
 * **assim o usuário não precisa preencher**"*.
 *
 * O que só o navegador prova: o número entra na demanda, atravessa o motor e
 * chega ao placar — sem ninguém digitar taxa em componente nenhum. Era o
 * trabalho que a Lei de Little cobrava nó a nó.
 */
test("§306 — o volume da demanda faz a saturação aparecer, sem digitar taxa em nó nenhum", async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Um desenho mínimo, montado à mão: serviço → API externa, com a conexão
  // ARRASTADA de verdade.
  //
  // O cenário pronto não serve aqui, e a medição disse por quê: nenhuma das
  // conexões dele declara `timeoutMs`, e a Lei de Little soma o timeout das
  // CONEXÕES que esperam. Sem esse número a conta não se faz, com ou sem
  // volumetria — o teste ficaria verde-por-motivo-errado ou vermelho por algo
  // que não é o que ele mede.
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.getByRole("button", { name: "+ API Externa" }).click();
  const svc = page.locator(".react-flow__node", { hasText: "Serviço" }).first();
  const api = page.locator(".react-flow__node", { hasText: "API Externa" }).first();
  await svc.waitFor();
  await api.waitFor();
  const origem = svc.locator(".react-flow__handle-right.source");
  const destino = api.locator(".react-flow__handle-left.target");
  const caixaOrigem = await origem.boundingBox();
  const caixaDestino = await destino.boundingBox();
  if (!caixaOrigem || !caixaDestino) throw new Error("handle de conexão não encontrado no DOM");
  await page.mouse.move(caixaOrigem.x + caixaOrigem.width / 2, caixaOrigem.y + caixaOrigem.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixaDestino.x + caixaDestino.width / 2, caixaDestino.y + caixaDestino.height / 2, { steps: 15 });
  await page.mouse.up();

  // O timeout da CONEXÃO: é o "tempo de resposta" da Lei de Little.
  await page.locator(".react-flow__edge").first().click();
  await page.locator("aside").getByLabel(/Timeout/).first().fill("1000");

  // O pool do serviço — o outro lado da conta, e o único número que continua
  // sendo do COMPONENTE (quantas simultâneas ele aguenta).
  await svc.click();
  await page.getByLabel("Chamadas simultâneas que aguenta").fill("10");

  // Sem volume declarado, a conta não se faz — e não se inventa (§248).
  //
  // A saturação aparece na BANCADA (`contradicoes-hoje`), e não no placar da
  // mesa: `avaliarResiliencia` só é chamada lá. Afirmar sobre o placar aqui
  // mediria outra coisa.
  await abrirBancada(page);
  await expect(page.getByTestId("contradicoes-hoje")).toHaveCount(0);
  await page.goto("/#/");

  // ── O número entra UMA vez, na demanda ──
  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto da demanda" }).click();
  await janela.getByTestId("volumetria-quantidade").fill("100");
  await janela.getByTestId("volumetria-por").selectOption("segundo");
  // A prévia mostra o req/s da conta enquanto se digita.
  await expect(janela.getByTestId("volumetria-derivada")).toContainText("100 req/s");
  await janela.getByRole("button", { name: "Salvar" }).click();
  await page.getByTestId("assistente-flutuante").click();

  // ── E a conta fecha, sem ninguém ter digitado taxa em componente nenhum ──
  //
  // §307 — no placar da MESA, e não só na bancada: quem está desenhando é quem
  // precisa ver a contradição que o desenho de HOJE já tem.
  const chip = page.getByTestId("conformidade-resumo");
  await expect(chip).toBeVisible();
  await chip.click();
  const lista = page.getByTestId("conformidade-lista");
  await expect(lista).toContainText("chamadas simultâneas");
  // A frase diz DE ONDE veio a taxa: apresentar o derivado como declarado seria
  // a ferramenta se atribuindo uma medição que ninguém fez.
  await expect(lista).toContainText("vindo do volume da demanda");
  await expect(lista).toContainText("Lei de Little");

  // ── §307 — a válvula do §242, igual à de toda outra cobrança ──
  await lista.getByRole("button", { name: /Aceitar de propósito/ }).click();
  await lista.getByLabel(/Motivo para aceitar/).fill("o pico dura 2h por mês e o negócio aceita a fila");
  await lista.getByRole("button", { name: /Confirmar exceção/ }).click();

  // Sai do vermelho sem sair do histórico: o chip some porque nada mais cobra.
  await expect(page.getByTestId("conformidade-resumo")).toHaveCount(0);
});

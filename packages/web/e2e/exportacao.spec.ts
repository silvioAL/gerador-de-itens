import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * **Serial, e isto não é preferência de estilo.**
 *
 * `config/exportador` é uma configuração GLOBAL, e o `PUT` substitui o
 * documento inteiro — não mescla. Dois testes deste arquivo rodando em paralelo
 * escreveriam por cima um do outro, e o sintoma só apareceria na CI, onde os
 * workers se cruzam de outro jeito. O `fullyParallel: true` do
 * `playwright.config.ts` vale para o arquivo também, então declarar `serial`
 * aqui é o que impede a colisão.
 */
test.describe.configure({ mode: "serial" });

/**
 * SPEC-49 — a exportação pelo caminho real: derivar com nome (a quebra é
 * salva), confirmar o que a esteira escreveu até um item ficar PRONTO, gerar
 * os itens e mandar pro destino configurado.
 *
 * O "agente" aqui é o `/health` do próprio servidor, que só aceita GET: o
 * POST volta 404 e o motivo REAL do destino atravessa até a tela, por item.
 * É o que o teste prova — o caminho inteiro do produto (quem pode sair, quem
 * fica, e o porquê visível), sem depender do tracker de ninguém.
 */
test("configurar destino, exportar os prontos e mostrar o motivo — item com pendência fica de fora", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await page.route(
    (url) => url.pathname === "/pdca/uso",
    (rota) => rota.fulfill({ json: { contagem: 1, momento: false, ultimosItens: [] } })
  );
  await page.route(
    (url) => url.pathname === "/ia/sugerir",
    (rota) => rota.fulfill({ contentType: "text/plain", body: "Texto sugerido pela IA de teste" })
  );
  await entrar(page);

  const configOriginal = (await (await page.request.get(`${API}/config/exportador`)).json()).documento;
  try {
    await page.request.put(`${API}/config/exportador`, {
      data: { documento: { endpoint: `${API}/health`, rotulo: "Agente de teste", cabecalhos: {} } },
    });

    // Cenário + derivar COM nome: a quebra é salva, e só quebra salva exporta.
    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await derivarNaMesa(page);
    await page.getByLabel("ex.: Fatura mensal em lote").fill(`exportação e2e ${Date.now()}`);
    await page.getByTestId("assistente-balao-confirmar").click();

    // Deixa um item PRONTO: responde os campos do primeiro item e confirma.
    await page.locator('[data-testid^="item-"]').first().click();
    // Campos DIFERENTES: `first()` três vezes re-sugeriria o mesmo (o campo
    // sugerido continua com o botão até ser confirmado).
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "✨ Sugerir" }).nth(i).click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId("confirmar-todas").click();
    await expect(page.getByTestId("barra-pendencias")).not.toContainText("aguardando");

    // Gerar os itens (eles persistem, porque a quebra tem id).
    for (const id of ["balao-sem-ia", "balao-sem-contexto"]) {
      if (await page.getByTestId(id).isVisible().catch(() => false)) {
        await page.getByTestId(id).getByRole("button", { name: "Dispensar sugestão" }).click();
        await page.waitForTimeout(500);
      }
    }
    const botaoItens = page.getByTestId("balao-gerar-itens").or(page.getByTestId("balao-especificacao-itens")).first();
    await botaoItens.waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await botaoItens.click();
    // SPEC-61 — a exportação veio junto com os cards para a seção do documento.
    // Ela não morreu com a tela que a hospedava: exportar é o que se faz com o
    // resultado pronto, e o documento é onde ele se lê.
    await expect(page.getByTestId("secao-dos-itens")).toBeVisible();

    // A seção diz o destino e conta só os prontos.
    await expect(page.getByText(/destino: Agente de teste/)).toBeVisible();
    await expect(page.getByTestId("exportar-prontos")).toBeEnabled();

    await page.getByTestId("exportar-prontos").click();
    const resultado = page.getByTestId("resultado-exportacao");
    await expect(resultado).toBeVisible({ timeout: 20000 });
    // O "agente" recusa POST (o /health só faz GET): o motivo REAL do destino
    // chega até a tela, por item, em vez de um erro genérico — e os itens com
    // pendência nem foram tentados.
    await expect(resultado).toContainText("HTTP 404");
    await expect(resultado).toContainText("ficaram de fora por ainda ter pendência");
  } finally {
    await page.request.put(`${API}/config/exportador`, { data: { documento: configOriginal } });
  }
});

/**
 * SPEC-115 fatias D, E e G — **a experiência pronta antes do endpoint existir,
 * e o envio que sobrevive ao F5.**
 *
 * > *"eu não tenho o endpoint de subidas dos itens acessível ainda aqui, mas
 * > precisamos de tela e experiências prontos, usar algum mock com delay de 20
 * > segundos."*
 *
 * ## Por que este teste existe, e o que só ele prova
 *
 * As suítes de unidade provam cada peça: a normalização aceita o destino sem
 * endereço, o caso de uso marca "indo" antes de chamar, a tela deriva a etapa
 * do item. **Nenhuma delas prova a costura** — que o clique atravessa rota,
 * banco e volta como pipeline na tela, e que um F5 no meio reencontra o envio
 * em vez de recomeçar. Sem este teste, a fatia E poderia estar verde e não
 * funcionar, que é exatamente o histórico que esta casa já pagou três vezes.
 *
 * ## Por que ele NÃO espera os 20 segundos
 *
 * O que se prova aqui é o estado PERSISTIDO durante a espera, não o desfecho
 * dela — e é justamente durante a espera que o F5 acontece. Esperar o dublê
 * terminar provaria o que a suíte do adaptador já prova, e custaria minutos.
 */
test("modo de demonstração: o envio da spec aparece na tela e SOBREVIVE ao F5", async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await page.route(
    (url) => url.pathname === "/pdca/uso",
    (rota) => rota.fulfill({ json: { contagem: 1, momento: false, ultimosItens: [] } })
  );
  await page.route(
    (url) => url.pathname === "/ia/sugerir",
    (rota) => rota.fulfill({ contentType: "text/plain", body: "Texto sugerido pela IA de teste" })
  );
  await entrar(page);

  const configOriginal = (await (await page.request.get(`${API}/config/exportador`)).json()).documento;
  const titulo = `demonstração e2e ${Date.now()}`;
  try {
    /**
     * `endpoint` de topo VAZIO é o que ativa a demonstração de itens: a regra
     * da rota é aditiva de propósito — o dublê só entra quando não há endereço
     * real, para nunca desligar em silêncio uma exportação que funcionava.
     */
    await page.request.put(`${API}/config/exportador`, {
      data: {
        documento: {
          endpoint: "",
          rotulo: "",
          cabecalhos: {},
          destinos: [
            { id: "demo-itens", operacao: "itens", endpoint: "", rotulo: "Tracker de demonstração", demonstracao: true },
            { id: "demo-spec", operacao: "specDoItem", endpoint: "", rotulo: "Agente de demonstração", demonstracao: true },
          ],
        },
      },
    });

    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await derivarNaMesa(page);
    await page.getByLabel("ex.: Fatura mensal em lote").fill(titulo);
    await page.getByTestId("assistente-balao-confirmar").click();

    // Um item PRONTO é o mínimo para haver o que exportar — e sem exportar não
    // há `linkExterno`, logo não há pipeline de spec nenhum para mostrar.
    await page.locator('[data-testid^="item-"]').first().click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "✨ Sugerir" }).nth(i).click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId("confirmar-todas").click();
    await expect(page.getByTestId("barra-pendencias")).not.toContainText("aguardando");

    // SPEC-115 fatia H — o aviso mora AQUI, antes da porta, e a porta continua
    // aberta. Os outros itens ainda pedem atenção, e a revisão diz isso em vez
    // de deixar a pessoa descobrir num botão morto lá na frente.
    await expect(page.getByTestId("aviso-antes-do-documento")).toContainText("pedem atenção");
    await expect(page.getByTestId("ir-ao-documento")).toBeEnabled();

    for (const id of ["balao-sem-ia", "balao-sem-contexto"]) {
      if (await page.getByTestId(id).isVisible().catch(() => false)) {
        await page.getByTestId(id).getByRole("button", { name: "Dispensar sugestão" }).click();
        await page.waitForTimeout(500);
      }
    }
    const botaoItens = page.getByTestId("balao-gerar-itens").or(page.getByTestId("balao-especificacao-itens")).first();
    await botaoItens.waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await botaoItens.click();
    await expect(page.getByTestId("secao-dos-itens")).toBeVisible();

    // A exportação pelo dublê: ~20s por item pronto, e volta com o link
    // `demonstracao.invalid` — o endereço que nunca resolve, de propósito.
    await page.getByTestId("exportar-prontos").click();
    await expect(page.getByTestId("resultado-exportacao")).toBeVisible({ timeout: 60000 });

    // Agora há item no tracker sem spec: é o estado que a SPEC-98 §3.2 nomeou
    // ("história subiu, spec não"), e o botão da segunda chamada aparece.
    await expect(page.getByTestId("anexar-spec")).toBeVisible();

    /**
     * **ACHADO REAL, e foi este teste que o encontrou.**
     *
     * Na primeira escrita o teste clicava em "Anexar spec" aqui e o pipeline
     * ficava em "1 esperando" para sempre. Motivo: `gerarSpec` marca `origem`,
     * `recusas` e `fatias` vazias como lacuna, a SPEC-98 §6 recusa enviar spec
     * com lacuna, e **a tela que editava essas três seções não existia mais**.
     * O botão da SPEC-114 estava verde em teste de unidade e morto no produto:
     * clicava, respondia 200 e não anexava nada, sem lugar nenhum onde
     * resolver.
     *
     * É exatamente o que a SPEC-115 §1.2 pede que exista — a experiência
     * pronta — e é o tipo de costura que só o navegador prova.
     *
     * **§410 — e o conserto mudou de forma depois deste teste passar.** A
     * primeira versão punha três caixas em branco aqui; a correção do usuário
     * foi que a caixa é a superfície da conversa com o agente, e a spec deriva
     * do que se decide nela. Escrever à mão continua valendo — é o caminho de
     * quem já sabe a resposta — e é ele que este teste exercita, porque não
     * depende de modelo nenhum estar de pé.
     */
    await expect(page.getByTestId("spec-sem-julgamento")).toContainText("spec com lacuna não sobe");
    for (const [testid, rotulo, texto] of [
      ["spec-origem", "Quem pediu, e com que palavras", "O time de catálogo pediu na reunião de refinamento."],
      ["spec-recusas", "O que NÃO entra, e por quê", "Migração do legado fica de fora: não há janela."],
      ["spec-fatias", "O que fica verdade em cada fatia, e como se prova", "Fatia 1: o item sobe. Prova: E2E."],
    ] as const) {
      await page.getByTestId(testid).getByRole("button").click();
      await page.getByLabel(rotulo).fill(texto);
      await page.getByLabel(rotulo).blur();
    }
    await expect(page.getByTestId("spec-com-julgamento")).toBeVisible();

    await page.getByTestId("anexar-spec").click();

    // A resposta é IMEDIATA (202), mesmo com o dublê esperando 20s: é a divisão
    // entre planejar e concluir que faz isso.
    const inicio = page.getByTestId("inicio-do-envio");
    await expect(inicio).toBeVisible({ timeout: 15000 });
    await expect(inicio).toContainText("modo de demonstração — nada sai daqui");
    await expect(page.getByTestId("pipeline-contagem")).toContainText("1 anexando");

    /**
     * **O F5, e é aqui que a fatia E se prova.**
     *
     * Nada do que aparece depois daqui veio de um clique desta sessão: a aba é
     * outra, o `useState` morreu junto com a anterior. O que a tela mostra é o
     * que o banco sabia.
     */
    await page.reload();
    await page.getByRole("button", { name: "← Voltar à mesa de projeto" }).click();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Abrir…" }).click();
    await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
    await page.getByRole("button", { name: new RegExp(titulo) }).click();
    await expect(page.getByTestId("titulo-da-quebra")).toContainText(titulo);
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByTestId("menu-documento").click();

    await expect(page.getByTestId("pipeline-contagem")).toContainText("1 anexando", { timeout: 15000 });
    // E o botão não convida a mandar de novo o que já está indo — pedir duas
    // vezes escreveria a mesma spec duas vezes no mesmo issue.
    await expect(page.getByTestId("anexar-spec")).toBeDisabled();
  } finally {
    await page.request.put(`${API}/config/exportador`, { data: { documento: configOriginal } });
  }
});

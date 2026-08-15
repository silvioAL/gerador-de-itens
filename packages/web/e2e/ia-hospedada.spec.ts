import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";
import {
  BASE_URL_GATEWAY_FALSO,
  CHAVE_GATEWAY_FALSO,
  MARCA_GATEWAY_FALSO,
  MODELO_GATEWAY_FALSO,
  MARCA_VIU_IMAGEM,
  TEXTO_TRANSCRITO_FALSO,
} from "./gatewayFalso";

/**
 * SPEC-31 Fase 4 — o modo hospedado exercitado NO NAVEGADOR.
 *
 * A pergunta que este arquivo responde é a da retrospectiva: *por que a suíte
 * estava verde e quatro defeitos chegaram ao usuário mesmo assim?* Porque a
 * suíte do server usa `app.inject()`, que chama o handler direto — sem CORS,
 * sem navegador, sem tela. Os quatro defeitos moravam justamente nesse vão.
 *
 * Aqui não há mock nenhum: o Chromium fala com o Fastify de verdade, que fala
 * HTTP de verdade com o gateway falso (`gatewayFalso.ts`), que responde SSE de
 * verdade. A única mentira é o conteúdo da resposta, que precisa ser fixo pro
 * teste poder afirmar algo.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

/** A aba "Modelo de IA" dentro da tela de Configurações. */
async function abrirModeloIa(page: Page) {
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Modelo de IA" }).click();
}

test("aba Modelo de IA no hospedado mostra o formulário do gateway, não um comando que não existe", async ({
  page,
}) => {
  await entrar(page);
  await abrirModeloIa(page);

  // ACHADO REAL (print do usuário): a tela mostrava SÓ "o modelo de embedding
  // não está instalado — rode `gerador ia instalar`", sem formulário nenhum.
  // O comando não existe em container e, por decisão da Fase 4, nunca vai
  // existir. O erro não era da tela: era `/ia/status` devolvendo
  // `modelosChat: []` e `embeddingInstalado: false` — valores honestos sobre
  // "não tenho modelo local", lidos com a semântica do outro modo.
  await expect(page.getByText(/gerador ia instalar/)).toHaveCount(0);

  const card = page.getByTestId("modelo-ia-gateway");
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Base URL do gateway")).toBeVisible();
  await expect(card.getByLabel("Chave de API")).toBeVisible();
  await expect(card.getByLabel("Nome do modelo")).toBeVisible();
});

test("configurar o gateway pela tela: testar antes de salvar, salvar, e a base URL sobreviver ao reload", async ({
  page,
}) => {
  await entrar(page);
  await abrirModeloIa(page);

  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);

  // ACHADO REAL: "Testar conexão" é o botão que se usa ANTES de salvar — é o
  // ponto dele. A primeira versão da rota só olhava a credencial gravada, então
  // o primeiro teste da vida sempre respondia "nenhuma credencial configurada"
  // enquanto a pessoa olhava pros três campos preenchidos.
  await card.getByRole("button", { name: "Testar conexão" }).click();
  const resultado = page.getByTestId("gateway-resultado");
  await expect(resultado).toContainText(MARCA_GATEWAY_FALSO, { timeout: 15000 });

  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(resultado).toContainText("Credencial salva");

  // A chave NUNCA volta do servidor: o campo fica vazio e o placeholder mostra
  // só a máscara. Se um dia a chave inteira voltar, esta asserção é a que grita.
  await page.reload();
  // Aqui havia um clique pra reescolher o time: o `timeAtivo` morava em
  // memória e recarregar caía de volta em "Qual time?" (#280). O passo foi
  // removido porque a tela não volta mais — o time é lembrado (ver
  // `timeLembrado.ts` e `time-lembrado.spec.ts`).
  //
  // Vale registrar o que isso mostrou: **este teste tinha o defeito embutido
  // como comportamento esperado**. Enquanto o passo existiu, a suíte inteira
  // ficava verde com o atrito de pé, e corrigir o produto foi o que a deixou
  // vermelha. Contornar um defeito conhecido dentro do teste transforma a
  // suíte em cúmplice dele.
  await abrirModeloIa(page);
  const cardRecarregado = page.getByTestId("modelo-ia-gateway");
  await expect(cardRecarregado.getByLabel("Base URL do gateway")).toHaveValue(BASE_URL_GATEWAY_FALSO);
  const chave = cardRecarregado.getByLabel("Chave de API");
  await expect(chave).toHaveValue("");
  await expect(chave).toHaveAttribute("placeholder", /chave atual: /);
  await expect(chave).not.toHaveAttribute("placeholder", new RegExp(CHAVE_GATEWAY_FALSO));
});

test("a esteira roda no navegador e o texto do gateway chega nos campos (o defeito de CORS)", async ({ page }) => {
  await entrar(page);

  // Erros de console viram falha: o defeito de CORS se manifestava como um
  // `fetch` rejeitado que a tela engolia — todos os campos vazios, nenhuma
  // mensagem. Sem esta captura, um teste que só olha a tela poderia dar o
  // mesmo veredito silencioso.
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });

  await abrirModeloIa(page);
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  // Um nó completo o bastante pra derivar — mesmo caminho de
  // `derivar-e-revisar.spec.ts`.
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
  await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  // O título não se digita mais (campo removido — só via agente): derivar
  // pergunta o nome e o "Derivar e salvar" segue com auto-save.
  await page.locator('[data-tour="derivar-button"]').click();
  await page.getByLabel("ex.: Fatura mensal em lote").fill("Esteira com gateway falso");
  await page.getByTestId("assistente-balao-confirmar").click();
  await expect(page.getByTestId("contagem-itens")).toHaveText("1 itens");

  // A esteira começa sozinha quando `/ia/status` diz que dá pra usar IA — com a
  // credencial salva, diz. Este é o ponto exato do defeito: com o `curl` o JSON
  // chegava inteiro, e no navegador o `fetch` era rejeitado por falta dos
  // cabeçalhos de CORS (o `reply.raw.writeHead` pulava os hooks do Fastify).
  // O resultado era o relato do usuário: "todos os campos vazios".
  await expect(page.getByText(new RegExp(MARCA_GATEWAY_FALSO)).first()).toBeVisible({ timeout: 60000 });

  // SPEC-37 M1 — a esteira que o usuário disparou TERMINOU: o chat do
  // refinamento abre sozinho, com a fala do momento. É a única conduta que
  // abre sem clique (régua da §2 da SPEC), e é exatamente o pedido original.
  await expect(page.getByTestId("conversa-especificacao")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("conversa-especificacao")).toContainText(/Pronto — o item foi gerado/);

  // SPEC-37 M7 — "refinado" exige confirmação HUMANA de cada campo sugerido
  // (statusDoItem): o teste fecha o chat da condução e confirma um a um, como
  // a pessoa faria. Só então o balão de fechamento do ciclo aparece, e o chip
  // baixa a especificação de verdade — o MESMO handler do botão do header.
  await page.getByTestId("abrir-conversa-especificacao").click();
  const confirmar = page.getByRole("button", { name: "Confirmar", exact: true });
  while ((await confirmar.count()) > 0) {
    await confirmar.first().click();
  }
  await expect(page.getByTestId("balao-especificacao")).toContainText("Tudo refinado");
  const download = page.waitForEvent("download");
  await page.getByTestId("balao-especificacao-acao").click();
  expect((await download).suggestedFilename()).toBe("especificacao-de-solucao.md");

  await page.screenshot({ path: "e2e/screenshots/ia-hospedada.png", fullPage: true });

  expect(erros, `Erros no console do browser:\n${erros.join("\n")}`).toEqual([]);
});

test("credencial errada é reportada como resultado do teste, não como erro genérico de rede", async ({ page }) => {
  await entrar(page);
  await abrirModeloIa(page);

  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill("chave-errada");
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByRole("button", { name: "Testar conexão" }).click();

  // O gateway falso devolve 401 pra chave errada, e o provedor traduz isso
  // numa frase que diz o que fazer. "Failed to fetch" seria a mesma informação
  // que nenhuma informação.
  await expect(page.getByTestId("gateway-resultado")).toContainText(/Credencial recusada/i, { timeout: 15000 });
});

/**
 * SPEC-30 Fase 1a — o botão de falar, pelo navegador.
 *
 * O que só um teste de navegador prova aqui: que a capacidade lida de
 * `/ia/status` chega na tela, que o `MediaRecorder` produz um Blob que
 * sobrevive ao POST binário, e que o texto volta pro campo **editável** em vez
 * de virar mensagem enviada. Um teste de unidade com `apiIa` mockado provaria
 * só que o componente chama o que ele mesmo espera.
 *
 * O microfone é falso — `--use-fake-device-for-media-stream` faz o Chromium
 * gerar um tom e conceder a permissão sem diálogo. O áudio é sintético, mas o
 * caminho (getUserMedia → MediaRecorder → fetch → Fastify → gateway) é real.
 */
test.describe("voz na conversa", () => {
  // As flags do microfone falso vivem no `playwright.config.ts` —
  // `launchOptions` num describe força um worker novo e o Playwright recusa.
  test.use({ permissions: ["microphone"] });

  test("falar preenche o campo com o texto transcrito, editável e sem enviar sozinho", async ({ page }) => {
    await entrar(page);

    // O caso "sem provedor que transcreve, sem botão" fica em
    // `JanelaConversa.voz.test.tsx`, não aqui: os testes deste arquivo rodam em
    // ordem e os anteriores já salvaram credencial (o `globalSetup` trunca uma
    // vez, no início da suíte). Afirmar ausência aqui seria afirmar sobre um
    // estado que este arquivo não controla.
    await abrirModeloIa(page);
    const card = page.getByTestId("modelo-ia-gateway");
    await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
    await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
    await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
    // Visão marcada AQUI TAMBÉM, embora voz não precise dela: com
    // `fullyParallel`, os testes deste arquivo podem rodar em workers
    // diferentes, e a credencial é UMA por organização — regravá-la sem visão
    // no meio do teste de anexar derruba o botão de anexar lá (flake real,
    // três ocorrências). Todos os saves gravam a mesma credencial.
    await card.getByLabel("Este modelo enxerga imagem").check();
    await card.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
    await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

    // #298 — a conversa mora no assistente flutuante; abrir cai direto nela.
    await page.getByTestId("assistente-flutuante").click();
    const falar = page.getByTestId("voz-falar");
    await expect(falar).toBeVisible();

    await falar.click();
    // 15s, não os 5s default: o getUserMedia do microfone FALSO também paga
    // latência sob 6 workers — terceira aparição intermitente desta asserção,
    // sempre passando isolada (JOURNEY §173).
    await expect(page.getByTestId("voz-gravando")).toBeVisible({ timeout: 15000 });
    // Um instante de gravação de verdade: sem isso o MediaRecorder pode fechar
    // sem nenhum chunk, e o teste passaria por não ter gravado nada.
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Parar e transcrever" }).click();

    const campo = page.getByLabel("Descreva a demanda");
    await expect(campo).toHaveValue(new RegExp(TEXTO_TRANSCRITO_FALSO), { timeout: 20000 });

    // O texto ficou EDITÁVEL no campo — não virou mensagem enviada. É a regra
    // que impede erro de transcrição de virar nó errado no diagrama.
    await expect(page.getByTestId("conversa-pensando")).toHaveCount(0);
    await campo.fill(`${await campo.inputValue()} (corrigido à mão)`);
    await expect(campo).toHaveValue(/corrigido à mão/);
  });
});

/**
 * SPEC-30 Fase 2 — anexar um print, pelo navegador.
 *
 * O que só o navegador prova: que o `FileReader` produz um data URL que
 * sobrevive ao POST, que o servidor repassa ao provedor, e que o provedor monta
 * `content` como parts — o gateway falso responde com `MARCA_VIU_IMAGEM` só
 * quando a imagem chegou de verdade.
 */
test("anexar um print manda a imagem até o gateway", async ({ page }) => {
  await entrar(page);

  await abrirModeloIa(page);
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  // Gateway interno não está em lista nenhuma — é exatamente por isso que a
  // marcação manual existe (SPEC-30 §4.2).
  await card.getByLabel("Este modelo enxerga imagem").check();
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  // #298 — a conversa mora no assistente flutuante; abrir cai direto nela.
  await page.getByTestId("assistente-flutuante").click();
  const anexar = page.getByTestId("anexar-imagem");
  await expect(anexar).toBeVisible();

  // 1x1 PNG — o menor arquivo válido possível; o teste é sobre o caminho, não
  // sobre o conteúdo da imagem.
  await page.getByLabel("Escolher imagem").setInputFiles({
    name: "diagrama.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });

  await expect(page.getByTestId("imagem-anexada-0")).toBeVisible();
  // O aviso de saída de dados aparece com a imagem, e diz para onde ela vai.
  await expect(page.getByTestId("aviso-saida-de-dados")).toContainText("127.0.0.1");

  // Enviar SEM texto: o print já é a descrição.
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText(new RegExp(MARCA_VIU_IMAGEM)).first()).toBeVisible({ timeout: 30000 });
});

/**
 * SPEC-34 Fase 1 — configurar conversando (#297), no navegador.
 *
 * Mora NESTE arquivo, e não num spec próprio, porque é este arquivo que possui
 * o estado "credencial de gateway existe" (ver o comentário do describe de
 * voz). A primeira versão era um `assistente-configurar.spec.ts` avulso — em
 * ordem alfabética ele salvava a credencial da organização no primeiro lote de
 * workers, e `derivar-e-revisar` (que afirma a revisão SEM IA) via a esteira
 * entrar em geração ao vivo no meio da corrida. O invariante implícito da
 * suíte é: credencial nasce quando este arquivo roda.
 *
 * O que só o navegador prova: os DOIS passos de IA atravessando servidor e
 * gateway de verdade (conversa → alvo+instrução; instrução → objeto), e o
 * Aplicar caindo na MESMA rota de escrita do formulário — o campo criado pela
 * conversa aparece na aba "Padrões por componente", a prova de que não existe
 * caminho paralelo de escrita.
 */
test("configurar conversando: a conversa vira proposta, aplicar cria o campo, e ele aparece em Configurações", async ({
  page,
}) => {
  // time-checkout, e não o default: o campo aplicado nasce `required: true`
  // (o gateway falso preenche boolean como true), e campo obrigatório deixa
  // TODO nó desse tipo vermelho — em time-pagamentos isso derrubou os seis
  // specs de cenário/derivação da suíte, o achado da §151 de novo (a seed foi
  // para time-portabilidade pelo mesmo motivo). time-checkout não é usado por
  // nenhum outro spec.
  await entrar(page, "time-checkout");

  // Idempotente com os testes anteriores do arquivo — e mantém este teste
  // rodável sozinho via --grep. Visão marcada pelo mesmo motivo do teste de
  // voz: a credencial é uma por organização e os testes deste arquivo correm
  // em paralelo — todos os saves gravam a mesma credencial.
  await abrirModeloIa(page);
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByLabel("Este modelo enxerga imagem").check();
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  // A conversa mora na terceira aba do assistente flutuante (#298).
  await page.getByTestId("assistente-flutuante").click();
  await page.getByRole("button", { name: "⚙ Configurar" }).click();
  await expect(page.getByTestId("configurar-conversa")).toBeVisible();

  await page.getByLabel("Descreva o que configurar").fill("todo serviço novo precisa declarar o runbook de plantão");
  await page.getByRole("button", { name: "Enviar" }).click();

  // O cartão materializado carrega a marca do gateway — os dois passos de IA
  // aconteceram de verdade (rede, streaming, parse), não um mock de fetch.
  const cartao = page.getByTestId(/proposta-config-/).first();
  await expect(cartao).toBeVisible({ timeout: 30000 });
  await expect(cartao).toContainText(MARCA_GATEWAY_FALSO, { timeout: 30000 });

  // Nada foi escrito ainda: aplicar é o clique, não a resposta do modelo.
  await cartao.getByRole("button", { name: "Aplicar" }).click();
  await expect(cartao.getByTestId("proposta-aplicada")).toBeVisible({ timeout: 15000 });

  // A prova de que a escrita passou pela rota de sempre: a aba de Configurações
  // que o formulário alimenta lista o campo criado pela conversa.
  await page.getByTestId("assistente-flutuante").click();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /Padrões por componente/ }).click();
  await expect(page.getByText(new RegExp(`${MARCA_GATEWAY_FALSO}.*\\(label\\)`)).first()).toBeVisible();
});

/**
 * SPEC-57 fatia D — mora AQUI, e não no `proposito-da-demanda.spec`, por um
 * motivo que este arquivo já documenta: a credencial do gateway é UMA por
 * organização, e specs em workers diferentes a reescrevem. O teste passava
 * isolado e falhava na corrida completa — terceira aparição desta mesma
 * fragilidade (ver o comentário do teste de voz). Testes que dependem da
 * credencial vivem juntos.
 */
/**
 * SPEC-57 fatia D — o agente propõe o propósito, e o engine mede a proposta
 * ANTES de a pessoa aceitar.
 *
 * Contra o gateway falso: o Chromium fala com o Fastify de verdade, que fala
 * HTTP de verdade com o dublê. A única mentira é o conteúdo da resposta — que
 * é justamente o que precisa ser fixo pro teste afirmar algo.
 */
test("o agente propõe o propósito, e o delta mostra o trabalho que aceitar cria", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  // Credencial do gateway falso — mesma da suíte de IA hospedada.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Modelo de IA" }).click();
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByLabel("Este modelo enxerga imagem").check();
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();

  // Sem contexto nenhum o pedido é recusado no servidor — e a recusa aparece
  // ali, não num alerta solto. Escrever o contexto é o que destrava.
  await janela.getByLabel("Contexto do épico (texto)").fill("Cobrança recorrente com parceiro externo.");

  await janela.getByRole("button", { name: "✦ Propor a partir do contexto" }).click();

  // A proposta chega SUGERIDA: o delta existe porque nada foi aceito ainda.
  const delta = janela.getByTestId("delta-da-proposta");
  // Diagnóstico no lugar certo: se o agente falhou, o painel diz — e é isso
  // que precisa aparecer no relatório, não um "element not found" mudo.
  await expect
    .poll(async () => (await janela.innerText()).slice(0, 600), { timeout: 20000 })
    .toContain("sugerida(s)");
  await expect(delta).toBeVisible();
  await expect(delta).toContainText("sugerida(s), ainda sem efeito");

  // E o placar do topo continua sem acusar: sugestão não vira lacuna sozinha.
  await expect(page.getByTestId("proposito-resumo")).toHaveCount(0);

  // Aceitar é ato da pessoa — e só aí a medida muda.
  await delta.getByRole("button", { name: "Confirmar todas" }).click();
  await expect(janela.getByTestId("delta-da-proposta")).toHaveCount(0);
  await janela.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("proposito-resumo")).toBeVisible();
});


/**
 * SPEC-57 fatia C (M4) — o agente PROPÕE decisões lendo o desenho medido.
 *
 * As unidades provam o pedido e o painel em separado. O que só o navegador
 * prova é a costura inteira: o botão monta o pedido com a medição do motor,
 * atravessa Fastify e gateway, o SSE volta, a proposta vira `status: proposta`
 * na tela — e continua não valendo nada até alguém aceitar. Foi um vão desse
 * tamanho que o §231 pagou caro (o `.text()` no lugar do streaming).
 */
test("o agente propõe uma decisão a partir do desenho, e ela não vale nada até ser aceita", async ({ page }) => {
  test.setTimeout(90000);
  await entrar(page);

  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page.locator(".react-flow__node").first().click();

  const painel = page.locator("aside");
  const decisoes = painel.getByTestId("decisoes-do-no");
  await expect(decisoes).toContainText("Nenhuma decisão registrada");

  await decisoes.getByTestId("pedir-decisao-ao-agente").click();

  // Diagnóstico no lugar certo: se o agente falhou, o painel diz — e é isso
  // que precisa aparecer no relatório, não um "element not found" mudo.
  await expect
    .poll(async () => (await painel.innerText()).slice(0, 800), { timeout: 30000 })
    .toContain(MARCA_GATEWAY_FALSO);

  const proposta = painel.getByTestId("decisao-proposta").first();
  await expect(proposta).toBeVisible();
  await expect(proposta).toContainText("proposta");

  // A régua da fatia: proposta sem alternativa descartada seria opinião
  // vestida de decisão — o produto a descartaria antes de chegar aqui. Duas
  // riscadas e não uma porque a "escolhida" do dublê não casa com nenhum
  // título; o que importa é que as descartadas ATRAVESSARAM e são exibidas.
  expect(await proposta.locator("s").count()).toBeGreaterThan(0);

  // Regra 2 na tela: enquanto ninguém aceitou, o placar cobra em vez de contar.
  await expect(page.getByTestId("decisoes-resumo")).toContainText("a decidir");
  await expect(painel.getByTestId("decisao-vigente")).toHaveCount(0);

  // Aceitar é ato da pessoa — e só aí ela passa a valer.
  await proposta.getByRole("button", { name: "aceitar esta decisão" }).click();
  await expect(painel.getByTestId("decisao-vigente")).toHaveCount(1);
  await expect(painel.getByTestId("decisao-proposta")).toHaveCount(0);
});

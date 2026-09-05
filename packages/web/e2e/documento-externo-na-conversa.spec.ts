import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";
const GATEWAY_FALSO = "http://127.0.0.1:4123";

/**
 * §356 — **o documento externo entra na conversa, no navegador.**
 *
 * ## Por que este teste é a prova que faltava
 *
 * O §349 entregou porta, adaptador, a operação `documentoExterno` na lista
 * fechada, 99 linhas de teste do adaptador e a linha na tela de Exportação para
 * cadastrar o destino. **Nunca entregou rota nem campo.** Tudo isso ficou verde
 * o tempo todo: `criarLeitorDeDocumentoViaGateway` era chamado só pelo próprio
 * teste, e o commit ainda assim dizia *"Fecha a frente (3)"*.
 *
 * Nenhum teste de unidade poderia ter pego isso, porque cada peça estava certa
 * **sozinha**. O que estava faltando era a costura — e costura é exatamente o
 * que só o navegador prova: a tela pergunta ao servidor, o servidor lê a
 * configuração de destinos, monta o adaptador, faz um POST de verdade num
 * endereço de verdade, e o texto cai **no campo em que a pessoa digita**.
 *
 * É o mesmo formato do `adr-na-conversa.spec.ts`, e de propósito: as duas fatias
 * têm a mesma régua — **importar não é aceitar**.
 */
/**
 * `serial`, e isto é sobre ISOLAMENTO, não sobre velocidade.
 *
 * Os dois testes afirmam coisas opostas sobre o MESMO estado global — a
 * configuração de destinos do servidor. Em paralelo, o que um grava o outro
 * apaga, e o resultado alterna entre verde e vermelho por ordem de execução.
 *
 * A primeira escrita deste arquivo rodou paralela e falhou assim: numa execução
 * reprovou o positivo, na seguinte o negativo, sem nada ter mudado.
 */
test.describe.serial("o documento externo na conversa (§356)", () => {
  test("trazer um documento externo pelo link escreve na caixa, e NÃO envia sozinho", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() =>
      localStorage.setItem("gerador:jornada-vista", "1"),
    );
    await page.route(
      (url) => url.pathname === "/ia/status",
      (rota) =>
        rota.fulfill({
          json: { modelosChat: [], embeddingInstalado: false, capacidades: {} },
        }),
    );
    await entrar(page);

    // Sem destino de leitura cadastrado o campo NEM EXISTE — é a primeira coisa
    // que o teste confere, e é a régua que o §349 violou ao deixar o destino
    // cadastrável sem nada que o consumisse.
    const gravou = await page.request.put(`${API}/config/exportador`, {
      data: {
        documento: {
          endpoint: "",
          rotulo: "",
          cabecalhos: {},
          destinos: [
            {
              id: "doc-ext-e2e",
              operacao: "documentoExterno",
              endpoint: `${GATEWAY_FALSO}/documento-externo`,
              rotulo: "Wiki da casa",
              cabecalhos: {},
            },
          ],
        },
      },
    });
    expect(gravou.ok()).toBe(true);

    const titulo = `documento da casa ${Date.now()}`;
    const criada = await page.request.post(`${API}/quebras`, {
      data: {
        titulo,
        time: "time-pagamentos",
        demandInfo: "Fechar o pedido com análise de crédito.",
        diagrama: { nodes: [], edges: [] },
      },
    });
    expect(criada.status()).toBe(201);
    await page.reload();

    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Abrir…" }).click();
    await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
    await page.getByRole("button", { name: new RegExp(titulo) }).click();
    await expect(page.getByTestId("titulo-da-quebra")).toContainText(titulo);

    await page.getByTestId("assistente-flutuante").click();
    const campo = page.getByLabel("Descreva a demanda");
    await expect(campo).toBeVisible();

    // A caixa já tem o `demandInfo` da demanda aberta. O documento tem que
    // ANEXAR a isso, nunca substituir.
    await campo.pressSequentially("quero desenhar a partir da página da wiki");

    const link = page.getByLabel("Link de um documento externo");
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.fill("https://confluence.invalido/pages/12345");
    await page.getByTestId("botao-importar-documento").click();

    // O conteúdo do documento chegou ao campo, com o título junto.
    await expect(campo).toHaveValue(/Aprovação de crédito/, { timeout: 20000 });
    await expect(campo).toHaveValue(/bureau/);
    // E o que estava escrito continua lá.
    await expect(campo).toHaveValue(
      /quero desenhar a partir da página da wiki/,
    );

    /**
     * **Importar não é aceitar.**
     *
     * O texto ficou EDITÁVEL no campo, e nada foi enviado. Desenhar direto do link
     * esconderia o que foi lido: se o gateway trouxesse a página errada, ou o
     * storage format cru, o desenho sairia errado sem ninguém ter visto a causa.
     */
    await expect(page.getByTestId("conversa-pensando")).toHaveCount(0);
    await campo.fill(`${await campo.inputValue()} (corrigido à mão)`);
    await expect(campo).toHaveValue(/corrigido à mão/);
  });

  test("sem destino de leitura cadastrado, o campo do link não aparece", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.addInitScript(() =>
      localStorage.setItem("gerador:jornada-vista", "1"),
    );
    await page.route(
      (url) => url.pathname === "/ia/status",
      (rota) =>
        rota.fulfill({
          json: { modelosChat: [], embeddingInstalado: false, capacidades: {} },
        }),
    );
    await entrar(page);

    // Oferecer um campo que sempre responderia 409 ensinaria a ignorar a oferta —
    // mesma régua do botão de ADR e do microfone.
    const gravou = await page.request.put(`${API}/config/exportador`, {
      data: {
        documento: { endpoint: "", rotulo: "", cabecalhos: {}, destinos: [] },
      },
    });
    expect(gravou.ok()).toBe(true);
    await page.reload();

    await page.getByTestId("assistente-flutuante").click();
    await expect(page.getByLabel("Descreva a demanda")).toBeVisible();

    await expect(page.getByTestId("importar-documento")).toHaveCount(0);
  });
});

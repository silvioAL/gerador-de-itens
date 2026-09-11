import { test, expect } from "@playwright/test";
import { entrarEmTimeProprio } from "./auth";

const API = "http://localhost:4100";


/**
 * SPEC-110 fatia L (D1) — **o gatilho webhook: alguém de fora nos chama.**
 *
 * Decisão do usuário: *"quanto ao webhook, pode ser um acionador"*. E a
 * correção de escopo que a fatia carrega: o webhook NÃO é o conector HTTP
 * noutra roupa — conector é saída (nós chamamos alguém), webhook é entrada
 * (alguém nos chama). Direções opostas.
 *
 * ## O que só o navegador prova
 *
 * As provas de rota (`server/src/routes/webhook.test.ts`) já cobrem a porta.
 * O que só aqui se vê é a COSTURA: que a pessoa consegue declarar os campos
 * pela tela, gerar o endereço, e que esse endereço — copiado da tela, não
 * fabricado pelo teste — dispara o fluxo quando um sistema qualquer o chama.
 *
 * Time PRÓPRIO porque este spec ESCREVE o documento de fluxos do time: sem
 * isso ele apagaria o desenho de quem roda em paralelo.
 */
test.describe.configure({ mode: "serial" });

test("declarar os campos, gerar o endereço, e um POST de fora dispara o fluxo", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  const time = await entrarEmTimeProprio(page, "webhook");

  /**
   * **A FIAÇÃO nasce pela API; o WEBHOOK, pela tela.**
   *
   * O gesto de arrastar aresta já tem prova própria (`fluxo-de-integracao`), e
   * repeti-lo aqui só acrescentaria uma fonte de instabilidade a um spec cujo
   * assunto é outro. O que este teste precisa provar é o que só ele prova: os
   * campos declarados NA TELA, o endereço gerado NA TELA, e um POST de fora
   * disparando o fluxo com o dado certo.
   *
   * O destino é a função que ESCREVE feedback porque o rastro de um nó de
   * função guarda as entradas dele — é por ali que se vê que o texto do corpo
   * chegou ao lugar certo. Com um nó mudo, a prova seria "não explodiu".
   *
   * Ele nasce com UM campo; o segundo — o do caminho aninhado — é a pessoa que
   * declara, logo abaixo. É esse que a chamada de fora vai exercitar.
   *
   * **Auto-saneador, pelo mecanismo do próprio produto.** A rodada anterior
   * deixa um endereço gravado, e a asserção "ainda não existe" começaria falsa
   * na segunda rodada — a armadilha registrada na casa (a 1ª rodada envenena as
   * seguintes). Salvar o documento SEM o nó de webhook apaga o endereço, porque
   * é isso que o produto faz quando o nó sai do desenho; salvar com ele de volta
   * recomeça do zero. Sanear usando a regra que se quer provar é de graça, e
   * ainda exercita o caminho da exclusão.
   */
  await page.request.put(`${API}/config/fluxos`, {
    data: { timeId: time, documento: { fluxos: [] } },
  });

  const criado = await page.request.put(`${API}/config/fluxos`, {
    data: {
      timeId: time,
      documento: {
        fluxos: [
          {
            id: "recebe-de-fora",
            nome: "Recebe de fora",
            nos: [
              {
                id: "gatilho",
                tipo: "gatilho",
                refId: "webhook",
                posicao: { x: 60, y: 120 },
                parametros: { campos: [{ chave: "pedidoId" }] },
                /**
                 * **O GATE existe aqui para o spec não ter efeito colateral
                 * GLOBAL — e essa lição custou duas rodadas de CI.**
                 *
                 * A primeira versão deixava a execução correr até
                 * `pdca-feedback`, que GRAVA um feedback. O balão do assistente
                 * ("Tem 1 feedback do time esperando") passou a aparecer em
                 * OUTROS specs e a interceptar os cliques deles: um teste de
                 * stacks, sem relação nenhuma com webhook, morreu por 57
                 * tentativas de clique até estourar o teto de 30s.
                 *
                 * Com o gate, a execução suspende logo DEPOIS do gatilho: as
                 * saídas ficam persistidas (é onde se prova a extração) e o nó
                 * que escreve nunca roda. O que o gate custa em realismo, as
                 * provas de rota cobrem — lá o dado atravessa a aresta inteira,
                 * num banco isolado onde escrever não incomoda ninguém.
                 */
                confirmacao: "aguardar",
              },
              { id: "registra", tipo: "funcao", refId: "pdca-feedback", posicao: { x: 420, y: 120 }, parametros: {} },
            ],
            arestas: [{ de: "gatilho", para: "registra", mapeamento: [{ saida: "texto", entrada: "texto" }] }],
          },
        ],
      },
    },
  });
  expect(criado.status()).toBe(200);

  await page.goto("/#/fluxo/recebe-de-fora");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await page.locator('.react-flow__node[data-id="gatilho"]').click();
  await expect(page.getByTestId("painel-do-webhook")).toBeVisible();

  // O campo que já existe aparece; o segundo é declarado AQUI, com o caminho
  // aninhado — que é a diferença entre extrair e adivinhar.
  await expect(page.getByTestId("webhook-chave-0")).toHaveValue("pedidoId");
  await page.getByTestId("webhook-adicionar-campo").click();
  await page.getByTestId("webhook-chave-1").fill("texto");
  await page.getByTestId("webhook-caminho-1").fill("$.dados.mensagem");

  await page.getByTestId("salvar-fluxos").click();
  await expect(page.getByTestId("erro-do-fluxo")).toHaveCount(0);

  // O endereço: gerado pela tela, mostrado UMA vez.
  await page.locator('.react-flow__node[data-id="gatilho"]').click();
  await expect(page.getByTestId("webhook-estado-do-endereco")).toContainText("ainda não existe");
  await page.getByTestId("webhook-gerar-token").click();
  await expect(page.getByTestId("webhook-token")).toBeVisible();
  const endereco = (await page.getByTestId("webhook-token").locator("code").innerText()).trim();
  const token = endereco.split("/").pop()!;
  expect(token.length).toBeGreaterThan(20);

  /**
   * **O disparo de FORA.** `page.request` não carrega os cookies da sessão da
   * página — é exatamente o que se quer aqui: quem chama um webhook é uma
   * máquina sem sessão, e provar isso com a sessão junto não provaria nada.
   */
  const chamada = await page.request.post(`${API}/fluxos/gatilhos/webhook/${token}`, {
    data: { pedidoId: "P-77", dados: { mensagem: "o relatorio veio truncado" }, ruido: "ignore-me" },
  });
  expect(chamada.status()).toBe(202);
  const corpo = (await chamada.json()) as { execucaoId: string; estado: string };
  // O gate suspende logo depois do gatilho — é o que mantém este spec sem
  // efeito colateral, e de quebra prova que webhook e gate convivem.
  expect(corpo.estado).toBe("aguardando-confirmacao");

  /**
   * A execução está no histórico do fluxo, e é ali que se vê a EXTRAÇÃO: as
   * saídas do gatilho trazem os dois campos declarados — um pelo nome
   * (`pedidoId`) e outro pelo caminho aninhado (`$.dados.mensagem`) — e não
   * trazem o `ruido`, que o corpo mandou e ninguém pediu.
   */
  const historico = await page.request.get(`${API}/fluxos/recebe-de-fora/execucoes?timeId=${time}`);
  const { execucoes } = (await historico.json()) as {
    execucoes: {
      id: string;
      estado: string;
      saidas: Record<string, Record<string, unknown>> | null;
      nos: { noId: string; origem?: string }[];
    }[];
  };
  const minha = execucoes.find((e) => e.id === corpo.execucaoId)!;
  expect(minha).toBeDefined();
  expect(minha.nos.find((n) => n.noId === "gatilho")?.origem).toBe("webhook");
  expect(minha.saidas?.gatilho).toEqual({ pedidoId: "P-77", texto: "o relatorio veio truncado" });
  expect(JSON.stringify(minha.saidas)).not.toContain("ignore-me");
  // E o nó que ESCREVE não rodou: o gate parou antes dele.
  expect(minha.nos.find((n) => n.noId === "registra")).toBeUndefined();

  // Token errado: 4xx nomeado, sem contar nada sobre o que existe do lado de cá.
  const errado = await page.request.post(`${API}/fluxos/gatilhos/webhook/${token}-torto`, { data: {} });
  expect(errado.status()).toBe(404);
  expect(JSON.stringify(await errado.json())).toContain("não conheço este endereço");
});

test("o endereço sobrevive ao F5, e regenerar invalida o anterior", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrarEmTimeProprio(page, "webhook");
  await page.goto("/#/fluxo/recebe-de-fora");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await page.locator('.react-flow__node[data-id="gatilho"]').click();

  /**
   * D18 — o que se configura tem de sobreviver. Depois do F5 a tela não mostra
   * o TOKEN (ela nunca mais o vê: o servidor guarda só o hash), mas mostra que
   * o endereço EXISTE e quando ele disparou — que é a pergunta de quem volta.
   */
  await expect(page.getByTestId("webhook-estado-do-endereco")).toContainText("existe desde");
  await expect(page.getByTestId("webhook-estado-do-endereco")).toContainText("último disparo");
  await expect(page.getByTestId("webhook-token")).toHaveCount(0);

  // O rótulo do botão diz o que o clique FAZ — quem já entregou o endereço a
  // alguém precisa saber disso antes de clicar.
  await expect(page.getByTestId("webhook-gerar-token")).toContainText("invalida o atual");
});

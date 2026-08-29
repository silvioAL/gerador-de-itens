import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";
const GATEWAY_FALSO = "http://127.0.0.1:4123";

/**
 * SPEC-81 fatia D — **as decisões da casa entram na conversa, no navegador.**
 *
 * ## O que só o navegador prova
 *
 * As unidades provam o hook e o painel isolados. O que elas não podem provar é a
 * costura inteira, e ela atravessa quatro processos: a tela pergunta ao servidor,
 * o servidor lê a configuração de destinos, monta o adaptador de gateway, faz um
 * POST de verdade num endereço de verdade, e o texto que volta cai **no campo em
 * que a pessoa digita** — editável, não enviado.
 *
 * É a mesma prova que o E2E da voz faz para a transcrição, e pelo mesmo motivo:
 * é aqui que "texto de terceiro vira nó errado no diagrama" seria pego.
 */
test("trazer os ADRs da casa escreve na caixa, e NÃO envia sozinho", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  // A conversa consulta `/ia/status` ao montar; sem provedor configurado nesta
  // suíte, deixar a chamada real acontecer só acrescentaria espera.
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // O destino de ADR aponta para o gateway falso, que responde o contrato de
  // `criarLeitorDeAdrViaGateway`. Sem isto o botão nem existe — e essa é a
  // primeira coisa que o teste confere.
  const gravou = await page.request.put(`${API}/config/exportador`, {
    data: {
      documento: {
        endpoint: "",
        rotulo: "",
        cabecalhos: {},
        destinos: [
          { id: "adr-e2e", operacao: "adr", endpoint: `${GATEWAY_FALSO}/adr`, rotulo: "ADRs do time", cabecalhos: {} },
        ],
      },
    },
  });
  expect(gravou.ok()).toBe(true);

  // Semeada pela API (padrão do §213): o que este spec exercita é a IMPORTAÇÃO,
  // e passar pelo fluxo de nomear a demanda só acrescentaria pontos de falha.
  const titulo = `adr na conversa ${Date.now()}`;
  const criada = await page.request.post(`${API}/quebras`, {
    data: {
      titulo,
      time: "time-pagamentos",
      demandInfo: "Fechar o pedido com análise de crédito.",
      // `diagrama` não é opcional na borda: sem ele o POST volta 400, e o teste
      // falharia antes de chegar ao que ele existe para provar.
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

  // #298 — a conversa mora no assistente flutuante.
  await page.getByTestId("assistente-flutuante").click();
  const campo = page.getByLabel("Descreva a demanda");
  await expect(campo).toBeVisible();

  // A caixa já tem texto — o `demandInfo` da demanda aberta, mais o que se
  // digita agora. O ADR tem que ANEXAR a isso, nunca substituir.
  await campo.pressSequentially("o checkout precisa consultar o bureau");

  const trazer = page.getByTestId("trazer-adr");
  await expect(trazer).toBeVisible({ timeout: 15000 });
  await trazer.click();

  await expect(campo).toHaveValue(/Fila entre o checkout e o bureau/, { timeout: 20000 });
  await expect(campo).toHaveValue(/o checkout precisa consultar o bureau/);
  await expect(page.getByTestId("adr-trazidos")).toContainText("revise antes de enviar");

  // O texto ficou EDITÁVEL no campo — não virou mensagem enviada. É a mesma
  // regra do E2E da voz, e é o que impede um ADR alheio de virar nó sozinho.
  await expect(page.getByTestId("conversa-pensando")).toHaveCount(0);
  await campo.fill(`${await campo.inputValue()} (corrigido à mão)`);
  await expect(campo).toHaveValue(/corrigido à mão/);
});

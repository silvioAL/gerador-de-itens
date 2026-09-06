// Verificação visual da SPEC-107 fatia A contra a stack REAL (:8080), nos
// dois temas — roda com `node e2e/visual-fatia-a.mjs`, não faz parte da suíte.
import { chromium } from "playwright";

const BASE = "http://localhost:8080";

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
await pagina.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

await pagina.goto(BASE);
await pagina.getByRole("button", { name: "Entrar" }).first().click();
await pagina.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await pagina.getByRole("button", { name: "Entrar" }).click();
const escolher = pagina.getByRole("button", { name: "time-pagamentos", exact: true });
try {
  await escolher.waitFor({ state: "visible", timeout: 8000 });
  await escolher.click();
} catch {
  // usuário de um time só entra direto
}
await pagina.getByRole("button", { name: "+ Serviço", exact: true }).waitFor({ timeout: 15000 });

await pagina.goto(`${BASE}/#/fluxo`);
await pagina.getByTestId("fluxo-screen").waitFor({ timeout: 15000 });
// Um rascunho com a função na tela — é a superfície nova da fatia.
await pagina.getByLabel("Nome do fluxo novo").fill("Visual fatia A");
await pagina.getByTestId("criar-fluxo").click();
await pagina.getByTestId("add-funcao-derivacao").click();
await pagina.getByTestId("add-funcao-ensaio").click();
// SPEC-107 fatia B — o projeto na paleta, com o painel das duas direções.
await pagina.getByTestId("add-projeto").click();
await pagina.getByTestId("contrato-do-projeto").waitFor({ timeout: 5000 });

for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-fatia-a-${tema}.png`, fullPage: false });
  console.log(`screenshot: test-results/visual-fatia-a-${tema}.png`);
}

// SPEC-107 fatia C — o GATE ao vivo contra a stack real: a fiação suspende na
// derivação (o agente nem roda — nenhuma credencial é tocada) e o aviso com
// continuar/descartar aparece. Config restaurada no fim.
const API = "http://localhost:4000";
const fluxosOriginais = (await (await pagina.request.get(`${API}/config/fluxos?timeId=time-pagamentos`)).json()).documento;
const conectoresOriginais = (await (await pagina.request.get(`${API}/config/conectores`)).json()).documento;
try {
  const dosOutros = (conectoresOriginais?.conectores ?? []).filter((c) => c.id !== "desenho-visual");
  const rConector = await pagina.request.put(`${API}/config/conectores`, {
    data: {
      documento: {
        conectores: [
          ...dosOutros,
          {
            id: "desenho-visual",
            nome: "Desenho da casa (visual)",
            endpoint: "http://gateway-falso:4123/v1/desenho",
            entrada: [],
            saida: [{ chave: "desenho", rotulo: "Desenho", tipo: "objeto", caminho: "$.desenho", obrigatorio: true }],
          },
        ],
      },
    },
  });
  if (rConector.status() !== 200) throw new Error(`PUT conectores: ${rConector.status()} ${await rConector.text()}`);
  const rFluxo = await pagina.request.put(`${API}/config/fluxos`, {
    data: {
      timeId: "time-pagamentos",
      documento: {
        fluxos: [
          {
            id: "gate-visual",
            nome: "Fiação com gate (visual)",
            nos: [
              { id: "le", tipo: "conector", refId: "desenho-visual", posicao: { x: 0, y: 80 }, parametros: {} },
              { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 260, y: 80 }, parametros: {}, confirmacao: "aguardar" },
              { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 520, y: 80 }, parametros: {} },
            ],
            arestas: [
              { de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
              { de: "gera", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
            ],
          },
        ],
      },
    },
  });

  if (rFluxo.status() !== 200) throw new Error(`PUT fluxos: ${rFluxo.status()} ${await rFluxo.text()}`);
  // `goto` para o MESMO #/fluxo não navega (só o hash) — o reload recarrega a
  // lista de fluxos com o que os PUTs acabaram de gravar.
  await pagina.reload();
  await pagina.getByTestId("fluxo-screen").waitFor({ timeout: 15000 });
  await pagina.getByTestId("seletor-de-fluxo").selectOption("gate-visual");
  await pagina.getByTestId("executar-fluxo").click();
  await pagina.getByTestId("gate-de-confirmacao").waitFor({ timeout: 30000 });

  for (const tema of ["claro", "escuro"]) {
    await pagina.evaluate((t) => {
      localStorage.setItem("gerador:tema", t);
      document.documentElement.setAttribute("data-tema", t);
    }, tema);
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: `test-results/visual-gate-${tema}.png`, fullPage: false });
    console.log(`screenshot: test-results/visual-gate-${tema}.png`);
  }
  await pagina.getByTestId("descartar-execucao").click();
} finally {
  await pagina.request.put(`${API}/config/fluxos`, { data: { documento: fluxosOriginais, timeId: "time-pagamentos" } });
  await pagina.request.put(`${API}/config/conectores`, { data: { documento: conectoresOriginais } });
}

await navegador.close();

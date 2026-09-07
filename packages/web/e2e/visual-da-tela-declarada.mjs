// SPEC-110 fatia C — verificação VISUAL do editor de telas e do stage de uma
// tela DECLARADA contra a stack REAL (:8080), nos DOIS temas.
// Roda com `node e2e/visual-da-tela-declarada.mjs`.
//
// A troca de tema acontece na MESMA sessão: repetir o login bate no rate
// limit do servidor (achado da SPEC-109).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const DIAGRAMA = JSON.parse(readFileSync(new URL("../../../config/cenarios/credito-completo.json", import.meta.url), "utf-8"))
  .quebra.diagrama;

const BASE = "http://localhost:8080";
const API = "http://localhost:4000";
const TIME = "time-pagamentos";

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
await pagina.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

await pagina.goto(BASE);
await pagina.getByRole("button", { name: "Entrar" }).first().click();
await pagina.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await pagina.getByRole("button", { name: "Entrar" }).click();
const escolher = pagina.getByRole("button", { name: TIME, exact: true });
try {
  await escolher.waitFor({ state: "visible", timeout: 8000 });
  await escolher.click();
} catch {
  // usuário de um time só entra direto
}
await pagina.getByRole("button", { name: "+ Serviço", exact: true }).waitFor({ timeout: 15000 });

const telasOriginais = (await (await pagina.request.get(`${API}/config/telas?timeId=${TIME}`)).json()).documento;
const fluxosOriginais = (await (await pagina.request.get(`${API}/config/fluxos?timeId=${TIME}`)).json()).documento;

try {
  // ── 1. O EDITOR, com a prévia ao lado ──
  const salvaTela = await pagina.request.put(`${API}/config/telas`, {
    data: {
      timeId: TIME,
      documento: {
        telas: [
          {
            id: "revisar-visual",
            nome: "Revisar a proposta",
            icone: "🔎",
            blocos: [
              { tipo: "texto", markdown: "**Confira** a proposta antes de seguir." },
              { tipo: "dado", chave: "desenho", rotulo: "Desenho da demanda", formato: "objeto" },
              { tipo: "campo", chave: "parecer", rotulo: "Seu parecer", entrada: "texto", obrigatorio: true },
              { tipo: "campo", chave: "risco", rotulo: "Risco", entrada: "escolha", opcoes: ["baixo", "alto"] },
              { tipo: "acao", rotulo: "Aprovar e seguir", acao: "avancar" },
            ],
          },
        ],
      },
    },
  });
  if (salvaTela.status() !== 200) throw new Error(`PUT /config/telas: ${salvaTela.status()} ${await salvaTela.text()}`);

  await pagina.goto(`${BASE}/#/config/telas/revisar-visual`);
  await pagina.getByTestId("editor-de-tela").waitFor({ timeout: 20000 });
  await pagina.getByTestId("preview-da-tela").waitFor({ timeout: 10000 });

  for (const tema of ["claro", "escuro"]) {
    await pagina.evaluate((t) => {
      localStorage.setItem("gerador:tema", t);
      document.documentElement.setAttribute("data-tema", t);
    }, tema);
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: `test-results/visual-tela-editor-${tema}.png` });
    console.log(`screenshot: test-results/visual-tela-editor-${tema}.png`);
  }

  // ── 2. O STAGE da tela DECLARADA, com o Avançar travado pelo obrigatório ──
  const criada = await pagina.request.post(`${API}/quebras`, {
    data: { titulo: `visual tela declarada ${Date.now()}`, time: TIME, diagrama: DIAGRAMA },
  });
  if (criada.status() !== 201) throw new Error(`POST /quebras: ${criada.status()} ${await criada.text()}`);
  const { id: demandaId } = await criada.json();

  const salvaFluxo = await pagina.request.put(`${API}/config/fluxos`, {
    data: {
      timeId: TIME,
      documento: {
        fluxos: [
          {
            id: "visual-com-tela",
            nome: "Com a tela do time (visual)",
            nos: [
              { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 0 }, parametros: {} },
              { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 240, y: 0 }, parametros: { demandaId } },
              { id: "revisa", tipo: "tela", refId: "tela:revisar-visual", posicao: { x: 480, y: 0 }, parametros: {} },
            ],
            arestas: [
              { de: "gatilho", para: "demanda", mapeamento: [] },
              { de: "demanda", para: "revisa", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
            ],
          },
        ],
      },
    },
  });
  if (salvaFluxo.status() !== 200) throw new Error(`PUT /config/fluxos: ${salvaFluxo.status()} ${await salvaFluxo.text()}`);

  const exec = await pagina.request.post(`${API}/fluxos/visual-com-tela/executar`, { data: { timeId: TIME } });
  const corpo = await exec.json();
  if (!corpo.aguardandoTela) {
    const falha = (corpo.nos ?? []).find((n) => n.erro);
    throw new Error(`a execução não parou na tela${falha ? `: ${falha.noId} — ${falha.erro}` : ""}`);
  }

  await pagina.goto(`${BASE}/#/tela/${corpo.execucaoId}`);
  await pagina.getByTestId("tela-declarada").waitFor({ timeout: 20000 });
  // O obrigatório trava o Avançar COM MOTIVO — botão inerte sem explicação é
  // o que a casa recusa (§2.4-6).
  if (await pagina.getByTestId("tela-avancar").isEnabled()) throw new Error("o Avançar devia estar travado pelo obrigatório");
  await pagina.getByTestId("tela-avancar-travado").waitFor({ timeout: 5000 });

  for (const tema of ["claro", "escuro"]) {
    await pagina.evaluate((t) => {
      localStorage.setItem("gerador:tema", t);
      document.documentElement.setAttribute("data-tema", t);
    }, tema);
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: `test-results/visual-tela-declarada-${tema}.png` });
    console.log(`screenshot: test-results/visual-tela-declarada-${tema}.png`);
  }

  // Preencher destrava — a prova de que o motivo era o obrigatório, e não
  // um botão morto.
  await pagina.getByLabel("Seu parecer").fill("aprovado");
  if (!(await pagina.getByTestId("tela-avancar").isEnabled())) throw new Error("preencher o obrigatório não destravou o Avançar");
} finally {
  await pagina.request.put(`${API}/config/fluxos`, { data: { documento: fluxosOriginais, timeId: TIME } });
  await pagina.request.put(`${API}/config/telas`, { data: { documento: telasOriginais, timeId: TIME } });
}

await navegador.close();
console.log("visual da tela declarada: ok nos dois temas");

import type { Atividade, Diagrama, No } from "../model/types.js";
import type { DiagramaConfig } from "../config/types.js";
import { calcularProntidao } from "../readiness/prontidao.js";
import { nosDeOrigem } from "../especificacao/gerarEspecificacaoEntrega.js";

export interface OpcoesGerarDiagramaHtml {
  /** Título mostrado no cabeçalho do HTML. Default: "Diagrama da solução". */
  titulo?: string;
}

const NIVEL_SEVERIDADE: Record<string, number> = { vermelho: 2, amarelo: 1, verde: 0 };
const NIVEL_COR: Record<string, string> = { vermelho: "#ef4444", amarelo: "#eab308", verde: "#22c55e" };
const NIVEL_TEXTO: Record<string, string> = { vermelho: "pendente", amarelo: "a confirmar", verde: "completo" };

function larguraDoRotulo(rotulo: string): number {
  return Math.max(140, Math.min(260, 24 + rotulo.length * 7));
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Gera um HTML único, autocontido e interativo (SVG + CSS + JS inline, zero
 * dependência nova) com o diagrama animado — a animação mostra a DIREÇÃO do
 * fluxo de dados entre os nós (guiada por `EdgeTypeConfig.fluxo`), não uma
 * revisão de itens. Ao clicar num nó, mostra as atividades derivadas
 * relacionadas com um resumo de prontidão (reusa `calcularProntidao`, mesmo
 * semáforo do canvas — "especificado" vs. "pendente" por atividade). Tem
 * também um modo "reproduzir em sequência" (play/pause/anterior/próximo) que
 * percorre as conexões uma a uma, pra ajudar quem tá vendo o diagrama pela
 * primeira vez a entender a ORDEM do fluxo (SPEC-21).
 *
 * Mesmo princípio de `gerarEspecificacaoEntrega`: função pura, string in/out,
 * `packages/engine` continua sem dependência de framework — o SVG é gerado
 * como template literal, sem lib de renderização nenhuma.
 */
export function gerarDiagramaHtml(
  atividades: Atividade[],
  diagrama: Diagrama,
  config: DiagramaConfig,
  opcoes: OpcoesGerarDiagramaHtml = {}
): string {
  const titulo = opcoes.titulo ?? "Diagrama da solução";

  const nos = diagrama.nodes.map((no) => ({
    id: no.id,
    label: no.label,
    tipo: config.nodeTypes[no.type]?.label ?? no.type,
    x: no.x,
    y: no.y,
    w: larguraDoRotulo(no.label),
    h: 58,
    cor: config.nodeTypes[no.type]?.color ?? "#64748b",
  }));

  const arestas = diagrama.edges
    .filter((e) => diagrama.nodes.some((n) => n.id === e.source) && diagrama.nodes.some((n) => n.id === e.target))
    .map((e) => {
      const cfg = config.edgeTypes[e.type];
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        verbo: cfg?.verbo ?? cfg?.label ?? e.type,
        fluxo: (cfg?.gerarAtividade === false ? "estatico" : (cfg?.fluxo ?? "forward")) as
          | "forward"
          | "reverse"
          | "bidirectional"
          | "estatico",
        cor: cfg?.color ?? "#94a3b8",
      };
    });

  const itens = atividades.map((atividade, i) => {
    const origens = nosDeOrigem(atividade, diagrama);
    const niveis = origens.map((no) => {
      const spec = config.nodeTypes[no.type]?.spec ?? [];
      return calcularProntidao(spec, no, diagrama.edges).nivel;
    });
    const pior = niveis.reduce<string>(
      (acc, n) => (NIVEL_SEVERIDADE[n] > NIVEL_SEVERIDADE[acc] ? n : acc),
      "verde"
    );
    return {
      indice: i,
      chave: atividade.chave,
      rotulo: atividade.rotulo,
      tipo: atividade.tipo,
      tamanho: atividade.tamanho,
      techs: atividade.techs.join(", "),
      contextos: atividade.contextos.join(", "),
      nivel: niveis.length > 0 ? pior : undefined,
      nos: origens.map((n) => n.id),
    };
  });

  const nodeIdParaItens: Record<string, number[]> = {};
  for (const item of itens) {
    for (const noId of item.nos) {
      (nodeIdParaItens[noId] ??= []).push(item.indice);
    }
  }

  const legendaEntradas = new Map<string, string>(); // cor -> rótulo (um por tipo de aresta usado)
  for (const e of diagrama.edges) {
    const cfg = config.edgeTypes[e.type];
    if (cfg?.color) legendaEntradas.set(cfg.color, cfg.label);
  }

  const dados = {
    nos,
    arestas,
    itens: itens.map(({ indice, chave, rotulo, tipo, tamanho, techs, contextos, nivel }) => ({
      indice,
      chave,
      rotulo,
      tipo,
      tamanho,
      techs,
      contextos,
      nivel,
    })),
    nodeIdParaItens,
    legenda: [...legendaEntradas.entries()].map(([cor, rotulo]) => ({ cor, rotulo })),
  };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${escaparHtml(titulo)}</title>
<style>
${CSS_DIAGRAMA}
</style>
</head>
<body>
<div id="app">
  <div id="diagrama-col">
    <div id="diagrama-header">
      <div>
        <h1>${escaparHtml(titulo)}</h1>
        <div class="sub">Clique num nó pra ver os itens relacionados · arraste pra mover, role pra dar zoom</div>
      </div>
      <button id="btn-sequencia">▶ Reproduzir em sequência</button>
    </div>
    <div id="barra-sequencia">
      <button id="btn-seq-prev" title="Passo anterior">⏮</button>
      <button id="btn-seq-play" title="Play/Pause">▶</button>
      <button id="btn-seq-next" title="Próximo passo">⏭</button>
      <div id="seq-info">
        <div id="seq-passo">Passo 1</div>
        <div id="seq-legenda">—</div>
        <div id="seq-progresso"></div>
      </div>
      <button id="btn-seq-sair">✕ modo livre</button>
    </div>
    <div id="svg-wrap">
      <svg id="svg-diagrama" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"></svg>
      <div id="zoom-controles">
        <button id="btn-zoom-in" title="Aumentar zoom">+</button>
        <button id="btn-zoom-out" title="Diminuir zoom">−</button>
        <button id="btn-zoom-reset" title="Resetar visão">⤾</button>
        <div id="zoom-nivel">100%</div>
      </div>
    </div>
  </div>
  <div id="painel">
    <div id="painel-header">
      <h2 id="painel-titulo">Nenhum nó selecionado</h2>
      <p id="painel-sub">Clique num nó do diagrama pra ver os itens gerados que se relacionam com ele.</p>
    </div>
    <div id="painel-body">
      <div class="placeholder" id="painel-placeholder">
        ← Comece clicando em qualquer caixa do diagrama, ou use "Reproduzir em sequência" pra ver o fluxo guiado.
      </div>
    </div>
    <div id="painel-footer">Gerado automaticamente a partir do diagrama — não é editável aqui.</div>
  </div>
</div>
<script>
const DADOS = ${JSON.stringify(dados)};
${JS_DIAGRAMA}
</script>
</body>
</html>`;
}

const CSS_DIAGRAMA = `
  :root { --bg:#0f172a; --panel-bg:#1e293b; --panel-border:#334155; --text:#e2e8f0; --text-dim:#94a3b8; --accent:#38bdf8; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; height:100%; background:var(--bg); font-family:-apple-system,"Segoe UI",Inter,system-ui,sans-serif; color:var(--text); overflow:hidden; }
  #app { display:flex; height:100vh; }
  #diagrama-col { flex:1; display:flex; flex-direction:column; min-width:0; }
  #diagrama-header { padding:14px 20px; border-bottom:1px solid var(--panel-border); display:flex; align-items:center; justify-content:space-between; gap:12px; }
  #diagrama-header h1 { font-size:15px; margin:0; font-weight:600; }
  #diagrama-header .sub { font-size:12px; color:var(--text-dim); }
  #btn-sequencia { background:#1d4ed8; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:11.5px; font-weight:600; cursor:pointer; flex-shrink:0; }
  #btn-sequencia:hover { background:#1e40af; }
  #barra-sequencia { display:none; align-items:center; gap:10px; padding:10px 20px; border-bottom:1px solid var(--panel-border); background:#16213a; }
  #barra-sequencia.ativa { display:flex; }
  #barra-sequencia button { width:30px; height:30px; border-radius:7px; border:1px solid var(--panel-border); background:#1e293b; color:var(--text); font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  #barra-sequencia button:hover:not(:disabled) { background:#334155; }
  #barra-sequencia button:disabled { opacity:.35; cursor:default; }
  #btn-seq-play { background:var(--accent); border-color:var(--accent); color:#0f172a; }
  #seq-info { flex:1; min-width:0; }
  #seq-passo { font-size:10.5px; color:var(--text-dim); }
  #seq-legenda { font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #seq-progresso { display:flex; gap:3px; margin-top:5px; }
  #seq-progresso i { height:3px; flex:1; border-radius:2px; background:#334155; display:block; }
  #seq-progresso i.feito { background:var(--accent); }
  #btn-seq-sair { background:transparent; border:none; color:var(--text-dim); font-size:12px; cursor:pointer; padding:4px 8px; flex-shrink:0; }
  #btn-seq-sair:hover { color:var(--text); }
  .edge-line.dimmed, .fluxo-dot.dimmed { opacity:.08 !important; }
  .edge-line.destaque { opacity:1 !important; stroke-width:3px !important; }
  .node-group.dimmed .node-rect { opacity:.3; }
  #svg-wrap { flex:1; position:relative; cursor:grab; user-select:none; }
  #svg-wrap.arrastando { cursor:grabbing; }
  svg { width:100%; height:100%; display:block; }
  #zoom-controles { position:absolute; right:14px; bottom:14px; display:flex; flex-direction:column; gap:4px; background:var(--panel-bg); border:1px solid var(--panel-border); border-radius:8px; padding:4px; z-index:2; }
  #zoom-controles button { width:26px; height:26px; border:none; border-radius:5px; background:transparent; color:var(--text); font-size:15px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  #zoom-controles button:hover { background:#334155; }
  #zoom-nivel { font-size:9.5px; color:var(--text-dim); text-align:center; padding-top:2px; }
  .node-rect { fill:#1e293b; stroke:#334155; stroke-width:1.5; rx:10; cursor:pointer; transition:filter .15s ease, stroke .15s ease; }
  .node-group:hover .node-rect { filter:brightness(1.25); }
  .node-group.selecionado .node-rect { stroke:var(--accent); stroke-width:2.5; }
  .node-label { fill:var(--text); font-size:12.5px; font-weight:600; pointer-events:none; }
  .node-sub { fill:var(--text-dim); font-size:10px; pointer-events:none; }
  .edge-line { fill:none; stroke-width:1.6; opacity:.55; }
  .edge-label { font-size:9.5px; fill:var(--text-dim); text-anchor:middle; }
  .fluxo-dot { filter:drop-shadow(0 0 4px currentColor); }
  #painel { width:380px; flex-shrink:0; background:var(--panel-bg); border-left:1px solid var(--panel-border); display:flex; flex-direction:column; overflow:hidden; }
  #painel-header { padding:14px 18px; border-bottom:1px solid var(--panel-border); }
  #painel-header h2 { font-size:13px; margin:0 0 2px; }
  #painel-header p { font-size:11px; color:var(--text-dim); margin:0; }
  #painel-body { flex:1; overflow-y:auto; padding:12px 18px; }
  .placeholder { color:var(--text-dim); font-size:12.5px; line-height:1.6; padding-top:8px; }
  .item-card { background:#0f172a; border:1px solid var(--panel-border); border-radius:8px; padding:10px 12px; margin-bottom:10px; }
  .item-card .cabecalho { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; gap:8px; }
  .item-card .tipo { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:#38bdf8; }
  .item-card .resumo { font-size:10px; display:flex; align-items:center; gap:4px; flex-shrink:0; }
  .item-card .resumo i { width:7px; height:7px; border-radius:50%; display:inline-block; }
  .item-card h3 { font-size:12.5px; margin:0 0 8px; font-weight:600; }
  .item-card .campo { font-size:11px; color:var(--text-dim); margin:3px 0; }
  .item-card .campo b { color:var(--text); font-weight:500; }
  #painel-footer { padding:10px 18px; border-top:1px solid var(--panel-border); font-size:10.5px; color:var(--text-dim); }
`;

const JS_DIAGRAMA = `
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function noPorId(id) { return DADOS.nos.find((n) => n.id === id); }
function centro(n) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }
function borda(n, alvo) {
  const c = centro(n); const dx = alvo.x - c.x, dy = alvo.y - c.y;
  const sx = n.w / 2 / (Math.abs(dx) || 1e-6), sy = n.h / 2 / (Math.abs(dy) || 1e-6);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

const svg = document.getElementById("svg-diagrama");
const defs = el("defs", {});
const coresUnicas = [...new Set(DADOS.arestas.map((e) => e.cor))];
const corIndice = new Map(coresUnicas.map((c, i) => [c, i]));
coresUnicas.forEach((cor, i) => {
  const marker = el("marker", { id: "seta-" + i, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
  marker.appendChild(el("path", { d: "M0,0 L10,5 L0,10 z", fill: cor }));
  defs.appendChild(marker);
});
svg.appendChild(defs);

const viewport = el("g", { id: "viewport" });
svg.appendChild(viewport);

let styleAnim = "";
DADOS.arestas.forEach((edge, i) => {
  const a = noPorId(edge.source), b = noPorId(edge.target);
  if (!a || !b) return;
  const p1 = borda(a, centro(b)), p2 = borda(b, centro(a));
  const d = "M " + p1.x + " " + p1.y + " L " + p2.x + " " + p2.y;
  const path = el("path", { id: "path-" + edge.id, class: "edge-line", d, stroke: edge.cor, "marker-end": "url(#seta-" + corIndice.get(edge.cor) + ")" });
  viewport.appendChild(path);
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  const label = el("text", { class: "edge-label", x: mx, y: my - 8 });
  label.textContent = edge.verbo + (edge.fluxo === "bidirectional" ? " \\u21c4" : "");
  viewport.appendChild(label);
  if (edge.fluxo === "estatico") return;
  function addDot(reversa) {
    const dot = el("circle", { class: "fluxo-dot", r: 4, fill: edge.cor, style: "color:" + edge.cor });
    viewport.appendChild(dot);
    const dur = (3.2 + i * 0.4).toFixed(1) + "s";
    const dotId = "dot-" + edge.id + (reversa ? "-r" : "");
    dot.id = dotId;
    styleAnim += "#" + dotId + "{offset-path:path('" + d + "');offset-distance:0%;offset-rotate:auto;animation:mover-" + dotId + " " + dur + " linear infinite;}"
      + "@keyframes mover-" + dotId + "{0%{offset-distance:" + (reversa ? "100%" : "0%") + ";opacity:0;}8%{opacity:1;}92%{opacity:1;}100%{offset-distance:" + (reversa ? "0%" : "100%") + ";opacity:0;}}";
  }
  if (edge.fluxo === "forward") addDot(false);
  else if (edge.fluxo === "reverse") addDot(true);
  else if (edge.fluxo === "bidirectional") { addDot(false); addDot(true); }
});
const styleTag = document.createElement("style");
styleTag.textContent = styleAnim;
document.head.appendChild(styleTag);

DADOS.nos.forEach((n) => {
  const g = el("g", { class: "node-group", "data-node-id": n.id });
  g.appendChild(el("rect", { class: "node-rect", x: n.x, y: n.y, width: n.w, height: n.h }));
  g.appendChild(el("rect", { x: n.x, y: n.y, width: 4, height: n.h, fill: n.cor, rx: 2 }));
  const label = el("text", { class: "node-label", x: n.x + 16, y: n.y + n.h / 2 - 3 });
  label.textContent = n.label;
  g.appendChild(label);
  const sub = el("text", { class: "node-sub", x: n.x + 16, y: n.y + n.h / 2 + 14 });
  sub.textContent = n.tipo;
  g.appendChild(sub);
  const count = (DADOS.nodeIdParaItens[n.id] || []).length;
  if (count > 0) {
    const badge = el("g", {});
    badge.appendChild(el("circle", { cx: n.x + n.w - 14, cy: n.y + 14, r: 9, fill: "#0f172a", stroke: n.cor, "stroke-width": 1.3 }));
    const t = el("text", { x: n.x + n.w - 14, y: n.y + 18, "text-anchor": "middle", "font-size": "10", fill: "#e2e8f0", "font-weight": "700" });
    t.textContent = String(count);
    badge.appendChild(t);
    g.appendChild(badge);
  }
  viewport.appendChild(g);
});

const CORES_NIVEL = { verde: "#22c55e", amarelo: "#eab308", vermelho: "#ef4444" };
const TEXTO_NIVEL = { verde: "completo", amarelo: "a confirmar", vermelho: "pendente" };

const painelTitulo = document.getElementById("painel-titulo");
const painelSub = document.getElementById("painel-sub");
const painelBody = document.getElementById("painel-body");

function mostrarNos(nodeIds, tituloOverride) {
  document.querySelectorAll(".node-group.selecionado").forEach((n) => n.classList.remove("selecionado"));
  nodeIds.forEach((id) => { const g = svg.querySelector('[data-node-id="' + id + '"]'); if (g) g.classList.add("selecionado"); });

  const indices = [...new Set(nodeIds.flatMap((id) => DADOS.nodeIdParaItens[id] || []))];
  const nomes = nodeIds.map((id) => noPorId(id)?.label).filter(Boolean).join(" + ");
  painelTitulo.textContent = tituloOverride || nomes || "Nó sem nome";
  painelSub.textContent = indices.length > 0 ? indices.length + " item(ns) relacionado(s)" : "Nenhum item relacionado (nó só de topologia)";

  painelBody.innerHTML = "";
  if (indices.length === 0) {
    const p = document.createElement("div");
    p.className = "placeholder";
    p.textContent = "Este(s) nó(s) não têm atividade derivada associada.";
    painelBody.appendChild(p);
    return;
  }
  indices.forEach((i) => {
    const item = DADOS.itens.find((it) => it.indice === i);
    if (!item) return;
    const card = document.createElement("div");
    card.className = "item-card";
    const cabecalho = document.createElement("div");
    cabecalho.className = "cabecalho";
    const tipo = document.createElement("div");
    tipo.className = "tipo";
    tipo.textContent = item.tipo;
    cabecalho.appendChild(tipo);
    if (item.nivel) {
      const resumo = document.createElement("div");
      resumo.className = "resumo";
      resumo.innerHTML = '<i style="background:' + CORES_NIVEL[item.nivel] + '"></i>' + TEXTO_NIVEL[item.nivel];
      cabecalho.appendChild(resumo);
    }
    card.appendChild(cabecalho);
    const h3 = document.createElement("h3");
    h3.textContent = item.rotulo;
    card.appendChild(h3);
    [["Tamanho", item.tamanho], ["Tech", item.techs], ["Contexto", item.contextos]].forEach(([k, v]) => {
      if (!v) return;
      const campo = document.createElement("div");
      campo.className = "campo";
      campo.innerHTML = "<b>" + k + ":</b> " + v;
      card.appendChild(campo);
    });
    painelBody.appendChild(card);
  });
}

svg.addEventListener("click", (ev) => {
  const grupo = ev.target.closest("[data-node-id]");
  if (!grupo) return;
  sairDoModoSequencial();
  mostrarNos([grupo.getAttribute("data-node-id")]);
});

const STEPS = DADOS.arestas.filter((e) => e.fluxo !== "estatico").map((edge) => ({
  edge,
  legenda: (noPorId(edge.source)?.label || edge.source) + " " + edge.verbo + " " + (noPorId(edge.target)?.label || edge.target),
}));

const barraSequencia = document.getElementById("barra-sequencia");
const btnSequencia = document.getElementById("btn-sequencia");
const btnSeqPlay = document.getElementById("btn-seq-play");
const btnSeqPrev = document.getElementById("btn-seq-prev");
const btnSeqNext = document.getElementById("btn-seq-next");
const btnSeqSair = document.getElementById("btn-seq-sair");
const seqPasso = document.getElementById("seq-passo");
const seqLegenda = document.getElementById("seq-legenda");
const seqProgresso = document.getElementById("seq-progresso");
STEPS.forEach(() => seqProgresso.appendChild(document.createElement("i")));

let passoAtual = -1, reproduzindo = false, timerAuto = null;

function entrarNoPasso(i) {
  if (STEPS.length === 0) return;
  passoAtual = Math.max(0, Math.min(STEPS.length - 1, i));
  const { edge, legenda } = STEPS[passoAtual];
  document.querySelectorAll(".edge-line, .fluxo-dot").forEach((n) => n.classList.add("dimmed"));
  document.querySelectorAll(".node-group").forEach((n) => n.classList.add("dimmed"));
  const pathEl = document.getElementById("path-" + edge.id);
  if (pathEl) { pathEl.classList.remove("dimmed"); pathEl.classList.add("destaque"); }
  document.querySelectorAll('[id^="dot-' + edge.id + '"]').forEach((d) => d.classList.remove("dimmed"));
  [edge.source, edge.target].forEach((nid) => { const g = svg.querySelector('[data-node-id="' + nid + '"]'); if (g) g.classList.remove("dimmed"); });
  seqPasso.textContent = "Passo " + (passoAtual + 1) + " de " + STEPS.length;
  seqLegenda.textContent = legenda;
  [...seqProgresso.children].forEach((el2, idx) => el2.classList.toggle("feito", idx <= passoAtual));
  btnSeqPrev.disabled = passoAtual === 0;
  btnSeqNext.disabled = passoAtual === STEPS.length - 1;
  mostrarNos([edge.source, edge.target], legenda);
}

function sairDoModoSequencial() {
  if (!barraSequencia.classList.contains("ativa")) return;
  clearInterval(timerAuto); timerAuto = null; reproduzindo = false;
  btnSeqPlay.textContent = "\\u25b6";
  barraSequencia.classList.remove("ativa");
  document.querySelectorAll(".edge-line, .fluxo-dot, .node-group").forEach((n) => n.classList.remove("dimmed"));
  document.querySelectorAll(".edge-line.destaque").forEach((n) => n.classList.remove("destaque"));
  passoAtual = -1;
}

function togglePlay() {
  reproduzindo = !reproduzindo;
  btnSeqPlay.textContent = reproduzindo ? "\\u23f8" : "\\u25b6";
  if (reproduzindo) {
    timerAuto = setInterval(() => { if (passoAtual >= STEPS.length - 1) entrarNoPasso(0); else entrarNoPasso(passoAtual + 1); }, 5200);
  } else {
    clearInterval(timerAuto); timerAuto = null;
  }
}

if (STEPS.length > 0) {
  btnSequencia.addEventListener("click", () => { barraSequencia.classList.add("ativa"); entrarNoPasso(0); togglePlay(); });
} else {
  btnSequencia.disabled = true;
  btnSequencia.title = "Nenhuma conexão animável neste diagrama";
}
btnSeqPlay.addEventListener("click", togglePlay);
btnSeqPrev.addEventListener("click", () => { if (reproduzindo) togglePlay(); entrarNoPasso(passoAtual - 1); });
btnSeqNext.addEventListener("click", () => { if (reproduzindo) togglePlay(); entrarNoPasso(passoAtual + 1); });
btnSeqSair.addEventListener("click", sairDoModoSequencial);

const svgWrap = document.getElementById("svg-wrap");
const zoomNivel = document.getElementById("zoom-nivel");
let vx = 0, vy = 0, vscale = 1, arrastando = false, arrasteMoveu = false, origemX = 0, origemY = 0;

function aplicarTransform() {
  viewport.setAttribute("transform", "translate(" + vx + " " + vy + ") scale(" + vscale + ")");
  zoomNivel.textContent = Math.round(vscale * 100) + "%";
}
function pontoSvg(clientX, clientY) {
  const rect = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
  return { x: vb.x + ((clientX - rect.left) / rect.width) * vb.width, y: vb.y + ((clientY - rect.top) / rect.height) * vb.height };
}
function zoomEm(fator, centroTela) {
  const antes = pontoSvg(centroTela.x, centroTela.y);
  const novaEscala = Math.min(3, Math.max(0.3, vscale * fator));
  vx = antes.x - (antes.x - vx) * (novaEscala / vscale);
  vy = antes.y - (antes.y - vy) * (novaEscala / vscale);
  vscale = novaEscala;
  aplicarTransform();
}
svgWrap.addEventListener("mousedown", (ev) => {
  if (ev.target.closest("[data-node-id]")) return;
  arrastando = true; arrasteMoveu = false; origemX = ev.clientX; origemY = ev.clientY;
  svgWrap.classList.add("arrastando");
});
window.addEventListener("mousemove", (ev) => {
  if (!arrastando) return;
  const rect = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
  const dx = (ev.clientX - origemX) * (vb.width / rect.width), dy = (ev.clientY - origemY) * (vb.height / rect.height);
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) arrasteMoveu = true;
  vx += dx; vy += dy; origemX = ev.clientX; origemY = ev.clientY;
  aplicarTransform();
});
window.addEventListener("mouseup", () => { arrastando = false; svgWrap.classList.remove("arrastando"); });
svgWrap.addEventListener("wheel", (ev) => { ev.preventDefault(); zoomEm(ev.deltaY < 0 ? 1.12 : 1 / 1.12, { x: ev.clientX, y: ev.clientY }); }, { passive: false });
document.getElementById("btn-zoom-in").addEventListener("click", () => { const r = svgWrap.getBoundingClientRect(); zoomEm(1.2, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); });
document.getElementById("btn-zoom-out").addEventListener("click", () => { const r = svgWrap.getBoundingClientRect(); zoomEm(1 / 1.2, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); });
document.getElementById("btn-zoom-reset").addEventListener("click", () => { vx = 0; vy = 0; vscale = 1; aplicarTransform(); });
svg.addEventListener("click", (ev) => { if (arrasteMoveu) { ev.stopPropagation(); arrasteMoveu = false; } }, true);

aplicarTransform();
`;

import type { DocumentoDeDesenho, IndicadorDeSaude, ItemDoDocumento } from "./estruturarDocumento.js";
import type { Decisao } from "../model/types.js";

/**
 * SPEC-58 fatia 5 — o documento como HTML **autocontido**, no molde exato de
 * `gerarDiagramaHtml` (SPEC-21): um arquivo só, CSS inline, **zero dependência
 * nova**, função pura no engine.
 *
 * ## Por que HTML e não "markdown mais bonito"
 *
 * Este documento é o que sai da mesa e circula — vai para quem nunca abriu a
 * ferramenta. Markdown cru comunica "isto foi cuspido por uma máquina". E a
 * alternativa óbvia (uma biblioteca de renderização de markdown) seria trocar a
 * magreza do `packages/web` por uma árvore de dependências para reparsear um
 * texto que **nós mesmos acabamos de gerar**. A estrutura já está na mão; o
 * markdown é que é o intermediário desnecessário aqui.
 *
 * ## O PDF sai de graça
 *
 * `@media print` cuidado + `Ctrl+P` do navegador. Gerar PDF de verdade exigiria
 * um headless browser no servidor — peso desproporcional ao ganho, e uma
 * dependência de runtime que o modo hospedado teria que carregar para sempre.
 */
export interface OpcoesDocumentoHtml {
  /** O HTML do diagrama (`gerarDiagramaHtml`), embutido como `iframe srcdoc`.
   * Ausente = o documento sai sem o desenho, e diz isso. */
  diagramaHtml?: string;
  /** SPEC-58 fatia 3 — o estado do documento, mostrado no cabeçalho. */
  status?: string;
  /** SPEC-58 fatia 2 — as seções escritas por gente, na ordem em que entram. */
  escritas?: { titulo: string; texto: string }[];
  geradoEm?: string;
}

function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Parágrafos a partir de texto livre. Não é um renderizador de markdown: é o
 * mínimo honesto para texto que uma pessoa digitou num textarea. */
function paragrafos(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function chip(i: IndicadorDeSaude): string {
  return `<span class="chip ${i.nivel}"><span class="ic">${i.icone}</span>${esc(i.rotulo)}</span>`;
}

function cartaoDecisao(d: Decisao): string {
  const descartadas = d.alternativas.filter((a) => a.titulo !== d.escolhida);
  return `
    <article class="decisao">
      <h3>${esc(d.titulo)}</h3>
      ${d.contexto ? `<p class="ctx">${esc(d.contexto)}</p>` : ""}
      <p class="escolha"><strong>${esc(d.escolhida)}</strong>${d.porque.trim() ? ` — ${esc(d.porque)}` : ""}</p>
      ${
        descartadas.length > 0
          ? `<ul class="descartadas">${descartadas
              .map((a) => `<li><s>${esc(a.titulo)}</s>${a.consequencia ? ` — ${esc(a.consequencia)}` : ""}</li>`)
              .join("")}</ul>`
          : ""
      }
      ${!d.porque.trim() ? `<p class="alerta">sem o porquê — quem ler isto daqui a um ano vai refazer a análise</p>` : ""}
      <p class="meta">${esc(d.autor)} · ${esc(d.em.slice(0, 10))}</p>
    </article>`;
}

function cartaoItem(i: ItemDoDocumento): string {
  const citacao = (rotulo: string, valores: string[]) =>
    valores.length > 0 ? `<p class="cit"><span>${rotulo}</span> ${valores.map(esc).join(" · ")}</p>` : "";
  return `
    <article class="item">
      <header>
        <span class="num">${i.numero}</span>
        <h3>${esc(i.descricao)}</h3>
      </header>
      <p class="meta">${esc(i.tipo)} · ${esc(i.tamanho)}${i.techs.length ? ` · ${i.techs.map(esc).join(", ")}` : ""}</p>
      ${citacao("atende", i.necessidades)}
      ${citacao("segue", i.decisoes)}
      ${citacao("no caminho", i.percursos)}
    </article>`;
}

export function gerarDocumentoHtml(doc: DocumentoDeDesenho, opcoes: OpcoesDocumentoHtml = {}): string {
  const { violacoes, aceitas, violacoesDePercurso, naoMedidos, percursos } = doc.conferencias;
  const temConferencia =
    violacoes.length + aceitas.length + violacoesDePercurso.length + naoMedidos.length + percursos.length > 0;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.titulo)}</title>
<style>
  /* As mesmas variáveis do app: um segundo sistema visual dentro do mesmo
     produto é como interface envelhece em seis meses (SPEC-58 §7.1). */
  :root {
    --painel: #ffffff; --painel-2: #f8fafc; --borda: #e2e8f0; --borda-forte: #cbd5e1;
    --texto: #0f172a; --texto-2: #334155; --texto-fraco: #64748b; --texto-mudo: #94a3b8;
    --verde: #16a34a; --amarelo: #b45309; --vermelho: #dc2626; --indigo: #4f46e5;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 20px 80px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--texto); background: var(--painel-2);
    line-height: 1.6;
  }
  /* Largura de leitura contida: documento largura-de-tela ninguém lê até o fim. */
  .folha { max-width: 46rem; margin: 0 auto; background: var(--painel);
    border: 1px solid var(--borda); border-radius: 16px; padding: 40px 44px;
    box-shadow: 0 10px 40px rgba(15,23,42,.06); }
  h1 { font-size: 28px; line-height: 1.25; margin: 0 0 6px; letter-spacing: -.02em; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--texto-fraco); margin: 40px 0 12px; padding-bottom: 6px;
    border-bottom: 1px solid var(--borda); }
  h3 { font-size: 15px; margin: 0 0 4px; }
  p { margin: 0 0 10px; }
  .status { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; padding: 3px 10px; border-radius: 999px;
    background: rgba(79,70,229,.1); color: var(--indigo); }
  .faixa { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 4px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
    padding: 5px 12px; border-radius: 999px; border: 1px solid var(--borda-forte); }
  .chip .ic { font-size: 13px; }
  .chip.verde { border-color: rgba(22,163,74,.4); color: var(--verde); background: rgba(22,163,74,.06); }
  .chip.amarelo { border-color: rgba(180,83,9,.4); color: var(--amarelo); background: rgba(180,83,9,.06); }
  .chip.vermelho { border-color: rgba(220,38,38,.4); color: var(--vermelho); background: rgba(220,38,38,.06); }
  /* O que uma PESSOA escreveu é visualmente distinto do que a máquina apurou:
     é proveniência aplicada ao documento inteiro (SPEC-58 §7.2). */
  .escrita { border-left: 3px solid var(--indigo); padding: 2px 0 2px 16px; margin: 12px 0; }
  .escrita .selo { font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: var(--indigo); }
  ul.necessidades { list-style: none; padding: 0; margin: 0; }
  ul.necessidades li { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--borda); }
  ul.necessidades li .mk { flex: none; width: 1.2em; }
  li.gap .mk { color: var(--amarelo); }
  li.ok .mk { color: var(--verde); }
  .decisao, .item, .conf { border: 1px solid var(--borda); border-radius: 12px;
    padding: 14px 16px; margin: 10px 0; background: var(--painel); }
  .decisao .ctx { font-style: italic; color: var(--texto-fraco); font-size: 13px; }
  .decisao .escolha { font-size: 14px; }
  ul.descartadas { margin: 6px 0 0; padding-left: 18px; color: var(--texto-fraco); font-size: 13px; }
  .alerta { color: var(--amarelo); font-size: 13px; }
  .meta { color: var(--texto-mudo); font-size: 12px; margin: 6px 0 0; }
  .conf.fora { border-left: 3px solid var(--amarelo); }
  .conf .porque { color: var(--texto-fraco); font-size: 13px; }
  .item header { display: flex; align-items: baseline; gap: 10px; }
  .item .num { flex: none; font-size: 12px; font-weight: 700; color: var(--texto-mudo); }
  .item .cit { font-size: 12.5px; color: var(--texto-2); margin: 4px 0 0; }
  .item .cit span { display: inline-block; min-width: 5.5em; color: var(--texto-mudo);
    font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  /* §254 — o desenho escapa da coluna de leitura: 46rem é a régua do TEXTO, e
     nela o diagrama empilha o cabeçalho e corta o botão de reproduzir.
     §256 — e escapa LEVANDO O TÍTULO JUNTO: sozinho, o rótulo ficava na coluna
     e o desenho ~280px à esquerda dele, o que lê como bloco fora do lugar. */
  .faixa-desenho { width: min(1100px, calc(100vw - 48px)); margin: 36px 0 0 50%;
    transform: translateX(-50%); padding: 18px 20px 20px; border-radius: 16px;
    background: var(--painel-2); border: 1px solid var(--borda); }
  .faixa-desenho h2 { margin-top: 0; }
  .desenho { width: 100%; height: 560px; border: 1px solid var(--borda);
    border-radius: 12px; background: var(--painel); }
  .vazio { color: var(--texto-mudo); font-size: 13px; font-style: italic; }
  footer { max-width: 46rem; margin: 18px auto 0; color: var(--texto-mudo); font-size: 12px; }
  @media print {
    body { background: #fff; padding: 0; }
    .folha { box-shadow: none; border: none; border-radius: 0; max-width: none; padding: 0; }
    h2 { break-after: avoid; }
    .decisao, .item, .conf { break-inside: avoid; }
    /* Na impressão não há viewport para escapar: volta à largura da página. */
    .faixa-desenho { width: 100%; margin-left: 0; transform: none; padding: 0;
      border: none; background: none; }
    .desenho { height: 420px; }
  }
</style>
</head>
<body>
<main class="folha">
  <h1>${esc(doc.titulo)}</h1>
  ${opcoes.status ? `<span class="status">${esc(opcoes.status)}</span>` : ""}
  ${doc.saude.length > 0 ? `<div class="faixa">${doc.saude.map(chip).join("")}</div>` : ""}

  ${doc.contexto.trim() ? `<h2>Contexto</h2>${paragrafos(doc.contexto)}` : ""}

  ${
    doc.necessidades.length > 0
      ? `<h2>O que precisa ser verdade</h2>
  <ul class="necessidades">${doc.necessidades
    .map(
      (n) =>
        `<li class="${n.atendida ? "ok" : "gap"}"><span class="mk">${n.atendida ? "✓" : "○"}</span><span>${esc(
          n.texto
        )}${n.atendida ? "" : " <em>(ainda sem componente que responda)</em>"}</span></li>`
    )
    .join("")}</ul>`
      : ""
  }

  <section class="faixa-desenho">
    <h2>O desenho</h2>
    ${
      opcoes.diagramaHtml
        ? `<iframe class="desenho" title="Diagrama da solução" srcdoc="${esc(opcoes.diagramaHtml)}"></iframe>`
        : `<p class="vazio">Diagrama não embutido nesta cópia.</p>`
    }
  </section>

  ${
    doc.decisoes.length > 0
      ? `<h2>Decisões</h2>${doc.decisoes.map(cartaoDecisao).join("")}`
      : `<h2>Decisões</h2><p class="vazio">Nenhuma decisão entre alternativas nesta demanda — o que é resposta legítima: nem toda mudança move arquitetura.</p>`
  }

  ${
    temConferencia
      ? `<h2>O que foi conferido</h2>
  ${violacoes
    .map(
      (v) => `<div class="conf fora"><strong>${esc(v.noLabel)}</strong> · ${esc(v.campo)} ${esc(v.esperado)} — está ${esc(
        v.atual
      )}<div class="meta">${esc(v.texto)}</div>${v.porque ? `<p class="porque">${esc(v.porque)}</p>` : ""}</div>`
    )
    .join("")}
  ${aceitas
    .map(
      (v) =>
        `<div class="conf"><strong>${esc(v.noLabel)}</strong> · ${esc(v.campo)} — contrariado de propósito: ${esc(
          v.excecao?.motivo ?? ""
        )}<div class="meta">${esc(v.excecao?.autor ?? "")}</div></div>`
    )
    .join("")}
  ${violacoesDePercurso
    .map(
      (v) => `<div class="conf fora"><strong>${esc(v.rotulo)}</strong> — ${esc(v.texto)}: esperado ${esc(
        v.esperado
      )}, está ${esc(v.atual)}${v.porque ? `<p class="porque">${esc(v.porque)}</p>` : ""}</div>`
    )
    .join("")}
  ${naoMedidos
    .map(
      (n) =>
        `<div class="conf"><strong>${esc(n.rotulo)}</strong> — não dá para medir "${esc(n.texto)}": falta ${esc(
          n.campo
        )} em ${n.nosSemValor.map(esc).join(", ")}</div>`
    )
    .join("")}
  ${
    percursos.length > 0
      ? `<p class="meta">Caminhos conferidos: ${percursos.map((p) => esc(p.rotulo)).join(" · ")}</p>`
      : ""
  }`
      : ""
  }

  ${(opcoes.escritas ?? [])
    .filter((s) => s.texto.trim())
    .map(
      (s) =>
        `<h2>${esc(s.titulo)}</h2><div class="escrita"><span class="selo">escrito por uma pessoa</span>${paragrafos(
          s.texto
        )}</div>`
    )
    .join("")}

  <h2>Os itens</h2>
  ${doc.itens.length > 0 ? doc.itens.map(cartaoItem).join("") : `<p class="vazio">Nenhum item derivado ainda.</p>`}
</main>
<footer>${opcoes.geradoEm ? `Gerado em ${esc(opcoes.geradoEm)} · ` : ""}Gerador de Itens</footer>
</body>
</html>`;
}

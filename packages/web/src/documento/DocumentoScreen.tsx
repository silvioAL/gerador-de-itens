import { useMemo, useState } from "react";
import type {
  Decisao,
  DiagramaConfig,
  DocumentoDeDesenho,
  DocumentoEscrito,
  ItemDoDocumento,
  StatusDocumento,
} from "@gerador/engine";

/**
 * SPEC-58 — a tela do DOCUMENTO DE DESENHO (`#/documento`).
 *
 * ## O absurdo que ela fecha
 *
 * `quebra.especificacao` era persistida desde o §184 e **nunca exibida**: o App
 * a lia como booleano ("já gerou?"), o markdown ia para o download e sumia da
 * aplicação. O documento não precisou ser criado — precisou de leitor.
 *
 * ## Por que composto, e não markdown num `<pre>`
 *
 * Este documento circula para quem nunca abriu a ferramenta. Markdown cru
 * comunica "isto foi cuspido por uma máquina". E a alternativa óbvia — uma
 * biblioteca de render de markdown — trocaria as seis dependências do
 * `packages/web` por uma árvore inteira, para reparsear um texto que nós mesmos
 * geramos. A estrutura (`estruturarDocumento`) já está na mão.
 *
 * ## A proveniência aplicada ao documento
 *
 * O que uma PESSOA escreveu tem marca visual própria (barra indigo + selo).
 * Quem lê precisa saber o que foi afirmado por gente e o que foi apurado pela
 * máquina — é a mesma disciplina de `Origem`, um nível acima.
 */
export interface DocumentoScreenProps {
  documento: DocumentoDeDesenho;
  config: DiagramaConfig;
  /** HTML do diagrama (`gerarDiagramaHtml`), embutido via `srcDoc`. */
  diagramaHtml?: string;
  escrito: DocumentoEscrito;
  status: StatusDocumento | null;
  onMudarEscrito: (escrito: DocumentoEscrito) => void;
  onMudarStatus: (status: StatusDocumento) => void;
  /** SPEC-58 §5 — o documento mudou depois de aprovado. É a regra que impede
   * "aprovado" de virar carimbo: o trabalho de revisão não se perdeu, mas
   * dizer que continua aprovado depois que o desenho mudou seria mentira. */
  desatualizado?: boolean;
  onBaixarMarkdown: () => void;
  onBaixarHtml: () => void;
  onVoltar: () => void;
}

const ROTULO_STATUS: Record<StatusDocumento, string> = {
  rascunho: "rascunho",
  "em-revisao": "em revisão",
  aprovado: "aprovado",
  implementado: "implementado",
};

const SEQUENCIA: StatusDocumento[] = ["rascunho", "em-revisao", "aprovado", "implementado"];

export function DocumentoScreen({
  documento,
  diagramaHtml,
  escrito,
  status,
  onMudarEscrito,
  onMudarStatus,
  desatualizado,
  onBaixarMarkdown,
  onBaixarHtml,
  onVoltar,
}: DocumentoScreenProps) {
  const { violacoes, aceitas, violacoesDePercurso, naoMedidos, percursos } = documento.conferencias;
  const temConferencia =
    violacoes.length + aceitas.length + violacoesDePercurso.length + naoMedidos.length + percursos.length > 0;

  return (
    <div data-testid="documento-screen" style={fundoEstilo}>
      <header style={barraEstilo}>
        <button onClick={onVoltar} style={linkEstilo}>
          ← Voltar à mesa de projeto
        </button>
        <div style={{ flex: 1 }} />
        <CicloDeStatus status={status} onMudar={onMudarStatus} desatualizado={desatualizado} />
        <button onClick={onBaixarHtml} style={botaoEstilo} data-testid="baixar-html">
          ⬇ HTML
        </button>
        <button onClick={onBaixarMarkdown} style={botaoEstilo} data-testid="baixar-markdown">
          ⬇ Markdown
        </button>
      </header>

      <article style={folhaEstilo}>
        <div style={colunaDeTextoEstilo}>
          <h1 style={{ fontSize: 28, lineHeight: 1.25, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            {documento.titulo}
          </h1>

          {documento.saude.length > 0 && (
            <div data-testid="faixa-de-saude" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 4px" }}>
            {documento.saude.map((i) => (
              <span key={i.icone} style={chipEstilo(i.nivel)}>
                <span style={{ fontSize: 13 }}>{i.icone}</span> {i.rotulo}
                </span>
              ))}
            </div>
          )}
        </div>

        {documento.contexto.trim() && (
          <Secao titulo="Contexto">
            <Paragrafos texto={documento.contexto} />
          </Secao>
        )}

        {documento.necessidades.length > 0 && (
          <Secao titulo="O que precisa ser verdade">
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {documento.necessidades.map((n) => (
                <li
                  key={n.texto}
                  style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--borda)" }}
                >
                  <span style={{ flex: "none", width: "1.2em", color: n.atendida ? "var(--verde)" : "var(--amarelo)" }}>
                    {n.atendida ? "✓" : "○"}
                  </span>
                  <span style={{ fontSize: 14 }}>
                    {n.texto}
                    {!n.atendida && (
                      <em style={{ color: "var(--texto-fraco)" }}> (ainda sem componente que responda)</em>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        )}

        {/* §256 — a faixa do DESENHO, e por que ela não é uma `<Secao>`.
            O §254 fez o diagrama escapar da coluna de leitura (46rem é a régua
            do texto, e nela o desenho quebrava). Mas escapou sozinho: o título
            "O desenho" continuou na coluna, ~280px à direita do que ele rotula,
            e o resultado parecia um bloco que caiu fora da folha.
            Título e conteúdo saem JUNTOS, compartilhando a mesma borda
            esquerda — aí a largura maior lê como figura deliberada, não como
            desalinhamento. */}
        <section style={faixaDoDesenhoEstilo}>
          <h2 style={{ ...tituloSecaoEstilo, marginTop: 0 }}>O desenho</h2>
          {diagramaHtml ? (
            // iframe + srcDoc: reusa o gerador animado que já existe (SPEC-21)
            // sem dependência nova e sem o CSS do app vazar para dentro dele.
            <iframe
              data-testid="documento-diagrama"
              title="Diagrama da solução"
              srcDoc={diagramaHtml}
              style={{
                width: "100%",
                height: 560,
                border: "1px solid var(--borda)",
                borderRadius: 12,
                background: "var(--painel)",
              }}
            />
          ) : (
            <Vazio texto="Sem diagrama nesta demanda ainda." />
          )}
        </section>

        <Secao titulo="Decisões">
          {documento.decisoes.length > 0 ? (
            documento.decisoes.map((d) => <CartaoDecisao key={d.id} decisao={d} />)
          ) : (
            // O texto importa: demanda sem decisão arquitetural não é demanda
            // incompleta. É o que a SPEC-58 existe para deixar de tratar como
            // órfã.
            <Vazio texto="Nenhuma decisão entre alternativas nesta demanda — o que é resposta legítima: nem toda mudança move arquitetura." />
          )}
        </Secao>

        {temConferencia && (
          <Secao titulo="O que foi conferido">
            {violacoes.map((v) => (
              <div key={`${v.noId}-${v.campo}`} data-testid="documento-violacao" style={cartaoEstilo("var(--amarelo)")}>
                <strong style={{ fontSize: 14 }}>{v.noLabel}</strong> · {v.campo} {v.esperado} — está {v.atual}
                <div style={metaEstilo}>{v.texto}</div>
                {v.porque && <p style={{ ...miudoEstilo, margin: "6px 0 0" }}>{v.porque}</p>}
              </div>
            ))}
            {aceitas.map((v) => (
              <div key={`ac-${v.noId}-${v.campo}`} style={cartaoEstilo()}>
                <strong style={{ fontSize: 14 }}>{v.noLabel}</strong> · {v.campo} — contrariado de propósito:{" "}
                {v.excecao?.motivo}
                <div style={metaEstilo}>{v.excecao?.autor}</div>
              </div>
            ))}
            {violacoesDePercurso.map((v) => (
              <div key={`p-${v.percursoId}-${v.texto}`} style={cartaoEstilo("var(--amarelo)")}>
                <strong style={{ fontSize: 14 }}>{v.rotulo}</strong> — {v.texto}: esperado {v.esperado}, está {v.atual}
                {v.porque && <p style={{ ...miudoEstilo, margin: "6px 0 0" }}>{v.porque}</p>}
              </div>
            ))}
            {naoMedidos.map((n) => (
              <div key={`nm-${n.percursoId}-${n.campo}`} style={cartaoEstilo()}>
                <strong style={{ fontSize: 14 }}>{n.rotulo}</strong> — não dá para medir "{n.texto}": falta {n.campo} em{" "}
                {n.nosSemValor.join(", ")}
              </div>
            ))}
            {percursos.length > 0 && (
              <p style={metaEstilo}>Caminhos conferidos: {percursos.map((p) => p.rotulo).join(" · ")}</p>
            )}
          </Secao>
        )}

        <SecaoEscrita
          titulo="Trade-offs e o que ficou de fora"
          dica="O que se ganhou e o que se perdeu. É a seção que dá casa à mudança que não tem ADR."
          valor={escrito.tradeOffs ?? ""}
          testid="secao-tradeoffs"
          onMudar={(texto) => onMudarEscrito({ ...escrito, tradeOffs: texto })}
        />
        <SecaoEscrita
          titulo="Riscos e o que pode dar errado"
          dica="O que você está aceitando correr, e o que faria isso virar problema."
          valor={escrito.riscos ?? ""}
          testid="secao-riscos"
          onMudar={(texto) => onMudarEscrito({ ...escrito, riscos: texto })}
        />

        <Secao titulo="Os itens">
          {documento.itens.length > 0 ? (
            documento.itens.map((i) => <CartaoItem key={i.chave} item={i} />)
          ) : (
            <Vazio texto="Nenhum item derivado ainda — derive a quebra na mesa de projeto." />
          )}
        </Secao>
      </article>
    </div>
  );
}

/**
 * SPEC-58 §5 — o ciclo. Não bloqueia nada: avisa. Exigir aprovação para
 * derivar transformaria a mesa num portão burocrático, e o primeiro atraso
 * ensinaria o time a aprovar sem ler.
 */
function CicloDeStatus({
  status,
  onMudar,
  desatualizado,
}: {
  status: StatusDocumento | null;
  onMudar: (s: StatusDocumento) => void;
  desatualizado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = status ?? "rascunho";

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      {desatualizado && (
        <span data-testid="documento-desatualizado" style={{ fontSize: 11, color: "var(--amarelo)" }}>
          o desenho mudou depois da aprovação
        </span>
      )}
      <button data-testid="status-documento" onClick={() => setAberto((a) => !a)} style={seloStatusEstilo(atual)}>
        {ROTULO_STATUS[atual]}
      </button>
      {aberto && (
        <div data-testid="status-opcoes" style={popoverEstilo}>
          {SEQUENCIA.map((s) => (
            <button
              key={s}
              data-testid={`status-${s}`}
              onClick={() => {
                onMudar(s);
                setAberto(false);
              }}
              style={{ ...linkEstilo, display: "block", padding: "5px 4px", fontWeight: s === atual ? 700 : 500 }}
            >
              {ROTULO_STATUS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={colunaDeTextoEstilo}>
      <h2 style={tituloSecaoEstilo}>{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * A seção escrita por gente, visualmente distinta da gerada — proveniência
 * aplicada ao documento inteiro (SPEC-58 §7.2). Edita no lugar: mandar a pessoa
 * para outra tela para escrever duas frases é como a seção fica vazia para
 * sempre.
 */
function SecaoEscrita({
  titulo,
  dica,
  valor,
  testid,
  onMudar,
}: {
  titulo: string;
  dica: string;
  valor: string;
  testid: string;
  onMudar: (texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <section data-testid={testid} style={colunaDeTextoEstilo}>
      <h2 style={tituloSecaoEstilo}>{titulo}</h2>
      <div style={{ borderLeft: "3px solid #4f46e5", padding: "2px 0 2px 16px", margin: "12px 0" }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#a5b4fc" }}>
          escrito por uma pessoa
        </span>
        {editando ? (
          <textarea
            autoFocus
            aria-label={titulo}
            value={valor}
            onChange={(e) => onMudar(e.target.value)}
            onBlur={() => setEditando(false)}
            rows={5}
            style={textareaEstilo}
          />
        ) : valor.trim() ? (
          <div onClick={() => setEditando(true)} style={{ cursor: "text" }}>
            <Paragrafos texto={valor} />
          </div>
        ) : (
          <button onClick={() => setEditando(true)} style={{ ...linkEstilo, display: "block", margin: "6px 0 0" }}>
            ＋ {dica}
          </button>
        )}
      </div>
    </section>
  );
}

function CartaoDecisao({ decisao }: { decisao: Decisao }) {
  const descartadas = decisao.alternativas.filter((a) => a.titulo !== decisao.escolhida);
  return (
    <article data-testid="documento-decisao" style={cartaoEstilo()}>
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{decisao.titulo}</h3>
      {decisao.contexto && <p style={{ ...miudoEstilo, fontStyle: "italic", margin: "0 0 6px" }}>{decisao.contexto}</p>}
      <p style={{ fontSize: 14, margin: 0 }}>
        <strong>{decisao.escolhida}</strong>
        {decisao.porque.trim() ? ` — ${decisao.porque}` : ""}
      </p>
      {descartadas.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, ...miudoEstilo }}>
          {descartadas.map((a) => (
            <li key={a.titulo}>
              <s>{a.titulo}</s>
              {a.consequencia ? ` — ${a.consequencia}` : ""}
            </li>
          ))}
        </ul>
      )}
      {!decisao.porque.trim() && (
        <p style={{ fontSize: 13, color: "var(--amarelo)", margin: "6px 0 0" }}>
          sem o porquê — quem ler isto daqui a um ano vai refazer a análise
        </p>
      )}
      <p style={metaEstilo}>
        {decisao.autor} · {decisao.em.slice(0, 10)}
      </p>
    </article>
  );
}

function CartaoItem({ item }: { item: ItemDoDocumento }) {
  const citacao = (rotulo: string, valores: string[]) =>
    valores.length > 0 ? (
      <p style={{ fontSize: 12.5, color: "var(--texto-2)", margin: "4px 0 0" }}>
        <span style={{ display: "inline-block", minWidth: "5.5em", color: "var(--texto-mudo)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
          {rotulo}
        </span>
        {valores.join(" · ")}
      </p>
    ) : null;

  return (
    <article data-testid="documento-item" style={cartaoEstilo()}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ flex: "none", fontSize: 12, fontWeight: 700, color: "var(--texto-mudo)" }}>{item.numero}</span>
        <h3 style={{ fontSize: 15, margin: 0 }}>{item.descricao}</h3>
      </div>
      <p style={metaEstilo}>
        {item.tipo} · {item.tamanho}
        {item.techs.length > 0 ? ` · ${item.techs.join(", ")}` : ""}
      </p>
      {citacao("atende", item.necessidades)}
      {citacao("segue", item.decisoes)}
      {citacao("no caminho", item.percursos)}
    </article>
  );
}

/** Parágrafos de texto livre. Não é renderizador de markdown — é o mínimo
 * honesto para o que alguém digitou num textarea. */
function Paragrafos({ texto }: { texto: string }) {
  return (
    <>
      {texto
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} style={{ fontSize: 14, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>
            {p}
          </p>
        ))}
    </>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p style={{ ...miudoEstilo, fontStyle: "italic" }}>{texto}</p>;
}

const fundoEstilo: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 55,
  overflow: "auto",
  background: "var(--fundo, #0b1220)",
  fontFamily: "system-ui, sans-serif",
};

const barraEstilo: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 20px",
  borderBottom: "1px solid var(--borda)",
  background: "var(--painel)",
};

/**
 * §257 — a coluna de LEITURA, dentro da folha.
 *
 * Antes a folha inteira media 46rem e o desenho escapava dela por margem
 * negativa — pintando fora do cartão e cruzando a borda, o que lê como duas
 * camadas sobrepostas. Invertido: a folha é a página, e o TEXTO é que se
 * limita a 46rem, centrado. Nada mais precisa escapar de nada.
 */
const colunaDeTextoEstilo: React.CSSProperties = {
  maxWidth: "46rem",
  marginLeft: "auto",
  marginRight: "auto",
};

const folhaEstilo: React.CSSProperties = {
  // A folha acompanha o que o desenho precisa; a régua de ~72 caracteres
  // continua valendo, mas para o texto (ver `colunaDeTextoEstilo`).
  maxWidth: "min(1100px, calc(100vw - 48px))",
  margin: "28px auto 80px",
  padding: "40px 44px",
  borderRadius: 16,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
  lineHeight: 1.6,
  boxShadow: "0 10px 40px rgba(15,23,42,.20)",
};

/** A faixa larga do desenho: sai da coluna de leitura levando o título junto,
 * e se anuncia como figura (fundo e respiro próprios) em vez de parecer um
 * bloco solto. O teto de 1100px é o que o gerador do diagrama precisa para não
 * empilhar o cabeçalho; abaixo disso ele volta a caber na tela, seja qual for. */
const faixaDoDesenhoEstilo: React.CSSProperties = {
  // §257 — largura da folha, sem margem negativa. Escapar do cartão era o que
  // fazia a faixa pintar por cima da borda dele.
  width: "100%",
  marginTop: 36,
  padding: "18px 20px 20px",
  borderRadius: 16,
  background: "var(--painel-2, rgba(148,163,184,.06))",
  border: "1px solid var(--borda)",
};

const tituloSecaoEstilo: React.CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "var(--texto-fraco)",
  margin: "36px 0 12px",
  paddingBottom: 6,
  borderBottom: "1px solid var(--borda)",
};

function cartaoEstilo(destaque?: string): React.CSSProperties {
  return {
    border: "1px solid var(--borda)",
    borderLeft: destaque ? `3px solid ${destaque}` : "1px solid var(--borda)",
    borderRadius: 12,
    padding: "14px 16px",
    margin: "10px 0",
  };
}

function chipEstilo(nivel: "verde" | "amarelo" | "vermelho"): React.CSSProperties {
  const cor = nivel === "verde" ? "var(--verde)" : nivel === "amarelo" ? "var(--amarelo)" : "var(--vermelho)";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 999,
    border: `1px solid ${cor}`,
    color: cor,
  };
}

function seloStatusEstilo(status: StatusDocumento): React.CSSProperties {
  const cor = status === "aprovado" || status === "implementado" ? "var(--verde)" : "#a5b4fc";
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    padding: "4px 12px",
    borderRadius: 999,
    border: `1px solid ${cor}`,
    background: "transparent",
    color: cor,
    cursor: "pointer",
  };
}

const popoverEstilo: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 70,
  minWidth: 160,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  boxShadow: "0 12px 32px rgba(15,23,42,.35)",
};

const metaEstilo: React.CSSProperties = { color: "var(--texto-mudo)", fontSize: 12, margin: "6px 0 0" };
const miudoEstilo: React.CSSProperties = { color: "var(--texto-fraco)", fontSize: 13 };

const linkEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: 0,
  border: "none",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
  textAlign: "left",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const textareaEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "8px 10px",
  fontSize: 14,
  lineHeight: 1.6,
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel-2, transparent)",
  color: "var(--texto)",
  fontFamily: "inherit",
  resize: "vertical",
};

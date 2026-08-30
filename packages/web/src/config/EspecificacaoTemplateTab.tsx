import { useState } from "react";
import { VARIAVEIS_ESPECIFICACAO, VARIAVEIS_ITEM, problemasDoTemplate, problemasDoTemplateItem } from "@gerador/engine";
import type { EspecificacaoTemplate } from "../api/client";

export interface EspecificacaoTemplateTabProps {
  /** Efetivo pro time ativo — template do time se existir, senão o global. */
  template: EspecificacaoTemplate;
  timeAtivo: string;
  onSalvar: (dados: { timeId?: string; conteudo: string; tipo?: "documento" | "item" }) => Promise<void>;
  /** SPEC-47 — o template do CORPO de cada item (o documento tem o dele). */
  templateItem?: EspecificacaoTemplate | null;
  /** O padrão do engine, mostrado quando o time ainda não personalizou. */
  templateItemPadrao: string;
}

/**
 * Editor do template da especificação de entrega (SPEC-14) — 1 documento por
 * quebra, então 1 template só, global ou específico do time ativo (mesmo
 * padrão de override de `CamposNoTab`/`PerfisTimeTab`). A validação de
 * `{{variavel}}` desconhecida roda no cliente (feedback imediato) e de novo
 * no server (nunca confia só no cliente).
 */
export function EspecificacaoTemplateTab({
  template,
  timeAtivo,
  onSalvar,
  templateItem,
  templateItemPadrao,
}: EspecificacaoTemplateTabProps) {
  // SPEC-47 — dois templates na mesma tela: o do DOCUMENTO (o de sempre) e o
  // do ITEM (o corpo de cada um, com a entrega final no fim). São coisas
  // diferentes e é aqui que a pessoa entende a diferença.
  const [alvo, setAlvo] = useState<"documento" | "item">("documento");
  const [editando, setEditando] = useState(false);
  const [escopo, setEscopo] = useState<"global" | "time">(template.timeId === "__global__" ? "global" : "time");
  const [conteudo, setConteudo] = useState(template.conteudo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** O template em foco: o do documento, ou o do item (com o padrão do
   * engine quando o time ainda não personalizou — sempre há o que ler). */
  const emFoco = alvo === "item" ? templateItem : template;
  const conteudoAtual = emFoco?.conteudo ?? templateItemPadrao;

  function abrirEdicao() {
    setEscopo(emFoco?.timeId && emFoco.timeId !== "__global__" ? "time" : "global");
    setConteudo(conteudoAtual);
    setErro(null);
    setEditando(true);
  }

  function trocarAlvo(novo: "documento" | "item") {
    setAlvo(novo);
    setEditando(false);
  }

  // SPEC-35 — a MESMA função da borda: erros bloqueiam o salvar (variável
  // desconhecida, {{itens}} ausente); avisos dizem o que deixa de sair no
  // documento sem impedir o template enxuto.
  const problemas = alvo === "item" ? problemasDoTemplateItem(conteudo) : problemasDoTemplate(conteudo);

  async function salvar() {
    if (problemas.erros.length > 0) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ conteudo, timeId: escopo === "global" ? undefined : timeAtivo, tipo: alvo });
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }} role="group" aria-label="Qual template editar">
        {(["documento", "item"] as const).map((op) => (
          <button
            key={op}
            onClick={() => trocarAlvo(op)}
            aria-pressed={alvo === op}
            data-testid={`alvo-${op}`}
            style={alvo === op ? abaAtivaEstilo : abaEstilo}
          >
            {op === "documento" ? "Documento da especificação" : "Corpo de cada item"}
          </button>
        ))}
      </div>

      {alvo === "documento" ? (
        <p style={introTextoEstilo}>
          O documento de desenho da quebra (☰ Menu ou "Ver o documento →" na revisão) é um documento só, montado a
          partir deste template. Placeholders válidos:{" "}
          {VARIAVEIS_ESPECIFICACAO.map((v) => (
            <code key={v} style={codigoEstilo}>{`{{${v}}}`}</code>
          ))}
          .
        </p>
      ) : (
        <p style={introTextoEstilo}>
          Cada card da seção <strong>Os itens</strong> do documento de desenho é escrito a partir deste template. É aqui que se muda a ordem das seções, os títulos, e o que fecha o item: a{" "}
          <code style={codigoEstilo}>{"{{entregaFinal}}"}</code> diz o que fica pronto quando ele termina. Seção cujo
          conteúdo estiver vazio some inteira, título junto. Placeholders válidos:{" "}
          {VARIAVEIS_ITEM.map((v) => (
            <code key={v} style={codigoEstilo}>{`{{${v}}}`}</code>
          ))}
          .
        </p>
      )}

      <div style={cardEstilo}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 13, color: "var(--texto)" }}>Template</strong>
          <span
            style={{
              ...tagOrigemEstilo,
              ...(emFoco && emFoco.timeId !== "__global__" ? tagTimeEstilo : tagGlobalEstilo),
            }}
          >
            {emFoco && emFoco.timeId !== "__global__" ? emFoco.timeId : alvo === "item" && !templateItem ? "padrão" : "global"}
          </span>
          <div style={{ flex: 1 }} />
          {!editando && (
            <button onClick={abrirEdicao} style={linkBotaoEstilo}>
              editar
            </button>
          )}
        </div>

        {editando ? (
          <div style={{ marginTop: 10 }}>
            <label style={labelFormEstilo}>Escopo</label>
            <select
              aria-label="Escopo"
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as "global" | "time")}
              style={inputFormEstilo}
            >
              <option value="time">Só o time ativo ({timeAtivo})</option>
              <option value="global">Global (todo mundo)</option>
            </select>

            <label style={labelFormEstilo}>Conteúdo</label>
            <textarea
              aria-label="Conteúdo do template"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={16}
              style={textareaFormEstilo}
            />

            {problemas.erros.length > 0 && (
              <div style={erroEstilo} data-testid="template-erros">
                <strong>Não dá pra salvar assim:</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {problemas.erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {problemas.avisos.length > 0 && (
              <div style={avisoEstilo} data-testid="template-avisos">
                {problemas.avisos.map((a) => (
                  <div key={a}>{a}</div>
                ))}
              </div>
            )}
            {erro && <p style={erroEstilo}>{erro}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => void salvar()}
                disabled={salvando || problemas.erros.length > 0}
                style={{
                  ...botaoSalvarEstilo,
                  opacity: problemas.erros.length > 0 ? 0.5 : 1,
                  cursor: problemas.erros.length > 0 ? "not-allowed" : "pointer",
                }}
              >
                Salvar
              </button>
              <button onClick={() => setEditando(false)} style={botaoCancelarEstilo}>
                cancelar
              </button>
            </div>
          </div>
        ) : (
          <pre style={preEstilo}>{conteudoAtual}</pre>
        )}
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  marginTop: 0,
  maxWidth: 680,
};

const codigoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  background: "var(--painel-alto)",
  padding: "1px 5px",
  borderRadius: 4,
  marginRight: 4,
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  background: "var(--painel)",
  maxWidth: 680,
};

const preEstilo: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 11.5,
  color: "var(--texto-2)",
  background: "var(--painel)",
  borderRadius: 8,
  padding: 10,
  marginTop: 8,
  maxHeight: 320,
  overflow: "auto",
};

const tagOrigemEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 999,
  flexShrink: 0,
};

const tagGlobalEstilo: React.CSSProperties = { background: "rgba(99, 102, 241, 0.16)", color: "var(--acento-gente-texto)" };
const tagTimeEstilo: React.CSSProperties = { background: "rgba(62, 207, 142, 0.16)", color: "var(--verde)" };

const labelFormEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--texto-2)",
  marginTop: 8,
  display: "block",
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 320,
};

const textareaFormEstilo: React.CSSProperties = {
  ...inputFormEstilo,
  maxWidth: "100%",
  fontFamily: "monospace",
  fontSize: 12,
  resize: "vertical",
};

const erroEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--vermelho)",
  marginTop: 8,
  marginBottom: 0,
};

const avisoEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--amarelo)",
  marginTop: 8,
  lineHeight: 1.6,
};

const botaoSalvarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
};

const botaoCancelarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "var(--acento-gente-texto)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};

const abaEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const abaAtivaEstilo: React.CSSProperties = {
  ...abaEstilo,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
};

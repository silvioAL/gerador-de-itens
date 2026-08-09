import { useEffect, useState } from "react";
import { apiPromptUnicoTemplate } from "../api/client";

/**
 * SPEC-25 §5.5 / Fase 2.1 — editor do template do prompt único.
 *
 * No protótipo legado (`gerador_de_itens-2.html`) o template era um arquivo
 * que a pessoa subia a cada sessão, e uma variável errada só aparecia como
 * `{{tipoErrado}}` cru no meio do prompt já colado no chat da empresa. Aqui
 * ele é config do projeto e o Salvar VALIDA — o erro aparece na edição, que é
 * onde dá pra corrigir.
 */
export function PromptUnicoTab() {
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [variaveis, setVariaveis] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    apiPromptUnicoTemplate
      .obter()
      .then((r) => {
        if (cancelado) return;
        setConteudo(r.conteudo);
        setVariaveis(r.variaveis);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function salvar() {
    if (conteudo === null) return;
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      await apiPromptUnicoTemplate.salvar(conteudo);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={introEstilo}>
        O prompt que a ferramenta monta pra você colar no chat que já usa. Não depende de IA conectada. Os requisitos
        técnicos e ciclos de teste entram já derivados das suas regras — o modelo não precisa acertá-los.
      </p>

      <p style={{ fontSize: 11.5, color: "var(--texto-fraco)", marginBottom: 8 }}>
        Variáveis disponíveis:{" "}
        {variaveis.map((v) => (
          <code key={v} style={codeEstilo}>{`{{${v}}}`}</code>
        ))}
      </p>

      {conteudo === null ? (
        !erro && <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>
      ) : (
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          rows={22}
          aria-label="Template do prompt único"
          style={campoEstilo}
        />
      )}

      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button onClick={() => void salvar()} disabled={conteudo === null || salvando} style={botaoEstilo}>
          {salvando ? "salvando…" : "Salvar template"}
        </button>
        {salvo && <span style={{ fontSize: 12, color: "var(--verde)" }}>✓ salvo</span>}
      </div>
    </div>
  );
}

const introEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  marginTop: 0,
  maxWidth: 680,
};

const codeEstilo: React.CSSProperties = {
  background: "var(--painel-alto, #15202D)",
  borderRadius: 4,
  padding: "1px 5px",
  marginRight: 5,
  fontSize: 11,
};

const campoEstilo: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto)",
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  lineHeight: 1.5,
  resize: "vertical",
};

const botaoEstilo: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
};

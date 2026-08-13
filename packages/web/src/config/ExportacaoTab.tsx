import { useEffect, useState } from "react";
import { apiExportador, type ConfigExportador } from "../api/client";

/**
 * SPEC-49 — para onde os itens escritos vão.
 *
 * O gerador não implementa Jira: implementar um tracker seria escolher o
 * tracker de todo mundo. Aqui se configura o ENDEREÇO de um agente (bridge
 * de MCP, n8n, função interna) que sabe criar issue no tracker da casa — a
 * mesma disciplina do gateway de IA, que também é só um endereço.
 */
export function ExportacaoTab() {
  const [config, setConfig] = useState<ConfigExportador | null>(null);
  const [cabecalhosTexto, setCabecalhosTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    apiExportador
      .obter()
      .then((c) => {
        setConfig(c);
        setCabecalhosTexto(
          Object.entries(c.cabecalhos ?? {})
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        );
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  if (erro && !config) return <p style={{ fontSize: 12.5, color: "var(--vermelho)" }}>{erro}</p>;
  if (!config) return <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>;

  /** "Chave: valor" por linha — mesmo formato de cabeçalho que quem cuida de
   * integração já lê em qualquer cliente HTTP. */
  function cabecalhosDoTexto(): Record<string, string> {
    const pares: Record<string, string> = {};
    for (const linha of cabecalhosTexto.split("\n")) {
      const i = linha.indexOf(":");
      if (i <= 0) continue;
      const chave = linha.slice(0, i).trim();
      const valor = linha.slice(i + 1).trim();
      if (chave && valor) pares[chave] = valor;
    }
    return pares;
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      await apiExportador.salvar({ ...config!, cabecalhos: cabecalhosDoTexto() });
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div data-testid="config-exportacao">
      <p style={proseEstilo}>
        Os itens prontos da tela <strong>Itens escritos</strong> são enviados para um <strong>agente</strong> que fala
        com o seu tracker (MCP, n8n, uma função interna — o que a empresa já tiver). O gerador não implementa Jira:
        implementar um tracker seria escolher o tracker de todo mundo.
      </p>
      <p style={{ ...proseEstilo, color: "var(--texto-fraco)" }}>
        O agente recebe <code style={codigoEstilo}>{"{ itens: [{ chave, titulo, tipo, tamanho, dependencias, corpoMarkdown }] }"}</code>{" "}
        e responde <code style={codigoEstilo}>{"{ resultados: [{ chave, linkExterno } | { chave, erro }] }"}</code>. Falha
        por item é esperada e some na tela como motivo — nunca tudo-ou-nada.
      </p>

      <label style={labelEstilo}>Endereço do agente</label>
      <input
        aria-label="Endereço do agente"
        value={config.endpoint}
        onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
        placeholder="https://agente.empresa/exportar-itens"
        style={inputEstilo}
      />
      <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
        Vazio desliga a exportação — a tela dos itens diz isso em vez de oferecer um botão que falharia.
      </p>

      <label style={labelEstilo}>Como chamar o destino (aparece na tela)</label>
      <input
        aria-label="Rótulo do destino"
        value={config.rotulo}
        onChange={(e) => setConfig({ ...config, rotulo: e.target.value })}
        placeholder="ex.: Jira do time de pagamentos"
        style={inputEstilo}
      />

      <label style={labelEstilo}>Cabeçalhos (um por linha, “Chave: valor”)</label>
      <textarea
        aria-label="Cabeçalhos"
        value={cabecalhosTexto}
        onChange={(e) => setCabecalhosTexto(e.target.value)}
        rows={3}
        placeholder={"Authorization: Bearer ..."}
        style={{ ...inputEstilo, resize: "vertical", fontFamily: "ui-monospace, monospace" }}
      />

      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 8 }}>{erro}</p>}
      {salvo && !erro && <p style={{ fontSize: 12, color: "var(--verde, #3ecf8e)", marginTop: 8 }}>Destino salvo.</p>}

      <button onClick={() => void salvar()} disabled={salvando} style={botaoPrimarioEstilo} data-testid="salvar-exportacao">
        {salvando ? "salvando…" : "Salvar destino"}
      </button>
    </div>
  );
}

const proseEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  maxWidth: 760,
  margin: "0 0 10px",
};

const codigoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  padding: "1px 5px",
  borderRadius: 4,
  background: "var(--painel-alto)",
  fontFamily: "ui-monospace, monospace",
};

const labelEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--texto-fraco)",
  margin: "12px 0 2px",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  boxSizing: "border-box",
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
  marginTop: 12,
};

import { useEffect, useState } from "react";
import { apiExportador, type ConfigExportador } from "../api/client";
import { MarcaDeDemonstracao } from "../demo/dadosDoTour";

/**
 * SPEC-49 — para onde os itens escritos vão.
 *
 * O gerador não implementa Jira: implementar um tracker seria escolher o
 * tracker de todo mundo. Aqui se configura o ENDEREÇO de um agente (bridge
 * de MCP, n8n, função interna) que sabe criar issue no tracker da casa — a
 * mesma disciplina do gateway de IA, que também é só um endereço.
 */
export interface ExportacaoTabProps {
  /** §235 — dado EXCLUSIVO do tour: substitui o fetch e desliga o salvar. Uma
   * instalação nova tem esta tela vazia, e um passo que promete conteúdo sobre
   * tela vazia é a mentira que o §234 custou caro. Semear via API seria pior:
   * o tour passaria a ESCREVER na configuração de quem só quis ver. */
  demonstracao?: ConfigExportador;
}

export function ExportacaoTab({ demonstracao }: ExportacaoTabProps = {}) {
  const [config, setConfig] = useState<ConfigExportador | null>(demonstracao ?? null);
  const [cabecalhosTexto, setCabecalhosTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  // §281 — a resposta que chega depois da tela sair não escreve nada (ver
  // `useMontado`).
  useEffect(() => {
    // Em demonstração não se busca nem se grava nada.
    if (demonstracao) return;
    let cancelado = false;
    apiExportador
      .obter()
      .then((c) => {
        if (cancelado) return;
        setConfig(c);
        setCabecalhosTexto(
          Object.entries(c.cabecalhos ?? {})
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        );
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, [demonstracao]);

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
    // Demonstração NÃO escreve. Sem esta linha o tour gravaria o endpoint de
    // exemplo na configuração real de quem só quis ver a ferramenta.
    if (demonstracao) return;
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
      {demonstracao && <MarcaDeDemonstracao />}
      <p style={proseEstilo}>
        Os itens prontos da seção <strong>Os itens</strong> do documento são enviados para um <strong>agente</strong> que fala
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
        Vazio desliga a exportação — a seção dos itens diz isso em vez de oferecer um botão que falharia.
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

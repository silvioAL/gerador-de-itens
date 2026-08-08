import { useState } from "react";
import {
  importarGrafo,
  type GraphifyGraph,
  type GraphifyMappingConfig,
  type No,
  type ResultadoImportacao,
} from "@gerador/engine";

export interface ImportarGraphifyProps {
  onImportar: (nodes: No[]) => void;
}

type Estado =
  | { tipo: "ocioso" }
  | { tipo: "processando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "resultado"; resultado: ResultadoImportacao };

/** `File.text()` não é confiável em todo ambiente (jsdom nos testes, por
 * exemplo) — FileReader é a API mais antiga e amplamente suportada. */
function lerArquivoComoTexto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler o arquivo."));
    leitor.readAsText(arquivo);
  });
}

/**
 * Import do graph.json que o Graphify já produziu (ver MVP5, SPEC-06 §5) —
 * leitura de arquivo pra arquivo, pura, no browser: nunca chama o Graphify,
 * nunca inventa aresta (o grafo dele descreve estrutura de código, não
 * arquitetura), e arquivo sem regra em config/graphify-mapping.json fica
 * listado, nunca vira nó com tipo chutado.
 */
export function ImportarGraphify({ onImportar }: ImportarGraphifyProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" });
  const [adicionado, setAdicionado] = useState(false);

  async function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setEstado({ tipo: "processando" });
    setAdicionado(false);
    try {
      const grafo = JSON.parse(await lerArquivoComoTexto(arquivo)) as GraphifyGraph;
      const respostaMapeamento = await fetch("/config/graphify-mapping.json");
      if (!respostaMapeamento.ok) {
        setEstado({
          tipo: "erro",
          mensagem:
            'config/graphify-mapping.json não encontrado — rode "gerador init" ou crie um mapeamento de padrão de arquivo para tipo de nó antes de importar.',
        });
        return;
      }
      const mapeamento = (await respostaMapeamento.json()) as GraphifyMappingConfig;
      const resultado = importarGrafo(grafo, mapeamento);
      setEstado({ tipo: "resultado", resultado });
    } catch (erro) {
      setEstado({ tipo: "erro", mensagem: erro instanceof Error ? erro.message : String(erro) });
    }
  }

  function adicionar() {
    if (estado.tipo !== "resultado") return;
    onImportar(estado.resultado.nodes);
    setAdicionado(true);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.5, marginTop: 0 }}>
        Já rodou <code>/graphify .</code> no seu projeto? Selecione o <code>graph.json</code> gerado — os arquivos
        mapeados em <code>config/graphify-mapping.json</code> viram nós <strong>existente</strong>/
        <strong>extraído</strong> no canvas. Nenhuma aresta é inferida (o grafo do Graphify descreve estrutura de
        código, não arquitetura) — e arquivos sem regra de mapeamento aparecem listados, nunca com tipo adivinhado.
      </p>

      <label style={botaoEscolherEstilo}>
        Escolher graph.json
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => void aoSelecionarArquivo(e)}
          style={{ display: "none" }}
        />
      </label>

      {estado.tipo === "processando" && <p style={{ fontSize: 12, color: "var(--texto-fraco)", marginTop: 10 }}>Lendo…</p>}

      {estado.tipo === "erro" && (
        <div style={avisoEstilo}>
          <strong style={{ fontSize: 12 }}>Não deu pra importar</strong>
          <p style={{ fontSize: 12, margin: "4px 0 0" }}>{estado.mensagem}</p>
        </div>
      )}

      {estado.tipo === "resultado" && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13, color: "var(--texto)" }}>
            <strong>{estado.resultado.nodes.length}</strong> nó(s) existente(s)/extraído(s) encontrado(s).
          </p>
          {estado.resultado.naoMapeados.length > 0 && (
            <details style={{ fontSize: 12, color: "var(--texto-fraco)", marginTop: 6 }}>
              <summary style={{ cursor: "pointer" }}>
                {estado.resultado.naoMapeados.length} arquivo(s) sem regra de mapeamento (não viraram nó)
              </summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 160, overflow: "auto" }}>
                {estado.resultado.naoMapeados.slice(0, 30).map((arquivo) => (
                  <li key={arquivo}>{arquivo}</li>
                ))}
              </ul>
            </details>
          )}
          <button
            onClick={adicionar}
            disabled={estado.resultado.nodes.length === 0}
            style={{ ...botaoAdicionarEstilo, marginTop: 12 }}
          >
            {adicionado ? "✓ Adicionado" : "+ Adicionar ao canvas"}
          </button>
          <p style={{ fontSize: 11, color: "var(--texto-mudo)", marginTop: 8 }}>
            Revise antes de derivar — nada aqui deveria virar prontidão verde sem alguém olhar.
          </p>
        </div>
      )}
    </div>
  );
}

const botaoEscolherEstilo: React.CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "var(--painel)",
  color: "#a5b4fc",
  cursor: "pointer",
};

const avisoEstilo: React.CSSProperties = {
  background: "#3a1d1d",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "10px 12px",
  marginTop: 12,
  color: "#7f1d1d",
};

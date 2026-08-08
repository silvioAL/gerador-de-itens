import { useState } from "react";

export interface AnexoContexto {
  nome: string;
  conteudo: string;
}

export interface ContextoEpicoPanelProps {
  demandInfo?: string;
  anexosContexto?: AnexoContexto[];
  onSalvar: (demandInfo: string, anexosContexto: AnexoContexto[]) => void;
  onFechar: () => void;
}

/** `File.text()` não é confiável em todo ambiente (jsdom nos testes) — FileReader
 * é a API mais antiga e amplamente suportada (mesmo padrão de `ImportarGraphify.tsx`). */
function lerArquivoComoTexto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler o arquivo."));
    leitor.readAsText(arquivo);
  });
}

/**
 * Painel pra colar/anexar o contexto do épico (estado atual da história de
 * usuário, material da demanda) ANTES de trabalhar os itens — achado real do
 * usuário: `Quebra.demandInfo` já existia no modelo, mas nunca teve UI de
 * edição em lugar nenhum, e só alimentava a seção "Contexto" do documento
 * exportado, nunca a sugestão real de IA (Fase 1b, SPEC-23). Este painel
 * alimenta os dois: o documento final e o prompt de `/ia/sugerir` na aba
 * Refinamento.
 */
export function ContextoEpicoPanel({ demandInfo, anexosContexto, onSalvar, onFechar }: ContextoEpicoPanelProps) {
  const [texto, setTexto] = useState(demandInfo ?? "");
  const [anexos, setAnexos] = useState<AnexoContexto[]>(anexosContexto ?? []);
  const [erro, setErro] = useState<string | null>(null);

  async function aoSelecionarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (arquivos.length === 0) return;
    setErro(null);
    try {
      const novos = await Promise.all(
        arquivos.map(async (arquivo) => ({ nome: arquivo.name, conteudo: await lerArquivoComoTexto(arquivo) }))
      );
      setAnexos((atual) => [...atual, ...novos]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o(s) arquivo(s).");
    }
  }

  function removerAnexo(nome: string) {
    setAnexos((atual) => atual.filter((a) => a.nome !== nome));
  }

  function salvar() {
    onSalvar(texto, anexos);
    onFechar();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-label="Contexto do épico"
        style={{
          background: "#ffffff",
          borderRadius: 16,
          width: "min(640px, 100%)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.35)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>📎 Contexto do épico</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Cole o estado atual da história/épico e anexe material de apoio (texto) — alimenta a seção "Contexto" do
            documento exportado e a sugestão de IA real na aba Refinamento.
          </div>
        </header>

        <div style={{ padding: 24, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <textarea
            aria-label="Contexto do épico (texto)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: história de usuário atual, decisões já tomadas, restrições conhecidas..."
            rows={8}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />

          <div>
            <label
              style={{
                display: "inline-block",
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              + Anexar arquivo(s) de texto
              <input
                type="file"
                multiple
                accept=".txt,.md,.json,text/plain,text/markdown"
                onChange={(e) => void aoSelecionarArquivos(e)}
                style={{ display: "none" }}
              />
            </label>

            {erro && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{erro}</p>}

            {anexos.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
                {anexos.map((a) => (
                  <li
                    key={a.nome}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      background: "#f1f5f9",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    <span style={{ flex: 1 }}>{a.nome}</span>
                    <button
                      onClick={() => removerAnexo(a.nome)}
                      aria-label={`Remover anexo ${a.nome}`}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontSize: 13 }}
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onFechar}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 12, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 12, cursor: "pointer" }}
          >
            Salvar
          </button>
        </footer>
      </div>
    </div>
  );
}

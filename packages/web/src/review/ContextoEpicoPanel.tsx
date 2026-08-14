import { useState } from "react";

export interface AnexoContexto {
  nome: string;
  conteudo: string;
}

export interface ContextoEpicoPanelProps {
  demandInfo?: string;
  anexosContexto?: AnexoContexto[];
  /** SPEC-53 — de que produto é esta demanda (null = nenhum). */
  produtoId?: string | null;
  /** Os produtos que o time enxerga; vazio = ninguém cadastrou ainda, e aí o
   * seletor some em vez de oferecer uma lista vazia. */
  produtos?: { id: string; nome: string }[];
  onSalvar: (demandInfo: string, anexosContexto: AnexoContexto[], produtoId: string | null) => void;
  onFechar: () => void;
}

/** `File.text()` não é confiável em todo ambiente (jsdom nos testes) — FileReader
 * é a API mais antiga e amplamente suportada. */
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
 *
 * Desde o #298 não é mais um modal com backdrop próprio: é uma aba do
 * `AssistenteFlutuante`, que é quem posiciona, abre e fecha a janela.
 */
export function ContextoEpicoPanel({
  demandInfo,
  anexosContexto,
  produtoId,
  produtos = [],
  onSalvar,
  onFechar,
}: ContextoEpicoPanelProps) {
  const [texto, setTexto] = useState(demandInfo ?? "");
  const [anexos, setAnexos] = useState<AnexoContexto[]>(anexosContexto ?? []);
  const [produto, setProduto] = useState<string>(produtoId ?? "");
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
    onSalvar(texto, anexos, produto || null);
    onFechar();
  }

  return (
    <div
      aria-label="Contexto do épico"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, padding: "14px 16px", overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--texto-fraco)" }}>
          Cole o estado atual da história/épico e anexe material de apoio (texto) — alimenta a seção "Contexto" do
          documento exportado e a sugestão de IA real na aba Refinamento.
        </p>

        {/* SPEC-53 — o produto é o contexto que NÃO se recola a cada demanda:
            fica cadastrado uma vez e viaja junto com todas. O seletor mora aqui,
            e não no header, porque é a mesma pergunta do resto do painel ("de
            que estamos falando"), só que respondida uma vez por produto. */}
        {produtos.length > 0 && (
          <div>
            <label htmlFor="contexto-produto" style={{ display: "block", fontSize: 11, color: "var(--texto-fraco)", marginBottom: 2 }}>
              Produto desta demanda
            </label>
            <select
              id="contexto-produto"
              aria-label="Produto desta demanda"
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid var(--borda-forte)",
                background: "var(--fundo)",
                color: "var(--texto)",
                fontSize: 13,
              }}
            >
              <option value="">— nenhum —</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--texto-mudo)" }}>
              O contexto do produto (objetivo, glossário, regras que valem sempre) vai junto com esta demanda — sem
              precisar recolar nada.
            </p>
          </div>
        )}
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
              border: "1px solid var(--borda-forte)",
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
                border: "1px solid var(--borda-forte)",
                background: "var(--painel)",
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

            {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 8 }}>{erro}</p>}

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
                      background: "var(--painel-alto)",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    <span style={{ flex: 1 }}>{a.nome}</span>
                    <button
                      onClick={() => removerAnexo(a.nome)}
                      aria-label={`Remover anexo ${a.nome}`}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--vermelho)", fontSize: 13 }}
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      <footer style={{ padding: "12px 16px", borderTop: "1px solid var(--borda)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onFechar}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--borda-forte)", background: "var(--painel)", fontSize: 12, cursor: "pointer" }}
        >
          Cancelar
        </button>
        <button
          onClick={salvar}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--acento-indigo)", color: "#fff", fontSize: 12, cursor: "pointer" }}
        >
          Salvar
        </button>
      </footer>
    </div>
  );
}

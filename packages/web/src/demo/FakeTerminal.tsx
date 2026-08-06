interface LinhaTerminal {
  comando: string;
  saida: string;
}

const COMANDOS: LinhaTerminal[] = [
  {
    comando: "npm install -g gerador-de-itens",
    saida: "added 1 package in 1s",
  },
  {
    comando: "gerador init",
    saida:
      "+ config/app.json criado.\n+ config/diagrama.json criado.\n+ config/regras.json criado.\n+ config/perfis-time.json criado.\n+ config/graphify-mapping.json criado.\n+ config/referencias/importador-graphify.json criado.\n+ config/referencias/criterios-de-aceite-por-tipo-de-no.json criado.",
  },
  {
    comando: "gerador derive quebra.json --out backlog.md",
    saida: "Backlog gravado em backlog.md (4 atividades).",
  },
  {
    comando: "gerador implementar quebra.json --out especificacao.md",
    saida: "Especificação de entrega gravada em especificacao.md (4 itens).",
  },
  {
    comando: "gerador export-vault --dir graphify-out/obsidian --abrir",
    saida: "Vault atualizado em graphify-out/obsidian: 2 referência(s) em referencias/, 14 padrão(ões) em patterns/.\nAbrir no Obsidian: obsidian://open?vault=obsidian&file=referencias%2Fimportador-graphify",
  },
  {
    comando: "gerador open --port 4321",
    saida: "Gerador de Itens em http://localhost:4321",
  },
];

/** Terminal simulado — texto fixo, não digitação animada. Objetivo é mostrar
 * a forma dos comandos e da saída real, não uma demonstração ao vivo. */
export function FakeTerminal() {
  return (
    <div style={janelaEstilo}>
      <div style={barraEstilo}>
        <span style={{ ...bolinhaEstilo, background: "#ef4444" }} />
        <span style={{ ...bolinhaEstilo, background: "#f59e0b" }} />
        <span style={{ ...bolinhaEstilo, background: "#22c55e" }} />
        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>terminal</span>
      </div>
      <div style={corpoEstilo}>
        {COMANDOS.map((linha) => (
          <div key={linha.comando} style={{ marginBottom: 14 }}>
            <div>
              <span style={{ color: "#4ade80" }}>$</span> <span style={{ color: "#e2e8f0" }}>{linha.comando}</span>
            </div>
            <pre style={saidaEstilo}>{linha.saida}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

const janelaEstilo: React.CSSProperties = {
  borderRadius: 10,
  overflow: "hidden",
  background: "#0f172a",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.25)",
};

const barraEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  background: "#1e293b",
};

const bolinhaEstilo: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: "50%",
};

const corpoEstilo: React.CSSProperties = {
  padding: "14px 16px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12.5,
};

const saidaEstilo: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#94a3b8",
  whiteSpace: "pre-wrap",
};

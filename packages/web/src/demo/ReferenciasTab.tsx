import { useState } from "react";
import type { Referencia } from "../api/client";

export interface ReferenciasTabProps {
  referencias: Referencia[];
  onCriar: (dados: { titulo: string; racional: string; designPatterns: string[]; codigoRelacionado: string[] }) => Promise<void>;
  onAtualizarLinkExterno: (id: string, linkExterno: string) => Promise<void>;
}

export function ReferenciasTab({ referencias, onCriar, onAtualizarLinkExterno }: ReferenciasTabProps) {
  const [criando, setCriando] = useState(false);

  return (
    <div>
      <p style={introTextoEstilo}>
        Uma biblioteca de referências reais que alguém decidiu guardar — não é extraído automaticamente de commit
        nenhum, é você (ou quem revisou) escrevendo o racional por trás da decisão, com um ponteiro pros arquivos
        reais que motivaram (nunca o código em si). Rode <code>gerador export-vault</code> pra materializar isso como
        notas num vault Obsidian, linkadas ao grafo de código que o Graphify já mantém deste projeto — publicar em
        outro lugar com link (Confluence, Obsidian Publish...) continua opcional, cole o link de volta pra fechar o ciclo.
      </p>

      <button onClick={() => setCriando((v) => !v)} style={botaoNovaReferenciaEstilo}>
        {criando ? "cancelar" : "+ Nova referência"}
      </button>

      {criando && <NovaReferenciaForm onFechar={() => setCriando(false)} onCriar={onCriar} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        {referencias.length === 0 && !criando && (
          <p style={{ fontSize: 12, color: "#94a3b8" }}>Nenhuma referência cadastrada ainda. Comece com "+ Nova referência" acima.</p>
        )}
        {referencias.map((ref) => (
          <ReferenciaCard key={ref.id} referencia={ref} onAtualizarLinkExterno={onAtualizarLinkExterno} />
        ))}
      </div>
    </div>
  );
}

function ReferenciaCard({
  referencia,
  onAtualizarLinkExterno,
}: {
  referencia: Referencia;
  onAtualizarLinkExterno: (id: string, linkExterno: string) => Promise<void>;
}) {
  const [editandoLink, setEditandoLink] = useState(false);
  const [rascunhoLink, setRascunhoLink] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvarLink() {
    setSalvando(true);
    try {
      await onAtualizarLinkExterno(referencia.id, rascunhoLink);
      setEditandoLink(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={cardEstilo}>
      <strong style={{ fontSize: 13, color: "#0f172a" }}>{referencia.titulo}</strong>
      <p style={{ fontSize: 12, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{referencia.racional}</p>
      {referencia.designPatterns.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {referencia.designPatterns.map((padrao) => (
            <span key={padrao} style={tagPatternEstilo}>
              {padrao}
            </span>
          ))}
        </div>
      )}
      {referencia.codigoRelacionado.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#475569" }}>
          {referencia.codigoRelacionado.map((caminho) => (
            <li key={caminho}>
              <code>{caminho}</code>
            </li>
          ))}
        </ul>
      )}

      {referencia.linkExterno ? (
        <a href={referencia.linkExterno} target="_blank" rel="noreferrer" style={linkExternoEstilo}>
          ↗ ver link externo
        </a>
      ) : editandoLink ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={rascunhoLink}
            onChange={(e) => setRascunhoLink(e.target.value)}
            placeholder="https://…atlassian.net/wiki/… (opcional)"
            style={inputLinkEstilo}
          />
          <button onClick={() => void salvarLink()} disabled={salvando || !rascunhoLink.trim()} style={linkVerCodigoEstilo}>
            salvar
          </button>
        </div>
      ) : (
        <button onClick={() => setEditandoLink(true)} style={linkVerCodigoEstilo}>
          sem link externo ainda — colar link
        </button>
      )}
    </div>
  );
}

function NovaReferenciaForm({
  onFechar,
  onCriar,
}: {
  onFechar: () => void;
  onCriar: (dados: { titulo: string; racional: string; designPatterns: string[]; codigoRelacionado: string[] }) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [racional, setRacional] = useState("");
  const [patterns, setPatterns] = useState("");
  const [codigo, setCodigo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await onCriar({
        titulo,
        racional,
        designPatterns: patterns
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        codigoRelacionado: codigo
          .split("\n")
          .map((c) => c.trim())
          .filter(Boolean),
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  const podeSalvar = titulo.trim() !== "" && racional.trim() !== "";

  return (
    <div style={formularioEstilo}>
      <label style={labelFormEstilo}>Título</label>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="ex.: Retry com backoff exponencial no consumidor Rabbit"
        style={inputFormEstilo}
      />

      <label style={labelFormEstilo}>Por que isso é uma referência (o raciocínio, não o código em si)</label>
      <textarea
        value={racional}
        onChange={(e) => setRacional(e.target.value)}
        rows={4}
        placeholder="O que motivou essa decisão, que problema evitou, quando reusar."
        style={{ ...inputFormEstilo, fontFamily: "inherit", resize: "vertical" }}
      />

      <label style={labelFormEstilo}>Padrões de design (separados por vírgula)</label>
      <input
        value={patterns}
        onChange={(e) => setPatterns(e.target.value)}
        placeholder="ex.: circuit breaker, retry, DDD"
        style={inputFormEstilo}
      />

      <label style={labelFormEstilo}>Código relacionado (um caminho de arquivo por linha)</label>
      <textarea
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        rows={3}
        placeholder={"packages/engine/src/derive/derivar.ts"}
        style={{ ...inputFormEstilo, fontFamily: "monospace", fontSize: 11.5, resize: "vertical" }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button
          onClick={() => void salvar()}
          disabled={!podeSalvar || salvando}
          style={{ ...botaoBaixarEstilo, opacity: podeSalvar ? 1 : 0.5, cursor: podeSalvar ? "pointer" : "not-allowed" }}
        >
          Salvar
        </button>
        <button onClick={onFechar} style={botaoCancelarEstilo}>
          fechar
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
        Salvar aqui grava direto em <code>config/referencias/&lt;slug&gt;.json</code> — via <code>gerador open</code>
        (modo local, sem servidor) ou via o modo hospedado, tanto faz, o formato é o mesmo. Também dá pra editar
        esses arquivos direto, fora do app. Caminhos de código só precisam bater com o repositório — a checagem
        contra o grafo real acontece quando alguém roda <code>gerador export-vault</code>.
      </p>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.5,
  marginTop: 0,
  maxWidth: 680,
};

const botaoNovaReferenciaEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const formularioEstilo: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxWidth: 560,
};

const labelFormEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#334155",
  marginTop: 8,
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  outline: "none",
  boxSizing: "border-box",
};

const botaoBaixarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
};

const botaoCancelarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: "#fff",
};

const tagPatternEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "1px 7px",
  borderRadius: 999,
  background: "#ede9fe",
  color: "#6d28d9",
};

const linkVerCodigoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "#4f46e5",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
};

const linkExternoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "#4f46e5",
  fontWeight: 600,
};

const inputLinkEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  flex: 1,
};

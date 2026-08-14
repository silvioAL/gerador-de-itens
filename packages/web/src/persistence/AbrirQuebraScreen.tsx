import { useMemo, useState } from "react";
import type { QuebraResumo } from "../api/client";

export interface AbrirQuebraScreenProps {
  lista: QuebraResumo[];
  onAbrir: (id: string) => void;
  onFechar: () => void;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Tela cheia (mesmo padrão de ConfigScreen.tsx) pra abrir uma quebra já
 * salva — substitui o `<select>` nativo do header, que não tinha como
 * pesquisar nem mostrar título nenhum (achado real: com o tempo, ninguém
 * acha quebra antiga numa lista sem nome). Busca e filtro de data são
 * client-side sobre a lista já carregada — o mesmo padrão das outras abas
 * de configuração, sem inventar paginação/busca de servidor pra uma escala
 * que ainda não existe.
 */
export function AbrirQuebraScreen({ lista, onAbrir, onFechar }: AbrirQuebraScreenProps) {
  const [busca, setBusca] = useState("");
  const [criadoDesde, setCriadoDesde] = useState("");
  const [criadoAte, setCriadoAte] = useState("");

  const filtrada = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase();
    return lista.filter((q) => {
      if (buscaNormalizada) {
        const alvo = `${q.titulo ?? ""} ${q.time ?? ""}`.toLowerCase();
        if (!alvo.includes(buscaNormalizada)) return false;
      }
      const dataCriacao = q.criadoEm.slice(0, 10);
      if (criadoDesde && dataCriacao < criadoDesde) return false;
      if (criadoAte && dataCriacao > criadoAte) return false;
      return true;
    });
  }, [lista, busca, criadoDesde, criadoAte]);

  return (
    <div
      data-tour="abrir-quebra-screen-content"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--painel)",
        zIndex: 55,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid var(--borda)",
        }}
      >
        <strong style={{ fontSize: 18 }}>Abrir quebra</strong>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={{ ...botaoEstilo, ...botaoPrimarioEstilo }}>
          Voltar à mesa de projeto
        </button>
      </header>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          padding: "16px 24px",
          borderBottom: "1px solid var(--borda)",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 260 }}>
          <label htmlFor="busca-quebra" style={labelEstilo}>
            Buscar por título ou time
          </label>
          <input
            id="busca-quebra"
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="ex.: aprovação de crédito"
            style={inputBuscaEstilo}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="criado-desde" style={labelEstilo}>
            Criada de
          </label>
          <input
            id="criado-desde"
            type="date"
            value={criadoDesde}
            onChange={(e) => setCriadoDesde(e.target.value)}
            style={inputDataEstilo}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="criado-ate" style={labelEstilo}>
            até
          </label>
          <input
            id="criado-ate"
            type="date"
            value={criadoAte}
            onChange={(e) => setCriadoAte(e.target.value)}
            style={inputDataEstilo}
          />
        </div>
        {(criadoDesde || criadoAte) && (
          <button
            onClick={() => {
              setCriadoDesde("");
              setCriadoAte("");
            }}
            style={linkLimparEstilo}
          >
            limpar datas
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 24px 24px" }}>
        {lista.length === 0 ? (
          <p style={vazioEstilo}>Nenhuma quebra salva ainda.</p>
        ) : filtrada.length === 0 ? (
          <p style={vazioEstilo}>Nenhuma quebra encontrada com esse filtro.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {filtrada.map((q) => (
              <li key={q.id}>
                <button onClick={() => onAbrir(q.id)} style={linhaEstilo}>
                  <span style={tituloEstilo}>{q.titulo ?? "(sem título)"}</span>
                  <span style={metaEstilo}>
                    {q.time ?? "sem time"} · criada em {formatarData(q.criadoEm)} · editada em{" "}
                    {formatarData(q.atualizadoEm)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const botaoEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "7px 12px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "1px solid #4f46e5",
};

const labelEstilo: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--texto-2)",
};

const inputBuscaEstilo: React.CSSProperties = {
  fontSize: 16,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  outline: "none",
};

const inputDataEstilo: React.CSSProperties = {
  fontSize: 14,
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  outline: "none",
};

const linkLimparEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "#a5b4fc",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "0 0 9px",
};

const vazioEstilo: React.CSSProperties = {
  fontSize: 15,
  color: "var(--texto-fraco)",
  marginTop: 24,
  textAlign: "center",
};

const linhaEstilo: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "14px 18px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  cursor: "pointer",
};

const tituloEstilo: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: "var(--texto)",
};

const metaEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-fraco)",
};

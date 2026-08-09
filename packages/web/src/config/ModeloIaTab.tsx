import { useEffect, useState } from "react";
import { apiConfigIa, apiIa, type StatusIa } from "../api/client";

function formatarGB(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * SPEC-25 Fases 0/1 — a tela de escolha do modelo. Hoje só provedores locais
 * (o gateway da empresa e o Claude entram na Fase 2, como cards novos aqui
 * mesmo). Um card por modelo com estado real do disco; o radio grava em
 * `config/ia.json`, e o servidor troca o modelo carregado no próximo pedido.
 */
export function ModeloIaTab() {
  const [status, setStatus] = useState<StatusIa | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    apiIa
      .status()
      .then((s) => {
        if (!cancelado) setStatus(s);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function selecionar(id: string) {
    setSalvando(id);
    setErro(null);
    try {
      await apiConfigIa.salvar({ provedorPadrao: id });
      setStatus(await apiIa.status());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  }

  const modelos = status?.modelosChat ?? [];

  return (
    <div>
      <p style={introTextoEstilo}>
        Qual modelo a esteira de agentes usa. Tudo roda na sua máquina — nenhum dado sai daqui. Modelos maiores
        raciocinam melhor e demoram mais; a troca vale a partir da próxima geração.
      </p>

      {status === null && !erro && <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680 }}>
        {modelos.map((m) => (
          <label
            key={m.id}
            data-testid={`modelo-ia-${m.id}`}
            style={{ ...cardEstilo, ...(m.selecionado ? cardSelecionadoEstilo : {}) }}
          >
            <input
              type="radio"
              name="modelo-ia"
              checked={m.selecionado}
              disabled={!m.instalado || salvando !== null}
              onChange={() => void selecionar(m.id)}
              style={{ marginTop: 3 }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13, color: "var(--texto)", display: "block" }}>
                {m.nome}
                {m.raciocinador && <span style={selo}>raciocinador</span>}
              </strong>
              <span style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6, display: "block" }}>
                {m.papel}
              </span>
              <span style={{ fontSize: 11.5, color: m.instalado ? "var(--verde)" : "var(--texto-mudo)" }}>
                {m.instalado
                  ? `instalado (~${formatarGB(m.tamanhoAproximadoBytes)})`
                  : `não baixado — rode \`gerador ia instalar --modelo ${m.id}\` (~${formatarGB(m.tamanhoAproximadoBytes)})`}
              </span>
            </span>
          </label>
        ))}
      </div>

      {status && !status.embeddingInstalado && (
        <p style={{ ...avisoEstilo, marginTop: 12 }}>
          O modelo de embedding não está instalado — a IA só fica pronta com ele. Rode `gerador ia instalar`.
        </p>
      )}
      {erro && <p style={{ ...avisoEstilo, color: "var(--vermelho)" }}>{erro}</p>}
      {status?.caminhoModelos && (
        <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", marginTop: 12 }}>
          Modelos em <code>{status.caminhoModelos}</code>
        </p>
      )}
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

const cardEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  background: "var(--painel)",
  cursor: "pointer",
};

const cardSelecionadoEstilo: React.CSSProperties = {
  borderColor: "var(--acento)",
  background: "rgba(56, 189, 248, 0.06)",
};

const selo: React.CSSProperties = {
  fontSize: 10,
  color: "var(--acento)",
  background: "rgba(56, 189, 248, 0.14)",
  borderRadius: 999,
  padding: "1px 8px",
  marginLeft: 8,
  fontWeight: 500,
};

const avisoEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--amarelo)",
  marginBottom: 0,
};

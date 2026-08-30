import { useEffect, useState } from "react";
import { deTokensW3C, paraTokensW3C, type Token } from "@gerador/engine";
import { apiTokens } from "../api/client";
import { MarcaDeDemonstracao } from "../demo/dadosDoTour";

/**
 * SPEC-79 fatia A — **o design system do time, como dado.**
 *
 * ## Por que uma tela, e não só a API
 *
 * A régua da fatia C funciona com os tokens vindos de qualquer lugar. Mas um
 * recurso que só existe via `curl` é, na prática, um recurso que não existe: o
 * estágio `padroes` do ciclo continuaria `parcial` com toda razão, e a SPEC-79
 * §2 é explícita sobre não deixar o ponto verde sobre formulário que ninguém
 * preenche.
 *
 * ## Por que o import de JSON é o caminho principal, e a edição o secundário
 *
 * Ninguém digita cem tokens à mão. Um design system real vive no Figma, no
 * Style Dictionary ou no Tokens Studio — e todos exportam no formato do W3C.
 * Colar o arquivo é o gesto de trinta segundos que traz o sistema inteiro; a
 * tabela existe para conferir o que entrou e corrigir um caso.
 *
 * E o export existe pelo mesmo motivo que o import: **sem a volta, esta tela
 * vira mais um lugar onde a verdade se bifurca** (§263).
 */
export interface TokensTabProps {
  /** §235 — dado exclusivo do tour: substitui o fetch e desliga o salvar. */
  demonstracao?: Token[];
}

export function TokensTab({ demonstracao }: TokensTabProps = {}) {
  const [tokens, setTokens] = useState<Token[] | null>(demonstracao ?? null);
  const [colado, setColado] = useState("");
  const [coladoEscuro, setColadoEscuro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (demonstracao) return;
    let cancelado = false;
    apiTokens
      .obter()
      .then((c) => {
        if (!cancelado) setTokens(c?.tokens ?? []);
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, [demonstracao]);

  if (erro && !tokens) return <p style={{ fontSize: 12.5, color: "var(--vermelho)" }}>{erro}</p>;
  if (!tokens) return <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>;

  function importar() {
    setErro(null);
    try {
      const claro: unknown = JSON.parse(colado);
      const escuro: unknown = coladoEscuro.trim() ? JSON.parse(coladoEscuro) : undefined;
      const lidos = deTokensW3C(claro, escuro);
      if (lidos.length === 0) {
        // Silêncio aqui seria pior que erro: a pessoa colou algo, nada
        // aconteceu, e ela não tem como saber se o formato estava errado ou se
        // o arquivo estava vazio.
        setErro("Nenhum token encontrado — o arquivo está no formato do W3C (com `$value`)?");
        return;
      }
      setTokens(lidos);
      setSalvo(false);
    } catch (e) {
      setErro(`JSON inválido: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function exportar(modo: "claro" | "escuro") {
    const json = JSON.stringify(paraTokensW3C(tokens ?? [], modo), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tokens-${modo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function salvar() {
    if (demonstracao) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiTokens.salvar({ tokens: tokens ?? [] });
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const porGrupo = new Map<string, Token[]>();
  for (const t of tokens) {
    const g = t.grupo ?? "sem grupo";
    porGrupo.set(g, [...(porGrupo.get(g) ?? []), t]);
  }

  return (
    <div data-testid="tokens-tab" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {demonstracao && <MarcaDeDemonstracao />}

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: "var(--texto)" }}>
          Design system: os tokens do time
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.55, margin: 0, maxWidth: 640 }}>
          O que está declarado aqui vira <strong>régua</strong>: uma regra de refinamento pode cobrar que uma cor
          pertença a esta lista, ou que o contraste entre duas delas alcance um mínimo. Sem tokens declarados, essas
          checagens se calam — nada é cobrado de quem ainda não configurou.
        </p>
      </div>

      <section style={caixa}>
        <h4 style={titulo}>Importar do seu design system</h4>
        <p style={{ fontSize: 12, color: "var(--texto-2)", margin: "0 0 8px" }}>
          Cole a exportação no formato <strong>Design Tokens do W3C</strong> — é o que Figma, Style Dictionary e Tokens
          Studio produzem. O segundo campo é opcional, para o modo escuro.
        </p>
        <textarea
          data-testid="tokens-colar-claro"
          value={colado}
          onChange={(e) => setColado(e.target.value)}
          placeholder='{ "cor": { "fundo": { "$value": "var(--branco)", "$type": "color" } } }'
          style={area}
        />
        <textarea
          data-testid="tokens-colar-escuro"
          value={coladoEscuro}
          onChange={(e) => setColadoEscuro(e.target.value)}
          placeholder="(opcional) o mesmo arquivo, no modo escuro"
          style={{ ...area, minHeight: 70 }}
        />
        <button data-testid="tokens-importar" onClick={importar} disabled={!colado.trim()} style={botao}>
          Ler os tokens
        </button>
      </section>

      <section style={caixa}>
        <h4 style={titulo}>
          {tokens.length} {tokens.length === 1 ? "token declarado" : "tokens declarados"}
        </h4>
        {tokens.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", margin: 0 }}>
            Nenhum ainda — e isso é um estado legítimo: as checagens de design system ficam caladas até existir uma
            lista contra a qual medir.
          </p>
        ) : (
          [...porGrupo.entries()].map(([grupo, doGrupo]) => (
            <div key={grupo} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--texto-2)", textTransform: "uppercase" }}>
                {grupo}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <tbody>
                  {doGrupo.map((t) => (
                    <tr key={t.nome} style={{ borderBottom: "1px solid var(--borda)" }}>
                      <td style={{ padding: "4px 8px 4px 0", fontFamily: "ui-monospace, monospace" }}>{t.nome}</td>
                      <td style={{ padding: "4px 8px", width: 110 }}>
                        <Amostra valor={t.valor} />
                      </td>
                      <td style={{ padding: "4px 8px", width: 110 }}>
                        {t.valorEscuro ? <Amostra valor={t.valorEscuro} /> : <span style={{ color: "var(--texto-fraco)" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button data-testid="tokens-salvar" onClick={salvar} disabled={salvando || !!demonstracao} style={botao}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button onClick={() => exportar("claro")} disabled={tokens.length === 0} style={botaoFraco}>
          Exportar (claro)
        </button>
        <button onClick={() => exportar("escuro")} disabled={tokens.length === 0} style={botaoFraco}>
          Exportar (escuro)
        </button>
        {salvo && <span style={{ fontSize: 12, color: "var(--verde)" }}>salvo</span>}
        {erro && <span style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</span>}
      </div>
    </div>
  );
}

/** A cor, quando dá para mostrá-la. Um token de espaçamento ou um alias
 * aparecem como texto — e é isso que a régua também vê. */
function Amostra({ valor }: { valor: string }) {
  const ehCor = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(valor.trim());
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace" }}>
      {ehCor && (
        <span
          aria-hidden
          style={{ width: 14, height: 14, borderRadius: 4, background: valor, border: "1px solid var(--borda)" }}
        />
      )}
      {valor}
    </span>
  );
}

const caixa: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 10,
  padding: "12px 14px",
};

const titulo: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: "0 0 6px", color: "var(--texto)" };

const area: React.CSSProperties = {
  width: "100%",
  minHeight: 90,
  fontSize: 12,
  fontFamily: "ui-monospace, monospace",
  padding: 8,
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
  marginBottom: 8,
};

const botao: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
};

const botaoFraco: React.CSSProperties = {
  ...botao,
  background: "transparent",
  color: "var(--texto)",
  border: "1px solid var(--borda)",
};

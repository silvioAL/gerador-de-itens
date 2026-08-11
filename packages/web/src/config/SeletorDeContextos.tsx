import { useState } from "react";

/**
 * Seletor de contextos por clique (#pedido do usuário sobre a RegrasTab): o
 * campo "contextos separados por vírgula" exigia digitar de cabeça valores
 * como "Backend-mensagens rabbitmq" — e um typo não avisava: a regra
 * simplesmente nunca casava com item nenhum. Os contextos válidos SÃO uma
 * lista conhecida (`appConfig.contextos`), então a escolha vira clique.
 *
 * Valor já salvo que não está na lista conhecida (legado, typo antigo, config
 * custom) continua visível como chip marcado — sumir com ele em silêncio seria
 * pior que o typo. E sem lista nenhuma de opções, o componente cai no input
 * de texto livre de antes: instalação com config própria não perde a edição.
 */
export function SeletorDeContextos({
  valores,
  opcoes,
  onMudar,
  rotuloVazio,
  ariaLabel,
}: {
  valores: string[];
  opcoes: string[];
  onMudar: (valores: string[]) => void;
  /** O que "nenhum contexto" significa aqui (ex.: "vazio vale sempre"). */
  rotuloVazio: string;
  ariaLabel: string;
}) {
  const [aberto, setAberto] = useState(false);
  // Texto CRU do fallback livre — a lição que o PipelineAgentesTab já tinha
  // pago: renormalizar (split/trim/join) a cada tecla apaga a vírgula que a
  // pessoa acabou de digitar. O parse vai pro onMudar; o input mostra o cru.
  const [textoLivre, setTextoLivre] = useState<string | null>(null);

  if (opcoes.length === 0) {
    return (
      <input
        value={textoLivre ?? valores.join(", ")}
        onChange={(e) => {
          setTextoLivre(e.target.value);
          onMudar(e.target.value.split(",").map((c) => c.trim()).filter(Boolean));
        }}
        placeholder={`contextos (separados por vírgula) — ${rotuloVazio}`}
        aria-label={ariaLabel}
        style={entradaLivreEstilo}
      />
    );
  }

  const restantes = opcoes.filter((o) => !valores.includes(o));

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }} aria-label={ariaLabel}>
      <div style={caixaEstilo}>
        {valores.length === 0 && <span style={vazioEstilo}>{rotuloVazio}</span>}
        {valores.map((c) => (
          <button
            key={c}
            onClick={() => onMudar(valores.filter((v) => v !== c))}
            aria-label={`Remover contexto ${c}`}
            title={opcoes.includes(c) ? "clique para remover" : "fora da lista de contextos conhecidos — clique para remover"}
            style={{ ...chipEstilo, ...(opcoes.includes(c) ? {} : chipDesconhecidoEstilo) }}
          >
            {c} <span aria-hidden="true">×</span>
          </button>
        ))}
        <button
          onClick={() => setAberto((a) => !a)}
          aria-label={`${ariaLabel}: adicionar`}
          aria-expanded={aberto}
          disabled={restantes.length === 0}
          title={restantes.length === 0 ? "todos os contextos conhecidos já estão marcados" : undefined}
          style={botaoAdicionarEstilo}
        >
          + contexto
        </button>
      </div>
      {aberto && restantes.length > 0 && (
        <div style={menuEstilo} role="listbox" aria-label={`Contextos disponíveis (${ariaLabel})`}>
          {restantes.map((o) => (
            <button
              key={o}
              role="option"
              aria-selected={false}
              onClick={() => {
                onMudar([...valores, o]);
                setAberto(false);
              }}
              style={opcaoEstilo}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const caixaEstilo: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 4,
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  minHeight: 30,
};

const vazioEstilo: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--texto-mudo)",
  padding: "0 2px",
};

const chipEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(56, 189, 248, 0.45)",
  background: "rgba(56, 189, 248, 0.12)",
  color: "var(--acento)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const chipDesconhecidoEstilo: React.CSSProperties = {
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto)",
  color: "var(--texto-fraco)",
};

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px dashed var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-fraco)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const menuEstilo: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: 4,
  zIndex: 5,
  display: "flex",
  flexDirection: "column",
  maxHeight: 200,
  overflowY: "auto",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto)",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
};

const opcaoEstilo: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  padding: "6px 10px",
  border: "none",
  background: "transparent",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const entradaLivreEstilo: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

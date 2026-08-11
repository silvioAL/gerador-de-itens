export type AbaAssistente = "conversa" | "contexto";

/** A ordem aqui é a ordem visual das abas. O #297 ("configurar conversando")
 * nasce como uma entrada nova nesta lista, não como mais um botão solto — foi
 * exatamente pra isso que o invólucro existe. */
const ABAS: { id: AbaAssistente; rotulo: string }[] = [
  { id: "conversa", rotulo: "✦ Desenhar conversando" },
  { id: "contexto", rotulo: "📎 Contexto do épico" },
];

export interface AssistenteFlutuanteProps {
  /** `null` = fechado. O estado mora no App (como já morava para os dois
   * painéis separados) — o invólucro só desenha gatilho, janela e abas. */
  aba: AbaAssistente | null;
  onMudarAba: (aba: AbaAssistente | null) => void;
  /** O conteúdo da aba ativa — o App decide qual painel entra. */
  children?: React.ReactNode;
}

/**
 * O assistente flutuante (#298): um único ponto de entrada, no canto inferior
 * direito, para tudo que é "conversar com a ferramenta" — no lugar dos dois
 * botões de header que abriam overlays com cascas diferentes (a conversa era
 * painel lateral fixo, o contexto era modal com backdrop). Duas portas com
 * roupas diferentes para a mesma classe de coisa liam como dois sistemas.
 *
 * Os painéis em si não mudaram: eles perderam a casca (posicionamento/backdrop)
 * e passaram a preencher esta janela. Quem fecha, abre e troca de aba é o
 * invólucro; quem conversa continua sendo cada painel.
 */
export function AssistenteFlutuante({ aba, onMudarAba, children }: AssistenteFlutuanteProps) {
  const aberto = aba !== null;
  return (
    <>
      {aberto && (
        <section className="assistente-janela" style={janelaEstilo} aria-label="Assistente" data-testid="assistente-janela">
          <header style={cabecalhoEstilo}>
            {ABAS.map((a) => (
              <button
                key={a.id}
                onClick={() => onMudarAba(a.id)}
                style={{ ...abaEstilo, ...(a.id === aba ? abaAtivaEstilo : {}) }}
                aria-pressed={a.id === aba}
              >
                {a.rotulo}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => onMudarAba(null)}
              style={fecharEstilo}
              aria-label="Fechar assistente"
            >
              ×
            </button>
          </header>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
        </section>
      )}
      <button
        className="assistente-fab"
        data-testid="assistente-flutuante"
        onClick={() => onMudarAba(aberto ? null : "conversa")}
        aria-label="Assistente"
        aria-expanded={aberto}
        title={
          aberto
            ? undefined
            : "Assistente: descreva a demanda e receba o diagrama proposto, ou cole o contexto do épico."
        }
        style={fabEstilo}
      >
        {/* A rotação entre ✦ e × é do span, não do botão — girar o botão
            giraria também a sombra e o hover. */}
        <span style={{ ...fabIconeEstilo, transform: aberto ? "rotate(135deg)" : "none" }} aria-hidden="true">
          {aberto ? "+" : "✦"}
        </span>
      </button>
    </>
  );
}

/* zIndex 45 nos dois: acima do canvas e dos painéis laterais (40), abaixo da
   revisão (50) e das telas de config/jornada (55/60) — quando uma tela cheia
   abre, o assistente some atrás dela, como os botões de header faziam. */
const fabEstilo: React.CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 20,
  width: 48,
  height: 48,
  borderRadius: "50%",
  border: "1px solid var(--acento-indigo)",
  background: "var(--acento-indigo)",
  color: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
  zIndex: 45,
};

const fabIconeEstilo: React.CSSProperties = {
  fontSize: 20,
  lineHeight: 1,
  transition: "transform 200ms cubic-bezier(0.2, 0.7, 0.3, 1)",
};

const janelaEstilo: React.CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 80,
  width: 420,
  maxWidth: "calc(100vw - 40px)",
  height: "min(620px, calc(100vh - 100px))",
  display: "flex",
  flexDirection: "column",
  background: "var(--painel)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 14,
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
  overflow: "hidden",
  zIndex: 45,
};

const cabecalhoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 12px",
  borderBottom: "1px solid var(--borda)",
};

const abaEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--texto-fraco)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const abaAtivaEstilo: React.CSSProperties = {
  border: "1px solid rgba(99, 102, 241, 0.45)",
  background: "rgba(99, 102, 241, 0.14)",
  color: "#a5b4fc",
  fontWeight: 600,
};

const fecharEstilo: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--texto-fraco)",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: 1,
};

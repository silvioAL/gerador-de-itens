import { useState } from "react";
import { useArrastavel } from "./useArrastavel";

export type AbaAssistente = "conversa" | "contexto" | "configurar";

/** A ordem aqui é a ordem visual das abas. Entrada nova = aba nova — foi
 * exatamente pra isso que o invólucro existe (o "configurar" do #297 nasceu
 * assim, como a SPEC-34 §3.1 previa). */
const ABAS: { id: AbaAssistente; rotulo: string }[] = [
  { id: "conversa", rotulo: "✦ Desenhar conversando" },
  { id: "contexto", rotulo: "📎 Contexto do épico" },
  { id: "configurar", rotulo: "⚙ Configurar" },
];

export interface AssistenteFlutuanteProps {
  /** `null` = fechado. O estado mora no App (como já morava para os dois
   * painéis separados) — o invólucro só desenha gatilho, janela e abas. */
  aba: AbaAssistente | null;
  onMudarAba: (aba: AbaAssistente | null) => void;
  /** Em qual aba o clique no botão ABRE — o assistente é sensível a onde a
   * pessoa está: no canvas cai na conversa de desenho; dentro de
   * Configurações cai direto no "⚙ Configurar" (pedido do usuário: o mesmo
   * bubble, voltado à facilitação da configuração). */
  abaPrimaria?: AbaAssistente;
  /** `true` quando uma tela cheia (Configurações) está aberta e o assistente
   * deve flutuar SOBRE ela em vez de sumir atrás. */
  sobreposto?: boolean;
  /** SPEC-37 — um momento de condução está ativo: o bubble pulsa. */
  chamando?: boolean;
  /** SPEC-37 — o balão do momento: fala curta + chip de ação opcional,
   * sempre dispensável. Só aparece com o assistente FECHADO — aberto, quem
   * fala é o chat. `entrada` transforma o balão em pergunta (ex.: o nome da
   * demanda antes de derivar): o chip principal confirma com o texto digitado. */
  balao?: {
    texto: string;
    acao?: { rotulo: string; onExecutar: () => void };
    acaoSecundaria?: { rotulo: string; onExecutar: () => void };
    entrada?: { placeholder: string; rotulo: string; onConfirmar: (valor: string) => void };
    onDispensar: () => void;
  };
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
export function AssistenteFlutuante({
  aba,
  onMudarAba,
  abaPrimaria = "conversa",
  sobreposto = false,
  chamando = false,
  balao,
  children,
}: AssistenteFlutuanteProps) {
  const aberto = aba !== null;
  // Pedido do usuário: o bubble apareceu sobre um botão e não tinha como
  // mover — agora arrasta (a janela e o balão continuam ancorados no canto,
  // previsíveis; é o GATILHO que sai do caminho).
  const { estiloArrasto, handlersDeArrasto } = useArrastavel("gerador:fab-assistente");
  // Rascunho do input do balão-pergunta (ex.: nome da demanda).
  const [valorEntrada, setValorEntrada] = useState("");
  // zIndex 58 quando sobreposto: acima da ConfigScreen (55), abaixo do tour
  // (80) — é o que faz o mesmo bubble existir dentro de Configurações.
  const elevacao = sobreposto ? { zIndex: 58 } : {};
  return (
    <>
      {aberto && (
        <section
          className="assistente-janela"
          style={{ ...janelaEstilo, ...elevacao }}
          aria-label="Assistente"
          data-testid="assistente-janela"
        >
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
      {!aberto && balao && (
        <div className="assistente-janela" style={{ ...balaoEstilo, ...elevacao }} data-testid="assistente-balao" role="status">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--texto-2)" }}>{balao.texto}</p>
          {balao.entrada && (
            <input
              aria-label={balao.entrada.placeholder}
              value={valorEntrada}
              onChange={(e) => setValorEntrada(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valorEntrada.trim()) balao.entrada!.onConfirmar(valorEntrada.trim());
              }}
              placeholder={balao.entrada.placeholder}
              style={{ width: "100%", marginTop: 8, fontSize: 12.5, padding: "6px 8px" }}
              autoFocus
            />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {balao.entrada && (
              <button
                onClick={() => balao.entrada!.onConfirmar(valorEntrada.trim())}
                disabled={!valorEntrada.trim()}
                style={{ ...chipAcaoEstilo, ...(valorEntrada.trim() ? {} : { opacity: 0.5, cursor: "not-allowed" }) }}
                data-testid="assistente-balao-confirmar"
              >
                {balao.entrada.rotulo}
              </button>
            )}
            {balao.acao && (
              <button onClick={balao.acao.onExecutar} style={chipAcaoEstilo} data-testid="assistente-balao-acao">
                {balao.acao.rotulo}
              </button>
            )}
            {balao.acaoSecundaria && (
              <button
                onClick={balao.acaoSecundaria.onExecutar}
                style={{ ...chipAcaoEstilo, background: "transparent", color: "var(--acento-indigo)" }}
                data-testid="assistente-balao-secundaria"
              >
                {balao.acaoSecundaria.rotulo}
              </button>
            )}
            <button onClick={balao.onDispensar} aria-label="Dispensar sugestão" style={dispensarEstilo}>
              agora não
            </button>
          </div>
        </div>
      )}
      <button
        className={`assistente-fab${chamando && !aberto ? " assistente-fab--chamando" : ""}`}
        data-testid="assistente-flutuante"
        onClick={() => onMudarAba(aberto ? null : abaPrimaria)}
        aria-label="Assistente"
        aria-expanded={aberto}
        title={
          aberto
            ? undefined
            : abaPrimaria === "configurar"
              ? "Assistente: descreva o que o time precisa configurar — por texto ou por voz. Eu proponho, você aplica."
              : "Assistente: converse por texto ou por voz — descreva a demanda, cole o contexto do épico ou peça configuração."
        }
        style={{ ...fabEstilo, ...elevacao, ...estiloArrasto }}
        {...handlersDeArrasto}
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

/** O balão do momento — mesma âncora da janela (nasce do bubble), menor. */
const balaoEstilo: React.CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 80,
  width: 280,
  maxWidth: "calc(100vw - 40px)",
  padding: "10px 12px",
  background: "var(--painel)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 12,
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
  zIndex: 45,
};

const chipAcaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 12px",
  borderRadius: 999,
  border: "1px solid var(--acento-indigo)",
  background: "var(--acento-indigo)",
  color: "#fff",
  cursor: "pointer",
};

const dispensarEstilo: React.CSSProperties = {
  fontSize: 11.5,
  padding: "5px 8px",
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "var(--texto-mudo)",
  cursor: "pointer",
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

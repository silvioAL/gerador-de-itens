import type { AvisoDaDerivacao } from "@gerador/engine";

/**
 * §261 — o reconhecimento do que se está ignorando ao derivar.
 *
 * ## Por que existe
 *
 * O portão consultava só completude. As quatro dimensões construídas depois
 * eram amarelas, e amarelo que ninguém lê no momento da decisão é o mesmo que
 * medida nenhuma — derivar com uma necessidade órfã e um caminho estourado
 * acontecia em silêncio.
 *
 * ## O que ele NÃO é
 *
 * **Não é um bloqueio, e não é uma bronca.** "Derivar assim mesmo" é a ação
 * primária, à direita, e um clique basta. Se o preço do reconhecimento fosse
 * alto, a pessoa aprenderia a odiar a medição em vez de usá-la — que é
 * exatamente o que a régua do §230 ("bloquear cedo ensina a ignorar a cor")
 * existe para evitar.
 *
 * O texto diz o que fica para trás, não o que a pessoa fez de errado. Às vezes
 * derivar com um caminho fora da régua é a decisão certa, e ela não precisa de
 * permissão — precisa de informação.
 */
export interface AvisosDaDerivacaoProps {
  avisos: AvisoDaDerivacao[];
  onDerivar: () => void;
  onVoltar: () => void;
}

/** Os mesmos ícones do placar: quem já viu a mesa reconhece sem legenda.
 * `padrao` (⚖) não aparece aqui de propósito — violação de padrão vira item,
 * então não é algo que fica para trás. */
const ICONE: Record<AvisoDaDerivacao["dimensao"], string> = {
  proposito: "🎯",
  caminho: "🛣",
  decisao: "🧭",
  // SPEC-63 — a forma usa o MESMO ⚖ do padrão de valor, porque é a mesma
  // pergunta ("este desenho contraria o padrão do time?"). Ícone novo faria
  // parecer uma dimensão nova, e ela não é: é a outra metade da que já existia.
  forma: "⚖",
};

export function AvisosDaDerivacao({ avisos, onDerivar, onVoltar }: AvisosDaDerivacaoProps) {
  return (
    <div style={fundoEstilo} onClick={onVoltar}>
      <div data-testid="avisos-da-derivacao" style={caixaEstilo} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Derivar deixando isto para trás?</h2>
        <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", margin: "0 0 14px", lineHeight: 1.5 }}>
          Nada aqui impede a derivação — os itens saem igual. É só para você seguir sabendo o que ficou.
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {avisos.map((a) => (
            <li
              key={`${a.dimensao}-${a.texto}`}
              data-testid={`aviso-${a.dimensao}`}
              style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--texto-2)", lineHeight: 1.45 }}
            >
              <span style={{ flex: "none" }}>{ICONE[a.dimensao]}</span>
              <span>{a.texto}</span>
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onVoltar} style={secundarioEstilo} data-testid="voltar-e-resolver">
            Voltar e resolver
          </button>
          {/* Primária, e à direita: seguir é o caminho normal. */}
          <button onClick={onDerivar} style={primarioEstilo} data-testid="derivar-mesmo-assim">
            Derivar assim mesmo
          </button>
        </div>
      </div>
    </div>
  );
}

const fundoEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 78,
  background: "rgba(15, 23, 42, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: "system-ui, sans-serif",
};

const caixaEstilo: React.CSSProperties = {
  width: "min(460px, 100%)",
  padding: "20px 22px",
  borderRadius: 14,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
  boxShadow: "0 16px 44px rgba(15, 23, 42, 0.4)",
};

const primarioEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const secundarioEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

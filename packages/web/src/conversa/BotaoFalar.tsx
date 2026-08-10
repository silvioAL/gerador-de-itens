import { SEGUNDOS_MAXIMO, type GravacaoDeVoz } from "./useGravacaoDeVoz";

/**
 * SPEC-30 Fase 1a — o botão de falar, e a onda que prova que ele está ouvindo.
 *
 * As barras são desenhadas a partir do nível REAL do microfone (ver
 * `useGravacaoDeVoz`), não de uma animação decorativa em loop. Isso é o que
 * faz o componente responder à pergunta que a pessoa realmente tem enquanto
 * fala — *"ele está me ouvindo?"* — em vez de só parecer ocupado. Microfone
 * mudo fica visivelmente parado, que é a informação certa.
 */
export function BotaoFalar({ gravacao }: { gravacao: GravacaoDeVoz }) {
  const { estado, nivel, segundos, erro, comecar, parar, cancelar } = gravacao;

  if (estado === "transcrevendo") {
    return (
      <div style={faixaEstilo} data-testid="voz-transcrevendo">
        <span style={{ ...pontoEstilo, background: "var(--acento)" }} />
        <span style={{ fontSize: 12, color: "var(--texto-2)" }}>Transcrevendo…</span>
      </div>
    );
  }

  if (estado === "gravando") {
    return (
      <div style={faixaEstilo} data-testid="voz-gravando">
        <Onda nivel={nivel} />
        <span style={{ fontSize: 12, color: "var(--texto-2)", fontVariantNumeric: "tabular-nums" }}>
          {formatarTempo(segundos)}
          {/* Só aparece perto do teto: avisar cedo demais seria ruído, e não
              avisar deixaria a gravação morrer sem explicação. */}
          {segundos >= SEGUNDOS_MAXIMO - 15 && (
            <span style={{ color: "var(--amarelo)" }}> · para em {SEGUNDOS_MAXIMO - segundos}s</span>
          )}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={cancelar} style={botaoSecundarioEstilo} aria-label="Descartar gravação">
          Descartar
        </button>
        <button onClick={parar} style={botaoPrincipalEstilo} aria-label="Parar e transcrever">
          ⏹ Parar
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        onClick={() => void comecar()}
        style={{ ...botaoSecundarioEstilo, alignSelf: "flex-start" }}
        aria-label="Falar em vez de digitar"
        data-testid="voz-falar"
      >
        🎤 Falar
      </button>
      {/* Bloco, não linha: as mensagens de falha aqui dizem o PRÓXIMO PASSO
          (subir o serviço de voz, conferir o gateway) e não cabem numa linha
          espremida ao lado do botão — cortar a explicação seria devolver o
          problema original, que era a pessoa não entender o que fazer. */}
      {erro && (
        <p
          style={{ margin: 0, fontSize: 11.5, color: "var(--vermelho)", lineHeight: 1.5 }}
          data-testid="voz-erro"
        >
          {erro}
        </p>
      )}
    </div>
  );
}

/** Sete barras espelhadas em torno do centro — o desenho clássico de onda, que
 * é lido como "áudio" sem precisar de legenda. */
function Onda({ nivel }: { nivel: number }) {
  const alturas = [0.35, 0.6, 0.85, 1, 0.85, 0.6, 0.35];
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }} aria-hidden="true">
      {alturas.map((peso, i) => (
        <span
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: "var(--acento)",
            // Piso de 3px pra onda não sumir no silêncio: uma linha de barras
            // baixinhas ainda diz "estou aqui, gravando"; nada diz "travou".
            height: Math.max(3, Math.round(nivel * peso * 18)),
            transition: "height 80ms linear",
          }}
        />
      ))}
    </span>
  );
}

function formatarTempo(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const faixaEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--acento)",
  background: "rgba(56, 189, 248, 0.08)",
};

const pontoEstilo: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  animation: "pulsar 1s ease-in-out infinite",
};

const botaoSecundarioEstilo: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-2)",
  fontSize: 12,
  cursor: "pointer",
};

const botaoPrincipalEstilo: React.CSSProperties = {
  ...botaoSecundarioEstilo,
  borderColor: "var(--acento)",
  color: "var(--acento)",
};

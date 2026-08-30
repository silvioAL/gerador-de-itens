import { useMemo, useState } from "react";

/**
 * §273 — escolher entre MUITOS times.
 *
 * ## O relato
 *
 * *"no meu contexto existem mais de 60 times"*. O menu tinha um `<select>` com
 * um `<option>` por time, e a tela de escolha do login tinha um botão por time:
 * as duas nascem legíveis com dois ou três e viram um paredão com sessenta.
 *
 * ## A régua: a busca aparece quando ela vale a pena
 *
 * Com poucos times, um campo de filtro é fricção pura — a pessoa vê a lista
 * inteira e clica. Com muitos, a lista é que é inútil. O componente decide
 * pelo número, e não pede configuração a quem o usa: `LIMITE_SEM_BUSCA` é o
 * ponto em que rolar fica pior que digitar.
 *
 * ## Por que um componente, e não dois parecidos
 *
 * A escolha do login e a troca pelo menu são a mesma pergunta ("qual time?")
 * feita em dois momentos. Duas implementações divergiriam na terceira mudança,
 * e a que ficasse para trás seria justamente a menos usada — que aqui é a do
 * login, a primeira coisa que alguém vê.
 */
export interface ListaDeTimesProps {
  timeIds: string[];
  /** O que já está ativo — marcado na lista, nunca escondido. */
  ativo?: string;
  onEscolher: (timeId: string) => void;
  autoFocus?: boolean;
}

/** Acima disto, rolar custa mais que digitar. */
export const LIMITE_SEM_BUSCA = 8;

export function ListaDeTimes({ timeIds, ativo, onEscolher, autoFocus }: ListaDeTimesProps) {
  const [busca, setBusca] = useState("");
  const comBusca = timeIds.length > LIMITE_SEM_BUSCA;

  const filtrados = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return timeIds;
    return timeIds.filter((t) => t.toLowerCase().includes(alvo));
  }, [timeIds, busca]);

  return (
    <div data-testid="lista-de-times">
      {comBusca && (
        <input
          aria-label="Buscar time"
          placeholder="filtrar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoFocus={autoFocus}
          style={buscaEstilo}
        />
      )}

      <div style={rolagemEstilo}>
        {filtrados.map((timeId) => (
          <button
            key={timeId}
            onClick={() => onEscolher(timeId)}
            data-testid={`time-${timeId}`}
            aria-current={timeId === ativo ? "true" : undefined}
            style={{
              ...itemEstilo,
              ...(timeId === ativo ? { borderColor: "var(--acento-gente)", color: "var(--texto)" } : {}),
            }}
          >
            {timeId}
            {timeId === ativo && <span style={{ fontSize: 10, color: "var(--texto-mudo)" }}> · ativo</span>}
          </button>
        ))}
        {filtrados.length === 0 && (
          <p data-testid="times-sem-resultado" style={{ fontSize: 12, color: "var(--texto-mudo)", margin: "8px 4px" }}>
            Nenhum time com “{busca}”.
          </p>
        )}
      </div>

      {/* O total só aparece quando a lista está cortada: "60 de 60" é ruído. */}
      {comBusca && filtrados.length !== timeIds.length && (
        <p data-testid="times-contagem" style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "6px 4px 0" }}>
          {filtrados.length} de {timeIds.length} times
        </p>
      )}
    </div>
  );
}

const buscaEstilo: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  marginBottom: 6,
};

const rolagemEstilo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  // Teto de rolagem: sem isto, sessenta times empurram o resto da tela para
  // fora — que é o defeito original com outra roupa.
  maxHeight: 260,
  overflowY: "auto",
};

const itemEstilo: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  fontSize: 12.5,
  fontWeight: 600,
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

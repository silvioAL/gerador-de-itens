import { TEMAS, useTema, type PreferenciaDeTema } from "./useTema";

/**
 * SPEC-93 fatia C — o controle de tema.
 *
 * Três botões visíveis, e não um menu: são três opções curtas, e esconder duas
 * atrás de um clique custa mais do que a largura que elas ocupam.
 *
 * O estado atual é marcado com `aria-pressed`, não só com cor — a mesma
 * disciplina que o resto do produto aplica a status (SPEC-76): quem não
 * distingue as cores tem que conseguir ler qual está ativo.
 */
const ROTULO: Record<PreferenciaDeTema, { texto: string; titulo: string }> = {
  sistema: { texto: "auto", titulo: "Segue o tema do seu sistema" },
  claro: { texto: "claro", titulo: "Sempre claro" },
  escuro: { texto: "escuro", titulo: "Sempre escuro" },
};

export function SeletorDeTema() {
  const { preferencia, escolher } = useTema();

  return (
    <div
      data-testid="seletor-de-tema"
      role="group"
      aria-label="Tema"
      style={{ display: "inline-flex", gap: 2, border: "1px solid var(--borda)", borderRadius: 8, padding: 2 }}
    >
      {TEMAS.map((t) => {
        const ativo = preferencia === t;
        return (
          <button
            key={t}
            onClick={() => escolher(t)}
            aria-pressed={ativo}
            title={ROTULO[t].titulo}
            data-testid={`tema-${t}`}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: ativo ? "var(--painel-alto)" : "transparent",
              color: ativo ? "var(--texto)" : "var(--texto-fraco)",
              fontWeight: ativo ? 700 : 400,
            }}
          >
            {ROTULO[t].texto}
          </button>
        );
      })}
    </div>
  );
}

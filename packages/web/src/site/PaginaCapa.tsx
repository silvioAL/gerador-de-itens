import { PAGINAS, rotaDaPagina } from "./paginas";

/**
 * SPEC-95 fatia C — **a capa encolhe.**
 *
 * ## O que ela deixou de fazer
 *
 * Até o §341 a capa carregava as sete peças de diagrama de uma vez: 4800 px, 5,3
 * telas de rolagem. Era o motivo do *"está ficando longa"*.
 *
 * Agora ela faz o que uma capa faz: **diz o que é e mostra por onde entrar.** As
 * peças não sumiram — cada uma tem uma página, e a capa aponta.
 *
 * É a primeira vez nesta série de rodadas em que aquele pedido tem uma prova
 * numérica que o atende, e é a fatia C que a produz.
 *
 * ## Por que a lista de páginas é o corpo da capa
 *
 * A alternativa seria um resumo de cada assunto — e um resumo que explica é uma
 * segunda explicação, que é exatamente o que o §323 mediu como o defeito mais
 * caro desta página. **O resumo aqui promete; a página entrega.**
 */
export function PaginaCapa({ onEntrar }: { onEntrar: () => void }) {
  return (
    <div>
      <section style={{ maxWidth: 700, margin: "0 auto" }} data-testid="capa">
        <h1 style={{ fontSize: 34, lineHeight: 1.18, color: "var(--texto)", margin: "0 0 12px" }}>
          A camada que faz o padrão da casa sobreviver às demandas — e a IA trabalhar dentro dele
        </h1>
        <p style={{ fontSize: 15.5, color: "var(--texto-2)", lineHeight: 1.6, margin: 0, maxWidth: 620 }}>
          Configuração, padrões e specs viram <strong>dado medível</strong>, versionado e evoluído pelo time. O motor
          calcula; a IA escreve; nada vira “pronto” sem alguém confirmar.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
          <button onClick={onEntrar} style={botaoEntrarEstilo}>
            Entrar
          </button>
          <a href={rotaDaPagina(PAGINAS[0])} style={botaoSecundarioEstilo} data-testid="comecar-pelo-problema">
            Começar pelo problema →
          </a>
        </div>
      </section>

      <section style={{ maxWidth: 700, margin: "44px auto 0" }} data-testid="capa-paginas">
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "var(--texto-fraco)",
            marginBottom: 12,
          }}
        >
          O que tem aqui
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {PAGINAS.map((pagina, i) => (
            <li key={pagina.id}>
              <a
                href={rotaDaPagina(pagina)}
                data-testid={`capa-link-${pagina.id}`}
                className="capa-cartao"
                style={{
                  display: "block",
                  border: "1px solid var(--borda)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{ fontSize: 11, fontWeight: 700, color: "var(--texto-mudo)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <strong style={{ fontSize: 14, color: "var(--texto)" }}>{pagina.nome}</strong>
                </div>
                {/* O RESUMO, e não a pergunta: a pergunta é o chapéu da página, e
                    repeti-la aqui faria a capa e a página abrirem igual — que é a
                    repetição que a trava do §323 existe para pegar. */}
                <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "4px 0 0" }}>
                  {pagina.resumo}
                </p>
              </a>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const botaoEntrarEstilo: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 20px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
};

const botaoSecundarioEstilo: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 18px",
  borderRadius: 7,
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-2)",
  textDecoration: "none",
  display: "inline-block",
};

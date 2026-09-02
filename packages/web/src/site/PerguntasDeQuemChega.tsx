import { PAGINAS, rotaDaPagina } from "./paginas";
import { PERGUNTAS } from "./perguntas";

/**
 * §350 — **a capa responde perguntas, em vez de anunciar seções.**
 *
 * A capa listava as cinco páginas pelo nome — *"O problema"*, *"O conceito"* —,
 * que é um índice do que **nós** construímos. Quem chega não procura seções:
 * procura resposta para o que está pensando.
 *
 * ## A pergunta sem resposta fica na lista, marcada
 *
 * É a decisão que faz esta peça valer. Uma das sete não tem página, e ela
 * aparece **igual às outras**, com o que falta escrito ao lado.
 *
 * Esconder seria fácil e seria o defeito que a SPEC-76 impede: a página que
 * omite o buraco é a que envelhece mentindo. E a honestidade aqui vende — *"é
 * para cá que isto vai, e é daqui que já estamos"* é frase em que um arquiteto
 * de organização grande acredita, e a única que ele consegue conferir.
 */
export function PerguntasDeQuemChega() {
  return (
    <section data-testid="perguntas-de-quem-chega" style={{ maxWidth: 700, margin: "0 auto" }}>
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
        O que você provavelmente está se perguntando
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {PERGUNTAS.map((p) => {
          const destino = PAGINAS.find((pg) => pg.id === p.pagina);

          /* Sem página, não é link: um item clicável que não leva a lugar nenhum
             é pior que um item que diz por que não leva. */
          if (!destino) {
            return (
              <li
                key={p.texto}
                data-testid="pergunta-sem-resposta"
                style={{
                  border: "1px solid var(--borda)",
                  borderLeft: "3px solid var(--amarelo)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <strong style={{ fontSize: 14, color: "var(--texto)", lineHeight: 1.45 }}>{p.texto}</strong>
                <p style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.55, margin: "6px 0 0" }}>
                  <strong style={{ color: "var(--amarelo)" }}>Ainda não respondemos isto aqui.</strong> {p.oQueFalta}
                </p>
              </li>
            );
          }

          return (
            <li key={p.texto}>
              <a
                href={rotaDaPagina(destino)}
                data-testid={`pergunta-${destino.id}`}
                className="capa-cartao"
                style={{
                  display: "block",
                  border: "1px solid var(--borda)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  textDecoration: "none",
                }}
              >
                <strong style={{ fontSize: 14, color: "var(--texto)", lineHeight: 1.45, display: "block" }}>
                  {p.texto}
                </strong>
                {/* O nome da página vira a RESPOSTA prometida, não um rótulo de
                    navegação: "O conceito →" diz para onde vai; "responde em: O
                    conceito" diz o que a pessoa ganha ao ir. */}
                <span style={{ fontSize: 12.5, color: "var(--acento-gente-texto)", marginTop: 4, display: "block" }}>
                  {destino.resumo}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

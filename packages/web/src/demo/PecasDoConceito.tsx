import { CAMADAS, CONEXOES, EVOLUCAO, contagemDasConexoes } from "./conceito";
import { MARCA_DE_ESTADO } from "./CicloDoProduto";

/**
 * SPEC-83 fatia C — **os diagramas que explicam o conceito.**
 *
 * Três peças, e nenhuma decorativa:
 *
 * - `AEvolucao` — prompt → agente/skill → camada. É a única que fala do MUNDO
 *   antes de falar da ferramenta, e é a que posiciona o produto.
 * - `AsCamadas` — perene · da demanda · apontamentos · IA, com a IA contida no
 *   meio. É o corte transversal do que o círculo mostra de frente.
 * - `OMapaDeConexoes` — o que entra e o que sai, **marcado**.
 *
 * ## A régua das três
 *
 * Dirigidas pelos mesmos dados (`conceito.ts`), para que não consigam mentir. Um
 * diagrama que listasse uma camada inexistente é o mesmo defeito que a SPEC-76
 * impediu na prosa — e a fatia F cruza estas listas com o produto.
 *
 * Estilo com `React.CSSProperties` sobre as variáveis CSS que já existem: não há
 * design system aqui dentro, e a landing não é o lugar de estrear um.
 */

export function AEvolucao() {
  return (
    <section data-testid="evolucao-do-trabalho" style={secaoEstilo}>
      <h2 style={tituloEstilo}>Você já tem IA. O que falta é onde a regra mora.</h2>
      <p style={proseEstilo}>
        Organizações têm agentes, skills, assistentes de código — e isso não tem sido suficiente. Governança e padrão
        corporativo vivem em cabeça de gente, wiki desatualizada e costume de time: lugares que a IA não alcança de um
        jeito que dê para <strong>conferir</strong>.
      </p>

      <ol style={{ listStyle: "none", padding: 0, margin: "18px 0 0", display: "grid", gap: 10 }}>
        {EVOLUCAO.map((e) => (
          <li
            key={e.numero}
            data-testid={`evolucao-${e.numero}`}
            style={{
              border: "1px solid var(--borda)",
              // O terceiro ganha a barra da marca: é onde este produto opera, e
              // dizer isso com cor é mais honesto que dizer com adjetivo.
              borderLeft: e.aqui ? "3px solid #4f46e5" : "1px solid var(--borda)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--texto-fraco)", fontVariantNumeric: "tabular-nums" }}>
                {e.numero}
              </span>
              <strong style={{ fontSize: 14, color: "var(--texto)" }}>{e.titulo}</strong>
              {e.aqui && (
                <span style={{ fontSize: 11, color: "#4f46e5", fontWeight: 700 }}>← é aqui que esta ferramenta está</span>
              )}
            </div>
            <p style={{ ...proseEstilo, margin: "6px 0 0" }}>
              <strong style={{ color: "var(--texto-2)" }}>O que persiste:</strong> {e.oQuePersiste}
            </p>
            {e.oQueFalta && (
              <p style={{ ...proseEstilo, margin: "4px 0 0", color: "var(--texto-fraco)" }}>{e.oQueFalta}</p>
            )}
          </li>
        ))}
      </ol>

      <p style={{ ...proseEstilo, marginTop: 14 }}>
        A diferença entre o segundo e o terceiro não é rigidez: é que <strong>a camada tem quem a evolua</strong> — e a
        evolução também é assistida.
      </p>
    </section>
  );
}

export function AsCamadas() {
  return (
    <section data-testid="as-camadas" style={secaoEstilo}>
      <h2 style={tituloEstilo}>Quatro camadas, e a IA no meio</h2>
      <p style={proseEstilo}>
        <strong>A borda não existe para conter a IA. Existe para que valha a pena colocá-la no meio.</strong> Sem schema
        de processo, acelerar é acelerar na direção errada com boa redação.
      </p>

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {CAMADAS.map((c, i) => (
          <div
            key={c.id}
            data-testid={`camada-${c.id}`}
            style={{
              border: "1px solid var(--borda)",
              borderRadius: 10,
              padding: "12px 14px",
              // Recuo crescente: as de fora contêm as de dentro, e a IA é a mais
              // interna. É o mesmo desenho do círculo, visto de lado.
              marginLeft: i * 14,
              background: c.id === "ia" ? "var(--painel-alto, transparent)" : "transparent",
            }}
          >
            <strong style={{ fontSize: 13.5, color: "var(--texto)" }}>{c.titulo}</strong>
            <p style={{ ...proseEstilo, margin: "4px 0 0" }}>{c.oQueE}</p>
            <p style={{ fontSize: 11.5, color: "var(--texto-fraco)", margin: "4px 0 0" }}>{c.ondeVive}</p>
            {c.destaque && (
              <p
                style={{
                  ...proseEstilo,
                  margin: "8px 0 0",
                  paddingLeft: 10,
                  borderLeft: "2px solid #4f46e5",
                  color: "var(--texto-2)",
                }}
              >
                {c.destaque}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function OMapaDeConexoes() {
  const { existem, total } = contagemDasConexoes();
  const entram = CONEXOES.filter((c) => c.sentido === "entra");
  const saem = CONEXOES.filter((c) => c.sentido === "sai");

  return (
    <section data-testid="mapa-de-conexoes" style={secaoEstilo}>
      <h2 style={tituloEstilo}>E ela conversa com o que você já tem</h2>
      <p style={proseEstilo}>
        A camada perene não termina aqui dentro: o repositório de decisões da casa e as ferramentas onde o time já
        trabalha são perenes pelos mesmos motivos.{" "}
        <strong>
          {existem} de {total} caminhos existem hoje
        </strong>{" "}
        — os outros aparecem marcados, porque dizer que já funcionam seria a única mentira que esta página não pode
        contar.
      </p>

      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        {[
          { rotulo: "Entra", itens: entram },
          { rotulo: "Sai", itens: saem },
        ].map(({ rotulo, itens }) => (
          <div key={rotulo}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--texto-fraco)", textTransform: "uppercase" }}>
              {rotulo}
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "grid", gap: 8 }}>
              {itens.map((c) => {
                const marca = MARCA_DE_ESTADO[c.estado];
                return (
                  <li
                    key={c.id}
                    data-testid={`conexao-${c.id}`}
                    style={{ border: "1px solid var(--borda)", borderRadius: 10, padding: "10px 12px" }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span aria-hidden style={{ color: marca.cor }}>
                        {marca.icone}
                      </span>
                      <strong style={{ fontSize: 13.5, color: "var(--texto)" }}>{c.titulo}</strong>
                      {c.estado !== "completo" && (
                        <span style={{ fontSize: 11, color: marca.cor, fontWeight: 700 }}>{marca.rotulo}</span>
                      )}
                    </div>
                    <p style={{ ...proseEstilo, margin: "4px 0 0" }}>{c.detalhe}</p>
                    {c.oQueFalta && (
                      <p style={{ fontSize: 11.5, color: "var(--texto-fraco)", margin: "4px 0 0" }}>
                        <strong>O que falta:</strong> {c.oQueFalta}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const secaoEstilo: React.CSSProperties = { maxWidth: 700, margin: "0 auto" };

const tituloEstilo: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  color: "var(--texto)",
  margin: "0 0 8px",
  lineHeight: 1.3,
};

const proseEstilo: React.CSSProperties = {
  fontSize: 13.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  margin: 0,
};

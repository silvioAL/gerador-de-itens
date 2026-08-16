import type { AgenteDoMapa, EstadoDoAgente, MapaDoSistema } from "@gerador/aplicacao";

/**
 * SPEC-59 fatia A — o CANVAS DO SISTEMA, em leitura.
 *
 * ## Por que uma tela nova em vez de mais uma aba
 *
 * Três telas de configuração descrevem um **fluxo**, e formulário mostra os
 * campos escondendo a ligação: a esteira se chama esteira e é mostrada como
 * lista; o motor de regras é uma cadeia partida em quatro abas; e o PDCA se
 * chama *ciclo* sem que o ciclo apareça em lugar nenhum. Esta tela é a vista
 * que as reúne — por isso rota própria (`#/sistema`), e não uma décima terceira
 * aba dentro de `#/config`.
 *
 * ## Ela NÃO edita, e isso é a decisão que a torna barata
 *
 * A mesa de projeto erra o desenho de uma demanda; um canvas de configuração
 * erraria a ferramenta inteira. Editar aqui é a fatia D, e depende de um portão
 * (ver o efeito antes de aplicar) que a fatia A não precisa ter porque não
 * aplica nada. Cada bloco leva para a tela que edita aquilo.
 *
 * ## Por que não reusa o `Canvas` de verdade
 *
 * O `Canvas` já é dirigido por `DiagramaConfig` — mas recebe `UseQuebra`, que é
 * o estado do DOMÍNIO. Reusá-lo exige separar "estado de um diagrama" de
 * "estado de uma quebra", que é a fatia C. Fazer isso agora seria pagar o
 * refactor antes de saber se a vista convence.
 */
export interface SistemaScreenProps {
  mapa: MapaDoSistema;
  onAbrirConfig: (area: "pipeline" | "regras" | "pdca" | "modeloIa") => void;
  onVoltar: () => void;
}

const ROTULO_ESTADO: Record<EstadoDoAgente, string> = {
  ativo: "ativo",
  desligado: "desligado",
  "sem-credencial": "sem modelo",
};

const COR_ESTADO: Record<EstadoDoAgente, string> = {
  ativo: "var(--verde)",
  desligado: "var(--texto-mudo)",
  "sem-credencial": "var(--amarelo)",
};

/** O rosto do papel. Emoji e não ilustração: é o único jeito de ter avatar sem
 * arrastar arquivo de imagem nem dependência nova — e ele lê igual em qualquer
 * tema. O rosto diz o PAPEL; o anel colorido diz o ESTADO (SPEC-59 §4). */
const ROSTO_POR_GRUPO: Record<string, string> = {
  "história e critérios de aceite": "🧑‍💼",
  "contrato de arquitetura": "🏛",
  "refinamento técnico": "🔧",
  "regras de teste e cenários": "🧪",
};

export function SistemaScreen({ mapa, onAbrirConfig, onVoltar }: SistemaScreenProps) {
  return (
    <div data-testid="sistema-screen" style={fundoEstilo}>
      <header style={barraEstilo}>
        <button onClick={onVoltar} style={linkEstilo}>
          ← Voltar à mesa de projeto
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
          vista de leitura — cada bloco leva à tela que edita
        </span>
      </header>

      <div style={folhaEstilo}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Como esta ferramenta está montada</h1>
        <p style={{ fontSize: 13, color: "var(--texto-fraco)", margin: "0 0 20px", maxWidth: "44rem" }}>
          O que o <strong>motor</strong> confere, quem <strong>escreve</strong> cada parte do item, e como o que o time
          responde depois volta a mudar os dois.
        </p>

        {mapa.avisos.length > 0 && (
          <ul data-testid="avisos-do-sistema" style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 6 }}>
            {mapa.avisos.map((a) => (
              <li key={a} style={avisoEstilo}>
                {a}
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          <Bloco
            testid="bloco-regras"
            titulo="O motor confere"
            legenda="tech × contexto → requisito → régua"
            onAbrir={() => onAbrirConfig("regras")}
          >
            {mapa.regras.length === 0 ? (
              <Vazio texto="Nenhuma regra configurada." />
            ) : (
              mapa.regras.map((r) => (
                <div key={r.tech} data-testid={`regra-${r.tech}`} style={linhaEstilo}>
                  <strong style={{ fontSize: 13 }}>{r.tech}</strong>
                  <div style={{ fontSize: 12, color: "var(--texto-fraco)" }}>
                    {r.requisitos} requisito(s) ·{" "}
                    {/* A distinção é o §239: texto que alguém lê × régua que o
                        motor avalia. Somar os dois esconderia justamente isso. */}
                    <span style={{ color: r.conferiveis > 0 ? "var(--verde)" : "var(--amarelo)" }}>
                      {r.conferiveis} conferível(is)
                    </span>{" "}
                    · {r.testes} teste(s)
                  </div>
                </div>
              ))
            )}
            <div style={{ ...linhaEstilo, borderBottom: "none" }}>
              <strong style={{ fontSize: 13 }}>Caminhos</strong>
              <div style={{ fontSize: 12, color: mapa.regrasDePercurso > 0 ? "var(--texto-fraco)" : "var(--amarelo)" }}>
                {mapa.regrasDePercurso} régua(s) de percurso
              </div>
            </div>
          </Bloco>

          <Bloco
            testid="bloco-esteira"
            titulo="A esteira escreve"
            legenda="em sequência, sobre o mesmo item"
            onAbrir={() => onAbrirConfig("pipeline")}
          >
            {mapa.agentes.length === 0 ? (
              <Vazio texto="Nenhum papel na esteira." />
            ) : (
              mapa.agentes.map((a) => <Agente key={a.id} agente={a} onConfigurarIa={() => onAbrirConfig("modeloIa")} />)
            )}
          </Bloco>
        </div>

        {/* O item é o centro: as duas colunas acima existem para produzi-lo, e
            é dele que sai o uso que alimenta o PDCA. */}
        <div data-testid="bloco-item" style={itemCentralEstilo}>
          ↓ os dois produzem <strong>o item de trabalho</strong> ↓
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
          <Bloco
            testid="bloco-pdca"
            titulo="E o uso volta a mudar os dois"
            legenda="uso → feedback → proposta → aplicar"
            onAbrir={() => onAbrirConfig("pdca")}
            largura={1}
          >
            <div style={{ ...linhaEstilo, borderBottom: "none" }}>
              <div style={{ fontSize: 13 }}>
                {mapa.pdca.temTrabalho ? (
                  <strong data-testid="pdca-com-trabalho" style={{ color: "var(--amarelo)" }}>
                    {mapa.pdca.feedbacksAbertos} feedback(s) esperando virar ajuste
                  </strong>
                ) : (
                  <span style={{ color: "var(--texto-fraco)" }}>Nenhum feedback aberto.</span>
                )}
              </div>
              <p style={{ fontSize: 12, color: "var(--texto-mudo)", margin: "6px 0 0", lineHeight: 1.5 }}>
                {/* É a seta que fecha o laço, e ela não existia em tela nenhuma.
                    Sem ela, "ciclo" era só o nome da aba. */}
                O que o time responde depois de gerar vira proposta de ajuste — você vê o efeito num item de exemplo
                antes de decidir, e a configuração acima muda de verdade. É o que fecha o ciclo.
              </p>
            </div>
          </Bloco>
        </div>
      </div>
    </div>
  );
}

function Agente({ agente, onConfigurarIa }: { agente: AgenteDoMapa; onConfigurarIa: () => void }) {
  const cor = COR_ESTADO[agente.estado];
  return (
    <div data-testid={`agente-${agente.id}`} data-estado={agente.estado} style={{ ...linhaEstilo, flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <div style={{ position: "relative", flex: "none" }}>
        <span
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: "50%",
            fontSize: 19,
            background: "var(--painel)",
            // O anel É o estado. Avatar que não carrega estado é adesivo.
            border: `2px solid ${cor}`,
            opacity: agente.estado === "desligado" ? 0.5 : 1,
          }}
        >
          {ROSTO_POR_GRUPO[agente.escreve] ?? "🤖"}
        </span>
        <span style={{ position: "absolute", top: -4, left: -4, fontSize: 10, fontWeight: 700, color: "var(--texto-mudo)" }}>
          {agente.ordem}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{agente.nome}</strong>
          <span data-testid={`estado-${agente.id}`} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: cor }}>
            {ROTULO_ESTADO[agente.estado]}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--texto-fraco)" }}>escreve: {agente.escreve}</div>
        {agente.contextos.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--texto-mudo)" }}>só em: {agente.contextos.join(", ")}</div>
        )}
        {agente.estado === "sem-credencial" && (
          // O aviso leva à solução, em vez de só nomear o problema.
          <button onClick={onConfigurarIa} style={{ ...linkEstilo, fontSize: 11, marginTop: 2 }}>
            configurar o modelo de IA →
          </button>
        )}
      </div>
    </div>
  );
}

function Bloco({
  testid,
  titulo,
  legenda,
  onAbrir,
  largura,
  children,
}: {
  testid: string;
  titulo: string;
  legenda: string;
  onAbrir: () => void;
  largura?: number;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testid} style={{ ...blocoEstilo, flex: largura }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <h2 style={{ fontSize: 14, margin: 0 }}>{titulo}</h2>
        <div style={{ flex: 1 }} />
        <button onClick={onAbrir} style={linkEstilo}>
          configurar →
        </button>
      </header>
      <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "0 0 10px", letterSpacing: ".02em" }}>{legenda}</p>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p style={{ fontSize: 12, color: "var(--texto-mudo)", fontStyle: "italic", margin: 0 }}>{texto}</p>;
}

const fundoEstilo: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 55,
  overflow: "auto",
  background: "var(--fundo, #0b1220)",
  fontFamily: "system-ui, sans-serif",
};

const barraEstilo: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 20px",
  borderBottom: "1px solid var(--borda)",
  background: "var(--painel)",
};

const folhaEstilo: React.CSSProperties = {
  maxWidth: "min(980px, calc(100vw - 48px))",
  margin: "28px auto 80px",
  padding: "32px 36px",
  borderRadius: 16,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
};

const blocoEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: "14px 16px",
  background: "var(--painel-2, transparent)",
};

const linhaEstilo: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "8px 0",
  borderBottom: "1px solid var(--borda)",
};

const itemCentralEstilo: React.CSSProperties = {
  margin: "18px 0",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px dashed var(--borda-forte)",
  textAlign: "center",
  fontSize: 13,
  color: "var(--texto-2)",
};

const avisoEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--amarelo)",
  borderLeft: "3px solid var(--amarelo)",
  paddingLeft: 10,
  lineHeight: 1.5,
};

const linkEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: 0,
  border: "none",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
  textAlign: "left",
};

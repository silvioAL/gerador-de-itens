import type { MetricasDoCiclo } from "../api/client";

/**
 * SPEC-94 fatia Z (§343) — **o ciclo de configuração, medido.**
 *
 * ## Por que este painel existe
 *
 * O usuário: *"não é PDCA sem análise crítica muito bem estruturada"* e *"o da
 * configuração faz parte, precisamos de métricas dele"*.
 *
 * A SPEC-94 §3 mediu que o ciclo do produto é `sentir → texto → aprovar →
 * aplicar`, com gatilho de **uso individual**. Isso é Plan, Do e Act: a etapa de
 * análise não existe. Este painel é a primeira entrada dela — e a única que não
 * depende de canal externo, porque o dado já está gravado.
 *
 * ## A régua que governa cada número aqui
 *
 * **`null` é "ainda não há o que medir"; `0` é uma afirmação.** Um conjunto
 * vazio exibido como `0%` lê como *"está tudo ótimo"* — e é a forma mais barata
 * de um painel mentir. É a mesma disciplina da lacuna contável: o que não se
 * sabe aparece como não sabido, nunca como bom.
 *
 * ## E um dos números mede o próprio produto
 *
 * `sinalQueMorre` conta o feedback que ninguém leu. O produto interrompe a
 * pessoa a cada N gerações para perguntar *"o que faltou ou sobrou?"* — se a
 * resposta apodrece, estamos gastando a atenção de quem trabalha para alimentar
 * um arquivo. Ele fica em destaque **quando é maior que zero**, e não escondido
 * num rodapé: a régua desta casa é que medida que ninguém contesta vira ruído, e
 * essa vale contra nós.
 */
export function PainelDaAnalise({ metricas }: { metricas: MetricasDoCiclo | null }) {
  if (!metricas) return null;

  const m = metricas;
  const vazio = m.solicitacoes === 0 && m.feedback.total === 0;

  return (
    <section data-testid="analise-do-ciclo">
      <h3 style={tituloEstilo}>Como o ciclo está andando</h3>
      <p style={proseEstilo}>
        O que este ciclo produziu até agora — não quantas vezes ele foi usado. É a entrada da análise crítica: o que
        está parado, o que se repete, e o que foi coletado e ninguém leu.
      </p>

      {vazio ? (
        <p style={vazioEstilo} data-testid="analise-sem-dado">
          Ainda não há o que medir: nenhum feedback e nenhuma solicitação foram registrados.
        </p>
      ) : (
        <>
          <div style={grade}>
            <Medida
              testid="medida-pendentes"
              rotulo="Esperando decisão"
              valor={m.pendentes === 0 ? "nenhuma" : String(m.pendentes)}
              nota={
                m.diasDaEsperaMaisVelha === null
                  ? undefined
                  : `a mais velha há ${m.diasDaEsperaMaisVelha} ${m.diasDaEsperaMaisVelha === 1 ? "dia" : "dias"}`
              }
            />
            <Medida
              testid="medida-tempo-decisao"
              rotulo="Tempo até decidir"
              valor={m.horasAteDecisaoMediana === null ? SEM_DADO : formatarDuracao(m.horasAteDecisaoMediana)}
              nota="mediana — a espera extrema tem medida própria"
            />
            <Medida
              testid="medida-invalidacao"
              rotulo="Invalidadas"
              valor={m.taxaDeInvalidacao === null ? SEM_DADO : percentual(m.taxaDeInvalidacao)}
              /* Quando sobe, o problema não é quem pediu: é o intervalo entre o
                 pedido e a decisão. Dizer isso aqui evita a leitura errada. */
              nota="a config mudou antes de alguém decidir"
              alerta={m.taxaDeInvalidacao !== null && m.taxaDeInvalidacao > 0.2}
            />
            <Medida
              testid="medida-conversao"
              rotulo="Virou pedido"
              valor={m.feedback.conversaoEmAjuste === null ? SEM_DADO : percentual(m.feedback.conversaoEmAjuste)}
              nota={`de ${m.feedback.total} ${m.feedback.total === 1 ? "resposta" : "respostas"} coletadas`}
            />
          </div>

          {m.feedback.sinalQueMorre > 0 && (
            <p style={alertaEstilo} data-testid="sinal-que-morre">
              <strong>
                {m.feedback.sinalQueMorre}{" "}
                {m.feedback.sinalQueMorre === 1 ? "resposta esperando" : "respostas esperando"} há mais de um mês.
              </strong>{" "}
              O assistente interrompe quem trabalha para coletar isto. Enquanto ninguém lê, o certo é responder — ou
              parar de perguntar.
            </p>
          )}

          {m.rejeitadasSemMotivo > 0 && (
            <p style={notaEstilo} data-testid="rejeitadas-sem-motivo">
              {m.rejeitadasSemMotivo} {m.rejeitadasSemMotivo === 1 ? "recusa" : "recusas"} sem o porquê escrito. Não é
              obrigatório — mas quem reabrir o assunto depois não vai saber o que já foi pesado.
            </p>
          )}

          {m.concentracaoPorRecurso.length > 0 && (
            <div style={{ marginTop: 12 }} data-testid="concentracao-por-recurso">
              <strong style={{ fontSize: 12.5, color: "var(--texto)" }}>Onde os pedidos se concentram</strong>
              {/**
               * A leitura desta lista é o argumento do `CONCEITO.md`: *"se cinco
               * times violam o mesmo padrão, o padrão está errado, não os
               * times"*. A SPEC-94 §2.3 mediu que não havia código computando
               * isso; esta lista é a primeira metade dele.
               */}
              <p style={{ ...proseEstilo, margin: "2px 0 6px" }}>
                O que mais gera pedido é o que menos serve como está — é por aí que a análise começa.
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {m.concentracaoPorRecurso.map((c) => (
                  <li key={c.recurso} style={linhaDeRecurso} data-testid={`recurso-${c.recurso}`}>
                    <span style={{ fontSize: 12.5, color: "var(--texto)" }}>{c.recurso}</span>
                    <span style={{ fontSize: 12, color: "var(--texto-fraco)" }}>
                      {c.total} {c.total === 1 ? "pedido" : "pedidos"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** O texto do que não se sabe. Escrito uma vez, para não haver duas maneiras de
 *  dizer a mesma ausência em cantos diferentes da tela. */
const SEM_DADO = "ainda não há";

function Medida({
  rotulo,
  valor,
  nota,
  alerta,
  testid,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  alerta?: boolean;
  testid: string;
}) {
  return (
    <div style={{ ...cartao, borderLeftColor: alerta ? "var(--amarelo)" : "var(--borda-forte)" }} data-testid={testid}>
      <div style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>{rotulo}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--texto)", marginTop: 2 }}>{valor}</div>
      {nota && <div style={{ fontSize: 11, color: "var(--texto-fraco)", marginTop: 2, lineHeight: 1.4 }}>{nota}</div>}
    </div>
  );
}

/**
 * Horas viram dias quando passam de 48: "72 h" é aritmética, "3 dias" é o que
 * alguém responde quando perguntam quanto demorou.
 *
 * E abaixo de uma hora vira **"menos de 1 h"**: a stack real exibiu `0 h` —
 * decisões tomadas no mesmo instante em que o pedido nasceu, o que é verdade e
 * lê como defeito. Zero é o número certo e a palavra errada.
 */
function formatarDuracao(horas: number): string {
  if (horas < 1) return "menos de 1 h";
  if (horas < 48) return `${horas} h`;
  const d = Math.round(horas / 24);
  return `${d} dias`;
}

function percentual(v: number): string {
  return `${Math.round(v * 100)}%`;
}

const tituloEstilo: React.CSSProperties = { fontSize: 14, margin: "0 0 4px", color: "var(--texto)" };
const proseEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.55, margin: "0 0 10px" };
const vazioEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto-fraco)", margin: 0 };
const grade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
};
const cartao: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderLeft: "3px solid var(--borda-forte)",
  borderRadius: 8,
  padding: "9px 11px",
};
const alertaEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.55,
  margin: "12px 0 0",
  padding: "9px 11px",
  border: "1px solid var(--borda)",
  borderLeft: "3px solid var(--amarelo)",
  borderRadius: 8,
};
const notaEstilo: React.CSSProperties = { fontSize: 12, color: "var(--texto-fraco)", lineHeight: 1.5, margin: "8px 0 0" };
const linhaDeRecurso: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  borderBottom: "1px solid var(--borda)",
  padding: "4px 2px",
};

import { useState } from "react";
import type { Necessidade } from "@gerador/engine";
import { analisarLacunas, necessidadeConta } from "@gerador/engine";
import { Delta } from "../summary/Delta";

export interface ElementoVinculavel {
  id: string;
  label: string;
}

export interface NecessidadesPanelProps {
  necessidades: Necessidade[];
  /** Nós do diagrama, para vincular. Vazio = desenho ainda em branco. */
  elementos: ElementoVinculavel[];
  onMudar: (necessidades: Necessidade[]) => void;
  /** SPEC-57 fatia D — pede a proposta ao agente. Ausente = botão não aparece
   * (é o caso do teste de unidade e de quem não tem IA configurada). */
  onPropor?: () => Promise<void> | void;
  /** Verdadeiro enquanto o agente responde. */
  propondo?: boolean;
  /** O que o agente respondeu de errado, dito onde se pediu. */
  erroDaProposta?: string | null;
}

/**
 * SPEC-57 fatia A (M1 + M6) — o PROPÓSITO da demanda, e o que responde por ele.
 *
 * Mora dentro do "📎 Contexto do épico" porque é a mesma pergunta que o resto
 * daquele painel faz — "do que esta demanda trata" —, só que respondida em
 * itens discretos em vez de prosa. Prosa não se liga a nó nenhum e não se
 * confere; é por isso que a necessidade é objeto e não parágrafo.
 *
 * O vínculo é editado **aqui**, junto da necessidade, e não no painel do nó.
 * Os dois lugares se defendem, e escolhi este por um motivo prático: é onde a
 * LACUNA aparece. Ligar a partir do nó é o incremento natural depois — quando
 * a pessoa já sabe qual buraco está fechando.
 */
export function NecessidadesPanel({
  necessidades,
  elementos,
  onMudar,
  onPropor,
  propondo,
  erroDaProposta,
}: NecessidadesPanelProps) {
  const [texto, setTexto] = useState("");
  const [prioridade, setPrioridade] = useState<"alta" | "media" | "baixa">("media");

  function adicionar() {
    const limpo = texto.trim();
    if (limpo === "") return;
    onMudar([
      ...necessidades,
      {
        // Sem `crypto.randomUUID` por compatibilidade de ambiente de teste: o id
        // só precisa ser estável e único dentro da quebra, não global.
        id: `nec-${Date.now().toString(36)}-${necessidades.length}`,
        texto: limpo,
        prioridade,
        origem: "manual",
        atendidaPor: [],
      },
    ]);
    setTexto("");
  }

  function alterar(id: string, muda: (n: Necessidade) => Necessidade) {
    onMudar(necessidades.map((n) => (n.id === id ? muda(n) : n)));
  }

  const rotuloDoElemento = (id: string) => elementos.find((e) => e.id === id)?.label ?? id;
  const elementoExiste = (id: string) => elementos.some((e) => e.id === id);

  // SPEC-57 fatia D — a proposta MEDIDA antes de aceitar. O engine roda duas
  // vezes: como está, e como ficaria se tudo o que está sugerido virasse real.
  //
  // Nota honesta sobre o que este delta mostra: a §M4 da SPEC-57 imaginava a
  // confiança PIORANDO ao aceitar. Aquilo vale para proposta de DESENHO, que
  // traz campos não conferidos junto. Aqui confirmar É a leitura, então o
  // número que pode piorar é outro — e é mais útil: aceitar propósito sem
  // ninguém que responda por ele CRIA lacuna. É esse trabalho que a pessoa
  // precisa ver antes de dizer sim.
  const diagramaAtual = { nodes: elementos.map((e) => ({ id: e.id })), edges: [] } as never;
  const pendentes = necessidades.filter((n) => !necessidadeConta(n));
  const lacunasAgora = analisarLacunas(diagramaAtual, necessidades).semElemento.length;
  const lacunasSeAceitar = analisarLacunas(
    diagramaAtual,
    necessidades.map((n) => ({ ...n, confirmado: true }))
  ).semElemento.length;

  function confirmarTodas() {
    onMudar(necessidades.map((n) => (necessidadeConta(n) ? n : { ...n, confirmado: true })));
  }

  return (
    <div aria-label="Necessidades da demanda">
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--texto-fraco)" }}>
        O que esta demanda precisa resolver. Cada necessidade é ligada ao componente que responde por ela — e o que
        ficar sem ninguém aparece como lacuna, antes de virar item.
      </p>

      {onPropor && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => void onPropor()} disabled={propondo} style={botaoEstilo}>
            {propondo ? "✦ propondo…" : "✦ Propor a partir do contexto"}
          </button>
          {erroDaProposta && (
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--vermelho)" }}>{erroDaProposta}</p>
          )}
        </div>
      )}

      {/* O delta: o efeito de aceitar, ANTES de aceitar.
          §263 — passou a usar o `Delta` compartilhado. Era a caixa original, e
          agora é uma das três: decisão e caminho ganharam a mesma. Manter três
          cópias parecidas garantiria divergirem na terceira mudança. */}
      {pendentes.length > 0 && (
        <Delta
          data-testid="delta-da-proposta"
          titulo={`${pendentes.length} sugerida(s), ainda sem efeito`}
          remedicao={{
            linhas: [{ rotulo: "Se aceitar tudo: lacunas", antes: lacunasAgora, depois: lacunasSeAceitar }],
            alerta:
              lacunasSeAceitar > lacunasAgora ? "Cuidado: aceitar propósito sem componente cria trabalho." : undefined,
          }}
        >
          <button onClick={confirmarTodas} style={{ ...botaoEstilo, marginTop: 6 }}>
            Confirmar todas
          </button>
        </Delta>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          aria-label="Nova necessidade"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") adicionar();
          }}
          placeholder="Ex.: o pedido não pode ser cobrado duas vezes"
          style={{
            flex: 1,
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid var(--borda-forte)",
            background: "var(--fundo)",
            color: "var(--texto)",
            fontSize: 13,
          }}
        />
        <select
          aria-label="Prioridade da nova necessidade"
          value={prioridade}
          onChange={(e) => setPrioridade(e.target.value as "alta" | "media" | "baixa")}
          style={{ padding: "7px 8px", borderRadius: 8, border: "1px solid var(--borda-forte)", background: "var(--fundo)", color: "var(--texto)", fontSize: 12 }}
        >
          <option value="alta">alta</option>
          <option value="media">média</option>
          <option value="baixa">baixa</option>
        </select>
        <button onClick={adicionar} style={botaoEstilo}>
          + Adicionar
        </button>
      </div>

      {necessidades.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--texto-mudo)" }}>
          Nenhuma necessidade declarada — a demanda funciona igual, e nada aparece como lacuna.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {necessidades.map((n) => {
            const vivos = n.atendidaPor.filter(elementoExiste);
            const quebrados = n.atendidaPor.filter((id) => !elementoExiste(id));
            const conta = necessidadeConta(n);
            const emLacuna = conta && vivos.length === 0;

            return (
              <li
                key={n.id}
                data-testid={`necessidade-${n.id}`}
                data-lacuna={emLacuna ? "sim" : undefined}
                style={{
                  border: `1px solid ${emLacuna ? "var(--amarelo)" : "var(--borda)"}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: "var(--painel)",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{n.texto}</span>
                  <span style={{ fontSize: 10, color: "var(--texto-mudo)" }}>{n.prioridade ?? "media"}</span>
                  <button
                    aria-label={`Remover necessidade: ${n.texto}`}
                    onClick={() => onMudar(necessidades.filter((x) => x.id !== n.id))}
                    style={{ ...botaoEstilo, padding: "2px 7px" }}
                  >
                    ×
                  </button>
                </div>

                {/* Regra 2 da SPEC-57: sugerida não conta até alguém confirmar —
                    e enquanto não conta, não acusa lacuna nem dá nó por atendido. */}
                {!conta && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--texto-fraco)" }}>
                    Sugerida — ainda não conta.{" "}
                    <button
                      aria-label={`Confirmar necessidade: ${n.texto}`}
                      onClick={() => alterar(n.id, (x) => ({ ...x, confirmado: true }))}
                      style={{ ...botaoEstilo, padding: "2px 8px" }}
                    >
                      Confirmar
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  {vivos.map((id) => (
                    <span key={id} style={chipEstilo}>
                      {rotuloDoElemento(id)}
                      <button
                        aria-label={`Desvincular ${rotuloDoElemento(id)} de: ${n.texto}`}
                        onClick={() =>
                          alterar(n.id, (x) => ({ ...x, atendidaPor: x.atendidaPor.filter((e) => e !== id) }))
                        }
                        style={{ ...botaoEstilo, padding: "0 5px", marginLeft: 4 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {/* Vínculo apontando para nó apagado: não some sozinho — é o
                      evento que precisa reaparecer (ver `analisarLacunas`). */}
                  {quebrados.map((id) => (
                    <span key={id} style={{ ...chipEstilo, borderColor: "var(--vermelho)" }} title="O componente vinculado não existe mais no desenho">
                      {id} (removido)
                      <button
                        aria-label={`Limpar vínculo quebrado ${id} de: ${n.texto}`}
                        onClick={() =>
                          alterar(n.id, (x) => ({ ...x, atendidaPor: x.atendidaPor.filter((e) => e !== id) }))
                        }
                        style={{ ...botaoEstilo, padding: "0 5px", marginLeft: 4 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {elementos.length > 0 && (
                    <select
                      aria-label={`Vincular componente a: ${n.texto}`}
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        alterar(n.id, (x) =>
                          x.atendidaPor.includes(id) ? x : { ...x, atendidaPor: [...x.atendidaPor, id] }
                        );
                      }}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid var(--borda-forte)", background: "var(--fundo)", color: "var(--texto)", fontSize: 11 }}
                    >
                      <option value="">+ vincular componente…</option>
                      {elementos
                        .filter((e) => !n.atendidaPor.includes(e.id))
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                    </select>
                  )}

                  {emLacuna && (
                    <span style={{ fontSize: 11, color: "var(--amarelo)" }}>
                      sem componente que responda por isto
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const botaoEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 12,
  cursor: "pointer",
};

const chipEstilo: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  fontSize: 11,
  color: "var(--texto-fraco)",
};

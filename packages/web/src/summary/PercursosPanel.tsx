import { useEffect, useRef, useState } from "react";
import { percursoConta } from "@gerador/engine";
import type { Percurso, PercursoNaoMedido, Remedicao, ViolacaoDePercurso } from "@gerador/engine";
import { Delta } from "./Delta";

/**
 * SPEC-57 fatia E — os CAMINHOS do desenho, no placar.
 *
 * O chip cobra três coisas diferentes e diz qual, porque cada uma pede uma ação
 * diferente de quem lê:
 *
 * - **a confirmar** — o motor inferiu caminhos e ninguém olhou. Inferir é
 *   grátis e erra (§5 pergunta 4 da SPEC-57), então nada é medido antes do
 *   aceite;
 * - **fora do padrão** — um caminho confirmado estourou a régua;
 * - **sem medir** — a régua não conseguiu rodar porque falta campo no caminho.
 *   Este é o estado que mais importa não esconder: somar só o que existe
 *   produziria um verde falso, e verde falso encerra a pergunta.
 */
export interface PercursosPanelProps {
  /** Os caminhos que o desenho de AGORA produz, em qualquer estado. */
  percursos: Percurso[];
  /**
   * §283 — confirmados que sumiram do desenho. Chegam separados porque
   * concatená-los aos vivos (como se fazia) os desenhava com o mesmo `✓` de um
   * caminho que existe: o `conciliarPercursos` promete "vira obsoleto em vez de
   * desaparecer", e a promessa morria aqui na renderização.
   */
  obsoletos?: Percurso[];
  violacoes: ViolacaoDePercurso[];
  naoMedidos: PercursoNaoMedido[];
  /** `true` quando a inferência parou no teto — a lista está incompleta. */
  truncado?: boolean;
  onConfirmar: (id: string) => void;
  onDescartar: (id: string) => void;
  /**
   * §283 — apaga a DECISÃO registrada sobre um caminho, e é o que faltava para
   * confirmar e recusar deixarem de ser portas de mão única.
   *
   * Um handler só para os três casos, porque no modelo é a mesma operação —
   * esquecer o que foi decidido —, e o que muda é só o que sobra depois:
   *
   * - **confirmado** → volta a "a confirmar" (o inferidor o reoferece);
   * - **recusado** → volta a "a confirmar", pelo mesmo caminho;
   * - **obsoleto** → some de vez, porque o desenho não o produz mais.
   *
   * Ausente = os botões não aparecem (mesma disciplina do `onSelecionarNo`).
   */
  onReabrir?: (id: string) => void;
  /**
   * SPEC-64 fatia B — começa a declarar um caminho à mão. Ausente = o produto
   * segue só aceitando ou recusando o que o motor leu.
   */
  onDeclarar?: () => void;
  /**
   * SPEC-64 fatia C — corrigir o que o motor sugeriu, usando a sequência dele
   * como ponto de partida. É o verbo que faltava: sem ele, um trajeto quase
   * certo só podia ser recusado.
   *
   * Recebe o PERCURSO, e não o id: o caminho inferido é recalculado a cada
   * render e **não está guardado na quebra** — quem o tem em mãos é este
   * painel. Passar o id fazia o App procurar em `quebra.percursos` e achar
   * nada, e a correção começava vazia (achado do E2E).
   */
  onAjustar?: (percurso: Percurso) => void;
  /** SPEC-60 fatia A — o que confirmar ESTE caminho põe no backlog. Devolver
   * `undefined` (ou não passar) é dizer "não sei medir", e aí o botão fica
   * como era: confirmar nunca depende de haver medição. */
  remedirConfirmacao?: (id: string) => Remedicao | undefined;
  /** Leva ao primeiro nó do caminho — sem isto o número seria um beco. */
  onSelecionarNo?: (noId: string) => void;
  /** SPEC-64 — o campo que falta pode estar na CONEXÃO (o `timeoutMs` de uma
   * chamada síncrona mora lá). Sem isto, o endereço apontaria para o nada. */
  onSelecionarAresta?: (arestaId: string) => void;
}

export function PercursosPanel({
  percursos,
  obsoletos = [],
  violacoes,
  naoMedidos,
  truncado,
  onConfirmar,
  onDescartar,
  onReabrir,
  onDeclarar,
  onAjustar,
  onSelecionarNo,
  onSelecionarAresta,
  remedirConfirmacao,
}: PercursosPanelProps) {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  // Três estados, não dois: `undefined` = o motor inferiu e ninguém olhou;
  // `true` = confirmado; `false` = a pessoa disse que não é caminho. Tratar
  // `false` como "a confirmar" faria o botão "não é caminho" não fazer nada —
  // o inferidor devolveria o mesmo caminho no render seguinte, para sempre.
  const aConfirmar = percursos.filter((p) => p.origem === "inferido" && p.confirmado === undefined);
  /**
   * Os que CONTAM — e o filtro é `percursoConta`, não `confirmado === true`.
   *
   * SPEC-64: o caminho declarado à mão conta sem confirmação (quem o desenhou
   * já disse que existe) e por isso nasce com `confirmado: undefined`. Com o
   * filtro anterior ele não caía nem aqui nem em "a confirmar": nascia
   * invisível, com o registro vivo na quebra — o §283 de volta, e foi o E2E que
   * pegou. A lista é dos que contam; quem decide isso é o engine.
   */
  const confirmados = percursos.filter((p) => percursoConta(p));
  /**
   * §283 — os recusados PRECISAM ter uma lista, mesmo que fechada.
   *
   * Eles não voltam para a fila de confirmação (senão o descarte viraria uma
   * briga com o inferidor a cada render, que é a razão de o estado `false`
   * existir) — mas ficar fora das duas listas os fazia sumir da interface para
   * sempre, com o registro vivo no banco. É o relato do §278 outra vez: "se
   * rejeito simplesmente some para sempre".
   */
  const recusados = percursos.filter((p) => p.confirmado === false);
  // O obsoleto cobra: você confirmou um trajeto que o desenho não produz mais,
  // e ou o desenho regrediu ou a confirmação venceu. As duas pedem uma pessoa.
  const cobra = violacoes.length + naoMedidos.length + aConfirmar.length + obsoletos.length;

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        data-testid="percursos-resumo"
        onClick={() => setAberto((a) => !a)}
        title="Caminho = a sequência de componentes por onde uma requisição passa. Aqui ficam os que o desenho sugere e as réguas de tempo/saltos que valem sobre eles."
        style={{
          ...botaoEstilo,
          borderColor: cobra > 0 ? "var(--amarelo)" : "var(--borda-forte)",
          color: cobra > 0 ? "var(--amarelo)" : "var(--texto-fraco)",
        }}
      >
        {/* A ordem importa: o que exige ação primeiro. */}
        🛣{" "}
        {violacoes.length > 0
          ? `${violacoes.length} caminho(s) fora do padrão`
          : naoMedidos.length > 0
            ? `${naoMedidos.length} sem medir`
            : aConfirmar.length > 0
              ? `${aConfirmar.length} caminho(s) a confirmar`
              : obsoletos.length > 0
                ? `${obsoletos.length} caminho(s) que sumiram do desenho`
                : `${confirmados.length} caminho(s)`}
      </button>

      {aberto && (
        <div data-testid="percursos-lista" style={popoverEstilo}>
          {violacoes.map((v) => (
            <div key={`v-${v.percursoId}-${v.texto}`} data-testid="percurso-violacao" style={linhaEstilo}>
              <strong style={{ fontSize: 12, color: "var(--amarelo)" }}>{v.rotulo}</strong>
              <div style={{ fontSize: 11 }}>
                {v.texto}: esperado {v.esperado}, está <strong>{v.atual}</strong>
              </div>
              {/* §242 — o porquê é o que separa ensinar de cobrar. */}
              {v.porque && <div style={{ fontSize: 11, color: "var(--texto-fraco)" }}>{v.porque}</div>}
            </div>
          ))}

          {naoMedidos.map((n) => (
            <div key={`n-${n.percursoId}-${n.campo}`} data-testid="percurso-nao-medido" style={linhaEstilo}>
              <strong style={{ fontSize: 12 }}>{n.rotulo}</strong>
              <div style={{ fontSize: 11, color: "var(--texto-fraco)" }}>
                {/* Dizer o que falta, e não só que falhou: sem os endereços,
                    "não deu para medir" é uma reclamação sem endereço. */}
                não dá para medir "{n.texto}" —{" "}
                {n.motivo ? (
                  /* SPEC-64 — nem todo "não medido" é campo vazio. O par ligado
                     por duas conexões que declaram o campo não tem valor
                     faltando: tem desenho ambíguo, e a frase precisa dizer isso
                     em vez de listar elemento nenhum. */
                  <span data-testid="percurso-motivo">{n.motivo}</span>
                ) : (
                  <>
                    falta <strong>{n.campo}</strong> em{" "}
                    {n.elementosSemValor.map((e, i) => (
                      <span key={`${e.tipo}-${e.id}`}>
                        {i > 0 && ", "}
                        <button
                          style={linkEstilo}
                          data-testid={`elemento-sem-valor-${e.id}`}
                          onClick={() => (e.tipo === "aresta" ? onSelecionarAresta?.(e.id) : onSelecionarNo?.(e.id))}
                        >
                          {e.tipo === "aresta" ? `conexão ${e.rotulo}` : e.rotulo}
                        </button>
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}

          {aConfirmar.length > 0 && (
            <div style={{ ...linhaEstilo, borderBottom: "none" }}>
              <div style={{ fontSize: 11, color: "var(--texto-mudo)", marginBottom: 4 }}>
                {/* §275 — o texto dizia "o motor leu estes caminhos" e supunha
                    que a pessoa soubesse o que é "motor" e o que é "caminho".
                    Relato do usuário: "que motor? o que significa caminho?
                    fluxo informacional? ciclomático?". Nomear a coisa pelo que
                    ela é custa uma linha e economiza a pergunta. */}
                <strong>Caminho</strong> = a sequência de componentes por onde uma requisição passa, de ponta a ponta
                (aqui: {aConfirmar[0]?.rotulo}). Estes foram <strong>lidos do seu desenho</strong> seguindo as setas —
                cálculo, sem IA. Confirmar é dizer “este trajeto existe de verdade”; só depois disso as réguas de tempo
                e de número de saltos passam a valer sobre ele.
              </div>
              {aConfirmar.map((p) => (
                <div key={p.id} data-testid="percurso-a-confirmar" style={{ padding: "3px 0" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button style={linkEstilo} onClick={() => onSelecionarNo?.(p.nos[0])}>
                      {p.rotulo}
                    </button>
                    <div style={{ flex: 1 }} />
                    <button style={botaoMiniEstilo} onClick={() => onConfirmar(p.id)} data-testid={`confirmar-${p.id}`}>
                      confirmar
                    </button>
                    {/* SPEC-64 fatia C — o verbo do meio. Um trajeto quase
                        certo só podia ser recusado, e recusar não dizia o que
                        era certo. */}
                    {onAjustar && (
                      <button
                        style={linkEstilo}
                        onClick={() => onAjustar(p)}
                        data-testid={`ajustar-${p.id}`}
                        title="Usa esta sequência como ponto de partida e deixa você corrigi-la no desenho"
                      >
                        ajustar
                      </button>
                    )}
                    <button style={linkEstilo} onClick={() => onDescartar(p.id)}>
                      não é caminho
                    </button>
                  </div>
                  {/* §263 — o preço de confirmar, ANTES de confirmar. Aqui o
                      delta é o único aviso possível: o item que a confirmação
                      cria (§249) só apareceria depois, no backlog derivado. */}
                  {(() => {
                    const remedicao = remedirConfirmacao?.(p.id);
                    return remedicao ? (
                      <Delta data-testid={`delta-percurso-${p.id}`} titulo="Se confirmar este caminho" remedicao={remedicao} />
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          )}

          {/* §283 — o obsoleto deixa de se passar por caminho vivo. O engine já
              o separava; a tela é que o desenhava com o mesmo ✓, afirmando que
              um trajeto existe no desenho quando ele já não existe. */}
          {obsoletos.length > 0 && (
            <div style={linhaEstilo}>
              <div style={{ fontSize: 11, color: "var(--texto-mudo)", marginBottom: 4 }}>
                Confirmados que <strong>sumiram do desenho</strong> — ou o desenho mudou, ou a confirmação venceu. As
                réguas não valem mais sobre eles.
              </div>
              {obsoletos.map((p) => (
                <div key={p.id} data-testid="percurso-obsoleto" style={itemEstilo}>
                  <span style={{ fontSize: 11, color: "var(--amarelo)" }}>⚠ {p.rotulo}</span>
                  <div style={{ flex: 1 }} />
                  {onReabrir && (
                    <button
                      style={linkEstilo}
                      onClick={() => onReabrir(p.id)}
                      data-testid={`remover-${p.id}`}
                      title="Esquece este registro. Como o desenho não produz mais este caminho, ele não volta."
                    >
                      remover
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {confirmados.length > 0 && violacoes.length === 0 && naoMedidos.length === 0 && (
            <div style={{ ...linhaEstilo, borderBottom: "none", fontSize: 11, color: "var(--texto-fraco)" }}>
              {confirmados.map((p) => (
                <div key={p.id} data-testid="percurso-confirmado" style={itemEstilo}>
                  <span>
                    ✓ {p.rotulo}
                    {/* Declarado à mão é outra coisa de confirmado: ninguém o
                        leu do desenho, alguém o afirmou. Dizer isso é o que
                        permite entender por que ele conta sem ✓ de aceite. */}
                    {p.origem === "manual" && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "var(--texto-mudo)" }}>declarado à mão</span>
                    )}
                  </span>
                  <div style={{ flex: 1 }} />
                  {/* §283 — confirmar deixou de ser porta de mão única. Não é
                      clique inócuo: ele liga as réguas de tempo e de saltos
                      sobre o caminho e põe item no backlog (§249), e ficava a um
                      pixel do "não é caminho". */}
                  {onReabrir && (
                    <button
                      style={linkEstilo}
                      onClick={() => onReabrir(p.id)}
                      data-testid={`desfazer-${p.id}`}
                      title={
                        p.origem === "manual"
                          ? "Apaga esta declaração. Como o desenho não produz este caminho sozinho, ele não volta."
                          : "Volta para 'a confirmar' — as réguas param de valer sobre este caminho"
                      }
                    >
                      {p.origem === "manual" ? "apagar" : "desfazer"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* §283 — os recusados, fechados mas alcançáveis. Mesmo desenho do
              histórico do ciclo (§276/§278): o placar em cima, a lista atrás de
              um clique, e cada linha com o caminho de volta. */}
          {recusados.length > 0 && (
            <details style={{ ...linhaEstilo, borderBottom: "none" }} data-testid="percursos-recusados">
              <summary style={{ fontSize: 11, color: "var(--texto-mudo)", cursor: "pointer" }}>
                {recusados.length} recusado(s) — “não é caminho”
              </summary>
              <div style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0" }}>
                Continuam recusados de propósito: sem isso o desenho os reofereceria a cada render. Reabrir devolve
                cada um para a fila de confirmação.
              </div>
              {recusados.map((p) => (
                <div key={p.id} data-testid="percurso-recusado" style={itemEstilo}>
                  <span style={{ fontSize: 11, color: "var(--texto-fraco)" }}>{p.rotulo}</span>
                  <div style={{ flex: 1 }} />
                  {onReabrir && (
                    <button style={linkEstilo} onClick={() => onReabrir(p.id)} data-testid={`reabrir-${p.id}`}>
                      reabrir
                    </button>
                  )}
                </div>
              ))}
            </details>
          )}

          {/* SPEC-64 fatia B — o caminho que o desenho não produz, mas que a
              pessoa sabe que existe. Fica no fim: é a saída para quando a
              leitura automática não serve, não a porta principal. */}
          {onDeclarar && (
            <div style={{ ...linhaEstilo, borderBottom: "none" }}>
              <button style={linkEstilo} onClick={onDeclarar} data-testid="declarar-caminho">
                + declarar um caminho à mão
              </button>
              <div style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
                Para o trajeto que o desenho não deixa ler sozinho — clique os componentes na ordem.
              </div>
            </div>
          )}

          {truncado && (
            <div data-testid="percursos-truncado" style={{ ...linhaEstilo, borderBottom: "none", fontSize: 11, color: "var(--texto-mudo)" }}>
              O desenho tem mais caminhos do que cabe listar — estes são os primeiros. Um grafo muito conectado
              costuma indicar que falta um limite de contexto, não que faltam caminhos.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-fraco)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const popoverEstilo: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 70,
  minWidth: 380,
  maxWidth: 520,
  maxHeight: 320,
  overflow: "auto",
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
  textAlign: "left",
};

/** Linha de um caminho: rótulo à esquerda, ação à direita. */
const itemEstilo: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  padding: "2px 0",
};

const linhaEstilo: React.CSSProperties = {
  padding: "8px 4px",
  borderBottom: "1px solid var(--borda)",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const linkEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: 0,
  border: "none",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
  textAlign: "left",
};

const botaoMiniEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

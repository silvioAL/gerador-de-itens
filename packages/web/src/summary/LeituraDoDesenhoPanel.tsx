import { useEffect, useRef, useState } from "react";
import { dispensasComEfeito, formatarDuracao, marcasPorNo, resumirLeitura } from "@gerador/engine";
import type { ElementoDaLeitura, LeituraDispensada, LeituraDoDesenho, MarcaDaLeitura } from "@gerador/engine";

/**
 * SPEC-65 fatia C — o que o desenho já diz, sem preparo.
 *
 * Relato: *"precisa aparecer em algum lugar sem precisar abrir e especificar
 * tudo, apenas o necessário — o tempo geral das operações mapeadas, e se
 * houver parte síncrona ver o que interessa quanto a isso"*.
 *
 * ## Por que o número está NO chip, e não atrás dele
 *
 * Os outros chips da faixa cobram uma ação e por isso podem dizer só a
 * contagem ("4 caminhos a confirmar") — o valor está no que se faz depois de
 * clicar. Este não cobra nada: ele **é** a informação. Escondê-lo atrás de um
 * clique seria voltar exatamente ao "precisa abrir para saber" do relato.
 *
 * ## Por que a cor é neutra
 *
 * Vermelho e âmbar já significam "errado" e "atenção" na gramática da mesa.
 * Isto não é nem um nem outro: é um fato sobre o desenho (SPEC-65 §3). Pintar
 * de âmbar transformaria uma leitura em cobrança, e cobrança sem régua do time
 * é o linter de grafo que a SPEC-63 recusou.
 */
export interface LeituraDoDesenhoPanelProps {
  leitura: LeituraDoDesenho;
  onSelecionarNo?: (noId: string) => void;
  onSelecionarAresta?: (arestaId: string) => void;
  /**
   * SPEC-65 fatia D — as leituras caladas neste desenho, e como calar/soltar.
   *
   * Ausentes = os verbos não aparecem. Mesma disciplina do `onReabrir` do
   * `PercursosPanel`: botão que não faz nada é pior que botão que não existe.
   */
  dispensadas?: LeituraDispensada[];
  onDispensar?: (marca: MarcaDaLeitura) => void;
  onRestaurar?: (dispensa: LeituraDispensada) => void;
  /**
   * SPEC-65 §6.3 — a ponte para a SPEC-63: o fato que o time decidir que é
   * regra vira régua de forma, com porquê, placar e exceção.
   */
  onVirarRegua?: (marca: MarcaDaLeitura) => void;
}

export function LeituraDoDesenhoPanel({
  leitura,
  onSelecionarNo,
  onSelecionarAresta,
  dispensadas,
  onDispensar,
  onRestaurar,
  onVirarRegua,
}: LeituraDoDesenhoPanelProps) {
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

  // As marcas de agora, indexadas — é delas que os verbos pendem, e é o mesmo
  // cálculo que o canvas usa: dois lugares, uma verdade.
  const marcas = marcasPorNo(leitura);
  const marcaDe = (noId: string, tipo: string) => marcas.find((m) => m.noId === noId && m.tipo === tipo);
  const caladas = dispensasComEfeito(leitura, dispensadas ?? []);

  const resumo = resumirLeitura(leitura);
  // Nada a dizer = o chip não existe. Um chip permanente vira moldura: some da
  // vista junto com o que ele deveria mostrar.
  if (!resumo) return null;

  const ir = (e: ElementoDaLeitura) => {
    if (e.tipo === "aresta") onSelecionarAresta?.(e.id);
    else onSelecionarNo?.(e.id);
  };

  const t = leitura.tempoDoPiorTrecho;

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        data-testid="leitura-resumo"
        onClick={() => setAberto((a) => !a)}
        title="O que o desenho já diz por si — sem confirmar caminho nem configurar régua. Só conta o trecho em que quem chama espera a resposta."
        style={botaoEstilo}
      >
        ⏱ {resumo}
      </button>

      {aberto && (
        <div data-testid="leitura-lista" style={popoverEstilo}>
          <div style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0 8px" }}>
            Isto é <strong>leitura</strong>, não régua: o desenho dito em voz alta, sem nada a corrigir. Só entra o
            trecho em que <strong>quem chama espera a resposta</strong> — o que passa por fila não segura ninguém.
          </div>

          {t && (
            <div style={linhaEstilo} data-testid="leitura-tempo">
              <strong style={{ fontSize: 12 }}>
                {t.completo ? "Resposta no pior caso" : "Resposta no pior caso (parcial)"}
              </strong>
              <div style={{ fontSize: 11 }}>
                {t.completo ? "" : "pelo menos "}
                <strong>{formatarDuracao(t.ms)}</strong> em <span style={{ color: "var(--texto-fraco)" }}>{t.rotulo}</span>
              </div>
              {/* §248 — dizer de quem se está esperando o dado é o que separa
                  "não consegui medir" de uma reclamação sem endereço. */}
              {t.semValor.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--texto-fraco)" }}>
                  falta o tempo de{" "}
                  {t.semValor.map((e, i) => (
                    <span key={e.id}>
                      {i > 0 && ", "}
                      <button style={linkEstilo} onClick={() => ir(e)} data-testid={`leitura-falta-${e.id}`}>
                        {e.rotulo}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {leitura.fanOut.length > 0 && (
            <div style={linhaEstilo} data-testid="leitura-fanout">
              <strong style={{ fontSize: 12 }}>Chamadas antes de responder</strong>
              {leitura.fanOut.map((f) => (
                <div key={f.noId} style={{ fontSize: 11 }}>
                  <button style={linkEstilo} onClick={() => onSelecionarNo?.(f.noId)}>
                    {f.rotulo}
                  </button>{" "}
                  faz <strong>{f.chamadas.length}</strong> chamadas que esperam — a resposta dele é a soma delas, e
                  qualquer uma que falhe derruba as outras.
                  <Verbos
                    marca={marcaDe(f.noId, "fan-out")}
                    onDispensar={onDispensar}
                    onVirarRegua={onVirarRegua}
                  />
                </div>
              ))}
            </div>
          )}

          {leitura.cadeiaMaisFunda && (
            <div style={linhaEstilo} data-testid="leitura-cadeia">
              <strong style={{ fontSize: 12 }}>Profundidade</strong>
              <div style={{ fontSize: 11 }}>
                <strong>{leitura.cadeiaMaisFunda.saltos} saltos</strong> que esperam até{" "}
                <button style={linkEstilo} onClick={() => onSelecionarNo?.(leitura.cadeiaMaisFunda!.fim.id)}>
                  {leitura.cadeiaMaisFunda.fim.rotulo}
                </button>{" "}
                — o tempo é a soma dos saltos, e a disponibilidade é o produto deles.
                <Verbos
                  marca={marcaDe(leitura.cadeiaMaisFunda.inicioNoId, "cadeia")}
                  onDispensar={onDispensar}
                  onVirarRegua={onVirarRegua}
                />
              </div>
            </div>
          )}

          {leitura.terceiros.length > 0 && (
            <div style={linhaEstilo} data-testid="leitura-terceiros">
              <strong style={{ fontSize: 12 }}>De quem não é de vocês</strong>
              {leitura.terceiros.map((x) => (
                <div key={x.noId} style={{ fontSize: 11 }}>
                  <button style={linkEstilo} onClick={() => onSelecionarNo?.(x.noId)}>
                    {x.rotulo}
                  </button>{" "}
                  está dentro do trecho que espera: a resposta depende de um sistema de terceiro.
                </div>
              ))}
            </div>
          )}

          {/* §283 — dispensar não é de mão única. Quem calou uma leitura tem
              como ouvi-la de novo, e vê quem calou e quando. */}
          {caladas.length > 0 && (
            <details style={linhaEstilo} data-testid="leitura-caladas">
              <summary style={{ fontSize: 11, color: "var(--texto-mudo)", cursor: "pointer" }}>
                {caladas.length} calada(s) neste desenho
              </summary>
              {caladas.map(({ dispensa, marca }) => (
                <div key={`${dispensa.noId}::${dispensa.tipo}`} style={{ fontSize: 11, padding: "4px 0" }}>
                  <span style={{ color: "var(--texto-fraco)" }}>{marca.titulo}</span>
                  {dispensa.autor && (
                    <span style={{ color: "var(--texto-mudo)" }}> — calada por {dispensa.autor}</span>
                  )}{" "}
                  {onRestaurar && (
                    <button
                      style={acaoEstilo}
                      onClick={() => onRestaurar(dispensa)}
                      data-testid={`restaurar-leitura-${dispensa.noId}-${dispensa.tipo}`}
                    >
                      ouvir de novo
                    </button>
                  )}
                </div>
              ))}
            </details>
          )}

          {/* §57 — leitura que ignorou parte do desenho sem dizer é pior que
              leitura nenhuma. */}
          {leitura.conexoesNaoClassificadas.length > 0 && (
            <div style={{ ...linhaEstilo, borderBottom: "none" }} data-testid="leitura-ignoradas">
              <div style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
                Ficaram de fora porque ninguém declarou se esperam resposta:{" "}
                {leitura.conexoesNaoClassificadas.map((c) => `${c.quantas}× ${c.tipo}`).join(", ")}.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Os dois verbos de uma leitura.
 *
 * `marca` pode ser `undefined` quando aquela leitura já está calada: neste
 * caso nada aparece, porque o bloco inteiro dela já não está sendo mostrado —
 * e um "dispensar" pendurado no vazio seria botão morto.
 */
function Verbos({
  marca,
  onDispensar,
  onVirarRegua,
}: {
  marca?: MarcaDaLeitura;
  onDispensar?: (m: MarcaDaLeitura) => void;
  onVirarRegua?: (m: MarcaDaLeitura) => void;
}) {
  if (!marca || (!onDispensar && !onVirarRegua)) return null;
  return (
    <span style={{ display: "inline-flex", gap: 10, marginLeft: 8 }}>
      {onVirarRegua && (
        <button
          style={acaoEstilo}
          onClick={() => onVirarRegua(marca)}
          data-testid={`virar-regua-${marca.noId}-${marca.tipo}`}
          title="Transforma este fato numa régua do time, com porquê, placar e exceção — é a SPEC-63 que passa a valer daqui em diante"
        >
          virar régua
        </button>
      )}
      {onDispensar && (
        <button
          style={acaoEstilo}
          onClick={() => onDispensar(marca)}
          data-testid={`dispensar-leitura-${marca.noId}-${marca.tipo}`}
          title="Cala esta leitura NESTE desenho. Fica registrado quem calou, e dá para ouvir de novo."
        >
          não me mostre aqui
        </button>
      )}
    </span>
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

/** §288 — ação não herda o estilo do rótulo: folga de clique e sem quebra. */
const acaoEstilo: React.CSSProperties = {
  ...linkEstilo,
  padding: "3px 6px",
  borderRadius: 6,
  border: "1px solid transparent",
  whiteSpace: "nowrap",
};

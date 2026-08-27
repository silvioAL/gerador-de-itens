import { useEffect, useRef, useState } from "react";
import { dispensasComEfeito, formatarDuracao, marcasPorNo, resumirLeitura } from "@gerador/engine";
import type { ElementoDaLeitura, FaltaParaEnsaiar, LeituraDispensada, LeituraDoDesenho, MarcaDaLeitura } from "@gerador/engine";

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
  /**
   * §305 — o que impede este desenho de ser ensaiado, se algo impedir.
   *
   * Presente = a porta NÃO leva à bancada; ela diz o que falta e onde
   * preencher. Levar alguém a uma tela que só sabe dizer "não há o que somar"
   * é gastar a navegação para entregar a mesma frase mais tarde — e é a
   * família do §244: um caminho que promete e não cumpre.
   */
  faltaParaEnsaiar?: FaltaParaEnsaiar;
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
  /**
   * SPEC-66 — a porta para a bancada de ensaio.
   *
   * Fica aqui, e não no menu, porque quem está lendo "resposta ≥ 3,0 s" é
   * exatamente quem quer perguntar "e se piorar?" — é o único momento em que a
   * pergunta ocorre sozinha.
   */
  onSimular?: () => void;
}

export function LeituraDoDesenhoPanel({
  leitura,
  onSelecionarNo,
  onSelecionarAresta,
  dispensadas,
  onDispensar,
  onRestaurar,
  onVirarRegua,
  onSimular,
  faltaParaEnsaiar,
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
          {/* §294 — era um parágrafo de 35 palavras. A frase inteira virou o
              título: quem precisa dela lê passando o mouse, e quem já entendeu
              não a relê toda vez que abre o painel. */}
          <div
            title="Só entra o trecho em que quem chama espera a resposta — o que passa por fila não segura ninguém. Nada aqui cobra: é o desenho dito em voz alta."
            style={{ fontSize: 10.5, color: "var(--texto-mudo)", margin: "2px 0 6px", cursor: "help" }}
          >
            leitura, não régua ⓘ
          </div>

          {t && (
            <div style={linhaEstilo} data-testid="leitura-tempo">
              <Linha
                numero={formatarDuracao(t.ms)}
                titulo={`A soma dos tempos declarados ao longo de ${t.rotulo}.${
                  t.completo ? "" : " É um PISO: nem todo elemento do trecho respondeu o tempo dele."
                }`}
              >
                resposta {t.completo ? "até" : "no mínimo"}
              </Linha>
              {/* §248 — dizer de quem se está esperando o dado é o que separa
                  "não consegui medir" de uma reclamação sem endereço. */}
              {t.semValor.length > 0 && (
                <div style={{ fontSize: 10.5, color: "var(--texto-mudo)" }}>
                  falta{t.semValor.length > 1 ? "m" : ""}{" "}
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

          {leitura.fanOut.map((f) => (
            // §294 — o testid carrega o nó: depois do enxugamento cada fan-out
            // virou UMA linha, e um id repetido faria qualquer busca por ele
            // casar com duas coisas diferentes.
            <div key={f.noId} style={linhaEstilo} data-testid={`leitura-fanout-${f.noId}`}>
              <Linha
                numero={String(f.chamadas.length)}
                titulo="A resposta dele é a soma dessas chamadas, e qualquer uma que falhe derruba as outras."
                acoes={
                  <Verbos marca={marcaDe(f.noId, "fan-out")} onDispensar={onDispensar} onVirarRegua={onVirarRegua} />
                }
              >
                chamadas antes de{" "}
                <button style={linkEstilo} onClick={() => onSelecionarNo?.(f.noId)}>
                  {f.rotulo}
                </button>{" "}
                responder
              </Linha>
            </div>
          ))}

          {leitura.cadeiaMaisFunda && (
            <div style={linhaEstilo} data-testid="leitura-cadeia">
              <Linha
                numero={String(leitura.cadeiaMaisFunda.saltos)}
                titulo="O tempo é a soma dos saltos, e a disponibilidade é o produto deles."
                acoes={
                  <Verbos
                    marca={marcaDe(leitura.cadeiaMaisFunda.inicioNoId, "cadeia")}
                    onDispensar={onDispensar}
                    // SPEC-67 §4.2 — cadeia NÃO vira régua de forma: é sobre
                    // caminho, e caminho já tem escopo próprio (`percursos[]`).
                    // O verbo só aparece onde leva a algum lugar (§244).
                  />
                }
              >
                saltos que esperam até{" "}
                <button style={linkEstilo} onClick={() => onSelecionarNo?.(leitura.cadeiaMaisFunda!.fim.id)}>
                  {leitura.cadeiaMaisFunda.fim.rotulo}
                </button>
              </Linha>
            </div>
          )}

          {leitura.terceiros.length > 0 && (
            <div style={linhaEstilo} data-testid="leitura-terceiros">
              <Linha
                numero={String(leitura.terceiros.length)}
                titulo="Estão dentro do trecho que espera: a resposta depende de sistemas que não são de vocês."
              >
                de terceiro no caminho —{" "}
                {leitura.terceiros.map((x, i) => (
                  <span key={x.noId}>
                    {i > 0 && ", "}
                    <button style={linkEstilo} onClick={() => onSelecionarNo?.(x.noId)}>
                      {x.rotulo}
                    </button>
                  </span>
                ))}
              </Linha>
            </div>
          )}

          {onSimular && (
            <div style={{ ...linhaEstilo, borderBottom: "none", paddingTop: 8 }}>
              {faltaParaEnsaiar ? (
                /* §305 — a validação ANTES de navegar.
                
                   Medido no navegador: com o desenho legível e nenhum tempo
                   declarado, a porta abria e a bancada mostrava "hoje ≥ 0 ms".
                   A guarda que devia impedir isso testava `undefined`, e o caso
                   real devolve `0`.
                
                   Aqui não há botão desabilitado com tooltip: há a frase e o
                   ENDEREÇO. Dizer "falta preencher" sem dizer onde transfere a
                   busca para quem já não sabia o que procurar (§57). */
                <div data-testid="ensaiar-falta" style={{ fontSize: 11, color: "var(--texto-mudo)", lineHeight: 1.5 }}>
                  {faltaParaEnsaiar.motivo}
                  {faltaParaEnsaiar.ondePreencher.length > 0 && (
                    <>
                      {" "}
                      Preencha em{" "}
                      {faltaParaEnsaiar.ondePreencher.map((e, i) => (
                        <span key={`${e.tipo}-${e.id}`}>
                          {i > 0 && ", "}
                          <button
                            style={linkEstilo}
                            data-testid={`ensaiar-falta-${e.id}`}
                            onClick={() => {
                              setAberto(false);
                              if (e.tipo === "aresta") onSelecionarAresta?.(e.id);
                              else onSelecionarNo?.(e.id);
                            }}
                          >
                            {e.rotulo}
                          </button>
                        </span>
                      ))}
                      .
                    </>
                  )}
                </div>
              ) : (
                <button
                  style={acaoEstilo}
                  // Fecha ANTES de navegar: a faixa de saúde vive nas duas telas,
                  // então um popover deixado aberto vira uma folha flutuando por
                  // cima da tela nova. Achado do E2E.
                  onClick={() => {
                    setAberto(false);
                    onSimular();
                  }}
                  data-testid="abrir-simulacao"
                >
                  ensaiar este desenho →
                </button>
              )}
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
 * §294 — uma leitura, uma linha.
 *
 * Medi o painel depois da fatia D: **146 palavras e 424px de conteúdo num
 * popover de 320px** — ele rolava, e "profundidade" e "terceiros" ficavam
 * abaixo da dobra. Cada fatia tinha acrescentado um bloco que repetia a
 * explicação inteira em prosa, e a frase "a resposta dele é a soma delas…"
 * aparecia uma vez por nó.
 *
 * A forma passa a ser sempre a mesma: **número em destaque, frase curta, e a
 * consequência no título**. Quem quer entender o porquê passa o mouse; quem só
 * quer o número o lê de relance — que é o pedido do relato.
 */
function Linha({
  numero,
  titulo,
  acoes,
  children,
}: {
  numero: string;
  titulo: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", rowGap: 2 }} title={titulo}>
      <strong style={{ fontSize: 14, color: "var(--texto)", flexShrink: 0 }}>{numero}</strong>
      <span style={{ fontSize: 11, color: "var(--texto-2)", flex: "1 1 auto", minWidth: 0 }}>{children}</span>
      {acoes}
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
  padding: "6px 4px",
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

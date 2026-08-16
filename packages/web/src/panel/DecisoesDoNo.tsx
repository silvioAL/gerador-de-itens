import { useState } from "react";
import { decisoesDoElemento, deltaDeDecisao, propostasPendentes, type Alternativa, type Decisao, type Diagrama } from "@gerador/engine";
import { Delta } from "../summary/Delta";

/**
 * SPEC-57 fatia C (M5 caso 2) — a ESCOLHA ENTRE ALTERNATIVAS, no lugar onde ela
 * é tomada: o painel do nó.
 *
 * **Por que aqui e não numa tela de "ADRs".** Um repositório de ADR separado do
 * desenho é onde ADR vai morrer: escrever custa uma navegação, ler custa outra,
 * e em três semanas ninguém abre. Ancorado no nó, a decisão está exatamente
 * onde alguém vai perguntar "por que isto é assim?".
 *
 * **A régua que impede o excesso** está no texto do botão e no formulário:
 * exige duas alternativas para registrar. Sem isso, "preenchi um campo" viraria
 * ADR — e ADR demais é o mesmo que ADR nenhum, só que mais caro.
 */
export interface DecisoesDoNoProps {
  noId: string;
  decisoes: Decisao[];
  /** SPEC-60 fatia A — o desenho, porque a remedição precisa medir sobre ele
   * (uma decisão órfã só é órfã em relação a um diagrama). Ausente = sem delta:
   * é o caso do teste de unidade que só olha o formulário. */
  diagrama?: Diagrama;
  autor: string;
  onRegistrar: (decisao: Decisao) => void;
  onAceitar: (id: string) => void;
  /** Registrar uma nova decisão marcando a anterior como substituída. */
  onSubstituir: (idAntiga: string, nova: Decisao) => void;
  /** SPEC-57 M4 — pedir ao agente que proponha, lendo o desenho MEDIDO.
   * Ausente = o botão não aparece (sem credencial de IA, por exemplo). */
  onPedirAoAgente?: () => Promise<void>;
  /** §253 — esta decisão é de DEMONSTRAÇÃO (do tour). Recebe a marca do §235 e
   * não oferece aceite: o aceite grava na quebra, e ela não vive lá — o botão
   * existiria só para não fazer nada. */
  ehDeDemonstracao?: (id: string) => boolean;
}

/**
 * §263 — o aceite, com o delta em volta QUANDO há delta.
 *
 * A garantia que este componente carrega é a que eu quebrei ao escrever a
 * primeira versão: **o botão de aceitar não depende da medição**. `Delta` não
 * renderiza caixa vazia (de propósito), e enfiar o botão dentro dele fez o
 * aceite sumir onde não havia diagrama para medir — uma feature nova apagando
 * uma antiga, que é o pior tipo de regressão porque parece configuração.
 */
function AceiteComDelta({
  decisao,
  decisoes,
  diagrama,
  onAceitar,
}: {
  decisao: Decisao;
  decisoes: Decisao[];
  diagrama?: Diagrama;
  /** Ausente = demonstração: mede e mostra, mas não oferece o aceite (§253). */
  onAceitar?: () => void;
}) {
  const remedicao = diagrama ? deltaDeDecisao(diagrama, decisoes, decisao.id) : { linhas: [] };
  const botao = onAceitar ? (
    <button
      style={{ ...botaoPrimarioEstilo, marginTop: remedicao.linhas.length > 0 ? 6 : undefined }}
      onClick={onAceitar}
      data-testid={`aceitar-${decisao.id}`}
    >
      aceitar esta decisão
    </button>
  ) : null;

  if (remedicao.linhas.length === 0) return botao;
  // Dentro da caixa: ler o efeito num canto e agir noutro é o que produz o
  // clique sem leitura.
  return (
    <Delta data-testid={`delta-decisao-${decisao.id}`} titulo="Se aceitar esta decisão" remedicao={remedicao}>
      {botao}
    </Delta>
  );
}

export function DecisoesDoNo({
  noId,
  decisoes,
  diagrama,
  autor,
  onRegistrar,
  onAceitar,
  onSubstituir,
  onPedirAoAgente,
  ehDeDemonstracao,
}: DecisoesDoNoProps) {
  const [abrindo, setAbrindo] = useState<false | { substituindo?: string }>(false);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const vigentes = decisoesDoElemento(noId, decisoes);
  const propostas = propostasPendentes(decisoes).filter((d) => d.noId === noId);

  return (
    <section data-testid="decisoes-do-no" style={{ marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--texto-2)", margin: 0 }}>Por que este desenho</h3>
        {vigentes.length > 0 && <span style={contadorEstilo}>{vigentes.length}</span>}
      </div>

      {vigentes.length === 0 && propostas.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "6px 0 0" }}>
          Nenhuma decisão registrada. Registre quando a escolha for <strong>entre alternativas</strong> — preencher um
          campo não é decisão.
        </p>
      )}

      {propostas.map((d) => (
        <article key={d.id} data-testid="decisao-proposta" style={{ ...cartaoEstilo, borderColor: "var(--amarelo)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={selo("var(--amarelo)")}>proposta</span>
            <strong style={{ fontSize: 12 }}>{d.titulo}</strong>
          </div>
          <CorpoDaDecisao decisao={d} />
          {ehDeDemonstracao?.(d.id) ? (
            // §235 — onde entra dado de demonstração, entra a marca. Faltava
            // nas decisões do tour, e a ausência dela é metade do porquê de
            // alguém tentar aceitar uma proposta que não é sua.
            <>
              <p data-testid="decisao-de-demonstracao" style={{ fontSize: 11, color: "var(--texto-fraco)", fontStyle: "italic", margin: "6px 0 0" }}>
                Exemplo da demonstração — o aceite vale nas suas decisões, não nesta.
              </p>
              {/* §263 — o delta APARECE na demonstração, sem o botão.
                  O §253 tirou o aceite daqui porque ele gravaria numa quebra
                  que não é a sua; a medição não grava nada, e escondê-la faria
                  o tour não mostrar a capacidade — que é o mesmo que ela não
                  existir (§244). Os números são reais: medem as decisões da
                  demonstração contra o desenho da demonstração. */}
              <AceiteComDelta decisao={d} decisoes={decisoes} diagrama={diagrama} />
            </>
          ) : (
            /* Regra 2: proposta não vale nada até alguém aceitar.
               §263 — e agora o aceite diz o que vai mudar antes de mudar. O
               botão mora DENTRO da caixa do delta de propósito: ler o efeito
               num canto e agir noutro é o que produz o clique sem leitura. */
            <AceiteComDelta
              decisao={d}
              decisoes={decisoes}
              diagrama={diagrama}
              onAceitar={() => onAceitar(d.id)}
            />
          )}
        </article>
      ))}

      {vigentes.map((d) => (
        <article key={d.id} data-testid="decisao-vigente" style={cartaoEstilo}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <strong style={{ fontSize: 12 }}>{d.titulo}</strong>
          </div>
          <CorpoDaDecisao decisao={d} />
          <button style={linkEstilo} onClick={() => setAbrindo({ substituindo: d.id })}>
            revisar esta decisão
          </button>
        </article>
      ))}

      {abrindo ? (
        <Formulario
          noId={noId}
          autor={autor}
          substituindo={abrindo.substituindo}
          onCancelar={() => setAbrindo(false)}
          onPronto={(nova) => {
            if (abrindo.substituindo) onSubstituir(abrindo.substituindo, nova);
            else onRegistrar(nova);
            setAbrindo(false);
          }}
        />
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button style={linkEstilo} onClick={() => setAbrindo({})} data-testid="registrar-decisao">
            ＋ registrar uma decisão
          </button>
          {onPedirAoAgente && (
            <button
              style={linkEstilo}
              disabled={pensando}
              data-testid="pedir-decisao-ao-agente"
              // O texto diz o que ele LÊ, não só o que ele faz: um agente que
              // "sugere decisões" é opinião; um que lê o que o motor mediu é
              // a tese da SPEC-56 §0.7 na tela.
              title="O agente lê o desenho, o que está fora do padrão e as lacunas de propósito, e propõe as escolhas que ainda estão em aberto."
              onClick={async () => {
                setPensando(true);
                setErro(null);
                try {
                  await onPedirAoAgente();
                } catch (e) {
                  setErro(e instanceof Error ? e.message : "não foi possível propor agora");
                } finally {
                  setPensando(false);
                }
              }}
            >
              {pensando ? "lendo o que o motor mediu…" : "🤖 pedir ao agente"}
            </button>
          )}
        </div>
      )}
      {erro && (
        <p data-testid="erro-decisao-agente" style={{ fontSize: 11, color: "var(--vermelho)", margin: "4px 0 0" }}>
          {erro}
        </p>
      )}
    </section>
  );
}

function CorpoDaDecisao({ decisao }: { decisao: Decisao }) {
  const descartadas = decisao.alternativas.filter((a) => a.titulo !== decisao.escolhida);

  return (
    <>
      {decisao.contexto && (
        <p style={{ fontSize: 11, color: "var(--texto-fraco)", margin: "4px 0 0", fontStyle: "italic" }}>
          {decisao.contexto}
        </p>
      )}
      <p style={{ fontSize: 11, margin: "4px 0 0" }}>
        <strong>{decisao.escolhida}</strong>
        {decisao.porque.trim() ? ` — ${decisao.porque}` : ""}
      </p>
      {/* O que foi DESCARTADO é o que serve daqui a um ano: sem isto, quem
          reabre a decisão troca por uma opção já rejeitada por um motivo que
          ninguém escreveu. */}
      {descartadas.length > 0 && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11, color: "var(--texto-fraco)" }}>
          {descartadas.map((a) => (
            <li key={a.titulo}>
              <s>{a.titulo}</s>
              {a.consequencia ? ` — ${a.consequencia}` : ""}
            </li>
          ))}
        </ul>
      )}
      {!decisao.porque.trim() && (
        <p data-testid="decisao-sem-porque" style={{ fontSize: 11, color: "var(--amarelo)", margin: "4px 0 0" }}>
          sem o porquê — quem ler isto daqui a um ano vai refazer a análise
        </p>
      )}
    </>
  );
}

function Formulario({
  noId,
  autor,
  substituindo,
  onCancelar,
  onPronto,
}: {
  noId: string;
  autor: string;
  substituindo?: string;
  onCancelar: () => void;
  onPronto: (d: Decisao) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [contexto, setContexto] = useState("");
  const [alternativas, setAlternativas] = useState<Alternativa[]>([{ titulo: "" }, { titulo: "" }]);
  const [escolhida, setEscolhida] = useState("");
  const [porque, setPorque] = useState("");

  const preenchidas = alternativas.filter((a) => a.titulo.trim());
  // Duas alternativas é a régua: com uma só, isto seria um campo com comentário.
  const podeSalvar = titulo.trim() !== "" && preenchidas.length >= 2 && escolhida.trim() !== "";

  function salvar() {
    onPronto({
      id: `d-${noId}-${Date.now()}`,
      noId,
      titulo: titulo.trim(),
      contexto: contexto.trim() || undefined,
      alternativas: preenchidas.map((a) => ({
        titulo: a.titulo.trim(),
        consequencia: a.consequencia?.trim() || undefined,
      })),
      escolhida,
      porque: porque.trim(),
      status: "aceita",
      origem: "manual",
      autor,
      em: new Date().toISOString(),
    });
  }

  return (
    <div data-testid="formulario-decisao" style={{ ...cartaoEstilo, borderColor: "#4f46e5" }}>
      <input
        placeholder="a decisão, em uma linha (ex.: fila em vez de chamada síncrona)"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        style={campoEstilo}
      />
      <input
        placeholder="o que forçava a escolha (opcional)"
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
        style={campoEstilo}
      />
      <p style={{ fontSize: 10, color: "var(--texto-mudo)", margin: "8px 0 2px" }}>
        as opções que estavam na mesa — e o que cada descartada custaria
      </p>
      {alternativas.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <input
            placeholder={`opção ${i + 1}`}
            value={a.titulo}
            onChange={(e) => {
              const t = e.target.value;
              setAlternativas((atual) => atual.map((x, j) => (j === i ? { ...x, titulo: t } : x)));
              // Renomear a opção escolhida não pode desfazer a escolha.
              setEscolhida((atual) => (atual === a.titulo && atual !== "" ? t : atual));
            }}
            style={{ ...campoEstilo, flex: 1, marginTop: 0 }}
          />
          <input
            placeholder="por que não"
            value={a.consequencia ?? ""}
            onChange={(e) => {
              const c = e.target.value;
              setAlternativas((atual) => atual.map((x, j) => (j === i ? { ...x, consequencia: c } : x)));
            }}
            style={{ ...campoEstilo, flex: 1, marginTop: 0 }}
          />
        </div>
      ))}
      <button style={linkEstilo} onClick={() => setAlternativas((a) => [...a, { titulo: "" }])}>
        ＋ outra opção
      </button>

      <select
        value={escolhida}
        onChange={(e) => setEscolhida(e.target.value)}
        style={campoEstilo}
        aria-label="alternativa escolhida"
      >
        <option value="">qual foi escolhida?</option>
        {preenchidas.map((a) => (
          <option key={a.titulo} value={a.titulo}>
            {a.titulo}
          </option>
        ))}
      </select>
      <textarea
        placeholder="por quê — é isto que ainda vai valer daqui a um ano"
        value={porque}
        onChange={(e) => setPorque(e.target.value)}
        rows={2}
        style={campoEstilo}
      />

      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button style={botaoPrimarioEstilo} disabled={!podeSalvar} onClick={salvar} data-testid="salvar-decisao">
          {substituindo ? "substituir a anterior" : "registrar"}
        </button>
        <button style={linkEstilo} onClick={onCancelar}>
          cancelar
        </button>
      </div>
      {!podeSalvar && (
        <p style={{ fontSize: 10, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
          Precisa de título, <strong>duas opções</strong> e a escolhida — decisão com uma opção só é campo, não decisão.
        </p>
      )}
    </div>
  );
}

const cartaoEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 8,
  marginTop: 6,
  background: "var(--painel-2, transparent)",
};

const campoEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "5px 8px",
  fontSize: 11,
  borderRadius: 6,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontFamily: "inherit",
};

const linkEstilo: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  fontWeight: 600,
  padding: 0,
  border: "none",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  fontWeight: 700,
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const contadorEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 999,
  background: "rgba(99, 102, 241, 0.18)",
  color: "#a5b4fc",
};

function selo(cor: string): React.CSSProperties {
  return { fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, border: `1px solid ${cor}`, color: cor };
}

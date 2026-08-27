import { useMemo, useState } from "react";
import {
  avaliarResiliencia,
  concluirEnsaio,
  elementosComTempo,
  faltaParaEnsaiar,
  estadoDoEnsaio,
  formatarDuracao,
  insistenciaDe,
  simularCenarios,
} from "@gerador/engine";
import type {
  AjusteDeCenario,
  CenarioDeLentidao,
  ContradicaoDeResiliencia,
  Diagrama,
  DiagramaConfig,
  ElementoAjustavel,
} from "@gerador/engine";

/**
 * SPEC-66 fatias B e C — a bancada de ensaio.
 *
 * ## Ela funciona inteira sem IA
 *
 * A sugestão de cenários é um botão a mais, nunca o caminho principal. É o §244
 * pelo avesso: capacidade que só existe com IA ligada é capacidade que metade
 * dos times não tem — e "e se o bureau ficar lento?" é uma pergunta que
 * qualquer um faz sem ajuda nenhuma.
 *
 * ## Por que a linha de "hoje" fica ancorada
 *
 * Sem a referência na mesma tabela, todo número vira solto: "9 s" não diz nada
 * a quem não sabe que hoje são 3 s. E o Δ é sempre contra hoje, nunca contra a
 * linha de cima — comparar em cadeia faria a ORDEM das linhas mudar o
 * significado dos números.
 */
export interface EnsaiosScreenProps {
  diagrama: Diagrama;
  config: DiagramaConfig;
  cenarios: CenarioDeLentidao[];
  onMudar: (cenarios: CenarioDeLentidao[]) => void;
  onVoltar: () => void;
  /** SPEC-66 fatia D — sugerir a pauta. Ausente = o botão não aparece, e a
   * tela segue inteira (§244). */
  onSugerir?: () => Promise<CenarioDeLentidao[]>;
  /**
   * SPEC-69 — o que o NEGÓCIO exige desta demanda. É o que faz o número
   * técnico decidir: "24 s" sozinho não decide nada, "24 s contra os 5 s que
   * prometemos" decide. Sem prazo declarado, a conclusão compara com hoje.
   */
  necessidades?: { texto: string; limiteMs?: number }[];
  /** Quem assume o débito — é o que separa débito consciente de anônimo. */
  autor?: string;
  /**
   * SPEC-69 fatia D — as decisões da quebra, para o ensaio assumido poder se
   * ANEXAR a uma delas.
   *
   * É o elo que faz a evidência viajar: anexada, ela chega ao item que quem
   * implementa lê. Sem decisão registrada a lista vem vazia e a tela diz isso
   * em vez de oferecer um seletor sem opção (§244).
   */
  decisoes?: { id: string; titulo: string; ensaioIds?: string[] }[];
  /** Anexa (ou desanexa, com `decisaoId` vazio) o ensaio a uma decisão. */
  onAnexar?: (ensaioId: string, decisaoId: string) => void;
}

/** Um id estável e legível, derivado do nome — a mesma disciplina do §289. */
function idDoCenario(nome: string, existentes: CenarioDeLentidao[]): string {
  const base =
    "cen-" +
    (nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cenario");
  if (!existentes.some((c) => c.id === base)) return base;
  let i = 2;
  while (existentes.some((c) => c.id === `${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function EnsaiosScreen({
  diagrama,
  config,
  cenarios,
  onMudar,
  onVoltar,
  onSugerir,
  necessidades,
  autor,
  decisoes,
  onAnexar,
}: EnsaiosScreenProps) {
  const [editando, setEditando] = useState<string | null>(null);
  const [assumindo, setAssumindo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [nome, setNome] = useState("");
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);

  // O cálculo é puro e local: recalcular a cada arrastar de slider não custa
  // rede nenhuma, e é o que faz o número acompanhar o gesto.
  const { hoje, resultados } = useMemo(
    () => simularCenarios(diagrama, config, cenarios),
    [diagrama, config, cenarios]
  );

  // Só quem PODE ter tempo entra na lista de ajustáveis — a mesma função que
  // monta o pedido à IA, para os dois lados oferecerem exatamente o mesmo
  // conjunto.
  const elementos = useMemo(() => elementosComTempo(diagrama, config), [diagrama, config]);

  // O que o desenho de HOJE já contradiz e por quanto ele já insiste — a
  // âncora tem que trazer as duas, senão uma contradição preexistente
  // pareceria efeito do primeiro ensaio.
  const contradicoesHoje = useMemo(() => avaliarResiliencia(diagrama, config), [diagrama, config]);
  const insistenciaHoje = useMemo(() => {
    const todas = diagrama.edges
      .map((e) => insistenciaDe(e))
      .filter((i): i is NonNullable<typeof i> => i !== undefined && i.insiste);
    return todas.length > 0 ? Math.max(...todas.map((i) => i.ms)) : undefined;
  }, [diagrama]);

  function criar() {
    const texto = nome.trim();
    if (!texto) return;
    const id = idDoCenario(texto, cenarios);
    onMudar([...cenarios, { id, nome: texto, origem: "manual", ajustes: [] }]);
    setNome("");
    setEditando(id);
  }

  function mudarCenario(id: string, muda: (c: CenarioDeLentidao) => CenarioDeLentidao) {
    onMudar(cenarios.map((c) => (c.id === id ? muda(c) : c)));
  }

  /** §4.0 — assumir o débito: sai do placar, e fica registrado quem e por quê. */
  function assumir(id: string) {
    const texto = motivo.trim();
    if (!texto) return;
    mudarCenario(id, (c) => ({
      ...c,
      estado: "aceito",
      aceito: true,
      debito: { motivo: texto, autor, em: new Date().toISOString() },
    }));
    setAssumindo(null);
    setMotivo("");
  }

  async function sugerir() {
    if (!onSugerir) return;
    setSugerindo(true);
    setErroSugestao(null);
    try {
      const propostos = await onSugerir();
      // Proposta não vira fato: chegam DESMARCADOS, para alguém aceitar
      // (regra 2 da SPEC-57 — inferir é grátis e erra, e modelo não é exceção).
      onMudar([...cenarios, ...propostos.map((p) => ({ ...p, origem: "sugerido" as const, aceito: false }))]);
    } catch (e) {
      setErroSugestao(e instanceof Error ? e.message : "não deu para sugerir agora");
    } finally {
      setSugerindo(false);
    }
  }

  /**
   * §305 — a guarda do §248 testava a coisa errada, e por isso nunca disparava.
   *
   * Era `hoje.tempoDoPiorTrecho === undefined`. Um desenho com conexões que
   * ESPERAM e nenhum número declarado devolve `ms: 0` — medido no navegador, a
   * tela mostrava "hoje ≥ 0 ms" e um ensaio concluindo "a resposta fica em
   * 0 ms", que é exatamente a tabela de zeros com cara de medição que ela
   * existia para impedir.
   *
   * A mesma função que a PORTA usa: as duas precisam concordar sobre o que é
   * "dá para ensaiar", e duas versões desta conta divergiriam na primeira
   * mudança (§263).
   */
  const falta = faltaParaEnsaiar(diagrama, config);

  return (
    <div style={telaEstilo} data-testid="tela-ensaios">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={onVoltar} style={botaoNeutroEstilo} data-testid="ensaios-voltar">
          ← Voltar à mesa de projeto
        </button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Ensaiar este desenho</h2>
      </div>

      {/* SPEC-68 §4.2 — o nome era "e se ficar lento?", e um nome estreito
          fecha a porta para o que cabe dentro: retry não é lentidão, pico de
          tráfego não é lentidão, disjuntor desligado não é lentidão. */}
      <p style={{ fontSize: 12, color: "var(--texto-2)", maxWidth: 780, lineHeight: 1.5 }}>
        Cada ensaio aplica uma <strong>condição</strong> ao desenho — um componente mais lento, um pico de tráfego,
        mais tentativas — e mostra o efeito na <strong>resposta</strong>, em <strong>por quanto tempo o sistema
        insiste</strong> e no que aquilo passa a <strong>contradizer</strong>. Só conta o trecho em que quem chama
        espera. Nada aqui altera o desenho.
      </p>

      {/* §248 — sem número declarado não há o que ensaiar, e dizer isso é
          melhor do que uma tabela de zeros que parece uma medição.
          
          §305 — a porta já barra este caso; isto continua aqui porque a rota é
          linkável de propósito (SPEC-66), e quem chega por URL ou pelo placar
          merece a mesma frase. */}
      {falta && (
        <div style={avisoEstilo} data-testid="ensaios-sem-tempo">
          {falta.motivo}
          {falta.ondePreencher.length > 0 && (
            <>
              {" "}
              O ensaio parte dos números reais, nunca de números inventados — preencha o{" "}
              <strong>Timeout (ms)</strong> de{" "}
              {falta.ondePreencher.map((e) => e.rotulo).join(", ")} e volte.
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "6px 0 2px" }}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && criar()}
          placeholder="Nome do cenário (ex.: bureau degradado)"
          aria-label="Nome do cenário"
          style={campoEstilo}
        />
        <button onClick={criar} disabled={!nome.trim()} style={botaoEstilo} data-testid="criar-cenario">
          + cenário
        </button>
        {onSugerir && (
          <button onClick={sugerir} disabled={sugerindo} style={botaoNeutroEstilo} data-testid="sugerir-cenarios">
            {sugerindo ? (
              <>
                {/* §298 — a mesma gramática do resto do produto: `●●●` com
                    `pip-pulso` é como a esteira diz "estou trabalhando" antes
                    do primeiro token chegar. Três pontos PARADOS eram a única
                    espera do sistema que não respirava. */}
                ✨ montando <span className="pensando-ao-vivo">●●●</span>
              </>
            ) : (
              "✦ sugerir cenários"
            )}
          </button>
        )}
      </div>
      {erroSugestao && (
        <div style={{ fontSize: 11, color: "var(--amarelo)" }} data-testid="erro-sugestao">
          {erroSugestao}
        </div>
      )}

      <table style={tabelaEstilo} data-testid="tabela-cenarios">
        <thead>
          <tr>
            <th style={thEstilo}>Ensaio</th>
            <th style={thEstilo}>Resposta</th>
            <th style={thEstilo}>Δ</th>
            <th
              style={thEstilo}
              title="Por quanto tempo o sistema insiste antes de desistir: timeout × tentativas, mais as esperas entre elas"
            >
              Insiste até
            </th>
            <th style={thEstilo} title="Quem mais pesa na soma — o total diz que dói, isto diz onde">
              Quem domina
            </th>
            <th style={thEstilo} />
          </tr>
        </thead>
        <tbody>
          {/* A âncora. Sem ela na MESMA tabela, todo número é solto. */}
          <tr data-testid="linha-hoje" style={{ background: "var(--painel-alto)" }}>
            <td style={{ ...tdEstilo, fontWeight: 700 }}>hoje</td>
            <td style={tdEstilo}>
              {/* §305 — `falta` cala o número. `tempoDoPiorTrecho` existe com
                  `ms: 0` num desenho que espera e não declara nada, e "≥ 0 ms"
                  logo abaixo de um aviso dizendo "zero não é uma medição" seria
                  o produto se contradizendo na mesma tela. */}
              {hoje.tempoDoPiorTrecho && !falta ? (
                <Resposta ms={hoje.tempoDoPiorTrecho.ms} completo={hoje.tempoDoPiorTrecho.completo} />
              ) : (
                <span style={{ color: "var(--texto-mudo)" }}>—</span>
              )}
            </td>
            <td style={tdEstilo}>—</td>
            <td style={tdEstilo}>
              <Insistencia ms={insistenciaHoje} />
            </td>
            <td style={tdEstilo}>
              <Dominantes lista={hoje.tempoDoPiorTrecho?.dominantes ?? []} />
            </td>
            <td style={tdEstilo} />
          </tr>

          {/* O que o desenho de HOJE já contradiz — antes de qualquer ensaio.
              Sem isto, uma contradição preexistente pareceria efeito do ensaio. */}
          {contradicoesHoje.length > 0 && (
            <tr data-testid="contradicoes-hoje">
              <td colSpan={6} style={{ ...tdEstilo, background: "var(--painel-alto)" }}>
                <Contradicoes lista={contradicoesHoje} />
              </td>
            </tr>
          )}

          {resultados.map((r) => {
            const cenario = cenarios.find((c) => c.id === r.cenarioId)!;
            const estado = estadoDoEnsaio(cenario);
            const conclusao = concluirEnsaio(r, hoje.tempoDoPiorTrecho?.ms, necessidades ?? []);
            return (
              <Fragmento key={r.cenarioId}>
                <tr
                  data-testid={`linha-${r.cenarioId}`}
                  // O assumido esmaece: ele não cobra mais, e continua na
                  // tabela porque some do placar, não do histórico (§242).
                  style={estado === "aceito" ? { opacity: 0.6 } : undefined}
                >
                  <td style={tdEstilo}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>{cenario.nome}</span>
                      {cenario.origem === "sugerido" && (
                        <span style={tagSugeridoEstilo} title="Proposto pelo modelo">
                          sugerido
                        </span>
                      )}
                      <Estado estado={estado} />
                    </div>
                    {/* §242 — o porquê é o que separa ensinar de cobrar, e sem
                        ele um nome bonito é um cenário que ninguém sabe avaliar.
                        Este texto é do MODELO: a circunstância do mundo. */}
                    {cenario.porque && (
                      <div style={{ fontSize: 10.5, color: "var(--texto-mudo)" }}>{cenario.porque}</div>
                    )}
                    {/* §4.0.1 — a conclusão DERIVADA, que a pessoa não precisa
                        montar cruzando quatro colunas. Nunca escrita pela IA:
                        a circunstância é dela, a conta é do motor. */}
                    {conclusao && (
                      <div style={conclusaoEstilo} data-testid={`conclusao-${r.cenarioId}`}>
                        {conclusao}
                      </div>
                    )}
                    {estado === "aceito" && cenario.debito && (
                      <div style={{ fontSize: 10.5, color: "var(--verde)" }} data-testid={`debito-${r.cenarioId}`}>
                        Assumido: {cenario.debito.motivo}
                        {cenario.debito.autor ? ` — ${cenario.debito.autor}` : ""}
                      </div>
                    )}
                    {estado === "aceito" && (
                      <Anexo
                        ensaioId={r.cenarioId}
                        decisoes={decisoes ?? []}
                        onAnexar={onAnexar}
                      />
                    )}
                  </td>
                  <td style={tdEstilo}>
                    {r.ms === undefined ? (
                      <span style={{ color: "var(--texto-mudo)" }}>—</span>
                    ) : (
                      <Resposta ms={r.ms} completo={r.completo} />
                    )}
                  </td>
                  <td style={tdEstilo}>
                    <Delta ms={r.delta} />
                  </td>
                  <td style={tdEstilo}>
                    <Insistencia ms={r.insistenciaMs} />
                  </td>
                  <td style={tdEstilo}>
                    <Dominantes lista={r.dominantes} />
                  </td>
                  <td style={{ ...tdEstilo, whiteSpace: "nowrap" }}>
                    {/* §4.0 — o fluxo é avaliar → revisar → aceitar ou
                        modificar. Cada estado oferece o verbo que faz sentido
                        NELE; oferecer todos sempre seria de volta aos três
                        botões soltos que não formavam processo. */}
                    {estado !== "aceito" ? (
                      <button
                        style={acaoEstilo}
                        data-testid={`assumir-${r.cenarioId}`}
                        onClick={() => setAssumindo(r.cenarioId)}
                        title="Assumir este débito: sai do placar e fica registrado com quem assumiu e por quê"
                      >
                        assumir
                      </button>
                    ) : (
                      // §283 — nenhuma decisão é de mão única. Reabrir devolve
                      // o ensaio à cobrança sem apagar que alguém já o assumiu.
                      <button
                        style={acaoEstilo}
                        data-testid={`reabrir-${r.cenarioId}`}
                        onClick={() =>
                          mudarCenario(r.cenarioId, (c) => ({
                            ...c,
                            estado: "por-avaliar",
                            aceito: false,
                            debito: undefined,
                          }))
                        }
                        title="Volta a cobrar — o débito deixa de estar assumido"
                      >
                        reabrir
                      </button>
                    )}
                    <button
                      style={acaoEstilo}
                      data-testid={`ajustar-${r.cenarioId}`}
                      onClick={() => {
                        const abrindo = editando !== r.cenarioId;
                        setEditando(abrindo ? r.cenarioId : null);
                        // Mexer no ensaio é REVISAR: o estado acompanha o gesto,
                        // senão o mapa do fluxo seria decoração.
                        if (abrindo && estado === "por-avaliar") {
                          mudarCenario(r.cenarioId, (c) => ({ ...c, estado: "em-revisao" }));
                        }
                      }}
                    >
                      {editando === r.cenarioId ? "fechar" : "revisar"}
                    </button>
                    <button
                      style={acaoEstilo}
                      data-testid={`apagar-${r.cenarioId}`}
                      onClick={() => onMudar(cenarios.filter((c) => c.id !== r.cenarioId))}
                    >
                      apagar
                    </button>
                  </td>
                </tr>

                {/* SPEC-68 — o que ESTE ensaio faz o desenho passar a
                    contradizer. É o que separa "ficou mais lento" de "agora
                    isto não pode dar certo". */}
                {r.contradicoes.length > 0 && (
                  <tr data-testid={`contradicoes-${r.cenarioId}`}>
                    <td colSpan={6} style={{ ...tdEstilo, paddingTop: 0 }}>
                      <Contradicoes lista={r.contradicoes} />
                    </td>
                  </tr>
                )}

                {/* §4.0 — assumir EXIGE motivo, como a exceção do §242. Sem
                    ele isto vira um botão de silenciar, e quem abrir o
                    documento depois não saberá se foi decisão ou cansaço. */}
                {assumindo === r.cenarioId && (
                  <tr data-testid={`assumir-linha-${r.cenarioId}`}>
                    <td colSpan={6} style={{ ...tdEstilo, background: "var(--painel-alto)" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          autoFocus
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && assumir(r.cenarioId)}
                          aria-label="Por que assumir este débito"
                          placeholder="Por que assumimos isto? (ex.: o pico dura 2h/mês e o negócio aceita a espera)"
                          style={{ ...campoEstilo, flex: "1 1 420px" }}
                        />
                        <button
                          onClick={() => assumir(r.cenarioId)}
                          disabled={!motivo.trim()}
                          style={botaoEstilo}
                          data-testid={`confirmar-assumir-${r.cenarioId}`}
                        >
                          assumir o débito
                        </button>
                        <button onClick={() => setAssumindo(null)} style={acaoEstilo}>
                          cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {editando === r.cenarioId && (
                  <tr data-testid={`ajustes-${r.cenarioId}`}>
                    <td colSpan={6} style={{ ...tdEstilo, background: "var(--painel-alto)" }}>
                      <Ajustes
                        elementos={elementos}
                        cenario={cenario}
                        onMudar={(ajustes) => mudarCenario(r.cenarioId, (c) => ({ ...c, ajustes }))}
                      />
                    </td>
                  </tr>
                )}

                {/* §57 — o desenho mudou depois do cenário. Um ensaio que
                    ignorou parte do que lhe pediram tem que dizer. */}
                {r.ajustesSemAlvo.length > 0 && (
                  <tr data-testid={`sem-alvo-${r.cenarioId}`}>
                    <td colSpan={6} style={{ ...tdEstilo, fontSize: 10.5, color: "var(--amarelo)" }}>
                      {r.ajustesSemAlvo.length} ajuste(s) deste cenário apontam para elementos que não existem mais no
                      desenho, e ficaram de fora da conta.
                    </td>
                  </tr>
                )}
              </Fragmento>
            );
          })}

          {/* §298 — o lugar se abre ANTES de a resposta chegar. É o que dá a
              sensação de construção que o produto já tem no streaming: aqui a
              resposta chega inteira, então quem constrói é a tabela. */}
          {sugerindo && <LinhasFantasma />}

          {resultados.length === 0 && !sugerindo && (
            <tr>
              <td colSpan={6} style={{ ...tdEstilo, color: "var(--texto-mudo)" }} data-testid="sem-cenarios">
                Nenhum cenário ainda. Comece por um: "e se o componente mais lento ficar 3× pior?".
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Sem `<>` para o React 18 aceitar `key` sem `Fragment` importado à parte. */
function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** O `≥` sobrevive ao cenário: ele não inventa número que o desenho não deu. */
function Resposta({ ms, completo }: { ms: number; completo: boolean }) {
  return (
    <span
      style={{ fontWeight: 700 }}
      title={completo ? undefined : "É um PISO: nem todo elemento do trecho tem o tempo preenchido."}
    >
      {completo ? "" : "≥ "}
      {formatarDuracao(ms)}
    </span>
  );
}

function Delta({ ms }: { ms?: number }) {
  if (ms === undefined) return <span style={{ color: "var(--texto-mudo)" }}>—</span>;
  if (ms === 0) return <span style={{ color: "var(--texto-mudo)" }}>igual</span>;
  const pior = ms > 0;
  return (
    <span style={{ fontWeight: 700, color: pior ? "var(--amarelo)" : "var(--verde)" }}>
      {pior ? "+" : "−"}
      {formatarDuracao(Math.abs(ms))}
    </span>
  );
}

/**
 * §298 — as linhas que estão sendo montadas.
 *
 * Três, e não o número que vai chegar: ninguém sabe quantos cenários o modelo
 * vai propor, e fingir saber seria a fantasma **afirmando** uma quantidade.
 * Três é o suficiente para o gesto ler como "uma lista sendo construída".
 *
 * As larguras variam de propósito — barras do mesmo tamanho leem como barra de
 * progresso, e não como conteúdo tomando forma.
 */
function LinhasFantasma() {
  const larguras = [
    ["58%", "42%", "30%", "38%", "64%"],
    ["44%", "50%", "26%", "44%", "52%"],
    ["66%", "38%", "34%", "34%", "58%"],
  ];
  return (
    <>
      {larguras.map((linha, i) => (
        <tr
          key={i}
          className="ensaio-fantasma-linha"
          data-testid="ensaio-fantasma"
          aria-hidden="true"
          // O atraso entre as linhas é o que separa "construindo" de "piscando
          // junto": em uníssono, três linhas parecem erro de render.
          style={{ animationDelay: `${i * 90}ms` }}
        >
          {linha.map((largura, j) => (
            <td key={j} style={tdEstilo}>
              <div
                className="ensaio-fantasma"
                style={{ width: largura, height: 10, animationDelay: `${i * 160 + j * 60}ms` }}
              />
            </td>
          ))}
          <td style={tdEstilo} />
        </tr>
      ))}
    </>
  );
}

/**
 * SPEC-69 §4.0 — onde este ensaio está no fluxo.
 *
 * Sem isto os três verbos eram botões soltos; com isto a tela diz, em cada
 * linha, o que se espera de quem está olhando. "aceito" é o único que não
 * cobra, e por isso é o único em verde.
 */
/**
 * SPEC-69 §4.3 — o passo que faltava depois de assumir.
 *
 * Assumir um ensaio já o põe na seção de riscos do documento. Anexá-lo a uma
 * decisão é o que o leva ao **item**, ao lado do critério de aceite — e para
 * quem implementa "sob pico esta chamada leva 24 s" muda como o código é
 * escrito, enquanto o mesmo fato lido só no documento não muda nada.
 *
 * **Um seletor e não uma tela.** A decisão já existe, ancorada no nó onde foi
 * tomada; inventar aqui um lugar de criar decisão seria a segunda porta para a
 * mesma coisa, e a que ficasse para trás seria justamente esta.
 *
 * Sem decisão registrada não aparece seletor nenhum: um controle com zero
 * opções é pior que a ausência dele (§244). O que aparece é a frase que diz
 * onde o gesto existe.
 */
function Anexo({
  ensaioId,
  decisoes,
  onAnexar,
}: {
  ensaioId: string;
  decisoes: { id: string; titulo: string; ensaioIds?: string[] }[];
  onAnexar?: (ensaioId: string, decisaoId: string) => void;
}) {
  if (!onAnexar) return null;
  const atual = decisoes.find((d) => (d.ensaioIds ?? []).includes(ensaioId));

  if (decisoes.length === 0) {
    return (
      <div style={anexoEstilo} data-testid={`sem-decisao-${ensaioId}`}>
        Registre uma decisão no componente para este número chegar ao item de quem implementa.
      </div>
    );
  }

  return (
    <div style={anexoEstilo}>
      <label>
        {atual ? "Sustenta a decisão:" : "Anexar a uma decisão:"}{" "}
        <select
          aria-label={`Decisão sustentada pelo ensaio ${ensaioId}`}
          data-testid={`anexar-${ensaioId}`}
          value={atual?.id ?? ""}
          onChange={(e) => onAnexar(ensaioId, e.target.value)}
          style={{ fontSize: 10.5, maxWidth: 260 }}
        >
          <option value="">— nenhuma</option>
          {decisoes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.titulo}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const anexoEstilo: React.CSSProperties = { fontSize: 10.5, color: "var(--texto-2)", marginTop: 4 };

function Estado({ estado }: { estado: "por-avaliar" | "em-revisao" | "aceito" }) {
  const texto = { "por-avaliar": "por avaliar", "em-revisao": "em revisão", aceito: "débito assumido" }[estado];
  const titulo = {
    "por-avaliar": "Ninguém olhou ainda — e cobra no placar até alguém assumir ou apagar",
    "em-revisao": "Alguém está mexendo nos ajustes. Ainda cobra: o que tira do placar é assumir, não olhar",
    aceito: "O time assumiu este débito de propósito. Saiu do placar, e o motivo ficou registrado",
  }[estado];
  const cor = estado === "aceito" ? "var(--verde)" : "var(--amarelo)";
  return (
    <span
      data-testid={`estado-${estado}`}
      title={titulo}
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: 999,
        border: `1px solid ${cor}`,
        color: cor,
        cursor: "help",
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}

/**
 * SPEC-68 — por quanto tempo o sistema insiste antes de desistir.
 *
 * Coluna própria, e não somada à resposta: inflar o pior caso por tentativas
 * pioraria o defeito que a SPEC-56 §12.1.1 nomeou ("ela grita lobo"). São duas
 * perguntas diferentes, e ficam em duas colunas.
 */
function Insistencia({ ms }: { ms?: number }) {
  if (ms === undefined) return <span style={{ color: "var(--texto-mudo)" }}>—</span>;
  return (
    <span style={{ fontWeight: 600 }} title="timeout × tentativas, mais as esperas entre elas">
      {formatarDuracao(ms)}
    </span>
  );
}

/**
 * O que o desenho passa a contradizer.
 *
 * Contradição não é pior caso: são **dois números declarados que não podem
 * estar os dois certos**. Por isso a cor é âmbar aqui e neutra na leitura —
 * este bloco cobra, e a leitura não.
 */
function Contradicoes({ lista }: { lista: ContradicaoDeResiliencia[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lista.map((c) => (
        <div key={`${c.tipo}-${c.noId ?? c.arestaId}`} style={contradicaoEstilo}>
          <div style={{ fontSize: 11.5 }}>
            <strong>{c.rotulo}</strong> — {c.atual}, e o desenho promete {c.esperado}.
          </div>
          {/* §242 — o porquê é o que separa ensinar de cobrar. */}
          <div style={{ fontSize: 10.5, color: "var(--texto-mudo)" }}>{c.porque}</div>
        </div>
      ))}
    </div>
  );
}

function Dominantes({ lista }: { lista: { elemento: { rotulo: string }; ms: number }[] }) {
  if (lista.length === 0) return <span style={{ color: "var(--texto-mudo)" }}>—</span>;
  return (
    <span style={{ fontSize: 11 }}>
      {lista.map((d) => d.elemento.rotulo).join(", ")}{" "}
      <span style={{ color: "var(--texto-mudo)" }}>({formatarDuracao(lista[0].ms)})</span>
    </span>
  );
}

/**
 * Os sliders — fatia C.
 *
 * Um por elemento ajustado, e a tabela recalcula **enquanto se arrasta**:
 * o cálculo é puro e local, então não há rede entre o gesto e o número.
 */
function Ajustes({
  elementos,
  cenario,
  onMudar,
}: {
  elementos: ElementoAjustavel[];
  cenario: CenarioDeLentidao;
  onMudar: (ajustes: AjusteDeCenario[]) => void;
}) {
  const [alvo, setAlvo] = useState(elementos[0]?.id ?? "");

  function acrescentar() {
    const el = elementos.find((e) => e.id === alvo);
    if (!el || cenario.ajustes.some((a) => a.id === el.id)) return;
    onMudar([...cenario.ajustes, { tipo: el.tipo, id: el.id, fator: 2 }]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {cenario.ajustes.map((a) => {
        const el = elementos.find((e) => e.id === a.id);
        return (
          <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, minWidth: 200 }}>{el?.rotulo ?? a.id}</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={a.fator ?? 1}
              aria-label={`Multiplicador de ${el?.rotulo ?? a.id}`}
              data-testid={`fator-${a.id}`}
              onChange={(e) =>
                onMudar(
                  cenario.ajustes.map((x) =>
                    x.id === a.id ? { ...x, fator: Number(e.target.value), ms: undefined } : x
                  )
                )
              }
              style={{ flex: "1 1 160px", maxWidth: 260 }}
            />
            <strong style={{ fontSize: 12, minWidth: 42 }}>{(a.fator ?? 1).toFixed(1)}×</strong>
            <button
              style={acaoEstilo}
              data-testid={`remover-ajuste-${a.id}`}
              onClick={() => onMudar(cenario.ajustes.filter((x) => x.id !== a.id))}
            >
              remover
            </button>

            {/* SPEC-68 — as condições que NÃO são lentidão. Só aparecem no
                elemento onde fazem sentido: taxa é de quem RECEBE carga (nó),
                tentativas e disjuntor são de quem CHAMA (conexão). Oferecer os
                três em tudo daria controle que não controla nada. */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
              {a.tipo === "no" ? (
                <label style={condicaoEstilo}>
                  pico de
                  <input
                    type="number"
                    min={0}
                    aria-label={`Taxa em req/s de ${el?.rotulo ?? a.id}`}
                    data-testid={`taxa-${a.id}`}
                    value={a.taxaRps ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      onMudar(
                        cenario.ajustes.map((x) =>
                          x.id === a.id
                            ? { ...x, taxaRps: e.target.value === "" ? undefined : Number(e.target.value) }
                            : x
                        )
                      )
                    }
                    style={{ ...campoEstilo, minWidth: 74, width: 74 }}
                  />
                  req/s
                </label>
              ) : (
                <>
                  <label style={condicaoEstilo}>
                    <input
                      type="number"
                      min={1}
                      aria-label={`Tentativas de ${el?.rotulo ?? a.id}`}
                      data-testid={`tentativas-${a.id}`}
                      value={a.tentativas ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        onMudar(
                          cenario.ajustes.map((x) =>
                            x.id === a.id
                              ? { ...x, tentativas: e.target.value === "" ? undefined : Number(e.target.value) }
                              : x
                          )
                        )
                      }
                      style={{ ...campoEstilo, minWidth: 64, width: 64 }}
                    />
                    tentativas
                  </label>
                  <label style={condicaoEstilo}>
                    <input
                      type="checkbox"
                      aria-label={`Disjuntor em ${el?.rotulo ?? a.id}`}
                      data-testid={`disjuntor-${a.id}`}
                      checked={a.disjuntor === true}
                      onChange={(e) =>
                        onMudar(
                          cenario.ajustes.map((x) =>
                            x.id === a.id ? { ...x, disjuntor: e.target.checked ? true : undefined } : x
                          )
                        )
                      }
                    />
                    com disjuntor
                  </label>
                </>
              )}
            </div>
          </div>
        );
      })}

      {elementos.length === 0 ? (
        <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
          Nenhum componente deste desenho declara tempo, então não há o que ajustar.
        </span>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            aria-label="Componente a ajustar"
            style={campoEstilo}
          >
            {elementos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo}
              </option>
            ))}
          </select>
          <button onClick={acrescentar} style={acaoEstilo} data-testid={`add-ajuste-${cenario.id}`}>
            + ajustar este
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * §302 — RELATO REAL: *"no canto direito consta um retângulo com uma barra de
 * rolagem, e não é possível visualizar nada dentro dele"*.
 *
 * Era o **painel de propriedades**. A mesa (canvas + painel) fica montada o
 * tempo todo e não é condicionada à rota; as telas de rota a cobrem. Só que
 * esta tela nasceu no fluxo normal, e por isso **disputava espaço** com a mesa
 * em vez de cobri-la: o `aside` de 320px ficava espremido em 32px de altura,
 * com o texto "Selecione um nó…" sem caber — daí a barra de rolagem sobre um
 * retângulo aparentemente vazio.
 *
 * `fixed` + `inset: 0` + fundo + `zIndex` é o padrão que `ConfigScreen`,
 * `SistemaScreen` e `DocumentoScreen` já usam. Esta era a única fora dele.
 */
const telaEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--painel)",
  zIndex: 55,
  padding: "18px 22px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontFamily: "system-ui, sans-serif",
  color: "var(--texto)",
  overflow: "auto",
};

const tabelaEstilo: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
  marginTop: 4,
};

const thEstilo: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--borda-forte)",
  fontSize: 11,
  color: "var(--texto-mudo)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const tdEstilo: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid var(--borda)",
  verticalAlign: "top",
};

const campoEstilo: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 7,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 12,
  minWidth: 220,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 12px",
  borderRadius: 7,
  border: "1px solid var(--acento)",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
};

const botaoNeutroEstilo: React.CSSProperties = {
  ...botaoEstilo,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-fraco)",
};

const acaoEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "3px 6px",
  marginRight: 6,
  borderRadius: 6,
  border: "1px solid transparent",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const tagSugeridoEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 999,
  border: "1px solid var(--acento)",
  color: "var(--acento)",
};

const condicaoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

/** A conclusão derivada: a frase que a pessoa leria montando quatro colunas. */
const conclusaoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.45,
  color: "var(--texto-2)",
  marginTop: 3,
  maxWidth: 620,
};

const contradicaoEstilo: React.CSSProperties = {
  padding: "6px 9px",
  borderRadius: 7,
  borderLeft: "3px solid var(--amarelo)",
  background: "rgba(245, 158, 11, 0.07)",
};

const avisoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--amarelo)",
  color: "var(--texto-2)",
  background: "rgba(245, 158, 11, 0.08)",
  maxWidth: 760,
};

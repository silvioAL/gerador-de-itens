import { useEffect, useMemo, useRef, useState } from "react";
import {
  concluirEnsaio,
  descreverVolumetria,
  elementosComTempo,
  faltaParaEnsaiar,
  estadoDoEnsaio,
  formatarDuracao,
} from "@gerador/engine";
import type {
  AjusteDeCenario,
  CenarioDeLentidao,
  ContradicaoDeResiliencia,
  Diagrama,
  DiagramaConfig,
  ElementoAjustavel,
  FaltaParaEnsaiar,
  LeituraDoDesenho,
  ResultadoDoCenario,
  VolumetriaDaDemanda,
} from "@gerador/engine";

/**
 * SPEC-66 fatias B e C — a bancada de ensaio. SPEC-107 G4 — **ela mudou de
 * casa e de motor**: era a tela `#/ensaios` simulando no navegador; agora vive
 * junto do FLUXO (`#/fluxo/ensaio`) e **cada número vem de uma execução da
 * fiação semeada `ensaio-de-cenarios`** (`projeto.desenho → funcao(ensaio)`).
 * O cenário entra por `parametrosPorNo` — entrada DESTA execução, não mudança
 * da fiação — e a leitura volta no rastro. O que ficou no cliente é guarda e
 * apresentação (`faltaParaEnsaiar`, a MESMA função da porta, §263; a conclusão
 * derivada; a formatação) — a SIMULAÇÃO não roda mais aqui.
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

/** O que UMA execução da fiação devolve no rastro do nó `ensaio`. */
export interface LeituraDoEnsaio {
  hoje: LeituraDoDesenho;
  contradicoesHoje: ContradicaoDeResiliencia[];
  insistenciaHojeMs?: number;
  falta?: FaltaParaEnsaiar;
  resultado?: ResultadoDoCenario;
}

export interface BancadaDeEnsaiosProps {
  diagrama: Diagrama;
  config: DiagramaConfig;
  cenarios: CenarioDeLentidao[];
  onMudar: (cenarios: CenarioDeLentidao[]) => void;
  onVoltar: () => void;
  /**
   * SPEC-107 G4 — roda UM cenário (ou nenhum: a âncora de hoje) pela fiação
   * semeada e devolve a leitura do rastro. É o único caminho para número
   * nesta bancada — quem injeta é o App, que sabe a demanda aberta e o time.
   */
  executar: (cenario?: CenarioDeLentidao) => Promise<LeituraDoEnsaio>;
  /** SPEC-66 fatia D — sugerir a pauta. Ausente = o botão não aparece, e a
   * tela segue inteira (§244). */
  onSugerir?: () => Promise<CenarioDeLentidao[]>;
  /**
   * SPEC-110 fatia B (D17c) — **onde a bancada se posiciona é do SHELL.**
   *
   * Ela nasceu como gaveta `position: fixed` sobre o canvas — herança de
   * quando era um painel ad hoc. Como CORPO de um stage ela precisa ser um
   * bloco normal, com a moldura Retornar/Avançar acima dela (medido: a gaveta
   * cobria a barra e o Avançar ficava inclicável).
   *
   * É a única prop que a fatia B acrescenta, e ela é deliberadamente rasa:
   * só posicionamento, nenhuma lógica, nenhum layout interno mudado — o
   * "mínimo de impacto" que o usuário pediu, sem fingir que uma gaveta cabe
   * dentro de uma moldura.
   */
  estiloDaRaiz?: React.CSSProperties;
  /**
   * SPEC-69 — o que o NEGÓCIO exige desta demanda. É o que faz o número
   * técnico decidir: "24 s" sozinho não decide nada, "24 s contra os 5 s que
   * prometemos" decide. Sem prazo declarado, a conclusão compara com hoje.
   */
  necessidades?: { texto: string; limiteMs?: number }[];
  /** Quem assume o débito — é o que separa débito consciente de anônimo. */
  autor?: string;
  /**
   * SPEC-70 — o volume da demanda, para o ensaio de PICO não pedir "req/s" em
   * cada elemento ajustado. Pico de tráfego é condição do mundo: com o volume
   * declarado, um fator chega a todos os nós de uma vez.
   */
  volumetria?: VolumetriaDaDemanda;
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

export function BancadaDeEnsaios({
  diagrama,
  config,
  cenarios,
  onMudar,
  onVoltar,
  executar,
  onSugerir,
  estiloDaRaiz,
  necessidades,
  autor,
  volumetria,
  decisoes,
  onAnexar,
}: BancadaDeEnsaiosProps) {
  const [editando, setEditando] = useState<string | null>(null);
  const [assumindo, setAssumindo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [nome, setNome] = useState("");
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);

  /**
   * SPEC-107 G4 — o número vem da FIAÇÃO: uma execução para a âncora de hoje
   * e uma POR cenário (o cenário é `parametrosPorNo` — entrada da execução).
   *
   * O custo que a tela antiga não tinha ("recalcular não custa rede nenhuma")
   * agora existe, então: debounce curto no arrastar, e a leitura anterior fica
   * de pé enquanto a nova não chega — número que pisca para "—" a cada gesto
   * pareceria o desenho piorando.
   *
   * Assumir/reabrir/anexar NÃO reexecutam: mudam o estado do débito, não a
   * conta — a assinatura abaixo olha só o que muda número.
   */
  const [medicao, setMedicao] = useState<{
    hoje: LeituraDoDesenho;
    contradicoesHoje: ContradicaoDeResiliencia[];
    insistenciaHojeMs?: number;
    resultados: ResultadoDoCenario[];
  } | null>(null);
  const [erroDaFiacao, setErroDaFiacao] = useState<string | null>(null);
  const rodada = useRef(0);
  // O App recria `executar` a cada render (ele fecha sobre a demanda aberta).
  // Se o efeito dependesse dele, cada render do App cancelaria e reagendaria o
  // debounce — e num App que re-renderiza mais rápido que 350ms a medição
  // NUNCA dispararia (medido no E2E do F5: tabela inteira em "—"). O ref
  // desacopla: o efeito reage só à assinatura, e chama a versão mais recente.
  const executarRef = useRef(executar);
  executarRef.current = executar;

  /**
   * §305 — a guarda do §248, a MESMA função da porta (§263): sem número
   * declarado não há o que medir, e mandar a fiação somar zeros só produziria
   * a tabela de zeros com cara de medição. Computada ANTES da medição porque
   * é ela que decide se a medição acontece.
   */
  const falta = faltaParaEnsaiar(diagrama, config);

  const assinatura = JSON.stringify({
    v: volumetria,
    semTempo: !!falta,
    c: cenarios.map((c) => ({ id: c.id, ajustes: c.ajustes, fatorDeVolume: c.fatorDeVolume })),
  });
  useEffect(() => {
    const minha = ++rodada.current;
    if (falta) return; // nada a medir — e nada de erro: o aviso já explica
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const cenariosDaConta = JSON.parse(assinatura).c as { id: string }[];
          const medir = executarRef.current;
          const [base, ...dosCenarios] = await Promise.all([
            medir(),
            ...cenariosDaConta.map((c) => medir(cenarios.find((x) => x.id === c.id))),
          ]);
          if (minha !== rodada.current) return; // chegou tarde: já há conta mais nova
          setMedicao({
            hoje: base.hoje,
            contradicoesHoje: base.contradicoesHoje,
            insistenciaHojeMs: base.insistenciaHojeMs,
            resultados: dosCenarios
              .map((l) => l.resultado)
              .filter((r): r is ResultadoDoCenario => r !== undefined),
          });
          setErroDaFiacao(null);
        } catch (e) {
          if (minha !== rodada.current) return;
          setErroDaFiacao(e instanceof Error ? e.message : String(e));
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
    // Deps: a `assinatura` resume o que muda número (id/ajustes/fator/volume);
    // `cenarios` e `executar` ficam de fora de propósito — assumir/reabrir não
    // muda a conta, e a identidade de `executar` muda a cada render do App.
  }, [assinatura]);

  const hoje = medicao?.hoje;
  const contradicoesHoje = medicao?.contradicoesHoje ?? [];
  const insistenciaHoje = medicao?.insistenciaHojeMs;

  // Só quem PODE ter tempo entra na lista de ajustáveis — a mesma função que
  // monta o pedido à IA, para os dois lados oferecerem exatamente o mesmo
  // conjunto. (Guarda e catálogo, não simulação: fica no cliente, §263.)
  const elementos = useMemo(() => elementosComTempo(diagrama, config), [diagrama, config]);

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

  return (
    <div style={{ ...telaEstilo, ...estiloDaRaiz }} data-testid="tela-ensaios">
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
      {/* SPEC-107 G4 — a conta agora atravessa o servidor, e falha de rede
          vira frase, nunca tabela congelada sem explicação. */}
      {erroDaFiacao && (
        <div style={{ fontSize: 11, color: "var(--amarelo)" }} data-testid="ensaios-erro">
          não deu para medir agora: {erroDaFiacao}
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
              {hoje?.tempoDoPiorTrecho && !falta ? (
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
              <Dominantes lista={hoje?.tempoDoPiorTrecho?.dominantes ?? []} />
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

          {cenarios.map((cenario) => {
            // G4 — a linha nasce do CENÁRIO, não da medição: criar, ajustar e
            // assumir não podem ficar reféns da ida ao servidor. O número
            // chega quando a leitura da fiação volta; até lá a célula diz "—".
            const r = medicao?.resultados.find((x) => x.cenarioId === cenario.id);
            const estado = estadoDoEnsaio(cenario);
            const conclusao = r ? concluirEnsaio(r, hoje?.tempoDoPiorTrecho?.ms, necessidades ?? []) : "";
            return (
              <Fragmento key={cenario.id}>
                <tr
                  data-testid={`linha-${cenario.id}`}
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
                      <div style={conclusaoEstilo} data-testid={`conclusao-${cenario.id}`}>
                        {conclusao}
                      </div>
                    )}
                    {estado === "aceito" && cenario.debito && (
                      <div style={{ fontSize: 10.5, color: "var(--verde)" }} data-testid={`debito-${cenario.id}`}>
                        Assumido: {cenario.debito.motivo}
                        {cenario.debito.autor ? ` — ${cenario.debito.autor}` : ""}
                      </div>
                    )}
                    {estado === "aceito" && (
                      <Anexo
                        ensaioId={cenario.id}
                        decisoes={decisoes ?? []}
                        onAnexar={onAnexar}
                      />
                    )}
                  </td>
                  <td style={tdEstilo}>
                    {r?.ms === undefined ? (
                      <span style={{ color: "var(--texto-mudo)" }}>—</span>
                    ) : (
                      <Resposta ms={r.ms} completo={r.completo} />
                    )}
                  </td>
                  <td style={tdEstilo}>
                    <Delta ms={r?.delta} />
                  </td>
                  <td style={tdEstilo}>
                    <Insistencia ms={r?.insistenciaMs} />
                  </td>
                  <td style={tdEstilo}>
                    <Dominantes lista={r?.dominantes ?? []} />
                  </td>
                  <td style={{ ...tdEstilo, whiteSpace: "nowrap" }}>
                    {/* §4.0 — o fluxo é avaliar → revisar → aceitar ou
                        modificar. Cada estado oferece o verbo que faz sentido
                        NELE; oferecer todos sempre seria de volta aos três
                        botões soltos que não formavam processo. */}
                    {estado !== "aceito" ? (
                      <button
                        style={acaoEstilo}
                        data-testid={`assumir-${cenario.id}`}
                        onClick={() => setAssumindo(cenario.id)}
                        title="Assumir este débito: sai do placar e fica registrado com quem assumiu e por quê"
                      >
                        assumir
                      </button>
                    ) : (
                      // §283 — nenhuma decisão é de mão única. Reabrir devolve
                      // o ensaio à cobrança sem apagar que alguém já o assumiu.
                      <button
                        style={acaoEstilo}
                        data-testid={`reabrir-${cenario.id}`}
                        onClick={() =>
                          mudarCenario(cenario.id, (c) => ({
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
                      data-testid={`ajustar-${cenario.id}`}
                      onClick={() => {
                        const abrindo = editando !== cenario.id;
                        setEditando(abrindo ? cenario.id : null);
                        // Mexer no ensaio é REVISAR: o estado acompanha o gesto,
                        // senão o mapa do fluxo seria decoração.
                        if (abrindo && estado === "por-avaliar") {
                          mudarCenario(cenario.id, (c) => ({ ...c, estado: "em-revisao" }));
                        }
                      }}
                    >
                      {editando === cenario.id ? "fechar" : "revisar"}
                    </button>
                    <button
                      style={acaoEstilo}
                      data-testid={`apagar-${cenario.id}`}
                      onClick={() => onMudar(cenarios.filter((c) => c.id !== cenario.id))}
                    >
                      apagar
                    </button>
                  </td>
                </tr>

                {/* SPEC-68 — o que ESTE ensaio faz o desenho passar a
                    contradizer. É o que separa "ficou mais lento" de "agora
                    isto não pode dar certo". */}
                {r && r.contradicoes.length > 0 && (
                  <tr data-testid={`contradicoes-${cenario.id}`}>
                    <td colSpan={6} style={{ ...tdEstilo, paddingTop: 0 }}>
                      <Contradicoes lista={r.contradicoes} />
                    </td>
                  </tr>
                )}

                {/* §4.0 — assumir EXIGE motivo, como a exceção do §242. Sem
                    ele isto vira um botão de silenciar, e quem abrir o
                    documento depois não saberá se foi decisão ou cansaço. */}
                {assumindo === cenario.id && (
                  <tr data-testid={`assumir-linha-${cenario.id}`}>
                    <td colSpan={6} style={{ ...tdEstilo, background: "var(--painel-alto)" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          autoFocus
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && assumir(cenario.id)}
                          aria-label="Por que assumir este débito"
                          placeholder="Por que assumimos isto? (ex.: o pico dura 2h/mês e o negócio aceita a espera)"
                          style={{ ...campoEstilo, flex: "1 1 420px" }}
                        />
                        <button
                          onClick={() => assumir(cenario.id)}
                          disabled={!motivo.trim()}
                          style={botaoEstilo}
                          data-testid={`confirmar-assumir-${cenario.id}`}
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

                {editando === cenario.id && (
                  <tr data-testid={`ajustes-${cenario.id}`}>
                    <td colSpan={6} style={{ ...tdEstilo, background: "var(--painel-alto)" }}>
                      {/* SPEC-70 §5 — o pico da DEMANDA, antes dos ajustes por
                          elemento.
                          
                          Pico de tráfego é condição do MUNDO, não propriedade de
                          um componente escolhido a dedo: com o volume declarado
                          na demanda, este fator chega a todos os nós de uma vez.
                          É o "assim o usuário não precisa preencher" do relato.
                          
                          Sem volume declarado o controle não aparece: multiplicar
                          um número que não existe daria um fator sem efeito, e
                          controle que não controla nada é o §244. */}
                      {volumetria && (
                        <label style={{ ...condicaoEstilo, marginBottom: 8 }} data-testid={`pico-${cenario.id}`}>
                          volume da demanda ×
                          <input
                            type="number"
                            min={1}
                            step={0.5}
                            aria-label={`Fator de volume do ensaio ${cenario.nome}`}
                            value={cenario.fatorDeVolume ?? ""}
                            placeholder="1"
                            onChange={(e) =>
                              mudarCenario(cenario.id, (c) => ({
                                ...c,
                                fatorDeVolume: e.target.value === "" ? undefined : Number(e.target.value),
                              }))
                            }
                            style={{ ...campoEstilo, minWidth: 64, width: 64 }}
                          />
                          <span style={{ color: "var(--texto-mudo)" }}>
                            {descreverVolumetria(volumetria)} — chega a todo o desenho de uma vez
                          </span>
                        </label>
                      )}
                      <Ajustes
                        elementos={elementos}
                        cenario={cenario}
                        onMudar={(ajustes) => mudarCenario(cenario.id, (c) => ({ ...c, ajustes }))}
                      />
                    </td>
                  </tr>
                )}

                {/* §57 — o desenho mudou depois do cenário. Um ensaio que
                    ignorou parte do que lhe pediram tem que dizer. */}
                {r && r.ajustesSemAlvo.length > 0 && (
                  <tr data-testid={`sem-alvo-${cenario.id}`}>
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

          {cenarios.length === 0 && !sugerindo && (
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
                  {/* SPEC-70 §5 — este campo continua existindo porque responde
                      "e se só ESTE componente receber uma rajada?", que não é
                      dedutível do volume da demanda. O pico da demanda inteira
                      mora no cabeçalho do ensaio, e não aqui. */}
                  só este a
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
 * SPEC-107 G4 — de tela cheia a PAINEL sobre o fluxo: a fiação semeada fica
 * visível à esquerda enquanto a bancada mede — é a peça `ensaio` no canvas,
 * não uma tela que a esconde. A lição do §302 continua valendo na nova forma:
 * `position: fixed` + fundo + `zIndex` acima do da `FluxoScreen` (55), para
 * cobrir DE VERDADE a faixa que ocupa em vez de disputar espaço com ela.
 */
const telaEstilo: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "min(900px, 78vw)",
  background: "var(--painel)",
  borderLeft: "1px solid var(--borda)",
  boxShadow: "-12px 0 32px rgba(0,0,0,0.25)",
  zIndex: 56,
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
  color: "var(--acento-gente-texto)",
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

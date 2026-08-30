import { useEffect, useRef, useState } from "react";
import type { Diagrama, DiagramaConfig, Necessidade, RegrasConfig, Token } from "@gerador/engine";
import type { ExcecaoDePadrao, Violacao } from "@gerador/engine";
import {
  analisarLacunas,
  avaliarConformidade,
  avaliarResiliencia,
  chaveDaContradicao,
  cobrancasDeEnsaio,
  contradicoesEmAberto,
  faltaParaEnsaiar,
  avaliarPercursos,
  avaliarTopologia,
  conciliarPercursos,
  deltaDePercurso,
  inferirPercursos,
  lerDesenho,
  resumirDecisoes,
  violacoesDeFormaEmAberto,
  violacoesEmAberto,
} from "@gerador/engine";
import { PercursosPanel } from "./PercursosPanel";
import { LeituraDoDesenhoPanel } from "./LeituraDoDesenhoPanel";
import type { CenarioDeLentidao, CobrancaDeEnsaio, ContradicaoDeResiliencia, Decisao, VolumetriaDaDemanda, LeituraDispensada, LeituraDoDesenho, MarcaDaLeitura, Percurso, ViolacaoDeTopologia } from "@gerador/engine";
import { ReadinessBadge } from "./ReadinessBadge";
import { calcularResumoProntidao, type NoComProntidao } from "./prontidaoResumo";

export interface ReadinessSummaryProps {
  diagrama: Diagrama;
  config: DiagramaConfig;
  onSelecionar: (id: string) => void;
  /** SPEC-57 fatia A — o propósito da demanda. Sem necessidade declarada o
   * indicador não aparece: a dimensão nova não pode acusar quem nunca a usou. */
  necessidades?: Necessidade[];
  /** Abre o painel onde a lacuna se resolve. Sem isto o número seria um beco. */
  onAbrirProposito?: () => void;
  /** §239 — as regras do time; sem elas não há padrão a conferir, e o
   * indicador de conformidade não aparece. */
  regras?: RegrasConfig;
  /** SPEC-79 fatia C — os tokens do design system do time. Sem eles a checagem
   * de pertencimento se cala, que é o comportamento certo para quem ainda não
   * configurou design system nenhum. */
  tokens?: Token[];
  /** Leva ao nó que viola — o equivalente ao "Próximo pendente". */
  onSelecionarViolacao?: (noId: string) => void;
  /** SPEC-64 — o campo que falta no caminho pode estar na CONEXÃO (o
   * `timeoutMs` de uma chamada síncrona mora lá), e o endereço tem que levar
   * até ela. */
  onSelecionarAresta?: (arestaId: string) => void;
  /**
   * SPEC-65 — a leitura do desenho, quando quem chama já a calculou.
   *
   * O App a passa porque ela também alimenta as marcas do canvas, e dois
   * objetos iguais em valor e diferentes em identidade custam repintura lá.
   * Ausente, calcula aqui: o documento monta a faixa sem passar pelo App.
   */
  leitura?: LeituraDoDesenho;
  /** SPEC-65 fatia D — as leituras caladas, e os dois verbos. Ausentes = o
   * painel só lê, sem oferecer ação que ninguém trata. */
  leiturasDispensadas?: LeituraDispensada[];
  onDispensarLeitura?: (marca: MarcaDaLeitura) => void;
  /** SPEC-67 — o fato vira régua do time. Ausente = o verbo não aparece. */
  onVirarRegua?: (marca: MarcaDaLeitura) => void;
  onRestaurarLeitura?: (dispensa: LeituraDispensada) => void;
  /** SPEC-66 — leva à bancada de ensaio. Ausente = a porta não aparece. */
  onSimular?: () => void;
  /**
   * SPEC-69 §4.1 — os ensaios da quebra. Os que ninguém assumiu COBRAM no
   * placar, marcados com o nome: é a inversão que dá nome à SPEC, e sem ela um
   * ensaio que ninguém olhou seguiria invisível.
   */
  cenarios?: CenarioDeLentidao[];
  /**
   * SPEC-70 — o volume da demanda. A saturação passa a fechar sem ninguém
   * digitar a taxa nó a nó: o número é dito uma vez e o grafo o carrega.
   */
  volumetria?: VolumetriaDaDemanda;
  /** §242 — as violações já aceitas de propósito. */
  excecoes?: ExcecaoDePadrao[];
  /** §242 — aceitar uma violação, com motivo. Ausente = a válvula não aparece. */
  onAceitarViolacao?: (violacao: Violacao, motivo: string) => void;
  /**
   * SPEC-63 fatia C — aceitar uma violação de FORMA, com motivo.
   *
   * A válvula entra JUNTO com a régua, e não numa fatia depois: "fila sem
   * consumidor hoje porque o consumidor vem na próxima demanda" é o caso comum,
   * não o exótico. Sem ela, a primeira semana ensina o time a ignorar o ⚖.
   */
  onAceitarViolacaoDeForma?: (violacao: ViolacaoDeTopologia, motivo: string) => void;
  /**
   * §307 — aceitar de propósito uma CONTRADIÇÃO de resiliência.
   *
   * A SPEC-68 §4.1 prometia a válvula e ela não existia. A régua que isto
   * guarda: a exceção com motivo tem que ser a mesma em toda cobrança — senão
   * a pessoa aprende que umas violações se aceitam e outras se ignoram (§230).
   */
  onAceitarContradicao?: (contradicao: ContradicaoDeResiliencia, motivo: string) => void;
  /** SPEC-57 fatia C — as decisões da quebra. Sem nenhuma, o indicador não
   * aparece: mesma disciplina do propósito e da conformidade. */
  decisoes?: Decisao[];
  /** Leva ao nó onde a decisão foi ancorada — sem isto o número seria um beco. */
  onSelecionarDecisao?: (elementoId: string) => void;
  /** SPEC-57 fatia E — os caminhos CONFIRMADOS da quebra. Os inferidos são
   * recalculados aqui a cada render: são função pura do grafo, e guardá-los
   * faria o caminho salvo descolar do desenho. */
  percursos?: Percurso[];
  /** Confirmar/descartar um caminho inferido. Ausente = a dimensão não aparece. */
  onMudarPercursos?: (percursos: Percurso[]) => void;
  /** SPEC-64 fatia B — começar a declarar um caminho à mão. */
  onDeclarar?: () => void;
  /** SPEC-64 fatia C — corrigir o que o motor leu, a partir da sequência dele.
   * Recebe o PERCURSO: o inferido é recalculado a cada render e não está
   * guardado na quebra. */
  onAjustar?: (percurso: Percurso) => void;
}

export function ReadinessSummary({
  diagrama,
  config,
  onSelecionar,
  necessidades,
  cenarios,
  volumetria,
  onAbrirProposito,
  regras,
  tokens,
  onSelecionarViolacao,
  onSelecionarAresta,
  leitura,
  leiturasDispensadas,
  onDispensarLeitura,
  onVirarRegua,
  onRestaurarLeitura,
  onSimular,
  excecoes,
  onAceitarViolacao,
  onAceitarViolacaoDeForma,
  onAceitarContradicao,
  decisoes,
  onSelecionarDecisao,
  percursos,
  onMudarPercursos,
  onDeclarar,
  onAjustar,
}: ReadinessSummaryProps) {
  const { vermelhos, amarelos, verdes } = calcularResumoProntidao(diagrama, config);
  // Dimensão PROPÓSITO (SPEC-56 §0.6): mesma barra, mais uma razão. Amarelo e
  // não vermelho de propósito: lacuna de propósito avisa, não bloqueia derivar
  // — bloquear no primeiro dia ensinaria a ignorar a cor.
  const lacunas = analisarLacunas(diagrama, necessidades ?? []);
  const semElemento = lacunas.semElemento.length;
  // §239 — dimensão CONFORMIDADE: quais padrões este desenho viola. Amarelo
  // como o propósito: acusa, não bloqueia. Bloquear no primeiro dia ensinaria
  // a ignorar a cor, e a decisão de bloquear é do portão, não da medida.
  // §242 — o placar conta só as que ainda cobram alguém. As aceitas de
  // propósito continuam existindo (`avaliarConformidade` as devolve marcadas):
  // some do vermelho, não do histórico.
  const violacoes = violacoesEmAberto(avaliarConformidade(diagrama, config, regras, excecoes ?? [], tokens ?? []));
  // SPEC-63 — a terceira dimensão do padrão: a FORMA. Mesma disciplina das
  // outras duas — sem regra declarada, não acusa nada e não aparece.
  const violacoesDeForma = violacoesDeFormaEmAberto(avaliarTopologia(diagrama, config, regras, excecoes ?? []));
  /**
   * SPEC-69 §4.1 — o que os ENSAIOS fazem este desenho passar a contradizer.
   *
   * A inversão que dá nome à SPEC: **todo ensaio cobra** enquanto ninguém o
   * assumiu. Se só o aceito cobrasse, o débito que ninguém olhou seguiria
   * invisível — e é esse o "inconsciente" que a SPEC existe para acabar.
   *
   * No MESMO chip das outras dimensões, e marcado com o nome do ensaio: é a
   * mesma pergunta ("o que está fora do padrão?"), e a marca é o que impede o
   * placar de confundir *o que é* com *o que seria*.
   */
  const cobrancasDeEnsaios = cobrancasDeEnsaio(diagrama, config, cenarios ?? [], necessidades ?? [], undefined, volumetria);
  /**
   * §307 — as contradições de RESILIÊNCIA, no mesmo chip.
   *
   * A SPEC-68 §4.1 dizia que elas vão ao placar ⚖ "com o porquê e a válvula da
   * exceção, como toda violação desde o §239". Medido no §306: `avaliarResiliencia`
   * só era chamada na bancada de ensaios — quem estava DESENHANDO não via a
   * contradição que o desenho de hoje já tem, e a bancada é justamente onde se
   * pergunta "e se", não "como está".
   *
   * Não é leitura (SPEC-65): leitura é fato, e isto é defeito — dois números
   * declarados que não podem estar os dois certos. Por isso vai ao placar e não
   * ao chip de leitura.
   */
  const contradicoes = contradicoesEmAberto(
    avaliarResiliencia(diagrama, config, undefined, { volume: volumetria, excecoes })
  );
  const avisosDeEnsaio = cobrancasDeEnsaios.reduce((n, c) => n + c.avisos.length, 0);
  // Fatia C — dimensão POR QUÊ. O número que cobra não é "quantas decisões
  // existem" (isso é volume, não qualidade): é quantas esperam alguém e
  // quantas registraram a escolha sem a razão.
  const resumoDecisoes = resumirDecisoes(diagrama, decisoes ?? []);
  // Fatia E — dimensão PERCURSO. Os caminhos são inferidos do grafo a cada
  // render (função pura, sem I/O) e conciliados com o que já foi confirmado:
  // reinferir não pode desconfirmar, e caminho confirmado que sumiu do desenho
  // vira obsoleto em vez de desaparecer.
  const inferidos = inferirPercursos(diagrama);
  // SPEC-64 — o diagrama entra na conciliação: é ele que diz se os nós de um
  // caminho MANUAL ainda existem (e como se chamam agora). Sem ele, todo manual
  // cairia em "obsoleto", porque a lista de vivos vinha só dos inferidos.
  const { percursos: percursosVivos, obsoletos } = conciliarPercursos(inferidos.percursos, percursos ?? [], diagrama);
  const { violacoes: violacoesDePercurso, naoMedidos } = avaliarPercursos(diagrama, config, percursosVivos, regras);
  const pendentes = [...vermelhos, ...amarelos];
  const indicePendenteRef = useRef(0);

  function irParaProximoPendente() {
    if (pendentes.length === 0) return;
    const item = pendentes[indicePendenteRef.current % pendentes.length];
    indicePendenteRef.current += 1;
    onSelecionar(item.no.id);
  }

  return (
    <div
      data-tour="readiness-summary"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "8px 16px",
        borderBottom: "1px solid var(--borda)",
        background: "var(--painel)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      <ContagemComLista rotulo="vermelho" itens={vermelhos} onSelecionar={onSelecionar} />
      <ContagemComLista rotulo="amarelo" itens={amarelos} onSelecionar={onSelecionar} />
      <span style={{ color: "var(--verde)" }}>
        <ReadinessBadge nivel="verde" /> {verdes.length}
      </span>
      {/**
       * SPEC-65 — logo depois das três cores, e por um motivo: elas respondem
       * "os campos estão preenchidos?" e são lidas como "o desenho está bom?".
       * Medido no §290: um desenho com três chamadas síncronas e um bureau de
       * terceiro dizia "VERDE 8 — pronta para derivar" e mais nada. A leitura
       * fica ao lado do número que estava respondendo sozinho.
       */}
      <LeituraDoDesenhoPanel
        // Vem de fora quando quem chama já a tem (o App, que também alimenta as
        // marcas do canvas): duas chamadas dariam dois objetos iguais em valor e
        // diferentes em identidade, e no canvas isso custa repintura.
        leitura={leitura ?? lerDesenho(diagrama, config)}
        onSelecionarNo={onSelecionar}
        onSelecionarAresta={onSelecionarAresta}
        dispensadas={leiturasDispensadas}
        onDispensar={onDispensarLeitura}
        onVirarRegua={onVirarRegua}
        onRestaurar={onRestaurarLeitura}
        onSimular={onSimular}
        /* §305 — a porta valida ANTES de navegar. Calculado aqui, onde o
           desenho e a config já estão, e não dentro do painel: ele renderiza,
           não mede. */
        faltaParaEnsaiar={faltaParaEnsaiar(diagrama, config)}
      />
      {(necessidades?.length ?? 0) > 0 && (
        <button
          data-testid="proposito-resumo"
          onClick={onAbrirProposito}
          title="Necessidades da demanda sem nenhum componente que responda por elas"
          style={{
            ...botaoProximoEstilo,
            borderColor: semElemento > 0 ? "var(--amarelo)" : "var(--borda-forte)",
            color: semElemento > 0 ? "var(--amarelo)" : "var(--texto-fraco)",
          }}
        >
          🎯 {semElemento > 0 ? `${semElemento} sem componente` : "propósito coberto"}
        </button>
      )}
      {violacoes.length + violacoesDeForma.length + contradicoes.length + avisosDeEnsaio > 0 && (
        <ListaDeViolacoes
          violacoes={violacoes}
          violacoesDeForma={violacoesDeForma}
          contradicoes={contradicoes}
          onAceitarContradicao={onAceitarContradicao}
          cobrancasDeEnsaios={cobrancasDeEnsaios}
          onAbrirEnsaios={onSimular}
          onSelecionar={onSelecionarViolacao}
          onSelecionarAresta={onSelecionarAresta}
          onAceitar={onAceitarViolacao}
          onAceitarForma={onAceitarViolacaoDeForma}
        />
      )}
      {/* SPEC-64 — o chip também aparece quando NÃO há caminho lido, desde que
          dê para declarar um: senão o desenho que o inferidor não sabe ler
          (o caso que a fatia B existe para atender) nunca teria por onde
          começar. Dois nós é o mínimo de um caminho. */}
      {onMudarPercursos &&
        (percursosVivos.length + obsoletos.length > 0 || (onDeclarar && diagrama.nodes.length >= 2)) && (
        <PercursosPanel
          // §283 — separados, e não concatenados: juntos, o obsoleto era
          // desenhado com o mesmo ✓ de um caminho que existe no desenho.
          percursos={percursosVivos}
          obsoletos={obsoletos}
          violacoes={violacoesDePercurso}
          naoMedidos={naoMedidos}
          truncado={inferidos.truncado}
          onSelecionarNo={onSelecionar}
          onSelecionarAresta={onSelecionarAresta}
          onDeclarar={onDeclarar}
          onAjustar={onAjustar}
          // §263 — o preço de confirmar. Tudo o que o motor precisa já está
          // aqui (desenho, config, regras, exceções), então a medição não pede
          // nenhuma prop nova: ela é a mesma derivação, rodada duas vezes.
          remedirConfirmacao={(id) =>
            deltaDePercurso(diagrama, config, [...percursosVivos, ...obsoletos], id, { regras, excecoes })
          }
          // Confirmar guarda o caminho; descartar o tira da lista até o desenho
          // mudar de novo — dizer "não é caminho" não pode virar uma briga com
          // o inferidor a cada render, então o descarte grava a recusa.
          onConfirmar={(id) =>
            onMudarPercursos([
              ...(percursos ?? []).filter((p) => p.id !== id),
              ...percursosVivos.filter((p) => p.id === id).map((p) => ({ ...p, confirmado: true })),
            ])
          }
          onDescartar={(id) =>
            onMudarPercursos([
              ...(percursos ?? []).filter((p) => p.id !== id),
              ...percursosVivos.filter((p) => p.id === id).map((p) => ({ ...p, confirmado: false })),
            ])
          }
          /**
           * §283 — apagar a decisão é só tirar o registro guardado. O que sobra
           * depois sai sozinho do `conciliarPercursos`: caminho que o desenho
           * ainda produz volta como `inferido` sem confirmação (ou seja, para a
           * fila); caminho que sumiu simplesmente não é reinferido.
           *
           * Uma linha, três casos — porque no modelo eles sempre foram o mesmo.
           */
          onReabrir={(id) => onMudarPercursos((percursos ?? []).filter((p) => p.id !== id))}
        />
      )}
      {(decisoes?.length ?? 0) > 0 && (
        <ListaDeDecisoes
          decisoes={decisoes ?? []}
          resumo={resumoDecisoes}
          onSelecionar={onSelecionarDecisao}
        />
      )}
      {pendentes.length > 0 && (
        <button onClick={irParaProximoPendente} style={botaoProximoEstilo}>
          ▶ Próximo pendente ({pendentes.length})
        </button>
      )}
    </div>
  );
}

/**
 * SPEC-57 fatia C — o POR QUÊ deste desenho, numa lista só.
 *
 * A cor sai de duas coisas, e nenhuma delas é o volume de decisões: proposta
 * esperando alguém (regra 2 — o agente propõe, a pessoa decide) e decisão
 * vigente sem o porquê preenchido. Contar decisões seria premiar quem escreve
 * muitas, que é exatamente como repositório de ADR vira cemitério.
 *
 * Órfã aparece na lista porque apagar o nó sobre o qual se decidiu algo é o
 * evento que precisa reaparecer, não ser silenciado.
 */
function ListaDeDecisoes({
  decisoes,
  resumo,
  onSelecionar,
}: {
  decisoes: Decisao[];
  resumo: ReturnType<typeof resumirDecisoes>;
  onSelecionar?: (elementoId: string) => void;
}) {
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

  const cobra = resumo.propostas + resumo.semPorque.length + resumo.orfas.length;
  const visiveis = decisoes.filter((d) => d.status !== "substituida");

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        data-testid="decisoes-resumo"
        onClick={() => setAberto((a) => !a)}
        title="As escolhas entre alternativas registradas neste desenho"
        style={{
          ...botaoProximoEstilo,
          borderColor: cobra > 0 ? "var(--amarelo)" : "var(--borda-forte)",
          color: cobra > 0 ? "var(--amarelo)" : "var(--texto-fraco)",
        }}
      >
        🧭{" "}
        {resumo.propostas > 0
          ? `${resumo.propostas} a decidir`
          : resumo.semPorque.length > 0
            ? `${resumo.semPorque.length} sem porquê`
            : `${resumo.vigentes} decisões`}
      </button>

      {aberto && (
        <div data-testid="decisoes-lista" style={popoverEstilo}>
          {visiveis.map((d) => {
            const orfa = resumo.orfas.includes(d.id);
            const alvo = d.noId ?? d.arestaId;
            return (
              <div key={d.id} data-testid={`decisao-${d.id}`} style={{ padding: "8px 4px", borderBottom: "1px solid var(--borda)" }}>
                <button onClick={() => alvo && onSelecionar?.(alvo)} style={{ ...itemPopoverEstilo, fontWeight: 600 }}>
                  {d.status === "proposta" ? "⏳ " : ""}
                  {orfa ? "⚠ " : ""}
                  {d.titulo}
                </button>
                <div style={{ fontSize: 11, color: "var(--texto-fraco)", padding: "0 4px" }}>
                  {d.escolhida}
                  {d.porque.trim() ? ` — ${d.porque}` : ""}
                </div>
                {/* As descartadas também aqui, e não só no painel do nó: esta
                    lista é onde se lê "por que este desenho é assim" de uma
                    vez só, e a resposta sem o que foi rejeitado é meia
                    resposta. */}
                {d.alternativas.filter((a) => a.titulo !== d.escolhida).length > 0 && (
                  <ul style={{ margin: "2px 0 0", paddingLeft: 20, fontSize: 11, color: "var(--texto-mudo)" }}>
                    {d.alternativas
                      .filter((a) => a.titulo !== d.escolhida)
                      .map((a) => (
                        <li key={a.titulo}>
                          <s>{a.titulo}</s>
                          {a.consequencia ? ` — ${a.consequencia}` : ""}
                        </li>
                      ))}
                  </ul>
                )}
                {!d.porque.trim() && d.status === "aceita" && (
                  <div style={{ fontSize: 11, color: "var(--amarelo)", padding: "2px 4px" }}>
                    sem o porquê — quem ler isto daqui a um ano vai refazer a análise
                  </div>
                )}
                {orfa && (
                  <div style={{ fontSize: 11, color: "var(--amarelo)", padding: "2px 4px" }}>
                    o elemento decidido não existe mais no desenho
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * §242 — as violações, com o PORQUÊ do padrão e a válvula para contrariá-lo.
 *
 * Chip só com número não ensina nada: a SPEC-56 §0.7 diz que a mesa deve
 * explicar o padrão, não só cobrá-lo — "forçar a decisão sem explicar produz
 * obediência; explicar produz critério". E sem uma saída legítima a pessoa
 * aprende a ignorar o amarelo, que mata a medição inteira (regra 3).
 */
function ListaDeViolacoes({
  violacoes,
  violacoesDeForma = [],
  contradicoes = [],
  onAceitarContradicao,
  cobrancasDeEnsaios = [],
  onAbrirEnsaios,
  onSelecionar,
  onSelecionarAresta,
  onAceitar,
  onAceitarForma,
}: {
  violacoes: Violacao[];
  /**
   * SPEC-63 — as violações de FORMA, no mesmo chip. É a mesma pergunta ("este
   * desenho está fora do padrão do time?"), e dois chips separados dividiriam a
   * atenção sem dividir o assunto.
   */
  violacoesDeForma?: ViolacaoDeTopologia[];
  /**
   * SPEC-69 §4.1 — o que só seria verdade SOB um ensaio. Entra no mesmo chip,
   * e cada linha carrega o nome do ensaio: sem a marca, "o pool satura" seria
   * lido como fato do desenho de hoje.
   */
  /**
   * §307 — as contradições de resiliência que ainda cobram. Mesmo chip das
   * outras dimensões: é a mesma pergunta ("o que está fora do padrão?"), e
   * chips separados dividiriam a atenção sem dividir o assunto.
   */
  contradicoes?: ContradicaoDeResiliencia[];
  /** A válvula do §242. Ausente = a lista só mostra, como no resto da tela. */
  onAceitarContradicao?: (contradicao: ContradicaoDeResiliencia, motivo: string) => void;
  cobrancasDeEnsaios?: CobrancaDeEnsaio[];
  /** Leva à bancada, onde se assume o débito com motivo. O gesto de aceitar
   * mora junto da evidência, não aqui — aqui só se vê que existe. */
  onAbrirEnsaios?: () => void;
  onSelecionar?: (noId: string) => void;
  onSelecionarAresta?: (arestaId: string) => void;
  onAceitar?: (violacao: Violacao, motivo: string) => void;
  onAceitarForma?: (violacao: ViolacaoDeTopologia, motivo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [aceitando, setAceitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        data-testid="conformidade-resumo"
        onClick={() => setAberto((a) => !a)}
        style={{ ...botaoProximoEstilo, borderColor: "var(--amarelo)", color: "var(--amarelo)" }}
      >
        ⚖{" "}
        {violacoes.length +
          violacoesDeForma.length +
          contradicoes.length +
          cobrancasDeEnsaios.reduce((n, c) => n + c.avisos.length, 0)}{" "}
        fora do padrão
      </button>

      {aberto && (
        <div data-testid="conformidade-lista" style={popoverEstilo}>
          {violacoes.map((v) => {
            const id = `${v.noId}::${v.campo}`;
            return (
              <div key={id} data-testid={`violacao-${id}`} style={{ padding: "8px 4px", borderBottom: "1px solid var(--borda)" }}>
                <button
                  onClick={() => onSelecionar?.(v.noId)}
                  style={{ ...itemPopoverEstilo, fontWeight: 600 }}
                >
                  {v.noLabel}: {v.campo} {v.esperado} — está {v.atual}
                </button>
                <div style={{ fontSize: 11, color: "var(--texto-fraco)", padding: "2px 6px" }}>{v.texto}</div>
                {/* O porquê é o que separa ensinar de cobrar. */}
                {v.porque && (
                  <div data-testid={`porque-${id}`} style={{ fontSize: 11, color: "var(--texto-mudo)", padding: "2px 6px" }}>
                    Por quê: {v.porque}
                  </div>
                )}

                {onAceitar &&
                  (aceitando === id ? (
                    <div style={{ display: "flex", gap: 4, padding: "4px 6px" }}>
                      <input
                        aria-label={`Motivo para aceitar: ${v.texto}`}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="ex.: o parceiro não suporta menos que isso"
                        style={{ flex: 1, fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--borda-forte)", background: "var(--fundo)", color: "var(--texto)" }}
                      />
                      <button
                        aria-label={`Confirmar exceção: ${v.texto}`}
                        disabled={motivo.trim() === ""}
                        onClick={() => {
                          onAceitar(v, motivo.trim());
                          setAceitando(null);
                          setMotivo("");
                        }}
                        style={{ ...botaoProximoEstilo, fontSize: 11 }}
                      >
                        Registrar
                      </button>
                    </div>
                  ) : (
                    <button
                      aria-label={`Aceitar de propósito: ${v.texto}`}
                      onClick={() => {
                        setAceitando(id);
                        setMotivo("");
                      }}
                      style={{ ...itemPopoverEstilo, fontSize: 11, color: "var(--texto-fraco)" }}
                    >
                      aceitar de propósito…
                    </button>
                  ))}
              </div>
            );
          })}

          {/* SPEC-63 — as violações de FORMA, na mesma lista. O elemento que
              elas acusam pode ser um NÓ (falta a conexão) ou uma ARESTA (a
              conexão não devia existir), e o clique tem que levar ao painel
              certo — senão o endereço aponta para o nada. */}
          {violacoesDeForma.map((v) => {
            const elementoId = v.noId ?? v.arestaId ?? "";
            const id = `forma::${v.regraId}::${elementoId}`;
            return (
              <div key={id} data-testid={`violacao-${id}`} style={{ padding: "8px 4px", borderBottom: "1px solid var(--borda)" }}>
                <button
                  onClick={() => (v.arestaId ? onSelecionarAresta?.(v.arestaId) : onSelecionar?.(elementoId))}
                  style={{ ...itemPopoverEstilo, fontWeight: 600 }}
                >
                  {v.rotulo}: esperado {v.esperado} — está {v.atual}
                </button>
                <div style={{ fontSize: 11, color: "var(--texto-fraco)", padding: "2px 6px" }}>{v.texto}</div>
                {v.porque && (
                  <div data-testid={`porque-${id}`} style={{ fontSize: 11, color: "var(--texto-mudo)", padding: "2px 6px" }}>
                    Por quê: {v.porque}
                  </div>
                )}

                {onAceitarForma &&
                  (aceitando === id ? (
                    <div style={{ display: "flex", gap: 4, padding: "4px 6px" }}>
                      <input
                        aria-label={`Motivo para aceitar: ${v.texto}`}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="ex.: o consumidor entra na próxima demanda"
                        style={{ flex: 1, fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--borda-forte)", background: "var(--fundo)", color: "var(--texto)" }}
                      />
                      <button
                        aria-label={`Confirmar exceção: ${v.texto}`}
                        disabled={motivo.trim() === ""}
                        onClick={() => {
                          onAceitarForma(v, motivo.trim());
                          setAceitando(null);
                          setMotivo("");
                        }}
                        style={{ ...botaoProximoEstilo, fontSize: 11 }}
                      >
                        Registrar
                      </button>
                    </div>
                  ) : (
                    <button
                      aria-label={`Aceitar de propósito: ${v.texto}`}
                      onClick={() => {
                        setAceitando(id);
                        setMotivo("");
                      }}
                      style={{ ...itemPopoverEstilo, fontSize: 11, color: "var(--texto-fraco)" }}
                    >
                      aceitar de propósito…
                    </button>
                  ))}
              </div>
            );
          })}

          {/* §307 — as contradições de RESILIÊNCIA: dois números declarados
              que não podem estar os dois certos.

              Com a mesma válvula das outras (§242): a exceção com motivo tem
              que ser a MESMA em toda cobrança, senão a pessoa aprende que umas
              se aceitam e outras se ignoram — e é assim que o placar inteiro
              perde o sentido (§230). */}
          {contradicoes.map((c) => {
            const id = chaveDaContradicao(c);
            return (
              <div key={id} data-testid={`violacao-${id}`} style={{ padding: "8px 4px", borderBottom: "1px solid var(--borda)" }}>
                <button
                  onClick={() => (c.arestaId ? onSelecionarAresta?.(c.arestaId) : onSelecionar?.(c.noId ?? ""))}
                  style={{ ...itemPopoverEstilo, fontWeight: 600 }}
                >
                  {c.rotulo}: {c.atual}
                </button>
                <div style={{ fontSize: 11, color: "var(--texto-fraco)", padding: "2px 6px" }}>
                  esperado: {c.esperado}
                </div>
                {/* O porquê é o que separa ensinar de cobrar — e aqui ele é a
                    conta, não uma opinião. */}
                <div data-testid={`porque-${id}`} style={{ fontSize: 11, color: "var(--texto-mudo)", padding: "2px 6px" }}>
                  Por quê: {c.porque}
                </div>

                {onAceitarContradicao &&
                  (aceitando === id ? (
                    <div style={{ display: "flex", gap: 4, padding: "4px 6px" }}>
                      <input
                        aria-label={`Motivo para aceitar: ${c.rotulo}`}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="ex.: o pico dura 2h/mês e o negócio aceita a fila"
                        style={{ flex: 1, fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--borda-forte)", background: "var(--fundo)", color: "var(--texto)" }}
                      />
                      <button
                        aria-label={`Confirmar exceção: ${c.rotulo}`}
                        disabled={motivo.trim() === ""}
                        onClick={() => {
                          onAceitarContradicao(c, motivo.trim());
                          setAceitando(null);
                          setMotivo("");
                        }}
                        style={{ ...botaoProximoEstilo, fontSize: 11 }}
                      >
                        Registrar
                      </button>
                    </div>
                  ) : (
                    <button
                      aria-label={`Aceitar de propósito: ${c.rotulo}`}
                      onClick={() => {
                        setAceitando(id);
                        setMotivo("");
                      }}
                      style={{ ...itemPopoverEstilo, fontSize: 11, color: "var(--texto-fraco)" }}
                    >
                      aceitar de propósito…
                    </button>
                  ))}
              </div>
            );
          })}

          {/* SPEC-69 §4.1 — o que só seria verdade SOB um ensaio.
              
              A marca com o nome do ensaio não é enfeite: ela diz na própria
              frase que aquilo é condicional, e é o que impede o placar de
              confundir *o que é* com *o que seria*.
              
              Sem "aceitar de propósito…" aqui, e de propósito: assumir um
              ensaio exige motivo e vira registro com autor e data (§4.0). Esse
              gesto mora junto da evidência, na bancada — oferecê-lo aqui, longe
              do número, seria convidar a silenciar sem ler. */}
          {cobrancasDeEnsaios.map((c) =>
            c.avisos.map((aviso, i) => (
              <div
                key={`${c.ensaioId}-${i}`}
                data-testid={`violacao-ensaio::${c.ensaioId}::${i}`}
                style={{ padding: "8px 4px", borderBottom: "1px solid var(--borda)" }}
              >
                <button
                  onClick={() => onAbrirEnsaios?.()}
                  disabled={!onAbrirEnsaios}
                  style={{ ...itemPopoverEstilo, fontWeight: 600 }}
                >
                  Sob “{c.nome}”: {aviso}
                </button>
                <div style={{ fontSize: 11, color: "var(--texto-mudo)", padding: "2px 6px" }}>
                  Condicional — só acontece neste ensaio. Assumir o débito (com motivo) tira do placar.
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ContagemComLista({
  rotulo,
  itens,
  onSelecionar,
}: {
  rotulo: "vermelho" | "amarelo";
  itens: NoComProntidao[];
  onSelecionar: (id: string) => void;
}) {
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

  return (
    <div ref={raizRef} style={{ position: "relative" }}>
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={itens.length === 0}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: itens.length > 0 ? "pointer" : "default",
          font: "inherit",
        }}
      >
        <ReadinessBadge nivel={rotulo} /> {itens.length}
      </button>
      {aberto && itens.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--painel)",
            border: "1px solid var(--borda)",
            borderRadius: 8,
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
            zIndex: 30,
            minWidth: 240,
            maxWidth: 320,
            padding: "4px 0",
          }}
        >
          {itens.map((item) => (
            <button
              key={item.no.id}
              onClick={() => {
                onSelecionar(item.no.id);
                setAberto(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                fontSize: 12,
                padding: "6px 10px",
                background: "none",
                border: "none",
                borderBottom: "1px solid var(--borda)",
                cursor: "pointer",
                color: "var(--texto-2)",
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.no.label}</div>
              {item.camposFaltando.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--texto-mudo)", marginTop: 2 }}>
                  {item.camposFaltando.slice(0, 3).join(", ")}
                  {item.camposFaltando.length > 3 && ` +${item.camposFaltando.length - 3}`}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mesmo desenho do popover de prontidão logo acima — a dimensão é nova, a
 * linguagem visual não. */
const popoverEstilo: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 4,
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 8,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
  zIndex: 30,
  minWidth: 280,
  maxWidth: 380,
  padding: "4px 0",
};

const itemPopoverEstilo: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "4px 6px",
  cursor: "pointer",
  font: "inherit",
  fontSize: 12,
  color: "var(--texto)",
};

const botaoProximoEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(99, 102, 241, 0.45)",
  background: "rgba(99, 102, 241, 0.14)",
  color: "var(--acento-gente-texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

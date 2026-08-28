import { useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { MudancaDeSecao } from "@gerador/engine";
import type {
  Decisao,
  Diagrama,
  EnsaioAssumido,
  DiagramaConfig,
  DocumentoDeDesenho,
  DocumentoEscrito,
  IndicadorDeSaude,
  ItemDoDocumento,
  StatusDocumento,
} from "@gerador/engine";
import { Canvas } from "../canvas/Canvas";
import { useDiagrama, type AplicarNoDiagrama } from "../state/useDiagrama";
import type { ItemGerado, ResultadoDaExportacao } from "../api/client";
import { EscritaDoItem } from "./EscritaDoItem";

/**
 * SPEC-58 — a tela do DOCUMENTO DE DESENHO (`#/documento`).
 *
 * ## O absurdo que ela fecha
 *
 * `quebra.especificacao` era persistida desde o §184 e **nunca exibida**: o App
 * a lia como booleano ("já gerou?"), o markdown ia para o download e sumia da
 * aplicação. O documento não precisou ser criado — precisou de leitor.
 *
 * ## Por que composto, e não markdown num `<pre>`
 *
 * Este documento circula para quem nunca abriu a ferramenta. Markdown cru
 * comunica "isto foi cuspido por uma máquina". E a alternativa óbvia — uma
 * biblioteca de render de markdown — trocaria as seis dependências do
 * `packages/web` por uma árvore inteira, para reparsear um texto que nós mesmos
 * geramos. A estrutura (`estruturarDocumento`) já está na mão.
 *
 * ## A proveniência aplicada ao documento
 *
 * O que uma PESSOA escreveu tem marca visual própria (barra indigo + selo).
 * Quem lê precisa saber o que foi afirmado por gente e o que foi apurado pela
 * máquina — é a mesma disciplina de `Origem`, um nível acima.
 *
 * ## SPEC-61 — uma saída só
 *
 * `#/itens` e `#/documento` eram a mesma coisa vista duas vezes: as duas nascem
 * da mesma derivação, sobre a mesma demanda, no mesmo instante, e o §269
 * precisou criar links de uma para a outra. Quando duas telas precisam apontar
 * uma para a outra o tempo todo, a pergunta certa não é onde pôr o link.
 *
 * A régua: **o documento é a tela; os itens são uma seção dele.** A folha é o
 * que circula, o que se aprova, o que tem status; os cards são o detalhe da
 * seção mais operacional. Não morreu a tela de REVISÃO — lá se *trabalha* o
 * item, aqui se *lê* o resultado, e essa distinção se sustenta.
 */
export interface DocumentoScreenProps {
  documento: DocumentoDeDesenho;
  config: DiagramaConfig;
  escrito: DocumentoEscrito;
  status: StatusDocumento | null;
  onMudarEscrito: (escrito: DocumentoEscrito) => void;
  onMudarStatus: (status: StatusDocumento) => void;
  /** SPEC-58 §5 — o documento mudou depois de aprovado. É a regra que impede
   * "aprovado" de virar carimbo: o trabalho de revisão não se perdeu, mas
   * dizer que continua aprovado depois que o desenho mudou seria mentira. */
  desatualizado?: boolean;
  /** SPEC-60 fatia C — o QUE mudou desde a aprovação, por seção. Lista vazia
   * com `desatualizado` verdadeiro é caso real: a diferença é só espaço em
   * branco, e dizer isso é melhor do que mostrar um amarelo sem explicação. */
  mudancasDesdeAprovacao?: MudancaDeSecao[];
  /** SPEC-73 fatia D — quantas lacunas o documento entrega. O número fica ao
   * lado do selo: aprovar com lacuna CONTADA é decisão, aprovar com lacuna
   * invisível é acidente. */
  lacunas?: number;
  onBaixarMarkdown: () => void;
  onVoltar: () => void;
  /**
   * SPEC-61 §6.1 — a ESCRITA dos itens (`gerarItensDeTrabalho` → `ItemGerado`),
   * que só existe depois que alguém pediu. A DERIVAÇÃO (`documento.itens`)
   * existe sempre.
   *
   * São duas listas, e juntá-las sem dizer qual manda produziria uma seção que
   * às vezes tem quatro itens e às vezes sete, sem ninguém entender por quê.
   * **A derivação manda; a escrita enfeita** — a junção é pela `chave`.
   */
  itensEscritos?: ItemGerado[];
  /** SPEC-44 — deep-link: abre a revisão JÁ no item deste card. É onde se
   * TRABALHA o item; aqui só se lê. */
  onRevisarItem?: (chave: string) => void;
  /** SPEC-49 — manda os itens PRONTOS pro tracker. Ausente = a quebra ainda
   * não foi salva, e sem id não há o que exportar. */
  onExportar?: () => Promise<ResultadoDaExportacao>;
  /** Pra onde vai, como a configuração chamou ("Jira do time X"). */
  destinoDaExportacao?: string | null;
  /**
   * SPEC-69 §4.4 — os ensaios ASSUMIDOS, ao lado da seção de riscos.
   *
   * O texto de riscos é de quem escreveu (SPEC-58 regra 3: sobrevive à
   * regeneração). O ensaio entra **ao lado, nunca dentro**: dois blocos, uma
   * seção, nenhum sobrescreve o outro.
   *
   * Vazio = a seção fica exatamente como era. Quem nunca assumiu um ensaio não
   * ganha caixa nova.
   */
  ensaios?: EnsaioAssumido[];
  /** Qual decisão cada ensaio sustenta — o que ele leva ao item de quem
   * implementa. `undefined` para ensaio que ninguém anexou, e a linha some. */
  decisaoDoEnsaio?: (ensaioId: string) => string | undefined;
}

const ROTULO_STATUS: Record<StatusDocumento, string> = {
  rascunho: "rascunho",
  "em-revisao": "em revisão",
  aprovado: "aprovado",
  implementado: "implementado",
};

const SEQUENCIA: StatusDocumento[] = ["rascunho", "em-revisao", "aprovado", "implementado"];

export function DocumentoScreen({
  documento,
  config,
  escrito,
  status,
  onMudarEscrito,
  onMudarStatus,
  desatualizado,
  mudancasDesdeAprovacao,
  lacunas,
  onBaixarMarkdown,
  onVoltar,
  itensEscritos,
  onRevisarItem,
  onExportar,
  destinoDaExportacao,
  ensaios,
  decisaoDoEnsaio,
}: DocumentoScreenProps) {
  const { violacoes, aceitas, violacoesDePercurso, naoMedidos, percursos, violacoesDeForma, formaAceitas } =
    documento.conferencias;
  const temConferencia =
    violacoes.length +
      aceitas.length +
      violacoesDePercurso.length +
      naoMedidos.length +
      percursos.length +
      violacoesDeForma.length +
      formaAceitas.length >
    0;
  const pedemAtencao = documento.saude.filter((i) => i.lado === "atencao");
  const jaTem = documento.saude.filter((i) => i.lado === "jaTem");

  return (
    <div data-testid="documento-screen" style={fundoEstilo}>
      <header style={barraEstilo}>
        <button onClick={onVoltar} style={linkEstilo}>
          ← Voltar à mesa de projeto
        </button>
        <div style={{ flex: 1 }} />
        <CicloDeStatus
          status={status}
          onMudar={onMudarStatus}
          desatualizado={desatualizado}
          mudancas={mudancasDesdeAprovacao}
          lacunas={lacunas}
        />
        <button onClick={onBaixarMarkdown} style={botaoEstilo} data-testid="baixar-markdown">
          ⬇ Markdown
        </button>
      </header>

      <article style={folhaEstilo}>
        <div style={colunaDeTextoEstilo}>
          <h1 style={{ fontSize: 28, lineHeight: 1.25, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            {documento.titulo}
          </h1>

          {/* §277 (SPEC-61 §4) — a faixa em DUAS partes, com títulos.
              Os chips tinham o mesmo peso visual e só a cor os separava: `🎯 1
              necessidade sem componente` e `⚖ 1 fora do padrão` cobram ação, `🧭
              1 decisão(ões)` é contagem. Nada de cor nova — o que muda é onde a
              coisa está, e lugar comunica antes de cor. */}
          {documento.saude.length > 0 && (
            <div data-testid="faixa-de-saude" style={{ display: "flex", flexWrap: "wrap", gap: 24, margin: "16px 0 4px" }}>
              <ParteDaFaixa testid="saude-pede-atencao" titulo="o que ainda pede atenção" indicadores={pedemAtencao} />
              <ParteDaFaixa testid="saude-ja-tem" titulo="o que este desenho já tem" indicadores={jaTem} />
            </div>
          )}
        </div>

        {documento.contexto.trim() && (
          <Secao titulo="Contexto">
            <Paragrafos texto={documento.contexto} />
          </Secao>
        )}

        {/* SPEC-73 fatia B — a visão geral, ESCRITA por gente.
            Ela nem aparecia nesta tela: era uma string do motor que só existia
            no markdown baixado e no que a aprovação carimbava. A lacuna era
            invisível duas vezes — ninguém a contava, e ninguém a via.
            O esqueleto de antes virou a DICA: no lugar certo, ele diz o formato
            esperado; no lugar errado, ele se passava por resposta. */}
        <SecaoEscrita
          titulo="Visão geral"
          dica="Como <papel>, quero <ação> para que <benefício>. Papel e benefício não se deduzem do desenho — quem sabe é você."
          valor={escrito.visaoGeral ?? ""}
          testid="secao-visao-geral"
          onMudar={(texto) => onMudarEscrito({ ...escrito, visaoGeral: texto })}
        />

        {documento.necessidades.length > 0 && (
          <Secao titulo="O que precisa ser verdade">
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {documento.necessidades.map((n) => (
                <li
                  key={n.texto}
                  style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--borda)" }}
                >
                  <span style={{ flex: "none", width: "1.2em", color: n.atendida ? "var(--verde)" : "var(--amarelo)" }}>
                    {n.atendida ? "✓" : "○"}
                  </span>
                  <span style={{ fontSize: 14 }}>
                    {n.texto}
                    {!n.atendida && (
                      <em style={{ color: "var(--texto-fraco)" }}> (ainda sem componente que responda)</em>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        )}

        {/* §256 — a faixa do DESENHO, e por que ela não é uma `<Secao>`.
            O §254 fez o diagrama escapar da coluna de leitura (46rem é a régua
            do texto, e nela o desenho quebrava). Mas escapou sozinho: o título
            "O desenho" continuou na coluna, ~280px à direita do que ele rotula,
            e o resultado parecia um bloco que caiu fora da folha.
            Título e conteúdo saem JUNTOS, compartilhando a mesma borda
            esquerda — aí a largura maior lê como figura deliberada, não como
            desalinhamento. */}
        <section style={faixaDoDesenhoEstilo}>
          <h2 style={{ ...tituloSecaoEstilo, marginTop: 0 }}>O desenho</h2>
          {documento.diagrama.nodes.length > 0 ? (
            <FiguraDoDesenho diagrama={documento.diagrama} config={config} />
          ) : (
            <Vazio texto="Sem diagrama nesta demanda ainda." />
          )}
        </section>

        <Secao titulo="Decisões">
          {documento.decisoes.length > 0 ? (
            documento.decisoes.map((d) => <CartaoDecisao key={d.id} decisao={d} />)
          ) : (
            // O texto importa: demanda sem decisão arquitetural não é demanda
            // incompleta. É o que a SPEC-58 existe para deixar de tratar como
            // órfã.
            <Vazio texto="Nenhuma decisão entre alternativas nesta demanda — o que é resposta legítima: nem toda mudança move arquitetura." />
          )}
        </Secao>

        {temConferencia && (
          <Secao titulo="O que foi conferido">
            {/* SPEC-63 — o que o DESENHO contraria, antes do que os campos
                contrariam: a forma é o que se lê primeiro num documento de
                arquitetura, e é a que não vira item para ser resolvida depois. */}
            {violacoesDeForma.map((v) => (
              <div key={`f-${v.regraId}-${v.noId ?? v.arestaId}`} data-testid="documento-forma" style={cartaoEstilo("var(--amarelo)")}>
                <strong style={{ fontSize: 14 }}>{v.rotulo}</strong> — {v.texto}: esperado {v.esperado}, está {v.atual}
                {v.porque && <p style={{ ...miudoEstilo, margin: "6px 0 0" }}>{v.porque}</p>}
              </div>
            ))}
            {formaAceitas.map((v) => (
              <div key={`fa-${v.regraId}-${v.noId ?? v.arestaId}`} data-testid="documento-forma-aceita" style={cartaoEstilo()}>
                <strong style={{ fontSize: 14 }}>{v.rotulo}</strong> — {v.texto}:{" "}
                <em>aceito de propósito</em>
                {v.excecao && (
                  <p style={{ ...miudoEstilo, margin: "6px 0 0" }}>
                    “{v.excecao.motivo}” — {v.excecao.autor}
                  </p>
                )}
              </div>
            ))}
            {violacoes.map((v) => (
              <div key={`${v.noId}-${v.campo}`} data-testid="documento-violacao" style={cartaoEstilo("var(--amarelo)")}>
                <strong style={{ fontSize: 14 }}>{v.noLabel}</strong> · {v.campo} {v.esperado} — está {v.atual}
                <div style={metaEstilo}>{v.texto}</div>
                {v.porque && <p style={{ ...miudoEstilo, margin: "6px 0 0" }}>{v.porque}</p>}
              </div>
            ))}
            {aceitas.map((v) => (
              <div key={`ac-${v.noId}-${v.campo}`} style={cartaoEstilo()}>
                <strong style={{ fontSize: 14 }}>{v.noLabel}</strong> · {v.campo} — contrariado de propósito:{" "}
                {v.excecao?.motivo}
                <div style={metaEstilo}>{v.excecao?.autor}</div>
              </div>
            ))}
            {violacoesDePercurso.map((v) => (
              <div key={`p-${v.percursoId}-${v.texto}`} style={cartaoEstilo("var(--amarelo)")}>
                <strong style={{ fontSize: 14 }}>{v.rotulo}</strong> — {v.texto}: esperado {v.esperado}, está {v.atual}
                {v.porque && <p style={{ ...miudoEstilo, margin: "6px 0 0" }}>{v.porque}</p>}
              </div>
            ))}
            {naoMedidos.map((n) => (
              <div key={`nm-${n.percursoId}-${n.campo}`} style={cartaoEstilo()}>
                <strong style={{ fontSize: 14 }}>{n.rotulo}</strong> — não dá para medir "{n.texto}":{" "}
                {/* SPEC-64 — o motivo existe quando a causa não é campo vazio
                    (par ligado por mais de uma conexão que declara o campo). */}
                {n.motivo ?? `falta ${n.campo} em ${n.elementosSemValor.map((e) => e.rotulo).join(", ")}`}
              </div>
            ))}
            {percursos.length > 0 && (
              <p style={metaEstilo}>Caminhos conferidos: {percursos.map((p) => p.rotulo).join(" · ")}</p>
            )}
          </Secao>
        )}

        <SecaoEscrita
          titulo="Trade-offs e o que ficou de fora"
          dica="O que se ganhou e o que se perdeu. É a seção que dá casa à mudança que não tem ADR."
          valor={escrito.tradeOffs ?? ""}
          testid="secao-tradeoffs"
          onMudar={(texto) => onMudarEscrito({ ...escrito, tradeOffs: texto })}
        />
        <SecaoEscrita
          titulo="Riscos e o que pode dar errado"
          dica="O que você está aceitando correr, e o que faria isso virar problema."
          valor={escrito.riscos ?? ""}
          testid="secao-riscos"
          onMudar={(texto) => onMudarEscrito({ ...escrito, riscos: texto })}
        />
        <RiscosMedidos ensaios={ensaios ?? []} decisaoDoEnsaio={decisaoDoEnsaio} />

        <SecaoDosItens
          derivados={documento.itens}
          escritos={itensEscritos ?? []}
          onRevisarItem={onRevisarItem}
          onExportar={onExportar}
          destinoDaExportacao={destinoDaExportacao}
        />
      </article>
    </div>
  );
}

/**
 * SPEC-61 §3 — o desenho como FIGURA.
 *
 * Era um `iframe` com o HTML animado da SPEC-21, e ele trazia junto um painel
 * lateral que muda de tamanho conforme a seleção. Dentro de um documento, isso
 * é um corpo estranho que se mexe sozinho (relato do usuário: *"a lista fica
 * mudando de tamanho"*).
 *
 * **Figura não muda de tamanho, não pede clique e não tem painel lateral.** O
 * que entra é o MESMO React Flow da mesa, em leitura — é mais bonito porque é o
 * mesmo desenho que a pessoa acabou de compor, e não uma segunda renderização
 * parecida.
 *
 * O que se perde é a exploração ("clique num nó para ver os itens
 * relacionados") e o "reproduzir em sequência". Os dois continuam na REVISÃO,
 * que é a tela de trabalhar: documento é para ler, e quem quer explorar volta
 * para a mesa. O `gerarDiagramaHtml` também não morre — ele continua sendo o
 * *"Baixar diagrama (.html)"* da revisão, o artefato que se manda para quem não
 * tem acesso à ferramenta.
 */
function FiguraDoDesenho({ diagrama, config }: { diagrama: Diagrama; config: DiagramaConfig }) {
  // Toda mutação do hook passa pelo `aplicar` — um que não faz nada é o que
  // torna a escrita impossível, e não só desencorajada. O `somenteLeitura` do
  // Canvas é a outra metade: sem ele a interface continuaria convidando a
  // arrastar e a conectar, e convite que não acontece é pior que convite nenhum.
  const estado = useDiagrama(diagrama, NAO_APLICA, config);
  return (
    <div data-testid="documento-diagrama" className="figura-do-desenho" style={figuraEstilo}>
      <ReactFlowProvider>
        <Canvas diagramaState={estado} config={config} somenteLeitura />
      </ReactFlowProvider>
    </div>
  );
}

const NAO_APLICA: AplicarNoDiagrama = () => {};

function ParteDaFaixa({
  testid,
  titulo,
  indicadores,
}: {
  testid: string;
  titulo: string;
  indicadores: IndicadorDeSaude[];
}) {
  // Parte vazia não aparece: "o que ainda pede atenção — (nada)" é um título
  // pedindo para ser lido como problema.
  if (indicadores.length === 0) return null;
  return (
    <div data-testid={testid}>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "var(--texto-mudo)",
          margin: "0 0 6px",
        }}
      >
        {titulo}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {indicadores.map((i) => (
          <span key={`${i.icone}-${i.rotulo}`} style={chipEstilo(i.nivel)}>
            <span style={{ fontSize: 13 }}>{i.icone}</span> {i.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * SPEC-58 §5 — o ciclo. Não bloqueia nada: avisa. Exigir aprovação para
 * derivar transformaria a mesa num portão burocrático, e o primeiro atraso
 * ensinaria o time a aprovar sem ler.
 */
function CicloDeStatus({
  status,
  onMudar,
  desatualizado,
  mudancas,
  lacunas,
}: {
  status: StatusDocumento | null;
  onMudar: (s: StatusDocumento) => void;
  desatualizado?: boolean;
  mudancas?: MudancaDeSecao[];
  /** SPEC-73 fatia D — quantas lacunas o documento entrega. */
  lacunas?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = status ?? "rascunho";

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      {desatualizado && (
        <span data-testid="documento-desatualizado" style={{ fontSize: 11, color: "var(--amarelo)" }}>
          o desenho mudou depois da aprovação
          {/* §264 — e O QUÊ mudou. Sem isto o aviso é verdadeiro e inútil: quem
              lê releria o documento inteiro para achar a diferença, e é assim
              que se aprende a reaprovar sem olhar. */}
          {mudancas !== undefined &&
            (mudancas.length > 0 ? (
              <span data-testid="mudancas-desde-aprovacao">
                {": "}
                {mudancas.map((m, i) => (
                  <span key={`${m.tipo}-${m.titulo}`}>
                    {i > 0 && ", "}
                    {m.tipo} <strong>{m.titulo}</strong>
                  </span>
                ))}
              </span>
            ) : (
              // O booleano acusa qualquer byte; a comparação por seção não. As
              // duas convivem, e calar a segunda deixaria um amarelo sem nada
              // que o explique.
              <span data-testid="mudancas-desde-aprovacao"> — só espaço em branco</span>
            ))}
        </span>
      )}
      {/* SPEC-73 fatia D — o número ao lado do selo, e só quando há o que
          dizer. Aprovar com lacuna CONTADA é decisão; aprovar com lacuna
          invisível é acidente. Não bloqueia (§230): um documento com três
          lacunas declaradas pode ser aprovado de propósito, e o produto
          inteiro é construído sobre essa distinção. */}
      {!!lacunas && (
        <span data-testid="lacunas-do-documento" style={{ fontSize: 11, color: "var(--amarelo)" }}>
          ✍️ {lacunas} {lacunas === 1 ? "lacuna" : "lacunas"} no documento
        </span>
      )}
      <button data-testid="status-documento" onClick={() => setAberto((a) => !a)} style={seloStatusEstilo(atual)}>
        {ROTULO_STATUS[atual]}
      </button>
      {aberto && (
        <div data-testid="status-opcoes" style={popoverEstilo}>
          {SEQUENCIA.map((s) => (
            <button
              key={s}
              data-testid={`status-${s}`}
              onClick={() => {
                onMudar(s);
                setAberto(false);
              }}
              style={{ ...linkEstilo, display: "block", padding: "5px 4px", fontWeight: s === atual ? 700 : 500 }}
            >
              {ROTULO_STATUS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={colunaDeTextoEstilo}>
      <h2 style={tituloSecaoEstilo}>{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * A seção escrita por gente, visualmente distinta da gerada — proveniência
 * aplicada ao documento inteiro (SPEC-58 §7.2). Edita no lugar: mandar a pessoa
 * para outra tela para escrever duas frases é como a seção fica vazia para
 * sempre.
 */
/**
 * SPEC-69 §4.4 — o bloco DERIVADO da seção de riscos.
 *
 * O texto acima é de quem escreveu e sobrevive à regeneração (SPEC-58 regra 3).
 * Este é do motor, e fica **ao lado, nunca dentro**: dois blocos, uma seção,
 * nenhum sobrescreve o outro. É a mesma disciplina que separa o calculado do
 * escrito em todo o resto do produto — e aqui ela importa mais, porque a
 * tentação de "juntar tudo num campo de texto" é exatamente o que faria a
 * regeneração apagar o julgamento de alguém.
 *
 * Sem ensaio assumido, nada aparece: quem não usa isto vê a tela de antes.
 */
function RiscosMedidos({
  ensaios,
  decisaoDoEnsaio,
}: {
  ensaios: EnsaioAssumido[];
  decisaoDoEnsaio?: (ensaioId: string) => string | undefined;
}) {
  if (ensaios.length === 0) return null;
  return (
    <section style={{ marginTop: -8, marginBottom: 20 }} data-testid="riscos-medidos">
      <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "0 0 8px" }}>
        <strong style={{ color: "var(--texto-2)" }}>Riscos medidos</strong> — derivado dos ensaios assumidos. O texto
        acima é seu; este bloco é do motor.
      </p>
      {ensaios.map((e) => {
        const decisao = decisaoDoEnsaio?.(e.id);
        return (
          <div
            key={e.id}
            data-testid={`risco-medido-${e.id}`}
            style={{
              border: "1px solid var(--borda)",
              borderLeft: "3px solid var(--amarelo)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 6,
              background: "var(--painel)",
            }}
          >
            <strong style={{ fontSize: 13 }}>{e.nome}</strong>
            {e.conclusao && (
              <p style={{ fontSize: 12, color: "var(--texto-2)", margin: "4px 0 0", lineHeight: 1.5 }}>{e.conclusao}</p>
            )}
            {/* Os dois porquês são coisas diferentes: um diz por que isto
                aconteceria, o outro por que decidimos conviver com isso. */}
            {e.porque && (
              <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0 0", fontStyle: "italic" }}>
                {e.porque}
              </p>
            )}
            <p style={{ fontSize: 11, color: "var(--verde)", margin: "4px 0 0" }}>
              Assumido{e.autor ? ` por ${e.autor}` : ""}
              {e.em ? ` · ${new Date(e.em).toLocaleDateString("pt-BR")}` : ""}: {e.motivo}
            </p>
            {decisao && (
              <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
                Sustenta a decisão: <strong>{decisao}</strong>
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function SecaoEscrita({
  titulo,
  dica,
  valor,
  testid,
  onMudar,
}: {
  titulo: string;
  dica: string;
  valor: string;
  testid: string;
  onMudar: (texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <section data-testid={testid} style={colunaDeTextoEstilo}>
      <h2 style={tituloSecaoEstilo}>{titulo}</h2>
      <div style={{ borderLeft: "3px solid #4f46e5", padding: "2px 0 2px 16px", margin: "12px 0" }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#a5b4fc" }}>
          escrito por uma pessoa
        </span>
        {editando ? (
          <textarea
            autoFocus
            aria-label={titulo}
            value={valor}
            onChange={(e) => onMudar(e.target.value)}
            onBlur={() => setEditando(false)}
            rows={5}
            style={textareaEstilo}
          />
        ) : valor.trim() ? (
          <div onClick={() => setEditando(true)} style={{ cursor: "text" }}>
            <Paragrafos texto={valor} />
          </div>
        ) : (
          <button onClick={() => setEditando(true)} style={{ ...linkEstilo, display: "block", margin: "6px 0 0" }}>
            ＋ {dica}
          </button>
        )}
      </div>
    </section>
  );
}

function CartaoDecisao({ decisao }: { decisao: Decisao }) {
  const descartadas = decisao.alternativas.filter((a) => a.titulo !== decisao.escolhida);
  return (
    <article data-testid="documento-decisao" style={cartaoEstilo()}>
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{decisao.titulo}</h3>
      {decisao.contexto && <p style={{ ...miudoEstilo, fontStyle: "italic", margin: "0 0 6px" }}>{decisao.contexto}</p>}
      <p style={{ fontSize: 14, margin: 0 }}>
        <strong>{decisao.escolhida}</strong>
        {decisao.porque.trim() ? ` — ${decisao.porque}` : ""}
      </p>
      {descartadas.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, ...miudoEstilo }}>
          {descartadas.map((a) => (
            <li key={a.titulo}>
              <s>{a.titulo}</s>
              {a.consequencia ? ` — ${a.consequencia}` : ""}
            </li>
          ))}
        </ul>
      )}
      {!decisao.porque.trim() && (
        <p style={{ fontSize: 13, color: "var(--amarelo)", margin: "6px 0 0" }}>
          sem o porquê — quem ler isto daqui a um ano vai refazer a análise
        </p>
      )}
      <p style={metaEstilo}>
        {decisao.autor} · {decisao.em.slice(0, 10)}
      </p>
    </article>
  );
}

/**
 * SPEC-61 §2 e §6.1 — a seção "Os itens", que absorveu a tela `#/itens`.
 *
 * ## São DUAS listas, e uma delas manda
 *
 * A **derivação** (`documento.itens`, de `estruturarDocumento`) existe sempre;
 * a **escrita** (`ItemGerado`, de `gerarItensDeTrabalho`) só existe depois que
 * alguém pediu. A seção lista sempre os DERIVADOS — eles são o que o desenho
 * produz —, e onde houver escrita para aquela `chave` o card abre com o texto
 * final. Onde não houver, o card diz "ainda não escrito".
 *
 * Item escrito cuja chave sumiu da derivação aparece **no fim, marcado como
 * órfão**, pela mesma razão do §57: sumir em silêncio esconde justamente o
 * evento que interessa.
 *
 * ## O que ela NÃO faz: gerar
 *
 * Gerar continua sendo ato da revisão (o balão do M7/M12, §270). Uma tela que
 * gera e mostra a mesma coisa é a confusão que esta SPEC está desfazendo.
 * Exportar é outra coisa — é o que se faz com o resultado pronto, e por isso
 * veio junto com os cards em vez de morrer com a tela que os hospedava.
 */
function SecaoDosItens({
  derivados,
  escritos,
  onRevisarItem,
  onExportar,
  destinoDaExportacao,
}: {
  derivados: ItemDoDocumento[];
  escritos: ItemGerado[];
  onRevisarItem?: (chave: string) => void;
  onExportar?: () => Promise<ResultadoDaExportacao>;
  destinoDaExportacao?: string | null;
}) {
  const [exportando, setExportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaExportacao | null>(null);
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);
  // SPEC-47 §196 — a escrita REAL aparece por padrão: o que interessa a quem
  // vai executar é o texto. Quem quiser varrer a lista fecha; o estado guarda
  // quem está FECHADO.
  const [fechados, setFechados] = useState<string[]>([]);

  const linhas = useMemo(() => {
    const porChave = new Map(escritos.map((i) => [i.chave, i]));
    const derivadas = new Set(derivados.map((i) => i.chave));
    return [
      ...derivados.map((d) => ({ chave: d.chave, derivado: d, escrito: porChave.get(d.chave), orfao: false })),
      ...escritos
        .filter((e) => !derivadas.has(e.chave))
        .map((e) => ({ chave: e.chave, derivado: undefined, escrito: e, orfao: true })),
    ];
  }, [derivados, escritos]);

  const prontos = escritos.filter((i) => i.pendencias === 0 && i.sugestoes === 0).length;
  const geradoEm = escritos[0]?.criadoEm ? new Date(escritos[0].criadoEm) : null;

  return (
    <section data-testid="secao-dos-itens" style={colunaDeTextoEstilo}>
      <h2 style={tituloSecaoEstilo}>Os itens</h2>

      {linhas.length === 0 ? (
        // §2 — a mensagem de vazio herdou o que a tela de itens conduzia: sem
        // derivação não há item nenhum, e a escrita nasce na revisão. O botão
        // "Ir para a demanda" não veio junto porque a barra do documento já tem
        // "← Voltar à mesa de projeto" — dois botões para o mesmo lugar.
        <Vazio texto="Nenhum item ainda — derive a demanda na mesa de projeto e, na revisão, peça ao assistente para escrever os itens. Cada um vira um card aqui, com o texto final que vai pro seu tracker." />
      ) : (
        <>
          {escritos.length > 0 && (
            <div style={resumoEstilo} data-testid="itens-resumo">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>
                  {prontos} de {escritos.length} {escritos.length === 1 ? "item pronto" : "itens prontos"} pra exportar
                </strong>
                {geradoEm && (
                  <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>
                    escritos em {geradoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </div>
              <div style={trilhoEstilo} aria-hidden="true">
                <div style={{ ...barraDeProntosEstilo, width: `${(prontos / escritos.length) * 100}%` }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--texto-fraco)", margin: "6px 0 0" }}>
                Um item fica pronto quando nenhum campo pede “✍️ especificar” e nenhuma sugestão da esteira está sem
                confirmação. Só os prontos vão pro tracker — item pela metade não vira issue meia-boca.
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={async () => {
                    if (!onExportar) return;
                    setExportando(true);
                    setErroExportacao(null);
                    setResultado(null);
                    try {
                      setResultado(await onExportar());
                    } catch (e) {
                      setErroExportacao(e instanceof Error ? e.message : String(e));
                    } finally {
                      setExportando(false);
                    }
                  }}
                  disabled={!onExportar || exportando || prontos === 0}
                  data-testid="exportar-prontos"
                  title={
                    !onExportar
                      ? "Salve a quebra antes de exportar"
                      : prontos === 0
                        ? "Nenhum item pronto ainda"
                        : `Manda os ${prontos} itens prontos pro tracker`
                  }
                  style={prontos > 0 && onExportar ? { ...botaoEstilo, ...botaoPrimarioEstilo } : { ...botaoEstilo, opacity: 0.55 }}
                >
                  {exportando ? "exportando…" : `Exportar prontos (${prontos})`}
                </button>
                <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>
                  {destinoDaExportacao
                    ? `destino: ${destinoDaExportacao}`
                    : "sem destino configurado (Configurações → Exportação)"}
                </span>
              </div>

              {erroExportacao && (
                <p style={{ fontSize: 12, color: "var(--vermelho)", margin: "8px 0 0" }} data-testid="erro-exportacao">
                  {erroExportacao}
                </p>
              )}
              {resultado && (
                <div style={{ marginTop: 8 }} data-testid="resultado-exportacao">
                  <p style={{ fontSize: 12.5, color: "var(--verde, #4ade80)", margin: 0 }}>
                    {resultado.exportados.length} item(ns) no {resultado.destino}.
                  </p>
                  {resultado.erros.map((e) => (
                    <p key={e.chave} style={{ fontSize: 12, color: "var(--vermelho)", margin: "4px 0 0" }}>
                      {e.chave}: {e.erro}
                    </p>
                  ))}
                  {resultado.ignorados.length > 0 && (
                    <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
                      {resultado.ignorados.length} ficaram de fora por ainda ter pendência.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {linhas.map((linha, i) => (
            <CartaoItem
              key={linha.chave}
              indice={i}
              derivado={linha.derivado}
              escrito={linha.escrito}
              orfao={linha.orfao}
              expandido={!fechados.includes(linha.chave)}
              onAlternar={() =>
                setFechados((atuais) =>
                  atuais.includes(linha.chave)
                    ? atuais.filter((c) => c !== linha.chave)
                    : [...atuais, linha.chave]
                )
              }
              onRevisar={onRevisarItem}
            />
          ))}
        </>
      )}
    </section>
  );
}

/** A régua de completude do card — quantos ✍️ restam e quantas sugestões da
 * esteira esperam confirmação (SPEC-41 Parte B). */
function completudeDoItem(item: ItemGerado): { rotulo: string; cor: string; fundo: string } {
  if (item.estado === "exportado")
    return { rotulo: "Exportado", cor: "var(--verde, #4ade80)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0 && item.sugestoes === 0)
    return { rotulo: "Pronto pra exportar", cor: "var(--verde, #4ade80)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0)
    return {
      rotulo: `${item.sugestoes} ${item.sugestoes === 1 ? "sugestão" : "sugestões"} a confirmar`,
      cor: "var(--amarelo, #facc15)",
      fundo: "rgba(250, 204, 21, 0.12)",
    };
  return {
    rotulo: `✍️ ${item.pendencias} campo${item.pendencias === 1 ? "" : "s"} a especificar`,
    cor: "var(--laranja, #fb923c)",
    fundo: "rgba(251, 146, 60, 0.12)",
  };
}

function CartaoItem({
  indice,
  derivado,
  escrito,
  orfao,
  expandido,
  onAlternar,
  onRevisar,
}: {
  indice: number;
  derivado?: ItemDoDocumento;
  escrito?: ItemGerado;
  orfao: boolean;
  expandido: boolean;
  onAlternar: () => void;
  onRevisar?: (chave: string) => void;
}) {
  const citacao = (rotulo: string, valores: string[]) =>
    valores.length > 0 ? (
      <p style={{ fontSize: 12.5, color: "var(--texto-2)", margin: "4px 0 0" }}>
        <span style={{ display: "inline-block", minWidth: "5.5em", color: "var(--texto-mudo)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
          {rotulo}
        </span>
        {valores.join(" · ")}
      </p>
    ) : null;

  const completude = escrito ? completudeDoItem(escrito) : null;
  const pendente = !!escrito && escrito.estado !== "exportado" && (escrito.pendencias > 0 || escrito.sugestoes > 0);

  return (
    <article data-testid={`item-gerado-${indice}`} style={cartaoEstilo(orfao ? "var(--amarelo)" : undefined)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ flex: "none", fontSize: 12, fontWeight: 700, color: "var(--texto-mudo)", marginTop: 3 }}>
          {derivado ? derivado.numero : "—"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, margin: 0, lineHeight: 1.4 }}>{derivado?.descricao ?? escrito?.titulo}</h3>
          <p style={metaEstilo}>
            {derivado ? `${derivado.tipo} · ${derivado.tamanho}` : `${escrito?.tipo} · ${escrito?.tamanho}`}
            {derivado && derivado.techs.length > 0 ? ` · ${derivado.techs.join(", ")}` : ""}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {orfao && (
              // §57 — o item escrito que perdeu o lugar no desenho. Some em
              // silêncio e o evento que precisava ser visto some junto.
              <span data-testid={`item-orfao-${indice}`} style={{ ...chipDoItemEstilo, color: "var(--amarelo)" }}>
                órfão — não sai mais do desenho de agora
              </span>
            )}
            {completude &&
              (pendente && onRevisar ? (
                // SPEC-44 — o chip do item não-pronto é o caminho de VOLTA pra
                // revisão daquele item, não um beco.
                <button
                  onClick={() => onRevisar(escrito!.chave)}
                  title="Abrir a revisão já neste item pra resolver as pendências"
                  data-testid={`item-completude-${indice}`}
                  style={{ ...chipDoItemEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent", cursor: "pointer" }}
                >
                  {completude.rotulo} ↩
                </button>
              ) : (
                <span
                  data-testid={`item-completude-${indice}`}
                  style={{ ...chipDoItemEstilo, color: completude.cor, background: completude.fundo, borderColor: "transparent" }}
                >
                  {completude.rotulo}
                </span>
              ))}
            {escrito?.estado === "exportado" && escrito.linkExterno && (
              <a href={escrito.linkExterno} target="_blank" rel="noreferrer" style={{ ...chipDoItemEstilo, textDecoration: "none" }}>
                abrir no tracker ↗
              </a>
            )}
          </div>
          {escrito && escrito.dependencias.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {escrito.dependencias.map((dep) => (
                <span key={dep} style={depEstilo} title="Este item depende do outro — puxe na ordem.">
                  ⛓ {dep}
                </span>
              ))}
            </div>
          )}
          {derivado && citacao("atende", derivado.necessidades)}
          {derivado && citacao("segue", derivado.decisoes)}
          {derivado && citacao("no caminho", derivado.percursos)}
        </div>
        {escrito && (
          <button onClick={onAlternar} style={botaoEstilo} aria-expanded={expandido} data-testid={`item-expandir-${indice}`}>
            {expandido ? "Recolher" : "Ver a escrita"}
          </button>
        )}
      </div>
      {escrito ? (
        expandido && (
          <div style={corpoDoItemEstilo} data-testid={`item-corpo-${indice}`}>
            <EscritaDoItem markdown={escrito.corpoMarkdown} />
          </div>
        )
      ) : (
        // A derivação manda: o item existe porque o desenho o produz. Só o
        // TEXTO ainda não foi escrito, e dizer isso é diferente de omitir o item.
        <p data-testid={`item-sem-escrita-${indice}`} style={{ ...miudoEstilo, fontStyle: "italic", margin: "10px 0 0" }}>
          ainda não escrito — a escrita nasce na revisão da demanda
        </p>
      )}
    </article>
  );
}

/** Parágrafos de texto livre. Não é renderizador de markdown — é o mínimo
 * honesto para o que alguém digitou num textarea. */
function Paragrafos({ texto }: { texto: string }) {
  return (
    <>
      {texto
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} style={{ fontSize: 14, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>
            {p}
          </p>
        ))}
    </>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p style={{ ...miudoEstilo, fontStyle: "italic" }}>{texto}</p>;
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

/**
 * §257 — a coluna de LEITURA, dentro da folha.
 *
 * Antes a folha inteira media 46rem e o desenho escapava dela por margem
 * negativa — pintando fora do cartão e cruzando a borda, o que lê como duas
 * camadas sobrepostas. Invertido: a folha é a página, e o TEXTO é que se
 * limita a 46rem, centrado. Nada mais precisa escapar de nada.
 */
const colunaDeTextoEstilo: React.CSSProperties = {
  maxWidth: "46rem",
  marginLeft: "auto",
  marginRight: "auto",
};

const folhaEstilo: React.CSSProperties = {
  // A folha acompanha o que o desenho precisa; a régua de ~72 caracteres
  // continua valendo, mas para o texto (ver `colunaDeTextoEstilo`).
  maxWidth: "min(1100px, calc(100vw - 48px))",
  margin: "28px auto 80px",
  padding: "40px 44px",
  borderRadius: 16,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
  lineHeight: 1.6,
  boxShadow: "0 10px 40px rgba(15,23,42,.20)",
};

/** A faixa larga do desenho: sai da coluna de leitura levando o título junto,
 * e se anuncia como figura (fundo e respiro próprios) em vez de parecer um
 * bloco solto. O teto de 1100px é o que o gerador do diagrama precisa para não
 * empilhar o cabeçalho; abaixo disso ele volta a caber na tela, seja qual for. */
const faixaDoDesenhoEstilo: React.CSSProperties = {
  // §257 — largura da folha, sem margem negativa. Escapar do cartão era o que
  // fazia a faixa pintar por cima da borda dele.
  width: "100%",
  marginTop: 36,
  padding: "18px 20px 20px",
  borderRadius: 16,
  background: "var(--painel-2, rgba(148,163,184,.06))",
  border: "1px solid var(--borda)",
};

const tituloSecaoEstilo: React.CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "var(--texto-fraco)",
  margin: "36px 0 12px",
  paddingBottom: 6,
  borderBottom: "1px solid var(--borda)",
};

function cartaoEstilo(destaque?: string): React.CSSProperties {
  return {
    border: "1px solid var(--borda)",
    borderLeft: destaque ? `3px solid ${destaque}` : "1px solid var(--borda)",
    borderRadius: 12,
    padding: "14px 16px",
    margin: "10px 0",
  };
}

function chipEstilo(nivel: "verde" | "amarelo" | "vermelho"): React.CSSProperties {
  const cor = nivel === "verde" ? "var(--verde)" : nivel === "amarelo" ? "var(--amarelo)" : "var(--vermelho)";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 999,
    border: `1px solid ${cor}`,
    color: cor,
  };
}

function seloStatusEstilo(status: StatusDocumento): React.CSSProperties {
  const cor = status === "aprovado" || status === "implementado" ? "var(--verde)" : "#a5b4fc";
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    padding: "4px 12px",
    borderRadius: 999,
    border: `1px solid ${cor}`,
    background: "transparent",
    color: cor,
    cursor: "pointer",
  };
}

const popoverEstilo: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 70,
  minWidth: 160,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  boxShadow: "0 12px 32px rgba(15,23,42,.35)",
};

const metaEstilo: React.CSSProperties = { color: "var(--texto-mudo)", fontSize: 12, margin: "6px 0 0" };
const miudoEstilo: React.CSSProperties = { color: "var(--texto-fraco)", fontSize: 13 };

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

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

/** Altura FIXA — é o que faz dela uma figura. O quadro que crescia com a
 * seleção era o incômodo relatado ("a lista fica mudando de tamanho"). */
const figuraEstilo: React.CSSProperties = {
  height: 460,
  borderRadius: 12,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  overflow: "hidden",
};

const resumoEstilo: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid var(--borda)",
  background: "var(--painel-2, rgba(148,163,184,.06))",
  margin: "12px 0 16px",
};

const trilhoEstilo: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: "var(--fundo)",
  marginTop: 10,
  overflow: "hidden",
};

const barraDeProntosEstilo: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "var(--verde, #4ade80)",
  transition: "width 300ms ease",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  background: "var(--acento)",
  borderColor: "var(--acento)",
  color: "#fff",
};

const chipDoItemEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  color: "var(--texto-2)",
  background: "var(--fundo)",
};

const depEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px dashed var(--borda-forte)",
  color: "var(--texto-fraco)",
  background: "transparent",
};

const corpoDoItemEstilo: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--fundo)",
  maxHeight: 520,
  overflow: "auto",
};

const textareaEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "8px 10px",
  fontSize: 14,
  lineHeight: 1.6,
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel-2, transparent)",
  color: "var(--texto)",
  fontFamily: "inherit",
  resize: "vertical",
};

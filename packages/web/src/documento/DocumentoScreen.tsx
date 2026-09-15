import { useEffect, useMemo, useState } from "react";
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
  SecaoDeJulgamento,
  SpecEscrita,
  StatusDocumento,
} from "@gerador/engine";
import { Canvas } from "../canvas/Canvas";
import { useDiagrama, type AplicarNoDiagrama } from "../state/useDiagrama";
import type { EnvioDeSpecIniciado, ItemGerado, ResultadoDaExportacao } from "../api/client";
import { EscritaDoItem } from "./EscritaDoItem";
import {
  contarPipeline,
  etapaDaSpec,
  ROTULO_DA_ETAPA,
  ROTULO_DO_CHIP_DA_SPEC,
  type ContagemDoPipeline,
} from "./etapaDaSpec";

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
  /**
   * SPEC-81 fatia B — publicar o documento na base de conhecimento.
   *
   * **Ausente = nenhum destino configurado**, e o botão não aparece. É a mesma
   * disciplina da SPEC-49: oferecer um botão que falharia é pior que não
   * oferecer, porque a pessoa descobre o problema depois de esperar.
   */
  onPublicar?: () => Promise<{ linkExterno: string; destino: string }>;
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
   * SPEC-114 — a SEGUNDA chamada: anexa a spec de CADA item ao issue que a
   * exportação já criou. Ausente = a spec da demanda ainda tem lacuna, ou a
   * quebra ainda não foi salva — nos dois casos não há o que mandar.
   */
  onAnexarSpec?: () => Promise<EnvioDeSpecIniciado>;
  /**
   * SPEC-115 — **as três respostas sem as quais a spec não sai, e que não
   * tinham mais onde ser escritas.**
   *
   * ACHADO REAL, validando a fatia D contra o produto de pé: `gerarSpec` marca
   * `origem`, `recusas` e `fatias` vazias como lacuna (`✍️ especificar`), e
   * "enviar spec com lacuna" é recusa da SPEC-98 §6 — então **todo** item
   * voltava como `comLacuna` e o botão "Anexar spec aos itens" nunca anexava
   * nada. A tela que editava essas seções deixou de existir em algum momento;
   * o `SecaoEscrita` exportado "para a tela da spec" (SPEC-84 fatia A) ficou
   * sem consumidor, e `mudarSpecEscrita` virou função morta no `App`.
   *
   * O botão estava verde em teste e morto no produto — é o padrão que esta casa
   * já pagou caro (SPEC-115 §1.2 existe porque a experiência precisa EXISTIR).
   *
   * Ausente = o bloco não aparece, e a tela é a de antes.
   */
  specEscrita?: SpecEscrita;
  onMudarSpecEscrita?: (spec: SpecEscrita) => void;
  /**
   * SPEC-115 fatia F (§410) — **a conversa que produz a decisão de onde a spec
   * deriva.**
   *
   * Recebe o contexto do projeto colado e o componente sobre o qual a conversa
   * é (§1.1.1), e devolve QUANTAS propostas chegaram — a tela não precisa das
   * decisões em si, elas vão para a mesa como proposta e são aceitas lá, onde a
   * pessoa as vê ao lado do desenho.
   *
   * Ausente = a caixa da conversa não aparece, e as seções continuam
   * editáveis à mão. É a mesma disciplina da SPEC-49: não oferecer botão que
   * falharia.
   */
  onConversarSobreASpec?: (pedido: { contextoDoProjeto: string; foco?: string }) => Promise<number>;
  /**
   * SPEC-115 (§410) — **o que o motor JÁ consegue derivar, calculado por quem
   * monta a spec.**
   *
   * Vem de fora em vez de ser recalculado aqui de propósito: quem chama é o
   * mesmo que monta o markdown que vai subir, com o mesmo material. Duas
   * leituras da mesma pergunta divergem na primeira mudança (§263) — e esta
   * divergência seria cruel, porque a tela diria "pode subir" e o envio
   * recusaria por lacuna, sem ninguém entender por quê.
   */
  julgamentoDerivado?: Partial<Record<SecaoDeJulgamento, string>>;
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

/**
 * SPEC-81 fatia B — o botão de publicar, com o resultado ao lado.
 *
 * Componente próprio porque ele tem estado (publicando, link, erro) e a tela do
 * documento não deveria ganhar três `useState` por causa de um botão.
 *
 * **O resultado fica na tela em vez de virar alerta**: a URL da página publicada
 * é o que a pessoa vai querer copiar e mandar para alguém, e um alerta some
 * antes disso. É a mesma escolha que a exportação de itens já fez.
 */
function BotaoPublicar({ onPublicar }: { onPublicar: () => Promise<{ linkExterno: string; destino: string }> }) {
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState<{ linkExterno: string; destino: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function publicar() {
    setPublicando(true);
    setErro(null);
    try {
      setResultado(await onPublicar());
    } catch (e) {
      // O 409 de "há mais de um destino" chega aqui como mensagem: a escolha
      // entre dois espaços de documentação é da pessoa, e o servidor recusa
      // escolher por ela.
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setPublicando(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button onClick={() => void publicar()} disabled={publicando} style={botaoEstilo} data-testid="publicar-documento">
        {publicando ? "publicando…" : "↗ Publicar"}
      </button>
      {resultado && (
        <a
          href={resultado.linkExterno}
          target="_blank"
          rel="noreferrer"
          data-testid="documento-publicado"
          style={{ fontSize: 11.5, color: "var(--acento)" }}
        >
          publicado em {resultado.destino} ↗
        </a>
      )}
      {erro && (
        <span data-testid="erro-ao-publicar" style={{ fontSize: 11.5, color: "var(--vermelho)", maxWidth: 320 }}>
          {erro}
        </span>
      )}
    </span>
  );
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
  onPublicar,
  onVoltar,
  itensEscritos,
  onRevisarItem,
  onExportar,
  destinoDaExportacao,
  onAnexarSpec,
  specEscrita,
  onMudarSpecEscrita,
  onConversarSobreASpec,
  julgamentoDerivado,
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
        {/**
         * SPEC-81 fatia B — publicar na base de conhecimento da casa.
         *
         * Só aparece quando há para onde publicar: `onPublicar` ausente = nenhum
         * destino de documento configurado, e a mesma disciplina da SPEC-49 vale
         * aqui — botão que falharia não se oferece.
         */}
        {onPublicar && <BotaoPublicar onPublicar={onPublicar} />}
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

        {/* SPEC-115 fatias A e C — a seção deixou de nascer em branco. Com
            decisão registrada, ela mostra o que cada escolha ganhou e custou, e
            o rótulo conta a verdade nova: o conteúdo é derivado, o texto livre
            é complemento. Sem decisão nenhuma, a tela é exatamente a de antes —
            o fallback não é um caso de borda, é o caso de quem não usa isto. */}
        <SecaoEscrita
          titulo="Trade-offs e o que ficou de fora"
          dica="O que se ganhou e o que se perdeu. É a seção que dá casa à mudança que não tem ADR."
          dicaDeComplemento="Complemente com o que as decisões registradas não cobrem."
          rotuloDeOrigem={
            documento.decisoes.length > 0
              ? `derivado de ${documento.decisoes.length} ${documento.decisoes.length === 1 ? "decisão" : "decisões"} — edite ou complemente`
              : undefined
          }
          derivado={documento.decisoes.length > 0 ? <TradeOffsDerivados decisoes={documento.decisoes} /> : undefined}
          valor={escrito.tradeOffs ?? ""}
          testid="secao-tradeoffs"
          onMudar={(texto) => onMudarEscrito({ ...escrito, tradeOffs: texto })}
        />
        {/* SPEC-115 fatia B — mesma tese, fonte diferente: o que o usuário
            respondeu na revisão da SPEC-115 §4.1 é que riscos derivam dos
            ENSAIOS (o débito assumido), não de uma categoria nova de decisão.
            O bloco já existia, e estava solto DEPOIS da seção; agora ele é o
            derivado DELA, que é o que o comentário do `RiscosMedidos` sempre
            disse que ele era ("dois blocos, uma seção"). */}
        <SecaoEscrita
          titulo="Riscos e o que pode dar errado"
          dica="O que você está aceitando correr, e o que faria isso virar problema."
          dicaDeComplemento="Complemente com o risco que nenhum ensaio mediu."
          rotuloDeOrigem={
            (ensaios ?? []).length > 0
              ? `derivado de ${ensaios!.length} ${ensaios!.length === 1 ? "ensaio assumido" : "ensaios assumidos"} — edite ou complemente`
              : undefined
          }
          derivado={
            (ensaios ?? []).length > 0 ? (
              <RiscosMedidos ensaios={ensaios ?? []} decisaoDoEnsaio={decisaoDoEnsaio} />
            ) : undefined
          }
          valor={escrito.riscos ?? ""}
          testid="secao-riscos"
          onMudar={(texto) => onMudarEscrito({ ...escrito, riscos: texto })}
        />

        <SecaoDosItens
          derivados={documento.itens}
          escritos={itensEscritos ?? []}
          onRevisarItem={onRevisarItem}
          onExportar={onExportar}
          destinoDaExportacao={destinoDaExportacao}
          onAnexarSpec={onAnexarSpec}
          specEscrita={specEscrita}
          onMudarSpecEscrita={onMudarSpecEscrita}
          onConversarSobreASpec={onConversarSobreASpec}
          julgamentoDerivado={julgamentoDerivado ?? {}}
          componentes={documento.diagrama.nodes.map((n) => ({ id: n.id, rotulo: n.label }))}
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
 * O texto de quem escreveu sobrevive à regeneração (SPEC-58 regra 3). Este é do
 * motor, e fica **ao lado, nunca dentro**: dois blocos, uma seção, nenhum
 * sobrescreve o outro. É a mesma disciplina que separa o calculado do escrito
 * em todo o resto do produto — e aqui ela importa mais, porque a tentação de
 * "juntar tudo num campo de texto" é exatamente o que faria a regeneração
 * apagar o julgamento de alguém.
 *
 * **SPEC-115 fatia B — ele mudou de lugar, e só de lugar.** Era uma `<section>`
 * solta DEPOIS da seção de riscos; virou o bloco `derivado` DELA, acima do
 * texto livre. Os dois blocos continuam sendo dois, e agora a seção que os
 * hospeda é literalmente uma — que é o que este comentário sempre descreveu.
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
    <div style={{ margin: "12px 0 0" }} data-testid="riscos-medidos">
      <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "0 0 8px" }}>
        {/* SPEC-115 fatia B — "acima" virou "abaixo": o bloco do motor passou a
            vir PRIMEIRO na seção, e a frase precisava acompanhar. Dizer a ordem
            errada é o tipo de resíduo que sobrevive a uma mudança de layout e
            faz a pessoa procurar um texto que não está onde a tela diz. */}
        <strong style={{ color: "var(--texto-2)" }}>Riscos medidos</strong> — derivado dos ensaios assumidos. Este bloco
        é do motor; o texto abaixo é seu.
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
    </div>
  );
}

/**
 * SPEC-84 fatia A — exportada para a tela da spec.
 *
 * Não é reuso por economia: o que este componente carrega é a **semântica** de
 * "isto foi escrito por uma pessoa" — a marca, o clique que abre a edição, e a
 * dica no lugar do vazio. As três seções de julgamento da spec são a mesma coisa
 * pela mesma razão (SPEC-80 §2), e duas cópias divergiriam na primeira mudança
 * de comportamento (§263).
 */
export function SecaoEscrita({
  titulo,
  dica,
  valor,
  testid,
  onMudar,
  derivado,
  rotuloDeOrigem,
  dicaDeComplemento,
}: {
  titulo: string;
  dica: string;
  valor: string;
  testid: string;
  onMudar: (texto: string) => void;
  /**
   * SPEC-115 fatias A e B — **o bloco do motor, acima do que a pessoa escreve.**
   *
   * Ausente = a seção é exatamente a de antes. Presente, ele vem PRIMEIRO: a
   * seção deixa de ser uma caixa em branco pedindo redação e passa a mostrar o
   * que já se sabe, com o texto livre como complemento do que a derivação não
   * cobre.
   *
   * Ele fica fora da barra indigo de propósito — a barra marca o que uma pessoa
   * afirmou, e carimbar o derivado com ela seria a proveniência mentindo na
   * própria tela que existe para não deixar isso acontecer.
   */
  derivado?: React.ReactNode;
  /** SPEC-115 fatia C — o que a barra indigo diz. Ausente = "escrito por uma
   * pessoa", que continua verdade quando não há nada derivado. */
  rotuloDeOrigem?: string;
  /** SPEC-115 fatia C — o convite quando já HÁ conteúdo derivado: complementar
   * é um gesto diferente de escrever do zero, e a dica de escrever do zero
   * sobre uma lista já preenchida soa como se a lista não contasse. */
  dicaDeComplemento?: string;
}) {
  const [editando, setEditando] = useState(false);
  const convite = derivado && dicaDeComplemento ? dicaDeComplemento : dica;

  return (
    <section data-testid={testid} style={colunaDeTextoEstilo}>
      <h2 style={tituloSecaoEstilo}>{titulo}</h2>
      {derivado}
      <div style={{ borderLeft: "3px solid var(--acento-gente)", padding: "2px 0 2px 16px", margin: "12px 0" }}>
        <span
          data-testid={`${testid}-origem`}
          style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--acento-gente-texto)" }}
        >
          {rotuloDeOrigem ?? "escrito por uma pessoa"}
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
            ＋ {convite}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * SPEC-115 fatia A — **os trade-offs, derivados das decisões que já existem.**
 *
 * ## A medição que mudou a fatia
 *
 * A SPEC-114 adiou trocar o rótulo "escrito por uma pessoa" porque a seção
 * dependia de um fluxo de mapeamento que ninguém construiu (SPEC-75). Medindo,
 * a dependência era menor do que a escrita anterior presumiu: `Decisao` já é
 * praticamente o material de um trade-off, e está no banco desde a SPEC-57.
 *
 * ```
 * titulo · contexto · alternativas: {titulo, consequencia?}[] · escolhida · porque
 * ```
 *
 * **A alternativa NÃO escolhida, com a consequência dela, é literalmente "o que
 * se perdeu"; a escolhida com o porquê é "o que se ganhou".** Nada precisou ser
 * inventado no modelo — só lido do outro ângulo.
 *
 * ## Por que não é a seção "Decisões" de novo
 *
 * O cartão de decisão acima responde *"o que se decidiu, e isso está
 * registrado?"* — por isso ele cobra o porquê ausente e assina autor e data.
 * Aqui a pergunta é outra: *"o que esta demanda pagou por isso?"*. Mesmo dado,
 * eixo diferente — ganhou/perdeu, lado a lado. Duas leituras da mesma decisão
 * não são duplicação; um documento de desenho que não diz o preço do que
 * escolheu é exatamente o documento que a seção existia para cobrar em branco.
 *
 * Decisão sem alternativa descartada aparece com o lado "perdeu" vazio, e isso
 * é resposta legítima: escolher entre uma opção só não custou nada, e fingir um
 * custo seria pior que declarar que não houve.
 */
function TradeOffsDerivados({ decisoes }: { decisoes: Decisao[] }) {
  if (decisoes.length === 0) return null;
  return (
    <div data-testid="tradeoffs-derivados" style={{ margin: "12px 0 0" }}>
      <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "0 0 8px" }}>
        <strong style={{ color: "var(--texto-2)" }}>
          {decisoes.length === 1 ? "1 decisão registrada" : `${decisoes.length} decisões registradas`}
        </strong>{" "}
        — o que cada uma ganhou e o que custou. Este bloco é do motor; o texto abaixo é seu.
      </p>
      {decisoes.map((d) => {
        const descartadas = d.alternativas.filter((a) => a.titulo !== d.escolhida);
        return (
          <div
            key={d.id}
            data-testid={`tradeoff-derivado-${d.id}`}
            style={{
              border: "1px solid var(--borda)",
              borderLeft: "3px solid var(--acento)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 6,
              background: "var(--painel)",
            }}
          >
            <strong style={{ fontSize: 13 }}>{d.titulo}</strong>
            <p style={{ fontSize: 12, color: "var(--verde)", margin: "4px 0 0", lineHeight: 1.5 }}>
              ganhou <strong>{d.escolhida}</strong>
              {d.porque.trim() ? ` — ${d.porque}` : ""}
            </p>
            {descartadas.length > 0 ? (
              <p style={{ fontSize: 12, color: "var(--amarelo)", margin: "4px 0 0", lineHeight: 1.5 }}>
                perdeu{" "}
                {descartadas.map((a, i) => (
                  <span key={a.titulo}>
                    {i > 0 && " · "}
                    <strong>{a.titulo}</strong>
                    {a.consequencia ? ` — ${a.consequencia}` : ""}
                  </span>
                ))}
              </p>
            ) : (
              <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0 0", fontStyle: "italic" }}>
                nenhuma alternativa foi descartada — esta escolha não teve preço registrado
              </p>
            )}
          </div>
        );
      })}
    </div>
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
  onAnexarSpec,
  specEscrita,
  onMudarSpecEscrita,
  onConversarSobreASpec,
  julgamentoDerivado,
  componentes,
}: {
  derivados: ItemDoDocumento[];
  escritos: ItemGerado[];
  onRevisarItem?: (chave: string) => void;
  onExportar?: () => Promise<ResultadoDaExportacao>;
  destinoDaExportacao?: string | null;
  onAnexarSpec?: () => Promise<EnvioDeSpecIniciado>;
  specEscrita?: SpecEscrita;
  onMudarSpecEscrita?: (spec: SpecEscrita) => void;
  onConversarSobreASpec?: (pedido: { contextoDoProjeto: string; foco?: string }) => Promise<number>;
  julgamentoDerivado: Partial<Record<SecaoDeJulgamento, string>>;
  componentes: { id: string; rotulo: string }[];
}) {
  const [exportando, setExportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaExportacao | null>(null);
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);
  const [anexando, setAnexando] = useState(false);
  /**
   * SPEC-115 fatia E — o que sobrou de estado local, e por que só isto.
   *
   * O `resultadoDoAnexo` de antes guardava o DESFECHO do envio num `useState`,
   * e era o defeito que a SPEC-98 §3.2 nomeou: um envio de minutos morava na
   * memória de uma aba, e trocar de tela ou dar F5 apagava o rastro. O desfecho
   * agora mora no item (`specEnviadaEm`/`specAnexada`/`specErro`), que vem do
   * servidor — o que sobra aqui é só o que é mesmo efêmero: o que a chamada de
   * partida disse que ficou de fora, e por quê.
   */
  const [inicioDoEnvio, setInicioDoEnvio] = useState<EnvioDeSpecIniciado | null>(null);
  const [erroDoAnexo, setErroDoAnexo] = useState<string | null>(null);
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
  // SPEC-114 — só item que já subiu pro tracker e ainda não tem a spec dele
  // anexada é candidato. O que ainda não tem `linkExterno` aparece como
  // `semLinkExterno` na resposta, não some daqui.
  const pendentesDeSpec = escritos.filter((i) => i.linkExterno && !i.specAnexada).length;
  // SPEC-115 fatias E e G — o pipeline vem do DADO, não de um estado de envio.
  const pipeline = useMemo(() => contarPipeline(escritos), [escritos]);
  const envioEmCurso = pipeline.anexando > 0;
  /**
   * SPEC-115 fatia H — **o motivo do botão morto, à vista.**
   *
   * Queixa do usuário: *"o botão de exportar fica desabilitado, mas isso não
   * faz sentido já que eu posso chegar nessa tela"*. A régua da SPEC-71 é que o
   * motivo fica sempre visível — e ele estava só no `title`, que é hover: quem
   * está no celular, no teclado ou com pressa nunca o via. A revisão avisa
   * antes (fatia H, do outro lado); aqui a tela para de ficar muda.
   */
  const motivoDeNaoExportar = !onExportar
    ? "Salve a demanda antes de exportar — sem id da quebra não há o que mandar."
    : prontos === 0
      ? "Nenhum item está pronto: todos ainda têm campo pedindo “✍️ especificar” ou sugestão da esteira a confirmar. Resolva na revisão da demanda e volte aqui."
      : null;

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

              {/* SPEC-115 fatia H — o motivo sai do `title` e vai para a tela. */}
              {motivoDeNaoExportar && (
                <p
                  data-testid="motivo-exportar-desabilitado"
                  style={{ fontSize: 12, color: "var(--amarelo)", margin: "8px 0 0", lineHeight: 1.5 }}
                >
                  {motivoDeNaoExportar}
                </p>
              )}

              {erroExportacao && (
                <p style={{ fontSize: 12, color: "var(--vermelho)", margin: "8px 0 0" }} data-testid="erro-exportacao">
                  {erroExportacao}
                </p>
              )}
              {resultado && (
                <div style={{ marginTop: 8 }} data-testid="resultado-exportacao">
                  <p style={{ fontSize: 12.5, color: "var(--verde)", margin: 0 }}>
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

              {/* SPEC-114 — a SEGUNDA chamada, separada da exportação (§1.1 da
                  SPEC-81): ciclo de vida e modo de falhar diferentes. Só aparece
                  quando há pelo menos um item já exportado esperando a spec.
                  SPEC-115 — o botão some enquanto um envio está em curso: pedir
                  de novo no meio duplicaria a chamada para o mesmo issue. */}
              {onAnexarSpec && pendentesDeSpec > 0 && onMudarSpecEscrita && (
                <JulgamentoDaSpec
                  escrita={specEscrita ?? {}}
                  onMudar={onMudarSpecEscrita}
                  quantosItens={pendentesDeSpec}
                  derivado={julgamentoDerivado}
                  componentes={componentes}
                  onConversarComAgente={onConversarSobreASpec}
                />
              )}

              {onAnexarSpec && pendentesDeSpec > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={async () => {
                      setAnexando(true);
                      setErroDoAnexo(null);
                      setInicioDoEnvio(null);
                      try {
                        setInicioDoEnvio(await onAnexarSpec());
                      } catch (e) {
                        setErroDoAnexo(e instanceof Error ? e.message : String(e));
                      } finally {
                        setAnexando(false);
                      }
                    }}
                    disabled={anexando || envioEmCurso}
                    data-testid="anexar-spec"
                    title={
                      envioEmCurso
                        ? "Um envio já está em curso — o acompanhamento abaixo diz em que item está"
                        : `Anexa a spec de cada item ao issue que já existe, ${pendentesDeSpec} de cada vez`
                    }
                    style={{ ...botaoEstilo, opacity: anexando || envioEmCurso ? 0.55 : 1 }}
                  >
                    {anexando || envioEmCurso ? "anexando…" : `Anexar spec aos itens (${pendentesDeSpec})`}
                  </button>
                </div>
              )}

              {erroDoAnexo && (
                <p style={{ fontSize: 12, color: "var(--vermelho)", margin: "8px 0 0" }} data-testid="erro-anexo-spec">
                  {erroDoAnexo}
                </p>
              )}
              {/* SPEC-115 fatia E — o que a chamada de PARTIDA disse que ficou
                  de fora. Ele é efêmero de propósito: são decisões tomadas sem
                  chamar ninguém, e o item que ficou de fora continua dizendo
                  por quê no próprio card. */}
              {inicioDoEnvio && (
                <div style={{ marginTop: 8 }} data-testid="inicio-do-envio">
                  <p style={{ fontSize: 12.5, color: "var(--texto-2)", margin: 0 }}>
                    {inicioDoEnvio.emAndamento.length} spec(s) a caminho de {inicioDoEnvio.destino}.
                    {inicioDoEnvio.demonstracao && (
                      <strong style={{ color: "var(--amarelo)" }}> ✦ modo de demonstração — nada sai daqui.</strong>
                    )}
                  </p>
                  {inicioDoEnvio.comLacuna.length > 0 && (
                    <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
                      {inicioDoEnvio.comLacuna.length} ficaram de fora por a spec ainda ter lacuna.
                    </p>
                  )}
                  {inicioDoEnvio.semLinkExterno.length > 0 && (
                    <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
                      {inicioDoEnvio.semLinkExterno.length} ainda não subiram pro tracker.
                    </p>
                  )}
                </div>
              )}

              <PipelineDaSpec contagem={pipeline} escritos={escritos} />
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

/**
 * SPEC-115 — **as três respostas que fazem a spec poder sair.**
 *
 * ## O defeito que este bloco fecha
 *
 * `gerarSpec` marca `origem`, `recusas` e `fatias` vazias como lacuna, e a
 * SPEC-98 §6 recusa enviar spec com lacuna. Com a tela que editava essas
 * seções fora do ar, TODO item voltava como `comLacuna`: o botão "Anexar spec
 * aos itens" aparecia, era clicável, respondia 200 e não anexava nada — e a
 * tela dizia apenas *"N ficaram de fora por a spec ainda ter lacuna"*, sem
 * lugar nenhum para resolver isso.
 *
 * ## Por que aqui, e não numa tela própria
 *
 * Porque é onde a pessoa está quando bate na parede. É a mesma escolha do §269
 * (o documento alcançável de onde se acabou de revisar) e da SPEC-58 §7.2
 * (editar no lugar: mandar alguém para outra tela para escrever duas frases é
 * como a seção fica vazia para sempre).
 *
 * ## O que ele NÃO faz: oferecer "✦ escrever para mim"
 *
 * A SPEC-98 §6 e a SPEC-80 §2 recusam isso explicitamente, e há teste que falha
 * se estas seções virarem preenchíveis por modelo. Origem, recusas e fatias são
 * julgamento — o que a máquina escrevesse ali seria a máquina especificando
 * para si mesma.
 */
function JulgamentoDaSpec({
  escrita,
  onMudar,
  quantosItens,
  derivado,
  componentes,
  onConversarComAgente,
}: {
  escrita: SpecEscrita;
  onMudar: (spec: SpecEscrita) => void;
  quantosItens: number;
  /** O que o motor JÁ consegue derivar do que foi decidido — a fonte da verdade
   * é a mesma função que monta a spec, para a tela nunca prometer diferente. */
  derivado: Partial<Record<SecaoDeJulgamento, string>>;
  componentes: { id: string; rotulo: string }[];
  onConversarComAgente?: (pedido: { contextoDoProjeto: string; foco?: string }) => Promise<number>;
}) {
  const [contextoDoProjeto, setContextoDoProjeto] = useState("");
  const [foco, setFoco] = useState("");
  const [conversando, setConversando] = useState(false);
  const [resposta, setResposta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const estado = (secao: SecaoDeJulgamento) =>
    escrita[secao]?.trim() ? "escrita" : derivado[secao]?.trim() ? "derivada" : "vazia";
  const vazias = SECOES.filter((s) => estado(s) === "vazia");

  async function conversar() {
    if (!onConversarComAgente) return;
    setConversando(true);
    setErro(null);
    setResposta(null);
    try {
      const quantas = await onConversarComAgente({ contextoDoProjeto, foco: foco || undefined });
      setResposta(
        quantas === 0
          ? "O agente não viu escolha em aberto aqui — lista vazia é resposta legítima. Acrescente contexto do projeto, ou registre a decisão você mesmo na mesa."
          : `${quantas} ${quantas === 1 ? "decisão proposta" : "decisões propostas"} — elas chegam como PROPOSTA na mesa de projeto, e valem depois que você aceitar.`
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setConversando(false);
    }
  }

  return (
    <section data-testid="julgamento-da-spec" style={{ marginTop: 14 }}>
      <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "0 0 2px" }}>
        <strong style={{ color: "var(--texto-2)" }}>A spec que vai junto com cada item</strong> — o que ela afirma sai do
        que foi decidido, não de um formulário.
      </p>

      {vazias.length > 0 ? (
        // O motivo do que vai acontecer, ANTES de acontecer. Sem esta linha, a
        // pessoa clica, espera, e recebe "ficaram de fora por ter lacuna" sem
        // saber qual lacuna nem onde resolvê-la.
        <p data-testid="spec-sem-julgamento" style={{ fontSize: 12, color: "var(--amarelo)", margin: "0 0 8px", lineHeight: 1.5 }}>
          {vazias.length === 1 ? "Falta 1 seção" : `Faltam ${vazias.length} seções`} sem nada de onde sair (
          {vazias.map((s) => ROTULO_DA_SECAO[s]).join(", ")}). Enquanto for assim,{" "}
          {quantosItens === 1 ? "o item fica" : `os ${quantosItens} itens ficam`} de fora: spec com lacuna não sobe.
        </p>
      ) : (
        <p data-testid="spec-com-julgamento" style={{ fontSize: 12, color: "var(--verde)", margin: "0 0 8px" }}>
          {/* O número sai de `SECOES`, e não de uma palavra escrita à mão: a
              SPEC-119 fatia A acrescentou a quarta seção, e "as três" teria
              continuado na tela dizendo o número errado sem nada acusar. */}
          As {SECOES.length} têm de onde sair — a spec de cada item pode subir.
        </p>
      )}

      {/**
       * SPEC-115 fatia F (§410) — **a caixa é a superfície da conversa.**
       *
       * Correção do usuário depois da primeira escrita desta tela, que tinha
       * posto três textareas em branco aqui: *"a caixa tem o objetivo dessa
       * interação com o agente, onde se coloca input e interage com o agente
       * para passar contexto de projeto e tomar decisões que depois vão derivar
       * para as respectivas specs"*.
       *
       * A cadeia inteira, e cada elo tem dono:
       *
       * ```
       * contexto do projeto → o agente PROPÕE → a pessoa ACEITA → a spec DERIVA
       *      (quem conhece)      (modelo)        (julgamento)      (motor)
       * ```
       *
       * **Por que isto não fura a trava da SPEC-80 fatia D:** o modelo não
       * escreve nenhuma das três seções. Ele propõe `Decisao`, que chega
       * `status: "proposta"` e não vale nada até alguém aceitar — e só o que foi
       * aceito deriva (ver `derivarJulgamento.ts`). O julgamento continua sendo
       * de gente; o que deixou de existir é a exigência de redigitar o que já
       * foi julgado.
       *
       * **Por que o contexto é colado e não buscado:** a fronteira decidida na
       * SPEC-75 e reafirmada na SPEC-115 §2 — o produto não executa script de
       * ninguém. Quem conhece o código cola o que importa.
       */}
      {onConversarComAgente && (
        <div
          data-testid="conversa-da-spec"
          style={{ border: "1px solid var(--borda)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}
        >
          <p style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "0 0 6px", lineHeight: 1.5 }}>
            Converse com o assistente para decidir. Cole o que já existe do projeto — schema, rotas, um trecho do
            documento dele — ou deixe em branco se o componente é novo. O que sair daqui vira <strong>proposta</strong>{" "}
            de decisão; aceitar é seu.
          </p>

          {componentes.length > 0 && (
            <>
              <label style={{ display: "block", fontSize: 11, color: "var(--texto-fraco)", margin: "6px 0 2px" }}>
                Sobre qual componente
              </label>
              {/* §1.1.1 — por componente, e não da demanda inteira: oito
                  componentes na mesma conversa produzem decisão que não ancora
                  em lugar nenhum. "A demanda inteira" continua sendo opção,
                  para quem ainda está começando o desenho. */}
              <select
                aria-label="Sobre qual componente"
                value={foco}
                onChange={(e) => setFoco(e.target.value)}
                style={campoDaConversaEstilo}
              >
                <option value="">a demanda inteira</option>
                {componentes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </>
          )}

          <label style={{ display: "block", fontSize: 11, color: "var(--texto-fraco)", margin: "8px 0 2px" }}>
            O que já existe do projeto (opcional — cole, nada é executado)
          </label>
          <textarea
            aria-label="Contexto do projeto"
            value={contextoDoProjeto}
            onChange={(e) => setContextoDoProjeto(e.target.value)}
            rows={4}
            placeholder={"ex.: TABLE pedidos (id uuid, status text)\nrotas: POST /pedidos, GET /pedidos/:id\nhoje chama o bureau de forma síncrona"}
            style={{ ...campoDaConversaEstilo, resize: "vertical", fontFamily: "ui-monospace, monospace" }}
          />

          <button
            onClick={() => void conversar()}
            disabled={conversando}
            data-testid="conversar-sobre-a-spec"
            style={{ ...botaoEstilo, marginTop: 8, opacity: conversando ? 0.55 : 1 }}
          >
            {conversando ? "conversando…" : "✦ Conversar e decidir"}
          </button>

          {resposta && (
            <p data-testid="resposta-da-conversa" style={{ fontSize: 12, color: "var(--texto-2)", margin: "8px 0 0", lineHeight: 1.5 }}>
              {resposta}
            </p>
          )}
          {erro && (
            <p data-testid="erro-da-conversa" style={{ fontSize: 12, color: "var(--vermelho)", margin: "8px 0 0" }}>
              {erro}
            </p>
          )}
        </div>
      )}

      {SECOES.map((secao) => (
        <SecaoEscrita
          key={secao}
          titulo={ROTULO_DA_SECAO[secao]}
          dica={DICA_DA_SECAO[secao]}
          dicaDeComplemento="Complemente com o que o que já foi decidido não cobre."
          rotuloDeOrigem={estado(secao) === "derivada" ? ORIGEM_DERIVADA[secao] : undefined}
          derivado={
            estado(secao) === "derivada" ? (
              <div
                data-testid={`spec-${secao}-derivado`}
                style={{
                  border: "1px solid var(--borda)",
                  borderLeft: "3px solid var(--acento)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  margin: "12px 0 0",
                  background: "var(--painel)",
                  fontSize: 12.5,
                  color: "var(--texto-2)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {derivado[secao]}
              </div>
            ) : undefined
          }
          valor={escrita[secao] ?? ""}
          testid={`spec-${secao}`}
          onMudar={(texto) => onMudar({ ...escrita, [secao]: texto })}
        />
      ))}
    </section>
  );
}

/**
 * A ordem da TELA é a da leitura de quem revisa, e ela acompanha a do artefato
 * (SPEC-119 fatia E): quem pediu, o que ficou decidido, o que ficou fora, o que
 * se constrói.
 *
 * `decisoes` entrou aqui junto com a fatia A. Ela é a seção que o §2.1 achou
 * faltando: o §410 fez as decisões alimentarem a spec só pelo lado negativo, e
 * a escolhida — a informação de que quem escreve código precisa — não tinha
 * onde morar.
 */
const SECOES: SecaoDeJulgamento[] = ["origem", "decisoes", "recusas", "fatias"];

const ROTULO_DA_SECAO: Record<SecaoDeJulgamento, string> = {
  origem: "Quem pediu, e com que palavras",
  decisoes: "O que já foi decidido, e por quê",
  recusas: "O que NÃO entra, e por quê",
  fatias: "O que fica verdade em cada fatia, e como se prova",
};

const DICA_DA_SECAO: Record<SecaoDeJulgamento, string> = {
  origem: "A frase de quem pediu. É o que permite, meses depois, saber se o que foi construído responde ao que foi pedido.",
  decisoes:
    "A restrição, e a razão que a torna checável. Quem lê a spec para implementar precisa saber qual padrão USAR — não só qual evitar.",
  recusas: "Recusa sem motivo é opinião; com motivo é projeto — e é o que impede a spec de virar lista de desejos.",
  fatias: "Fatia sem prova declarada é promessa.",
};

/** SPEC-115 fatia C aplicada à spec: o rótulo nomeia a FONTE, e cada seção tem
 * a sua — dizer "derivado" genérico esconderia de onde aquilo saiu. */
const ORIGEM_DERIVADA: Record<SecaoDeJulgamento, string> = {
  origem: "derivado do contexto e dos propósitos da demanda — edite ou complemente",
  decisoes: "derivado das decisões aceitas, pelo lado escolhido — edite ou complemente",
  recusas: "derivado das decisões aceitas, pelo lado descartado — edite ou complemente",
  fatias: "derivado dos itens do desenho — edite ou complemente",
};

const campoDaConversaEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

/**
 * SPEC-115 fatias E e G — **o acompanhamento do envio, sobre estado persistido.**
 *
 * ## O que ele mostra, e por que cada coisa entra
 *
 * A régua da SPEC-85 §2, reafirmada no §5 da SPEC-98: *movimento que não
 * carrega informação que o estático não carrega, não entra.* Cada linha aqui
 * responde a uma pergunta da tabela daquele §5:
 *
 * | O que aparece | A pergunta que responde |
 * |---|---|
 * | a contagem por etapa | *quanto falta* — números reais, não estimativa |
 * | o item que está indo, com nome | *em que item está* |
 * | o ✓ de quem chegou | *o que já chegou* — o parcial é resultado |
 * | o ⚠ com o motivo por item | *o que falhou, e qual* |
 *
 * ## Por que NÃO tem barra de progresso
 *
 * A SPEC-98 §6 recusa explicitamente *"barra de progresso que estima sem dizer
 * que estima"*. Aqui não haveria como estimar honestamente: o tempo de cada
 * item é do agente do outro lado, e desenhar uma barra avançando por conta
 * própria seria inventar informação. **Contagem real é honesta por construção**
 * — "2 de 5 chegaram" não precisa de fé.
 *
 * ## Por que ele aparece mesmo sem envio em curso
 *
 * Porque a pergunta *"quais specs ainda faltam?"* não vale só durante o envio.
 * Depois de um envio parcial, é a única tela que responde — e era exatamente
 * isso que se perdia quando o resultado morava num `useState`.
 *
 * O pulso do item em trânsito é CSS (`.spec-em-transito`), e por isso já cai na
 * guarda global de `prefers-reduced-motion` do §328: quem pede menos movimento
 * recebe a mesma informação parada.
 */
/**
 * Até quantos itens em trânsito aparecem nomeados de uma vez.
 *
 * Três, e o número tem razão: é quanto cabe sem a região virar uma parede de
 * linhas pulsando. Acima disso a informação é a mesma (*"estão indo"*) e o
 * ruído cresce linearmente — que é exatamente o *"enjoativa"* do §3.2.
 */
const ITENS_EM_TRANSITO_DETALHADOS = 3;

function PipelineDaSpec({ contagem, escritos }: { contagem: ContagemDoPipeline; escritos: ItemGerado[] }) {
  /**
   * SPEC-120 fatia F — **o fim é um evento, não a ausência de movimento.**
   *
   * *"Hoje a animação simplesmente para. Terminar precisa ser visível, ou quem
   * desviou o olhar não sabe se acabou ou travou."* (§3.2, ajuste 3)
   *
   * Só se pode dizer "terminou" de um envio que se viu começar — por isso o
   * estado, e não um teste sobre a contagem. Quem abre a tela com tudo já
   * anexado não recebe um aviso de conclusão de algo que não acompanhou.
   */
  const [viuEnvio, setViuEnvio] = useState(false);
  const [detalhar, setDetalhar] = useState(false);

  const indo = escritos.filter((i) => etapaDaSpec(i) === "anexando");
  const falhados = escritos.filter((i) => etapaDaSpec(i) === "falhou");

  useEffect(() => {
    if (contagem.anexando > 0) setViuEnvio(true);
  }, [contagem.anexando]);

  const terminou = viuEnvio && contagem.anexando === 0;

  // Nenhum item chegou ao tracker ainda: não há pipeline nenhum para relatar, e
  // uma caixa dizendo "0 de 0" é ruído que ensina a ignorar a região.
  //
  // O `return` vem DEPOIS dos hooks de propósito: cedo demais e o React muda o
  // número de hooks entre renders, que é erro em tempo de execução.
  const comHistoria = contagem.total - contagem.naFila;
  if (comHistoria === 0) return null;

  return (
    <section data-testid="pipeline-da-spec" style={{ marginTop: 12 }} aria-live="polite">
      <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "0 0 6px" }}>
        <strong style={{ color: "var(--texto-2)" }}>A spec de cada item</strong> — o envio continua do lado do servidor:
        sair desta tela ou recarregar não perde o acompanhamento.
      </p>
      <p data-testid="pipeline-contagem" style={{ fontSize: 12.5, color: "var(--texto-2)", margin: "0 0 8px" }}>
        <span style={{ color: "var(--verde)" }}>{contagem.anexada} com a spec anexada</span>
        {" · "}
        <span style={{ color: "var(--acento)" }}>{contagem.anexando} anexando</span>
        {" · "}
        <span style={{ color: "var(--amarelo)" }}>{contagem.noTracker} esperando</span>
        {contagem.falhou > 0 && (
          <>
            {" · "}
            <span style={{ color: "var(--vermelho)" }}>{contagem.falhou} sem a spec</span>
          </>
        )}
        {" — de "}
        {comHistoria} {comHistoria === 1 ? "item no tracker" : "itens no tracker"}
      </p>

      {/**
       * SPEC-120 fatia F — **agregar, detalhar sob demanda.**
       *
       * A régua da SPEC-85 §2 era *"movimento que não carrega informação que o
       * estático não carrega, não entra"*. O *"não muito enjoativa"* do usuário
       * acrescenta a segunda: **movimento que carrega informação também cansa,
       * se repetir demais** (§3.2).
       *
       * Com lotes isso deixou de ser teórico: um envio de trinta itens em seis
       * lotes tinha trinta linhas pulsando ao mesmo tempo. *"Trinta linhas
       * simultâneas são ruído com a mesma informação dentro."*
       *
       * O que fica: **a contagem, sempre**; os nomes, a um clique. E o pulso
       * some da lista e fica na contagem — o movimento marca ONDE está
       * acontecendo, e a lista inteira em movimento não marca nada (ajuste 1).
       *
       * Abaixo do limite, detalhar direto: três linhas nomeadas não cansam
       * ninguém, e esconder o nome de um item só seria trocar informação por
       * um clique.
       */}
      {indo.length > ITENS_EM_TRANSITO_DETALHADOS ? (
        <p data-testid="spec-em-transito-lote" style={{ fontSize: 12, margin: "0 0 4px" }}>
          <span className="spec-em-transito" style={{ color: "var(--acento)" }}>
            ⏳ {indo.length} specs indo agora
          </span>{" "}
          <button
            onClick={() => setDetalhar((d) => !d)}
            data-testid="detalhar-em-transito"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              color: "var(--texto-mudo)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {detalhar ? "esconder quais" : "ver quais"}
          </button>
        </p>
      ) : null}

      {/* "Em que ITEM está" — o §5 pede isso com nome, não um spinner genérico:
          dois itens em pontos diferentes ao mesmo tempo é o normal do §3.2. */}
      {(indo.length <= ITENS_EM_TRANSITO_DETALHADOS || detalhar) &&
        indo.map((item) => (
          <p
            key={item.chave}
            data-testid={`spec-em-transito-${item.chave}`}
            // O pulso só marca o item quando ele é POUCOS. Agregado, quem pulsa
            // é a contagem acima — uma lista inteira em movimento não aponta
            // para lugar nenhum.
            className={indo.length <= ITENS_EM_TRANSITO_DETALHADOS ? "spec-em-transito" : undefined}
            style={{ fontSize: 12, color: "var(--acento)", margin: "0 0 4px" }}
          >
            ⏳ <strong>{item.titulo}</strong> — a spec está indo agora
          </p>
        ))}

      {/* SPEC-120 fatia F, ajuste 3 — terminar é visível. */}
      {terminou && (
        <p data-testid="envio-terminou" style={{ fontSize: 12, color: "var(--verde)", margin: "0 0 4px" }}>
          ✓ O envio terminou — {contagem.anexada} {contagem.anexada === 1 ? "spec anexada" : "specs anexadas"}
          {contagem.falhou > 0 && `, ${contagem.falhou} sem a spec`}.
        </p>
      )}

      {/* "A falha diz QUAL" — o motivo é persistido, então ele continua aqui
          depois de um F5, que é quando a pessoa volta para entender. */}
      {falhados.map((item) => (
        <p
          key={item.chave}
          data-testid={`spec-falhou-${item.chave}`}
          style={{ fontSize: 12, color: "var(--vermelho)", margin: "0 0 4px" }}
        >
          ⚠ <strong>{item.titulo}</strong> — {item.specErro}
        </p>
      ))}
    </section>
  );
}

/** A régua de completude do card — quantos ✍️ restam e quantas sugestões da
 * esteira esperam confirmação (SPEC-41 Parte B). */
function completudeDoItem(item: ItemGerado): { rotulo: string; cor: string; fundo: string } {
  if (item.estado === "exportado")
    return { rotulo: "Exportado", cor: "var(--verde)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0 && item.sugestoes === 0)
    return { rotulo: "Pronto pra exportar", cor: "var(--verde)", fundo: "rgba(74, 222, 128, 0.12)" };
  if (item.pendencias === 0)
    return {
      rotulo: `${item.sugestoes} ${item.sugestoes === 1 ? "sugestão" : "sugestões"} a confirmar`,
      cor: "var(--amarelo)",
      fundo: "rgba(250, 204, 21, 0.12)",
    };
  return {
    rotulo: `✍️ ${item.pendencias} campo${item.pendencias === 1 ? "" : "s"} a especificar`,
    cor: "var(--laranja)",
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
            {/* SPEC-114 — a segunda chamada já aconteceu PARA ESTE item. Só
                aparece depois de exportado: sem link não há onde a spec ter ido.
                SPEC-115 fatia G — e agora o chip mostra as OUTRAS etapas
                também. "Anexada" sozinha somava dois estados num rótulo só (o
                defeito do §276): o item indo e o item parado esperando eram
                ambos "sem chip", e são coisas diferentes. */}
            {escrito?.linkExterno && (
              <span
                data-testid={`item-spec-anexada-${indice}`}
                className={etapaDaSpec(escrito) === "anexando" ? "spec-em-transito" : undefined}
                title={ROTULO_DA_ETAPA[etapaDaSpec(escrito)].texto}
                style={{
                  ...chipDoItemEstilo,
                  color: ROTULO_DA_ETAPA[etapaDaSpec(escrito)].cor,
                  borderColor: "transparent",
                  background: "var(--painel)",
                }}
              >
                {ROTULO_DA_ETAPA[etapaDaSpec(escrito)].icone} {ROTULO_DO_CHIP_DA_SPEC[etapaDaSpec(escrito)]}
              </span>
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
  background: "var(--fundo)",
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
  const cor = status === "aprovado" || status === "implementado" ? "var(--verde)" : "var(--acento-gente-texto)";
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
  color: "var(--acento-gente-texto)",
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
  background: "var(--verde)",
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

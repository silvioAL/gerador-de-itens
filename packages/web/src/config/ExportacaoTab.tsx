import { useEffect, useState } from "react";
import {
  CARACTERES_POR_LOTE_PADRAO,
  envelopeDoCorpo,
  ITENS_POR_LOTE_PADRAO,
  METODOS_DO_GATEWAY,
  OPERACOES_DO_GATEWAY,
  reconhecerGateway,
  type DestinoDoGateway,
  type OperacaoDoGateway,
} from "@gerador/aplicacao";
import { apiExportador, type ConfigExportador, type ResultadoDoTesteDeGateway } from "../api/client";
import { MarcaDeDemonstracao } from "../demo/dadosDoTour";
import { ImportarCurl } from "./ImportarCurl";

/**
 * SPEC-49 — para onde os itens escritos vão.
 *
 * O gerador não implementa Jira: implementar um tracker seria escolher o
 * tracker de todo mundo. Aqui se configura o ENDEREÇO de um agente (bridge
 * de MCP, n8n, função interna) que sabe criar issue no tracker da casa — a
 * mesma disciplina do gateway de IA, que também é só um endereço.
 */
export interface ExportacaoTabProps {
  /** §235 — dado EXCLUSIVO do tour: substitui o fetch e desliga o salvar. Uma
   * instalação nova tem esta tela vazia, e um passo que promete conteúdo sobre
   * tela vazia é a mentira que o §234 custou caro. Semear via API seria pior:
   * o tour passaria a ESCREVER na configuração de quem só quis ver. */
  demonstracao?: ConfigExportador;
}

export function ExportacaoTab({ demonstracao }: ExportacaoTabProps = {}) {
  const [config, setConfig] = useState<ConfigExportador | null>(demonstracao ?? null);
  const [cabecalhosTexto, setCabecalhosTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  // SPEC-118 fatia F — o par natural do importador: colou, conferiu, testou.
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<ResultadoDoTesteDeGateway | null>(null);

  // §281 — a resposta que chega depois da tela sair não escreve nada (ver
  // `useMontado`).
  useEffect(() => {
    // Em demonstração não se busca nem se grava nada.
    if (demonstracao) return;
    let cancelado = false;
    apiExportador
      .obter()
      .then((c) => {
        if (cancelado) return;
        setConfig(c);
        setCabecalhosTexto(
          Object.entries(c.cabecalhos ?? {})
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        );
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, [demonstracao]);

  if (erro && !config) return <p style={{ fontSize: 12.5, color: "var(--vermelho)" }}>{erro}</p>;
  if (!config) return <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>;

  /** "Chave: valor" por linha — mesmo formato de cabeçalho que quem cuida de
   * integração já lê em qualquer cliente HTTP. */
  function cabecalhosDoTexto(): Record<string, string> {
    const pares: Record<string, string> = {};
    for (const linha of cabecalhosTexto.split("\n")) {
      const i = linha.indexOf(":");
      if (i <= 0) continue;
      const chave = linha.slice(0, i).trim();
      const valor = linha.slice(i + 1).trim();
      if (chave && valor) pares[chave] = valor;
    }
    return pares;
  }

  async function salvar() {
    // Demonstração NÃO escreve. Sem esta linha o tour gravaria o endpoint de
    // exemplo na configuração real de quem só quis ver a ferramenta.
    if (demonstracao) return;
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      await apiExportador.salvar({ ...config!, cabecalhos: cabecalhosDoTexto() });
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * SPEC-118 fatia F, pergunta 3 — **testa o GATEWAY, não a operação.**
   *
   * *"Com um gateway só, o teste é um só."* Não se testa cada endpoint —
   * testa-se o gateway, e os endpoints são caminhos dentro dele. Por isso o
   * alvo é o endereço de topo e os cabeçalhos compartilhados.
   *
   * Em demonstração não chama: o destino que não chama ninguém não tem o que
   * testar, e um "conexão ok" ali seria a mentira perfeita.
   */
  async function testar() {
    if (demonstracao) return;
    setTestando(true);
    setTeste(null);
    try {
      setTeste(await apiExportador.testar({ endpoint: config!.endpoint, cabecalhos: cabecalhosDoTexto() }));
    } catch (e) {
      setTeste({
        ok: false,
        duracaoMs: 0,
        oQueMandei: `POST ${config!.endpoint}`,
        erro: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTestando(false);
    }
  }

  return (
    <div data-testid="config-exportacao">
      {demonstracao && <MarcaDeDemonstracao />}
      <p style={proseEstilo}>
        Os itens prontos da seção <strong>Os itens</strong> do documento são enviados para um <strong>agente</strong> que fala
        com o seu tracker (MCP, n8n, uma função interna — o que a empresa já tiver). O gerador não implementa Jira:
        implementar um tracker seria escolher o tracker de todo mundo.
      </p>
      <p style={{ ...proseEstilo, color: "var(--texto-fraco)" }}>
        O agente recebe <code style={codigoEstilo}>{"{ itens: [{ chave, titulo, tipo, tamanho, dependencias, corpoMarkdown }] }"}</code>{" "}
        e responde <code style={codigoEstilo}>{"{ resultados: [{ chave, linkExterno } | { chave, erro }] }"}</code>. Falha
        por item é esperada e some na tela como motivo — nunca tudo-ou-nada.
      </p>

      <label style={labelEstilo}>Endereço do agente</label>
      <input
        aria-label="Endereço do agente"
        value={config.endpoint}
        onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
        placeholder="https://agente.empresa/exportar-itens"
        style={inputEstilo}
      />
      <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
        Vazio desliga a exportação — a seção dos itens diz isso em vez de oferecer um botão que falharia.
      </p>

      <label style={labelEstilo}>Como chamar o destino (aparece na tela)</label>
      <input
        aria-label="Rótulo do destino"
        value={config.rotulo}
        onChange={(e) => setConfig({ ...config, rotulo: e.target.value })}
        placeholder="ex.: Jira do time de pagamentos"
        style={inputEstilo}
      />

      <label style={labelEstilo}>Cabeçalhos (um por linha, “Chave: valor”)</label>
      <textarea
        aria-label="Cabeçalhos"
        value={cabecalhosTexto}
        onChange={(e) => setCabecalhosTexto(e.target.value)}
        rows={3}
        placeholder={"Authorization: Bearer ..."}
        style={{ ...inputEstilo, resize: "vertical", fontFamily: "ui-monospace, monospace" }}
      />

      {/* SPEC-118 fatia F — descobrir o endereço errado AQUI, e não na
          primeira exportação com trinta itens na mão. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button
          onClick={() => void testar()}
          disabled={testando || !!demonstracao || !config.endpoint.trim()}
          data-testid="testar-gateway"
          style={{ ...botaoPrimarioEstilo, marginTop: 0, background: "transparent", color: "var(--texto)" }}
        >
          {testando ? "testando…" : "Testar conexão"}
        </button>
        <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
          Chama o gateway com um corpo vazio — não cria issue nenhum.
        </span>
      </div>

      {teste && (
        <div data-testid="resultado-do-teste" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, maxWidth: 560 }}>
          <p style={{ margin: 0, color: teste.ok ? "var(--verde)" : "var(--vermelho)" }}>
            {teste.ok
              ? `Alguém atendeu: HTTP ${teste.status} em ${(teste.duracaoMs / 1000).toFixed(1)}s.`
              : `Ninguém atendeu: ${teste.erro}`}
          </p>
          {/* A régua da pergunta 3: um "falhou" precisa ser diagnosticável, e
              para isso quem lê precisa saber o que foi mandado. */}
          <p style={{ margin: "2px 0 0", color: "var(--texto-mudo)", fontSize: 11 }}>{teste.oQueMandei}.</p>
          {teste.amostra ? (
            <pre style={{ ...codigoEstilo, display: "block", margin: "4px 0 0", padding: "6px 8px", whiteSpace: "pre-wrap" }}>
              {teste.amostra}
            </pre>
          ) : null}
        </div>
      )}

      <TamanhoDoLote
        lote={config.lote}
        onMudar={(lote) => setConfig({ ...config, lote })}
        somenteLeitura={!!demonstracao}
      />

      <Destinos
        destinos={config.destinos ?? []}
        onMudar={(destinos) => setConfig({ ...config, destinos })}
        somenteLeitura={!!demonstracao}
        // SPEC-118 §2.0 — é UM gateway, e os cabeçalhos de cima são a
        // autenticação dele. O importador compara contra eles para herdar em
        // vez de duplicar a chave por destino.
        gateway={{ endpoint: config.endpoint, cabecalhos: cabecalhosDoTexto() }}
      />

      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 8 }}>{erro}</p>}
      {salvo && !erro && <p style={{ fontSize: 12, color: "var(--verde)", marginTop: 8 }}>Destino salvo.</p>}

      <button onClick={() => void salvar()} disabled={salvando} style={botaoPrimarioEstilo} data-testid="salvar-exportacao">
        {salvando ? "salvando…" : "Salvar destino"}
      </button>
    </div>
  );
}

/**
 * SPEC-120 fatia A — **quantos itens vão por chamada.**
 *
 * > *"MCPs são lentos e tem limitações de tokens, pode ser necessário subir 5
 * > itens por vez"*
 *
 * ## Por que aqui em cima, e não dentro de cada destino
 *
 * É a pergunta 1 da SPEC-120, respondida pela correção do usuário na SPEC-118
 * §2.0: **é um gateway só**, com endpoints que variam. Um campo por destino que
 * ninguém preenche diferente é um campo a mais para errar.
 *
 * ## Por que os DOIS números aparecem
 *
 * Porque o de itens, sozinho, mente. O que estoura contexto é a spec, não a
 * contagem: cinco itens pequenos e cinco grandes diferem por uma ordem de
 * grandeza (§1.1). Mostrar só "5 por vez" faria a pessoa achar que está
 * protegida no caso exato em que ela não está.
 */
function TamanhoDoLote({
  lote,
  onMudar,
  somenteLeitura,
}: {
  lote: { itens?: number; caracteres?: number } | undefined;
  onMudar: (lote: { itens?: number; caracteres?: number } | undefined) => void;
  somenteLeitura: boolean;
}) {
  /**
   * Campo vazio devolve `undefined`, e não zero: apagar o número é *"use o
   * padrão"*, e gravar `0` pediria lotes de zero itens. A normalização do
   * servidor recusa o zero de qualquer jeito, mas a tela não pode oferecer um
   * valor que o servidor vai jogar fora em silêncio.
   */
  function mudar(campo: "itens" | "caracteres", texto: string) {
    const numero = Number.parseInt(texto, 10);
    const proximo = { ...lote, [campo]: Number.isFinite(numero) && numero >= 1 ? numero : undefined };
    onMudar(proximo.itens === undefined && proximo.caracteres === undefined ? undefined : proximo);
  }

  return (
    <section data-testid="tamanho-do-lote" style={{ marginTop: 22 }}>
      <strong style={{ fontSize: 13, color: "var(--texto)" }}>Quantos itens por chamada</strong>
      <p style={{ ...proseEstilo, marginTop: 6 }}>
        Um gateway de MCP é lento e tem limite de tokens. O envio é fatiado em chamadas menores —{" "}
        <strong>sempre por item, nunca no meio de um</strong> — e vale tanto para criar os issues quanto para anexar as
        specs. Vazio usa o padrão de fábrica: {ITENS_POR_LOTE_PADRAO} itens.
      </p>

      <label style={labelEstilo}>Itens por chamada</label>
      <input
        aria-label="Itens por chamada"
        type="number"
        min={1}
        value={lote?.itens ?? ""}
        onChange={(e) => mudar("itens", e.target.value)}
        placeholder={String(ITENS_POR_LOTE_PADRAO)}
        disabled={somenteLeitura}
        style={{ ...inputEstilo, maxWidth: 160 }}
      />

      <label style={labelEstilo}>…e no máximo, somando os itens (caracteres)</label>
      <input
        aria-label="Caracteres por chamada"
        type="number"
        min={1}
        value={lote?.caracteres ?? ""}
        onChange={(e) => mudar("caracteres", e.target.value)}
        placeholder={String(CARACTERES_POR_LOTE_PADRAO)}
        disabled={somenteLeitura}
        style={{ ...inputEstilo, maxWidth: 220 }}
      />
      <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "4px 0 0" }}>
        O lote fecha quando <strong>qualquer um dos dois</strong> estourar — cinco specs longas fecham antes dos cinco
        itens. Caracteres são uma aproximação grosseira de tokens, e grosseira serve: o objetivo é não chegar perto do
        limite.
      </p>
    </section>
  );
}

/**
 * SPEC-81 fatia A — **os outros destinos do gateway do time.**
 *
 * ## Por que uma lista, e não três campos fixos
 *
 * São N endereços, não um gateway com N operações: um na frente do MCP do Jira,
 * outro do Confluence, outro dos agentes da casa. E a organização pode ter dois
 * do mesmo tipo — dois trackers numa migração, dois espaços de documentação por
 * unidade de negócio. Três campos fixos capariam isso.
 *
 * ## Por que o endereço de cima continua separado
 *
 * Ele é o destino de itens de quem configurou antes desta SPEC, e continua
 * valendo sem ninguém reconfigurar nada. Puxá-lo para dentro da lista obrigaria
 * uma migração de dado para não ganhar coisa nenhuma.
 */
function Destinos({
  destinos,
  onMudar,
  somenteLeitura,
  gateway,
}: {
  destinos: DestinoDoGateway[];
  onMudar: (destinos: DestinoDoGateway[]) => void;
  somenteLeitura: boolean;
  /** SPEC-118 §2.0 — o gateway de topo, para reconhecer o mesmo endereço. */
  gateway?: { endpoint?: string; cabecalhos?: Record<string, string> };
}) {
  /**
   * Quais destinos HERDARAM os cabeçalhos do gateway na última importação.
   *
   * A régua da §2.0 em voz alta: *"uma herança silenciosa é tão ruim quanto uma
   * duplicação silenciosa"*. Sem esta linha, a pessoa cola um curl com
   * `Authorization` dentro e vê o campo de cabeçalhos vazio — e não tem como
   * saber se a autenticação foi herdada ou simplesmente perdida.
   */
  const [herdouDoGateway, setHerdouDoGateway] = useState<Record<number, boolean>>({});
  function mudar(i: number, campo: keyof DestinoDoGateway, valor: string) {
    onMudar(destinos.map((d, j) => (i === j ? { ...d, [campo]: valor } : d)));
  }

  /** SPEC-115 fatia D — a flag é booleana e tem regra própria: separada do
   * `mudar` de texto porque um `[campo]: valor` genérico gravaria a string
   * `"true"` e a normalização (que lê `=== true`) a descartaria em silêncio. */
  function alternarDemonstracao(i: number, ligado: boolean) {
    onMudar(destinos.map((d, j) => (i === j ? { ...d, demonstracao: ligado } : d)));
  }

  /**
   * SPEC-118 fatias C e D — o curl vira os campos deste destino.
   *
   * ## O que ele NÃO toca, e a lista é a §2.2
   *
   * `operacao` — nenhum curl diz *"isto cria issue"* versus *"isto anexa spec
   * num issue que já existe"*. Adivinhar errado mandaria a spec para a rota de
   * criação, e **o erro pareceria certo**. `rotulo` e `espaco` idem: um é como
   * a pessoa chama aquilo na tela dela, o outro é uma etiqueta que o produto
   * não sabe ler de propósito.
   *
   * ## E os cabeçalhos passam pelo reconhecimento do gateway (§2.0)
   *
   * Escrever o `Authorization` de cada curl no destino faria cada destino ter
   * a sua cópia da chave — e rotacioná-la viraria edição em N lugares. A chave
   * já saiu em `separarSegredo`; o que resta é comparado com os cabeçalhos
   * compartilhados, e o que for igual é herdado em vez de duplicado.
   */
  function importarCurlNoDestino(
    i: number,
    dados: { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: string }
  ) {
    const { cabecalhosParaGuardar, mesmoGateway } = reconhecerGateway(dados.url, dados.cabecalhos, gateway);
    const envelope = envelopeDoCorpo(dados.corpo);

    onMudar(
      destinos.map((d, j) =>
        i === j
          ? {
              ...d,
              endpoint: dados.url,
              metodo: (METODOS_DO_GATEWAY as readonly string[]).includes(dados.metodo)
                ? (dados.metodo as DestinoDoGateway["metodo"])
                : d.metodo,
              // Mesmo gateway = herda. Só o que DIFERE é guardado (§2.0).
              ...(mesmoGateway ? { cabecalhos: undefined } : { cabecalhos: cabecalhosParaGuardar }),
              // `undefined` é "não sei" (corpo não-JSON): o campo fica com o
              // valor que já tinha, em vez de um chute.
              ...(envelope !== undefined ? { envelope } : {}),
            }
          : d
      )
    );
    setHerdouDoGateway((atual) => ({ ...atual, [i]: mesmoGateway }));
  }

  return (
    <section data-testid="destinos-do-gateway" style={{ marginTop: 22 }}>
      <strong style={{ fontSize: 13, color: "var(--texto)" }}>Outros destinos</strong>
      <p style={{ ...proseEstilo, marginTop: 6 }}>
        O mesmo desenho serve para o resto: publicar o <strong>documento</strong> numa base de conhecimento, ler os{" "}
        <strong>ADRs</strong> e ler um <strong>documento por link</strong>. Cada um é um endereço, e podem
        ser gateways diferentes — um na frente do MCP do Jira, outro do Confluence, outro dos agentes.
      </p>
      <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "0 0 8px" }}>
        Sem cabeçalhos próprios, o destino usa os de cima. Operação sem endereço não aparece na tela que a usaria — a
        menos que o destino esteja em <strong>modo de demonstração</strong>, que existe justamente para quando o
        endereço ainda não existe.
      </p>

      {destinos.map((d, i) => (
        <div
          key={d.id || i}
          data-testid={`destino-${i}`}
          style={{ border: "1px solid var(--borda)", borderRadius: 8, padding: 10, marginBottom: 8, maxWidth: 560 }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelEstilo, margin: "0 0 2px" }}>O que vai por aqui</label>
              <select
                aria-label={`Operação do destino ${i + 1}`}
                value={d.operacao}
                onChange={(e) => mudar(i, "operacao", e.target.value)}
                disabled={somenteLeitura}
                style={{ ...inputEstilo, maxWidth: "none" }}
              >
                {/* SPEC-118 fatia D — agrupadas por DIREÇÃO. A lista corrida
                    punha "ler ADRs" e "publicar documento" como vizinhos
                    indistinguíveis (§1.2). */}
                {(["exportar", "importar"] as const).map((direcao) => (
                  <optgroup key={direcao} label={ROTULO_DA_DIRECAO[direcao]}>
                    {OPERACOES_DO_GATEWAY.filter((op) => DIRECAO_DA_OPERACAO[op] === direcao).map((op) => (
                      <option key={op} value={op}>
                        {ROTULO_DA_OPERACAO[op]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <button
              onClick={() => onMudar(destinos.filter((_, j) => j !== i))}
              disabled={somenteLeitura}
              aria-label={`Remover destino ${i + 1}`}
              style={{ ...botaoPrimarioEstilo, marginTop: 0, background: "transparent", color: "var(--texto-2)", border: "1px solid var(--borda)" }}
            >
              remover
            </button>
          </div>

          {/* SPEC-120 fatia D — o contrato desta operação, dito onde ela é
              escolhida. Quem escreve o agente do outro lado precisa saber o
              que recebe antes de a primeira chamada falhar em produção. */}
          <p data-testid={`contrato-${i}`} style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "6px 0 0", lineHeight: 1.6 }}>
            Recebe <code style={codigoEstilo}>{CONTRATO_DA_OPERACAO[d.operacao].recebe}</code> e responde{" "}
            <code style={codigoEstilo}>{CONTRATO_DA_OPERACAO[d.operacao].responde}</code>.
            {CONTRATO_DA_OPERACAO[d.operacao].nota && <> {CONTRATO_DA_OPERACAO[d.operacao].nota}</>}
          </p>

          {/**
           * SPEC-115 fatia D — **o modo de demonstração, marcado como o que é.**
           *
           * Pedido do usuário: *"não tenho o endpoint de subidas dos itens
           * acessível ainda aqui, mas precisamos de tela e experiências
           * prontos, usar algum mock com delay de 20 segundos"*.
           *
           * Fica ANTES do endereço, e não depois, porque muda o que o endereço
           * significa: com a caixa marcada, não há endereço nenhum para
           * preencher. É a mesma ordem que o "modo sem custo" (SPEC-74) usa nos
           * avisos do destino de IA — o que muda a decisão vem antes do campo,
           * não como nota de rodapé.
           */}
          <label
            style={{ ...labelEstilo, display: "flex", alignItems: "center", gap: 8, cursor: somenteLeitura ? "default" : "pointer" }}
          >
            <input
              type="checkbox"
              aria-label={`Modo de demonstração do destino ${i + 1}`}
              checked={d.demonstracao === true}
              onChange={(e) => alternarDemonstracao(i, e.target.checked)}
              disabled={somenteLeitura}
            />
            <span style={{ color: d.demonstracao ? "var(--amarelo)" : undefined }}>
              ✦ Modo de demonstração — este destino não chama ninguém
            </span>
          </label>
          {d.demonstracao && (
            <p
              data-testid={`destino-demonstracao-${i}`}
              style={{ fontSize: 11, color: "var(--amarelo)", margin: "2px 0 0", lineHeight: 1.5, maxWidth: 560 }}
            >
              Espera ~20 segundos por item e devolve sucesso, sem mandar nada para lugar nenhum. Serve para ver a tela e
              a experiência prontas antes de o endereço real existir — e tudo o que sair daqui chega marcado como
              demonstração, como o modo sem custo já faz com a IA. O link do tracker aponta para{" "}
              <code style={codigoEstilo}>demonstracao.invalid</code>, que nunca resolve: um link de mentira que abre
              alguma coisa seria pior.
            </p>
          )}

          {/**
           * SPEC-118 fatias C e D — **colar o curl preenche este destino.**
           *
           * Em demonstração não aparece: o destino que não chama ninguém é o
           * único que legitimamente não tem curl (§1.3).
           *
           * O que o curl NÃO preenche continua sendo escolha: `operacao`
           * (nenhum curl diz "isto cria issue" versus "isto anexa spec num que
           * já existe"), `rotulo` e `espaco`. **O cURL preenche o formulário;
           * ele não o substitui** — a mesma régua do `leitorDeAdr`: importar
           * não é aceitar.
           */}
          {!d.demonstracao && !somenteLeitura && (
            <ImportarCurl
              testid={`importar-curl-${i}`}
              oQuePreenche="o endereço, o verbo, os cabeçalhos e o envelope deste destino"
              onImportar={(dados) => importarCurlNoDestino(i, dados)}
            />
          )}

          {herdouDoGateway[i] && (
            <p
              data-testid={`herdou-do-gateway-${i}`}
              style={{ fontSize: 11.5, color: "var(--verde)", margin: "6px 0 0", lineHeight: 1.5, maxWidth: 560 }}
            >
              É o mesmo gateway de cima — guardei só o endereço. A autenticação continua num lugar só, e rotacionar a
              chave continua sendo uma edição.
            </p>
          )}

          <label style={labelEstilo}>Endereço{d.demonstracao ? " (ignorado em demonstração)" : ""}</label>
          <input
            aria-label={`Endereço do destino ${i + 1}`}
            value={d.endpoint}
            onChange={(e) => mudar(i, "endpoint", e.target.value)}
            disabled={somenteLeitura || d.demonstracao === true}
            placeholder={d.demonstracao ? "—" : "https://gateway.empresa/confluence"}
            style={{ ...inputEstilo, opacity: d.demonstracao ? 0.5 : 1 }}
          />

          <label style={labelEstilo}>Como chamar (aparece na tela)</label>
          <input
            aria-label={`Rótulo do destino ${i + 1}`}
            value={d.rotulo}
            onChange={(e) => mudar(i, "rotulo", e.target.value)}
            disabled={somenteLeitura}
            placeholder="ex.: Confluence de Engenharia"
            style={inputEstilo}
          />

          {/**
           * §348 — **onde escrever, do outro lado.**
           *
           * Pedido do usuário: *"configurar o link de um espaço do time no
           * confluence e ele postar o design doc lá"*.
           *
           * Só aparece nas operações que ESCREVEM. Um leitor de ADR não publica
           * nada, e oferecer o campo ali seria pedir uma informação que não vai
           * a lugar nenhum — o tipo de campo que faz a pessoa duvidar se
           * entendeu a tela.
           *
           * O produto não valida o formato porque não sabe o que é um espaço:
           * uma chave (`ENG`), uma URL inteira ou um id numérico são todos
           * válidos, e quem decide é o gateway. Saber seria implementar o
           * Confluence de todo mundo — o que a SPEC-49 recusou para o Jira.
           */}
          {(d.operacao === "documento" || d.operacao === "itens") && (
            <>
              <label style={labelEstilo}>Onde escrever (opcional)</label>
              <input
                aria-label={`Espaço do destino ${i + 1}`}
                value={d.espaco ?? ""}
                onChange={(e) => mudar(i, "espaco", e.target.value)}
                disabled={somenteLeitura}
                placeholder="ex.: ENG — o espaço, projeto ou pasta do outro lado"
                style={inputEstilo}
              />
              <p style={{ fontSize: 11, color: "var(--texto-fraco)", margin: "2px 0 0" }}>
                Vai junto no pedido. Em branco, o gateway usa o padrão dele.
              </p>
            </>
          )}
        </div>
      ))}

      <button
        onClick={() =>
          onMudar([
            ...destinos,
            // O id é estável e é por ele que a tela lembra qual destino foi
            // escolhido quando há mais de um da mesma operação. Nasce do
            // tamanho da lista mais o instante, porque duas adições no mesmo
            // render colidiriam só com o tamanho.
            { id: `destino-${destinos.length}-${Date.now()}`, operacao: "documento", endpoint: "", rotulo: "" },
          ])
        }
        disabled={somenteLeitura}
        data-testid="adicionar-destino"
        style={{ ...botaoPrimarioEstilo, marginTop: 0, background: "transparent", color: "var(--texto)", border: "1px solid var(--borda-forte)" }}
      >
        + destino
      </button>
    </section>
  );
}

/**
 * SPEC-118 §1.2 — **a direção do fluxo, que não aparecia em lugar nenhum.**
 *
 * As cinco operações moravam na MESMA lista chamada "Outros destinos", num
 * `<select>` onde "ler ADRs" e "publicar documento" eram vizinhos
 * indistinguíveis. *"A direção do fluxo — a coisa que a pessoa usa para se
 * orientar — não aparece em lugar nenhum da tela."*
 *
 * O que o usuário chamou de "importação" não existia como conceito no produto,
 * e existia como comportamento em duas das cinco operações.
 */
const DIRECAO_DA_OPERACAO: Record<OperacaoDoGateway, "importar" | "exportar"> = {
  itens: "exportar",
  documento: "exportar",
  specDoItem: "exportar",
  adr: "importar",
  documentoExterno: "importar",
};

/**
 * **Correção do usuário, e ela é sobre o PARA QUÊ de cada direção:**
 *
 * > *"importar é como contexto para ajudar a desenhar mais rápido, importar
 * > para a mesa, e passa pelo assistente; exportar é os itens prontos e suas
 * > specs"*
 *
 * As duas direções não são simétricas, e dizer só "entra" e "sai" escondia
 * isso. **Importar é matéria-prima**: ADR e documento da casa chegam para
 * acelerar o desenho, aterrissam na MESA, e passam pelo assistente — nada é
 * escrito direto no desenho de ninguém. É a régua do `leitorDeAdr` dita na
 * tela: *importar não é aceitar*.
 *
 * **Exportar é resultado**: o que já ficou pronto e foi revisado por gente.
 */
const ROTULO_DA_DIRECAO: Record<"importar" | "exportar", string> = {
  importar: "⬇ Importar — contexto que acelera o desenho, e chega à mesa pelo assistente",
  exportar: "⬆ Exportar — o que ficou pronto: os itens, as specs deles e o documento",
};

const ROTULO_DA_OPERACAO: Record<OperacaoDoGateway, string> = {
  itens: "Itens → issue tracker",
  documento: "Documento de desenho → base de conhecimento",
  /** §349 — a leitura por LINK. O rótulo diz "documento da casa" e não
   *  "Confluence": o produto é agnóstico de ferramenta (SPEC-100). */
  documentoExterno: "Documento externo → ler por link",
  adr: "ADRs → ler",
  /** SPEC-114 — a segunda chamada: escreve na issue que a exportação criou. */
  specDoItem: "Spec do item → anexar ao issue já exportado",
};

/**
 * SPEC-120 fatia D — **o contrato de cada operação, declarado.**
 *
 * O de `itens` já estava na tela desde a SPEC-49, no parágrafo de cima. Os
 * outros quatro nunca estiveram — e o de `specDoItem` era o que mais fazia
 * falta, porque é o único cujo conteúdo é um **formato**: markdown.
 *
 * ## O que a linha do markdown resolve, e por que ela é do produto
 *
 * > *"os anexos precisam subir em formato que um MCP consiga anexar, markdown
 * > é o melhor possível, mas precisamos certificar que funciona"*
 *
 * A decisão (§2.2) é a régua da SPEC-49 por analogia: **o produto manda
 * markdown, o gateway converte.** Implementar o dialeto de um tracker seria
 * escolher o tracker de todo mundo. O que faltava não era a decisão — era
 * **declará-la**, para quem escreve o agente do outro lado saber o que recebe:
 * UTF-8, com blocos de código, e quem decide se vira comentário, descrição ou
 * arquivo é o gateway.
 *
 * O que esta linha NÃO faz é provar que funciona. Isso é a fatia E, e ela não é
 * teste automatizado: é rodar contra o MCP real e olhar o issue.
 */
const CONTRATO_DA_OPERACAO: Record<OperacaoDoGateway, { recebe: string; responde: string; nota?: string }> = {
  itens: {
    recebe: "{ itens: [{ chave, titulo, tipo, tamanho, dependencias, corpoMarkdown }] }",
    responde: "{ resultados: [{ chave, linkExterno } | { chave, erro }] }",
  },
  documento: {
    recebe: "{ demandaId, demandaTitulo, markdown, geradoEm, desatualizado }",
    responde: "{ link }",
  },
  documentoExterno: { recebe: "{ link }", responde: "{ titulo, markdown }" },
  adr: { recebe: "{}", responde: "{ adrs: [{ id, titulo, contexto?, escolhida?, porque? }] }" },
  specDoItem: {
    recebe: "{ itens: [{ chaveExterna, conteudo }] }",
    responde: "{ resultados: [{ chaveExterna, erro? }] }",
    nota:
      "`conteudo` é a spec daquele item em markdown, UTF-8, com blocos de código. O produto não converte para o dialeto de nenhum tracker — quem converte, e quem decide se ela vira comentário, descrição ou arquivo anexo, é o agente do outro lado.",
  },
};

const proseEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  maxWidth: 760,
  margin: "0 0 10px",
};

const codigoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  padding: "1px 5px",
  borderRadius: 4,
  background: "var(--painel-alto)",
  fontFamily: "ui-monospace, monospace",
};

const labelEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--texto-fraco)",
  margin: "12px 0 2px",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  boxSizing: "border-box",
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
  marginTop: 12,
};

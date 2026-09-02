import { useEffect, useState } from "react";
import { OPERACOES_DO_GATEWAY, type DestinoDoGateway, type OperacaoDoGateway } from "@gerador/aplicacao";
import { apiExportador, type ConfigExportador } from "../api/client";
import { MarcaDeDemonstracao } from "../demo/dadosDoTour";

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

      <Destinos
        destinos={config.destinos ?? []}
        onMudar={(destinos) => setConfig({ ...config, destinos })}
        somenteLeitura={!!demonstracao}
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
}: {
  destinos: DestinoDoGateway[];
  onMudar: (destinos: DestinoDoGateway[]) => void;
  somenteLeitura: boolean;
}) {
  function mudar(i: number, campo: keyof DestinoDoGateway, valor: string) {
    onMudar(destinos.map((d, j) => (i === j ? { ...d, [campo]: valor } : d)));
  }

  return (
    <section data-testid="destinos-do-gateway" style={{ marginTop: 22 }}>
      <strong style={{ fontSize: 13, color: "var(--texto)" }}>Outros destinos</strong>
      <p style={{ ...proseEstilo, marginTop: 6 }}>
        O mesmo desenho serve para o resto: publicar o <strong>documento</strong> numa base de conhecimento, ler os{" "}
        <strong>ADRs</strong> da casa e trazer a <strong>arquitetura de negócio</strong>. Cada um é um endereço, e podem
        ser gateways diferentes — um na frente do MCP do Jira, outro do Confluence, outro dos agentes.
      </p>
      <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "0 0 8px" }}>
        Sem cabeçalhos próprios, o destino usa os de cima. Operação sem endereço não aparece na tela que a usaria.
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
                {OPERACOES_DO_GATEWAY.map((op) => (
                  <option key={op} value={op}>
                    {ROTULO_DA_OPERACAO[op]}
                  </option>
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

          <label style={labelEstilo}>Endereço</label>
          <input
            aria-label={`Endereço do destino ${i + 1}`}
            value={d.endpoint}
            onChange={(e) => mudar(i, "endpoint", e.target.value)}
            disabled={somenteLeitura}
            placeholder="https://gateway.empresa/confluence"
            style={inputEstilo}
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

const ROTULO_DA_OPERACAO: Record<OperacaoDoGateway, string> = {
  itens: "Itens → issue tracker",
  documento: "Documento de desenho → base de conhecimento",
  adr: "ADRs da casa → ler",
  arquiteturaDeNegocio: "Arquitetura de negócio → ler",
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

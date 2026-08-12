import { useEffect, useRef, useState } from "react";
import {
  apiConfigIa,
  apiIa,
  type PresetGateway,
  type ResumoGateway,
  type StatusIa,
  type StatusModeloChat,
} from "../api/client";

function formatarGB(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * SPEC-25 Fases 0/1 — a tela de escolha do modelo. Hoje só provedores locais
 * (o gateway da empresa e o Claude entram na Fase 2, como cards novos aqui
 * mesmo). Um card por modelo com estado real do disco; o radio grava em
 * `config/ia.json`, e o servidor troca o modelo carregado no próximo pedido.
 */
export function ModeloIaTab() {
  const [status, setStatus] = useState<StatusIa | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    apiIa
      .status()
      .then((s) => {
        if (!cancelado) setStatus(s);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function selecionar(id: string) {
    setSalvando(id);
    setErro(null);
    try {
      await apiConfigIa.salvar({ provedorPadrao: id });
      setStatus(await apiIa.status());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  }

  const modelos = status?.modelosChat ?? [];

  return (
    <div>
      <p style={introTextoEstilo}>
        Qual modelo a esteira de agentes usa. Nos modelos locais tudo roda na sua máquina e nenhum dado sai daqui;
        num gateway, o que for gerado passa pelo endereço que você configurar — se ele for interno da empresa, os
        dados continuam dentro dela. A troca vale a partir da próxima geração.
      </p>

      {status === null && !erro && <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680 }}>
        {modelos.map((m) =>
          m.remoto ? (
            <CardGateway
              key={m.id}
              modelo={m}
              gateway={status?.gateway}
              presets={status?.presetsGateway ?? []}
              salvando={salvando !== null}
              onSelecionar={() => void selecionar(m.id)}
              onSalvo={async () => setStatus(await apiIa.status())}
            />
          ) : (
          <label
            key={m.id}
            data-testid={`modelo-ia-${m.id}`}
            style={{ ...cardEstilo, ...(m.selecionado ? cardSelecionadoEstilo : {}) }}
          >
            <input
              type="radio"
              name="modelo-ia"
              checked={m.selecionado}
              disabled={!m.instalado || salvando !== null}
              onChange={() => void selecionar(m.id)}
              style={{ marginTop: 3 }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13, color: "var(--texto)", display: "block" }}>
                {m.nome}
                {m.raciocinador && <span style={selo}>raciocinador</span>}
              </strong>
              <span style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6, display: "block" }}>
                {m.papel}
              </span>
              <span style={{ fontSize: 11.5, color: m.instalado ? "var(--verde)" : "var(--texto-mudo)" }}>
                {m.instalado
                  ? `instalado (~${formatarGB(m.tamanhoAproximadoBytes)})`
                  : `não baixado — rode \`gerador ia instalar --modelo ${m.id}\` (~${formatarGB(m.tamanhoAproximadoBytes)})`}
              </span>
            </span>
          </label>
          )
        )}
      </div>

      {status && !status.embeddingInstalado && !status.modelosChat?.some((m) => m.remoto && m.selecionado) && (
        <p style={{ ...avisoEstilo, marginTop: 12 }}>
          O modelo de embedding não está instalado — a IA só fica pronta com ele. Rode `gerador ia instalar`.
        </p>
      )}
      {erro && <p style={{ ...avisoEstilo, color: "var(--vermelho)" }}>{erro}</p>}
      {status?.caminhoModelos && (
        <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", marginTop: 12 }}>
          Modelos em <code>{status.caminhoModelos}</code>
        </p>
      )}
    </div>
  );
}

/**
 * SPEC-25 Fase 2 — o card do gateway. Três campos e nada mais: base URL,
 * chave, nome do modelo (§4.6). Um card em vez de um `<label>` como os locais
 * porque aqui tem input de texto dentro: clicar num campo dentro de um label
 * ativaria o radio junto.
 *
 * Nasce DORMENTE e testado: no dia em que o token corporativo sair, validar é
 * colar os três campos e clicar em "Testar conexão".
 */
function CardGateway({
  modelo,
  gateway,
  presets,
  salvando,
  onSelecionar,
  onSalvo,
}: {
  modelo: StatusModeloChat;
  gateway?: ResumoGateway;
  /** Destinos conhecidos vindos do servidor (`/ia/status`). */
  presets: PresetGateway[];
  salvando: boolean;
  onSelecionar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(gateway?.baseUrl ?? "");
  const [chave, setChave] = useState("");
  const [nomeModelo, setNomeModelo] = useState(gateway?.modelo ?? "");
  // SPEC-30 Fase 2 — marcação manual: nenhum preset conhece o modelo que a
  // empresa batizou, e sem isto gateway interno nunca teria visão.
  const [visaoManual, setVisaoManual] = useState(gateway?.visao === true);
  const [ocupado, setOcupado] = useState<"salvar" | "testar" | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  // Reconhece o destino pela base URL já salva, pra quem volta na tela não ver
  // "outro (preencher à mão)" numa credencial que veio de um preset.
  const [presetId, setPresetId] = useState(
    () => presets.find((p) => p.baseUrl === gateway?.baseUrl)?.id ?? ""
  );
  const preset = presets.find((p) => p.id === presetId);

  function aplicarPreset(id: string) {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setBaseUrl(p.baseUrl);
    // Troca o modelo quando o valor atual veio de um preset (inclusive o
    // anterior) ou está vazio; preserva o que foi digitado à mão, que é o caso
    // do gateway interno com nome próprio. Sem isso, trocar de destino deixaria
    // "claude-sonnet-5" apontando pro DeepSeek — erro que só apareceria na
    // primeira chamada.
    const deAlgumPreset = (v: string) => presets.some((x) => x.modelos.includes(v));
    setNomeModelo((atual) => (!atual.trim() || deAlgumPreset(atual.trim()) ? p.modeloPadrao : atual));
  }

  // A credencial só chega depois do primeiro `/ia/status`; sem isto os campos
  // ficariam vazios mesmo com gateway já configurado.
  //
  // Mas só sobrescreve o campo que ainda está como o servidor mandou. Sem essa
  // guarda, qualquer `/ia/status` que chegasse enquanto alguém digita (o pai
  // refaz a busca depois de salvar, e o card monta em duas passadas) apagava o
  // texto no meio da digitação. Foi assim que este teste ficou intermitente na
  // CI — vermelho num run, verde no outro, mesmo commit; o teste estava certo, a
  // corrida era de verdade.
  const doServidor = useRef({ baseUrl: gateway?.baseUrl ?? "", modelo: gateway?.modelo ?? "" });
  useEffect(() => {
    const vindo = { baseUrl: gateway?.baseUrl ?? "", modelo: gateway?.modelo ?? "" };
    setBaseUrl((atual) => (atual === doServidor.current.baseUrl ? vindo.baseUrl : atual));
    setNomeModelo((atual) => (atual === doServidor.current.modelo ? vindo.modelo : atual));
    doServidor.current = vindo;
  }, [gateway?.baseUrl, gateway?.modelo]);

  const dados = {
    baseUrl: baseUrl.trim(),
    chave: chave.trim(),
    modelo: nomeModelo.trim(),
    // SPEC-30: onde fica a TRANSCRIÇÃO, quando não é o mesmo endereço do chat.
    // Vem do destino escolhido — o Ollama não transcreve, e a voz vai pro
    // serviço `whisper` do mesmo compose. Destino que faz as duas coisas
    // (OpenAI, Groq) não declara nada e o `baseUrl` serve pros dois.
    baseUrlTranscricao: preset?.baseUrlTranscricao,
    visao: visaoManual,
  };
  // A chave pode vir vazia quando já existe uma salva: o campo mostra a
  // máscara, então exigir redigitá-la pra mudar só a base URL seria hostil.
  const completo = !!dados.baseUrl && !!dados.modelo && (!!dados.chave || !!gateway?.configurado);

  async function executar(acao: "salvar" | "testar") {
    setOcupado(acao);
    setResultado(null);
    try {
      if (acao === "salvar") {
        await apiIa.salvarCredencial(dados);
        setChave("");
        await onSalvo();
        setResultado({ ok: true, texto: "Credencial salva em ~/.gerador (fora do repositório)." });
      } else {
        const r = await apiIa.testarCredencial(dados);
        setResultado(
          r.ok
            ? { ok: true, texto: `Respondeu em ${((r.duracaoMs ?? 0) / 1000).toFixed(1)}s: “${r.amostra}”` }
            : { ok: false, texto: r.erro ?? "falhou" }
        );
      }
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div
      data-testid={`modelo-ia-${modelo.id}`}
      style={{ ...cardEstilo, ...(modelo.selecionado ? cardSelecionadoEstilo : {}), cursor: "default" }}
    >
      <input
        type="radio"
        name="modelo-ia"
        checked={modelo.selecionado}
        disabled={!modelo.instalado || salvando}
        onChange={onSelecionar}
        aria-label={`Usar ${modelo.nome}`}
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 13, color: "var(--texto)", display: "block" }}>
          {modelo.nome}
          <span style={selo}>remoto</span>
        </strong>
        <span style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6, display: "block" }}>
          {modelo.papel}
        </span>

        {/* Um destino conhecido preenche base URL e modelo. Os campos seguem
            livres: gateway interno não está em lista nenhuma. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>Destino:</span>
          <select
            value={presetId}
            onChange={(e) => aplicarPreset(e.target.value)}
            aria-label="Destino conhecido"
            style={{ ...campoEstilo, flex: "none", width: 200 }}
          >
            <option value="">outro (preencher à mão)</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        {preset && (
          <p style={notaPresetEstilo} data-testid={`preset-nota-${preset.id}`}>
            {preset.observacao}
            {preset.urlChave && (
              <>
                {" "}
                <a href={preset.urlChave} target="_blank" rel="noreferrer" style={{ color: "var(--acento)" }}>
                  pegar a chave
                </a>
                .
              </>
            )}
            {/* Honestidade sobre a garantia: onde `response_format` é ignorado,
                a estrutura vem de validação + retry, e pode falhar mais. */}
            {!preset.jsonNativo && (
              <>
                {" "}
                Este destino <strong>ignora o modo JSON</strong>: a estrutura é garantida por validação contra o
                schema e uma nova tentativa, não pelo próprio modelo.
              </>
            )}
          </p>
        )}

        {/* ACHADO (apontado pelo usuário): a tela oferecia voz e imagem sem
            dizer o que cada destino realmente faz — e a pessoa só descobria na
            falha. Estes avisos são por DESTINO, e ficam antes dos campos: são
            o que muda a decisão de configuração, não uma nota de rodapé. */}
        <AvisosDoDestino baseUrl={baseUrl} visaoMarcada={visaoManual} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://gateway-interno.empresa/v1"
            aria-label="Base URL do gateway"
            style={campoEstilo}
          />
          <input
            type="password"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={gateway?.chaveMascarada ? `chave atual: ${gateway.chaveMascarada}` : "chave de API"}
            aria-label="Chave de API"
            style={campoEstilo}
          />
          {/* `datalist` em vez de `select`: as sugestões do destino aparecem,
              mas o campo continua livre — gateway interno tem nome próprio que
              lista nenhuma conhece. */}
          <input
            value={nomeModelo}
            onChange={(e) => setNomeModelo(e.target.value)}
            list={preset ? `modelos-${preset.id}` : undefined}
            placeholder="nome do modelo (ex.: deepseek-chat)"
            aria-label="Nome do modelo"
            style={campoEstilo}
          />
          {/* SPEC-30 Fase 2 — a tela não tem como adivinhar se um modelo de
              gateway interno enxerga imagem. Padrão desmarcado: esconder um
              botão que funcionaria custa um clique; mostrar um que falha custa
              a conversa. */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--texto-2)" }}>
            <input
              type="checkbox"
              checked={visaoManual}
              onChange={(e) => setVisaoManual(e.target.checked)}
              aria-label="Este modelo enxerga imagem"
            />
            Este modelo enxerga imagem (permite anexar prints na conversa)
          </label>
          {preset && (
            <datalist id={`modelos-${preset.id}`}>
              {preset.modelos.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => void executar("salvar")} disabled={!completo || ocupado !== null} style={botaoEstilo}>
            {ocupado === "salvar" ? "salvando…" : "Salvar"}
          </button>
          <button
            onClick={() => void executar("testar")}
            disabled={!completo || ocupado !== null}
            style={{ ...botaoEstilo, borderColor: "var(--borda-forte)", color: "var(--texto-2)" }}
          >
            {ocupado === "testar" ? "testando…" : "Testar conexão"}
          </button>
        </div>

        {resultado && (
          <p
            data-testid="gateway-resultado"
            style={{ fontSize: 11.5, marginBottom: 0, color: resultado.ok ? "var(--verde)" : "var(--vermelho)" }}
          >
            {resultado.texto}
          </p>
        )}
        <p style={{ fontSize: 11, color: "var(--texto-mudo)", marginBottom: 0, marginTop: 6 }}>
          A chave fica no banco do servidor (da organização) e a API só devolve o resumo mascarado — nada vai pra arquivo de configuração nem pro git. Deixar o campo vazio mantém a chave atual.
        </p>
      </div>
    </div>
  );
}

const notaPresetEstilo: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--texto-fraco)",
  lineHeight: 1.6,
  margin: "6px 0 0",
};

const campoEstilo: React.CSSProperties = {
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto)",
  fontSize: 12.5,
};

const botaoEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
};

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  marginTop: 0,
  maxWidth: 680,
};

const cardEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  background: "var(--painel)",
  cursor: "pointer",
};

const cardSelecionadoEstilo: React.CSSProperties = {
  borderColor: "var(--acento)",
  background: "rgba(56, 189, 248, 0.06)",
};

const selo: React.CSSProperties = {
  fontSize: 10,
  color: "var(--acento)",
  background: "rgba(56, 189, 248, 0.14)",
  borderRadius: 999,
  padding: "1px 8px",
  marginLeft: 8,
  fontWeight: 500,
};

const avisoEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--amarelo)",
  marginBottom: 0,
};


/**
 * SPEC-30 — o que ESTE destino não faz, dito antes de a pessoa tentar.
 *
 * Sem isto, três limitações reais só apareciam como falha:
 * - o Ollama **não transcreve** (o microfone aparecia e morria em 404);
 * - modelo sem visão recusa imagem (a marcação manual não valida nada);
 * - em CPU, a esteira leva minutos por item (medido, ver README).
 *
 * A régua é a mesma do resto do produto: a interface diz a verdade sobre o que
 * o sistema consegue. Aviso não é enfeite — é o que evita a pessoa gastar
 * tempo num caminho que não existe.
 */
function AvisosDoDestino({ baseUrl, visaoMarcada }: { baseUrl: string; visaoMarcada: boolean }) {
  const alvo = baseUrl.trim().toLowerCase();
  if (!alvo) return null;

  const ehOllama = alvo.includes("ollama:11434") || alvo.includes("localhost:11434");
  // Endereço na própria infra: sem GPU, o tempo é o que ele é.
  const ehLocal = ehOllama || alvo.includes("localhost") || alvo.includes("127.0.0.1") || alvo.includes("://whisper");

  const avisos: string[] = [];
  if (ehOllama) {
    avisos.push(
      "O Ollama não transcreve áudio. Para o botão de falar funcionar, suba o serviço de voz junto: `docker compose --profile ia up -d` (a transcrição vai pro Whisper, não pra cá)."
    );
  }
  if (ehLocal) {
    avisos.push(
      "Rodando na sua máquina: sem GPU, conte com minutos por item na esteira (medido: ~3min40 para um item com 2 campos no qwen2.5:7b). Com GPU NVIDIA, descomente o bloco `deploy:` do serviço no docker-compose.yml."
    );
  }
  if (visaoMarcada) {
    avisos.push(
      "Você marcou que este modelo enxerga imagem — isso não é verificado aqui. Se o modelo não aceitar, a conversa com print anexado falha com uma mensagem dizendo isso."
    );
  }

  if (avisos.length === 0) return null;
  return (
    <ul style={listaDeAvisosEstilo} data-testid="avisos-do-destino">
      {avisos.map((texto, i) => (
        <li key={i}>{texto}</li>
      ))}
    </ul>
  );
}

const listaDeAvisosEstilo: React.CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 16,
  fontSize: 11.5,
  lineHeight: 1.6,
  color: "var(--amarelo)",
};

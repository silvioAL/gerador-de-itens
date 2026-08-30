import { useState } from "react";
import type { Necessidade, VolumetriaDaDemanda } from "@gerador/engine";
import { descreverVolumetria, descreverVolumetriaEmVigor, type VolumetriaEmVigor } from "@gerador/engine";
import { NecessidadesPanel, type ElementoVinculavel } from "./NecessidadesPanel";

export interface AnexoContexto {
  nome: string;
  conteudo: string;
}

export interface ContextoEpicoPanelProps {
  demandInfo?: string;
  anexosContexto?: AnexoContexto[];
  /** SPEC-53 — de que produto é esta demanda (null = nenhum). */
  produtoId?: string | null;
  /** Os produtos que o time enxerga; vazio = ninguém cadastrou ainda, e aí o
   * seletor some em vez de oferecer uma lista vazia. */
  produtos?: { id: string; nome: string }[];
  /** SPEC-57 fatia A — o propósito da demanda, editado aqui junto do resto do
   * contexto: é a mesma pergunta ("do que esta demanda trata"), respondida em
   * itens em vez de prosa. */
  necessidades?: Necessidade[];
  /**
   * SPEC-70 — o VOLUME que esta demanda atende, dito uma vez.
   *
   * Mora aqui e não no componente: é propriedade do que se está construindo, e
   * quem sabe o número é quem trouxe a demanda. O motor o distribui pelo grafo
   * (`distribuirVolumetria`), então ninguém precisa digitar taxa nó a nó.
   */
  volumetria?: VolumetriaDaDemanda;
  /** SPEC-87 (P5) — o regime declarado desta demanda. */
  modoDeOperacao?: string;
  /** SPEC-87 fatia C — os regimes que o time reconhece. Vazio = o time não usa
   * o eixo, e o seletor nem aparece: oferecer uma lista vazia é pior que não
   * oferecer nada. */
  modosDoTime?: string[];
  /**
   * SPEC-77 — o volume que VALE agora, com a procedência.
   *
   * Vem separado do `volumetria` acima, e a distinção é o ponto da fatia: os
   * CAMPOS mostram só o que esta demanda declarou (herdado nos campos viraria
   * cópia no próximo Salvar), e esta frase diz o que está valendo e de onde
   * veio — inclusive quando os dois discordam.
   */
  volumetriaEmVigor?: VolumetriaEmVigor;
  /** Nós do desenho, para vincular. */
  elementos?: ElementoVinculavel[];
  /** SPEC-57 fatia D — pede a proposta de propósito ao agente. Injetada de
   * fora (e não chamada aqui) para o painel continuar testável sem rede, e
   * para quem não tem IA configurada simplesmente não receber o botão. */
  onProporNecessidades?: (jaDeclaradas: string[], contextoEpico: string) => Promise<Necessidade[]>;
  onSalvar: (
    demandInfo: string,
    anexosContexto: AnexoContexto[],
    produtoId: string | null,
    necessidades: Necessidade[],
    volumetria: VolumetriaDaDemanda | undefined,
    /** SPEC-87 — vai junto da volumetria porque é o par natural: uma diz
     * QUANTO, a outra diz EM QUE REGIME, e as duas são declarações sobre esta
     * demanda feitas no mesmo lugar. */
    modoDeOperacao: string | undefined
  ) => void;
  onFechar: () => void;
}

/** `File.text()` não é confiável em todo ambiente (jsdom nos testes) — FileReader
 * é a API mais antiga e amplamente suportada. */
function lerArquivoComoTexto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler o arquivo."));
    leitor.readAsText(arquivo);
  });
}

/**
 * Painel pra colar/anexar o contexto do épico (estado atual da história de
 * usuário, material da demanda) ANTES de trabalhar os itens — achado real do
 * usuário: `Quebra.demandInfo` já existia no modelo, mas nunca teve UI de
 * edição em lugar nenhum, e só alimentava a seção "Contexto" do documento
 * exportado, nunca a sugestão real de IA (Fase 1b, SPEC-23). Este painel
 * alimenta os dois: o documento final e o prompt de `/ia/sugerir` na aba
 * Refinamento.
 *
 * Desde o #298 não é mais um modal com backdrop próprio: é uma aba do
 * `AssistenteFlutuante`, que é quem posiciona, abre e fecha a janela.
 */
export function ContextoEpicoPanel({
  demandInfo,
  anexosContexto,
  produtoId,
  produtos = [],
  necessidades: necessidadesIniciais,
  volumetria: volumetriaInicial,
  modoDeOperacao: modoInicial,
  modosDoTime = [],
  volumetriaEmVigor,
  elementos = [],
  onProporNecessidades,
  onSalvar,
  onFechar,
}: ContextoEpicoPanelProps) {
  const [texto, setTexto] = useState(demandInfo ?? "");
  const [anexos, setAnexos] = useState<AnexoContexto[]>(anexosContexto ?? []);
  const [produto, setProduto] = useState<string>(produtoId ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [necessidades, setNecessidades] = useState<Necessidade[]>(necessidadesIniciais ?? []);
  // Strings, e não números: um campo numérico controlado por `number` engole o
  // estado intermediário de quem está digitando ("2", "20", "200"…).
  const [volQuantidade, setVolQuantidade] = useState(
    volumetriaInicial ? String(volumetriaInicial.quantidade) : ""
  );
  const [volPor, setVolPor] = useState<VolumetriaDaDemanda["por"]>(volumetriaInicial?.por ?? "dia");
  const [modo, setModo] = useState(modoInicial ?? "");
  // A prévia mostra o req/s ENQUANTO se digita: é o número que a Lei de Little
  // usa, e escondê-lo faria a acusação de saturação citar um valor que não está
  // em lugar nenhum da tela.
  const previaDaVolumetria =
    Number(volQuantidade) > 0 ? { quantidade: Number(volQuantidade), por: volPor } : undefined;
  const [propondo, setPropondo] = useState(false);
  const [erroDaProposta, setErroDaProposta] = useState<string | null>(null);

  async function proporNecessidades() {
    setPropondo(true);
    setErroDaProposta(null);
    try {
      // As já declaradas viajam junto: o agente não deve repropor o que a
      // pessoa já escreveu — repetição faz ela parar de ler a lista.
      // O contexto que vai é o da TELA, não o salvo: achado do E2E — a pessoa
      // escrevia o contexto, pedia a proposta e o agente respondia "sem
      // contexto", porque `quebra.demandInfo` só muda depois do Salvar.
      const propostas = await onProporNecessidades!(
        necessidades.map((n) => n.texto),
        texto
      );
      setNecessidades((atuais) => [...atuais, ...propostas]);
    } catch (e) {
      setErroDaProposta(e instanceof Error ? e.message : "Não foi possível propor as necessidades.");
    } finally {
      setPropondo(false);
    }
  }

  async function aoSelecionarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (arquivos.length === 0) return;
    setErro(null);
    try {
      const novos = await Promise.all(
        arquivos.map(async (arquivo) => ({ nome: arquivo.name, conteudo: await lerArquivoComoTexto(arquivo) }))
      );
      setAnexos((atual) => [...atual, ...novos]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o(s) arquivo(s).");
    }
  }

  function removerAnexo(nome: string) {
    setAnexos((atual) => atual.filter((a) => a.nome !== nome));
  }

  function salvar() {
    const quantidade = Number(volQuantidade);
    onSalvar(
      texto,
      anexos,
      produto || null,
      necessidades,
      // Só vira volumetria quando é número positivo: "0 por dia" seria um
      // volume que nenhuma conta usa, e um campo em branco não é uma promessa.
      Number.isFinite(quantidade) && quantidade > 0 ? { quantidade, por: volPor } : undefined,
      modo || undefined
    );
    onFechar();
  }

  return (
    <div
      aria-label="Contexto da demanda"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, padding: "14px 16px", overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--texto-fraco)" }}>
          Cole o estado atual da demanda — épico, história, spike, correção — e anexe material de apoio (texto). Alimenta a seção "Contexto" do
          documento exportado e a sugestão de IA real na aba Refinamento.
        </p>

        {/* SPEC-53 — o produto é o contexto que NÃO se recola a cada demanda:
            fica cadastrado uma vez e viaja junto com todas. O seletor mora aqui,
            e não no header, porque é a mesma pergunta do resto do painel ("de
            que estamos falando"), só que respondida uma vez por produto. */}
        {produtos.length > 0 && (
          <div>
            <label htmlFor="contexto-produto" style={{ display: "block", fontSize: 11, color: "var(--texto-fraco)", marginBottom: 2 }}>
              Produto desta demanda
            </label>
            <select
              id="contexto-produto"
              aria-label="Produto desta demanda"
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid var(--borda-forte)",
                background: "var(--fundo)",
                color: "var(--texto)",
                fontSize: 13,
              }}
            >
              <option value="">— nenhum —</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--texto-mudo)" }}>
              O contexto do produto (objetivo, glossário, regras que valem sempre) vai junto com esta demanda — sem
              precisar recolar nada.
            </p>
          </div>
        )}
        {/* SPEC-70 — o volume da demanda, dito UMA vez.
            
            Ao lado do produto e do propósito porque é a mesma pergunta ("do que
            esta demanda trata"), respondida em número. E é daqui que o motor
            distribui: sem este campo, a Lei de Little só fecha se alguém digitar
            a taxa em cada nó — que é o trabalho que esta SPEC tira de quem usa. */}
        <div>
          <label
            htmlFor="volumetria-quantidade"
            style={{ display: "block", fontSize: 11, color: "var(--texto-fraco)", marginBottom: 2 }}
          >
            Volume que esta demanda atende
          </label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              id="volumetria-quantidade"
              aria-label="Volume que esta demanda atende"
              data-testid="volumetria-quantidade"
              type="number"
              min={0}
              value={volQuantidade}
              onChange={(e) => setVolQuantidade(e.target.value)}
              placeholder="ex.: 2000000"
              style={{
                flex: 1,
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid var(--borda-forte)",
                background: "var(--fundo)",
                color: "var(--texto)",
                fontSize: 13,
              }}
            />
            <select
              aria-label="Unidade do volume"
              data-testid="volumetria-por"
              value={volPor}
              onChange={(e) => setVolPor(e.target.value as VolumetriaDaDemanda["por"])}
              style={{
                padding: "7px 8px",
                borderRadius: 8,
                border: "1px solid var(--borda-forte)",
                background: "var(--fundo)",
                color: "var(--texto)",
                fontSize: 12,
              }}
            >
              <option value="segundo">por segundo</option>
              <option value="minuto">por minuto</option>
              <option value="hora">por hora</option>
              <option value="dia">por dia</option>
            </select>
          </div>
          {/**
           * SPEC-87 (P5) fatia D — **o regime em que este desenho opera.**
           *
           * Ao lado da volumetria porque é o par natural: uma diz QUANTO, a
           * outra diz EM QUE REGIME. E aqui, e não na tela de regras, porque é
           * declaração sobre esta demanda — a mesma razão pela qual o volume da
           * demanda mora neste painel desde a SPEC-70.
           *
           * Só aparece quando o time declarou regimes: um seletor com uma opção
           * vazia ensina que o campo não serve para nada.
           */}
          {modosDoTime.length > 0 && (
            <div style={{ marginTop: 12 }} data-testid="modo-de-operacao">
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--texto)" }} htmlFor="modo-de-operacao-select">
                Regime de operação
              </label>
              <select
                id="modo-de-operacao-select"
                value={modo}
                onChange={(e) => setModo(e.target.value)}
                style={{ display: "block", marginTop: 4, fontSize: 12.5, padding: "6px 8px", borderRadius: 7, border: "1px solid var(--borda)", background: "var(--painel)", color: "var(--texto)" }}
              >
                {/* "Nenhum" é o padrão e é uma escolha legítima: régua sem modo
                    continua valendo, régua com modo não aparece. */}
                <option value="">nenhum declarado</option>
                {modosDoTime.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--texto-mudo)" }}>
                Muda quais réguas do time são cobradas. Sem regime declarado, só valem as que não dependem de um.
              </p>
            </div>
          )}

          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--texto-mudo)" }} data-testid="volumetria-derivada">
            {descreverVolumetria(previaDaVolumetria) ??
              "Opcional. Com ele, o motor distribui a taxa pelo desenho e a saturação passa a fechar sem ninguém digitar número em componente nenhum."}
          </p>
          {/* SPEC-77 — o que está VALENDO, e de onde veio.
              Sem esta linha, alguém vê os campos vazios e conclui que não há
              volume nenhum — quando na verdade a demanda está herdando o do
              produto, e a saturação já está sendo calculada com ele. E quando
              os dois números discordam, os DOIS aparecem: quem digitou aqui
              pode ter tido um motivo, e quem lê depois precisa saber que este
              número não acompanha mais o do produto. */}
          {!previaDaVolumetria && volumetriaEmVigor?.origem === "herdada" && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--texto-2)" }} data-testid="volumetria-herdada">
              {descreverVolumetriaEmVigor(volumetriaEmVigor)}
            </p>
          )}
          {volumetriaEmVigor?.doProduto && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--amarelo)" }} data-testid="volumetria-diverge">
              Esta demanda declara um volume diferente do produto, que diz{" "}
              {descreverVolumetria(volumetriaEmVigor.doProduto)}. Mudar aqui não muda o produto.
            </p>
          )}
        </div>

        <NecessidadesPanel
          necessidades={necessidades}
          elementos={elementos}
          onMudar={setNecessidades}
          onPropor={onProporNecessidades ? proporNecessidades : undefined}
          propondo={propondo}
          erroDaProposta={erroDaProposta}
        />

          <textarea
            aria-label="Contexto da demanda (texto)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: história de usuário atual, decisões já tomadas, restrições conhecidas..."
            rows={8}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--borda-forte)",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
              // §253 — ACHADO REAL (print do usuário): o campo aparecia com uma
              // linha e o texto cortado ao meio.
              //
              // Não era sobreposição do rodapé: este `textarea` é item de um
              // flex column com altura definida, e item flex ENCOLHE por padrão
              // (`flex-shrink: 1`). Quando as necessidades acima cresciam, ele
              // era espremido a quase nada — em vez de o container rolar, que é
              // para isso que ele tem `overflow: auto`. `rows={8}` não protege:
              // rows é altura *inicial*, não mínima.
              flexShrink: 0,
              minHeight: 140,
            }}
          />

          <div>
            <label
              style={{
                display: "inline-block",
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid var(--borda-forte)",
                background: "var(--painel)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              + Anexar arquivo(s) de texto
              <input
                type="file"
                multiple
                accept=".txt,.md,.json,text/plain,text/markdown"
                onChange={(e) => void aoSelecionarArquivos(e)}
                style={{ display: "none" }}
              />
            </label>

            {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 8 }}>{erro}</p>}

            {anexos.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
                {anexos.map((a) => (
                  <li
                    key={a.nome}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      background: "var(--painel-alto)",
                      borderRadius: 6,
                      padding: "6px 10px",
                    }}
                  >
                    <span style={{ flex: 1 }}>{a.nome}</span>
                    <button
                      onClick={() => removerAnexo(a.nome)}
                      aria-label={`Remover anexo ${a.nome}`}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--vermelho)", fontSize: 13 }}
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      <footer style={{ padding: "12px 16px", borderTop: "1px solid var(--borda)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onFechar}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--borda-forte)", background: "var(--painel)", fontSize: 12, cursor: "pointer" }}
        >
          Cancelar
        </button>
        <button
          onClick={salvar}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--acento-indigo)", color: "#fff", fontSize: 12, cursor: "pointer" }}
        >
          Salvar
        </button>
      </footer>
    </div>
  );
}

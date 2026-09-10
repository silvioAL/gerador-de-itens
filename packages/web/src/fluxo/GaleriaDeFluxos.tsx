import { useEffect, useMemo, useState } from "react";
import {
  ID_DO_FLUXO_DA_ESTEIRA,
  // SPEC-110 fatia J — o fluxo-mestre, em destaque no topo da galeria.
  ID_DO_FLUXO_DA_JORNADA,
  ID_DO_FLUXO_DA_EXPORTACAO,
  ID_DO_FLUXO_DA_PUBLICACAO,
  ID_DO_FLUXO_DO_ENSAIO,
  ID_DO_FLUXO_DO_PDCA,
  fluxoNovo,
  type FluxoEmVigor,
  type TelaDeclarada,
} from "@gerador/aplicacao";
import { apiFluxos, apiFluxosEmVigor, apiTelas } from "../api/client";

/**
 * SPEC-110 fatia H (D14) — **onde os fluxos e as telas MORAM.**
 *
 * Pedido literal: *"precisamos planejar onde as screens vão morar… acho que
 * simplificaria bastante ter um menu com screens e o que já existe de fluxos
 * (talvez com outra tela antes, busca filtrada, ícones grandes e
 * avatares/nomes editáveis)"*.
 *
 * O que existia era um dropdown no topo do canvas: para saber que fluxos o
 * time tem, era preciso abrir um deles e ler uma lista de nomes. Um dropdown
 * responde "qual eu abro agora?"; ele não responde "o que existe aqui?" — que
 * é a pergunta de quem chega.
 *
 * ## Todo card derivado diz DE ONDE nasce (D16b)
 *
 * A pergunta que a galeria mata é *"onde se configura isso?"*. Um fluxo que
 * aparece sem ninguém o ter desenhado é mágica até dizer de onde veio — e a
 * porta ao lado da frase leva à tela que o gera. É o padrão deep-link + porta
 * que a SPEC-109 consolidou.
 */

/** A ETAPA da jornada a que cada derivado pertence — a galeria agrupa por ela
 * porque "o que existe aqui?" se responde melhor por momento de uso do que por
 * ordem alfabética. */
type Etapa = "jornada" | "ensaiar" | "derivar" | "sair" | "melhorar" | "meus";

const ETAPAS: { id: Etapa; titulo: string; explica: string }[] = [
  /**
   * SPEC-110 fatia J (D16) — **o mestre em destaque, no topo.** A queixa era
   * *"quais fluxos estão relacionados ao quê?"*: as seções abaixo dizem em que
   * MOMENTO cada etapa serve, e este cartão diz como elas se ligam. Ele vem
   * primeiro porque é a resposta mais curta à pergunta.
   */
  { id: "jornada", titulo: "A jornada inteira", explica: "as etapas abaixo, ligadas — duplo-clique num cartão abre a etapa" },
  { id: "ensaiar", titulo: "Ensaiar", explica: "antes de escrever: medir o desenho" },
  { id: "derivar", titulo: "Derivar e escrever", explica: "o motor calcula, a IA escreve, você confirma" },
  { id: "sair", titulo: "Sair daqui", explica: "levar o resultado para fora" },
  { id: "melhorar", titulo: "Melhorar", explica: "o ciclo que ajusta a própria configuração" },
  { id: "meus", titulo: "Do time", explica: "os que vocês desenharam" },
];

/**
 * De onde cada fábrica nasce, e a porta para lá. Um `Record` e não um `if`:
 * fábrica nova sem origem declarada é um card que volta a ser mágico, e a
 * lista fechada obriga a decidir no mesmo commit (§354).
 */
interface OrigemDaFabrica {
  etapa: Etapa;
  nasceDe: string;
  /** Para onde a porta leva. `null` = não há o que configurar (é do motor). */
  area: string | null;
}

function origemDaFabrica(id: string): OrigemDaFabrica {
  // SPEC-110 fatia J — o mestre nasce das ETAPAS que existem: sem destino de
  // exportação configurado, o nó de exportar não está lá. Por isso "as etapas
  // abaixo" e não uma tela de configuração — a porta de cada uma é o card dela.
  if (id === ID_DO_FLUXO_DA_JORNADA) return { etapa: "jornada", nasceDe: "as etapas abaixo", area: null };
  if (id === ID_DO_FLUXO_DA_ESTEIRA) return { etapa: "derivar", nasceDe: "papéis da esteira", area: "pipeline" };
  if (id === ID_DO_FLUXO_DO_ENSAIO) return { etapa: "ensaiar", nasceDe: "sempre existe (motor)", area: null };
  if (id === ID_DO_FLUXO_DO_PDCA) return { etapa: "melhorar", nasceDe: "papéis da esteira", area: "pipeline" };
  if (id === ID_DO_FLUXO_DA_EXPORTACAO) return { etapa: "sair", nasceDe: "destinos de exportação", area: "exportador" };
  if (id.startsWith(ID_DO_FLUXO_DA_PUBLICACAO)) return { etapa: "sair", nasceDe: "destinos de publicação", area: "exportador" };
  // Fábrica que a galeria não conhece ainda: melhor "de onde?" sem porta do
  // que um card mudo — e o teste-guarda cobra o mapeamento.
  return { etapa: "derivar", nasceDe: "derivado da configuração", area: null };
}

/** O rosto padrão quando o fluxo não declarou o dele. */
const ICONE_PADRAO = "🔀";
const ICONE_PADRAO_DA_TELA = "🪟";

export function GaleriaDeFluxos({
  timeAtivo,
  aoAbrirFluxo,
  aoAbrirTela,
  aoAbrirConfig,
  aoFechar,
}: {
  timeAtivo?: string;
  aoAbrirFluxo: (id: string) => void;
  aoAbrirTela: (id: string) => void;
  /** A porta do "nasce de:" — leva à tela que gera o derivado (D16b). */
  aoAbrirConfig: (area: string) => void;
  aoFechar: () => void;
}) {
  const [fluxos, setFluxos] = useState<FluxoEmVigor[] | null>(null);
  const [telas, setTelas] = useState<TelaDeclarada[]>([]);
  const [ultimas, setUltimas] = useState<Record<string, { ok: boolean; em: string }>>({});
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  /** Qual card está com o nome/rosto em edição — um por vez. */
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<{ nome: string; icone: string }>({ nome: "", icone: "" });
  const [salvando, setSalvando] = useState(false);
  const [nomeDoNovo, setNomeDoNovo] = useState("");

  async function recarregar() {
    try {
      const [emVigor, doc, saude] = await Promise.all([
        apiFluxosEmVigor.listar(timeAtivo),
        apiTelas.obter(timeAtivo),
        apiFluxosEmVigor.ultimas().catch(() => ({ ultimas: [] })),
      ]);
      setFluxos(emVigor.fluxos as FluxoEmVigor[]);
      // `obter` já devolve o DOCUMENTO — não o envelope com diagnóstico.
      setTelas((doc?.telas ?? []) as TelaDeclarada[]);
      setUltimas(Object.fromEntries(saude.ultimas.map((u) => [u.fluxoId, { ok: u.ok, em: u.em }])));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  // Recarrega quando o TIME muda: `recarregar` fica fora das dependências de
  // propósito — ela se recria a cada render, e listá-la faria o efeito rodar
  // em laço. (Este projeto não configura `react-hooks/exhaustive-deps`, então
  // um `eslint-disable` para ela vira erro de regra inexistente.)
  useEffect(() => {
    void recarregar();
  }, [timeAtivo]);

  /**
   * A busca filtra por NOME e por tipo, sem distinguir maiúsculas nem acento —
   * quem procura "publicacao" não deve ficar sem resposta por causa da cedilha.
   */
  const normalizar = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const filtrados = useMemo(() => {
    const alvo = normalizar(busca.trim());
    if (!alvo) return fluxos ?? [];
    return (fluxos ?? []).filter((f) =>
      [f.nome, f.id, f.origem === "fabrica" ? "derivado" : "declarado", origemDaFabrica(f.id).nasceDe].some((campo) =>
        normalizar(String(campo)).includes(alvo)
      )
    );
  }, [fluxos, busca]);

  const telasFiltradas = useMemo(() => {
    const alvo = normalizar(busca.trim());
    if (!alvo) return telas;
    return telas.filter((t) => [t.nome, t.id, "tela", "screen"].some((c) => normalizar(String(c)).includes(alvo)));
  }, [telas, busca]);

  /** Em quantos fluxos esta tela é usada — o card responde "posso mexer?". */
  const usosDaTela = (telaId: string) =>
    (fluxos ?? []).filter((f) => f.nos.some((n) => n.tipo === "tela" && n.refId === `tela:${telaId}`)).length;

  const porEtapa = (etapa: Etapa) =>
    filtrados.filter((f) => (f.origem === "declarado" ? etapa === "meus" : origemDaFabrica(f.id).etapa === etapa));

  /**
   * Renomear e trocar o rosto gravam pelo caminho de salvar que já existe — o
   * documento `fluxos` do time, com os declarados. Fluxo DERIVADO não se
   * edita: "editar uma cópia" continua sendo a porta (§386), e um campo
   * editável que não persiste seria pior que um campo ausente.
   */
  async function salvarCard(fluxo: FluxoEmVigor) {
    setSalvando(true);
    try {
      const declarados = (fluxos ?? [])
        .filter((f) => f.origem === "declarado")
        .map(({ origem: _o, sombreiaFabrica: _s, ...f }) =>
          f.id === fluxo.id
            ? {
                ...f,
                nome: rascunho.nome.trim() || f.nome,
                ...(rascunho.icone.trim() ? { icone: rascunho.icone.trim() } : {}),
              }
            : f
        );
      await apiFluxos.salvar({ fluxos: declarados }, timeAtivo);
      await recarregar();
      setEditando(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  async function criarFluxo() {
    const nome = nomeDoNovo.trim();
    if (!nome) return;
    const id = normalizar(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `fluxo-${Date.now()}`;
    setSalvando(true);
    try {
      const declarados = (fluxos ?? [])
        .filter((f) => f.origem === "declarado")
        .map(({ origem: _o, sombreiaFabrica: _s, ...f }) => f);
      // A MESMA semente do canvas: o fluxo novo nasce com o gatilho (fatia A).
      await apiFluxos.salvar({ fluxos: [...declarados, fluxoNovo(id, nome)] }, timeAtivo);
      setNomeDoNovo("");
      aoAbrirFluxo(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const card: React.CSSProperties = {
    border: "1px solid var(--borda)",
    borderRadius: 10,
    padding: 14,
    background: "var(--painel)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    textAlign: "left",
    cursor: "pointer",
    minHeight: 132,
  };
  const selo: React.CSSProperties = {
    fontSize: 10.5,
    padding: "1px 6px",
    borderRadius: 999,
    border: "1px solid var(--borda)",
    color: "var(--texto-2)",
  };
  const botao: React.CSSProperties = {
    fontSize: 12,
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid var(--borda)",
    background: "var(--painel)",
    color: "var(--texto)",
    cursor: "pointer",
  };

  return (
    <div
      data-testid="galeria-de-fluxos"
      style={{ padding: 16, overflow: "auto", height: "100%", flex: 1, width: "100%", minWidth: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>Fluxos e telas</strong>
        <span style={{ fontSize: 12, color: "var(--texto-mudo)" }}>
          o que este time tem — e de onde cada coisa nasce
        </span>
        <input
          data-testid="busca-da-galeria"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar por nome ou tipo…"
          style={{ ...botao, cursor: "text", minWidth: 220, marginLeft: "auto" }}
        />
        <button data-testid="voltar-da-galeria" onClick={aoFechar} style={botao}>
          Voltar à mesa de projeto
        </button>
      </div>

      {erro && (
        <div data-testid="erro-da-galeria" style={{ color: "var(--vermelho)", fontSize: 12.5, marginBottom: 10 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          data-testid="nome-do-fluxo-novo"
          value={nomeDoNovo}
          onChange={(e) => setNomeDoNovo(e.target.value)}
          placeholder="nome do fluxo novo"
          aria-label="Nome do fluxo novo"
          style={{ ...botao, cursor: "text", minWidth: 200 }}
        />
        <button data-testid="criar-fluxo-na-galeria" onClick={() => void criarFluxo()} disabled={!nomeDoNovo.trim() || salvando} style={botao}>
          + Novo fluxo
        </button>
        <button data-testid="criar-tela-na-galeria" onClick={() => aoAbrirTela("")} style={botao}>
          + Nova tela
        </button>
      </div>

      {fluxos === null ? (
        <div style={{ fontSize: 12.5, color: "var(--texto-mudo)" }}>carregando…</div>
      ) : (
        ETAPAS.map((etapa) => {
          const daEtapa = porEtapa(etapa.id);
          if (daEtapa.length === 0) return null;
          return (
            <section key={etapa.id} data-testid={`etapa-${etapa.id}`} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <strong style={{ fontSize: 12.5 }}>{etapa.titulo}</strong>
                <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>{etapa.explica}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {daEtapa.map((f) => {
                  const derivado = f.origem === "fabrica";
                  const origem = origemDaFabrica(f.id);
                  const saude = ultimas[f.id];
                  const emEdicao = editando === f.id;
                  return (
                    <div key={f.id} data-testid={`card-fluxo-${f.id}`} style={card} onClick={() => !emEdicao && aoAbrirFluxo(f.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {emEdicao ? (
                          <input
                            data-testid="icone-em-edicao"
                            value={rascunho.icone}
                            onChange={(e) => setRascunho((r) => ({ ...r, icone: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Rosto do fluxo"
                            style={{ ...botao, cursor: "text", width: 52, fontSize: 20, textAlign: "center" }}
                          />
                        ) : (
                          <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden>
                            {f.icone || ICONE_PADRAO}
                          </span>
                        )}
                        {emEdicao ? (
                          <input
                            data-testid="nome-em-edicao"
                            value={rascunho.nome}
                            onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Nome do fluxo"
                            style={{ ...botao, cursor: "text", flex: 1 }}
                          />
                        ) : (
                          <strong style={{ fontSize: 13 }}>{f.nome}</strong>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        <span style={selo}>{derivado ? "derivado" : "declarado"}</span>
                        {f.sombreiaFabrica && (
                          <span data-testid={`selo-sombreia-${f.id}`} style={{ ...selo, color: "var(--amarelo)" }}>
                            sombreando a derivada
                          </span>
                        )}
                        <span style={selo}>{f.nos.length} nós</span>
                        {saude && (
                          <span data-testid={`saude-${f.id}`} style={{ ...selo, color: saude.ok ? "var(--verde)" : "var(--vermelho)" }}>
                            {saude.ok ? "✓ rodou" : "✕ falhou"}
                          </span>
                        )}
                      </div>

                      {/* D16b — de onde nasce, com a porta ao lado: a pergunta
                          "onde se configura isso?" morre no card. */}
                      {derivado && (
                        <div style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>
                          nasce de: {origem.nasceDe}
                          {origem.area && (
                            <button
                              data-testid={`porta-da-origem-${f.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                aoAbrirConfig(origem.area!);
                              }}
                              style={{ ...botao, marginLeft: 6, padding: "1px 6px", fontSize: 11 }}
                            >
                              →
                            </button>
                          )}
                        </div>
                      )}

                      {/* Só o declarado edita: o derivado tem a porta de sempre
                          ("editar uma cópia" no canvas), e um campo que não
                          persiste seria pior que campo nenhum. */}
                      {!derivado &&
                        (emEdicao ? (
                          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                            <button
                              data-testid={`salvar-card-${f.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void salvarCard(f);
                              }}
                              disabled={salvando}
                              style={botao}
                            >
                              Salvar
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditando(null);
                              }}
                              style={botao}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            data-testid={`editar-card-${f.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditando(f.id);
                              setRascunho({ nome: f.nome, icone: f.icone ?? "" });
                            }}
                            style={{ ...botao, marginTop: "auto", alignSelf: "flex-start", fontSize: 11 }}
                          >
                            renomear / trocar o rosto
                          </button>
                        ))}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      <section data-testid="secao-de-telas" style={{ marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 12.5 }}>Telas do time</strong>
          <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>
            onde alguém entra no meio de um fluxo
          </span>
        </div>
        {telasFiltradas.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--texto-mudo)" }}>
            {telas.length === 0 ? "nenhuma ainda — “+ Nova tela” cria a primeira." : "nenhuma tela casa com a busca."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {telasFiltradas.map((t) => (
              <div key={t.id} data-testid={`card-tela-${t.id}`} style={card} onClick={() => aoAbrirTela(t.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden>
                    {t.icone || ICONE_PADRAO_DA_TELA}
                  </span>
                  <strong style={{ fontSize: 13 }}>{t.nome}</strong>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <span style={selo}>tela</span>
                  <span style={selo}>{t.blocos.length} blocos</span>
                  {/* "usada em N fluxos" responde antes de a pessoa mexer: uma
                      tela usada em três desenhos não se edita no impulso. */}
                  <span data-testid={`usos-da-tela-${t.id}`} style={selo}>
                    usada em {usosDaTela(t.id)} fluxo{usosDaTela(t.id) === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

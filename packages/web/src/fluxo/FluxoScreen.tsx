import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { mensagemDeCiclo, planoDoFluxo, type ArestaDoFluxo, type Fluxo, type NoDoFluxo } from "@gerador/aplicacao";
import {
  apiCatalogoDeConectores,
  apiExecucaoDeFluxo,
  apiFluxos,
  apiPipelineAgentes,
  type ConectorDoCatalogo,
  type PapelConfigurado,
  type RastroDoNoExecutado,
} from "../api/client";
import { usePermissoes } from "../auth/usePermissoes";

/**
 * SPEC-105 fatia C — **a tela do FLUXO: o outro grafo.**
 *
 * A mesa de projeto desenha a arquitetura que o time vai construir; esta tela
 * desenha o encanamento da ferramenta. **São telas separadas, com paletas
 * separadas e persistência separada (§1)** — o que se reusa é o motor (React
 * Flow, a ordenação topológica), nunca a superfície. Reusar a tela é o que
 * destruiria a régua "estou desenhando o meu sistema ou a minha automação?".
 *
 * A paleta nasce do CATÁLOGO (fatia A) e da esteira: um nó é um conector ou um
 * papel — nunca um tipo solto. A aresta carrega o `mapeamento`; sem ele é
 * decoração (§4.1), e a tela diz isso.
 */

type DadosDoNo = { titulo: string; subtitulo: string; tipo: NoDoFluxo["tipo"] };

function NoDeFluxoCard({ data, selected }: NodeProps<Node<DadosDoNo>>) {
  return (
    <div
      style={{
        border: `1px solid ${selected ? "var(--acento)" : "var(--borda-forte)"}`,
        borderRadius: 10,
        background: "var(--painel-alto)",
        padding: "8px 12px",
        minWidth: 150,
        fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ fontSize: 10.5, color: "var(--texto-fraco)" }}>
        {data.tipo === "conector" ? "conector" : "agente"}
      </div>
      <strong style={{ fontSize: 12.5 }}>{data.titulo}</strong>
      {data.subtitulo && <div style={{ fontSize: 11, color: "var(--texto-2)" }}>{data.subtitulo}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const TIPOS_DE_NO = { noDeFluxo: NoDeFluxoCard };

const FLUXO_VAZIO = (id: string, nome: string): Fluxo => ({ id, nome, nos: [], arestas: [] });

export function FluxoScreen({ timeAtivo, onFechar }: { timeAtivo: string; onFechar: () => void }) {
  const permissoes = usePermissoes({ hospedado: true, timeId: timeAtivo });
  const podeEditar = permissoes.pode("fluxos", "editar");

  const [catalogo, setCatalogo] = useState<ConectorDoCatalogo[]>([]);
  const [papeis, setPapeis] = useState<PapelConfigurado[]>([]);
  const [fluxos, setFluxos] = useState<Fluxo[] | null>(null);
  const [fluxoId, setFluxoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [rastro, setRastro] = useState<{ nos: RastroDoNoExecutado[]; saidas: Record<string, Record<string, unknown>>; hash: string } | null>(null);
  const [selecao, setSelecao] = useState<{ tipo: "no" | "aresta"; id: string } | null>(null);
  const [novoConector, setNovoConector] = useState("");
  const [novoPapel, setNovoPapel] = useState("");
  const [novoFluxoNome, setNovoFluxoNome] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [vigor, pipeline, documento] = await Promise.all([
          apiCatalogoDeConectores.listar(),
          apiPipelineAgentes.obter(timeAtivo),
          apiFluxos.obter(timeAtivo),
        ]);
        setCatalogo(vigor.conectores);
        setPapeis(pipeline.papeis ?? []);
        const lidos = documento?.fluxos ?? [];
        setFluxos(lidos);
        setFluxoId(lidos[0]?.id ?? null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [timeAtivo]);

  const fluxo = useMemo(() => fluxos?.find((f) => f.id === fluxoId) ?? null, [fluxos, fluxoId]);

  // O ciclo é conferido a cada edição, com a MESMA mensagem do desenho (§4.4).
  const ciclo = useMemo(() => (fluxo ? planoDoFluxo(fluxo).ciclo : undefined), [fluxo]);

  function mudarFluxo(mudar: (f: Fluxo) => Fluxo) {
    if (!fluxoId) return;
    setFluxos((lista) => (lista ?? []).map((f) => (f.id === fluxoId ? mudar(f) : f)));
    setRastro(null);
  }

  const rotuloDoRef = useCallback(
    (no: Pick<NoDoFluxo, "tipo" | "refId">) =>
      no.tipo === "conector"
        ? (catalogo.find((c) => c.id === no.refId)?.nome ?? no.refId)
        : (papeis.find((p) => p.id === no.refId)?.nome ?? no.refId),
    [catalogo, papeis]
  );

  const nodes: Node<DadosDoNo>[] = useMemo(
    () =>
      (fluxo?.nos ?? []).map((no) => ({
        id: no.id,
        type: "noDeFluxo",
        position: no.posicao,
        selected: selecao?.tipo === "no" && selecao.id === no.id,
        data: { titulo: rotuloDoRef(no), subtitulo: no.refId, tipo: no.tipo },
      })),
    [fluxo, selecao, rotuloDoRef]
  );

  const edges: Edge[] = useMemo(
    () =>
      (fluxo?.arestas ?? []).map((a) => ({
        id: `${a.de}->${a.para}`,
        source: a.de,
        target: a.para,
        selected: selecao?.tipo === "aresta" && selecao.id === `${a.de}->${a.para}`,
        // Aresta sem mapeamento é decoração — e a tela diz isso na etiqueta.
        label: a.mapeamento.length > 0 ? a.mapeamento.map((m) => `${m.saida}→${m.entrada}`).join(", ") : "sem mapeamento",
        style: { stroke: "var(--texto-mudo)" },
        labelStyle: { fill: "var(--texto-2)", fontSize: 10 },
        labelBgStyle: { fill: "var(--painel)" },
      })),
    [fluxo, selecao]
  );

  function adicionarNo(tipo: NoDoFluxo["tipo"], refId: string) {
    if (!refId) return;
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `${refId}-${n}`)) n++;
      return {
        ...f,
        nos: [
          ...f.nos,
          { id: `${refId}-${n}`, tipo, refId, posicao: { x: 80 + f.nos.length * 60, y: 80 + f.nos.length * 40 }, parametros: {} },
        ],
      };
    });
  }

  async function salvar() {
    if (!fluxos) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiFluxos.salvar({ fluxos }, timeAtivo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  async function executar() {
    if (!fluxo) return;
    setExecutando(true);
    setErro(null);
    setRastro(null);
    try {
      // O que roda é o que está SALVO — executar rascunho seria rastro mentindo.
      await apiFluxos.salvar({ fluxos: fluxos! }, timeAtivo);
      const resultado = await apiExecucaoDeFluxo.executar(fluxo.id, timeAtivo);
      setRastro({ nos: resultado.nos, saidas: resultado.saidas, hash: resultado.hash });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setExecutando(false);
    }
  }

  const noSelecionado = selecao?.tipo === "no" ? (fluxo?.nos.find((n) => n.id === selecao.id) ?? null) : null;
  const arestaSelecionada =
    selecao?.tipo === "aresta" ? (fluxo?.arestas.find((a) => `${a.de}->${a.para}` === selecao.id) ?? null) : null;

  if (!fluxos) {
    return (
      <div data-testid="fluxo-screen" style={telaEstilo}>
        <div style={{ padding: 24 }}>{erro ?? "carregando…"}</div>
      </div>
    );
  }

  return (
    <div data-testid="fluxo-screen" style={telaEstilo}>
      <header style={cabecalhoEstilo}>
        <strong style={{ fontSize: 14 }}>Fluxos de integração</strong>
        <span style={{ fontSize: 12, color: "var(--texto-fraco)" }}>
          o encanamento da ferramenta — não o desenho do seu sistema · time: {timeAtivo}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={{ ...botao, background: "var(--acento-gente)", color: "#fff", border: "1px solid var(--acento-gente)" }}>
          Voltar à mesa de projeto
        </button>
      </header>

      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 16px", borderBottom: "1px solid var(--borda)", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
          Fluxo
          <select
            value={fluxoId ?? ""}
            onChange={(e) => {
              setFluxoId(e.target.value || null);
              setSelecao(null);
              setRastro(null);
            }}
            data-testid="seletor-de-fluxo"
            style={campo}
          >
            {fluxos.length === 0 && <option value="">— nenhum ainda —</option>}
            {fluxos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        {podeEditar && (
          <>
            <input
              value={novoFluxoNome}
              onChange={(e) => setNovoFluxoNome(e.target.value)}
              placeholder="nome do fluxo novo"
              aria-label="Nome do fluxo novo"
              style={campo}
            />
            <button
              data-testid="criar-fluxo"
              disabled={!novoFluxoNome.trim()}
              onClick={() => {
                const nome = novoFluxoNome.trim();
                const id = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `fluxo-${fluxos.length + 1}`;
                if (fluxos.some((f) => f.id === id)) {
                  setErro(`já existe um fluxo com o id "${id}"`);
                  return;
                }
                setFluxos([...fluxos, FLUXO_VAZIO(id, nome)]);
                setFluxoId(id);
                setNovoFluxoNome("");
              }}
              style={botao}
            >
              + Novo fluxo
            </button>
            <span style={{ width: 12 }} />
            <select value={novoConector} onChange={(e) => setNovoConector(e.target.value)} aria-label="Conector da paleta" style={campo}>
              <option value="">+ conector…</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <button
              data-testid="adicionar-no-conector"
              disabled={!fluxo || !novoConector}
              onClick={() => {
                adicionarNo("conector", novoConector);
                setNovoConector("");
              }}
              style={botao}
            >
              Adicionar
            </button>
            <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} aria-label="Agente da paleta" style={campo}>
              <option value="">+ agente…</option>
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <button
              data-testid="adicionar-no-agente"
              disabled={!fluxo || !novoPapel}
              onClick={() => {
                adicionarNo("agente", novoPapel);
                setNovoPapel("");
              }}
              style={botao}
            >
              Adicionar
            </button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button data-testid="salvar-fluxos" onClick={() => void salvar()} disabled={!podeEditar || salvando} style={botao}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          data-testid="executar-fluxo"
          onClick={() => void executar()}
          disabled={!fluxo || !!ciclo || executando || !podeEditar}
          style={{ ...botao, background: "var(--acento)", color: "#fff", border: "1px solid var(--acento)" }}
        >
          {executando ? "Executando…" : "Executar"}
        </button>
      </div>

      {ciclo && (
        <div data-testid="aviso-de-ciclo" style={avisoEstilo}>
          Não é possível executar ainda — {mensagemDeCiclo(ciclo)}
        </div>
      )}
      {erro && (
        <div data-testid="erro-do-fluxo" style={avisoEstilo}>
          {erro}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          {fluxo ? (
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={TIPOS_DE_NO}
                onNodeClick={(_e, node) => setSelecao({ tipo: "no", id: node.id })}
                onEdgeClick={(_e, edge) => setSelecao({ tipo: "aresta", id: edge.id })}
                onPaneClick={() => setSelecao(null)}
                onNodeDragStop={(_e, node) =>
                  mudarFluxo((f) => ({
                    ...f,
                    nos: f.nos.map((no) => (no.id === node.id ? { ...no, posicao: { x: node.position.x, y: node.position.y } } : no)),
                  }))
                }
                onConnect={(conexao) => {
                  if (!conexao.source || !conexao.target || !podeEditar) return;
                  mudarFluxo((f) =>
                    f.arestas.some((a) => a.de === conexao.source && a.para === conexao.target)
                      ? f
                      : { ...f, arestas: [...f.arestas, { de: conexao.source!, para: conexao.target!, mapeamento: [] }] }
                  );
                  setSelecao({ tipo: "aresta", id: `${conexao.source}->${conexao.target}` });
                }}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background />
                <Controls />
              </ReactFlow>
            </ReactFlowProvider>
          ) : (
            <div style={{ padding: 24, fontSize: 12.5, color: "var(--texto-fraco)" }}>
              Crie um fluxo para começar: a paleta nasce do catálogo de conectores e dos papéis da esteira.
            </div>
          )}
        </div>

        {(noSelecionado || arestaSelecionada || rastro) && (
          <aside style={painelEstilo}>
            {noSelecionado && (
              <PainelDoNo
                no={noSelecionado}
                catalogo={catalogo}
                podeEditar={podeEditar}
                onMudar={(mudanca) =>
                  mudarFluxo((f) => ({ ...f, nos: f.nos.map((n) => (n.id === noSelecionado.id ? { ...n, ...mudanca } : n)) }))
                }
                onRemover={() =>
                  mudarFluxo((f) => ({
                    ...f,
                    nos: f.nos.filter((n) => n.id !== noSelecionado.id),
                    arestas: f.arestas.filter((a) => a.de !== noSelecionado.id && a.para !== noSelecionado.id),
                  }))
                }
              />
            )}
            {arestaSelecionada && fluxo && (
              <PainelDaAresta
                aresta={arestaSelecionada}
                fluxo={fluxo}
                catalogo={catalogo}
                podeEditar={podeEditar}
                onMudar={(mapeamento) =>
                  mudarFluxo((f) => ({
                    ...f,
                    arestas: f.arestas.map((a) =>
                      a.de === arestaSelecionada.de && a.para === arestaSelecionada.para ? { ...a, mapeamento } : a
                    ),
                  }))
                }
                onRemover={() =>
                  mudarFluxo((f) => ({
                    ...f,
                    arestas: f.arestas.filter((a) => !(a.de === arestaSelecionada.de && a.para === arestaSelecionada.para)),
                  }))
                }
              />
            )}
            {rastro && (
              <div data-testid="rastro-da-execucao">
                <strong style={{ fontSize: 12.5 }}>Execução</strong>
                <div style={{ fontSize: 10.5, color: "var(--texto-fraco)" }}>fluxo {rastro.hash}</div>
                {rastro.nos.map((n) => (
                  <div key={n.noId} data-testid={`rastro-${n.noId}`} style={{ marginTop: 8, fontSize: 12 }}>
                    <span
                      style={{
                        color:
                          n.estado === "sucesso" ? "var(--verde)" : n.estado === "falhou" ? "var(--vermelho)" : "var(--texto-fraco)",
                      }}
                    >
                      {n.estado === "sucesso" ? "✓" : n.estado === "falhou" ? "✕" : "○"} {n.noId}
                    </span>
                    <span style={{ color: "var(--texto-fraco)" }}> · {n.duracaoMs}ms</span>
                    {n.erro && <div style={{ color: "var(--vermelho)", fontSize: 11.5 }}>{n.erro}</div>}
                    {rastro.saidas[n.noId] && (
                      <pre style={saidaEstilo}>{JSON.stringify(rastro.saidas[n.noId], null, 2).slice(0, 1200)}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function PainelDoNo({
  no,
  catalogo,
  podeEditar,
  onMudar,
  onRemover,
}: {
  no: NoDoFluxo;
  catalogo: ConectorDoCatalogo[];
  podeEditar: boolean;
  onMudar: (mudanca: Partial<NoDoFluxo>) => void;
  onRemover: () => void;
}) {
  const conector = no.tipo === "conector" ? catalogo.find((c) => c.id === no.refId) : undefined;
  return (
    <div data-testid="painel-do-no">
      <strong style={{ fontSize: 12.5 }}>{no.id}</strong>
      <div style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "4px 0 8px" }}>
        {no.tipo === "conector" ? "Conector do catálogo" : "Papel da esteira"} · {no.refId}
      </div>
      {conector && conector.entrada.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: "var(--texto-fraco)", marginBottom: 4 }}>
            Valores fixos (o que não vier de aresta):
          </div>
          {conector.entrada.map((campoDoConector) => (
            <label key={campoDoConector.chave} style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
              {campoDoConector.rotulo}
              {campoDoConector.obrigatorio ? " *" : ""}
              <input
                disabled={!podeEditar}
                value={String(no.parametros[campoDoConector.chave] ?? "")}
                onChange={(e) =>
                  onMudar({
                    parametros: e.target.value
                      ? { ...no.parametros, [campoDoConector.chave]: e.target.value }
                      : Object.fromEntries(Object.entries(no.parametros).filter(([k]) => k !== campoDoConector.chave)),
                  })
                }
                style={campo}
              />
            </label>
          ))}
        </>
      )}
      {no.tipo === "agente" && (
        <p style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
          As entradas de um agente vêm das arestas — o mapeamento diz o que ele recebe (§9.3: sem entrada, ele não roda).
        </p>
      )}
      {podeEditar && (
        <button onClick={onRemover} style={{ ...botao, marginTop: 8 }}>
          Remover nó
        </button>
      )}
    </div>
  );
}

function PainelDaAresta({
  aresta,
  fluxo,
  catalogo,
  podeEditar,
  onMudar,
  onRemover,
}: {
  aresta: ArestaDoFluxo;
  fluxo: Fluxo;
  catalogo: ConectorDoCatalogo[];
  podeEditar: boolean;
  onMudar: (mapeamento: ArestaDoFluxo["mapeamento"]) => void;
  onRemover: () => void;
}) {
  const origem = fluxo.nos.find((n) => n.id === aresta.de);
  const destino = fluxo.nos.find((n) => n.id === aresta.para);
  // O que a ORIGEM sabe entregar: a `saida` declarada do conector, ou o
  // `texto` de um agente. É a fatia A alimentando a C — sem forma declarada,
  // este select não teria opções, e a aresta não teria o que carregar (§3.2).
  const saidasDaOrigem =
    origem?.tipo === "conector" ? (catalogo.find((c) => c.id === origem.refId)?.saida.map((s) => s.chave) ?? []) : ["texto"];
  const entradasDoDestino =
    destino?.tipo === "conector" ? (catalogo.find((c) => c.id === destino.refId)?.entrada.map((s) => s.chave) ?? []) : null;

  return (
    <div data-testid="painel-da-aresta">
      <strong style={{ fontSize: 12.5 }}>
        {aresta.de} → {aresta.para}
      </strong>
      <p style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "4px 0 8px" }}>
        O mapeamento é o que faz a aresta carregar DADO, não só ordem: de qual saída para qual entrada.
      </p>
      {aresta.mapeamento.map((par, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <select
            disabled={!podeEditar}
            value={par.saida}
            aria-label={`Saída do par ${i + 1}`}
            onChange={(e) => onMudar(aresta.mapeamento.map((p, j) => (j === i ? { ...p, saida: e.target.value } : p)))}
            style={{ ...campo, flex: 1 }}
          >
            <option value="">saída…</option>
            {saidasDaOrigem.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11 }}>→</span>
          {entradasDoDestino ? (
            <select
              disabled={!podeEditar}
              value={par.entrada}
              aria-label={`Entrada do par ${i + 1}`}
              onChange={(e) => onMudar(aresta.mapeamento.map((p, j) => (j === i ? { ...p, entrada: e.target.value } : p)))}
              style={{ ...campo, flex: 1 }}
            >
              <option value="">entrada…</option>
              {entradasDoDestino.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input
              disabled={!podeEditar}
              value={par.entrada}
              aria-label={`Entrada do par ${i + 1}`}
              placeholder="nome no prompt"
              onChange={(e) => onMudar(aresta.mapeamento.map((p, j) => (j === i ? { ...p, entrada: e.target.value } : p)))}
              style={{ ...campo, flex: 1 }}
            />
          )}
          {podeEditar && (
            <button onClick={() => onMudar(aresta.mapeamento.filter((_p, j) => j !== i))} style={botaoMiudo}>
              ×
            </button>
          )}
        </div>
      ))}
      {podeEditar && (
        <div style={{ display: "flex", gap: 8 }}>
          <button data-testid="adicionar-mapeamento" onClick={() => onMudar([...aresta.mapeamento, { saida: "", entrada: "" }])} style={botaoMiudo}>
            + par
          </button>
          <button onClick={onRemover} style={botaoMiudo}>
            Remover aresta
          </button>
        </div>
      )}
    </div>
  );
}

const telaEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--painel)",
  zIndex: 55,
  display: "flex",
  flexDirection: "column",
  fontFamily: "system-ui, sans-serif",
  color: "var(--texto)",
};

const cabecalhoEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderBottom: "1px solid var(--borda)",
};

const painelEstilo: React.CSSProperties = {
  width: 320,
  borderLeft: "1px solid var(--borda)",
  padding: 14,
  overflow: "auto",
  background: "var(--painel)",
};

const avisoEstilo: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12.5,
  color: "var(--vermelho)",
  borderBottom: "1px solid var(--borda)",
};

const saidaEstilo: React.CSSProperties = {
  fontSize: 10.5,
  background: "var(--fundo)",
  border: "1px solid var(--borda)",
  borderRadius: 6,
  padding: 8,
  overflow: "auto",
  maxHeight: 160,
  margin: "4px 0 0",
};

const campo: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const botao: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoMiudo: React.CSSProperties = { ...botao, fontSize: 11.5, padding: "3px 8px" };

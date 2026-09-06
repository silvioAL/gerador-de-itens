import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NodeCard, type NodeCardData } from "../canvas/NodeCard";
import { comoNoDaMesa, configDoFluxo } from "./vocabularioDoFluxo";
import {
  FUNCOES_DO_SISTEMA,
  funcaoDoSistema,
  PROJETO_DO_SISTEMA,
  REF_DO_PROJETO,
  sanearCamposDaTransformacao,
  avisosDeMapeamento,
  mensagemDeCiclo,
  NOME_DA_OPERACAO,
  OPERACOES_DO_GATEWAY,
  planoDoFluxo,
  type ArestaDoFluxo,
  type Fluxo,
  type NoDoFluxo,
  type OperacaoDoGateway,
} from "@gerador/aplicacao";
import {
  apiCatalogoDeConectores,
  apiExecucaoDeFluxo,
  apiFluxos,
  apiFluxosEmVigor,
  apiPipelineAgentes,
  type ConectorDoCatalogo,
  type EventoDaExecucao,
  type FluxoEmVigor,
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

/**
 * SPEC-107 fatia D — o fluxo renderiza com o MESMO cartão da mesa (§2.2):
 * paridade de LINGUAGEM, dirigida por um `DiagramaConfig` próprio (uma
 * família por tipo, cores e ícones travados por teste nos dois temas). O
 * refId técnico saiu do cartão de vez (§2.4-1) — ele vive no painel.
 */
const TIPOS_DE_NO = { noDeFluxo: NodeCard };
const CONFIG_DO_FLUXO = configDoFluxo();

const FLUXO_VAZIO = (id: string, nome: string): FluxoEmVigor => ({ id, nome, nos: [], arestas: [], origem: "declarado" });

export function FluxoScreen({ timeAtivo, onFechar }: { timeAtivo: string; onFechar: () => void }) {
  const permissoes = usePermissoes({ hospedado: true, timeId: timeAtivo });
  const podeEditar = permissoes.pode("fluxos", "editar");
  // §369 — editar o PAPEL de dentro do fluxo é editar a esteira: a permissão
  // é a dela, não a de fluxos.
  const podeEditarPapel = permissoes.pode("pipeline-agentes", "editar");

  const [catalogo, setCatalogo] = useState<ConectorDoCatalogo[]>([]);
  const [papeis, setPapeis] = useState<PapelConfigurado[]>([]);
  const [fluxos, setFluxos] = useState<FluxoEmVigor[] | null>(null);
  const [fluxoId, setFluxoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [rastro, setRastro] = useState<{
    nos: RastroDoNoExecutado[];
    saidas: Record<string, Record<string, unknown>>;
    hash: string;
    execucaoId?: string;
    /** SPEC-107 fatia C — a execução suspendeu no gate deste nó. */
    aguardandoEm?: string;
  } | null>(null);
  /** SPEC-107 fatia D — o vivo (§2.4-9): que nó está rodando agora, e o
   * texto que o agente já escreveu, por nó. */
  const [vivo, setVivo] = useState<{ rodando: string | null; textos: Record<string, string> } | null>(null);
  const [selecao, setSelecao] = useState<{ tipo: "no" | "aresta"; id: string } | null>(null);
  const [novoFluxoNome, setNovoFluxoNome] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [vigor, pipeline, emVigor] = await Promise.all([
          apiCatalogoDeConectores.listar(),
          apiPipelineAgentes.obter(timeAtivo),
          // SPEC-106 — o EM VIGOR: os declarados + a esteira DERIVADA dos
          // papéis. Abrir a tela num time novo já mostra o pipeline desenhado.
          apiFluxosEmVigor.listar(timeAtivo),
        ]);
        setCatalogo(vigor.conectores);
        setPapeis(pipeline.papeis ?? []);
        const lidos = emVigor.fluxos;
        // A tela abre NO CANVAS, sempre (referência: n8n) — sem fluxo salvo,
        // nasce um rascunho pronto para receber nós; ele só persiste no Salvar.
        if (lidos.length === 0) {
          setFluxos([FLUXO_VAZIO("fluxo-1", "Fluxo 1")]);
          setFluxoId("fluxo-1");
        } else {
          setFluxos(lidos);
          setFluxoId(lidos[0].id);
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [timeAtivo]);

  const fluxo = useMemo(() => fluxos?.find((f) => f.id === fluxoId) ?? null, [fluxos, fluxoId]);
  // Fluxo de fábrica é DERIVADO — editar exige uma cópia (que vence a fábrica
  // no mesmo id), como um conector declarado vence um destino.
  const editavel = podeEditar && fluxo?.origem === "declarado";

  // O ciclo é conferido a cada edição, com a MESMA mensagem do desenho (§4.4).
  const ciclo = useMemo(() => (fluxo ? planoDoFluxo(fluxo).ciclo : undefined), [fluxo]);

  /** SPEC-107 fatia F — a forma declarada de cada lado da aresta, quando há.
   * Agente e transformação não declaram tipos — ausência não é incompatível. */
  const contratoDoNo = useCallback(
    (no: NoDoFluxo) => {
      if (no.tipo === "conector") {
        const conector = catalogo.find((c) => c.id === no.refId);
        return conector ? { entrada: conector.entrada, saida: conector.saida } : null;
      }
      if (no.tipo === "funcao") {
        const funcao = funcaoDoSistema(no.refId);
        return funcao ? { entrada: funcao.entrada, saida: funcao.saida } : null;
      }
      if (no.tipo === "projeto") return { entrada: PROJETO_DO_SISTEMA.entrada, saida: PROJETO_DO_SISTEMA.saida };
      return null;
    },
    [catalogo]
  );
  const avisosDoMapeamento = useMemo(
    () => (fluxo ? avisosDeMapeamento(fluxo, contratoDoNo) : []),
    [fluxo, contratoDoNo]
  );

  /** Fatia F — as chaves de saída com semântica de DOCUMENTO deste nó: é o
   * que o rastro renderiza como texto corrido (preview), não como JSON. */
  const chavesDeDocumento = useCallback(
    (n: { tipo: string; refId: string }): string[] =>
      (contratoDoNo(n as NoDoFluxo)?.saida ?? []).filter((c) => c.tipo === "documento").map((c) => c.chave),
    [contratoDoNo]
  );

  function mudarFluxo(mudar: (f: FluxoEmVigor) => FluxoEmVigor) {
    if (!fluxoId) return;
    setFluxos((lista) => (lista ?? []).map((f) => (f.id === fluxoId ? mudar(f) : f)));
    setRastro(null);
  }

  const rotuloDoRef = useCallback(
    (no: Pick<NoDoFluxo, "tipo" | "refId" | "componente">) => {
      if (!no.refId) return no.componente && no.componente !== "livre" ? NOME_DA_OPERACAO[no.componente] : "(escolha o adaptador)";
      if (no.tipo === "funcao") return funcaoDoSistema(no.refId)?.nome ?? no.refId;
      if (no.tipo === "projeto") return PROJETO_DO_SISTEMA.nome;
      if (no.tipo === "transformacao") {
        // O cartão diz O QUE ela produz — as chaves de saída declaradas.
        const campos = sanearCamposDaTransformacao((no as NoDoFluxo).parametros?.campos);
        return campos.length > 0 ? campos.map((c) => c.chave).join(", ") : "(declare os campos)";
      }
      return no.tipo === "conector"
        ? (catalogo.find((c) => c.id === no.refId)?.nome ?? no.refId)
        : (papeis.find((p) => p.id === no.refId)?.nome ?? no.refId);
    },
    [catalogo, papeis]
  );

  const nodes: Node<NodeCardData>[] = useMemo(
    () =>
      (fluxo?.nos ?? []).map((no) => ({
        id: no.id,
        type: "noDeFluxo",
        position: no.posicao,
        // O tamanho INICIAL (o do cartão em repouso): é o que o `fitView`
        // usa se rodar antes de o ResizeObserver medir — sem isso, sob carga,
        // o enquadramento calculado sobre nós de tamanho zero mandava o
        // viewport para o nada (canvas e minimapa vazios; flake medido).
        initialWidth: 190,
        initialHeight: 76,
        selected: selecao?.tipo === "no" && selecao.id === no.id,
        // O vivo é feedback: o nó que está rodando PULSA (§2.4-9).
        ...(vivo?.rodando === no.id ? { className: "no-do-fluxo-rodando" } : {}),
        data: {
          no: comoNoDaMesa(no, rotuloDoRef(no)),
          config: CONFIG_DO_FLUXO,
          arestas: [],
        } satisfies NodeCardData,
      })),
    [fluxo, selecao, rotuloDoRef, vivo?.rodando]
  );

  const edges: Edge[] = useMemo(
    () =>
      (fluxo?.arestas ?? []).map((a) => ({
        id: `${a.de}->${a.para}`,
        source: a.de,
        target: a.para,
        // O NodeCard tem quatro pontos por lado; a fiação continua lendo da
        // esquerda para a direita, como sempre foi.
        sourceHandle: "source-right",
        targetHandle: "target-left",
        selected: selecao?.tipo === "aresta" && selecao.id === `${a.de}->${a.para}`,
        // A aresta que ALIMENTA o nó rodando anima o dado passando (§2.4-9).
        animated: vivo?.rodando === a.para,
        // Aresta sem mapeamento é decoração — e a tela diz isso na etiqueta.
        label: a.mapeamento.length > 0 ? a.mapeamento.map((m) => `${m.saida}→${m.entrada}`).join(", ") : "sem mapeamento",
        style: { stroke: "var(--texto-mudo)" },
        labelStyle: { fill: "var(--texto-2)", fontSize: 10 },
        labelBgStyle: { fill: "var(--painel)" },
      })),
    [fluxo, selecao, vivo?.rodando]
  );

  /**
   * §368 — a paleta fala a língua da MESA: componentes (o tipo abstrato) e
   * adaptadores (o endereço/papel concreto, escolhido nas propriedades). O nó
   * nasce do componente; quando só existe UM adaptador compatível, ele já vem
   * escolhido — quando há vários (ou nenhum), o painel pede.
   */
  function adicionarComponente(tipo: NoDoFluxo["tipo"], componente: OperacaoDoGateway | "livre" | "agente") {
    const compativeis =
      tipo === "agente"
        ? papeis.filter((p) => p.ativo).map((p) => p.id)
        : catalogo.filter((c) => (componente === "livre" ? !c.operacao : c.operacao === componente)).map((c) => c.id);
    const refId = compativeis.length === 1 ? compativeis[0] : "";
    const base = componente === "agente" ? "agente" : componente === "livre" ? "chamada" : componente;
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `${base}-${n}`)) n++;
      const id = `${base}-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          {
            id,
            tipo,
            refId,
            posicao: { x: 80 + f.nos.length * 60, y: 80 + f.nos.length * 40 },
            parametros: {},
            ...(tipo === "conector" && componente !== "agente" ? { componente } : {}),
          },
        ],
      };
    });
  }

  /**
   * SPEC-107 fatia A — a FUNÇÃO entra pela paleta como os componentes, mas o
   * nó já nasce com o `refId`: o registro é fechado e a função É a capacidade
   * — não há adaptador a escolher (§2.4-10: escolha só quando há escolha).
   */
  function adicionarFuncao(funcaoId: string) {
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `${funcaoId}-${n}`)) n++;
      const id = `${funcaoId}-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          { id, tipo: "funcao", refId: funcaoId, posicao: { x: 80 + f.nos.length * 60, y: 80 + f.nos.length * 40 }, parametros: {} },
        ],
      };
    });
  }

  /** SPEC-107 fatia E — a transformação nasce vazia e o Salvar cobra os
   * campos (a mesma régua do nó sem adaptador): declarar o que sai é o que a
   * torna uma transformação. */
  function adicionarTransformacao() {
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `transformacao-${n}`)) n++;
      const id = `transformacao-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          { id, tipo: "transformacao", refId: "transformacao", posicao: { x: 80 + f.nos.length * 60, y: 80 + f.nos.length * 40 }, parametros: { campos: [] } },
        ],
      };
    });
  }

  /** SPEC-107 fatia B — o projeto também nasce pronto: o refId é o próprio
   * "projeto"; a demanda é o parâmetro `demandaId` (vazio = a ativa). */
  function adicionarProjeto() {
    mudarFluxo((f) => {
      let n = 1;
      while (f.nos.some((no) => no.id === `projeto-${n}`)) n++;
      const id = `projeto-${n}`;
      setSelecao({ tipo: "no", id });
      return {
        ...f,
        nos: [
          ...f.nos,
          { id, tipo: "projeto", refId: REF_DO_PROJETO, posicao: { x: 80 + f.nos.length * 60, y: 80 + f.nos.length * 40 }, parametros: {} },
        ],
      };
    });
  }

  /**
   * §369 — o mesmo dado, editado de onde se vê (a régua do §260): o painel do
   * nó-agente grava NO documento da esteira (`pipeline-agentes`), por
   * read-modify-write do papel — a aba Pipeline de IA continua sendo o
   * catálogo, e as duas superfícies leem a mesma verdade.
   */
  async function salvarPapel(refId: string, mudanca: { nome: string; descricao: string; preambulo: string }) {
    setErro(null);
    try {
      const cfg = await apiPipelineAgentes.obter(timeAtivo);
      const papeisNovos = (cfg.papeis ?? []).map((p) =>
        p.id === refId
          ? {
              ...p,
              nome: mudanca.nome.trim() || p.nome,
              descricao: mudanca.descricao.trim() || undefined,
              preambulo: mudanca.preambulo.trim() || undefined,
            }
          : p
      );
      await apiPipelineAgentes.salvar({ ...cfg, papeis: papeisNovos }, timeAtivo);
      setPapeis(papeisNovos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function salvar() {
    if (!fluxos) return;
    setSalvando(true);
    setErro(null);
    try {
      // Só os DECLARADOS persistem: a esteira derivada continua nascendo da
      // configuração dos papéis — salvar uma cópia dela congelaria o desenho.
      await apiFluxos.salvar(
        { fluxos: fluxos.filter((f) => f.origem === "declarado").map(({ origem: _origem, ...f }) => f) },
        timeAtivo
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * SPEC-107 fatia C — o gate sobrevive a F5 e a outra máquina: ao abrir um
   * fluxo, a execução SUSPENSA mais recente reaparece com o stage persistido,
   * esperando quem revisa continuar ou descartar.
   */
  useEffect(() => {
    if (!fluxoId || fluxoId === "fluxo-1") return;
    void apiExecucaoDeFluxo
      .execucoes(fluxoId)
      .then(({ execucoes }) => {
        const pendente = execucoes[0];
        if (pendente?.estado !== "aguardando-confirmacao") return;
        const gate = [...pendente.nos].reverse().find((n) => n.estado === "sucesso");
        setRastro({
          nos: pendente.nos,
          saidas: pendente.saidas ?? {},
          hash: pendente.hash,
          execucaoId: pendente.id,
          aguardandoEm: gate?.noId,
        });
      })
      .catch(() => undefined);
  }, [fluxoId]);

  /** SPEC-107 fatia D — o que cada evento do stream faz na tela: o nó que
   * começou pulsa, o texto do agente cresce, o que terminou entra no rastro. */
  const aoEvento = useCallback((evento: EventoDaExecucao) => {
    if (evento.tipo === "no-comecou") {
      setVivo((v) => ({ rodando: evento.noId, textos: v?.textos ?? {} }));
    } else if (evento.tipo === "texto") {
      setVivo((v) => ({
        rodando: v?.rodando ?? evento.noId,
        textos: { ...(v?.textos ?? {}), [evento.noId]: `${v?.textos?.[evento.noId] ?? ""}${evento.pedaco}` },
      }));
    } else if (evento.tipo === "no-terminou") {
      setVivo((v) => ({ rodando: null, textos: v?.textos ?? {} }));
      setRastro((r) => ({
        nos: [...(r?.nos ?? []), evento.rastro],
        saidas: r?.saidas ?? {},
        hash: r?.hash ?? "",
        execucaoId: r?.execucaoId,
      }));
    }
  }, []);

  async function continuarExecucao() {
    if (!rastro?.execucaoId) return;
    setExecutando(true);
    setErro(null);
    try {
      const resultado = await apiExecucaoDeFluxo.continuarAoVivo(rastro.execucaoId, aoEvento);
      setRastro({
        nos: resultado.nos,
        saidas: resultado.saidas,
        hash: resultado.hash,
        execucaoId: resultado.execucaoId,
        aguardandoEm: resultado.aguardandoEm,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setExecutando(false);
      setVivo(null);
    }
  }

  async function descartarExecucao() {
    if (!rastro?.execucaoId) return;
    setErro(null);
    try {
      await apiExecucaoDeFluxo.descartar(rastro.execucaoId);
      setRastro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function executar(ateNo?: string) {
    if (!fluxo) return;
    setExecutando(true);
    setErro(null);
    setRastro(null);
    try {
      // O que roda é o que está SALVO — executar rascunho seria rastro
      // mentindo. Só os DECLARADOS, como no Salvar: gravar a esteira derivada
      // junto a congelaria como cópia que ninguém pediu (§365) — defeito real,
      // pego pela corrida de dois specs no mesmo documento (SPEC-107 fatia A).
      await apiFluxos.salvar(
        { fluxos: fluxos!.filter((f) => f.origem === "declarado").map(({ origem: _origem, ...f }) => f) },
        timeAtivo
      );
      // Fatia D — a execução é ASSISTÍVEL: os eventos chegam nó a nó e a
      // resposta final é a mesma do modo one-shot.
      const resultado = await apiExecucaoDeFluxo.executarAoVivo(fluxo.id, timeAtivo, ateNo, aoEvento);
      setRastro({
        nos: resultado.nos,
        saidas: resultado.saidas,
        hash: resultado.hash,
        execucaoId: resultado.execucaoId,
        aguardandoEm: resultado.aguardandoEm,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setExecutando(false);
      setVivo(null);
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
              // Re-selecionar o MESMO fluxo não é troca: zerar o rastro aqui
              // apagava o gate recém-carregado do servidor (fatia C).
              if (e.target.value === fluxoId) return;
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
                {f.origem === "fabrica" ? " · derivado" : ""}
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
            {/* §368 — a paleta fala a língua da MESA: componentes, não
                instâncias. O adaptador (o endereço/papel concreto) se escolhe
                nas propriedades do nó — o hexagonal da casa, na tela. */}
            {OPERACOES_DO_GATEWAY.map((op) => (
              <button key={op} data-testid={`add-${op}`} disabled={!editavel} onClick={() => adicionarComponente("conector", op)} style={botao}>
                + {NOME_DA_OPERACAO[op]}
              </button>
            ))}
            <button data-testid="add-agente" disabled={!editavel} onClick={() => adicionarComponente("agente", "agente")} style={botao}>
              + Agente
            </button>
            <button data-testid="add-livre" disabled={!editavel} onClick={() => adicionarComponente("conector", "livre")} style={botao}>
              + Chamada externa
            </button>
            {/* SPEC-107 fatia A — as funções do SISTEMA na paleta: o motor com
                contrato declarado, pelo registro fechado (rótulo genérico,
                §2.3 — "engine"/"derivar" não aparecem na tela). */}
            {FUNCOES_DO_SISTEMA.map((f) => (
              <button key={f.id} data-testid={`add-funcao-${f.id}`} disabled={!editavel} onClick={() => adicionarFuncao(f.id)} style={botao}>
                + {f.nome}
              </button>
            ))}
            {/* SPEC-107 fatia B — a demanda como capacidade, nas duas direções. */}
            <button data-testid="add-projeto" disabled={!editavel} onClick={adicionarProjeto} style={botao}>
              + {PROJETO_DO_SISTEMA.nome}
            </button>
            {/* SPEC-107 fatia E — a transformação pura (o Set do n8n). */}
            <button data-testid="add-transformacao" disabled={!editavel} onClick={adicionarTransformacao} style={botao}>
              + Transformação
            </button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button data-testid="salvar-fluxos" onClick={() => void salvar()} disabled={!podeEditar || salvando} style={botao}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          data-testid="executar-fluxo"
          onClick={() => void executar(undefined)}
          disabled={!fluxo || !!ciclo || executando || !podeEditar}
          style={{ ...botao, background: "var(--acento)", color: "#fff", border: "1px solid var(--acento)" }}
        >
          {executando ? "Executando…" : "Executar"}
        </button>
      </div>

      {fluxo?.origem === "fabrica" && (
        <div data-testid="fluxo-derivado" style={{ ...avisoEstilo, color: "var(--texto-2)" }}>
          Este fluxo é DERIVADO da configuração ({fluxo.id === "esteira-de-agentes" ? "os papéis da esteira, na ordem deles" : "da configuração"}) —
          mudar lá muda aqui sozinho. Para fiar por conta própria,{" "}
          <button
            data-testid="editar-copia"
            onClick={() =>
              mudarFluxo((f) => ({
                ...(f as FluxoEmVigor),
                origem: "declarado",
                nome: f.nome.replace(" (da configuração)", " (cópia)"),
              }))
            }
            style={{ ...botaoMiudo, pointerEvents: "auto" }}
          >
            editar uma cópia
          </button>{" "}
          — a cópia vence a derivada no mesmo id.
        </div>
      )}
      {ciclo && (
        <div data-testid="aviso-de-ciclo" style={avisoEstilo}>
          Não é possível executar ainda — {mensagemDeCiclo(ciclo)}
        </div>
      )}
      {/* SPEC-107 fatia F — AVISO, não bloqueio (§230: bloquear cedo ensina a
          ignorar a cor): o tipo declarado dos dois lados não combina, e quem
          fia decide sabendo. */}
      {avisosDoMapeamento.length > 0 && (
        <div data-testid="aviso-de-mapeamento" style={{ ...avisoEstilo, color: "var(--texto-2)" }}>
          ⚠ Mapeamento com tipos que não combinam (a execução continua possível):{" "}
          {avisosDoMapeamento.map((a) => a.texto).join(" · ")}
        </div>
      )}
      {erro && (
        <div data-testid="erro-do-fluxo" style={avisoEstilo}>
          {erro}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative" }}>
          {fluxo && fluxo.nos.length === 0 && (
            <div style={dicaVaziaEstilo}>
              Adicione um <strong>conector</strong> ou um <strong>agente</strong> pela paleta acima e ligue-os —
              a aresta carrega o dado (saída → entrada), como no n8n.
            </div>
          )}
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
                nodesDraggable={editavel}
                nodesConnectable={editavel}
                onConnect={(conexao) => {
                  if (!conexao.source || !conexao.target || !editavel) return;
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
                {/* As mesmas cores do canvas da mesa: os dois grafos são
                    superfícies diferentes, mas a casa é uma — e o bgColor é o
                    que impede o minimapa de ficar um retângulo branco no
                    tema escuro (a lição do §351 da mesa, repetida aqui). */}
                <Background color="var(--borda)" gap={26} size={1.4} />
                <Controls />
                <MiniMap
                  pannable
                  zoomable
                  bgColor="var(--painel)"
                  maskColor="var(--mascara-minimapa)"
                  nodeColor="var(--texto-mudo)"
                />
              </ReactFlow>
            </ReactFlowProvider>
          ) : null}
        </div>

        {(noSelecionado || arestaSelecionada || rastro || vivo?.rodando) && (
          <aside style={painelEstilo}>
            {noSelecionado && (
              <PainelDoNo
                no={noSelecionado}
                catalogo={catalogo}
                papeis={papeis}
                podeEditar={editavel}
                podeEditarPapel={podeEditarPapel}
                onSalvarPapel={salvarPapel}
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
                podeEditar={editavel}
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
                {/* SPEC-107 fatia C (§5.5) — o GATE: a execução suspendeu e o
                    resto só roda quando alguém, revisando o stage, decidir. */}
                {rastro.aguardandoEm && (
                  <div
                    data-testid="gate-de-confirmacao"
                    style={{ margin: "8px 0", padding: 8, border: "1px solid var(--borda-forte)", borderRadius: 8, fontSize: 12 }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      ⏸ Aguardando confirmação no nó <strong>{rastro.aguardandoEm}</strong> — revise a saída abaixo e
                      decida. A decisão vale de qualquer máquina: a execução está guardada no servidor.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        data-testid="continuar-execucao"
                        onClick={() => void continuarExecucao()}
                        disabled={!podeEditar || executando}
                        style={{ ...botaoMiudo, background: "var(--acento)", color: "#fff", border: "1px solid var(--acento)" }}
                      >
                        {executando ? "Continuando…" : "Continuar"}
                      </button>
                      <button data-testid="descartar-execucao" onClick={() => void descartarExecucao()} disabled={!podeEditar} style={botaoMiudo}>
                        Descartar
                      </button>
                    </div>
                  </div>
                )}
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
                    {/* SPEC-106 fatia A — o link do que SUBIU, clicável. */}
                    {n.linkExterno && (
                      <div style={{ fontSize: 11.5 }}>
                        <a href={n.linkExterno} target="_blank" rel="noreferrer" style={{ color: "var(--acento-texto, var(--acento))" }}>
                          ver o que subiu ↗
                        </a>
                      </div>
                    )}
                    {/* O artefato do agente é MARKDOWN — mostra como texto
                        corrido (o "antes de subir"), não como JSON. */}
                    {n.tipo === "agente" && typeof rastro.saidas[n.noId]?.texto === "string" ? (
                      <pre style={{ ...saidaEstilo, whiteSpace: "pre-wrap" }} data-testid={`artefato-${n.noId}`}>
                        {String(rastro.saidas[n.noId].texto).slice(0, 4000)}
                      </pre>
                    ) : (
                      rastro.saidas[n.noId] && (
                        <>
                          {/* Fatia F — campo com semântica de DOCUMENTO ganha
                              preview como texto corrido, não JSON (§2.1). */}
                          {chavesDeDocumento(n)
                            .filter((chave) => typeof rastro.saidas[n.noId][chave] === "string")
                            .map((chave) => (
                              <pre
                                key={chave}
                                style={{ ...saidaEstilo, whiteSpace: "pre-wrap" }}
                                data-testid={`documento-${n.noId}-${chave}`}
                              >
                                {String(rastro.saidas[n.noId][chave]).slice(0, 4000)}
                              </pre>
                            ))}
                          <pre style={saidaEstilo}>
                            {JSON.stringify(
                              Object.fromEntries(
                                Object.entries(rastro.saidas[n.noId]).filter(
                                  ([chave]) => !chavesDeDocumento(n).includes(chave) || typeof rastro.saidas[n.noId][chave] !== "string"
                                )
                              ),
                              null,
                              2
                            ).slice(0, 1200)}
                          </pre>
                        </>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* SPEC-107 fatia D — o nó RODANDO, ao vivo: o texto do agente
                cresce com o caret (a experiência da revisão), e antes do
                primeiro token os pontinhos respiram. */}
            {vivo?.rodando && (
              <div data-testid={`rastro-vivo-${vivo.rodando}`} style={{ marginTop: 8, fontSize: 12 }}>
                <span className="pip-pulsando" style={{ color: "var(--acento)" }}>
                  ⚡ {vivo.rodando} rodando…
                </span>
                {vivo.textos[vivo.rodando] ? (
                  <pre className="texto-ao-vivo" style={{ ...saidaEstilo, whiteSpace: "pre-wrap" }}>
                    {vivo.textos[vivo.rodando].slice(-4000)}
                  </pre>
                ) : (
                  <pre className="pensando-ao-vivo">●●●</pre>
                )}
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
  papeis,
  podeEditar,
  podeEditarPapel,
  onSalvarPapel,
  onMudar,
  onRemover,
}: {
  no: NoDoFluxo;
  catalogo: ConectorDoCatalogo[];
  papeis: PapelConfigurado[];
  podeEditar: boolean;
  podeEditarPapel: boolean;
  onSalvarPapel: (refId: string, mudanca: { nome: string; descricao: string; preambulo: string }) => Promise<void>;
  onMudar: (mudanca: Partial<NoDoFluxo>) => void;
  onRemover: () => void;
}) {
  const conector = no.tipo === "conector" ? catalogo.find((c) => c.id === no.refId) : undefined;
  // SPEC-107 fatia A — a função É a capacidade: contrato do registro fechado,
  // sem adaptador a escolher.
  const funcao = no.tipo === "funcao" ? funcaoDoSistema(no.refId) : undefined;
  const projeto = no.tipo === "projeto" ? PROJETO_DO_SISTEMA : undefined;
  const camposDaTransformacao =
    no.tipo === "transformacao" ? sanearCamposDaTransformacao(no.parametros?.campos) : null;
  // §368 — o COMPONENTE diz quais adaptadores servem: mesma operação para os
  // do gateway, endereço livre para "chamada externa", papéis para agente.
  const adaptadores =
    no.tipo === "agente"
      ? papeis.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }))
      : catalogo
          .filter((c) => (no.componente ? (no.componente === "livre" ? !c.operacao : c.operacao === no.componente) : true))
          .map((c) => ({ id: c.id, nome: c.nome }));
  return (
    <div data-testid="painel-do-no">
      <strong style={{ fontSize: 12.5 }}>{no.id}</strong>
      <div style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "4px 0 8px" }}>
        {no.tipo === "conector"
          ? (no.componente && no.componente !== "livre" ? NOME_DA_OPERACAO[no.componente] : "Chamada externa")
          : no.tipo === "funcao"
            ? `Função do sistema — ${funcao?.nome ?? no.refId}`
            : no.tipo === "projeto"
              ? "Projeto (a demanda, nas duas direções)"
              : no.tipo === "transformacao"
                ? "Transformação (pura — re-mapeia, extrai, concatena)"
                : "Agente"}
      </div>
      {no.tipo !== "funcao" && no.tipo !== "projeto" && no.tipo !== "transformacao" && (
        <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 8 }}>
          Adaptador ({no.tipo === "agente" ? "papel da esteira" : "endereço do catálogo"})
          <select
            data-testid="adaptador-do-no"
            disabled={!podeEditar}
            value={no.refId}
            onChange={(e) => onMudar({ refId: e.target.value })}
            style={campo}
          >
            <option value="">— escolha —</option>
            {adaptadores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <input
          type="checkbox"
          data-testid="aguardar-confirmacao"
          disabled={!podeEditar}
          checked={no.confirmacao === "aguardar"}
          onChange={(e) => onMudar({ confirmacao: e.target.checked ? "aguardar" : undefined })}
        />
        {/* §368, generalizado na fatia C (§5.5): o gate é CONFIGURAÇÃO do
            fluxo, não um botão de ocasião — todo Executar suspende ali, e a
            execução guardada espera alguém continuar ou descartar. */}
        Aguardar confirmação depois deste nó (o resto só roda quando alguém continuar)
      </label>
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
      {camposDaTransformacao && (
        <div data-testid="campos-da-transformacao" style={{ fontSize: 11.5, marginBottom: 8 }}>
          {/* §2.4-6 — o implícito em voz alta: cada campo diz de onde sai. */}
          <p style={{ color: "var(--texto-2)", margin: "0 0 6px" }}>
            Cada campo de saída vem de um <strong>modelo</strong> ("{"{entrada}"}" concatena o que chegou) ou de um{" "}
            <strong>caminho</strong> ("$.desenho.diagrama" extrai). Ausente não vira default — o nó falha com o nome
            (§9.3).
          </p>
          {camposDaTransformacao.map((campoDaLista, i) => (
            <div key={i} style={{ display: "grid", gap: 4, marginBottom: 8, padding: 6, border: "1px solid var(--borda)", borderRadius: 6 }}>
              <input
                aria-label={`Chave do campo ${i + 1}`}
                disabled={!podeEditar}
                value={campoDaLista.chave}
                placeholder="chave de saída"
                onChange={(e) =>
                  onMudar({
                    parametros: {
                      ...no.parametros,
                      campos: camposDaTransformacao.map((c, j) => (j === i ? { ...c, chave: e.target.value } : c)),
                    },
                  })
                }
                style={campo}
              />
              <input
                aria-label={`Modelo do campo ${i + 1}`}
                disabled={!podeEditar}
                value={campoDaLista.modelo ?? ""}
                placeholder='modelo — ex.: "RPS {rps} — pico {pico}"'
                onChange={(e) =>
                  onMudar({
                    parametros: {
                      ...no.parametros,
                      campos: camposDaTransformacao.map((c, j) =>
                        j === i ? { ...c, modelo: e.target.value || undefined } : c
                      ),
                    },
                  })
                }
                style={campo}
              />
              <input
                aria-label={`Caminho do campo ${i + 1}`}
                disabled={!podeEditar}
                value={campoDaLista.caminho ?? ""}
                placeholder='caminho — ex.: "$.desenho.diagrama"'
                onChange={(e) =>
                  onMudar({
                    parametros: {
                      ...no.parametros,
                      campos: camposDaTransformacao.map((c, j) =>
                        j === i ? { ...c, caminho: e.target.value || undefined } : c
                      ),
                    },
                  })
                }
                style={campo}
              />
              {podeEditar && (
                <button
                  onClick={() =>
                    onMudar({
                      parametros: { ...no.parametros, campos: camposDaTransformacao.filter((_c, j) => j !== i) },
                    })
                  }
                  style={botaoMiudo}
                >
                  Remover campo
                </button>
              )}
            </div>
          ))}
          {podeEditar && (
            <button
              data-testid="adicionar-campo-da-transformacao"
              onClick={() =>
                onMudar({
                  parametros: { ...no.parametros, campos: [...camposDaTransformacao, { chave: `campo${camposDaTransformacao.length + 1}` }] },
                })
              }
              style={botaoMiudo}
            >
              + campo de saída
            </button>
          )}
        </div>
      )}
      {projeto && (
        <div data-testid="contrato-do-projeto" style={{ fontSize: 11.5, marginBottom: 8 }}>
          <p style={{ color: "var(--texto-2)", margin: "0 0 6px" }}>{projeto.descricao}</p>
          <label style={{ display: "grid", gap: 2, marginBottom: 6 }}>
            Demanda (id) — vazio = a mais recentemente atualizada do time
            <input
              data-testid="demanda-do-projeto"
              disabled={!podeEditar}
              value={String(no.parametros.demandaId ?? "")}
              onChange={(e) =>
                onMudar({
                  parametros: e.target.value
                    ? { ...no.parametros, demandaId: e.target.value }
                    : Object.fromEntries(Object.entries(no.parametros).filter(([k]) => k !== "demandaId")),
                })
              }
              style={campo}
            />
          </label>
          <div style={{ color: "var(--texto-fraco)" }}>
            Saídas: {projeto.saida.map((c) => c.rotulo).join(", ")}
          </div>
          {/* §2.4-4 e §2.4-14 — quem age no mundo se anuncia, e escrever no
              projeto NUNCA aplica direto: vira proposta (variante) na demanda. */}
          <p style={{ color: "var(--texto-fraco)", margin: "6px 0 0" }}>
            Com "desenho" mapeado numa aresta de entrada, este nó ESCREVE: o desenho vira uma variante
            ("Proposta do fluxo…") — o desenho da demanda só muda se alguém adotar na mesa.
          </p>
        </div>
      )}
      {funcao && (
        <div data-testid="contrato-da-funcao" style={{ fontSize: 11.5, marginBottom: 8 }}>
          {funcao.descricao && <p style={{ color: "var(--texto-2)", margin: "0 0 6px" }}>{funcao.descricao}</p>}
          {/* §2.4-6 — o implícito em voz alta: o contrato diz o que entra e o
              que sai; a entrada obrigatória vem do mapeamento de uma aresta. */}
          <div style={{ color: "var(--texto-fraco)" }}>
            Entradas:{" "}
            {funcao.entrada.map((c) => `${c.rotulo}${c.obrigatorio ? " *" : ""}`).join(", ") || "—"}
          </div>
          <div style={{ color: "var(--texto-fraco)" }}>
            Saídas: {funcao.saida.map((c) => c.rotulo).join(", ") || "—"}
          </div>
          <p style={{ color: "var(--texto-fraco)", margin: "6px 0 0" }}>
            As entradas vêm das arestas (mapeamento). Obrigatória ausente não vira default — o nó não roda (§9.3).
          </p>
        </div>
      )}
      {no.tipo === "agente" && (
        <>
          <p style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
            As entradas vêm das arestas — o mapeamento diz o que ele recebe (§9.3: sem entrada, ele não roda).
          </p>
          {/* §369 — o PAPEL editável de onde se vê (régua do §260): grava no
              mesmo documento da aba Pipeline de IA — uma verdade só. */}
          {no.refId && papeis.some((p) => p.id === no.refId) && (
            <EditorDoPapel
              key={no.refId}
              papel={papeis.find((p) => p.id === no.refId)!}
              podeEditar={podeEditarPapel}
              onSalvar={(mudanca) => onSalvarPapel(no.refId, mudanca)}
            />
          )}
        </>
      )}
      {podeEditar && (
        <button onClick={onRemover} style={{ ...botao, marginTop: 8 }}>
          Remover nó
        </button>
      )}
    </div>
  );
}

function EditorDoPapel({
  papel,
  podeEditar,
  onSalvar,
}: {
  papel: PapelConfigurado;
  podeEditar: boolean;
  onSalvar: (mudanca: { nome: string; descricao: string; preambulo: string }) => Promise<void>;
}) {
  const [nome, setNome] = useState(papel.nome);
  const [descricao, setDescricao] = useState(papel.descricao ?? "");
  const [preambulo, setPreambulo] = useState(papel.preambulo ?? "");
  const [salvando, setSalvando] = useState(false);
  const mudou = nome !== papel.nome || descricao !== (papel.descricao ?? "") || preambulo !== (papel.preambulo ?? "");

  return (
    <fieldset disabled={!podeEditar || salvando} style={{ border: "1px solid var(--borda)", borderRadius: 8, padding: 10, margin: "0 0 8px" }}>
      <legend style={{ fontSize: 11, color: "var(--texto-fraco)" }}>O papel (o mesmo da aba Pipeline de IA)</legend>
      <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
        Nome
        <input data-testid="papel-nome" value={nome} onChange={(e) => setNome(e.target.value)} style={campo} />
      </label>
      <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
        Descrição
        <input data-testid="papel-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} style={campo} />
      </label>
      <label style={{ fontSize: 11.5, display: "grid", gap: 2, marginBottom: 6 }}>
        Prompt do papel (preâmbulo)
        <textarea
          data-testid="papel-preambulo"
          value={preambulo}
          onChange={(e) => setPreambulo(e.target.value)}
          rows={5}
          style={{ ...campo, resize: "vertical" }}
        />
      </label>
      <button
        data-testid="salvar-papel"
        disabled={!mudou}
        onClick={() => {
          setSalvando(true);
          void onSalvar({ nome, descricao, preambulo }).finally(() => setSalvando(false));
        }}
        style={botaoMiudo}
      >
        {salvando ? "Salvando…" : "Salvar papel na esteira"}
      </button>
      {!podeEditar && (
        <p style={{ fontSize: 10.5, color: "var(--texto-fraco)", margin: "6px 0 0" }}>
          Editar o papel exige a permissão da esteira (pipeline-agentes).
        </p>
      )}
    </fieldset>
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
  // O que a ORIGEM sabe entregar: a `saida` declarada do conector ou da
  // função (SPEC-107 — o mesmo contrato, outro transporte), ou o `texto` de
  // um agente. É a fatia A alimentando a C — sem forma declarada, este select
  // não teria opções, e a aresta não teria o que carregar (§3.2).
  const saidasDaOrigem =
    origem?.tipo === "conector"
      ? (catalogo.find((c) => c.id === origem.refId)?.saida.map((s) => s.chave) ?? [])
      : origem?.tipo === "funcao"
        ? (funcaoDoSistema(origem.refId)?.saida.map((s) => s.chave) ?? [])
        : origem?.tipo === "projeto"
          ? PROJETO_DO_SISTEMA.saida.map((s) => s.chave)
          : origem?.tipo === "transformacao"
            ? sanearCamposDaTransformacao(origem.parametros?.campos).map((c) => c.chave)
            : ["texto"];
  const entradasDoDestino =
    destino?.tipo === "conector"
      ? (catalogo.find((c) => c.id === destino.refId)?.entrada.map((s) => s.chave) ?? [])
      : destino?.tipo === "funcao"
        ? (funcaoDoSistema(destino.refId)?.entrada.map((s) => s.chave) ?? [])
        : destino?.tipo === "projeto"
          ? PROJETO_DO_SISTEMA.entrada.map((s) => s.chave)
          : null;

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

const dicaVaziaEstilo: React.CSSProperties = {
  position: "absolute",
  top: "42%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 5,
  fontSize: 13,
  color: "var(--texto-fraco)",
  border: "1px dashed var(--borda-forte)",
  borderRadius: 10,
  padding: "14px 18px",
  maxWidth: 420,
  textAlign: "center",
  pointerEvents: "none",
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

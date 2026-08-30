import { useRef, useState } from "react";
import type { DiagramaConfig, FieldSpec } from "@gerador/engine";
import type { CampoAresta, DadosCampoAresta, SugestaoCampo } from "../api/client";
import { SugerirComIa } from "./SugerirComIa";

export interface CamposArestaTabProps {
  config: DiagramaConfig;
  camposAresta: CampoAresta[];
  timeAtivo: string;
  onCriar: (dados: DadosCampoAresta) => Promise<void>;
  onAtualizar: (id: string, dados: Partial<DadosCampoAresta>) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}

const TIPOS_CAMPO: CampoAresta["type"][] = ["text", "textarea", "number", "boolean", "select"];

function gerarChaveDoRotulo(rotulo: string): string {
  const semAcento = rotulo
    .normalize("NFD")
    .split("")
    .filter((c) => c.codePointAt(0)! < 128)
    .join("");
  return semAcento
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((palavra, i) => (i === 0 ? palavra.toLowerCase() : palavra[0].toUpperCase() + palavra.slice(1).toLowerCase()))
    .join("");
}

interface FormularioCampo {
  id?: string;
  escopo: "global" | "time";
  tipoAresta: string;
  key: string;
  chaveFixa: boolean;
  keyEditadaManualmente: boolean;
  label: string;
  type: CampoAresta["type"];
  required: boolean;
  valorPadrao: string;
  opcoes: string;
  ajuda: string;
}

function formularioVazio(tipoAresta: string): FormularioCampo {
  return {
    escopo: "time",
    tipoAresta,
    key: "",
    chaveFixa: false,
    keyEditadaManualmente: false,
    label: "",
    type: "text",
    required: false,
    valorPadrao: "",
    opcoes: "",
    ajuda: "",
  };
}

function formularioDeCampo(campo: CampoAresta): FormularioCampo {
  return {
    id: campo.id,
    escopo: campo.timeId === "__global__" ? "global" : "time",
    tipoAresta: campo.tipoAresta,
    key: campo.key,
    chaveFixa: true,
    keyEditadaManualmente: true,
    label: campo.label,
    type: campo.type,
    required: campo.required,
    valorPadrao: campo.valorPadrao ?? "",
    opcoes: (campo.opcoes ?? []).join(", "),
    ajuda: campo.ajuda ?? "",
  };
}

/** Pré-preenche a partir de um campo padrão (`config/diagrama.json`), mesma
 * regra de "sobrescrever" já usada em `CamposNoTab`. */
function formularioDeFieldSpec(tipoAresta: string, campo: FieldSpec): FormularioCampo {
  return {
    escopo: "time",
    tipoAresta,
    key: campo.key,
    chaveFixa: true,
    keyEditadaManualmente: true,
    label: campo.label,
    type: campo.type === "lista" ? "text" : campo.type,
    required: campo.required ?? false,
    valorPadrao: campo.default !== undefined ? String(campo.default) : "",
    opcoes: (campo.options ?? []).join(", "),
    ajuda: campo.ajuda ?? "",
  };
}

/**
 * Editor de campos customizados por tipo de conexão (SPEC-21) — mesmo padrão
 * de `CamposNoTab`, mas pra `edgeTypes` em vez de `nodeTypes`. Antes não havia
 * como uma aresta carregar campo próprio nenhum, só o tipo (`http`,
 * `publishes`...); a jornada é a mesma (global vs. time, sobrescrever um
 * campo padrão), sem o editor de `lista`/`itemSpec` — campo repetível numa
 * conexão é caso hipotético que ninguém pediu ainda.
 */
export function CamposArestaTab({ config, camposAresta, timeAtivo, onCriar, onAtualizar, onExcluir }: CamposArestaTabProps) {
  const tiposDeAresta = Object.keys(config.edgeTypes);
  const [formulario, setFormulario] = useState<FormularioCampo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarChave, setMostrarChave] = useState(false);
  // Mesmo achado de CamposNoTab: o formulário abre no topo, mas "sobrescrever"/"editar"
  // ficam na lista abaixo — sem rolar de volta, o clique parece não fazer nada quando a
  // pessoa já rolou pra ver um tipo mais pra baixo.
  const formRef = useRef<HTMLDivElement>(null);

  function abrirNovo() {
    setFormulario(formularioVazio(tiposDeAresta[0] ?? ""));
    setMostrarChave(false);
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function abrirEdicao(campo: CampoAresta) {
    setFormulario(formularioDeCampo(campo));
    setMostrarChave(false);
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function abrirSobrescrita(tipoAresta: string, campo: FieldSpec) {
    setFormulario(formularioDeFieldSpec(tipoAresta, campo));
    setMostrarChave(false);
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  /** SPEC-23 Fluxo 2 — a sugestão vira rascunho no formulário; o tipo de
   * conexão continua sendo o selecionado e nada é salvo sem o usuário. */
  function aplicarSugestao(sugestao: SugestaoCampo) {
    const base = formulario ?? formularioVazio(tiposDeAresta[0] ?? "");
    setFormulario({
      ...base,
      key: sugestao.key || base.key,
      keyEditadaManualmente: true,
      label: sugestao.label || base.label,
      // O schema do alvo "campo-aresta" já não oferece "lista" (conexão não
      // suporta); a guarda aqui é pra config antiga/servidor mais velho não
      // conseguir empurrar um tipo que este formulário não sabe editar.
      type: sugestao.type === "lista" ? "text" : sugestao.type,
      required: sugestao.required,
      ajuda: sugestao.ajuda ?? "",
      opcoes: sugestao.type === "select" ? (sugestao.opcoes ?? []).join(", ") : base.opcoes,
    });
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  async function salvar() {
    if (!formulario) return;
    if (!formulario.tipoAresta || !formulario.key.trim() || !formulario.label.trim()) return;

    const dados: Partial<DadosCampoAresta> = {
      tipoAresta: formulario.tipoAresta,
      key: formulario.key.trim(),
      label: formulario.label.trim(),
      type: formulario.type,
      required: formulario.required,
      valorPadrao: formulario.valorPadrao.trim() || undefined,
      opcoes: formulario.type === "select" ? formulario.opcoes.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      ajuda: formulario.ajuda.trim() || undefined,
    };

    setSalvando(true);
    try {
      if (formulario.id) {
        await onAtualizar(formulario.id, dados);
      } else {
        await onCriar({
          ...(dados as DadosCampoAresta),
          timeId: formulario.escopo === "global" ? undefined : timeAtivo,
        });
      }
      setFormulario(null);
    } finally {
      setSalvando(false);
    }
  }

  const porTipo = new Map<string, CampoAresta[]>();
  for (const campo of camposAresta) {
    const lista = porTipo.get(campo.tipoAresta) ?? [];
    lista.push(campo);
    porTipo.set(campo.tipoAresta, lista);
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        Cada tipo de conexão (HTTP, publica em, consome de...) pode ganhar campos próprios — ex.: timeout, chave de
        roteamento, se é síncrono. "sobrescrever" cria uma versão específica pro time <strong>{timeAtivo}</strong>;
        "global" muda o original pra todo mundo; "+ Adicionar campo" cria um campo novo, que não existia antes.
      </p>

      <SugerirComIa<SugestaoCampo>
        alvo="campo-aresta"
        contexto={`Tipo de conexão: ${config.edgeTypes[formulario?.tipoAresta ?? tiposDeAresta[0]]?.label ?? formulario?.tipoAresta ?? tiposDeAresta[0]}. Time: ${timeAtivo}.`}
        exemplo="ex.: campo pro timeout e a política de retry da chamada"
        onSugestao={aplicarSugestao}
      />

      <div ref={formRef}>
        {formulario ? (
          <FormularioCampoAresta
            formulario={formulario}
            tiposDeAresta={tiposDeAresta}
            setFormulario={setFormulario}
            onSalvar={salvar}
            onCancelar={() => setFormulario(null)}
            salvando={salvando}
            mostrarChave={mostrarChave}
            onAlternarChave={() => setMostrarChave((v) => !v)}
          />
        ) : (
          <button onClick={abrirNovo} style={botaoAdicionarEstilo}>
            + Adicionar campo
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        {tiposDeAresta.map((tipoAresta) => {
          const camposCustom = porTipo.get(tipoAresta) ?? [];
          const chavesSobrescritas = new Set(camposCustom.map((c) => c.key));
          const camposPadrao = config.edgeTypes[tipoAresta]?.spec ?? [];

          return (
            <div key={tipoAresta} style={cardEstilo}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13, color: "var(--texto)" }}>
                  {config.edgeTypes[tipoAresta]?.label ?? tipoAresta}
                </strong>
                {/**
                 * SPEC-65 — o que o produto ASSUME sobre esta conexão.
                 *
                 * Estava só no `diagrama.json`, e um pressuposto invisível é um
                 * pressuposto que ninguém confere: é ele que decide se o
                 * `timeoutMs` desta conexão entra na conta do tempo de resposta
                 * (a leitura do desenho) ou não entra.
                 *
                 * "não declarado" não é falha a esconder — é a terceira
                 * resposta (§248): a leitura pula a conexão E diz que pulou.
                 */}
                <EsperaDoTipo espera={config.edgeTypes[tipoAresta]?.espera} />
              </div>
              {camposPadrao.length === 0 && camposCustom.length === 0 && (
                <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", margin: "6px 0 0" }}>Nenhum campo ainda.</p>
              )}
              <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none" }}>
                {camposPadrao.map((campo) => (
                  <li
                    key={`padrao-${campo.key}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5 }}
                  >
                    <span style={{ ...tagOrigemEstilo, ...tagPadraoEstilo }}>padrão</span>
                    <span style={{ color: "var(--texto-2)" }}>
                      {campo.label} <span style={{ color: "var(--texto-mudo)" }}>({campo.key}, {campo.type})</span>
                    </span>
                    {chavesSobrescritas.has(campo.key) && (
                      <span style={{ fontSize: 10.5, color: "var(--verde)" }}>sobrescrito abaixo pro seu time</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => abrirSobrescrita(tipoAresta, campo)} style={linkBotaoEstilo}>
                      sobrescrever
                    </button>
                  </li>
                ))}
                {camposCustom.map((campo) => (
                  <li
                    key={campo.id}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5 }}
                  >
                    <span
                      style={{
                        ...tagOrigemEstilo,
                        ...(campo.timeId === "__global__" ? tagGlobalEstilo : tagTimeEstilo),
                      }}
                    >
                      {campo.timeId === "__global__" ? "global" : campo.timeId}
                    </span>
                    <span style={{ color: "var(--texto-2)" }}>
                      {campo.label} <span style={{ color: "var(--texto-mudo)" }}>({campo.key}, {campo.type})</span>
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => abrirEdicao(campo)} style={linkBotaoEstilo}>
                      editar
                    </button>
                    <button onClick={() => void onExcluir(campo.id)} style={{ ...linkBotaoEstilo, color: "var(--vermelho)" }}>
                      excluir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormularioCampoAresta({
  formulario,
  tiposDeAresta,
  setFormulario,
  onSalvar,
  onCancelar,
  salvando,
  mostrarChave,
  onAlternarChave,
}: {
  formulario: FormularioCampo;
  tiposDeAresta: string[];
  setFormulario: (f: FormularioCampo) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
  mostrarChave: boolean;
  onAlternarChave: () => void;
}) {
  const podeSalvar = formulario.tipoAresta !== "" && formulario.key.trim() !== "" && formulario.label.trim() !== "";

  return (
    <div style={formularioEstilo}>
      {!formulario.id && (
        <>
          <label style={labelFormEstilo}>Escopo</label>
          <select
            aria-label="Escopo"
            value={formulario.escopo}
            onChange={(e) => setFormulario({ ...formulario, escopo: e.target.value as "global" | "time" })}
            style={inputFormEstilo}
          >
            <option value="time">Só o time ativo</option>
            <option value="global">Global (todo mundo)</option>
          </select>
        </>
      )}

      <label style={labelFormEstilo}>Tipo de conexão</label>
      <select
        aria-label="Tipo de conexão"
        value={formulario.tipoAresta}
        onChange={(e) => setFormulario({ ...formulario, tipoAresta: e.target.value })}
        style={inputFormEstilo}
        disabled={!!formulario.id}
      >
        {tiposDeAresta.map((tipo) => (
          <option key={tipo} value={tipo}>
            {tipo}
          </option>
        ))}
      </select>

      <label style={labelFormEstilo}>Rótulo</label>
      <input
        aria-label="Rótulo"
        value={formulario.label}
        onChange={(e) => {
          const label = e.target.value;
          const key =
            !formulario.chaveFixa && !formulario.keyEditadaManualmente ? gerarChaveDoRotulo(label) : formulario.key;
          setFormulario({ ...formulario, label, key });
        }}
        placeholder="ex.: Timeout (ms)"
        style={inputFormEstilo}
      />

      <button type="button" onClick={onAlternarChave} style={{ ...linkBotaoEstilo, marginTop: 8, alignSelf: "flex-start" }}>
        {mostrarChave ? "ocultar" : "avançado: ver/editar a chave técnica"}
      </button>

      {mostrarChave && (
        <>
          <label style={labelFormEstilo}>Chave (key)</label>
          <input
            aria-label="Chave"
            value={formulario.key}
            onChange={(e) => setFormulario({ ...formulario, key: e.target.value, keyEditadaManualmente: true })}
            placeholder="ex.: timeoutMs"
            style={inputFormEstilo}
            disabled={formulario.chaveFixa}
          />
          {formulario.chaveFixa && (
            <span style={{ fontSize: 10.5, color: "var(--texto-mudo)" }}>
              Fixa — é o que liga este campo ao original, não dá pra mudar.
            </span>
          )}
        </>
      )}

      <label style={labelFormEstilo}>Tipo de campo</label>
      <select
        aria-label="Tipo de campo"
        value={formulario.type}
        onChange={(e) => setFormulario({ ...formulario, type: e.target.value as CampoAresta["type"] })}
        style={inputFormEstilo}
      >
        {TIPOS_CAMPO.map((tipo) => (
          <option key={tipo} value={tipo}>
            {tipo}
          </option>
        ))}
      </select>

      {formulario.type === "select" && (
        <>
          <label style={labelFormEstilo}>Opções (separadas por vírgula)</label>
          <input
            aria-label="Opções"
            value={formulario.opcoes}
            onChange={(e) => setFormulario({ ...formulario, opcoes: e.target.value })}
            placeholder="ex.: síncrono, assíncrono"
            style={inputFormEstilo}
          />
        </>
      )}

      <label style={labelFormEstilo}>Valor padrão (opcional)</label>
      <p style={captionFormEstilo}>
        Preenche o campo sozinho quando alguém cria uma conexão desse tipo — a pessoa ainda pode trocar depois.
      </p>
      <input
        aria-label="Valor padrão"
        value={formulario.valorPadrao}
        onChange={(e) => setFormulario({ ...formulario, valorPadrao: e.target.value })}
        style={inputFormEstilo}
      />

      <label style={labelFormEstilo}>Ajuda (opcional)</label>
      <p style={captionFormEstilo}>
        Texto curto que aparece abaixo do rótulo "{formulario.label || "..."}" na hora de preencher esse campo — não
        é o rótulo em si (isso é o campo "Rótulo" acima).
      </p>
      <input
        aria-label="Ajuda"
        value={formulario.ajuda}
        onChange={(e) => setFormulario({ ...formulario, ajuda: e.target.value })}
        style={inputFormEstilo}
      />

      <label style={{ ...labelFormEstilo, display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={formulario.required}
          onChange={(e) => setFormulario({ ...formulario, required: e.target.checked })}
        />
        Obrigatório
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={onSalvar}
          disabled={!podeSalvar || salvando}
          style={{ ...botaoSalvarEstilo, opacity: podeSalvar ? 1 : 0.5, cursor: podeSalvar ? "pointer" : "not-allowed" }}
        >
          Salvar
        </button>
        <button onClick={onCancelar} style={botaoCancelarEstilo}>
          cancelar
        </button>
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.5,
  marginTop: 0,
  maxWidth: 680,
};

/**
 * SPEC-65 — quem chama por esta conexão espera a resposta?
 *
 * Só leitura por enquanto, e de propósito: `espera` mora no `diagrama.json`
 * GLOBAL, e esta aba edita campos POR TIME. Trocá-lo daqui exigiria um editor
 * de config global no meio de um editor de campos de time — duas coisas
 * diferentes no mesmo lugar, que é como se constrói a tela que ninguém
 * entende. Enquanto isso, ao menos o pressuposto deixa de ser invisível.
 */
function EsperaDoTipo({ espera }: { espera?: boolean }) {
  const texto =
    espera === true
      ? "espera resposta"
      : espera === false
        ? "não espera"
        : "não declarado";
  const titulo =
    espera === true
      ? "Quem chama por esta conexão bloqueia até a resposta: o tempo dela SOMA no tempo de resposta de quem chamou, e a falha dela derruba a chamada."
      : espera === false
        ? "Quem chama segue sem esperar: o que acontece depois desta conexão não entra no tempo de resposta de quem chamou."
        : "Ninguém declarou. A leitura do desenho pula esta conexão em vez de chutar — e diz que pulou.";
  const cor =
    espera === true ? "var(--acento-indigo)" : espera === false ? "var(--texto-fraco)" : "var(--amarelo)";
  return (
    <span
      title={titulo}
      data-testid="espera-do-tipo"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        padding: "1px 7px",
        borderRadius: 999,
        border: `1px solid ${cor}`,
        color: cor,
        cursor: "help",
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}

const cardEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 12,
  padding: 14,
  background: "var(--painel)",
};

const tagOrigemEstilo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 999,
  flexShrink: 0,
};

const tagGlobalEstilo: React.CSSProperties = { background: "rgba(99, 102, 241, 0.16)", color: "var(--acento-gente-texto)" };
const tagTimeEstilo: React.CSSProperties = { background: "rgba(62, 207, 142, 0.16)", color: "var(--verde)" };
const tagPadraoEstilo: React.CSSProperties = { background: "var(--painel-alto)", color: "var(--texto-fraco)" };

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
};

const formularioEstilo: React.CSSProperties = {
  marginTop: 4,
  padding: 14,
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxWidth: 420,
};

const labelFormEstilo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--texto-2)",
  marginTop: 8,
};

const captionFormEstilo: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--texto-mudo)",
  margin: "1px 0 3px",
  lineHeight: 1.4,
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  outline: "none",
  boxSizing: "border-box",
};

const botaoSalvarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
};

const botaoCancelarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "var(--acento-gente-texto)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};

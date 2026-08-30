import { useState } from "react";
import {
  calcularProntidao,
  camposVisiveis,
  resolverDefault,
  type FieldSpec,
  type No,
} from "@gerador/engine";
import type { UseDiagrama } from "../state/useDiagrama";
import type { DiagramaConfig, Aresta } from "@gerador/engine";
import type { SugestoesDeStack } from "../api/client";
import type { Decisao } from "@gerador/engine";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { DecisoesDoNo } from "./DecisoesDoNo";
import { ReadinessBadge } from "../summary/ReadinessBadge";

export interface PropertiesPanelProps {
  no: No | undefined;
  arestas: Aresta[];
  config: DiagramaConfig;
  /** SPEC-59 fatia C — o painel edita o DIAGRAMA; quebra não é assunto dele. */
  quebraState: UseDiagrama;
  /** SPEC-43 — os valores conhecidos do catálogo global de stacks: viram os
   * chips de sugestão em campo vazio (todas as stacks, sem filtro por time). */
  sugestoesDeStack?: SugestoesDeStack;
  /** Time da quebra atual — só informativo (placeholder do time responsável). */
  time?: string;
  /** Captura os campos manuais do nó como stack CONHECIDA do catálogo global. */
  onSalvarStack?: (tipoNo: string, valores: Record<string, unknown>) => void;
  /** SPEC-57 fatia C — as decisões da quebra; o painel mostra as deste nó. */
  decisoes?: Decisao[];
  /** Quem está decidindo. Decisão sem autor não é decisão de ninguém. */
  autor?: string;
  onRegistrarDecisao?: (d: Decisao) => void;
  onAceitarDecisao?: (id: string) => void;
  onSubstituirDecisao?: (idAntiga: string, nova: Decisao) => void;
  /** SPEC-57 M4 — pedir ao agente que proponha, lendo o desenho medido. */
  onPedirDecisoesAoAgente?: () => Promise<void>;
  /** §253 — identifica decisão de DEMONSTRAÇÃO, que não oferece aceite. */
  ehDeDemonstracao?: (id: string) => boolean;
}

export function PropertiesPanel({
  no,
  arestas,
  config,
  quebraState,
  sugestoesDeStack,
  time,
  onSalvarStack,
  decisoes,
  autor,
  onRegistrarDecisao,
  onAceitarDecisao,
  onSubstituirDecisao,
  onPedirDecisoesAoAgente,
  ehDeDemonstracao,
}: PropertiesPanelProps) {
  if (!no) {
    return (
      <aside data-tour="properties-panel" style={painelEstilo}>
        <p style={{ color: "var(--texto-fraco)", fontSize: 13 }}>Selecione um nó para editar as propriedades.</p>
      </aside>
    );
  }

  const cfg = config.nodeTypes[no.type];
  if (!cfg) {
    return (
      <aside data-tour="properties-panel" style={painelEstilo}>
        <p style={{ color: "var(--vermelho)", fontSize: 13 }}>
          Tipo de nó "{no.type}" não existe na configuração carregada.
        </p>
      </aside>
    );
  }

  const visiveis = camposVisiveis(cfg.spec, no, arestas);
  const prontidao = calcularProntidao(cfg.spec, no, arestas);
  const { renomearNo, alternarStatus, definirTime, pedirExclusao } = quebraState;

  // Exclui o campo de identidade (nome do serviço, tópico, tabela...) da
  // captura de "padrão do time" — sugerir o mesmo valor fixo pra todo nó novo
  // desse tipo não faz sentido, cada instância precisa do seu próprio nome
  // único (achado real, ver FieldSpec.identificador).
  const valoresManuais = Object.fromEntries(
    Object.entries(no.spec)
      .filter(([chave, v]) => v.origem === "manual" && !cfg.spec.find((c) => c.key === chave)?.identificador)
      .map(([chave, v]) => [chave, v.valor])
  );
  const podeSalvarStack = Boolean(onSalvarStack) && Object.keys(valoresManuais).length > 0;

  return (
    <aside data-tour="properties-panel" style={painelEstilo}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--texto-2)", margin: 0 }}>{cfg.label}</h2>
        <ReadinessBadge nivel={prontidao.nivel} />
      </div>

      <input
        value={no.label}
        onChange={(e) => renomearNo(no.id, e.target.value)}
        style={{ ...inputEstilo, fontWeight: 600, fontSize: 15, marginTop: 10 }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <button style={statusBotaoEstilo} onClick={() => alternarStatus(no.id)}>
          {no.status === "novo" ? "novo" : "existente"} · trocar
        </button>
        <input
          placeholder={`time responsável (default: ${time ?? "o da quebra"})`}
          defaultValue={no.time ?? ""}
          onBlur={(e) => definirTime(no.id, e.target.value)}
          title="Deixe em branco pra herdar o time da quebra. Preencha só se esse nó específico for de outro time — vira o time-tag na tela de revisão."
          style={{ ...inputEstilo, fontSize: 12, padding: "4px 8px" }}
        />
      </div>

      {podeSalvarStack && (
        <button
          style={{ ...linkBotaoEstilo, marginTop: 8 }}
          onClick={() => onSalvarStack!(no.type, valoresManuais)}
          title={`Grava os campos preenchidos manualmente aqui como uma stack conhecida de "${cfg.label}" no catálogo — os valores viram sugestão pra todo mundo (SPEC-43).`}
        >
          💾 salvar estes valores como stack conhecida
        </button>
      )}

      <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid var(--borda)" }} />

      {visiveis.length === 0 && (
        <p style={{ color: "var(--texto-mudo)", fontSize: 12 }}>Nenhum campo aplicável (ainda).</p>
      )}

      {visiveis.map((campo) => (
        <FieldRow
          key={campo.key}
          no={no}
          campo={campo}
          prontidao={prontidao}
          quebraState={quebraState}
          sugestoesDeStack={sugestoesDeStack}
        />
      ))}

      {onRegistrarDecisao && onAceitarDecisao && onSubstituirDecisao && (
        <>
          <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid var(--borda)" }} />
          {/* SPEC-57 fatia C — logo abaixo dos campos, porque é exatamente aqui
              que alguém pergunta "por que este nó é assim?". */}
          <DecisoesDoNo
            noId={no.id}
            // §263 — o desenho, para a remedição medir sobre ele. Vem do
            // `quebraState` que o painel já tem: nada novo atravessa o App.
            diagrama={quebraState.diagrama}
            decisoes={decisoes ?? []}
            autor={autor ?? "—"}
            onRegistrar={onRegistrarDecisao}
            onAceitar={onAceitarDecisao}
            onSubstituir={onSubstituirDecisao}
            onPedirAoAgente={onPedirDecisoesAoAgente}
            ehDeDemonstracao={ehDeDemonstracao}
          />
        </>
      )}

      <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid var(--borda)" }} />
      <button
        // Pede confirmação (useQuebra) — este é o caminho por onde o usuário
        // de fato exclui: seleciona o componente e clica aqui.
        onClick={() => pedirExclusao("no", no.id)}
        style={{ ...statusBotaoEstilo, color: "var(--vermelho)", borderColor: "#fecaca" }}
      >
        Excluir nó
      </button>
    </aside>
  );
}

interface FieldRowProps {
  no: No;
  campo: FieldSpec;
  prontidao: ReturnType<typeof calcularProntidao>;
  /** SPEC-59 fatia C — o painel edita o DIAGRAMA; quebra não é assunto dele. */
  quebraState: UseDiagrama;
  sugestoesDeStack?: SugestoesDeStack;
}

function FieldRow({ no, campo, prontidao, quebraState, sugestoesDeStack }: FieldRowProps) {
  const { definirValorSpec, definirNA, removerNA, confirmarValor, descartarValor } = quebraState;
  const [motivoRascunho, setMotivoRascunho] = useState("");
  const [editandoNA, setEditandoNA] = useState(false);

  const valorSpec = no.spec[campo.key];
  const na = no.specNA[campo.key];
  const erro = prontidao.erros.find((e) => e.campo === campo.key);
  const pendente = prontidao.inferidosPendentes.includes(campo.key);
  // SPEC-43 — o default estático do campo + TODOS os valores conhecidos do
  // catálogo de stacks: um chip por valor (antes era um só, do perfil do time).
  const defEstatico = resolverDefault(campo, no);
  const deStacks = sugestoesDeStack?.[no.type]?.[campo.key] ?? [];
  const sugestoes: unknown[] = [
    ...(defEstatico !== undefined && defEstatico !== "" ? [defEstatico] : []),
    ...deStacks.filter((v) => String(defEstatico) !== v),
  ];
  const sugestao = sugestoes[0];
  const temSugestaoNaoUsada = valorSpec === undefined && sugestoes.length > 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--texto-2)" }}>
          {campo.label}
          {campo.required && <span style={{ color: "#ef4444" }}> *</span>}
        </label>
        {valorSpec && <ProvenanceBadge valorSpec={valorSpec} />}
      </div>
      {campo.ajuda && <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "2px 0 6px" }}>{campo.ajuda}</p>}

      {na ? (
        <div style={naBoxEstilo}>
          <span style={{ fontSize: 12, color: "#78350f" }}>N/A — {na.motivo || "(sem motivo)"}</span>
          <button style={linkBotaoEstilo} onClick={() => removerNA(no.id, campo.key)}>
            remover
          </button>
        </div>
      ) : (
        <>
          <FieldControl campo={campo} valor={valorSpec?.valor} sugestao={sugestao} onChange={(v) => definirValorSpec(no.id, campo.key, v)} />
          {temSugestaoNaoUsada &&
            sugestoes.map((s) => (
              <button
                key={String(s)}
                style={{ ...linkBotaoEstilo, marginRight: 8 }}
                onClick={() => definirValorSpec(no.id, campo.key, s)}
              >
                usar sugestão: {String(s)}
              </button>
            ))}
        </>
      )}

      {pendente && valorSpec && (
        <div style={pendenteBoxEstilo}>
          <span>
            {valorSpec.origem === "inferido"
              ? `Inferido (confiança ${Math.round((valorSpec.confianca ?? 0) * 100)}%) — confirme.`
              : "Sugerido pelo copiloto — confirme ou descarte."}
          </span>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button style={linkBotaoEstilo} onClick={() => confirmarValor(no.id, campo.key)}>
              confirmar
            </button>
            {valorSpec.origem === "sugerido" && (
              <button style={linkBotaoEstilo} onClick={() => descartarValor(no.id, campo.key)}>
                descartar
              </button>
            )}
          </div>
        </div>
      )}

      {erro && (
        <p style={{ fontSize: 11, color: "var(--vermelho)", marginTop: 4 }}>
          {erro.codigo === "NA_SEM_MOTIVO" ? "N/A precisa de um motivo." : "Este campo não aceita N/A."}
        </p>
      )}

      <div style={{ marginTop: 4 }}>
        {campo.permiteNA !== false && !na && !editandoNA && (
          <button style={linkBotaoEstilo} onClick={() => setEditandoNA(true)}>
            marcar N/A
          </button>
        )}
        {editandoNA && (
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input
              autoFocus
              placeholder="motivo (obrigatório)"
              value={motivoRascunho}
              onChange={(e) => setMotivoRascunho(e.target.value)}
              style={{ ...inputEstilo, fontSize: 12, padding: "4px 8px" }}
            />
            <button
              style={linkBotaoEstilo}
              onClick={() => {
                definirNA(no.id, campo.key, motivoRascunho);
                setMotivoRascunho("");
                setEditandoNA(false);
              }}
            >
              salvar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Exportado pra ser reusado fora de `PropertiesPanel` — ex. `EdgePanel.tsx`
 * (SPEC-21), que renderiza campos de `EdgeTypeConfig.spec` com o mesmo
 * dispatcher, sem duplicar o `switch` por `TipoCampo`. */
export function FieldControl({
  campo,
  valor,
  sugestao,
  onChange,
  ariaLabel,
}: {
  campo: FieldSpec;
  valor: unknown;
  sugestao: unknown;
  onChange: (v: unknown) => void;
  /** Sobrescreve o aria-label (default: `campo.label`) — necessário dentro de
   * `ListaControl`, onde o mesmo `itemSpec` se repete por item e `campo.label`
   * sozinho colidiria entre linhas (ex.: dois inputs "Method" indistinguíveis). */
  ariaLabel?: string;
}) {
  const rotulo = ariaLabel ?? campo.label;
  const placeholder = sugestao !== undefined && sugestao !== "" ? `sugestão: ${sugestao}` : undefined;

  if (campo.type === "lista") {
    return <ListaControl campo={campo} valor={valor} onChange={onChange} />;
  }
  if (campo.type === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          type="checkbox"
          aria-label={rotulo}
          checked={valor === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {valor === true ? "sim" : valor === false ? "não" : "(não definido)"}
      </label>
    );
  }
  if (campo.type === "select") {
    return (
      <select
        aria-label={rotulo}
        value={typeof valor === "string" ? valor : ""}
        onChange={(e) => onChange(e.target.value)}
        style={inputEstilo}
      >
        <option value="" disabled>
          {placeholder ?? "selecione…"}
        </option>
        {campo.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (campo.type === "number") {
    return (
      <input
        type="number"
        aria-label={rotulo}
        value={typeof valor === "number" ? valor : ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        style={inputEstilo}
      />
    );
  }
  if (campo.type === "textarea") {
    return <TextareaComExpandir campo={campo} valor={valor} placeholder={placeholder} onChange={onChange} ariaLabel={rotulo} />;
  }
  return (
    <input
      type="text"
      aria-label={rotulo}
      value={typeof valor === "string" ? valor : ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={inputEstilo}
    />
  );
}

/** Repetível — zero ou mais itens com a forma de `campo.itemSpec`, cada
 * sub-campo renderizado via `FieldControl` recursivo (sem sugestão/N/A por
 * item — provenance e sugestão de perfil de time continuam só no nível do
 * campo "lista" inteiro, não por item; granularidade que ninguém pediu). */
function ListaControl({
  campo,
  valor,
  onChange,
}: {
  campo: FieldSpec;
  valor: unknown;
  onChange: (v: unknown) => void;
}) {
  const itens = Array.isArray(valor) ? (valor as Record<string, unknown>[]) : [];
  const itemSpec = campo.itemSpec ?? [];

  function atualizarItem(idx: number, chave: string, v: unknown) {
    onChange(itens.map((item, i) => (i === idx ? { ...item, [chave]: v } : item)));
  }

  function removerItem(idx: number) {
    onChange(itens.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {itens.length === 0 && <p style={{ fontSize: 11, color: "var(--texto-mudo)", margin: "2px 0" }}>Nenhum item ainda.</p>}
      {itens.map((item, idx) => (
        <div key={idx} style={itemListaEstilo}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 11, color: "var(--texto-fraco)" }}>#{idx + 1}</strong>
            <button
              type="button"
              style={linkBotaoEstilo}
              onClick={() => removerItem(idx)}
              aria-label={`Remover item ${idx + 1} de ${campo.label}`}
            >
              ✕ remover
            </button>
          </div>
          {itemSpec.map((sub) => (
            <div key={sub.key} style={{ marginTop: 4 }}>
              <label style={{ fontSize: 11, color: "var(--texto-2)", display: "block", marginBottom: 2 }}>{sub.label}</label>
              <FieldControl
                campo={sub}
                valor={item[sub.key]}
                sugestao={undefined}
                onChange={(v) => atualizarItem(idx, sub.key, v)}
                ariaLabel={`${sub.label} — item ${idx + 1} de ${campo.label}`}
              />
            </div>
          ))}
        </div>
      ))}
      <button type="button" style={{ ...linkBotaoEstilo, marginTop: 6 }} onClick={() => onChange([...itens, {}])}>
        + item
      </button>
    </div>
  );
}

/** Textarea de algumas linhas + botão pra expandir numa área maior — pra
 * conteúdo longo (contrato de payload, schema), onde uma linha só esconde o
 * que a pessoa escreveu (achado em uso real, não em revisão de código). */
function TextareaComExpandir({
  campo,
  valor,
  placeholder,
  onChange,
  ariaLabel,
}: {
  campo: FieldSpec;
  valor: unknown;
  placeholder: string | undefined;
  onChange: (v: unknown) => void;
  ariaLabel?: string;
}) {
  const [expandido, setExpandido] = useState(false);
  const valorTexto = typeof valor === "string" ? valor : "";
  const rotulo = ariaLabel ?? campo.label;

  return (
    <>
      <div style={{ position: "relative" }}>
        <textarea
          aria-label={rotulo}
          value={valorTexto}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={textareaEstilo}
        />
        <button
          type="button"
          onClick={() => setExpandido(true)}
          style={botaoExpandirEstilo}
          aria-label={`Expandir ${rotulo}`}
          title="Expandir para editar numa área maior"
        >
          ⤢
        </button>
      </div>
      {expandido && (
        <div style={overlayExpandidoEstilo} onClick={() => setExpandido(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={rotulo}
            style={modalExpandidoEstilo}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 13, color: "var(--texto)" }}>{rotulo}</strong>
              <button onClick={() => setExpandido(false)} style={fecharExpandidoEstilo} aria-label="Fechar">
                ×
              </button>
            </div>
            <textarea
              autoFocus
              aria-label={`${rotulo} (expandido)`}
              value={valorTexto}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              style={textareaExpandidoEstilo}
            />
          </div>
        </div>
      )}
    </>
  );
}

const painelEstilo: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  borderLeft: "1px solid var(--borda)",
  padding: 16,
  overflowY: "auto",
  background: "var(--painel)",
  fontFamily: "system-ui, sans-serif",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  outline: "none",
  boxSizing: "border-box",
};

const statusBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "var(--acento-gente-texto)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  marginTop: 4,
};

const itemListaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 8,
  marginBottom: 8,
  background: "var(--painel)",
};

const naBoxEstilo: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "rgba(251, 191, 36, 0.10)",
  border: "1px solid #fde68a",
  borderRadius: 6,
  padding: "6px 8px",
};

const pendenteBoxEstilo: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "var(--amarelo)",
  background: "rgba(251, 191, 36, 0.10)",
  border: "1px solid #fde68a",
  borderRadius: 6,
  padding: "6px 8px",
};

const textareaEstilo: React.CSSProperties = {
  width: "100%",
  padding: "6px 30px 6px 10px",
  fontSize: 12.5,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  resize: "vertical",
  minHeight: 64,
};

const botaoExpandirEstilo: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  fontSize: 12,
  lineHeight: 1,
  padding: "3px 5px",
  borderRadius: 4,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const overlayExpandidoEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  zIndex: 70,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalExpandidoEstilo: React.CSSProperties = {
  background: "var(--painel)",
  borderRadius: 12,
  width: "min(640px, 100%)",
  padding: 18,
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.35)",
};

const fecharExpandidoEstilo: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const textareaExpandidoEstilo: React.CSSProperties = {
  width: "100%",
  minHeight: 320,
  padding: 10,
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  resize: "vertical",
};

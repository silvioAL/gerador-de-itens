import { useEffect, useState } from "react";
import type { RegrasConfig, Requisito } from "@gerador/engine";
import { apiRegras, type SugestaoRegra } from "../api/client";
import { SugerirComIa } from "./SugerirComIa";

/**
 * SPEC-23 fluxo 5 — editor de `config/regras.json`.
 *
 * Este arquivo é a tabela que decide QUAIS requisitos de refinamento cada item
 * gerado recebe (por tech e contexto). Era o único arquivo de configuração sem
 * rota nem tela: só dava pra editar à mão, apesar de ser o que mais muda com o
 * tempo — cada aprendizado do time deveria virar uma linha aqui.
 *
 * Escopo desta primeira versão, deliberado: **checklist técnico** (`Requisito`)
 * — a lista que alimenta os placeholders "<- ✍️ especificar" e, por
 * consequência, a esteira de agentes. `checklistProcesso`, `testes` e
 * `volumetria` continuam existindo no arquivo e são preservados no salvamento
 * (a UI nunca os apaga), mas ganham tela numa rodada própria; misturar as
 * quatro listas numa tela só foi o erro que a SPEC-20 já corrigiu no domínio.
 *
 * `when` (condição sobre os nós) também fica de fora da edição: é a parte mais
 * sutil da configuração, e uma UI ingênua pra ela induziria erro silencioso.
 * Requisito que já tem `when` é mostrado com um selo e preservado intacto.
 */
export function RegrasTab() {
  const [regras, setRegras] = useState<RegrasConfig | null>(null);
  const [techSelecionada, setTechSelecionada] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novoTexto, setNovoTexto] = useState("");
  const [novosContextos, setNovosContextos] = useState("");

  useEffect(() => {
    apiRegras
      .obter()
      .then((r) => {
        setRegras(r);
        setTechSelecionada(Object.keys(r.porTech ?? {})[0] ?? "");
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  if (erro && !regras) return <p style={erroEstilo}>{erro}</p>;
  if (!regras) return <p style={{ color: "var(--texto-fraco)", fontSize: 13 }}>Carregando regras…</p>;

  const techs = Object.keys(regras.porTech ?? {});
  const daTech = techSelecionada ? (regras.porTech[techSelecionada]?.checklistTecnico ?? []) : [];

  async function gravar(novo: RegrasConfig) {
    setRegras(novo);
    setSalvando(true);
    setErro(null);
    try {
      await apiRegras.salvar(novo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  /** Substitui só o `checklistTecnico` da tech, preservando o resto do bloco
   * (processo/testes/volumetria) — a UI não é dona do arquivo inteiro. */
  function comChecklist(lista: Requisito[]): RegrasConfig {
    const bloco = regras!.porTech[techSelecionada] ?? { checklistTecnico: [], testes: [] };
    return { ...regras!, porTech: { ...regras!.porTech, [techSelecionada]: { ...bloco, checklistTecnico: lista } } };
  }

  function adicionar(texto: string, contextos: string[]) {
    if (!texto.trim() || !techSelecionada) return;
    void gravar(comChecklist([...daTech, { texto: texto.trim(), contextos }]));
    setNovoTexto("");
    setNovosContextos("");
  }

  function remover(i: number) {
    void gravar(comChecklist(daTech.filter((_, n) => n !== i)));
  }

  function editarTexto(i: number, texto: string) {
    setRegras(comChecklist(daTech.map((r, n) => (n === i ? { ...r, texto } : r))));
  }

  function editarContextos(i: number, texto: string) {
    const contextos = texto.split(",").map((c) => c.trim()).filter(Boolean);
    setRegras(comChecklist(daTech.map((r, n) => (n === i ? { ...r, contextos } : r))));
  }

  return (
    <div>
      <p style={introTextoEstilo}>
        Cada requisito daqui vira uma linha de "refinamento técnico" nos itens gerados para a tech correspondente —
        é o que a esteira de agentes recebe pra responder. Contextos vazios valem sempre que a tech aparecer; com
        contextos, o requisito só entra nos itens daquele contexto.
      </p>

      <div style={{ ...cardEstilo, display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 12.5, color: "var(--texto-2)" }}>Tecnologia</label>
        <select
          value={techSelecionada}
          onChange={(e) => setTechSelecionada(e.target.value)}
          style={selectEstilo}
          aria-label="Tecnologia"
        >
          {techs.map((t) => (
            <option key={t} value={t}>
              {t} ({regras.porTech[t]?.checklistTecnico?.length ?? 0})
            </option>
          ))}
        </select>
        {salvando && <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>salvando…</span>}
        {erro && <span style={{ fontSize: 11.5, color: "var(--vermelho)" }}>{erro}</span>}
      </div>

      {techSelecionada && (
        <SugerirComIa<SugestaoRegra>
          alvo="regra-refinamento"
          contexto={`Tecnologia: ${techSelecionada}. Requisitos que já existem: ${
            daTech.map((r) => r.texto).join("; ") || "(nenhum)"
          }`}
          exemplo="ex.: o que o time precisa decidir sobre idempotência de mensagem"
          onSugestao={(s) => adicionar(s.texto, s.contextos ?? [])}
        />
      )}

      <div style={{ ...cardEstilo, marginTop: 12 }}>
        <strong style={{ fontSize: 13, color: "var(--texto)" }}>
          Requisitos de refinamento técnico{techSelecionada ? ` · ${techSelecionada}` : ""}
        </strong>

        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {daTech.map((r, i) => (
            <li key={i} style={linhaEstilo} data-testid={`regra-${i}`}>
              <textarea
                value={r.texto}
                onChange={(e) => editarTexto(i, e.target.value)}
                onBlur={() => void gravar(regras)}
                rows={2}
                aria-label={`Texto do requisito ${i + 1}`}
                style={textareaEstilo}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <input
                  value={r.contextos.join(", ")}
                  onChange={(e) => editarContextos(i, e.target.value)}
                  onBlur={() => void gravar(regras)}
                  placeholder="contextos (separados por vírgula) — vazio vale sempre"
                  aria-label={`Contextos do requisito ${i + 1}`}
                  style={inputEstilo}
                />
                {r.when && (
                  <span style={seloWhenEstilo} title="Este requisito tem uma condição (`when`) editável só no arquivo">
                    condicional
                  </span>
                )}
                <button onClick={() => remover(i)} style={botaoRemoverEstilo} aria-label={`Remover requisito ${i + 1}`}>
                  remover
                </button>
              </div>
            </li>
          ))}
          {daTech.length === 0 && (
            <li style={{ fontSize: 12.5, color: "var(--texto-mudo)" }}>
              Nenhum requisito para esta tecnologia ainda.
            </li>
          )}
        </ul>

        <div style={{ ...linhaEstilo, marginTop: 10 }}>
          <textarea
            value={novoTexto}
            onChange={(e) => setNovoTexto(e.target.value)}
            rows={2}
            placeholder="Novo requisito — ex.: Definir a política de retry e o timeout da chamada"
            aria-label="Novo requisito"
            style={textareaEstilo}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={novosContextos}
              onChange={(e) => setNovosContextos(e.target.value)}
              placeholder="contextos (opcional)"
              aria-label="Contextos do novo requisito"
              style={inputEstilo}
            />
            <button
              onClick={() => adicionar(novoTexto, novosContextos.split(",").map((c) => c.trim()).filter(Boolean))}
              disabled={!novoTexto.trim() || !techSelecionada}
              style={botaoAdicionarEstilo}
            >
              + Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  margin: "0 0 14px",
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 12,
  background: "var(--painel)",
};

const linhaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 6,
  padding: 8,
  background: "var(--painel-alto, #15202D)",
};

const textareaEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 12.5,
  resize: "vertical",
};

const inputEstilo: React.CSSProperties = { ...textareaEstilo, flex: 1, resize: undefined };

const selectEstilo: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 12.5,
};

const botaoAdicionarEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoRemoverEstilo: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-fraco)",
  fontSize: 11.5,
  cursor: "pointer",
};

const seloWhenEstilo: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--amarelo)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 4,
  padding: "2px 6px",
  whiteSpace: "nowrap",
};

const erroEstilo: React.CSSProperties = { color: "var(--vermelho)", fontSize: 12.5 };

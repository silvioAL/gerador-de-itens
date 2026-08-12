import { useEffect, useState } from "react";
import type { DiagramaConfig } from "@gerador/engine";
import { apiPerfisStack, type PerfilStackCatalogo } from "../api/client";

/**
 * SPEC-42 — a tela de stack é CATÁLOGO-primeiro, e o time é só um ponteiro.
 *
 * Substitui a `demo/PerfisTimeTab`, que renderizava cards POR TIME projetando
 * o perfil apontado: times compartilhando perfil viravam cards duplicados, e
 * o "editar" num card de time gravava no perfil compartilhado mudando a stack
 * dos outros em silêncio (achado do usuário, §189). Aqui cada perfil aparece
 * UMA vez, com "usado por" dizendo quem aponta — e editar diz em quantos
 * times o valor vai valer.
 */
export interface PerfisStackTabProps {
  config: DiagramaConfig;
  timeAtivo: string;
  /** Apontar/editar muda as sugestões projetadas — o App recarrega. */
  onPerfisMudaram: () => void;
}

/** Campos sugeríveis excluem o de identidade (`identificador: true`): valor
 * fixo pra nome de serviço/tópico/tabela não faz sentido (ver FieldSpec). */
function camposSugeriveis(config: DiagramaConfig, tipoNo: string) {
  return (config.nodeTypes[tipoNo]?.spec ?? []).filter((c) => !c.identificador);
}

function primeiroCampoSugerivel(config: DiagramaConfig, tipoNo: string): string {
  return camposSugeriveis(config, tipoNo)[0]?.key ?? "";
}

interface FormularioValor {
  perfilId: string;
  tipoNo: string;
  campo: string;
  valor: string;
}

export function PerfisStackTab({ config, timeAtivo, onPerfisMudaram }: PerfisStackTabProps) {
  const [catalogo, setCatalogo] = useState<{ perfis: PerfilStackCatalogo[]; ponteiros: Record<string, string> } | null>(null);
  const [formulario, setFormulario] = useState<FormularioValor | null>(null);
  const [nomeNovoPerfil, setNomeNovoPerfil] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    try {
      setCatalogo(await apiPerfisStack.catalogo());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void recarregar();
  }, []);

  // Ponteiros invertidos: perfil → times que o usam. É o que torna o
  // compartilhamento VISÍVEL (a raiz da confusão time≠stack).
  const timesDoPerfil: Record<string, string[]> = {};
  for (const [timeId, perfilId] of Object.entries(catalogo?.ponteiros ?? {})) {
    (timesDoPerfil[perfilId] ??= []).push(timeId);
  }

  async function apontar(perfilId: string) {
    setErro(null);
    try {
      await apiPerfisStack.apontar(timeAtivo, perfilId === "" ? null : perfilId);
      await recarregar();
      onPerfisMudaram();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function criarPerfil() {
    if (!nomeNovoPerfil.trim()) return;
    setErro(null);
    try {
      await apiPerfisStack.criar(nomeNovoPerfil.trim());
      setNomeNovoPerfil("");
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  function abrirNovoValor(perfilId: string) {
    const primeiroTipo = Object.keys(config.nodeTypes)[0] ?? "";
    setFormulario({ perfilId, tipoNo: primeiroTipo, campo: primeiroCampoSugerivel(config, primeiroTipo), valor: "" });
  }

  async function salvarValor() {
    if (!formulario) return;
    const { perfilId, tipoNo, campo, valor } = formulario;
    if (!perfilId || !tipoNo || !campo.trim() || !valor.trim()) return;
    setErro(null);
    try {
      await apiPerfisStack.definirValores(perfilId, tipoNo, { [campo.trim()]: valor.trim() });
      setFormulario(null);
      await recarregar();
      onPerfisMudaram();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  const perfis = catalogo?.perfis ?? [];
  const perfilDoForm = formulario ? perfis.find((p) => p.id === formulario.perfilId) : undefined;
  const timesAfetados = formulario ? (timesDoPerfil[formulario.perfilId] ?? []) : [];

  return (
    <div>
      <p style={introTextoEstilo}>
        <strong>Time não é stack.</strong> A stack é um perfil nomeado no <strong>catálogo da organização</strong>
        {" "}("Java + Spring Boot", "Node 20 + Fastify"…); o time só <em>aponta</em> um perfil, e trocar de tecnologia é
        trocar o ponteiro. Os valores do perfil apontado viram sugestões nos campos de nós novos. Dá pra capturar
        valores usando a ferramenta: preencha um nó e clique em "💾 salvar estes valores como padrão do time" no painel
        — grava no perfil que o time aponta.
      </p>

      {/* ── O vínculo do TIME: uma linha, separada do catálogo. ── */}
      <div style={cardEstilo} data-testid="stack-do-time">
        <strong style={{ fontSize: 13, color: "var(--texto)" }}>Stack do time ativo ({timeAtivo})</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <select
            aria-label="Perfil de stack do time ativo"
            value={catalogo?.ponteiros[timeAtivo] ?? ""}
            onChange={(e) => void apontar(e.target.value)}
            style={inputFormEstilo}
          >
            <option value="">— sem perfil —</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", margin: "8px 0 0" }}>{erro}</p>}
      </div>

      {/* ── O catálogo: perfis da organização, cada um UMA vez. ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "18px 0 8px" }}>
        <strong style={{ fontSize: 13, color: "var(--texto)" }}>Catálogo de perfis</strong>
        <input
          aria-label="Nome do novo perfil de stack"
          value={nomeNovoPerfil}
          onChange={(e) => setNomeNovoPerfil(e.target.value)}
          placeholder="ex.: Node 20 + Fastify"
          style={inputFormEstilo}
        />
        <button onClick={() => void criarPerfil()} style={botaoAdicionarEstilo} disabled={!nomeNovoPerfil.trim()}>
          + Criar perfil
        </button>
      </div>

      {formulario && (
        <div style={formularioEstilo} data-testid="form-valor-de-perfil">
          <label style={labelFormEstilo}>Perfil</label>
          <select
            aria-label="Perfil"
            value={formulario.perfilId}
            onChange={(e) => setFormulario({ ...formulario, perfilId: e.target.value })}
            style={inputFormEstilo}
          >
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>

          <label style={labelFormEstilo}>Componente</label>
          <select
            aria-label="Componente"
            value={formulario.tipoNo}
            onChange={(e) => {
              const novoTipo = e.target.value;
              setFormulario({ ...formulario, tipoNo: novoTipo, campo: primeiroCampoSugerivel(config, novoTipo) });
            }}
            style={inputFormEstilo}
          >
            {Object.entries(config.nodeTypes).map(([tipo, cfg]) => (
              <option key={tipo} value={tipo}>
                {cfg.label}
              </option>
            ))}
          </select>

          <label style={labelFormEstilo}>Campo</label>
          <select
            aria-label="Campo"
            value={formulario.campo}
            onChange={(e) => setFormulario({ ...formulario, campo: e.target.value })}
            style={inputFormEstilo}
          >
            {camposSugeriveis(config, formulario.tipoNo).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <label style={labelFormEstilo}>Valor</label>
          <input
            aria-label="Valor"
            value={formulario.valor}
            onChange={(e) => setFormulario({ ...formulario, valor: e.target.value })}
            style={inputFormEstilo}
          />

          {/* O aviso que faltava: editar perfil compartilhado afeta todo mundo. */}
          <p style={{ fontSize: 12, color: "var(--texto-fraco)", margin: "8px 0 0" }} data-testid="alcance-do-valor">
            {timesAfetados.length > 1
              ? `Este valor vale para os ${timesAfetados.length} times que apontam "${perfilDoForm?.nome}": ${timesAfetados.join(", ")}.`
              : timesAfetados.length === 1
                ? `Este valor vale para ${timesAfetados[0]} (único time apontando "${perfilDoForm?.nome}").`
                : `Nenhum time aponta "${perfilDoForm?.nome}" ainda — o valor fica pronto pra quando apontarem.`}
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => void salvarValor()} style={botaoAdicionarEstilo} data-testid="salvar-valor-de-perfil">
              Salvar no perfil
            </button>
            <button onClick={() => setFormulario(null)} style={botaoCancelarEstilo}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 8 }}>
        {perfis.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--texto-mudo)" }}>
            Catálogo vazio — crie o primeiro perfil acima (ex.: "Java + Spring Boot") e aponte o seu time pra ele, ou
            capture valores pelo painel de um nó.
          </p>
        )}
        {perfis.map((perfil) => {
          const usadoPor = timesDoPerfil[perfil.id] ?? [];
          return (
            <div key={perfil.id} style={cardEstilo} data-testid={`perfil-${perfil.nome}`}>
              <strong style={{ fontSize: 13, color: "var(--texto)" }}>{perfil.nome}</strong>
              <p style={{ fontSize: 11.5, color: "var(--texto-fraco)", margin: "4px 0 0" }}>
                {usadoPor.length > 0 ? `usado por: ${usadoPor.join(", ")}` : "nenhum time aponta este perfil"}
              </p>
              {Object.entries(perfil.valores).map(([tipo, campos]) => (
                <div key={tipo} style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--texto-fraco)", textTransform: "uppercase" }}>
                    {config.nodeTypes[tipo]?.label ?? tipo}
                  </div>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12.5, color: "var(--texto-2)", listStyle: "none" }}>
                    {Object.entries(campos).map(([campo, valor]) => (
                      <li key={campo} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span>
                          {campo}: <strong>{String(valor)}</strong>
                        </span>
                        <button
                          onClick={() => setFormulario({ perfilId: perfil.id, tipoNo: tipo, campo, valor: String(valor) })}
                          style={linkBotaoEstilo}
                          aria-label={`Editar ${campo} de ${config.nodeTypes[tipo]?.label ?? tipo} no perfil ${perfil.nome}`}
                        >
                          editar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button onClick={() => abrirNovoValor(perfil.id)} style={{ ...linkBotaoEstilo, marginTop: 8 }}>
                + adicionar valor
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  maxWidth: 760,
  marginTop: 0,
};

const cardEstilo: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel-alto)",
};

const formularioEstilo: React.CSSProperties = {
  ...cardEstilo,
  marginBottom: 12,
};

const labelFormEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--texto-fraco)",
  margin: "8px 0 2px",
};

const inputFormEstilo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  minWidth: 180,
};

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
};

const botaoCancelarEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
};

const linkBotaoEstilo: React.CSSProperties = {
  fontSize: 11.5,
  border: "none",
  background: "transparent",
  color: "var(--acento-claro, #818cf8)",
  cursor: "pointer",
  padding: 0,
};

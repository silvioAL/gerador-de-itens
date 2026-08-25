import { useEffect, useState } from "react";
import type { ChecagemDeTopologia, DiagramaConfig, RequisitoDeTopologia } from "@gerador/engine";

/**
 * SPEC-63 fatia D — a régua sobre a FORMA, editável pela tela.
 *
 * ## Por que esta fatia não é opcional
 *
 * As réguas de PERCURSO vivem no documento e não têm editor: só se configuram
 * por API. É aceitável para nascer e ruim para viver, e o §194 já mostrou o que
 * acontece com capacidade sem porta na tela — o feedback que o agente coletava
 * e ninguém via. Uma régua que só se escreve em JSON é uma régua que o time não
 * tem.
 *
 * ## O editor só oferece o que existe
 *
 * Os tipos de componente e de conexão vêm de `DiagramaConfig`, em `<select>`.
 * É isso que impede a régua de nascer quebrada, e é melhor que validar depois:
 * `validateRegras` continua guardando o caminho de quem edita o arquivo à mão,
 * mas por aqui não dá para apontar para um tipo que não existe.
 *
 * ## O id não é digitado
 *
 * Ele nasce do texto (mesma ideia da chave técnica do campo, SPEC-52) e é a
 * chave estável a que as exceções se prendem. Pedir à pessoa que invente um
 * identificador seria pedir a coisa errada no momento errado.
 */
export interface FormaDoDesenhoProps {
  config: DiagramaConfig;
  requisitos: RequisitoDeTopologia[];
  onMudar: (requisitos: RequisitoDeTopologia[]) => void;
  /** Só leitura quando quem abriu não edita esta seção (RBAC por seção). */
  somenteLeitura?: boolean;
}

/** O id sai do texto, como a chave técnica do campo sai do rótulo (SPEC-52). */
export function idDaRegraDeForma(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `forma-${base || "regra"}`;
}

/** A frase que descreve a regra em português, para a lista e para a conferência. */
export function descreverForma(c: ChecagemDeTopologia, config: DiagramaConfig): string {
  const no = (t: string) => config.nodeTypes[t]?.label ?? t;
  const aresta = (t?: string) => (t ? `"${config.edgeTypes[t]?.label ?? t}"` : "");
  if (c.tipo === "exige-conexao") {
    const alvo = c.tipoNoOposto ? ` ${c.direcao === "sai" ? "para" : "de"} ${no(c.tipoNoOposto)}` : "";
    return `Todo ${no(c.tipoNo)} precisa de uma conexão ${aresta(c.tipoAresta)} ${
      c.direcao === "sai" ? "saindo" : "entrando"
    }${alvo}`.replace(/\s+/g, " ");
  }
  return `Nenhuma conexão ${aresta(c.tipoAresta)} pode ligar ${no(c.deTipoNo)} a ${no(c.paraTipoNo)}`.replace(
    /\s+/g,
    " "
  );
}

/**
 * O construtor da régua, sozinho — sem a lista.
 *
 * Extraído para o estúdio do PDCA usar o MESMO formulário (SPEC-63 fatia D): a
 * régua que nasce de um feedback e a que nasce na tela de configuração têm de
 * ser a mesma coisa, e duas cópias divergiriam na primeira mudança. É a lição
 * do `Delta` (§263), aplicada de novo.
 *
 * `onMudou` reporta a régua montada a cada tecla — quem hospeda decide se
 * grava, se mostra prévia, ou os dois.
 */
export function ConstrutorDeForma({
  config,
  onMudou,
  onAdicionar,
}: {
  config: DiagramaConfig;
  onMudou?: (requisito: RequisitoDeTopologia | null) => void;
  /** Ausente = o construtor não tem botão próprio (quem hospeda salva). */
  onAdicionar?: (requisito: RequisitoDeTopologia) => void;
}) {
  const tiposNo = Object.entries(config.nodeTypes);
  const tiposAresta = Object.entries(config.edgeTypes ?? {});

  const [tipo, setTipo] = useState<ChecagemDeTopologia["tipo"]>("exige-conexao");
  const [texto, setTexto] = useState("");
  const [porque, setPorque] = useState("");
  const [tipoNo, setTipoNo] = useState(tiposNo[0]?.[0] ?? "");
  const [direcao, setDirecao] = useState<"entra" | "sai">("sai");
  const [tipoAresta, setTipoAresta] = useState("");
  const [tipoNoOposto, setTipoNoOposto] = useState("");
  const [deTipoNo, setDeTipoNo] = useState(tiposNo[0]?.[0] ?? "");
  const [paraTipoNo, setParaTipoNo] = useState(tiposNo[1]?.[0] ?? tiposNo[0]?.[0] ?? "");

  const checagem: ChecagemDeTopologia =
    tipo === "exige-conexao"
      ? {
          tipo: "exige-conexao",
          tipoNo,
          direcao,
          ...(tipoAresta ? { tipoAresta } : {}),
          ...(tipoNoOposto ? { tipoNoOposto } : {}),
        }
      : { tipo: "proibe-conexao", deTipoNo, paraTipoNo, ...(tipoAresta ? { tipoAresta } : {}) };

  const requisito: RequisitoDeTopologia | null = texto.trim()
    ? {
        id: idDaRegraDeForma(texto),
        texto: texto.trim(),
        ...(porque.trim() ? { porque: porque.trim() } : {}),
        checagem,
      }
    : null;

  useEffect(() => {
    onMudou?.(requisito);
    // `JSON.stringify` e não o objeto: ele é recriado a cada render, e a
    // dependência por referência dispararia o efeito sem nada ter mudado.
  }, [JSON.stringify(requisito)]);

  return (
    <div style={{ ...cartaoEstilo, borderColor: "var(--acento)" }}>
      <label style={labelEstilo}>O que o desenho precisa respeitar</label>
      <input
        aria-label="Texto da régua de forma"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="ex.: Toda fila tem consumidor"
        style={inputEstilo}
      />

      <label style={labelEstilo}>Por quê (o que esta régua evita)</label>
      <input
        aria-label="Por que esta régua existe"
        value={porque}
        onChange={(e) => setPorque(e.target.value)}
        placeholder="ex.: fila sem quem consuma acumula em silêncio até estourar o disco"
        style={inputEstilo}
      />

      <label style={labelEstilo}>Tipo de régua</label>
      <select
        aria-label="Tipo de régua de forma"
        value={tipo}
        onChange={(e) => setTipo(e.target.value as ChecagemDeTopologia["tipo"])}
        style={inputEstilo}
      >
        <option value="exige-conexao">Exigir uma conexão</option>
        <option value="proibe-conexao">Proibir uma conexão</option>
      </select>

      {tipo === "exige-conexao" ? (
        <>
          <label style={labelEstilo}>Componente que precisa da conexão</label>
          <select aria-label="Componente da régua" value={tipoNo} onChange={(e) => setTipoNo(e.target.value)} style={inputEstilo}>
            {tiposNo.map(([k, v]) => (
              <option key={k} value={k}>
                {v.label ?? k}
              </option>
            ))}
          </select>

          <label style={labelEstilo}>Direção</label>
          <select
            aria-label="Direção da conexão"
            value={direcao}
            onChange={(e) => setDirecao(e.target.value as "entra" | "sai")}
            style={inputEstilo}
          >
            <option value="sai">saindo dele</option>
            <option value="entra">entrando nele</option>
          </select>

          <label style={labelEstilo}>Ligada a (opcional)</label>
          <select
            aria-label="Componente do outro lado"
            value={tipoNoOposto}
            onChange={(e) => setTipoNoOposto(e.target.value)}
            style={inputEstilo}
          >
            <option value="">qualquer componente</option>
            {tiposNo.map(([k, v]) => (
              <option key={k} value={k}>
                {v.label ?? k}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label style={labelEstilo}>De</label>
          <select aria-label="Componente de origem" value={deTipoNo} onChange={(e) => setDeTipoNo(e.target.value)} style={inputEstilo}>
            {tiposNo.map(([k, v]) => (
              <option key={k} value={k}>
                {v.label ?? k}
              </option>
            ))}
          </select>

          <label style={labelEstilo}>Para</label>
          <select aria-label="Componente de destino" value={paraTipoNo} onChange={(e) => setParaTipoNo(e.target.value)} style={inputEstilo}>
            {tiposNo.map(([k, v]) => (
              <option key={k} value={k}>
                {v.label ?? k}
              </option>
            ))}
          </select>
        </>
      )}

      <label style={labelEstilo}>Tipo de conexão (opcional)</label>
      <select aria-label="Tipo de conexão" value={tipoAresta} onChange={(e) => setTipoAresta(e.target.value)} style={inputEstilo}>
        <option value="">qualquer conexão</option>
        {tiposAresta.map(([k, v]) => (
          <option key={k} value={k}>
            {v.label ?? k}
          </option>
        ))}
      </select>

      {/* A frase montada, antes de gravar: é o que a pessoa vai ler no placar
          quando o desenho contrariar a régua. */}
      <p style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "10px 0 0" }} data-testid="forma-previa">
        Vai conferir: {descreverForma(checagem, config)}
      </p>

      {onAdicionar && (
        <button
          onClick={() => {
            if (!requisito) return;
            onAdicionar(requisito);
            setTexto("");
            setPorque("");
          }}
          disabled={!requisito}
          style={botaoEstilo}
          data-testid="adicionar-forma"
        >
          Adicionar régua de forma
        </button>
      )}
    </div>
  );
}

export function FormaDoDesenho({ config, requisitos, onMudar, somenteLeitura }: FormaDoDesenhoProps) {
  return (
    <div data-testid="forma-do-desenho">
      <p style={introEstilo}>
        O que o <strong>desenho</strong> precisa respeitar — a classe de problema que não mora em campo nenhum: uma
        fila sem consumidor, o app falando direto com o banco. Diferente das outras seções, a régua aqui não é por
        tecnologia: ela atravessa o desenho inteiro.
      </p>

      {requisitos.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }} data-testid="forma-vazia">
          Nenhuma régua de forma ainda. Sem elas, um desenho pode estar com todos os campos preenchidos e ainda assim
          contrariar o padrão da casa.
        </p>
      )}

      {requisitos.map((r) => (
        <div key={r.id} style={cartaoEstilo} data-testid={`forma-regra-${r.id}`}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{r.texto}</strong>
            <div style={{ flex: 1 }} />
            {!somenteLeitura && (
              <button
                onClick={() => onMudar(requisitos.filter((x) => x.id !== r.id))}
                style={linkEstilo}
                data-testid={`remover-forma-${r.id}`}
              >
                remover
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--texto-2)" }}>{descreverForma(r.checagem, config)}</div>
          {/* §242 — o porquê é o que separa ensinar de cobrar. */}
          {r.porque && <div style={{ fontSize: 11, color: "var(--texto-mudo)", marginTop: 2 }}>Por quê: {r.porque}</div>}
        </div>
      ))}

      {!somenteLeitura && (
        <ConstrutorDeForma
          config={config}
          onAdicionar={(r) => onMudar([...requisitos.filter((x) => x.id !== r.id), r])}
        />
      )}
    </div>
  );
}

const introEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  margin: "0 0 12px",
  maxWidth: 700,
};

const cartaoEstilo: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--borda)",
  background: "var(--painel-alto)",
  marginBottom: 10,
};

const labelEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--texto-fraco)",
  margin: "10px 0 2px",
};

const inputEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  cursor: "pointer",
  marginTop: 10,
};

const linkEstilo: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  padding: 0,
  border: "none",
  background: "none",
  color: "#a5b4fc",
  cursor: "pointer",
};

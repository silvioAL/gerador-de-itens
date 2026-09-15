import { useState } from "react";
import { apiIa, type ScriptDeMapeamento } from "../api/client";

/**
 * SPEC-115 fatia F (§411) — **mapear um componente e decidir sobre ele.**
 *
 * ## O que o usuário não achou, e tinha razão
 *
 * > *"quanto a poder selecionar os componentes, pegar o script de mapeamento
 * > com o assistente e iterar em uma janela maior com ele para tomar decisões
 * > sobre o componente não achei nada"*
 *
 * As três coisas faltavam, e a rodada anterior entregou a fatia F **no lugar
 * errado**: uma caixa de conversa na tela do DOCUMENTO, no nível da demanda. A
 * SPEC-115 §1.1.1 corrige exatamente contra isso — *"faz mais sentido dentro do
 * painel do componente, não como uma conversa solta no nível da demanda"* —
 * porque um desenho com oito componentes discutidos na mesma conversa produz
 * decisões cujo contexto se perde.
 *
 * ## Os três passos, e por que o do meio é da pessoa
 *
 * ```
 * 1. o agente escreve o comando   → ele sabe O QUE perguntar, dado o tipo
 * 2. a pessoa roda onde tem acesso → só ela tem credencial, rede e permissão
 * 3. ela cola a saída de volta      → e aí a conversa passa a ser sobre fatos
 * ```
 *
 * O passo 2 não é uma limitação a ser removida depois: é a fronteira decidida
 * na SPEC-75 e reafirmada na SPEC-115 §2. Um produto que executa script no
 * ambiente de quem o usa precisa de credencial, de rede e de uma superfície de
 * ataque que ele não tem motivo para ter.
 *
 * ## Por que aqui, e não no PropertiesPanel
 *
 * O §1.1.1 diz "dentro do painel do componente". O painel tem ~280 px e o gesto
 * aqui é colar a saída de um script e iterar — o pedido do usuário é literal
 * sobre isso (*"iterar em uma janela maior"*). A conciliação: **a entrada mora
 * no painel do componente** (o botão em `DecisoesDoNo`, ao lado das decisões que
 * já vivem lá) e **a conversa acontece na janela do assistente**, que agora
 * expande. O recorte por componente — que é o que a §1.1.1 realmente protege —
 * se mantém: esta aba só existe com um nó selecionado, e é sobre ele.
 */
export interface ComponenteEmFoco {
  id: string;
  rotulo: string;
  tipo: string;
  techs?: string[];
  campos?: string;
}

export interface ConversaDoComponenteProps {
  /** `null` = nenhum componente selecionado na mesa. */
  componente: ComponenteEmFoco | null;
  /**
   * Manda o contexto colado ao agente e devolve quantas decisões ele propôs.
   * As decisões em si vão para a mesa, ancoradas no `noId` — é lá que elas são
   * aceitas, ao lado do desenho a que se referem.
   */
  onDecidir: (pedido: { contextoDoProjeto: string; foco?: string }) => Promise<number>;
}

export function ConversaDoComponente({ componente, onDecidir }: ConversaDoComponenteProps) {
  const [script, setScript] = useState<ScriptDeMapeamento | null>(null);
  const [pedindoScript, setPedindoScript] = useState(false);
  const [saida, setSaida] = useState("");
  const [decidindo, setDecidindo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (!componente) {
    // Sem componente, esta aba não tem assunto. Dizer isso é melhor que oferecer
    // campos que não levam a lugar nenhum — a régua do §244.
    return (
      <div style={corpoEstilo} data-testid="conversa-do-componente-sem-foco">
        <p style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6, margin: 0 }}>
          Selecione um componente na mesa para mapear o que já existe dele e decidir com o assistente.
        </p>
        <p style={{ fontSize: 11.5, color: "var(--texto-mudo)", lineHeight: 1.6, margin: "10px 0 0" }}>
          A conversa é <strong>por componente</strong> de propósito: discutir oito na mesma janela produz decisões que
          não dizem de qual chamada estão falando.
        </p>
      </div>
    );
  }

  async function pedirScript() {
    if (!componente) return;
    setPedindoScript(true);
    setErro(null);
    try {
      setScript(
        await apiIa.scriptDeMapeamento({
          rotulo: componente.rotulo,
          tipo: componente.tipo,
          techs: componente.techs,
          campos: componente.campos,
        })
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setPedindoScript(false);
    }
  }

  async function decidir() {
    if (!componente) return;
    setDecidindo(true);
    setErro(null);
    setResultado(null);
    try {
      const quantas = await onDecidir({ contextoDoProjeto: saida, foco: componente.id });
      setResultado(
        quantas === 0
          ? "O agente não viu escolha em aberto neste componente — lista vazia é resposta legítima, e é melhor que decisão inventada para preencher cota."
          : `${quantas} ${quantas === 1 ? "decisão proposta" : "decisões propostas"}, ancorada${quantas === 1 ? "" : "s"} em ${componente.rotulo}. Elas estão na mesa, como PROPOSTA — aceitar é seu.`
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setDecidindo(false);
    }
  }

  return (
    <div style={corpoEstilo} data-testid="conversa-do-componente">
      <p style={{ fontSize: 12.5, color: "var(--texto-2)", margin: "0 0 10px", lineHeight: 1.6 }}>
        Sobre <strong data-testid="componente-em-foco">{componente.rotulo}</strong>{" "}
        <span style={{ color: "var(--texto-mudo)" }}>({componente.tipo})</span>
      </p>

      {/* PASSO 1 — o agente sabe O QUE perguntar, dado o tipo. */}
      <p style={passoEstilo}>1 · Levantar o que já existe</p>
      <button onClick={() => void pedirScript()} disabled={pedindoScript} style={botaoEstilo} data-testid="pedir-script">
        {pedindoScript ? "montando…" : "✦ Pedir o script de mapeamento"}
      </button>
      {script && (
        <>
          {/* O porquê ANTES do comando: quem vai colar algo num terminal
              decide isso lendo o propósito, não o `awk`. */}
          <p data-testid="porque-do-script" style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "8px 0 0", lineHeight: 1.55 }}>
            {script.porque}
          </p>
          <pre data-testid="script-de-mapeamento" style={scriptEstilo}>
            {script.script}
          </pre>
          {/* A frase que impede o mal-entendido mais caro possível desta tela.
              Quem lê "script" numa ferramenta espera um botão de rodar. */}
          <p style={{ fontSize: 11, color: "var(--amarelo)", margin: "6px 0 0", lineHeight: 1.5 }}>
            Rode você, onde tem acesso. O gerador não executa nada — ele não tem, nem deveria ter, credencial do seu
            ambiente.
          </p>
        </>
      )}

      {/* PASSO 2 — a saída volta, e a conversa passa a ser sobre fatos. */}
      <p style={{ ...passoEstilo, marginTop: 16 }}>2 · Colar o que voltou</p>
      <textarea
        aria-label="Saída do mapeamento"
        value={saida}
        onChange={(e) => setSaida(e.target.value)}
        rows={10}
        placeholder="Cole aqui a saída dos comandos — ou qualquer contexto do projeto que você já tenha. Componente novo? Deixe em branco."
        style={saidaEstilo}
      />

      {/* PASSO 3 — e a decisão nasce ancorada NESTE componente. */}
      <p style={{ ...passoEstilo, marginTop: 16 }}>3 · Decidir com o assistente</p>
      <button onClick={() => void decidir()} disabled={decidindo} style={botaoPrimarioEstilo} data-testid="decidir-sobre-componente">
        {decidindo ? "conversando…" : "✦ Propor decisões sobre este componente"}
      </button>

      {resultado && (
        <p data-testid="resultado-da-conversa-do-componente" style={{ fontSize: 12, color: "var(--texto-2)", margin: "10px 0 0", lineHeight: 1.55 }}>
          {resultado}
        </p>
      )}
      {erro && (
        <p data-testid="erro-da-conversa-do-componente" style={{ fontSize: 12, color: "var(--vermelho)", margin: "10px 0 0" }}>
          {erro}
        </p>
      )}
    </div>
  );
}

const corpoEstilo: React.CSSProperties = { padding: "12px 14px", overflow: "auto", flex: 1, minHeight: 0 };

const passoEstilo: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "var(--texto-mudo)",
  margin: "0 0 6px",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const botaoPrimarioEstilo: React.CSSProperties = {
  ...botaoEstilo,
  background: "var(--acento)",
  borderColor: "var(--acento)",
  color: "#fff",
};

/** Monoespaçado e rolável: é para copiar, não para ler em diagonal. */
const scriptEstilo: React.CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--fundo)",
  color: "var(--texto)",
  fontSize: 11.5,
  fontFamily: "ui-monospace, monospace",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  maxHeight: 280,
  overflow: "auto",
};

const saidaEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12,
  fontFamily: "ui-monospace, monospace",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--fundo)",
  color: "var(--texto)",
  resize: "vertical",
};

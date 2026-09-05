import { useEffect, useState } from "react";
import { chaveDaRegra, type RegrasConfig } from "@gerador/engine";
import { apiRegrasDoProduto } from "../api/client";

/**
 * SPEC-86 fatia C — **o checklist deste produto, ao lado do da casa.**
 *
 * ## O que esta tela mostra, e por que nesta ordem
 *
 * As regras **em vigor**: as do time e as do produto na mesma lista, cada uma
 * marcada. Duas listas separadas obrigariam quem refina a juntá-las de cabeça
 * para saber o que vai ser cobrado — e é exatamente essa soma que o motor já
 * faz. Mostrar separado seria pedir à pessoa que refizesse a conta.
 *
 * ## O que veio do time não se edita AQUI
 *
 * Aparece, marcado, e sem botão. Editar regra de time é na tela do time, e duas
 * portas para o mesmo arquivo é o §263 — a segunda sempre esquece alguma
 * validação que a primeira faz.
 *
 * ## O herdado não vira cópia
 *
 * A régua que o §306 mediu no `PipelineAgentesTab`: o produto guarda **só o que
 * é dele**. O que vem do time continua vindo do time, e evolui com ele. Se esta
 * tela salvasse a lista inteira, o checklist da casa congelaria dentro do
 * produto no dia em que alguém clicasse em salvar — e ninguém notaria até a
 * regra nova não cobrar nada.
 */
export interface ChecklistDoProdutoProps {
  produtoId: string;
  timeId?: string;
}

interface EmVigor {
  documento: RegrasConfig;
  origemDe: Record<string, "time" | "produto">;
  doProduto: number;
  declaradoNoProduto: RegrasConfig | null;
}

export function ChecklistDoProduto({ produtoId, timeId }: ChecklistDoProdutoProps) {
  const [vigor, setVigor] = useState<EmVigor | null>(null);
  /**
   * A tech sai do DOCUMENTO, não de uma lista escrita aqui.
   *
   * Uma constante local viraria a quinta cópia de "quais techs existem" — e o
   * §263 já mediu o custo disso três vezes. Vazia até a resposta chegar, e a
   * primeira do documento assim que chegar.
   */
  const [tech, setTech] = useState("");
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    apiRegrasDoProduto
      .obter(produtoId, timeId)
      .then((r) => {
        if (cancelado) return;
        const lida = r as EmVigor;
        setVigor(lida);
        setTech((atual) => atual || Object.keys(lida.documento.porTech ?? {})[0] || "");
      })
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelado = true;
    };
  }, [produtoId, timeId]);

  if (erro) {
    return (
      <p data-testid="checklist-produto-erro" style={{ fontSize: 12, color: "var(--vermelho)" }}>
        {erro}
      </p>
    );
  }
  if (!vigor) return <p style={ajudaEstilo}>carregando as regras…</p>;

  const techs = Object.keys(vigor.documento.porTech ?? {});
  const daTech = vigor.documento.porTech[tech];
  const itens = daTech?.checklistTecnico ?? [];

  /**
   * Grava **só o que é do produto**, nunca a lista somada.
   *
   * É a linha mais importante do arquivo: mandar `itens` (que inclui o do time)
   * é o congelamento, e ele seria invisível — a tela continuaria mostrando a
   * mesma coisa no dia seguinte.
   */
  async function gravar(checklistTecnico: { texto: string; contextos: string[] }[]) {
    setSalvando(true);
    setErro(null);
    try {
      const base = vigor!.declaradoNoProduto ?? { tipos: [], tamanhos: [], porTech: {} };
      const documento: RegrasConfig = {
        ...base,
        porTech: {
          ...base.porTech,
          [tech]: { ...(base.porTech[tech] ?? { testes: [] }), checklistTecnico },
        },
      };
      await apiRegrasDoProduto.salvar(produtoId, documento, timeId);
      setVigor((await apiRegrasDoProduto.obter(produtoId, timeId)) as EmVigor);
      setNovo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const declarados = vigor.declaradoNoProduto?.porTech?.[tech]?.checklistTecnico ?? [];

  return (
    <div data-testid="checklist-do-produto">
      <label style={labelEstilo}>Checklist deste produto</label>
      <p style={ajudaEstilo}>
        O checklist do time diz <em>como esta empresa constrói</em>. Este diz <em>o que é verdade sobre este produto</em> —
        e os dois valem. O que você acrescentar aqui entra <strong>junto</strong> com o do time, nunca no lugar dele.
      </p>

      {techs.length > 1 && (
        <select
          aria-label="Tecnologia do checklist"
          data-testid="checklist-produto-tech"
          value={tech}
          onChange={(e) => setTech(e.target.value)}
          style={{ ...inputEstilo, width: 200, marginBottom: 8 }}
        >
          {techs.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
        {itens.map((item) => {
          const doProduto = vigor.origemDe[chaveDaRegra(tech, "checklistTecnico", item.texto)] === "produto";
          return (
            <li
              key={item.texto}
              data-testid={`regra-${doProduto ? "produto" : "time"}`}
              style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--borda)" }}
            >
              <span
                style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: doProduto ? "var(--acento-gente)" : "var(--texto-fraco)", minWidth: 56 }}
              >
                {doProduto ? "produto" : "do time"}
              </span>
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--texto)" }}>{item.texto}</span>
              {/* Só o que é do produto ganha botão: editar regra de time é na
                  tela do time, e a ausência do botão é o que diz isso. */}
              {doProduto && (
                <button
                  onClick={() => void gravar(declarados.filter((d) => d.texto !== item.texto))}
                  disabled={salvando}
                  data-testid={`remover-${item.texto}`}
                  style={linkEstilo}
                >
                  remover
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          aria-label="Novo item do checklist do produto"
          data-testid="checklist-produto-novo"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="ex.: conferir acessibilidade AA nas telas públicas"
          style={{ ...inputEstilo, flex: 1 }}
        />
        <button
          onClick={() => void gravar([...declarados, { texto: novo.trim(), contextos: [] }])}
          disabled={salvando || !novo.trim() || !tech}
          data-testid="checklist-produto-acrescentar"
          style={botaoEstilo}
        >
          acrescentar
        </button>
      </div>

      <p style={ajudaEstilo} data-testid="checklist-produto-contagem">
        {vigor.doProduto === 0
          ? "Este produto ainda não acrescentou nada — vale o checklist do time."
          : `${vigor.doProduto} ${vigor.doProduto === 1 ? "item é" : "itens são"} deste produto; o resto vem do time e evolui com ele.`}
      </p>
    </div>
  );
}

const labelEstilo: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--texto)" };

const ajudaEstilo: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--texto-fraco)",
  lineHeight: 1.6,
  margin: "4px 0 0",
};

const inputEstilo: React.CSSProperties = {
  fontSize: 12.5,
  padding: "6px 8px",
  borderRadius: 7,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
};

const linkEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--acento)",
  fontSize: 11.5,
  cursor: "pointer",
  padding: 0,
};

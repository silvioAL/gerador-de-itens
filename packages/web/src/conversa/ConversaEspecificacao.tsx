import { useRef, useState } from "react";
import { itensImpactados, type Atividade, type FichaItem, type ValorSpec } from "@gerador/engine";
import { apiIa } from "../api/client";
import { JanelaConversa, botaoAcaoEstilo, botaoNeutroEstilo, cartaoEstilo } from "./JanelaConversa";

export interface ConversaEspecificacaoProps {
  atividades: Atividade[];
  /** Ficha por chave de atividade — de onde saem os campos e o valor atual. */
  fichas: Map<string, FichaItem>;
  /** O item aberto na tela: é dele que a conversa fala por padrão. */
  atividadeSelecionada: Atividade;
  contextoEpico?: string;
  /** SPEC-37 M1 — quando a conversa abre por CONDUÇÃO (a esteira terminou),
   * a primeira fala é a do momento, não a saudação padrão do item. */
  falaInicial?: string;
  onAplicar: (atividadeChave: string, chaveCampo: string, resposta: ValorSpec) => void;
  onFechar: () => void;
}

/** Mensagem da conversa guardando DADO, não JSX. Guardar o cartão renderizado
 * no estado o congelava: aceitar/rejeitar mudava o estado, mas o elemento
 * salvo continuava o antigo, e a tela não refletia o clique (pego no teste). */
interface MensagemEspecificacao {
  autor: "voce" | "agente";
  texto: string;
  propostas?: AlteracaoProposta[];
  /** SPEC-37 M6 — a mensagem carrega o chip "Revisar a consistência". */
  chipConsistencia?: boolean;
}

interface AlteracaoProposta {
  atividadeChave: string;
  atividadeRotulo: string;
  campo: string;
  rotuloCampo: string;
  valorAntes: string;
  valorDepois: string;
  motivo: string;
}

/** Campos do item com o valor atual — o modelo precisa do "antes" pra ajustar
 * em vez de reescrever do zero. */
function camposDaFicha(ficha: FichaItem | undefined): { chave: string; rotulo: string; valorAtual?: string }[] {
  if (!ficha) return [];
  // A ordem espelha a da ficha na tela — a pessoa lê a proposta na mesma
  // sequência em que leria o item.
  const todos = [
    ficha.historiaUsuario,
    ficha.criteriosAceiteContextual,
    ...Object.values(ficha.contrato ?? {}),
    ...(ficha.checklistTecnico ?? []),
    ...(ficha.volumetria ?? []),
    ficha.regrasTeste,
    ficha.cenarioFeature,
  ].filter(Boolean);
  return todos.map((p) => ({
    chave: p.chave,
    rotulo: p.rotulo,
    valorAtual: typeof p.resposta?.valor === "string" ? p.resposta.valor : undefined,
  }));
}

/**
 * SPEC-27 Fase 2 — a conversa da especificação.
 *
 * É o fluxo que o usuário já tem hoje com outra ferramenta, nas palavras dele:
 * *"peço para ele alterar um item e depois para ele revisar os demais; ele me
 * devolve as sugestões e vou confirmando"*.
 *
 * Duas decisões que definem o desenho:
 *
 * - **Quem escolhe o escopo da revisão é o app, não o modelo.** "Revisar os
 *   demais" usa `itensImpactados` (grafo de dependências + mesma origem), que
 *   é conta, não opinião. O modelo só escreve o ajuste de cada item. Pedir ao
 *   LLM que descubra as dependências seria dar a ele um trabalho que o app já
 *   sabe fazer com certeza.
 * - **Uma chamada por item.** Resposta pequena por construção — a lição do
 *   lote truncado que apagou o trabalho de um papel inteiro (JOURNEY §93) — e
 *   progresso visível item a item numa esteira que leva minutos.
 *
 * E nada é escrito sem aprovação: cada campo vira um cartão com antes/depois e
 * o porquê. É o Bloco 3 da SPEC-26 aterrissando dentro da conversa, em vez de
 * numa tela própria.
 */
export function ConversaEspecificacao({
  atividades,
  fichas,
  atividadeSelecionada,
  contextoEpico,
  falaInicial,
  onAplicar,
  onFechar,
}: ConversaEspecificacaoProps) {
  const [mensagens, setMensagens] = useState<MensagemEspecificacao[]>([
    {
      autor: "agente",
      texto:
        falaInicial ??
        `Falando sobre o item ${atividadeSelecionada.rotulo}. Diga o que precisa mudar — por texto ou por voz (🎤) — e depois eu reviso os itens que dependem dele, com você confirmando um a um.`,
    },
  ]);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aplicados, setAplicados] = useState<Set<string>>(new Set());
  /** O que já foi aceito nesta conversa — vira o "o que mudou" da revisão dos
   * demais. Sem isso, "revise os demais" não teria o que propagar. */
  const [mudancasAceitas, setMudancasAceitas] = useState<string[]>([]);
  /** SPEC-37 M6 — a pergunta de consistência fala uma vez por conversa. */
  const perguntouConsistencia = useRef(false);

  const impactados = itensImpactados(atividades, atividadeSelecionada.chave);

  function idDe(a: AlteracaoProposta) {
    return `${a.atividadeChave}::${a.campo}`;
  }

  function cartao(alteracoes: AlteracaoProposta[]) {
    if (alteracoes.length === 0) return null;
    return (
      <div style={cartaoEstilo} data-testid="cartao-alteracoes">
        {alteracoes.map((a) => {
          const id = idDe(a);
          const jaAplicado = aplicados.has(id);
          return (
            <div key={id} style={{ marginBottom: 10 }} data-testid={`alteracao-${a.campo}`}>
              <strong style={{ fontSize: 12 }}>
                {a.atividadeRotulo} · {a.rotuloCampo}
              </strong>
              <div style={{ fontSize: 11.5, color: "var(--texto-2)", margin: "2px 0 6px" }}>{a.motivo}</div>
              {a.valorAntes && (
                <pre style={antesEstilo}>
                  {a.valorAntes.length > 300 ? `${a.valorAntes.slice(0, 300)}…` : a.valorAntes}
                </pre>
              )}
              <pre style={depoisEstilo}>
                {a.valorDepois.length > 300 ? `${a.valorDepois.slice(0, 300)}…` : a.valorDepois}
              </pre>
              {jaAplicado ? (
                <span style={{ fontSize: 11, color: "var(--verde)" }}>✓ aplicado</span>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => {
                      // Alteração aceita entra como qualquer resposta: sugerida
                      // e confirmada pelo humano que clicou aqui.
                      onAplicar(a.atividadeChave, a.campo, {
                        valor: a.valorDepois,
                        origem: "sugerido",
                        confirmado: true,
                      });
                      setAplicados((s) => new Set(s).add(id));
                      setMudancasAceitas((m) => [...m, `${a.atividadeRotulo} · ${a.rotuloCampo}: ${a.valorDepois}`]);
                      // SPEC-37 M6 — a primeira alteração aceita num item com
                      // dependentes: o agente nomeia quem depende e oferece a
                      // revisão de consistência (decisão do debate: a fala JÁ
                      // lista os dependentes, e o chip dispara — os dois sem
                      // passo extra). Uma vez por conversa: repetir a pergunta
                      // a cada aceite viraria eco.
                      if (impactados.length > 0 && !perguntouConsistencia.current) {
                        perguntouConsistencia.current = true;
                        const rotuloDe = (chave: string) => atividades.find((at) => at.chave === chave)?.rotulo ?? chave;
                        setMensagens((m) => [
                          ...m,
                          {
                            autor: "agente",
                            texto: `Aplicado. ${
                              impactados.length === 1
                                ? `1 item depende deste (${rotuloDe(impactados[0].chave)})`
                                : `${impactados.length} itens dependem deste (${impactados.map((i) => rotuloDe(i.chave)).join(", ")})`
                            } — mando revisar a consistência deles com o que mudou?`,
                            chipConsistencia: true,
                          },
                        ]);
                      }
                    }}
                    style={botaoAcaoEstilo}
                  >
                    Aceitar
                  </button>
                  <button onClick={() => setAplicados((s) => new Set(s).add(id))} style={botaoNeutroEstilo}>
                    Rejeitar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  async function pedirAlteracao(chave: string, rotulo: string, instrucao: string, oQueMudou?: string) {
    const ficha = fichas.get(chave);
    const campos = camposDaFicha(ficha);
    if (campos.length === 0) return [];
    const { alteracoes } = await apiIa.alterarItem({
      instrucao,
      itemRotulo: rotulo,
      contextoNo: ficha?.especificacaoTecnica?.map((n) => `${n.label} (${n.tipoLabel})`).join(", "),
      campos,
      oQueMudou,
      contextoEpico,
    });
    const porChave = new Map(campos.map((c) => [c.chave, c]));
    return alteracoes
      .filter((a) => porChave.has(a.campo) && a.valor?.trim())
      .map((a) => ({
        atividadeChave: chave,
        atividadeRotulo: rotulo,
        campo: a.campo,
        rotuloCampo: porChave.get(a.campo)!.rotulo,
        valorAntes: porChave.get(a.campo)!.valorAtual ?? "",
        valorDepois: a.valor,
        motivo: a.motivo,
      }));
  }

  async function enviar(texto: string) {
    setMensagens((m) => [...m, { autor: "voce", texto }]);
    setPensando(true);
    setErro(null);
    try {
      const propostas = await pedirAlteracao(atividadeSelecionada.chave, atividadeSelecionada.rotulo, texto);
      setMensagens((m) => [
        ...m,
        propostas.length > 0
          ? { autor: "agente" as const, texto: `${propostas.length} alteração(ões) proposta(s):`, propostas }
          : { autor: "agente" as const, texto: "Não vi nada neste item que precise mudar com esse pedido." },
      ]);
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Não foi possível propor a alteração.";
      setErro(mensagem);
      setMensagens((m) => [...m, { autor: "agente", texto: `Não consegui: ${mensagem}` }]);
    } finally {
      setPensando(false);
    }
  }

  async function revisarOsDemais() {
    if (pensando) return;
    const oQueMudou = mudancasAceitas.join("\n");
    setMensagens((m) => [
      ...m,
      { autor: "voce", texto: "Revise os demais itens impactados." },
      {
        autor: "agente",
        texto: `Vou olhar ${impactados.length} item(ns): ${impactados
          .map((i) => `${atividades.find((a) => a.chave === i.chave)?.rotulo ?? i.chave} (${i.motivo === "dependencia" ? "depende deste" : "mesmo componente"})`)
          .join(", ")}.`,
      },
    ]);
    setPensando(true);
    setErro(null);
    try {
      // Um item por vez: resposta pequena, progresso visível, e uma falha
      // isolada não derruba a revisão inteira.
      for (const impactado of impactados) {
        const atividade = atividades.find((a) => a.chave === impactado.chave);
        if (!atividade) continue;
        try {
          const propostas = await pedirAlteracao(
            atividade.chave,
            atividade.rotulo,
            "",
            oQueMudou || "O item relacionado foi revisado."
          );
          setMensagens((m) => [
            ...m,
            propostas.length > 0
              ? { autor: "agente" as const, texto: `${atividade.rotulo}:`, propostas }
              : { autor: "agente" as const, texto: `${atividade.rotulo}: nada a mudar.` },
          ]);
        } catch (e) {
          const mensagem = e instanceof Error ? e.message : String(e);
          console.error(`[conversa/revisar] item "${atividade.chave}" falhou:`, mensagem);
          setMensagens((m) => [...m, { autor: "agente", texto: `${atividade.rotulo}: não consegui revisar (${mensagem}).` }]);
        }
      }
    } finally {
      setPensando(false);
    }
  }

  return (
    <JanelaConversa
      titulo="Refinar conversando"
      fase="especificacao"
      mensagens={mensagens.map((m) => ({
        autor: m.autor,
        texto: m.texto,
        // O chip do M6 é RENDERIZADO a cada render (não guardado na mensagem):
        // assim o clique usa o closure atual de `revisarOsDemais`, com todas
        // as mudanças aceitas até aqui — um ReactNode congelado no aceite
        // levaria o estado daquele momento.
        extra: m.propostas ? (
          cartao(m.propostas)
        ) : m.chipConsistencia ? (
          <button
            onClick={() => void revisarOsDemais()}
            disabled={pensando}
            style={botaoAcaoEstilo}
            data-testid="chip-revisar-consistencia"
          >
            Revisar a consistência ({impactados.length})
          </button>
        ) : undefined,
      }))}
      pensando={pensando}
      erro={erro}
      exemplo={`ex.: o timeout passou de 300ms para 150ms, ajuste os critérios de aceite`}
      acoes={
        impactados.length > 0 ? (
          <>
          {/* Achado real: o botão desabilitado parecia clicável e "clicar não
              fazia nada" — o motivo morava só no title, que ninguém vê. O
              estilo agora diz desabilitado, e a dica fica VISÍVEL. */}
          {mudancasAceitas.length === 0 && (
            <span style={{ display: "block", fontSize: 11, color: "var(--texto-mudo)", marginBottom: 4 }}>
              aceite uma alteração primeiro — é ela que se propaga aos demais
            </span>
          )}
          <button
            onClick={() => void revisarOsDemais()}
            disabled={pensando || mudancasAceitas.length === 0}
            style={{
              ...botaoAcaoEstilo,
              ...(pensando || mudancasAceitas.length === 0
                ? { opacity: 0.45, cursor: "not-allowed" }
                : {}),
            }}
            data-testid="revisar-demais"
            title={
              mudancasAceitas.length === 0
                ? "Aceite ao menos uma alteração antes — é ela que vai ser propagada"
                : undefined
            }
          >
            Revisar os demais ({impactados.length})
          </button>
          </>
        ) : undefined
      }
      onEnviar={(texto) => void enviar(texto)}
      onFechar={onFechar}
    />
  );
}

const antesEstilo: React.CSSProperties = {
  margin: "0 0 4px",
  padding: 6,
  borderRadius: 4,
  background: "var(--painel-alto, #15202D)",
  border: "1px solid var(--borda)",
  color: "var(--texto-mudo)",
  fontSize: 11,
  whiteSpace: "pre-wrap",
  textDecoration: "line-through",
};

const depoisEstilo: React.CSSProperties = {
  margin: "0 0 6px",
  padding: 6,
  borderRadius: 4,
  background: "var(--painel-alto, #15202D)",
  border: "1px solid var(--verde)",
  color: "var(--texto)",
  fontSize: 11.5,
  whiteSpace: "pre-wrap",
};

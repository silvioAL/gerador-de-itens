import { useRef, useState } from "react";
import type { DiagramaConfig } from "@gerador/engine";
import {
  apiIa,
  apiRegras,
  PAPEIS_PADRAO,
  type AlvoConversaConfig,
  type CampoAresta,
  type CampoNo,
  type ConfigPipelineAgentes,
  type DadosCampoAresta,
  type DadosCampoNo,
  type GrupoFicha,
  type PapelConfigurado,
} from "../api/client";
import { usePermissoes } from "../auth/usePermissoes";
import { BotaoFalar } from "../conversa/BotaoFalar";
import { useVozNaEntrada } from "../conversa/useVozNaEntrada";

export interface ConfigurarPanelProps {
  config: DiagramaConfig;
  camposNo: CampoNo[];
  camposAresta: CampoAresta[];
  pipelineAgentes: ConfigPipelineAgentes;
  /** Techs do time (appConfig) — destino dos alvos de regras. */
  techs?: string[];
  timeAtivo?: string;
  /** §274 — os produtos da organização: o destino do alvo `contexto-do-produto`.
   * Vazio = o alvo não tem para onde ir, e o cartão diz isso. */
  produtos?: { id: string; nome: string }[];
  onCriarCampoNo: (dados: DadosCampoNo) => Promise<void>;
  onCriarCampoAresta: (dados: DadosCampoAresta) => Promise<void>;
  onSalvarPipelineAgentes: (dados: ConfigPipelineAgentes) => Promise<void>;
  /** §274 — grava as cinco seções no produto escolhido. Ausente = o cartão
   * aparece sem o botão de aplicar (mesma disciplina dos outros alvos). */
  onAplicarContextoDoProduto?: (produtoId: string, contexto: ObjetoContextoDoProduto) => Promise<void>;
}

/** §274 — o que o passo 2 devolve para `contexto-do-produto`. */
export interface ObjetoContextoDoProduto {
  objetivo: string;
  quemUsa: string;
  regrasDeNegocio: string;
  sistemas: string;
  restricoes: string;
}

/** O objeto que o passo 2 devolve — os três alvos compartilham a forma de
 * campo; papel tem a sua. A validação de verdade é do servidor na hora de
 * aplicar; aqui só o que o cartão precisa pra desenhar. */
interface ObjetoCampo {
  key: string;
  label: string;
  type: string;
  ajuda?: string;
  opcoes?: string[];
  required?: boolean;
  permiteNA?: boolean;
}

interface ObjetoPapel {
  id: string;
  nome: string;
  descricao?: string;
  preambulo?: string;
  contextos?: string[];
}

/** Forma comum de `regra-refinamento` e `item-processo` — a razão de os dois
 * terem entrado juntos na Fase 2. */
interface ObjetoRegra {
  texto: string;
  contextos?: string[];
}

interface Cartao {
  alvo: AlvoConversaConfig;
  instrucao: string;
  estado: "materializando" | "pronta" | "aplicando" | "aplicada" | "erro";
  objeto?: ObjetoCampo | ObjetoPapel | ObjetoRegra | ObjetoContextoDoProduto;
  erro?: string;
  /** tipoNo/tipoAresta para campos; grupo da ficha para papel; tech para regras. */
  destino: string;
}

interface Mensagem {
  autor: "voce" | "agente";
  texto: string;
  cartoes?: Cartao[];
}

/** Alvo → recurso do RBAC que a rota de escrita exige (espelha o servidor —
 * as seções de `regras` são recursos separados, ver SECOES_DE_REGRAS). */
const RECURSO_DO_ALVO: Record<AlvoConversaConfig, string> = {
  "campo-no": "campos-no",
  "campo-aresta": "campos-aresta",
  papel: "pipeline-agentes",
  "regra-refinamento": "regras.checklistTecnico",
  "item-processo": "regras.checklistProcesso",
  "contexto-do-produto": "produtos",
};

const ROTULO_DO_ALVO: Record<AlvoConversaConfig, string> = {
  "campo-no": "campo de componente",
  "campo-aresta": "campo de conexão",
  papel: "papel da esteira",
  "regra-refinamento": "requisito de refinamento",
  "item-processo": "item de checklist de processo",
  "contexto-do-produto": "contexto do produto",
};

/**
 * SPEC-34 Fase 1 — a conversa de configuração (#297), terceira aba do
 * assistente.
 *
 * Dois passos, cada um com schema fixo (§3.5): `/ia/configurar` decide alvo e
 * destila a instrução; `/ia/sugerir-config` (intocado) materializa o objeto.
 * O cartão mostra o objeto completo e o "Aplicar" chama a MESMA função de
 * cliente que o formulário de Configurações usa — não existe caminho novo de
 * escrita, existe um jeito novo de chegar ao caminho velho.
 */
export function ConfigurarPanel({
  config,
  produtos,
  onAplicarContextoDoProduto,
  camposNo,
  camposAresta,
  pipelineAgentes,
  techs,
  timeAtivo,
  onCriarCampoNo,
  onCriarCampoAresta,
  onSalvarPipelineAgentes,
}: ConfigurarPanelProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      autor: "agente",
      texto:
        "Descreva o que o time precisa passar a configurar — por texto ou por voz (🎤): um padrão novo por componente, um campo de conexão, um papel da esteira. Eu proponho; aplicar é sempre um clique seu.",
    },
  ]);
  const [entrada, setEntrada] = useState("");
  // SPEC-30 — o MESMO hook das outras duas janelas de conversa. Achado real:
  // a fala inicial prometia voz (🎤) e o botão não existia — exatamente a
  // armadilha que o comentário do useVozNaEntrada descreve ("duas janelas"),
  // repetida na terceira janela, que nasceu depois dele.
  const { podeFalar, gravacao } = useVozNaEntrada(setEntrada, { config });
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  // SPEC-33: só o hospedado existe — a prop de modo saiu com o ramo morto (§158).
  const permissoes = usePermissoes({ hospedado: true, timeId: timeAtivo });

  const tiposDeNo = Object.entries(config.nodeTypes).map(([id, cfg]) => ({ id, rotulo: cfg.label ?? id }));
  const tiposDeAresta = Object.entries(config.edgeTypes ?? {}).map(([id, cfg]) => ({
    id,
    rotulo: (cfg as { label?: string }).label ?? id,
  }));
  const papeisAtuais = pipelineAgentes.papeis ?? PAPEIS_PADRAO;

  /** O que faz o modelo propor MUDANÇA, não duplicata do que já existe. */
  function resumoConfig(): string {
    return [
      `Tipos de componente: ${tiposDeNo.map((t) => `${t.id} (${t.rotulo})`).join(", ")}`,
      `Tipos de conexão: ${tiposDeAresta.map((t) => t.id).join(", ") || "nenhum"}`,
      `Campos customizados de componente já existentes: ${
        camposNo.map((c) => `${c.tipoNo}.${c.key}`).join(", ") || "nenhum"
      }`,
      `Campos de conexão já existentes: ${camposAresta.map((c) => `${c.tipoAresta}.${c.key}`).join(", ") || "nenhum"}`,
      `Papéis da esteira: ${papeisAtuais.map((p) => p.nome).join(", ")}`,
    ].join("\n");
  }

  function destinoInicial(alvo: AlvoConversaConfig): string {
    if (alvo === "campo-no") return tiposDeNo[0]?.id ?? "";
    if (alvo === "campo-aresta") return tiposDeAresta[0]?.id ?? "";
    if (alvo === "regra-refinamento" || alvo === "item-processo") return techs?.[0] ?? "";
    if (alvo === "contexto-do-produto") return produtos?.[0]?.id ?? "";
    return "especialista";
  }

  function atualizarCartao(indiceMensagem: number, indiceCartao: number, mudanca: Partial<Cartao>) {
    setMensagens((atuais) =>
      atuais.map((m, i) =>
        i === indiceMensagem
          ? { ...m, cartoes: m.cartoes?.map((c, j) => (j === indiceCartao ? { ...c, ...mudanca } : c)) }
          : m
      )
    );
  }

  async function enviar() {
    const texto = entrada.trim();
    if (!texto || pensando) return;
    const transcript = [...mensagens.map(({ autor, texto: t }) => ({ autor, texto: t })), { autor: "voce" as const, texto }];
    setMensagens((m) => [...m, { autor: "voce", texto }]);
    setEntrada("");
    setPensando(true);
    setErro(null);
    try {
      const resposta = await apiIa.configurar({ mensagens: transcript, resumoConfig: resumoConfig() });
      const cartoes: Cartao[] = resposta.propostas.map((p) => ({
        alvo: p.alvo,
        instrucao: p.instrucao,
        estado: "materializando",
        destino: destinoInicial(p.alvo),
      }));
      // Índice determinístico: o estado do closure tem N mensagens, a do
      // usuário entrou como N, a do agente entra como N+1.
      const indiceMensagem = mensagens.length + 1;
      setMensagens((m) => [...m, { autor: "agente", texto: resposta.texto, cartoes }]);
      // Materializa em sequência — o passo 2 de cada proposta, com o schema
      // estrito do alvo. Sequencial de propósito: são no máximo 3, e chamadas
      // paralelas num gateway pequeno viram fila do mesmo jeito, só que sem ordem.
      for (let j = 0; j < cartoes.length; j++) {
        try {
          const objeto = await apiIa.sugerirConfig<ObjetoCampo | ObjetoPapel>({
            alvo: cartoes[j].alvo,
            instrucao: cartoes[j].instrucao,
            contexto: timeAtivo ? `Time: ${timeAtivo}` : undefined,
          });
          atualizarCartao(indiceMensagem, j, { estado: "pronta", objeto });
        } catch (e) {
          atualizarCartao(indiceMensagem, j, {
            estado: "erro",
            erro: e instanceof Error ? e.message : "Não foi possível gerar a proposta.",
          });
        }
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Não foi possível responder.";
      setErro(mensagem);
      setMensagens((m) => [...m, { autor: "agente", texto: `Não consegui: ${mensagem}` }]);
    } finally {
      setPensando(false);
      fimRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }

  async function aplicar(indiceMensagem: number, indiceCartao: number, cartao: Cartao) {
    if (!cartao.objeto) return;
    atualizarCartao(indiceMensagem, indiceCartao, { estado: "aplicando" });
    try {
      if (cartao.alvo === "contexto-do-produto") {
        // As cinco seções de uma vez, no produto escolhido no cartão.
        await onAplicarContextoDoProduto?.(cartao.destino, cartao.objeto as ObjetoContextoDoProduto);
      } else if (cartao.alvo === "campo-no") {
        const o = cartao.objeto as ObjetoCampo;
        await onCriarCampoNo({
          timeId: timeAtivo,
          tipoNo: cartao.destino,
          key: o.key,
          label: o.label,
          type: o.type as DadosCampoNo["type"],
          required: o.required,
          opcoes: o.type === "select" ? o.opcoes : undefined,
          ajuda: o.ajuda,
          permiteNA: o.permiteNA,
        });
      } else if (cartao.alvo === "campo-aresta") {
        const o = cartao.objeto as ObjetoCampo;
        await onCriarCampoAresta({
          timeId: timeAtivo,
          tipoAresta: cartao.destino,
          key: o.key,
          label: o.label,
          type: o.type as DadosCampoAresta["type"],
          required: o.required,
          opcoes: o.type === "select" ? o.opcoes : undefined,
          ajuda: o.ajuda,
        });
      } else if (cartao.alvo === "papel") {
        const o = cartao.objeto as ObjetoPapel;
        const novo: PapelConfigurado = {
          id: o.id,
          nome: o.nome,
          descricao: o.descricao,
          preambulo: o.preambulo,
          grupo: cartao.destino as GrupoFicha,
          ativo: true,
          contextos: o.contextos ?? [],
        };
        // Espalha os papéis EFETIVOS (padrão quando a config nunca foi salva):
        // gravar só o novo apagaria os quatro de fábrica.
        await onSalvarPipelineAgentes({ ...pipelineAgentes, papeis: [...papeisAtuais, novo] });
      } else {
        // Regras: lê o documento INTEIRO, acrescenta na seção da tech escolhida
        // e grava tudo de volta — a UI nunca é dona do arquivo (SPEC-23 §6.7);
        // o servidor decide a permissão pela seção alterada
        // (`secoesDeRegrasAlteradas`), então o 403 vem certo por construção.
        const o = cartao.objeto as ObjetoRegra;
        const secao = cartao.alvo === "regra-refinamento" ? "checklistTecnico" : "checklistProcesso";
        const documento = await apiRegras.obter();
        const porTech = { ...(documento.porTech ?? {}) };
        const daTech = { ...(porTech[cartao.destino] ?? {}) };
        const lista = [...(daTech[secao] ?? [])];
        lista.push({ texto: o.texto, contextos: o.contextos ?? [] });
        porTech[cartao.destino] = { ...daTech, [secao]: lista };
        await apiRegras.salvar({ ...documento, porTech });
      }
      atualizarCartao(indiceMensagem, indiceCartao, { estado: "aplicada" });
    } catch (e) {
      atualizarCartao(indiceMensagem, indiceCartao, {
        estado: "pronta",
        erro: e instanceof Error ? e.message : "Não foi possível aplicar.",
      });
    }
  }

  function cartaoDestinos(cartao: Cartao): { id: string; rotulo: string }[] {
    if (cartao.alvo === "campo-no") return tiposDeNo;
    if (cartao.alvo === "campo-aresta") return tiposDeAresta;
    if (cartao.alvo === "regra-refinamento" || cartao.alvo === "item-processo") {
      return (techs ?? []).map((t) => ({ id: t, rotulo: t }));
    }
    if (cartao.alvo === "contexto-do-produto") return (produtos ?? []).map((p) => ({ id: p.id, rotulo: p.nome }));
    return (["po", "arquiteto", "especialista", "qa"] as const).map((g) => ({ id: g, rotulo: g }));
  }

  return (
    <div style={painelEstilo} data-testid="configurar-conversa" aria-label="Conversa de configuração">
      <div style={listaEstilo}>
        {mensagens.map((m, i) => (
          <div key={i} style={m.autor === "voce" ? balaoVoceEstilo : balaoAgenteEstilo}>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.texto}</div>
            {m.cartoes?.map((cartao, j) => {
              const recurso = RECURSO_DO_ALVO[cartao.alvo];
              const podeAplicar = permissoes.pode(recurso, "editar");
              const objeto = cartao.objeto;
              return (
                <div key={j} style={cartaoEstilo} data-testid={`proposta-config-${i}-${j}`}>
                  <div style={{ fontSize: 11, color: "var(--texto-mudo)", marginBottom: 4 }}>
                    proposta: {ROTULO_DO_ALVO[cartao.alvo]}
                  </div>
                  {cartao.estado === "materializando" && (
                    <div style={{ fontSize: 12, color: "var(--texto-fraco)" }}>escrevendo a proposta…</div>
                  )}
                  {cartao.estado === "erro" && (
                    <div style={{ fontSize: 12, color: "var(--vermelho)" }}>{cartao.erro}</div>
                  )}
                  {objeto && cartao.alvo === "contexto-do-produto" && (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6 }} data-testid="proposta-contexto-do-produto">
                      {/* As seções vazias não aparecem: o modelo devolve string
                          vazia no que não sabe (§271), e listar rótulo sem
                          conteúdo faria a proposta parecer maior do que é. */}
                      {(
                        [
                          ["O que é", (objeto as ObjetoContextoDoProduto).objetivo],
                          ["Quem usa", (objeto as ObjetoContextoDoProduto).quemUsa],
                          ["Regras que valem sempre", (objeto as ObjetoContextoDoProduto).regrasDeNegocio],
                          ["Sistemas", (objeto as ObjetoContextoDoProduto).sistemas],
                          ["Restrições", (objeto as ObjetoContextoDoProduto).restricoes],
                        ] as const
                      )
                        .filter(([, texto]) => (texto ?? "").trim() !== "")
                        .map(([rotulo, texto]) => (
                          <div key={rotulo} style={{ marginBottom: 4 }}>
                            <strong style={{ fontSize: 11, color: "var(--texto-mudo)" }}>{rotulo}</strong>
                            <div>{texto}</div>
                          </div>
                        ))}
                    </div>
                  )}
                  {objeto && (cartao.alvo === "regra-refinamento" || cartao.alvo === "item-processo") && (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                      <strong>{(objeto as ObjetoRegra).texto}</strong>
                      {((objeto as ObjetoRegra).contextos?.length ?? 0) > 0 && (
                        <div style={{ color: "var(--texto-mudo)", fontSize: 11 }}>
                          contextos: {(objeto as ObjetoRegra).contextos!.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                  {objeto && (cartao.alvo === "campo-no" || cartao.alvo === "campo-aresta") && (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                      <strong>{(objeto as ObjetoCampo).label}</strong>{" "}
                      <code style={{ fontSize: 11 }}>{(objeto as ObjetoCampo).key}</code>{" "}
                      <span style={{ color: "var(--texto-mudo)" }}>({(objeto as ObjetoCampo).type})</span>
                      {(objeto as ObjetoCampo).ajuda && (
                        <div style={{ color: "var(--texto-2)", fontSize: 11.5 }}>{(objeto as ObjetoCampo).ajuda}</div>
                      )}
                    </div>
                  )}
                  {objeto && cartao.alvo === "papel" && (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                      <strong>{(objeto as ObjetoPapel).nome}</strong>{" "}
                      <code style={{ fontSize: 11 }}>{(objeto as ObjetoPapel).id}</code>
                      {(objeto as ObjetoPapel).descricao && (
                        <div style={{ color: "var(--texto-2)", fontSize: 11.5 }}>{(objeto as ObjetoPapel).descricao}</div>
                      )}
                      {(objeto as ObjetoPapel).preambulo && (
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ fontSize: 11, color: "var(--texto-fraco)", cursor: "pointer" }}>
                            prompt do papel
                          </summary>
                          <div style={{ whiteSpace: "pre-wrap", fontSize: 11.5, color: "var(--texto-2)" }}>
                            {(objeto as ObjetoPapel).preambulo}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                  {objeto && (cartao.estado === "pronta" || cartao.estado === "aplicando") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <label style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
                        {cartao.alvo === "papel"
                          ? "escreve a seção de"
                          : cartao.alvo === "regra-refinamento" || cartao.alvo === "item-processo"
                            ? "na tech"
                            : "em"}{" "}
                        <select
                          aria-label={cartao.alvo === "papel" ? "Grupo do papel" : "Destino da proposta"}
                          value={cartao.destino}
                          onChange={(e) => atualizarCartao(i, j, { destino: e.target.value })}
                          style={{ fontSize: 11.5, padding: "3px 6px" }}
                        >
                          {cartaoDestinos(cartao).map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => void aplicar(i, j, cartao)}
                        disabled={!podeAplicar || cartao.estado === "aplicando" || !cartao.destino}
                        style={{ ...botaoAplicarEstilo, ...(!podeAplicar ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                      >
                        {cartao.estado === "aplicando" ? "aplicando…" : "Aplicar"}
                      </button>
                      {/* Dizer o motivo, não esconder: quem não tem a permissão
                          precisa saber que a feature existe e a quem pedir (§144). */}
                      {/* §274 — a MESMA régua para o outro motivo de o botão
                          estar apagado: sem destino não há onde gravar, e um
                          botão morto sem explicação lê como app quebrado. */}
                      {podeAplicar && cartaoDestinos(cartao).length === 0 && (
                        <span data-testid="sem-destino" style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
                          {cartao.alvo === "contexto-do-produto"
                            ? "cadastre um produto antes — o contexto precisa de um dono"
                            : `nenhum destino disponível para ${ROTULO_DO_ALVO[cartao.alvo]}`}
                        </span>
                      )}
                      {!podeAplicar && (
                        <span style={{ fontSize: 11, color: "var(--texto-mudo)" }}>
                          sem permissão para editar {ROTULO_DO_ALVO[cartao.alvo]}
                        </span>
                      )}
                      {cartao.erro && cartao.estado === "pronta" && (
                        <span style={{ fontSize: 11, color: "var(--vermelho)" }}>{cartao.erro}</span>
                      )}
                    </div>
                  )}
                  {cartao.estado === "aplicada" && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--verde)" }} data-testid="proposta-aplicada">
                      ✓ Aplicado — já vale para o time, visível em Configurações.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {pensando && (
          <div style={balaoAgenteEstilo} data-testid="configurar-pensando">
            pensando…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {erro && <p style={{ margin: "0 12px", fontSize: 11.5, color: "var(--vermelho)" }}>{erro}</p>}

      <div style={rodapeEstilo}>
        <textarea
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={3}
          disabled={pensando}
          placeholder="ex.: todo serviço novo precisa declarar o runbook de plantão"
          aria-label="Descreva o que configurar"
          style={entradaEstilo}
        />
        {podeFalar && <BotaoFalar gravacao={gravacao} />}
        <button onClick={() => void enviar()} disabled={pensando || !entrada.trim()} style={botaoEnviarEstilo}>
          {pensando ? "pensando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

const painelEstilo: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

const listaEstilo: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const balaoBase: React.CSSProperties = {
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  lineHeight: 1.6,
  border: "1px solid var(--borda)",
};

const balaoAgenteEstilo: React.CSSProperties = {
  ...balaoBase,
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto-2)",
};

const balaoVoceEstilo: React.CSSProperties = {
  ...balaoBase,
  background: "transparent",
  borderColor: "var(--acento)",
  color: "var(--texto)",
  alignSelf: "flex-end",
  maxWidth: "90%",
};

const cartaoEstilo: React.CSSProperties = {
  marginTop: 8,
  padding: 8,
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
};

const botaoAplicarEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
};

const rodapeEstilo: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  padding: 12,
  borderTop: "1px solid var(--borda)",
};

const entradaEstilo: React.CSSProperties = {
  flex: 1,
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto)",
  fontSize: 12.5,
  resize: "vertical",
};

const botaoEnviarEstilo: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

import { useEffect, useRef, useState } from "react";
import type { PropostaDeArquitetura } from "@gerador/aplicacao";
import { PainelDeProposta } from "./PropostaDeArquitetura";
import { apiProdutos, type Produto } from "../api/client";
import { useMontado } from "../state/useMontado";
import { MarcaDeDemonstracao } from "../demo/dadosDoTour";
import { descreverVolumetria } from "@gerador/engine";

/**
 * SPEC-53 Fase 1 — o contexto do produto.
 *
 * A ferramenta sabia a tecnologia (stacks), o processo (regras) e a forma dos
 * itens (templates) — e nunca soube de que PRODUTO a demanda falava. O que se
 * escreve aqui é o que faz o item deixar de ser tecnicamente correto e
 * genérico de negócio.
 *
 * Seis seções fixas e escolhidas por quanto mudam a escrita de um item. Não
 * são configuráveis de propósito: uma "configuração de quais seções o contexto
 * tem" seria mais uma camada para um problema que ninguém tem, num produto que
 * já pede muita configuração de quem chega.
 */
export interface ProdutosTabProps {
  /** §274 — abre o assistente do FAB na conversa de configuração. Ausente = o
   * botão não aparece (é o caso do teste de unidade e do tour). */
  onConversarComAssistente?: () => void;
  /** Os times aos quais um produto pode ser amarrado. */
  timeIds: string[];
  /** §235 — produto EXCLUSIVO do tour: substitui a lista do servidor e desliga
   * toda escrita. Instalação nova tem esta tela vazia, e passo que promete
   * conteúdo sobre tela vazia é a mentira que o §234 custou caro. */
  demonstracao?: Produto;
}

const SECOES: { chave: keyof Pick<Produto, "objetivo" | "quemUsa" | "regrasDeNegocio" | "sistemas" | "restricoes">; rotulo: string; ajuda: string; placeholder: string }[] = [
  {
    chave: "objetivo",
    rotulo: "O que é",
    ajuda: "Sem isso, quem escreve o item inventa a razão de ser do produto.",
    placeholder: "ex.: Levar a conta do cliente para outro banco, com o mínimo de fricção e dentro do prazo regulatório.",
  },
  {
    chave: "quemUsa",
    rotulo: "Quem usa",
    ajuda: "As pessoas e o que cada uma quer resolver.",
    placeholder: "ex.: Cliente final (quer trocar de banco sem perder débitos automáticos); atendimento (precisa explicar o status).",
  },
  {
    chave: "regrasDeNegocio",
    rotulo: "Regras de negócio que valem sempre",
    ajuda: "As permanentes, não as desta demanda — estas vão em toda demanda do produto.",
    placeholder: "ex.: Portabilidade só com conta ativa há mais de 30 dias.",
  },
  {
    chave: "sistemas",
    rotulo: "Sistemas e integrações",
    ajuda: "Com quem este produto conversa, e para quê.",
    placeholder: "ex.: SPB (liquidação), CRM (histórico do cliente), bureau (score).",
  },
  {
    chave: "restricoes",
    rotulo: "Restrições",
    ajuda: "Regulatório, compliance, contrato — o que não se negocia.",
    placeholder: "ex.: Resolução 4.753 do BACEN; retenção fiscal de 5 anos.",
  },
];

/**
 * §266 — a releitura NÃO apaga o que a pessoa está digitando.
 *
 * ## O defeito
 *
 * `recarregar()` roda depois de toda gravação e trocava o rascunho pelo que
 * voltou do servidor. Quem digitasse entre o clique em Salvar e a resposta
 * perdia o texto — sem erro, sem aviso, e com "salvo" na tela. Achado enquanto
 * eu caçava outra coisa no §262, e anotado lá porque o conserto óbvio não
 * servia.
 *
 * ## Por que o conserto óbvio não servia
 *
 * "Não substituir quando o id é o mesmo" **quebra o glossário**: o termo novo
 * aparece justamente porque a releitura traz a lista do servidor. Guardar o
 * rascunho inteiro salvaria o texto e congelaria a lista.
 *
 * ## A régua
 *
 * > O que a PESSOA digita é dela; o que só o SERVIDOR sabe é dele.
 *
 * Texto (nome e as cinco seções) vem do rascunho; coleções (glossário, times)
 * vêm da resposta. Trocar de produto continua substituindo tudo — aí a pessoa
 * pediu outro produto, e manter o texto do anterior seria pior que o defeito
 * original.
 */
function reconciliar(atual: Produto | null, doServidor: Produto | null): Produto | null {
  if (!doServidor) return null;
  // Produto diferente: é uma TROCA, e a pessoa pediu por ela.
  if (!atual || atual.id !== doServidor.id) return doServidor;
  return { ...atual, glossario: doServidor.glossario, timeIds: doServidor.timeIds };
}

export function ProdutosTab({ timeIds, demonstracao, onConversarComAssistente }: ProdutosTabProps) {
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [rascunho, setRascunho] = useState<Produto | null>(null);
  /**
   * SPEC-81 fatia F — a proposta vinda do gateway da casa.
   *
   * `null` = ninguém pediu ainda. Aceitar um campo escreve **no rascunho**, e
   * não no servidor: o texto aparece no campo acima, a pessoa vê antes de
   * salvar, e o Salvar de sempre é quem grava. Importar não é aceitar, e
   * aceitar ainda não é gravar.
   */
  const [proposta, setProposta] = useState<(PropostaDeArquitetura & { origem: string }) | null>(null);
  const [importando, setImportando] = useState(false);
  const [termo, setTermo] = useState("");
  const [definicao, setDefinicao] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** §281 — `recarregar` também roda depois de cada ação, então a guarda é um
   * ref e não a flag do efeito (ver `useMontado`). */
  const montado = useMontado();

  /**
   * §303 — qual releitura é a VIGENTE.
   *
   * `recarregar` roda depois de CADA ação, e duas ações seguidas põem duas
   * releituras no ar ao mesmo tempo. Nada garantia a ordem de chegada: se a da
   * ação anterior responde por último, ela reinstala a lista velha e a seleção
   * velha por cima do que a ação nova acabou de estabelecer.
   *
   * O estrago não é visual — `reconciliar` preserva o texto digitado, então a
   * tela continua mostrando o nome certo. É o ALVO que troca: o `Salvar`
   * seguinte vai para o produto ERRADO, com "salvo" verde na tela. É a mesma
   * ferida do §262, agora pela raiz.
   *
   * É o §266 outra vez (resposta velha por cima de estado novo), desta vez
   * entre duas leituras em vez de leitura contra digitação.
   */
  const releituraVigente = useRef(0);

  async function recarregar(idParaSelecionar?: string) {
    const minha = ++releituraVigente.current;
    try {
      // §235 — em demonstração não se busca nem se grava: o tour mostra um
      // produto de exemplo, não a configuração real de quem está vendo.
      const lista = demonstracao ? [demonstracao] : await apiProdutos.listar();
      // Chegou atrasada: outra releitura já começou depois desta, e o que ela
      // trouxe é mais novo. Aplicar isto aqui seria voltar no tempo.
      if (!montado.current || minha !== releituraVigente.current) return;
      setProdutos(lista);
      const alvo = idParaSelecionar ?? selecionadoId;
      const escolhido = lista.find((p) => p.id === alvo) ?? lista[0] ?? null;
      setSelecionadoId(escolhido?.id ?? null);
      // §266 — reconcilia em vez de substituir: o texto é de quem digita, as
      // coleções são de quem as guarda. Ver `reconciliar`.
      setRascunho((atual) => reconciliar(atual, escolhido));
    } catch (e) {
      if (montado.current) setErro(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void recarregar();
  }, [demonstracao]);

  async function executar(acao: () => Promise<unknown>, idDepois?: string) {
    if (demonstracao) return false;
    setErro(null);
    setSalvo(false);
    try {
      await acao();
      await recarregar(idDepois);
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function criar() {
    if (!nomeNovo.trim()) return;
    const nome = nomeNovo.trim();
    const criado = await apiProdutos.criar(nome).catch((e: unknown) => {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    });
    if (!criado) return;
    setNomeNovo("");
    await recarregar(criado.id);
  }

  async function salvar() {
    if (!rascunho) return;
    const { id, nome, objetivo, quemUsa, regrasDeNegocio, sistemas, restricoes } = rascunho;
    const ok = await executar(
      () =>
        apiProdutos.atualizar(id, {
          nome,
          objetivo,
          quemUsa,
          regrasDeNegocio,
          sistemas,
          restricoes,
          // SPEC-77 — `null` APAGA. Sem quantidade não há volume, e mandar
          // `undefined` aqui significaria "não mexi nisto" — o que impediria
          // alguém de remover um número posto por engano.
          volumetria: rascunho.volumetria?.quantidade ? rascunho.volumetria : null,
        }),
      id
    );
    if (ok) setSalvo(true);
  }

  if (erro && !produtos) return <p style={{ ...proseEstilo, color: "var(--vermelho)" }}>{erro}</p>;
  if (!produtos) return <p style={proseEstilo}>Carregando…</p>;

  return (
    <div data-testid="config-produtos">
      {demonstracao && <MarcaDeDemonstracao />}
      <p style={proseEstilo}>
        O contexto de negócio que vale para <strong>todas</strong> as demandas deste produto: o que ele é, quem usa,
        as regras que valem sempre e o vocabulário da casa. Vai junto com cada demanda ligada a ele — é o que separa
        um item tecnicamente correto de um item que entende o negócio.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
        <input
          aria-label="Nome do produto novo"
          value={nomeNovo}
          onChange={(e) => setNomeNovo(e.target.value)}
          placeholder="ex.: Portabilidade"
          style={{ ...inputEstilo, maxWidth: 260 }}
        />
        <button onClick={() => void criar()} disabled={!nomeNovo.trim()} style={botaoPrimarioEstilo} data-testid="criar-produto">
          + Produto
        </button>
      </div>

      {produtos.length === 0 ? (
        <p style={vazioEstilo} data-testid="sem-produtos">
          Nenhum produto ainda. Enquanto não houver, tudo continua funcionando como antes — a demanda só não leva o
          contexto de negócio junto.
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {produtos.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelecionadoId(p.id);
                setRascunho(p);
                setSalvo(false);
              }}
              style={p.id === selecionadoId ? abaAtivaEstilo : abaEstilo}
              data-testid={`produto-${p.id}`}
            >
              {p.nome}
            </button>
          ))}
        </div>
      )}

      {rascunho && (
        <section data-testid="editor-do-produto">
          {/* §274 — o botão leva ao ASSISTENTE, e não a um campo de instrução
              única aqui dentro.
              O §271 tinha posto uma caixinha de "descreva e eu preencho": ela
              resolve o caso de quem já sabe dizer o produto inteiro numa
              frase, e é justamente esse o caso raro. Escrever o que um produto
              É se faz por partes — perguntando, corrigindo, completando —, e
              isso é conversa. O assistente do FAB já é o lugar da conversa;
              duplicá-lo aqui em versão pobre seria ensinar dois jeitos de
              pedir a mesma coisa. */}
          {!demonstracao && onConversarComAssistente && (
            <button onClick={onConversarComAssistente} style={botaoAssistenteEstilo} data-testid="conversar-sobre-o-produto">
              ✦ Escrever com o assistente
            </button>
          )}
          <label style={labelEstilo}>Nome</label>
          <input
            aria-label="Nome do produto"
            value={rascunho.nome}
            onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            style={{ ...inputEstilo, maxWidth: 360 }}
          />

          {SECOES.map((secao) => (
            <div key={secao.chave}>
              <label style={labelEstilo}>{secao.rotulo}</label>
              <p style={ajudaEstilo}>{secao.ajuda}</p>
              <textarea
                aria-label={secao.rotulo}
                value={rascunho[secao.chave]}
                onChange={(e) => setRascunho({ ...rascunho, [secao.chave]: e.target.value })}
                rows={3}
                placeholder={secao.placeholder}
                style={{ ...inputEstilo, resize: "vertical" }}
              />
            </div>
          ))}

          {/* ── SPEC-77 — o volume que o PRODUTO atende ──
              Aqui, e não na demanda, porque é perene: não muda a cada entrega,
              muda uma vez por trimestre — e quando muda, muda o julgamento de
              todas as demandas em aberto. A demanda continua podendo declarar
              o seu, e aí ela manda e a tela diz que está divergindo. */}
          <div>
            <label style={labelEstilo}>Volume que este produto atende</label>
            <p style={ajudaEstilo}>
              O número perene, não o desta demanda. Toda demanda sem volume próprio herda este — e quem declarar um
              diferente vai ver os dois lado a lado. Deixe em branco se ninguém sabe: número inventado alimentando a
              conta é pior que número nenhum.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="number"
                min={0}
                aria-label="Volume do produto"
                data-testid="volumetria-produto-quantidade"
                value={rascunho.volumetria?.quantidade ?? ""}
                onChange={(e) =>
                  setRascunho({
                    ...rascunho,
                    volumetria: e.target.value
                      ? { por: "dia", ...rascunho.volumetria, quantidade: Number(e.target.value) }
                      : undefined,
                  })
                }
                placeholder="ex.: 2000000"
                style={{ ...inputEstilo, width: 160 }}
              />
              <select
                aria-label="Por"
                data-testid="volumetria-produto-por"
                value={rascunho.volumetria?.por ?? "dia"}
                onChange={(e) =>
                  setRascunho({
                    ...rascunho,
                    volumetria: rascunho.volumetria
                      ? { ...rascunho.volumetria, por: e.target.value as "segundo" | "minuto" | "hora" | "dia" }
                      : undefined,
                  })
                }
                style={{ ...inputEstilo, width: 130 }}
              >
                <option value="segundo">por segundo</option>
                <option value="minuto">por minuto</option>
                <option value="hora">por hora</option>
                <option value="dia">por dia</option>
              </select>
              <input
                type="number"
                min={0}
                aria-label="Pico"
                data-testid="volumetria-produto-pico"
                value={rascunho.volumetria?.picoDe ?? ""}
                onChange={(e) =>
                  setRascunho({
                    ...rascunho,
                    volumetria: rascunho.volumetria
                      ? { ...rascunho.volumetria, picoDe: e.target.value ? Number(e.target.value) : undefined }
                      : undefined,
                  })
                }
                placeholder="pico (ex.: 5)"
                style={{ ...inputEstilo, width: 130 }}
              />
            </div>
            {descreverVolumetria(rascunho.volumetria) && (
              <p style={ajudaEstilo} data-testid="volumetria-produto-derivada">
                {descreverVolumetria(rascunho.volumetria)}
                {rascunho.volumetria?.picoDe ? ` · pico de ${rascunho.volumetria.picoDe}×` : ""}
                {/* O pico NÃO entra na conta do motor, e dizer isso evita que
                    alguém espere ver a saturação mudar sozinha. Quem responde
                    "e se for 5×?" é o ensaio, de propósito. */}
                {rascunho.volumetria?.picoDe ? " — use este fator no ensaio para ver o efeito" : ""}
              </p>
            )}
            {rascunho.volumetria?.declaradoEm && (
              <p style={ajudaEstilo} data-testid="volumetria-produto-declarada-em">
                Declarado em {new Date(rascunho.volumetria.declaradoEm).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>

          {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 8 }}>{erro}</p>}
          {salvo && !erro && (
            <p style={{ fontSize: 12, color: "var(--verde, #3ecf8e)", marginTop: 8 }} data-testid="produto-salvo">
              Contexto salvo.
            </p>
          )}
          <button
            onClick={() => {
              setImportando(true);
              void apiProdutos
                .importarArquitetura(rascunho.id)
                .then(setProposta)
                .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
                .finally(() => setImportando(false));
            }}
            disabled={importando || !!demonstracao}
            style={botaoFracoEstilo}
            data-testid="importar-arquitetura"
          >
            {importando ? "buscando…" : "↙ Trazer da casa"}
          </button>
          <button onClick={() => void salvar()} style={botaoPrimarioEstilo} data-testid="salvar-produto">
            Salvar contexto
          </button>
          {proposta && (
            <PainelDeProposta
              proposta={proposta}
              origem={proposta.origem}
              onFechar={() => setProposta(null)}
              onAceitarCampo={(campo) => setRascunho((r) => (r ? { ...r, [campo.campo]: campo.proposto } : r))}
              onAceitarTermo={(t) => {
                void executar(() => apiProdutos.salvarTermo(rascunho.id, t.termo, t.definicao), rascunho.id);
              }}
            />
          )}

          {/* ── Glossário: a seção que mais muda a escrita ── */}
          <h4 style={subtituloEstilo}>Glossário ({rascunho.glossario.length})</h4>
          <p style={ajudaEstilo}>
            “Fatura”, “carteira” e “portabilidade” querem dizer coisas diferentes em cada casa. É aqui que o item
            genérico se denuncia.
          </p>
          <ul style={{ paddingLeft: 18, fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.7 }}>
            {rascunho.glossario.map((t) => (
              <li key={t.id} data-testid="termo-do-glossario">
                <strong>{t.termo}</strong>: {t.definicao}{" "}
                <button
                  onClick={() => void executar(() => apiProdutos.excluirTermo(rascunho.id, t.id), rascunho.id)}
                  style={botaoLinkEstilo}
                  aria-label={`Remover ${t.termo}`}
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              aria-label="Termo"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Termo"
              style={{ ...inputEstilo, maxWidth: 200 }}
            />
            <input
              aria-label="Definição"
              value={definicao}
              onChange={(e) => setDefinicao(e.target.value)}
              placeholder="O que ele quer dizer NESTA casa"
              style={{ ...inputEstilo, maxWidth: 420 }}
            />
            <button
              onClick={() => {
                if (!termo.trim() || !definicao.trim()) return;
                void executar(() => apiProdutos.salvarTermo(rascunho.id, termo, definicao), rascunho.id).then((ok) => {
                  if (ok) {
                    setTermo("");
                    setDefinicao("");
                  }
                });
              }}
              disabled={!termo.trim() || !definicao.trim()}
              style={botaoEstilo}
              data-testid="salvar-termo"
            >
              Adicionar termo
            </button>
          </div>

          {/* ── Times: amarrar RESTRINGE, não habilita ── */}
          <h4 style={subtituloEstilo}>Times que trabalham neste produto</h4>
          <p style={ajudaEstilo}>
            Sem nenhum marcado, o produto aparece para todos — marcar é o que <em>restringe</em>. Um produto pode
            atravessar times, e um time pode atender vários produtos.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {timeIds.map((timeId) => (
              <label key={timeId} style={{ fontSize: 12.5, color: "var(--texto-2)" }}>
                <input
                  type="checkbox"
                  checked={rascunho.timeIds.includes(timeId)}
                  onChange={(e) => {
                    const novos = e.target.checked
                      ? [...rascunho.timeIds, timeId]
                      : rascunho.timeIds.filter((t) => t !== timeId);
                    setRascunho({ ...rascunho, timeIds: novos });
                    void executar(() => apiProdutos.definirTimes(rascunho.id, novos), rascunho.id);
                  }}
                />{" "}
                {timeId}
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const proseEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6, maxWidth: 760, margin: "0 0 10px" };
const vazioEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto-mudo)", margin: 0, maxWidth: 700 };
const ajudaEstilo: React.CSSProperties = { fontSize: 11, color: "var(--texto-mudo)", margin: "0 0 4px", maxWidth: 700 };
const labelEstilo: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--texto-fraco)", margin: "12px 0 2px" };
const subtituloEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto)", margin: "22px 0 4px" };
const inputEstilo: React.CSSProperties = {
  width: "100%",
  maxWidth: 760,
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
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto)",
  cursor: "pointer",
};
const botaoPrimarioEstilo: React.CSSProperties = {
  ...botaoEstilo,
  border: "none",
  background: "var(--acento)",
  color: "#fff",
  marginTop: 12,
};
const botaoLinkEstilo: React.CSSProperties = {
  fontSize: 11,
  border: "none",
  background: "transparent",
  color: "var(--texto-mudo)",
  cursor: "pointer",
  textDecoration: "underline",
};
const abaEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-2)",
  cursor: "pointer",
};
const abaAtivaEstilo: React.CSSProperties = { ...abaEstilo, background: "var(--acento)", color: "#fff", border: "none" };

const botaoAssistenteEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 14px",
  marginBottom: 12,
  borderRadius: 8,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

/** SPEC-81 — secundário ao lado do Salvar: trazer não é gravar. */
const botaoFracoEstilo: React.CSSProperties = {
  ...botaoPrimarioEstilo,
  background: "transparent",
  color: "var(--texto)",
  border: "1px solid var(--borda-forte)",
};

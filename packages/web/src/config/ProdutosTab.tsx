import { useEffect, useState } from "react";
import { apiProdutos, type Produto } from "../api/client";
import { MarcaDeDemonstracao } from "../demo/dadosDoTour";

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

export function ProdutosTab({ timeIds, demonstracao }: ProdutosTabProps) {
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [rascunho, setRascunho] = useState<Produto | null>(null);
  const [termo, setTermo] = useState("");
  const [definicao, setDefinicao] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar(idParaSelecionar?: string) {
    try {
      // §235 — em demonstração não se busca nem se grava: o tour mostra um
      // produto de exemplo, não a configuração real de quem está vendo.
      const lista = demonstracao ? [demonstracao] : await apiProdutos.listar();
      setProdutos(lista);
      const alvo = idParaSelecionar ?? selecionadoId;
      const escolhido = lista.find((p) => p.id === alvo) ?? lista[0] ?? null;
      setSelecionadoId(escolhido?.id ?? null);
      // §266 — reconcilia em vez de substituir: o texto é de quem digita, as
      // coleções são de quem as guarda. Ver `reconciliar`.
      setRascunho((atual) => reconciliar(atual, escolhido));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
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
      () => apiProdutos.atualizar(id, { nome, objetivo, quemUsa, regrasDeNegocio, sistemas, restricoes }),
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
        O que a ferramenta sabia era tecnologia, processo e forma dos itens — nunca <strong>de que produto</strong> a
        demanda falava. O que estiver aqui vai junto com toda demanda ligada a este produto, e é o que separa um item
        tecnicamente correto de um item que entende o negócio.
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

          {erro && <p style={{ fontSize: 12, color: "var(--vermelho)", marginTop: 8 }}>{erro}</p>}
          {salvo && !erro && (
            <p style={{ fontSize: 12, color: "var(--verde, #3ecf8e)", marginTop: 8 }} data-testid="produto-salvo">
              Contexto salvo.
            </p>
          )}
          <button onClick={() => void salvar()} style={botaoPrimarioEstilo} data-testid="salvar-produto">
            Salvar contexto
          </button>

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

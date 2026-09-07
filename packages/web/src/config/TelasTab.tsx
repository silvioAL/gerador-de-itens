import { useEffect, useState } from "react";
import {
  ENTRADAS_DO_CAMPO,
  FORMATOS_DO_DADO,
  normalizarTelas,
  type BlocoDaTela,
  type TelaDeclarada,
} from "@gerador/aplicacao";
import { apiTelas } from "../api/client";
import { RenderizadorDaTela, useMotivoParaNaoAvancar } from "../fluxo/RenderizadorDaTela";

/**
 * SPEC-110 fatia C (D5) — **criar e editar telas, pelo usuário.**
 *
 * Vive atrás do deep-link `#/config/telas` e FORA do menu — o padrão "deep-link
 * + porta no nó" da §§388-389: a capacidade é viva, e quem a alcança é quem a
 * consome (o painel do nó de tela, e a galeria da fatia H). Uma aba a mais no
 * menu seria a lista que ninguém percorre (§221).
 *
 * O preview usa o MESMO `RenderizadorDaTela` do stage: um segundo desenho
 * passaria a mentir sobre o que a pessoa vai ver quando a execução parar ali.
 */

const botao: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  cursor: "pointer",
  fontSize: 12.5,
};

const campo: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 13,
};

const cartao: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 10,
  display: "grid",
  gap: 6,
  background: "var(--painel-alto)",
};

const BLOCO_NOVO: Record<string, BlocoDaTela> = {
  texto: { tipo: "texto", markdown: "Escreva aqui o que a pessoa precisa saber." },
  dado: { tipo: "dado", chave: "dado", rotulo: "Dado da fiação", formato: "texto" },
  campo: { tipo: "campo", chave: "campo", rotulo: "Campo", entrada: "texto" },
  acao: { tipo: "acao", rotulo: "Avançar →", acao: "avancar" },
};

export function TelasTab({ timeAtivo, telaId, aoAbrirTela }: { timeAtivo: string; telaId?: string; aoAbrirTela: (id?: string) => void }) {
  const [telas, setTelas] = useState<TelaDeclarada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [valoresDoPreview, setValoresDoPreview] = useState<Record<string, unknown>>({});
  const [nomeNovo, setNomeNovo] = useState("");

  useEffect(() => {
    setErro(null);
    void apiTelas
      .obter(timeAtivo)
      .then((r) => setTelas(normalizarTelas(r).telas))
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [timeAtivo]);

  const emEdicao = telas?.find((t) => t.id === telaId) ?? null;

  function mudarTela(mudar: (t: TelaDeclarada) => TelaDeclarada) {
    setSalvo(false);
    setTelas((atuais) => (atuais ?? []).map((t) => (t.id === telaId ? mudar(t) : t)));
  }

  async function salvar(lista: TelaDeclarada[]) {
    setSalvando(true);
    setErro(null);
    try {
      await apiTelas.salvar({ telas: lista }, timeAtivo);
      setSalvo(true);
    } catch (e) {
      // A validação de escrita (SPEC-35) responde nomeando o bloco — e é essa
      // frase que a pessoa lê, não um "erro ao salvar".
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const motivo = useMotivoParaNaoAvancar(emEdicao?.blocos ?? [], valoresDoPreview);

  if (!telas) return <div data-testid="telas-carregando">Carregando telas…</div>;

  // ── A LISTA ──
  if (!emEdicao) {
    return (
      <div data-testid="telas-tab" style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <p style={{ fontSize: 13, color: "var(--texto-2)", margin: 0 }}>
          Telas são onde a pessoa ENTRA no fluxo: a execução para nelas, alguém revisa e decide. Crie a sua, fie num nó de
          tela no canvas, e ela aparece quando o fluxo chegar ali.
        </p>
        {erro && (
          <div data-testid="telas-erro" style={{ color: "var(--vermelho)", fontSize: 12.5 }}>
            {erro}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            aria-label="Nome da tela nova"
            placeholder="nome da tela nova"
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            style={campo}
          />
          <button
            data-testid="criar-tela"
            disabled={!nomeNovo.trim()}
            onClick={() => {
              const nome = nomeNovo.trim();
              const id =
                nome
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "") || `tela-${telas.length + 1}`;
              if (telas.some((t) => t.id === id)) {
                setErro(`já existe uma tela com o id "${id}"`);
                return;
              }
              // Nasce com a barra padrão (D17b): tela sem acionador nenhum
              // recebe Avançar/Retornar do shell — nunca existe tela sem saída.
              const nova: TelaDeclarada = { id, nome, blocos: [BLOCO_NOVO.texto] };
              const lista = [...telas, nova];
              setTelas(lista);
              setNomeNovo("");
              void salvar(lista).then(() => aoAbrirTela(id));
            }}
            style={botao}
          >
            + Nova tela
          </button>
        </div>
        {telas.length === 0 ? (
          <p data-testid="sem-telas" style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>
            Nenhuma tela ainda. As telas do SISTEMA (bancada de ensaios, documento, mesa) já existem e não precisam ser
            criadas — estas aqui são as suas.
          </p>
        ) : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {telas.map((t) => (
              <li key={t.id} style={cartao}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>
                    {t.icone ? `${t.icone} ` : ""}
                    {t.nome}
                  </strong>
                  <span style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
                    {t.blocos.length} bloco{t.blocos.length === 1 ? "" : "s"} · refId <code>tela:{t.id}</code>
                  </span>
                  <span style={{ flex: 1 }} />
                  <button data-testid={`editar-tela-${t.id}`} onClick={() => aoAbrirTela(t.id)} style={botao}>
                    editar →
                  </button>
                  <button
                    data-testid={`remover-tela-${t.id}`}
                    onClick={() => {
                      const lista = telas.filter((x) => x.id !== t.id);
                      setTelas(lista);
                      void salvar(lista);
                    }}
                    style={botao}
                  >
                    remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── O EDITOR de uma tela ──
  const blocos = emEdicao.blocos;
  const mudarBloco = (i: number, novo: BlocoDaTela) =>
    mudarTela((t) => ({ ...t, blocos: t.blocos.map((b, j) => (j === i ? novo : b)) }));

  return (
    <div data-testid="editor-de-tela" style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button data-testid="voltar-para-telas" onClick={() => aoAbrirTela(undefined)} style={botao}>
            ← Telas
          </button>
          <strong style={{ fontSize: 13 }}>{emEdicao.nome}</strong>
          <span style={{ flex: 1 }} />
          <button data-testid="salvar-tela" onClick={() => void salvar(telas)} disabled={salvando} style={botao}>
            {salvando ? "Salvando…" : salvo ? "Salvo ✓" : "Salvar"}
          </button>
        </div>
        {erro && (
          <div data-testid="telas-erro" style={{ color: "var(--vermelho)", fontSize: 12.5 }}>
            {erro}
          </div>
        )}
        <label style={{ fontSize: 11.5, display: "grid", gap: 2 }}>
          Nome da tela
          <input data-testid="nome-da-tela" value={emEdicao.nome} onChange={(e) => mudarTela((t) => ({ ...t, nome: e.target.value }))} style={campo} />
        </label>
        <label style={{ fontSize: 11.5, display: "grid", gap: 2 }}>
          Ícone (emoji — aparece na galeria)
          <input
            data-testid="icone-da-tela"
            value={emEdicao.icone ?? ""}
            placeholder="ex.: ✅"
            onChange={(e) => mudarTela((t) => ({ ...t, icone: e.target.value || undefined }))}
            style={{ ...campo, width: 90 }}
          />
        </label>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["texto", "dado", "campo", "acao"] as const).map((tipo) => (
            <button
              key={tipo}
              data-testid={`add-bloco-${tipo}`}
              onClick={() => mudarTela((t) => ({ ...t, blocos: [...t.blocos, BLOCO_NOVO[tipo]] }))}
              style={botao}
            >
              + {tipo}
            </button>
          ))}
        </div>

        {blocos.map((bloco, i) => (
          <div key={i} data-testid={`editor-bloco-${i}`} style={cartao}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <strong style={{ fontSize: 11.5, textTransform: "uppercase", color: "var(--texto-2)" }}>{bloco.tipo}</strong>
              <span style={{ flex: 1 }} />
              <button
                aria-label={`Subir bloco ${i + 1}`}
                disabled={i === 0}
                onClick={() =>
                  mudarTela((t) => {
                    const b = [...t.blocos];
                    [b[i - 1], b[i]] = [b[i], b[i - 1]];
                    return { ...t, blocos: b };
                  })
                }
                style={botao}
              >
                ↑
              </button>
              <button
                aria-label={`Descer bloco ${i + 1}`}
                disabled={i === blocos.length - 1}
                onClick={() =>
                  mudarTela((t) => {
                    const b = [...t.blocos];
                    [b[i + 1], b[i]] = [b[i], b[i + 1]];
                    return { ...t, blocos: b };
                  })
                }
                style={botao}
              >
                ↓
              </button>
              <button
                data-testid={`remover-bloco-${i}`}
                onClick={() => mudarTela((t) => ({ ...t, blocos: t.blocos.filter((_b, j) => j !== i) }))}
                style={botao}
              >
                remover
              </button>
            </div>

            {bloco.tipo === "texto" && (
              <textarea
                aria-label={`Texto do bloco ${i + 1}`}
                value={bloco.markdown}
                onChange={(e) => mudarBloco(i, { ...bloco, markdown: e.target.value })}
                rows={3}
                style={{ ...campo, fontFamily: "inherit" }}
              />
            )}

            {(bloco.tipo === "dado" || bloco.tipo === "campo") && (
              <>
                <input
                  aria-label={`Chave do bloco ${i + 1}`}
                  value={bloco.chave}
                  placeholder="chave (é ela que liga o bloco à fiação)"
                  onChange={(e) => mudarBloco(i, { ...bloco, chave: e.target.value })}
                  style={campo}
                />
                <input
                  aria-label={`Rótulo do bloco ${i + 1}`}
                  value={bloco.rotulo}
                  placeholder="rótulo (o que a pessoa lê)"
                  onChange={(e) => mudarBloco(i, { ...bloco, rotulo: e.target.value })}
                  style={campo}
                />
              </>
            )}

            {bloco.tipo === "dado" && (
              <select
                aria-label={`Formato do bloco ${i + 1}`}
                value={bloco.formato}
                onChange={(e) => mudarBloco(i, { ...bloco, formato: e.target.value as typeof bloco.formato })}
                style={campo}
              >
                {FORMATOS_DO_DADO.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            )}

            {bloco.tipo === "campo" && (
              <>
                <select
                  aria-label={`Entrada do bloco ${i + 1}`}
                  value={bloco.entrada}
                  onChange={(e) => mudarBloco(i, { ...bloco, entrada: e.target.value as typeof bloco.entrada })}
                  style={campo}
                >
                  {ENTRADAS_DO_CAMPO.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                {bloco.entrada === "escolha" && (
                  <input
                    aria-label={`Opções do bloco ${i + 1}`}
                    value={(bloco.opcoes ?? []).join(", ")}
                    placeholder="opções separadas por vírgula"
                    onChange={(e) =>
                      mudarBloco(i, {
                        ...bloco,
                        opcoes: e.target.value
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean),
                      })
                    }
                    style={campo}
                  />
                )}
                <label style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(bloco.obrigatorio)}
                    onChange={(e) => mudarBloco(i, { ...bloco, obrigatorio: e.target.checked || undefined })}
                  />
                  obrigatório (trava o Avançar até preencher, com o motivo na tela)
                </label>
              </>
            )}

            {bloco.tipo === "acao" && (
              <>
                <input
                  aria-label={`Rótulo do bloco ${i + 1}`}
                  value={bloco.rotulo}
                  onChange={(e) => mudarBloco(i, { ...bloco, rotulo: e.target.value })}
                  style={campo}
                />
                {/* D17a — o comportamento é FIXO do catálogo: o rótulo é seu,
                    o que ele faz não é programável. */}
                <select
                  aria-label={`Ação do bloco ${i + 1}`}
                  value={bloco.acao}
                  onChange={(e) => mudarBloco(i, { ...bloco, acao: e.target.value as typeof bloco.acao })}
                  style={campo}
                >
                  <option value="avancar">avançar (segue a fiação)</option>
                  <option value="retornar">retornar (encerra a execução)</option>
                </select>
              </>
            )}
          </div>
        ))}
      </div>

      {/* O PREVIEW, pelo mesmo renderizador do stage. */}
      <div data-testid="preview-da-tela" style={{ border: "1px solid var(--borda)", borderRadius: 8, alignSelf: "start" }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--borda)", fontSize: 11.5, color: "var(--texto-2)" }}>
          Prévia — é assim que ela aparece quando a execução parar aqui{motivo ? ` · ${motivo}` : ""}
        </div>
        <RenderizadorDaTela
          blocos={blocos}
          entradas={Object.fromEntries(
            blocos.filter((b) => b.tipo === "dado").map((b) => [(b as { chave: string }).chave, "(exemplo do que a fiação traz)"])
          )}
          valores={valoresDoPreview}
          onMudarValor={(chave, valor) => setValoresDoPreview((v) => ({ ...v, [chave]: valor }))}
        />
      </div>
    </div>
  );
}

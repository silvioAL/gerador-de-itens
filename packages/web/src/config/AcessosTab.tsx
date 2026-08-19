import { useEffect, useState } from "react";
import { apiAcessos, type PapelAcesso, apiPdca, type SolicitacaoAjuste } from "../api/client";

/**
 * SPEC-28 Fase 2 — a aba de acessos.
 *
 * Um papel é uma matriz recurso × ação mais uma lista de pessoas, cada uma com
 * escopo (organização inteira ou um time). Os três eixos da §4.1 aparecem na
 * tela na mesma ordem em que existem no modelo, porque foi assim que o usuário
 * descreveu o problema: *"grupo de agilidade pode editar os agentes… em outra
 * empresa isso ocorre por time"*.
 *
 * O catálogo de recursos vem do servidor (`/acessos/catalogo`): uma lista
 * copiada aqui envelheceria em silêncio quando um recurso novo nascesse — e
 * uma tela de permissão que não mostra um recurso é uma permissão que ninguém
 * consegue conceder.
 */
export function AcessosTab({ timeAtivo }: { timeAtivo: string }) {
  const [papeis, setPapeis] = useState<PapelAcesso[] | null>(null);
  const [catalogo, setCatalogo] = useState<{ recursos: string[]; acoes: string[] } | null>(null);
  const [rbacAtivo, setRbacAtivo] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  // SPEC-39 — as solicitações de ajuste do PDCA (aprovar/rejeitar aqui).
  const [ajustes, setAjustes] = useState<SolicitacaoAjuste[]>([]);

  async function recarregar() {
    const [lista, minhas, pedidos] = await Promise.all([
      apiAcessos.papeis(),
      apiAcessos.minhas(timeAtivo),
      apiPdca.listarAjustes(timeAtivo).catch(() => []),
    ]);
    setPapeis(lista);
    setRbacAtivo(minhas.rbacAtivo);
    setAjustes(pedidos);
  }

  useEffect(() => {
    let cancelado = false;
    // As solicitações do PDCA entram JÁ no mount — o defeito real da §183 era
    // este efeito ter um Promise.all próprio, sem os ajustes: a seção só
    // aparecia depois de alguma ação recarregar.
    Promise.all([
      apiAcessos.catalogo(),
      apiAcessos.papeis(),
      apiAcessos.minhas(timeAtivo),
      apiPdca.listarAjustes(timeAtivo).catch(() => []),
    ])
      .then(([cat, lista, minhas, pedidos]) => {
        if (cancelado) return;
        setCatalogo(cat);
        setPapeis(lista);
        setRbacAtivo(minhas.rbacAtivo);
        setAjustes(pedidos);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, [timeAtivo]);

  async function executar(acao: () => Promise<unknown>) {
    setSalvando(true);
    setErro(null);
    try {
      await acao();
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  function alternar(papel: PapelAcesso, recurso: string, acao: string) {
    const tem = papel.permissoes.some((p) => p.recurso === recurso && p.acao === acao);
    const permissoes = tem
      ? papel.permissoes.filter((p) => !(p.recurso === recurso && p.acao === acao))
      : [...papel.permissoes, { recurso, acao }];
    void executar(() => apiAcessos.salvarPapel(papel.id, { nome: papel.nome, permissoes }));
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={introEstilo}>
        Quem pode ler, editar e aprovar cada área de configuração. Um papel vale na organização inteira ou só num
        time — é o que permite a mesma configuração servir empresas organizadas por área e por time.
      </p>

      {/* O estado "sem papel nenhum" é informação, não vazio: é ele que diz por
          que ninguém está sendo barrado ainda (§4.3). */}
      {rbacAtivo === false && (
        <p style={avisoEstilo} data-testid="acessos-modo-aberto">
          Nenhum papel criado ainda — <strong>todo membro edita tudo</strong>, como antes. O controle passa a valer
          assim que você criar o primeiro papel.
        </p>
      )}

      {erro && <p style={{ fontSize: 12, color: "var(--vermelho)" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Nome do papel (ex.: Agilidade, Arquitetura)"
          aria-label="Nome do novo papel"
          style={campoEstilo}
        />
        <button
          onClick={() => {
            const nome = novoNome.trim();
            if (!nome) return;
            void executar(() => apiAcessos.criarPapel({ nome, permissoes: [] })).then(() => setNovoNome(""));
          }}
          disabled={!novoNome.trim() || salvando}
          style={botaoEstilo}
        >
          Criar papel
        </button>
      </div>

      {/* SPEC-39 — o PDCA desagua aqui: pedidos de quem não pode editar,
          decididos por quem pode. Aprovar checa a VALIDADE no servidor — se a
          config mudou desde o pedido, ele vira "invalida" com o motivo. */}
      {/* SPEC-45 — as solicitações de ajuste mudaram de casa: elas são
          PDCA (melhoria), não permissão. Moram em Configurações → PDCA. */}


      {papeis === null && !erro && <p style={{ fontSize: 12.5, color: "var(--texto-fraco)" }}>Carregando…</p>}

      {papeis?.map((papel) => (
        <section key={papel.id} style={cartaoEstilo} data-testid={`papel-${papel.nome}`}>
          <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{papel.nome}</strong>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => void executar(() => apiAcessos.excluirPapel(papel.id))}
              disabled={salvando}
              style={{ ...botaoEstilo, borderColor: "var(--borda-forte)", color: "var(--texto-fraco)" }}
            >
              Excluir
            </button>
          </header>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={thEstilo}>Recurso</th>
                {catalogo?.acoes.map((acao) => (
                  <th key={acao} style={{ ...thEstilo, textAlign: "center", width: 70 }}>
                    {acao}
                    {/* Honestidade sobre o que ainda não existe: a permissão de
                        aprovar é guardada, mas o fluxo de aprovação é a Fase 3. */}
                    {acao === "aprovar" && <span style={{ ...seloEstilo }}>fase 3</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalogo?.recursos.map((recurso) => (
                <tr key={recurso}>
                  <td style={tdEstilo}>{recurso}</td>
                  {catalogo.acoes.map((acao) => (
                    <td key={acao} style={{ ...tdEstilo, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        aria-label={`${papel.nome}: ${acao} ${recurso}`}
                        checked={papel.permissoes.some((p) => p.recurso === recurso && p.acao === acao)}
                        disabled={salvando}
                        onChange={() => alternar(papel, recurso, acao)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <MembrosDoPapel papel={papel} timeAtivo={timeAtivo} salvando={salvando} onExecutar={executar} />
        </section>
      ))}
    </div>
  );
}

function MembrosDoPapel({
  papel,
  timeAtivo,
  salvando,
  onExecutar,
}: {
  papel: PapelAcesso;
  timeAtivo: string;
  salvando: boolean;
  onExecutar: (acao: () => Promise<unknown>) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [porTime, setPorTime] = useState(false);

  return (
    <div style={{ marginTop: 10 }}>
      <span style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>Pessoas neste papel</span>
      <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 12.5 }}>
        {papel.membros.length === 0 && <li style={{ color: "var(--texto-mudo)" }}>ninguém ainda</li>}
        {papel.membros.map((m) => (
          <li key={m.email + String(m.escopoTimeId)}>
            {m.email}{" "}
            <span style={{ color: "var(--texto-fraco)" }}>
              {m.escopoTimeId ? `— só no time ${m.escopoTimeId}` : "— organização inteira"}
            </span>{" "}
            <button
              onClick={() => void onExecutar(() => apiAcessos.removerMembro(papel.id, m.email))}
              disabled={salvando}
              style={botaoLinkEstilo}
            >
              remover
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e-mail"
          aria-label={`Adicionar pessoa em ${papel.nome}`}
          style={{ ...campoEstilo, maxWidth: 260 }}
        />
        <label style={{ fontSize: 11.5, color: "var(--texto-2)", display: "flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" checked={porTime} onChange={(e) => setPorTime(e.target.checked)} />
          só no time {timeAtivo}
        </label>
        <button
          onClick={() => {
            const alvo = email.trim();
            if (!alvo) return;
            void onExecutar(() =>
              apiAcessos.adicionarMembro(papel.id, { email: alvo, escopoTimeId: porTime ? timeAtivo : undefined })
            ).then(() => setEmail(""));
          }}
          disabled={!email.trim() || salvando}
          style={botaoEstilo}
        >
          Adicionar
        </button>
      </div>

      {/* SPEC-38 F3 — o papel portado por TIME: os owners do time herdam, e a
          permissão acompanha a composição (entrar/sair/mudar nível). */}
      <span style={{ fontSize: 11.5, color: "var(--texto-fraco)", display: "block", marginTop: 10 }}>
        Times que portam este papel (os owners do time herdam)
      </span>
      <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 12.5 }}>
        {papel.times.length === 0 && <li style={{ color: "var(--texto-mudo)" }}>nenhum time</li>}
        {papel.times.map((t) => (
          <li key={t}>
            {t}{" "}
            <button
              onClick={() => void onExecutar(() => apiAcessos.removerTime(papel.id, t))}
              disabled={salvando}
              style={botaoLinkEstilo}
            >
              remover
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => void onExecutar(() => apiAcessos.adicionarTime(papel.id, timeAtivo))}
        disabled={salvando || papel.times.includes(timeAtivo)}
        style={botaoEstilo}
        aria-label={`Atribuir ${papel.nome} ao time ${timeAtivo}`}
      >
        + Atribuir ao time {timeAtivo}
      </button>
    </div>
  );
}

const introEstilo: React.CSSProperties = {
  fontSize: 13,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  marginTop: 0,
  maxWidth: 680,
};

const avisoEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--amarelo)",
  border: "1px solid rgba(232, 179, 57, 0.3)",
  borderRadius: 8,
  padding: "8px 10px",
};

const cartaoEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
  background: "var(--painel)",
};

const thEstilo: React.CSSProperties = {
  fontSize: 11,
  color: "var(--texto-fraco)",
  textAlign: "left",
  padding: "4px 6px",
  borderBottom: "1px solid var(--borda)",
  fontWeight: 500,
};

const tdEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--texto-2)",
  padding: "3px 6px",
  borderBottom: "1px solid var(--borda)",
};

const seloEstilo: React.CSSProperties = {
  fontSize: 9,
  marginLeft: 4,
  color: "var(--texto-mudo)",
};

const campoEstilo: React.CSSProperties = {
  flex: 1,
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto, #15202D)",
  color: "var(--texto)",
  fontSize: 12.5,
};

const botaoEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
};

const botaoLinkEstilo: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--texto-fraco)",
  fontSize: 11,
  cursor: "pointer",
  textDecoration: "underline",
};

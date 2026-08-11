import { useEffect, useState } from "react";
import type { ItemProcesso, RegrasConfig, RegrasPorTech, Requisito, TesteAutomatizado } from "@gerador/engine";
import { apiRegras, type DiagnosticoConfig, type SugestaoRegra, type SugestaoTeste } from "../api/client";
import { SugerirComIa } from "./SugerirComIa";
import { SeletorDeContextos } from "./SeletorDeContextos";

/**
 * SPEC-23 fluxo 5 — editor de `config/regras.json`.
 *
 * Este arquivo é a tabela que decide QUAIS requisitos cada item gerado recebe
 * (por tech e contexto). Era o único arquivo de configuração sem rota nem
 * tela: só dava pra editar à mão, apesar de ser o que mais muda com o tempo —
 * cada aprendizado do time deveria virar uma linha aqui.
 *
 * As quatro listas ficam em seções SEPARADAS, não numa lista só: a SPEC-20
 * desfez exatamente essa mistura no domínio (o que se DECIDE no desenho versus
 * o que se FAZ pra executar), e juntá-las na tela desfaria a distinção de novo.
 *
 * `when` (condição sobre os nós) continua fora da edição — é a parte mais
 * sutil da configuração, e uma UI ingênua pra ela induziria erro silencioso.
 * Item que já tem `when` aparece com selo e é preservado intacto.
 */
type Secao = "tecnico" | "processo" | "testes" | "volumetria";

const SECOES: { id: Secao; rotulo: string }[] = [
  { id: "tecnico", rotulo: "Técnico" },
  { id: "processo", rotulo: "Processo" },
  { id: "testes", rotulo: "Testes" },
  { id: "volumetria", rotulo: "Volumetria" },
];

export interface RegrasTabProps {
  /**
   * SPEC-28 Fase 2 — as quatro seções são QUATRO recursos do RBAC, e podem ter
   * donos diferentes (Agilidade no processo, Arquitetura no técnico). Filtrar
   * aqui, e não esconder a aba inteira, é o que torna a delegação possível:
   * quem cuida só do processo continua enxergando a sua seção.
   *
   * Ausente (modo local, sem RBAC) = pode tudo.
   */
  podeSecao?: (id: Secao) => boolean;
  /** Os contextos conhecidos (`appConfig.contextos`) — viram o seletor por
   * clique no lugar do campo "separados por vírgula", que exigia digitar
   * valores como "Backend-mensagens rabbitmq" de cabeça (e um typo não
   * avisava: a regra só nunca casava). Vazio = cai no input livre. */
  contextos?: string[];
  /** tech → labels dos componentes que a usam (derivado de
   * `diagramaConfig.nodeTypes`). É o que traduz o eixo interno ("tech") para
   * o vocabulário do produto: o cabeçalho de cada grupo diz PARA QUAIS
   * COMPONENTES as regras valem — "padrão por componente", como o usuário
   * nomeou, sem nenhum seletor pra operar. */
  componentesPorTech?: Record<string, string[]>;
}

export function RegrasTab({ podeSecao, contextos, componentesPorTech }: RegrasTabProps = {}) {
  const todasAsOpcoes = contextos ?? [];
  const secoesVisiveis = SECOES.filter((s) => podeSecao?.(s.id) ?? true);
  const [regras, setRegras] = useState<RegrasConfig | null>(null);
  const [secao, setSecao] = useState<Secao>(secoesVisiveis[0]?.id ?? "tecnico");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoConfig | null>(null);

  useEffect(() => {
    apiRegras
      .obterComDiagnostico()
      .then((envelope) => {
        setRegras(envelope.documento);
        setDiagnostico(envelope.diagnostico);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  if (erro && !regras) return <p style={erroEstilo}>{erro}</p>;
  if (!regras) return <p style={{ color: "var(--texto-fraco)", fontSize: 13 }}>Carregando regras…</p>;

  // O seletor "Tecnologia" saiu (achado do usuário: "nem precisaria existir
  // essa label — nós temos padrão por componente"). O DOCUMENTO continua por
  // tech; a tela empilha um grupo por tech e o cabeçalho de cada grupo diz
  // para quais componentes ele vale — agrupamento se lê, seletor se opera.
  const techs = Object.keys(regras.porTech ?? {});
  const blocoDe = (tech: string): RegrasPorTech => regras.porTech[tech] ?? { checklistTecnico: [], testes: [] };

  // Contexto pertence à tech pelo prefixo ("Mobile-android" só existe em
  // componentes Mobile) — convenção medida em TODOS os nodeTypes da config.
  // Oferecer "Backend-cache" numa regra Mobile nunca casaria com item nenhum.
  // Tech sem contexto próprio cai na lista completa — melhor oferecer demais
  // do que travar a edição.
  function opcoesDeContextoDe(tech: string): string[] {
    const daTech = todasAsOpcoes.filter((c) => c.toLowerCase().startsWith(`${tech.toLowerCase()}-`));
    return daTech.length > 0 ? daTech : todasAsOpcoes;
  }

  async function gravar(novo: RegrasConfig) {
    setRegras(novo);
    setSalvando(true);
    setErro(null);
    try {
      await apiRegras.salvar(novo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  /** Troca só o pedaço editado do bloco da tech — o resto do arquivo (outras
   * techs, `tipos`, `tamanhos`, e as listas que esta seção não edita) passa
   * intacto. A tela nunca é dona do arquivo inteiro. */
  function comBloco(tech: string, mudanca: Partial<RegrasPorTech>): RegrasConfig {
    return { ...regras!, porTech: { ...regras!.porTech, [tech]: { ...blocoDe(tech), ...mudanca } } };
  }

  /** O elo com o vocabulário do produto: quais componentes usam esta tech. */
  function valePara(tech: string): string {
    const componentes = componentesPorTech?.[tech] ?? [];
    return componentes.length > 0 ? `vale para: ${componentes.join(", ")}` : "";
  }

  const totalDe = (chave: "checklistTecnico" | "checklistProcesso" | "testes") =>
    techs.reduce((soma, t) => soma + (blocoDe(t)[chave]?.length ?? 0), 0);

  return (
    <div>
      {/* SPEC-31 Fase 3 — o aviso que faltava no §108. A ferramenta nunca
          sobrescreve a sua config; o que ela passou a fazer é dizer quando uma
          seção inteira está vazia porque foi criada depois do seu arquivo. */}
      {diagnostico?.possivelmenteDesatualizada && (
        <div data-testid="aviso-config-desatualizada" style={avisoEstilo}>
          <strong>Sua tabela de regras parece ser de uma versão anterior.</strong>
          <p style={{ margin: "6px 0 0" }}>{diagnostico.mensagem}</p>
        </div>
      )}
      <p style={introTextoEstilo}>
        O que você configura aqui vira o conteúdo dos itens gerados — é também o que a esteira de agentes recebe pra
        responder. Cada grupo diz para quais componentes vale; contextos vazios valem para todos os itens daqueles
        componentes.
      </p>

      <div style={{ ...cardEstilo, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {secoesVisiveis.map((s) => (
            <button
              key={s.id}
              onClick={() => setSecao(s.id)}
              style={secao === s.id ? subAbaAtivaEstilo : subAbaEstilo}
              data-testid={`secao-${s.id}`}
            >
              {s.rotulo}
              {s.id === "tecnico" && ` (${totalDe("checklistTecnico")})`}
              {s.id === "processo" && ` (${totalDe("checklistProcesso")})`}
              {s.id === "testes" && ` (${totalDe("testes")})`}
            </button>
          ))}
        </div>
        {salvando && <span style={{ fontSize: 11.5, color: "var(--texto-mudo)" }}>salvando…</span>}
        {erro && <span style={{ fontSize: 11.5, color: "var(--vermelho)" }}>{erro}</span>}
      </div>

      {techs.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", marginTop: 12 }}>
          Nenhum grupo de regras configurado ainda neste ambiente.
        </p>
      )}

      {techs.map((tech) => (
        <section key={tech} data-testid={`regras-grupo-${tech}`} style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 2px", fontSize: 13.5, color: "var(--texto)" }}>{tech}</h3>
          {valePara(tech) && (
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--texto-mudo)" }}>{valePara(tech)}</p>
          )}

          {secao === "tecnico" && (
            <ListaDeTexto
              titulo="Requisitos de refinamento técnico"
              ajuda="O que precisa ser DECIDIDO no desenho antes de implementar."
              itens={blocoDe(tech).checklistTecnico ?? []}
              alvoIa="regra-refinamento"
              exemploIa="ex.: o que o time precisa decidir sobre idempotência de mensagem"
              tech={tech}
              onMudar={(lista) => void gravar(comBloco(tech, { checklistTecnico: lista as Requisito[] }))}
              onEditarLocal={(lista) => setRegras(comBloco(tech, { checklistTecnico: lista as Requisito[] }))}
              onSalvarPendente={() => void gravar(regras)}
              opcoesDeContexto={opcoesDeContextoDe(tech)}
            />
          )}

          {secao === "processo" && (
            <ListaDeTexto
              titulo="Checklist de processo"
              ajuda="O que o time precisa FAZER pra conseguir executar e testar (mock, massa, acesso) — diferente do que precisa ser decidido."
              itens={blocoDe(tech).checklistProcesso ?? []}
              alvoIa="item-processo"
              exemploIa="ex.: o que precisa estar pronto no ambiente antes de testar"
              tech={tech}
              onMudar={(lista) => void gravar(comBloco(tech, { checklistProcesso: lista as ItemProcesso[] }))}
              onEditarLocal={(lista) => setRegras(comBloco(tech, { checklistProcesso: lista as ItemProcesso[] }))}
              onSalvarPendente={() => void gravar(regras)}
              opcoesDeContexto={opcoesDeContextoDe(tech)}
            />
          )}

          {secao === "testes" && (
            <ListaDeTestes
              itens={blocoDe(tech).testes ?? []}
              tech={tech}
              onMudar={(lista) => void gravar(comBloco(tech, { testes: lista }))}
              onEditarLocal={(lista) => setRegras(comBloco(tech, { testes: lista }))}
              onSalvarPendente={() => void gravar(regras)}
            />
          )}

          {secao === "volumetria" && (
            <Volumetria
              valor={blocoDe(tech).volumetria}
              onMudar={(v) => void gravar(comBloco(tech, { volumetria: v }))}
              opcoesDeContexto={opcoesDeContextoDe(tech)}
            />
          )}
        </section>
      ))}
    </div>
  );
}

/** Editor comum das duas listas cujo item é {texto, contextos} — checklist
 * técnico e checklist de processo. A forma é a mesma; o que muda é o rótulo,
 * a explicação e o alvo de sugestão da IA. */
function ListaDeTexto({
  titulo,
  ajuda,
  itens,
  alvoIa,
  exemploIa,
  tech,
  onMudar,
  onEditarLocal,
  onSalvarPendente,
  opcoesDeContexto,
}: {
  titulo: string;
  ajuda: string;
  itens: (Requisito | ItemProcesso)[];
  alvoIa: "regra-refinamento" | "item-processo";
  exemploIa: string;
  tech: string;
  onMudar: (lista: (Requisito | ItemProcesso)[]) => void;
  onEditarLocal: (lista: (Requisito | ItemProcesso)[]) => void;
  onSalvarPendente: () => void;
  opcoesDeContexto: string[];
}) {
  const [novoTexto, setNovoTexto] = useState("");
  const [novosContextos, setNovosContextos] = useState<string[]>([]);

  function adicionar(texto: string, contextos: string[]) {
    if (!texto.trim()) return;
    onMudar([...itens, { texto: texto.trim(), contextos }]);
    setNovoTexto("");
    setNovosContextos([]);
  }

  return (
    <>
      <SugerirComIa<SugestaoRegra>
        alvo={alvoIa}
        contexto={`Tecnologia: ${tech}. Itens que já existem nesta lista: ${
          itens.map((r) => r.texto).join("; ") || "(nenhum)"
        }`}
        exemplo={exemploIa}
        onSugestao={(s) => adicionar(s.texto, s.contextos ?? [])}
      />

      <div style={{ ...cardEstilo, marginTop: 12 }}>
        <strong style={{ fontSize: 13, color: "var(--texto)" }}>{titulo}</strong>
        <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--texto-mudo)" }}>{ajuda}</p>

        <ul style={listaEstilo}>
          {itens.map((r, i) => (
            <li key={i} style={linhaEstilo} data-testid={`regra-${i}`}>
              <textarea
                value={r.texto}
                onChange={(e) => onEditarLocal(itens.map((x, n) => (n === i ? { ...x, texto: e.target.value } : x)))}
                onBlur={onSalvarPendente}
                rows={2}
                aria-label={`Texto do item ${i + 1}`}
                style={textareaEstilo}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                {/* Toggle persiste direto (como o "remover" ao lado) — clique é
                    gesto completo, não digitação esperando blur. */}
                <SeletorDeContextos
                  valores={r.contextos}
                  opcoes={opcoesDeContexto}
                  onMudar={(contextos) => onMudar(itens.map((x, n) => (n === i ? { ...x, contextos } : x)))}
                  rotuloVazio="vazio vale sempre"
                  ariaLabel={`Contextos do item ${i + 1}`}
                />
                {r.when && (
                  <span style={seloEstilo} title="Este item tem uma condição (`when`) editável só no arquivo">
                    condicional
                  </span>
                )}
                <button
                  onClick={() => onMudar(itens.filter((_, n) => n !== i))}
                  style={botaoRemoverEstilo}
                  aria-label={`Remover item ${i + 1}`}
                >
                  remover
                </button>
              </div>
            </li>
          ))}
          {itens.length === 0 && <li style={vazioEstilo}>Nada configurado para esta tecnologia ainda.</li>}
        </ul>

        <div style={{ ...linhaEstilo, marginTop: 10 }}>
          <textarea
            value={novoTexto}
            onChange={(e) => setNovoTexto(e.target.value)}
            rows={2}
            placeholder="Novo item"
            aria-label="Novo item"
            style={textareaEstilo}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <SeletorDeContextos
              valores={novosContextos}
              opcoes={opcoesDeContexto}
              onMudar={setNovosContextos}
              rotuloVazio="contextos (opcional) — vazio vale sempre"
              ariaLabel="Contextos do novo item"
            />
            <button
              onClick={() => adicionar(novoTexto, novosContextos)}
              disabled={!novoTexto.trim()}
              style={botaoAdicionarEstilo}
            >
              + Adicionar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ListaDeTestes({
  itens,
  tech,
  onMudar,
  onEditarLocal,
  onSalvarPendente,
}: {
  itens: TesteAutomatizado[];
  tech: string;
  onMudar: (lista: TesteAutomatizado[]) => void;
  onEditarLocal: (lista: TesteAutomatizado[]) => void;
  onSalvarPendente: () => void;
}) {
  function editar(i: number, mudanca: Partial<TesteAutomatizado>, salvarJa = false) {
    const lista = itens.map((t, n) => (n === i ? { ...t, ...mudanca } : t));
    if (salvarJa) onMudar(lista);
    else onEditarLocal(lista);
  }

  return (
    <>
      <SugerirComIa<SugestaoTeste>
        alvo="teste-automatizado"
        contexto={`Tecnologia: ${tech}. Ciclos que já existem: ${
          itens.map((t) => t.tipo).join("; ") || "(nenhum)"
        }`}
        exemplo="ex.: um ciclo que prove o contrato da mensagem publicada"
        onSugestao={(s) =>
          onMudar([
            ...itens,
            {
              tipo: s.tipo,
              validacao: s.validacao,
              contextos: s.contextos ?? [],
              dev: !!s.dev,
              hlg: !!s.hlg,
            },
          ])
        }
      />

      <div style={{ ...cardEstilo, marginTop: 12 }}>
        <strong style={{ fontSize: 13, color: "var(--texto)" }}>Ciclos de teste automatizado</strong>
        <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--texto-mudo)" }}>
          Cada ciclo vira uma linha na tabela de testes do item, com os ambientes em que roda.
        </p>

        <ul style={listaEstilo}>
          {itens.map((t, i) => (
            <li key={i} style={linhaEstilo} data-testid={`teste-${i}`}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={t.tipo}
                  onChange={(e) => editar(i, { tipo: e.target.value })}
                  onBlur={onSalvarPendente}
                  placeholder="tipo do ciclo"
                  aria-label={`Tipo do teste ${i + 1}`}
                  style={{ ...inputEstilo, maxWidth: 220 }}
                />
                <input
                  value={t.validacao}
                  onChange={(e) => editar(i, { validacao: e.target.value })}
                  onBlur={onSalvarPendente}
                  placeholder="o que o teste prova"
                  aria-label={`Validação do teste ${i + 1}`}
                  style={inputEstilo}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <input
                  value={t.contextos.join(", ")}
                  onChange={(e) =>
                    editar(i, { contextos: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })
                  }
                  onBlur={onSalvarPendente}
                  placeholder="contextos (opcional)"
                  aria-label={`Contextos do teste ${i + 1}`}
                  style={inputEstilo}
                />
                <label style={caixaAmbienteEstilo}>
                  <input
                    type="checkbox"
                    checked={t.dev}
                    onChange={(e) => editar(i, { dev: e.target.checked }, true)}
                    aria-label={`Teste ${i + 1} roda em dev`}
                  />
                  dev
                </label>
                <label style={caixaAmbienteEstilo}>
                  <input
                    type="checkbox"
                    checked={t.hlg}
                    onChange={(e) => editar(i, { hlg: e.target.checked }, true)}
                    aria-label={`Teste ${i + 1} roda em hlg`}
                  />
                  hlg
                </label>
                <button
                  onClick={() => onMudar(itens.filter((_, n) => n !== i))}
                  style={botaoRemoverEstilo}
                  aria-label={`Remover teste ${i + 1}`}
                >
                  remover
                </button>
              </div>
            </li>
          ))}
          {itens.length === 0 && <li style={vazioEstilo}>Nenhum ciclo de teste para esta tecnologia ainda.</li>}
        </ul>
      </div>
    </>
  );
}

/** Volumetria não é lista: é um interruptor por contexto. Presente = o bloco
 * fixo (Response time / Max error / RPS / Test duration) entra no item, sempre
 * em branco pra preenchimento — o formato é exigido pelo agente validador e
 * nunca é inventado aqui, então não há o que editar além de ONDE ele aparece. */
function Volumetria({
  valor,
  onMudar,
  opcoesDeContexto,
}: {
  valor: { contextos: string[] } | undefined;
  onMudar: (v: { contextos: string[] } | undefined) => void;
  opcoesDeContexto: string[];
}) {
  const ligada = valor !== undefined;
  return (
    <div style={{ ...cardEstilo, marginTop: 12 }}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={ligada}
          onChange={(e) => onMudar(e.target.checked ? { contextos: valor?.contextos ?? [] } : undefined)}
          aria-label="Exigir requisitos de volumetria"
          style={{ marginTop: 3 }}
        />
        <span>
          <strong style={{ fontSize: 13, color: "var(--texto)", display: "block" }}>
            Exigir requisitos de volumetria
          </strong>
          <span style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.6 }}>
            Acrescenta o bloco fixo (Response time, Max error, RPS, Test duration) aos itens desta tecnologia,
            sempre em branco — o formato é o exigido pelo agente validador, não é editável aqui.
          </span>
        </span>
      </label>

      {ligada && (
        <div style={{ marginTop: 10, display: "flex" }}>
          <SeletorDeContextos
            valores={valor!.contextos}
            opcoes={opcoesDeContexto}
            onMudar={(contextos) => onMudar({ contextos })}
            rotuloVazio="vazio vale sempre que a tecnologia aparecer"
            ariaLabel="Contextos da volumetria"
          />
        </div>
      )}
    </div>
  );
}

const introTextoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.6,
  margin: "0 0 14px",
};

const cardEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 12,
  background: "var(--painel)",
};

const listaEstilo: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "10px 0 0",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const linhaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 6,
  padding: 8,
  background: "var(--painel-alto, #15202D)",
};

const textareaEstilo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 12.5,
  resize: "vertical",
};

const inputEstilo: React.CSSProperties = { ...textareaEstilo, flex: 1, resize: undefined };

const selectEstilo: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 12.5,
};

const subAbaEstilo: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--borda)",
  background: "transparent",
  color: "var(--texto-fraco)",
  fontSize: 12,
  cursor: "pointer",
};

const subAbaAtivaEstilo: React.CSSProperties = {
  ...subAbaEstilo,
  border: "1px solid var(--acento)",
  color: "var(--acento)",
};

const botaoAdicionarEstilo: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--acento)",
  background: "transparent",
  color: "var(--acento)",
  fontSize: 12.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoRemoverEstilo: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--borda-forte)",
  background: "transparent",
  color: "var(--texto-fraco)",
  fontSize: 11.5,
  cursor: "pointer",
};

const caixaAmbienteEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11.5,
  color: "var(--texto-2)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const seloEstilo: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--amarelo)",
  border: "1px solid var(--borda-forte)",
  borderRadius: 4,
  padding: "2px 6px",
  whiteSpace: "nowrap",
};

const vazioEstilo: React.CSSProperties = { fontSize: 12.5, color: "var(--texto-mudo)" };

const erroEstilo: React.CSSProperties = { color: "var(--vermelho)", fontSize: 12.5 };

const avisoEstilo: React.CSSProperties = {
  border: "1px solid #b45309",
  background: "rgba(180, 83, 9, 0.12)",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 14,
  fontSize: 13,
  lineHeight: 1.5,
};

import { useEffect, useRef, useState } from "react";
import type { DiagramaConfig, No, Quebra } from "@gerador/engine";
import type { Cenario } from "./scenarios";
import { CicloDoProduto } from "./CicloDoProduto";
import { Jornada } from "./Jornada";

// "perfis" saiu daqui pra ConfigScreen.tsx — é config recorrente de time, não
// onboarding/demo (ver SPEC-08 §3.5).
// A aba "cli" morreu com o modo local (SPEC-33) — a revisão geral da demo
// (pedido do usuário: "fala de CLI, que nem temos mais") tirou o resto.
// SPEC-109 E — "como-usar" nasceu da queixa literal ("em como funciona não
// explica como usar") e é a ABA PADRÃO: quem abre a porta quer operar.
export type AbaJornada = "como-usar" | "jornada" | "cenarios";

export interface JourneyModalProps {
  config: DiagramaConfig;
  cenarios: Cenario[];
  onFechar: () => void;
  onCarregarCenario: (quebra: Quebra) => void;
  onAdicionarCenario: (quebra: Quebra) => void;
  onIniciarTour: () => void;
  /** §236 — o segundo tour: o que se molda pro time (IA, esteira, regras,
   * campos de conexão). Separado do primeiro para ele não virar 25 passos. */
  onIniciarTourDeConfiguracao: () => void;
  /** Troca a aba ativa de fora (usado pelo tour guiado pra abrir/navegar entre abas sem fechar e reabrir a modal). */
  abaForcada?: AbaJornada;
}

export function JourneyModal({
  config,
  cenarios,
  onFechar,
  onCarregarCenario,
  onAdicionarCenario,
  onIniciarTour,
  onIniciarTourDeConfiguracao,
  abaForcada,
}: JourneyModalProps) {
  const [aba, setAba] = useState<AbaJornada>(abaForcada ?? "como-usar");

  useEffect(() => {
    if (abaForcada) setAba(abaForcada);
  }, [abaForcada]);

  function carregar(cenario: Cenario) {
    onCarregarCenario(cenario.quebra);
    onFechar();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
      onClick={onFechar}
    >
      <div
        data-tour="journey-modal-content"
        style={{
          background: "var(--painel)",
          borderRadius: 16,
          width: "min(920px, 100%)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.35)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--borda)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--texto)" }}>Como funciona o Gerador de Itens</div>
            <div style={{ fontSize: 12, color: "var(--texto-fraco)", marginTop: 2 }}>
              Não é um gerador de prompt de IA — é um mecanismo determinístico, do diagrama ao documento de desenho e aos itens de trabalho.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onIniciarTourDeConfiguracao} style={botaoTourSecundarioEstilo} data-testid="tour-configuracao">
            ▶ Tour de configuração
          </button>
          <button onClick={onIniciarTour} style={botaoTourEstilo}>
            ▶ Iniciar tour guiado
          </button>
          <button onClick={onFechar} style={botaoFecharEstilo} aria-label="Fechar">
            ×
          </button>
        </header>

        <div style={{ display: "flex", gap: 4, padding: "12px 24px 0" }}>
          <button onClick={() => setAba("como-usar")} style={aba === "como-usar" ? abaAtivaEstilo : abaEstilo}>
            Como usar
          </button>
          <button onClick={() => setAba("jornada")} style={aba === "jornada" ? abaAtivaEstilo : abaEstilo}>
            A jornada
          </button>
          <button onClick={() => setAba("cenarios")} style={aba === "cenarios" ? abaAtivaEstilo : abaEstilo}>
            Cenários prontos ({cenarios.length})
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {aba === "como-usar" && <ComoUsar />}
          {aba === "jornada" && (
            <>
              {/* SPEC-76 §7.1 — pré-login E de dentro, com um componente só.
                  A pergunta em aberto da SPEC ("qual dos dois?") já tinha
                  resposta implementada aqui: a `Jornada` sempre foi
                  compartilhada, justamente "pra não dessincronizar duas
                  explicações da mesma coisa". O ciclo entra pela mesma porta —
                  quem já usa esquece o todo, e o §251 mostrou três vezes que
                  demonstração pela metade custa caro. */}
              <CicloDoProduto />
              <div style={{ height: 28 }} />
              <Jornada />
            </>
          )}
          {aba === "cenarios" && (
            <Cenarios cenarios={cenarios} config={config} onCarregar={carregar} onAdicionar={onAdicionarCenario} />
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * SPEC-109 E — **o manual de uso, passo a passo** ("em como funciona não
 * explica como usar", queixa literal). Cada passo nomeia o GESTO real — o
 * botão, o menu, a tela — no vocabulário que está nas telas hoje (SPEC-109
 * B/C/D: integração externa, mesa de projeto, canvas de fluxos). Os tours no
 * topo desta modal mostram os mesmos passos ao vivo.
 */
const PASSOS_DE_USO: { titulo: string; texto: string }[] = [
  {
    titulo: "Conecte um modelo de IA",
    texto:
      "☰ Menu → Modelo de IA: informe a base URL do gateway, a chave e o nome do modelo. É o que dá voz aos agentes — sem isso a esteira fica \"sem modelo\" e só o motor (determinístico) trabalha.",
  },
  {
    titulo: "Desenhe a demanda na mesa de projeto",
    texto:
      "Adicione componentes pela paleta (+ Serviço, + Fila…) e responda os campos de cada um — ou descreva a demanda para o assistente (✦, por texto, voz ou print de lousa) e aceite a proposta. A aba \"Cenários prontos\" aqui ao lado carrega exemplos completos.",
  },
  {
    titulo: "Dê um título e derive",
    texto:
      "O motor lê o desenho + a configuração do time e ESCREVE os itens de trabalho — o documento abre com um card por item, sempre o mesmo resultado para o mesmo desenho.",
  },
  {
    titulo: "Rode a esteira de agentes no canvas",
    // SPEC-110 fatia A (D19) — o passo passa a nomear o GATILHO: todo fluxo
    // diz quando roda, e "▶ Rodar agora" é o gesto do gatilho manual. Sem
    // isso o manual ensinaria um botão que a tela não tem mais.
    texto:
      "☰ Menu → Fluxos de integração (a esteira também abre sozinha ao derivar): o primeiro cartão é o GATILHO — ele diz quando o fluxo roda. Com o gatilho manual, \"▶ Rodar agora\" dispara os agentes (PO, Arquiteto, Especialista, QA) sobre a demanda aberta, ao vivo, nó a nó. Clicar num agente edita o papel dele — prompt, ligar/desligar, ordem.",
  },
  {
    // SPEC-110 fatia F (D19) — o gesto que MUDOU: quem põe a demanda num
    // fluxo escolhia um cartão só e descobria depois, pela aresta, se ele lia
    // ou gravava. Sem este passo, o manual ensinaria uma paleta que sumiu.
    titulo: "Diga se o fluxo LÊ ou GRAVA na demanda",
    texto:
      "Na paleta do canvas, a demanda tem dois cartões em vez de um: “Demanda — ler” traz o que ela carrega (desenho, itens, documento, volumetria, a fila da esteira) e “Demanda — gravar” recebe o que a fiação produziu (uma proposta de desenho, o retorno da exportação, o link publicado, as sugestões da esteira). A direção fica escrita no cartão, então o desenho responde sozinho o que antes exigia seguir a seta com o dedo. Escrever na demanda nunca aplica direto: um desenho gravado vira uma VARIANTE, e só passa a valer se alguém adotar na mesa. Para alguém ENTRAR na mesa no meio do fluxo, o cartão é outro — a tela “Mesa de projeto”.",
  },
  {
    // SPEC-110 fatia E (D19) — o gesto NOVO: o fluxo que roda sem ninguém.
    // Sem este passo, o manual só ensinaria fluxos que esperam um clique, e o
    // relógio — que passa a existir — ficaria invisível.
    titulo: "Faça o fluxo rodar sozinho, na hora marcada",
    texto:
      "Troque o gatilho para “🕐 Agendado” e escreva quando ele roda: cinco campos — minuto, hora, dia, mês, dia-da-semana — em UTC. “0 9 * * 1-5” é “dias úteis, às 9h”. Aceita * (qualquer), listas (1,15), intervalos (1-5) e passos (*/15). Logo abaixo o painel responde com a PRÓXIMA data, para você conferir antes de salvar. Salvar o desenho é que liga o relógio; tirar o gatilho é que o desliga. O fluxo agendado continua rodável na mão pelo “▶ Rodar agora”, e no histórico dá para ver quem disparou cada execução — você ou o relógio.",
  },
  {
    // SPEC-110 fatia B (D19) — o passo NOVO: a tela como nó. Sem ele, o
    // manual ensinaria um fluxo que sempre corre sozinho, e a pessoa que
    // encontrasse a execução parada não saberia que ela está esperando POR ELA.
    titulo: "Entre no fluxo quando ele parar numa tela",
    texto:
      "Um fluxo pode ter uma TELA no meio — é onde você entra. Quando a execução chega nela, ela PARA e o canvas mostra “aguardando uma tela — abrir →”. Você abre, revisa o que chegou (o ensaio, o documento, a mesa) e decide: “Avançar →” segue a fiação com a sua decisão; “← Retornar” encerra a execução para você ajustar e rodar de novo. O ensaio de cenários já vem assim de fábrica: o botão “Simular” da mesa roda o fluxo e para na bancada.",
  },
  {
    // SPEC-110 fatia C (D19) — o gesto NOVO: a tela que a PESSOA cria. Sem
    // este passo, o manual descreveria só as três telas do sistema e a
    // capacidade que o usuário mais pediu ficaria invisível.
    titulo: "Crie a sua própria tela",
    texto:
      "Clique num nó de tela no canvas → “editar a tela →”, ou vá direto a ☰ Menu → Configurações → Telas do time. Uma tela é uma pilha de blocos: TEXTO explica, DADO mostra o que a fiação trouxe, CAMPO pergunta (e o obrigatório trava o Avançar até preencher, dizendo o que falta), AÇÃO dá o seu nome ao botão. A prévia ao lado é exatamente o que a pessoa vai ver quando a execução parar ali.",
  },
  {
    titulo: "Confirme o que a IA escreveu",
    texto:
      "De volta ao documento, a seção de itens mostra as sugestões PENDENTES: confirme campo a campo, edite, escreva por cima ou \"Confirmar todas\". Nada que a IA propõe vale antes disso.",
  },
  {
    /**
     * SPEC-110 fatia D (D19) — o gesto novo: buscar dado FORA. Sem este
     * passo, o manual descreveria um produto que só fala com agentes.
     */
    titulo: "Traga dado de fora: uma chamada ou uma consulta",
    texto:
      "☰ Menu → Conectores: um conector é um endereço que a empresa chama (HTTP) ou uma CONSULTA no banco (Postgres). Na consulta, escreva o SELECT com :parâmetros — o valor nunca entra no texto do SQL — e guarde a conexão no cofre (ou na variável de ambiente que a tela indica). Ela roda em transação somente leitura, com tempo máximo e limite de linhas. Depois é só arrastar “+ Integração externa” no canvas e escolher o conector.",
  },
  {
    titulo: "Exporte e publique",
    texto:
      "Os fluxos \"Exportar prontos\" e \"Publicar documento\" levam os itens e o documento para onde o time trabalha — os destinos se cadastram no catálogo de integrações (☰ Menu → Conectores).",
  },
];

function ComoUsar() {
  return (
    <div data-testid="como-usar" style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 13, color: "var(--texto-fraco)", margin: "0 0 16px", lineHeight: 1.5 }}>
        O caminho inteiro, do desenho ao item exportado. Os dois tours no topo mostram estes passos ao vivo —
        este é o resumo para consultar depois.
      </p>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
        {PASSOS_DE_USO.map((passo, i) => (
          <li key={passo.titulo} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                background: "var(--acento-gente)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {i + 1}
            </span>
            <div>
              <strong style={{ fontSize: 13, color: "var(--texto)" }}>{passo.titulo}</strong>
              <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", margin: "3px 0 0", lineHeight: 1.5 }}>
                {passo.texto}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const ROTULO_CATEGORIA: Record<Cenario["categoria"], string> = {
  demo: "demo",
  "padrao-arquitetural": "arquitetura de referência",
  "aprendido-do-time": "aprendido do time",
};

function Cenarios({
  cenarios,
  config,
  onCarregar,
  onAdicionar,
}: {
  cenarios: Cenario[];
  config: DiagramaConfig;
  onCarregar: (c: Cenario) => void;
  onAdicionar: (quebra: Quebra) => void;
}) {
  const [adicionadoId, setAdicionadoId] = useState<string | null>(null);
  /**
   * O relógio do "adicionado ✓" precisa ser cancelável.
   *
   * Sem isto ele sobrevive ao fechamento da modal e chama `setAdicionadoId` num
   * componente que já saiu — em produção é o aviso de update em componente
   * desmontado, e na suíte é um `window is not defined` disparado DEPOIS que o
   * ambiente do teste foi derrubado. Apareceu ao acrescentar testes noutro
   * arquivo, que mudou a ordem de execução: o vazamento já existia e só não
   * tinha encontrado a janela certa para doer.
   */
  const relogioRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(relogioRef.current), []);

  function adicionar(cenario: Cenario) {
    onAdicionar(cenario.quebra);
    setAdicionadoId(cenario.id);
    clearTimeout(relogioRef.current);
    relogioRef.current = setTimeout(
      () => setAdicionadoId((atual) => (atual === cenario.id ? null : atual)),
      1500
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12,
      }}
    >
      {cenarios.map((cenario) => (
        <div
          key={cenario.id}
          style={{
            border: cenario.destaque ? "1.5px solid var(--acento-gente)" : "1px solid var(--borda)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: cenario.destaque ? "rgba(99, 102, 241, 0.14)" : "var(--painel)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {cenario.destaque && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "var(--acento-gente)",
                  color: "#fff",
                }}
              >
                fluxo completo
              </span>
            )}
            {cenario.categoria !== "demo" && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "rgba(62, 207, 142, 0.16)",
                  color: "var(--verde)",
                }}
              >
                {ROTULO_CATEGORIA[cenario.categoria]}
              </span>
            )}
            <strong style={{ fontSize: 13, color: "var(--texto)" }}>{cenario.titulo}</strong>
          </div>
          <p style={{ fontSize: 12, color: "var(--texto-fraco)", margin: 0, lineHeight: 1.45, flex: 1 }}>{cenario.descricao}</p>
          {cenario.designPatterns.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {cenario.designPatterns.map((padrao) => (
                <span
                  key={padrao}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 7px",
                    borderRadius: 999,
                    background: "rgba(99, 102, 241, 0.16)",
                    color: "#6d28d9",
                  }}
                >
                  {padrao}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {cenario.tipos.map((tipo) => (
              <span
                key={tipo}
                title={config.nodeTypes[tipo]?.label ?? tipo}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: config.nodeTypes[tipo]?.color ?? "#94a3b8",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onCarregar(cenario)}
              style={{ ...botaoCarregarEstilo, flex: 1 }}
              aria-label={`Carregar cenário: ${cenario.titulo}`}
              title="Substitui o diagrama atual por este cenário"
            >
              Carregar na mesa de projeto
            </button>
            <button
              onClick={() => adicionar(cenario)}
              style={{ ...botaoAdicionarEstilo, flex: 1 }}
              aria-label={`Adicionar cenário à mesa de projeto: ${cenario.titulo}`}
              title="Injeta os nós deste cenário no diagrama atual, sem substituir"
            >
              {adicionadoId === cenario.id ? "✓ Adicionado" : "+ Adicionar à mesa de projeto"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const abaEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: "8px 8px 0 0",
  border: "none",
  borderBottom: "2px solid transparent",
  background: "none",
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const abaAtivaEstilo: React.CSSProperties = {
  ...abaEstilo,
  color: "var(--acento-gente-texto)",
  borderBottom: "2px solid var(--acento-gente)",
};

const botaoTourSecundarioEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--acento-gente-texto)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoTourEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const botaoFecharEstilo: React.CSSProperties = {
  fontSize: 20,
  lineHeight: 1,
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid var(--borda)",
  background: "var(--painel)",
  color: "var(--texto-fraco)",
  cursor: "pointer",
};

const botaoCarregarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
};

const botaoAdicionarEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid rgba(99, 102, 241, 0.45)",
  background: "var(--painel)",
  color: "var(--acento-gente-texto)",
  cursor: "pointer",
};

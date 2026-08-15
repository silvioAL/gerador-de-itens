interface Etapa {
  numero: number;
  cor: string;
  titulo: string;
  texto: string;
}

const ETAPAS: Etapa[] = [
  {
    numero: 1,
    cor: "#3b82f6",
    titulo: "Diagrama",
    texto:
      "Desenhe a arquitetura na mesa de projeto com nós tipados (serviço, fila, banco, processo, regra...) conectados por arestas com regras próprias. Todo campo carrega sua proveniência — manual, extraído, inferido ou sugerido — nunca um valor solto sem se saber de onde veio.",
  },
  {
    numero: 2,
    cor: "#f59e0b",
    titulo: "Prontidão",
    texto:
      "O motor mede o desenho a cada mudança, e não só se os campos estão cheios: se cada necessidade declarada tem um componente que responda por ela, se o desenho respeita os padrões do time, se algum caminho inteiro estoura a régua, e se as decisões tomadas têm o porquê registrado. Cada nó tem um semáforo — vermelho bloqueia a derivação, amarelo avisa e não trava. Um campo pode virar N/A, mas só com motivo explícito: nada some em silêncio.",
  },
  {
    numero: 3,
    cor: "#6366f1",
    titulo: "Derivar",
    texto:
      "O motor transforma o desenho em itens de trabalho reais, e não sai só um tipo: um item por componente, um por conexão, um para cada padrão do time que o desenho contraria, e um para cada caminho que estoura a régua acordada. As dependências entre eles vêm das arestas — calculadas, não digitadas. O mesmo desenho sempre produz os mesmos itens, e a chave de cada um é estável: rederivar depois de mudar uma coisa não perde o que você já escreveu.",
  },
  {
    numero: 4,
    cor: "#ef4444",
    titulo: "Revisão",
    texto:
      "Antes de qualquer coisa virar item de trabalho, ciclos de dependência e conflitos são detectados e mostrados explicitamente — nunca escondidos ou \"resolvidos\" silenciosamente por trás das cenas.",
  },
  {
    numero: 5,
    cor: "#15803d",
    titulo: "Especificação de solução",
    texto:
      "Revisão e especificação são uma coisa só: selecione cada item pra ver a ficha técnica completa em abas (especificação, contrato, refinamento, testes), com a esteira de agentes de IA preenchendo os requisitos pendentes — e o refinar conversando no bubble do canto. Quando estiver pronta, um clique gera um único markdown com tudo, pronto pra ser o input de outro agente (ex.: o que sobe os itens pro sistema de tracking do time).",
  },
];

/**
 * §255 — O MOTOR, explicado antes das etapas.
 *
 * Pedido do usuário: *"sinto falta de uma explicação melhor sobre o que é o
 * motor, como ele funciona do ponto de vista do usuário, como ele se conecta
 * com o resto"*.
 *
 * O texto anterior dizia "um motor determinístico — não um LLM" e seguia em
 * frente. Isso diz o que ele NÃO é. Quem chega precisa do contrário: o que ele
 * é, o que ele decide, e onde a IA entra — porque a divisão entre os dois é a
 * tese do produto inteiro, e ela não estava escrita em lugar nenhum que uma
 * pessoa leia.
 */
function OMotor() {
  return (
    <section
      data-testid="explicacao-do-motor"
      style={{
        border: "1px solid var(--borda)",
        borderLeft: "3px solid #6366f1",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 22,
        maxWidth: 680,
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--texto)" }}>
        Antes das etapas: o que é o motor
      </h3>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "8px 0 0" }}>
        O motor é a parte que <strong>calcula</strong>. Ele lê duas coisas — o seu desenho e a configuração do time
        (tipos de componente, padrões, réguas, modelos de documento) — e faz três: <strong>mede</strong> o desenho a
        cada mudança, <strong>deriva</strong> os itens de trabalho, e <strong>monta</strong> os textos a partir dos
        modelos. Não conversa com IA, não vai à rede, não guarda estado.
      </p>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "10px 0 0" }}>
        <strong>A divisão de trabalho é toda a ideia:</strong> o motor decide a <em>estrutura</em> — que itens existem,
        o que falta preencher, o que sai do padrão, em que ordem as coisas dependem umas das outras. A IA escreve o{" "}
        <em>texto</em> — a história do usuário, os critérios, o porquê de uma proposta. Nunca o contrário. Por isso todo
        valor carrega de onde veio, e nada que a IA propõe conta antes de você confirmar.
      </p>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "10px 0 0" }}>
        <strong>O que isso te dá na prática:</strong> o mesmo desenho produz sempre os mesmos itens, então dá para
        mudar uma coisa e comparar o antes e o depois. Quando o motor aponta algo, existe uma regra explícita por trás
        — e você pode discordar dela, mudá-la na configuração, ou registrar que decidiu contrariá-la de propósito. Uma
        medida que ninguém consegue contestar vira ruído ou dogma; esta você contesta.
      </p>
    </section>
  );
}

/**
 * Explicação de "como funciona" — usada tanto na aba "A jornada" da
 * JourneyModal (onboarding pós-login) quanto na landing page pública
 * (SPEC-11 §3, antes do login). Um componente só, pra não dessincronizar
 * duas explicações da mesma coisa.
 */
export function Jornada() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <OMotor />
      {ETAPAS.map((etapa, i) => (
        <div key={etapa.numero} style={{ display: "flex", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: etapa.cor,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {etapa.numero}
            </div>
            {i < ETAPAS.length - 1 && <div style={{ width: 2, flex: 1, background: "var(--borda)", minHeight: 24 }} />}
          </div>
          <div style={{ paddingBottom: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--texto)" }}>{etapa.titulo}</div>
            <div style={{ fontSize: 13, color: "var(--texto-2)", marginTop: 4, lineHeight: 1.5, maxWidth: 640 }}>
              {etapa.texto}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

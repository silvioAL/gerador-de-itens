interface Etapa {
  numero: number;
  cor: string;
  titulo: string;
  texto: string;
  saida?: { rotulo: string; paraQue: string }[];
}

const ETAPAS: Etapa[] = [
  {
    numero: 1,
    cor: "#3b82f6",
    titulo: "Diagrama",
    texto:
      "Desenhe a arquitetura no canvas com nós tipados (serviço, fila, banco, processo, regra...) conectados por arestas com regras próprias. Todo campo carrega sua proveniência — manual, extraído, inferido ou sugerido — nunca um valor solto sem se saber de onde veio.",
  },
  {
    numero: 2,
    cor: "#f59e0b",
    titulo: "Prontidão",
    texto:
      "Cada nó tem um semáforo: vermelho bloqueia a derivação, amarelo avisa mas não trava. Um campo pode virar N/A, mas só com motivo explícito — nada some em silêncio.",
  },
  {
    numero: 3,
    cor: "#6366f1",
    titulo: "Derivar",
    texto:
      "Um motor determinístico — não um LLM — transforma o diagrama em atividades reais. O mesmo diagrama sempre produz o mesmo backlog. Dependências entre atividades são calculadas automaticamente a partir das arestas, não digitadas à mão.",
  },
  {
    numero: 4,
    cor: "#ef4444",
    titulo: "Revisão",
    texto:
      "Antes de qualquer coisa virar backlog, ciclos de dependência e conflitos são detectados e mostrados explicitamente — nunca escondidos ou \"resolvidos\" silenciosamente por trás das cenas.",
  },
  {
    numero: 5,
    cor: "#15803d",
    titulo: "Saídas",
    texto: "A revisão vira artefato de verdade, cada formato para um uso diferente:",
    saida: [
      { rotulo: ".md", paraQue: "backlog pronto para colar num documento de planejamento ou abrir tickets manualmente." },
      { rotulo: "Especificação de entrega", paraQue: "documento único da quebra inteira — contexto, cada item com spec técnica completa, refinamento, critérios de aceite em Gherkin, DoR/DoD." },
      { rotulo: "Obsidian", paraQue: "gerador export-vault materializa referências e padrões default como notas, ao lado do grafo que o Graphify já extrai — abre direto no Obsidian, sem visualizador próprio." },
    ],
  },
];

/**
 * Explicação de "como funciona" — usada tanto na aba "A jornada" da
 * JourneyModal (onboarding pós-login) quanto na landing page pública
 * (SPEC-11 §3, antes do login). Um componente só, pra não dessincronizar
 * duas explicações da mesma coisa.
 */
export function Jornada() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
            {i < ETAPAS.length - 1 && <div style={{ width: 2, flex: 1, background: "#e2e8f0", minHeight: 24 }} />}
          </div>
          <div style={{ paddingBottom: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{etapa.titulo}</div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 1.5, maxWidth: 640 }}>
              {etapa.texto}
            </div>
            {etapa.saida && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {etapa.saida.map((s) => (
                  <div key={s.rotulo} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "#dcfce7",
                        color: "#15803d",
                        flexShrink: 0,
                      }}
                    >
                      {s.rotulo}
                    </span>
                    <span style={{ fontSize: 12.5, color: "#475569" }}>{s.paraQue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    cor: "var(--acento-indigo)",
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

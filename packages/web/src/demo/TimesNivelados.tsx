/**
 * SPEC-94 §6.1 (§343) — **o ganho que a página deixava passar.**
 *
 * O usuário: *"as páginas iniciais que explicam os conceitos deixam passar que o
 * sistema também entrega valor ao padronizar as quebras. Se diversos times
 * usarem o sistema, ficam nivelados nesse sentido, o que é um ganho de
 * governança."*
 *
 * Conferido: as sete linhas da tabela *"Os ganhos, e o mecanismo de cada um"* do
 * `CONCEITO.md` falavam todas do **time consigo mesmo**. Nenhuma falava de um
 * time em relação a outro — e o site herdou o buraco, porque ele desenha o que a
 * fonte canônica diz. A linha entrou lá; esta peça é ela desenhada.
 *
 * ## Por que o mecanismo importa mais que o ganho
 *
 * *"Times padronizados"* é o que toda ferramenta de governança promete, e quase
 * sempre significa **um guia que as pessoas deveriam seguir**. Aqui é outra
 * coisa, e a diferença é o argumento inteiro:
 *
 * > **o padrão é o que produz o artefato.**
 *
 * O catálogo de stacks é da organização e não tem ponteiro de time (SPEC-43); o
 * modelo do item é configuração (SPEC-47); a derivação é determinística. A
 * consistência não depende de adesão, treinamento nem lembrança.
 *
 * ## E a válvula entra na MESMA peça, não num rodapé
 *
 * Padronizar o que deve variar é o defeito clássico da governança corporativa —
 * é o que faz um time construir um caminho paralelo para dar conta do trabalho.
 * Mostrar o nivelamento sem a saída seria vender exatamente esse defeito.
 *
 * Por isso a terceira coluna existe: **discordar é registrar a exceção com
 * motivo e autor, ou mudar a regra pelo ciclo.** Nunca burlar em silêncio.
 */
export function TimesNivelados() {
  return (
    <section data-testid="times-nivelados" style={{ maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--texto)", margin: "0 0 8px", lineHeight: 1.3 }}>
        Vários times, o mesmo jeito de entregar
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--texto-2)", lineHeight: 1.6, margin: "0 0 14px" }}>
        Quando mais de um time trabalha dentro da mesma camada, as quebras saem <strong>niveladas</strong> — mesmos
        campos obrigatórios, mesmos checklists por contexto, mesma estrutura de item. E isso não depende de ninguém
        lembrar do guia: <strong>o padrão é o que produz o artefato</strong>.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        <Passo
          rotulo="A configuração é da empresa"
          texto="O catálogo de tecnologias por componente é da organização, não do time. Quem desenha um serviço herda o mesmo padrão, em qualquer time."
        />
        <Passo
          rotulo="A derivação é determinística"
          texto="O mesmo desenho produz sempre os mesmos itens. Dois times com desenhos equivalentes chegam à mesma estrutura sem combinar nada entre si."
        />
        <Passo
          rotulo="E discordar continua possível"
          texto="Quem precisa sair do padrão registra a exceção com motivo e autor, ou pede a mudança da regra pelo ciclo. Uniformidade sem essa saída não é governança — é rigidez com relatório."
          /* A válvula fica na mesma peça, e com o mesmo peso visual: separá-la
             faria a página vender o defeito e esconder a correção. */
          ressalva
        />
      </div>
    </section>
  );
}

function Passo({ rotulo, texto, ressalva }: { rotulo: string; texto: string; ressalva?: boolean }) {
  return (
    <div
      style={{
        border: "1px solid var(--borda)",
        borderLeft: `3px solid ${ressalva ? "var(--acento-gente)" : "var(--verde)"}`,
        borderRadius: 10,
        padding: "11px 13px",
      }}
    >
      <strong style={{ fontSize: 13.5, color: "var(--texto)" }}>{rotulo}</strong>
      <p style={{ fontSize: 13, color: "var(--texto-2)", lineHeight: 1.55, margin: "3px 0 0" }}>{texto}</p>
    </div>
  );
}

import type { Atividade, CoberturaDaSpec, SpecEscrita } from "@gerador/engine";
import { SecaoEscrita } from "../documento/DocumentoScreen";

/**
 * SPEC-84 fatia A — **a porta da spec.**
 *
 * ## Por que esta tela existe
 *
 * A SPEC-80 entregou o motor inteiro — `gerarSpec`, `coberturaDaSpec`, o
 * template, a trava do que a IA não pode escrever — e nenhuma das suas quatro
 * fatias era a tela. O resultado foi medido no §0 da SPEC-84: **zero
 * consumidores** fora dos próprios testes. Motor ligado sem nada acoplado ao
 * eixo, e o estágio do ciclo vermelho com razão.
 *
 * ## O que ela NÃO tem, de propósito
 *
 * **Nenhum botão de "✦ escrever para mim".** As três seções de julgamento —
 * origem, recusas, fatias — são exatamente o que a SPEC-80 §2 declara indelegável,
 * e a fatia D daquela SPEC é um teste que falha se elas virarem preenchíveis por
 * resposta de modelo. Uma tela que oferecesse o atalho desmontaria a trava por
 * conveniência, e o produto passaria a produzir o artefato que ele recusa.
 *
 * A spec vazia **não parece pronta**: cada seção de julgamento em branco vira
 * lacuna contável no markdown (`MARCADOR_ESPECIFICAR`), e o número aparece aqui
 * em cima. É a régua do §311 aplicada ao segundo artefato.
 */
export interface SpecScreenProps {
  titulo: string;
  /** O markdown já montado por `gerarSpec` — o MESMO que o download entrega. */
  markdown: string;
  /** O que a pessoa escreveu. As seções de julgamento saem daqui ou não saem. */
  escrita: SpecEscrita;
  onMudarEscrita: (escrita: SpecEscrita) => void;
  /** As três listas que `coberturaDaSpec` devolve, já calculadas no engine. */
  cobertura: CoberturaDaSpec;
  /** Marcar (ou desmarcar) um item como coberto por esta spec. */
  onAlternarItem: (chave: string) => void;
  /** Quantas lacunas o markdown carrega — contadas, não estimadas. */
  lacunas: number;
  onBaixarMarkdown: () => void;
  onVoltar: () => void;
}

const DICA_DA_SECAO: Record<"origem" | "recusas" | "fatias", { titulo: string; dica: string; porque: string }> = {
  origem: {
    titulo: "De onde veio",
    dica: "quem pediu, e com que palavras",
    porque: "As palavras de quem pediu são a única referência que sobrevive à discussão. Parafrasear já é interpretar.",
  },
  recusas: {
    titulo: "O que NÃO entra",
    dica: "o que fica de fora, e por quê",
    porque: "É a seção que impede a spec de crescer sozinha — e a que nenhum modelo pode escrever, porque recusar é decidir.",
  },
  fatias: {
    titulo: "As fatias, e como se prova cada uma",
    dica: "o que fica verdade em cada fatia, e como se prova",
    porque: "Fatia sem prova é intenção. A prova é o que distingue \"implementado\" de \"dado por feito\".",
  },
};

export function SpecScreen({
  titulo,
  markdown,
  escrita,
  onMudarEscrita,
  cobertura,
  onAlternarItem,
  lacunas,
  onBaixarMarkdown,
  onVoltar,
}: SpecScreenProps) {
  return (
    <div data-testid="spec-screen" style={fundoEstilo}>
      <header style={barraEstilo}>
        <button onClick={onVoltar} style={linkEstilo}>
          ← Voltar à mesa de projeto
        </button>
        <div style={{ flex: 1 }} />
        {/**
         * A conta de lacunas fica no cabeçalho e não no rodapé: quem vai baixar a
         * spec para dar a um agente precisa ver o número ANTES do clique. É a
         * mesma escolha do §313, do lado do documento.
         */}
        <span data-testid="lacunas-da-spec" style={{ fontSize: 11.5, color: lacunas > 0 ? "var(--amarelo, #eab308)" : "var(--texto-fraco)" }}>
          {lacunas === 0 ? "nenhuma lacuna" : `✍️ ${lacunas} a especificar`}
        </span>
        <button onClick={onBaixarMarkdown} style={botaoEstilo} data-testid="baixar-spec">
          ⬇ Markdown
        </button>
      </header>

      <article style={folhaEstilo}>
        <div style={colunaEstilo}>
          <h1 style={{ fontSize: 28, lineHeight: 1.25, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{titulo}</h1>
          <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", margin: "0 0 4px", lineHeight: 1.6 }}>
            A spec é o que um agente de código consome direto. O contexto e a medição vêm do desenho; as três
            seções abaixo são de quem decide, e não há botão que as escreva por você.
          </p>
        </div>

        {(["origem", "recusas", "fatias"] as const).map((chave) => (
          <div key={chave}>
            <SecaoEscrita
              titulo={DICA_DA_SECAO[chave].titulo}
              dica={DICA_DA_SECAO[chave].dica}
              valor={escrita[chave] ?? ""}
              testid={`secao-${chave}`}
              onMudar={(texto) => onMudarEscrita({ ...escrita, [chave]: texto })}
            />
            {/* O porquê fica ao lado da seção, não num tour: quem abre a tela pela
                primeira vez precisa saber por que ESTA pergunta está sendo feita. */}
            <p style={{ ...colunaEstilo, fontSize: 11.5, color: "var(--texto-fraco)", margin: "-6px auto 0", lineHeight: 1.6 }}>
              {DICA_DA_SECAO[chave].porque}
            </p>
          </div>
        ))}

        <section data-testid="cobertura-da-spec" style={colunaEstilo}>
          <h2 style={tituloSecaoEstilo}>Itens que esta spec cobre</h2>

          {cobertura.cobertas.length === 0 && cobertura.descobertas.length === 0 && (
            <p style={textoFracoEstilo}>Esta demanda ainda não derivou itens.</p>
          )}

          {[...cobertura.cobertas, ...cobertura.descobertas].map((item) => (
            <LinhaDeItem
              key={item.chave}
              item={item}
              coberto={cobertura.cobertas.some((c) => c.chave === item.chave)}
              onAlternar={() => onAlternarItem(item.chave)}
            />
          ))}

          {/**
           * A órfã é a única das três que ninguém pensa em olhar, e a que
           * envelhece pior: a spec continua parecendo completa enquanto aponta
           * para item que não existe mais no desenho.
           */}
          {cobertura.orfas.length > 0 && (
            <div data-testid="itens-orfaos" style={{ marginTop: 14 }}>
              <div style={legendaEstilo}>declarados aqui e que não existem mais no desenho</div>
              {cobertura.orfas.map((chave) => (
                <div key={chave} style={{ ...linhaEstilo, color: "var(--vermelho)" }}>
                  <span style={{ textDecoration: "line-through" }}>{chave}</span>
                  <button onClick={() => onAlternarItem(chave)} style={linkEstilo} data-testid={`soltar-${chave}`}>
                    tirar da spec
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section data-testid="spec-markdown" style={colunaEstilo}>
          <h2 style={tituloSecaoEstilo}>O que sai daqui</h2>
          <p style={textoFracoEstilo}>
            É exatamente o arquivo que o botão acima baixa — nada é montado duas vezes.
          </p>
          <pre style={preEstilo}>{markdown}</pre>
        </section>
      </article>
    </div>
  );
}

function LinhaDeItem({ item, coberto, onAlternar }: { item: Atividade; coberto: boolean; onAlternar: () => void }) {
  return (
    <label style={linhaEstilo} data-testid={`item-${item.chave}`}>
      <input type="checkbox" checked={coberto} onChange={onAlternar} aria-label={item.rotulo} />
      <span style={{ color: coberto ? "var(--texto)" : "var(--texto-fraco)" }}>{item.rotulo}</span>
    </label>
  );
}

const fundoEstilo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--fundo)",
  overflowY: "auto",
  zIndex: 40,
};

const barraEstilo: React.CSSProperties = {
  position: "sticky",
  top: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  background: "var(--painel)",
  borderBottom: "1px solid var(--borda)",
  zIndex: 1,
};

const folhaEstilo: React.CSSProperties = { padding: "28px 16px 80px" };

const colunaEstilo: React.CSSProperties = { maxWidth: 720, margin: "0 auto 22px" };

const tituloSecaoEstilo: React.CSSProperties = {
  fontSize: 15,
  margin: "0 0 8px",
  color: "var(--texto)",
  letterSpacing: "-0.01em",
};

const textoFracoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-fraco)",
  lineHeight: 1.6,
  margin: "0 0 8px",
};

const legendaEstilo: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--texto-fraco)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  margin: "0 0 4px",
};

const linhaEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12.5,
  padding: "5px 0",
  cursor: "pointer",
};

const linkEstilo: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--acento)",
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid var(--borda)",
  background: "var(--painel-2, transparent)",
  color: "var(--texto-2)",
  cursor: "pointer",
};

const preEstilo: React.CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "var(--painel)",
  border: "1px solid var(--borda)",
  borderRadius: 8,
  padding: 14,
  color: "var(--texto-2)",
  maxHeight: 420,
  overflowY: "auto",
};

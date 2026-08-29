import { useState } from "react";
import { decisoesNaProposta, type CampoProposto, type PropostaDeArquitetura } from "@gerador/aplicacao";

/**
 * SPEC-81 fatia F — **a proposta da casa, campo a campo.**
 *
 * ## Por que aceitar é por campo, e não um botão só
 *
 * Um "aceitar tudo" transformaria a importação num `overwrite` com passo extra:
 * a pessoa clicaria sem ler, e o texto que alguém desta casa escreveu sumiria
 * sem ninguém notar. **A decisão que importa é a de cada campo que diverge**, e
 * ela precisa custar um olhar.
 *
 * ## Por que `diverge` mostra os dois lados
 *
 * É a única situação em que existe algo a perder. `novo` é ganho puro (estava
 * vazio), `igual` não aparece — e sobra o caso em que os dois têm texto e são
 * diferentes, que é onde a régua do §306 vale: **declarado vence herdado, e a
 * tela diz qual é qual.**
 */
export interface PropostaDeArquiteturaProps {
  proposta: PropostaDeArquitetura;
  /** De onde ela veio, para a tela dizer em quem confiar (ou não). */
  origem: string;
  /** Aceitar um campo — escreve pelo caminho normal, com a auditoria de sempre. */
  onAceitarCampo: (campo: CampoProposto) => void;
  /** Aceitar um termo novo do glossário. */
  onAceitarTermo: (termo: { termo: string; definicao: string }) => void;
  onFechar: () => void;
}

const ROTULO: Record<string, string> = {
  objetivo: "Objetivo",
  quemUsa: "Quem usa",
  regrasDeNegocio: "Regras de negócio",
  sistemas: "Sistemas",
  restricoes: "Restrições",
};

export function PainelDeProposta({
  proposta,
  origem,
  onAceitarCampo,
  onAceitarTermo,
  onFechar,
}: PropostaDeArquiteturaProps) {
  const [aceitos, setAceitos] = useState<Set<string>>(new Set());
  const decidir = (chave: string, acao: () => void) => {
    acao();
    setAceitos((a) => new Set(a).add(chave));
  };

  const pendentes = decisoesNaProposta(proposta) - aceitos.size;
  const aDecidir = proposta.campos.filter((c) => c.situacao !== "igual");

  return (
    <section data-testid="proposta-de-arquitetura" style={caixaEstilo}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5, color: "var(--texto)" }}>O que veio de {origem}</strong>
        <span style={{ fontSize: 11.5, color: "var(--texto-fraco)" }}>
          {pendentes === 0 ? "nada mais a decidir" : `${pendentes} a decidir`}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onFechar} style={botaoFracoEstilo} data-testid="fechar-proposta">
          fechar
        </button>
      </div>

      {aDecidir.length === 0 && proposta.termosNovos.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--texto-fraco)", margin: "8px 0 0" }}>
          {/* Estado legítimo e comum: a casa tem a informação e ela já bate com
              a daqui. Dizer isso é melhor que uma lista vazia sem explicação. */}
          Nada a trazer — o que está lá já bate com o que está aqui.
        </p>
      )}

      {aDecidir.map((campo) => {
        const jaAceito = aceitos.has(campo.campo);
        return (
          <div key={campo.campo} data-testid={`campo-${campo.campo}`} style={linhaEstilo}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <strong style={{ fontSize: 12.5, color: "var(--texto)" }}>{ROTULO[campo.campo] ?? campo.campo}</strong>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: campo.situacao === "diverge" ? "var(--amarelo, #eab308)" : "var(--verde, #3ecf8e)",
                }}
              >
                {campo.situacao === "diverge" ? "diverge do que está aqui" : "está vazio aqui"}
              </span>
            </div>

            {/* Só quem diverge mostra o lado de cá: em `novo` não há o que
                comparar, e repetir "(vazio)" seria ruído. */}
            {campo.situacao === "diverge" && (
              <div style={{ marginTop: 6 }}>
                <div style={legendaEstilo}>aqui</div>
                <div style={{ ...textoEstilo, borderLeft: "2px solid #4f46e5" }}>{campo.atual}</div>
              </div>
            )}

            <div style={{ marginTop: 6 }}>
              <div style={legendaEstilo}>lá</div>
              <div style={textoEstilo}>{campo.proposto}</div>
            </div>

            <button
              onClick={() => decidir(campo.campo, () => onAceitarCampo(campo))}
              disabled={jaAceito}
              data-testid={`aceitar-${campo.campo}`}
              style={{ ...botaoEstilo, marginTop: 8 }}
            >
              {jaAceito ? "aceito" : campo.situacao === "diverge" ? "substituir pelo de lá" : "trazer"}
            </button>
          </div>
        );
      })}

      {proposta.termosNovos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={legendaEstilo}>termos que a casa tem e este produto não</div>
          {proposta.termosNovos.map((t) => {
            const chave = `termo:${t.termo}`;
            const jaAceito = aceitos.has(chave);
            return (
              <div key={t.termo} data-testid={`termo-${t.termo}`} style={linhaEstilo}>
                <strong style={{ fontSize: 12.5, color: "var(--texto)" }}>{t.termo}</strong>
                <div style={{ ...textoEstilo, marginTop: 4 }}>{t.definicao}</div>
                <button
                  onClick={() => decidir(chave, () => onAceitarTermo(t))}
                  disabled={jaAceito}
                  data-testid={`aceitar-termo-${t.termo}`}
                  style={{ ...botaoEstilo, marginTop: 8 }}
                >
                  {jaAceito ? "aceito" : "trazer"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const caixaEstilo: React.CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 10,
  padding: "12px 14px",
  marginTop: 12,
};

const linhaEstilo: React.CSSProperties = {
  borderTop: "1px solid var(--borda)",
  paddingTop: 10,
  marginTop: 10,
};

const legendaEstilo: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--texto-fraco)",
  textTransform: "uppercase",
};

const textoEstilo: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--texto-2)",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  paddingLeft: 8,
  marginTop: 2,
};

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const botaoFracoEstilo: React.CSSProperties = {
  ...botaoEstilo,
  background: "transparent",
  color: "var(--texto-2)",
  border: "1px solid var(--borda)",
};

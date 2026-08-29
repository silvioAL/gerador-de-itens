import { CicloDoProduto } from "./CicloDoProduto";
import { AEvolucao, AsCamadas, OMapaDeConexoes } from "./PecasDoConceito";
import { OMotor } from "./OMotor";
import { OPassoContido } from "./OPassoContido";

export interface LandingPageProps {
  onEntrar: () => void;
}

/**
 * Página pública, antes do login (SPEC-11) — contexto pra quem chega sem saber o
 * que a ferramenta é, em vez de cair direto num formulário de credencial.
 *
 * ## SPEC-83 — o que esta rodada mudou, e por quê
 *
 * ### A poda (fatia B)
 *
 * A página renderizava `<Jornada />` logo abaixo do círculo, e **4 das 5 etapas
 * dela eram estágios que o círculo acabava de mostrar** — `desenho`,
 * `prontidao`, `itens` e `especificacao`, ditos de novo em outro formato. O
 * `OMotor()` recontava a divisão motor × IA pela terceira vez na mesma rolagem.
 *
 * Não era excesso de conteúdo: era **uma narrativa contada três vezes**. O §263
 * chegando pelo lado que ninguém vigiava, porque cada versão estava certa
 * isoladamente.
 *
 * A `Jornada` não morreu — ela é um passo a passo de USO, e continua na aba "A
 * jornada" pós-login, que é onde está quem já entrou e quer saber por onde
 * começar. O `OMotor` saiu de dentro dela para ter uma casa só.
 *
 * ### A ordem (fatia D)
 *
 * **O problema vem antes da solução.** A página começava dizendo o que a
 * ferramenta faz, para quem ainda não sabia por que precisaria dela. Agora:
 *
 * 1. a promessa — e ela mudou (ver abaixo);
 * 2. **o problema**: você já tem IA, falta onde a regra mora;
 * 3. as quatro camadas, e a IA no meio;
 * 4. o motor — o que calcula e o que não calcula;
 * 5. o ciclo, que é o mapa;
 * 6. as conexões com o que a casa já tem, **marcadas**;
 * 7. o convite.
 *
 * ### A manchete
 *
 * Era *"Do diagrama ao backlog, sem inventar nada"* — uma promessa com
 * **destino**. É o mesmo defeito que o §314 encontrou no corpo da página
 * (*"descrevia um fluxo, não um ciclo que fecha"*) **sobrevivendo no título**: a
 * SPEC-76 consertou o conteúdo e não olhou para a manchete.
 *
 * A nova fala de **permanência**, não de trajeto — foi decisão do usuário:
 * *"não é até o backlog, é esse conceito que acompanha processos"*.
 */
export function LandingPage({ onEntrar }: LandingPageProps) {
  return (
    <div style={containerEstilo}>
      <header style={headerEstilo}>
        <strong style={{ fontSize: 16, color: "var(--texto)" }}>Gerador de Itens</strong>
        <div style={{ flex: 1 }} />
        <button onClick={onEntrar} style={botaoEntrarEstilo}>
          Entrar
        </button>
      </header>

      <section style={{ ...faixaEstilo, paddingTop: 56, paddingBottom: 40 }}>
        <div style={colunaEstilo}>
          <h1 style={{ fontSize: 30, lineHeight: 1.2, color: "var(--texto)", margin: "0 0 10px", maxWidth: 640 }}>
            A camada que faz o padrão da casa sobreviver às demandas — e a IA trabalhar dentro dele
          </h1>
          <p style={{ fontSize: 15, color: "var(--texto-2)", lineHeight: 1.6, maxWidth: 620, margin: 0 }}>
            Configuração, padrões e specs viram <strong>dado medível</strong>, versionado e evoluído pelo time. O motor
            calcula; a IA escreve; nada vira “pronto” sem alguém confirmar.
          </p>
          <button onClick={onEntrar} style={{ ...botaoEntrarEstilo, marginTop: 22, padding: "10px 20px", fontSize: 14 }}>
            Entrar
          </button>
        </div>
      </section>

      {/* Faixa com fundo próprio: é o problema, e ele precisa de peso visual
          diferente do resto. O §0.3 mediu que a página inteira era UMA coluna de
          760px — estrutura de documento, não de página. */}
      <section style={{ ...faixaEstilo, background: "var(--painel-alto, transparent)", borderTop: "1px solid var(--borda)", borderBottom: "1px solid var(--borda)" }}>
        <div style={colunaEstilo}>
          <AEvolucao />
        </div>
      </section>

      <section style={faixaEstilo}>
        <div style={colunaEstilo}>
          <AsCamadas />
        </div>
      </section>

      {/**
       * SPEC-85 fatia C — a peça com movimento entra AQUI, entre o motor e o
       * ciclo, e o lugar é argumento.
       *
       * O `OMotor` acabou de dizer, em prosa, o que o motor calcula e o que a IA
       * escreve. A pergunta que sobra é *"e o que impede a IA de aplicar?"* — e a
       * resposta é uma ausência de comportamento, que é o que esta peça mostra em
       * vez de afirmar. Depois dela vem o ciclo, onde essa contenção se repete
       * treze vezes.
       */}
      <section style={{ ...faixaEstilo, background: "var(--painel-alto, transparent)", borderTop: "1px solid var(--borda)", borderBottom: "1px solid var(--borda)" }}>
        <div style={colunaEstilo}>
          <OMotor />
        </div>
      </section>

      <section style={{ ...faixaEstilo, paddingTop: 34, paddingBottom: 34 }}>
        <div style={colunaEstilo}>
          <OPassoContido />
        </div>
      </section>

      <section style={faixaEstilo}>
        {/**
         * SPEC-85 §0.1 — **o `h2` daqui morreu.**
         *
         * A página dizia "O ciclo, e o que dele já existe" e o componente, três
         * linhas de rolagem abaixo, dizia "O ciclo, e onde a IA entra". Dois
         * títulos sobre a mesma coisa, empilhados — o §263 pelo lado que ninguém
         * vigiava: cada um estava certo isoladamente, e a landing não sabia que
         * o componente traz o seu.
         *
         * Quem fica é o do componente, e não é escolha de gosto: ele acompanha a
         * peça para onde ela for, e é o mais específico dos dois.
         */}
        <div style={{ ...colunaEstilo, maxWidth: 760 }}>
          <CicloDoProduto />
        </div>
      </section>

      <section style={{ ...faixaEstilo, background: "var(--painel-alto, transparent)", borderTop: "1px solid var(--borda)" }}>
        <div style={colunaEstilo}>
          <OMapaDeConexoes />
        </div>
      </section>

      <section style={{ ...faixaEstilo, textAlign: "center", paddingBottom: 64 }}>
        <p style={{ fontSize: 14, color: "var(--texto-2)", margin: "0 0 14px" }}>
          Comece pelo que é seu: o contexto do produto e as regras do time.
        </p>
        <button onClick={onEntrar} style={{ ...botaoEntrarEstilo, padding: "10px 20px", fontSize: 14 }}>
          Entrar pra começar
        </button>
      </section>
    </div>
  );
}

const containerEstilo: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--painel)",
  fontFamily: "system-ui, sans-serif",
};

const headerEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "14px 24px",
  borderBottom: "1px solid var(--borda)",
  background: "var(--painel)",
};

/** SPEC-83 §5 — o RITMO. Faixas de largura total com fundos alternados; a coluna
 * é uma delas, e não a página inteira. */
const faixaEstilo: React.CSSProperties = { padding: "40px 24px" };

const colunaEstilo: React.CSSProperties = { maxWidth: 700, margin: "0 auto" };

const botaoEntrarEstilo: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 16px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

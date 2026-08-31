import { CicloDoProduto } from "./CicloDoProduto";
import { SeletorDeTema } from "../tema/SeletorDeTema";
import { AEvolucao, AsCamadas, OMapaDeConexoes } from "./PecasDoConceito";
import { OMotor } from "./OMotor";
import { OPassoContido } from "./OPassoContido";
import { OFluxoDoProcesso } from "./OFluxoDoProcesso";
import { ATOS } from "./atos";
import { MolduraDoAto } from "./MolduraDoAto";
import { NavegacaoDosAtos } from "./NavegacaoDosAtos";
import { SEGUNDOS_DO_CAMINHO, useCaminhoCurto } from "./useCaminhoCurto";
import { useAncoraInicial } from "./useAncoraInicial";

export interface LandingPageProps {
  onEntrar: () => void;
}

/**
 * Página pública, antes do login (SPEC-11) — contexto pra quem chega sem saber o
 * que a ferramenta é, em vez de cair direto num formulário de credencial.
 *
 * ## SPEC-92 (§341) — a página virou apresentação, e a medição mudou o plano
 *
 * O pedido: *"transformado com uma cara mais comercial, de explicar o conceito,
 * ter partes para navegar… está ficando longa"* e *"mais semelhante a uma
 * apresentação, **mas gostei dos diagramas**"*.
 *
 * ### O que a remedição contra a stack achou, e a SPEC-92 não sabia
 *
 * A SPEC mandou cortar **2326 palavras para ~400**, supondo que a página fosse
 * prosa. Medindo o `innerText` por seção contra `:8080`:
 *
 * | Onde | Palavras |
 * |---|---|
 * | Fora das peças — a prosa que a landing escreve por si | **66** |
 * | Dentro das sete peças, desenhadas de `ciclo.ts`/`conceito.ts` | 2178 |
 * | Destas, em **desdobramentos fechados de 12 px** | **921** |
 *
 * Duas conclusões, e as duas contrariam a fatia A:
 *
 * 1. **Não havia prosa para cortar.** 97% do texto sai do dado; podar até 400
 *    exigiria apagar `ciclo.ts`, que é a régua da SPEC-76 ao contrário.
 * 2. **41% do que a métrica contava, ninguém lê.** O `innerText` enxerga os treze
 *    desdobramentos do ciclo, que ficam montados de propósito (SPEC-91 fatia C)
 *    com 12 px de altura. A leitura real são ~1323 palavras, não 2326 — e a
 *    conclusão *"é um artigo de 9 minutos"* foi construída sobre a medida
 *    inflada.
 *
 * O problema real não era prosa: era **tudo aberto ao mesmo tempo, sem ordem
 * declarada e sem saída**. Sete peças empilhadas, 4693 px, e `a[href^="#"]` = 0.
 *
 * ### O que esta rodada fez
 *
 * - **Cinco atos** (`atos.ts`), cada um com `id`, moldura e uma pergunta no
 *   lugar da prosa de abertura;
 * - **navegação de verdade** — cinco âncoras linkáveis, com marca de posição;
 * - **o caminho curto** ("ver em {@link SEGUNDOS_DO_CAMINHO} segundos"), que é a
 *   resposta de dentro ao pedido de vídeo (SPEC-92 §3.2);
 * - **o único corte de prosa que existia**: o `OMotor`, de 207 para 62 palavras,
 *   porque era a terceira cópia da *"divisão de trabalho"* do `CONCEITO.md`.
 *
 * ### O que ela NÃO fez, dito em voz alta
 *
 * - **Vídeo, nenhum.** A pergunta da SPEC-82 §6.2 — *"a necessidade é dentro ou
 *   fora do app?"* — continua sem resposta medida, e o caminho curto atende a de
 *   dentro sem produzir artefato que envelheça em separado da página.
 * - **O link "ler o conceito inteiro →"** que a SPEC-92 §3 pediu. O `CONCEITO.md`
 *   não é servido pela web, e apontar para um endereço que pode dar 404 é
 *   exatamente a promessa vazia que a régua desta página proíbe.
 *
 * ## SPEC-83 — o que aquela rodada mudou, e por quê
 *
 * A página renderizava `<Jornada />` logo abaixo do círculo, e **4 das 5 etapas
 * dela eram estágios que o círculo acabava de mostrar**. Não era excesso de
 * conteúdo: era **uma narrativa contada três vezes**.
 *
 * A `Jornada` não morreu — ela é um passo a passo de USO, e continua na aba "A
 * jornada" pós-login. O `OMotor` saiu de dentro dela para ter uma casa só.
 *
 * A manchete era *"Do diagrama ao backlog, sem inventar nada"* — uma promessa
 * com **destino**. A nova fala de **permanência**, por decisão do usuário:
 * *"não é até o backlog, é esse conceito que acompanha processos"*.
 */
export function LandingPage({ onEntrar }: LandingPageProps) {
  const caminho = useCaminhoCurto();
  // Quem chega por `/#o-ciclo` precisa parar no ciclo. O browser tenta antes de
  // o React pintar, não acha nada, e desiste — ver `useAncoraInicial`.
  useAncoraInicial();

  return (
    <div style={containerEstilo}>
      {/**
       * O cabeçalho é FIXO, e passou a ter duas linhas: a identidade e os
       * controles em cima, as partes embaixo. Uma barra que rola para fora da
       * tela não é navegação — é um índice que só serve na primeira tela, que é
       * justamente a única em que a pessoa não precisa dele.
       */}
      <header className="landing-cabecalho">
        <div className="landing-cabecalho-linha">
          <strong style={{ fontSize: 16, color: "var(--texto)" }}>Gerador de Itens</strong>
          <div style={{ flex: 1 }} />
          {/* SPEC-93 — o tema também ANTES do login: quem chega pela landing pode
              preferir claro, e mandá-la entrar para poder escolher seria pedir
              uma credencial em troca de conforto de leitura. */}
          <SeletorDeTema />
          <button onClick={onEntrar} style={{ ...botaoEntrarEstilo, marginLeft: 10 }}>
            Entrar
          </button>
        </div>
        {/* Sem espaçador entre a barra e o botão: a nav cresce (`flex: 1` no
            CSS) e o botão se encosta à direita sozinho. Um `<div flex:1>` aqui
            roubava o espaço da nav — em 360 px ela ficava com 164 px de 467 e
            mostrava um item e meio. */}
        <div className="landing-cabecalho-linha landing-cabecalho-navegacao">
          <NavegacaoDosAtos aoNavegar={caminho.parar} />
          <BotaoDoCaminhoCurto caminho={caminho} />
        </div>
      </header>

      {/**
       * A CAPA. Ela não é um ato e não está no menu: quem chega já está nela, e
       * um item de menu que aponta para o topo da página é um item que nunca é
       * clicado por quem precisa de navegação.
       */}
      <section style={{ padding: "56px 24px 44px" }}>
        <div style={colunaEstilo}>
          <h1 style={{ fontSize: 34, lineHeight: 1.18, color: "var(--texto)", margin: "0 0 12px", maxWidth: 660 }}>
            A camada que faz o padrão da casa sobreviver às demandas — e a IA trabalhar dentro dele
          </h1>
          <p style={{ fontSize: 15.5, color: "var(--texto-2)", lineHeight: 1.6, maxWidth: 620, margin: 0 }}>
            Configuração, padrões e specs viram <strong>dado medível</strong>, versionado e evoluído pelo time. O motor
            calcula; a IA escreve; nada vira “pronto” sem alguém confirmar.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
            <button onClick={onEntrar} style={{ ...botaoEntrarEstilo, padding: "10px 20px", fontSize: 14 }}>
              Entrar
            </button>
            <BotaoDoCaminhoCurto caminho={caminho} grande />
          </div>
        </div>
      </section>

      {/* As peças trazem o próprio `maxWidth` e se centralizam sozinhas — o ato
          só precisa dizer até onde ele vai. */}
      <MolduraDoAto ato={ATOS[0]} destacado>
        <AEvolucao />
      </MolduraDoAto>

      {/**
       * O ato 2 é o único com três peças, e a ordem é argumento: as camadas
       * dizem **o que** a coisa contém; o motor diz **quem faz o quê** dentro
       * dela; e o passo contido mostra, com movimento, a ausência de
       * comportamento que os dois anteriores só conseguem afirmar (SPEC-85
       * fatia C). Depois dele vem o ciclo, onde essa contenção se repete treze
       * vezes.
       */}
      <MolduraDoAto ato={ATOS[1]}>
        <div style={{ display: "grid", gap: 34 }}>
          <AsCamadas />
          <OMotor />
          <OPassoContido />
        </div>
      </MolduraDoAto>

      {/**
       * SPEC-85 §0.1 — **o `h2` daqui morreu.** A página dizia "O ciclo, e o que
       * dele já existe" e o componente, três linhas abaixo, dizia "O ciclo, e
       * onde a IA entra". Quem fica é o do componente: ele acompanha a peça para
       * onde ela for, e é o mais específico dos dois. A moldura do ato traz um
       * chapéu, não um título, pelo mesmo motivo.
       */}
      <MolduraDoAto ato={ATOS[2]} destacado largura={760}>
        <CicloDoProduto />
      </MolduraDoAto>

      {/**
       * SPEC-90 — a jornada, DEPOIS do ciclo: o índice antes do percurso. E o
       * mapa de conexões junto, porque as duas peças respondem à mesma pergunta
       * do ato — por onde passa, e onde fala com fora.
       */}
      {/* 1320 é a largura do fluxo em raias, a peça mais larga da página. O mapa
          de conexões continua a 700 e se centraliza dentro dela. */}
      <MolduraDoAto ato={ATOS[3]} largura={1320}>
        <div style={{ display: "grid", gap: 40 }}>
          <OFluxoDoProcesso />
          <OMapaDeConexoes />
        </div>
      </MolduraDoAto>

      <MolduraDoAto ato={ATOS[4]} destacado>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--texto-2)", margin: "0 0 16px" }}>
            Comece pelo que é seu: o contexto do produto e as regras do time.
          </p>
          <button onClick={onEntrar} style={{ ...botaoEntrarEstilo, padding: "10px 20px", fontSize: 14 }}>
            Entrar pra começar
          </button>
        </div>
      </MolduraDoAto>
    </div>
  );
}

/**
 * SPEC-92 fatia E — o botão do caminho curto, em dois tamanhos.
 *
 * Ele aparece duas vezes de propósito: na capa, onde a pessoa decide se vai
 * investir um minuto, e no cabeçalho, onde ela precisa poder **parar** sem
 * voltar ao topo. Um percurso que só se interrompe onde começou não é
 * interrompível — é o defeito que a régua do tour (§253) existe para impedir.
 */
function BotaoDoCaminhoCurto({
  caminho,
  grande,
}: {
  caminho: ReturnType<typeof useCaminhoCurto>;
  grande?: boolean;
}) {
  const { percorrendo, parada, comecar, parar } = caminho;

  return (
    <button
      onClick={percorrendo ? parar : comecar}
      data-testid={grande ? "caminho-curto" : "caminho-curto-cabecalho"}
      style={{
        fontSize: grande ? 14 : 11.5,
        fontWeight: 600,
        padding: grande ? "10px 18px" : "5px 10px",
        borderRadius: grande ? 7 : 6,
        border: "1px solid var(--borda-forte)",
        background: "transparent",
        color: "var(--texto-2)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {/**
       * O rótulo ENCOLHE, e o que sai é sempre um pedaço das pontas.
       *
       * No cabeçalho de um telefone de 360 px, "Ver em 60 segundos" custa ~120
       * px — e a barra das cinco partes ficava com 174. Uma navegação que mostra
       * um nome e meio não é navegação; e esconder o botão no móvel seria pior,
       * porque **ele é o "Parar"** e no telefone não há tecla `Escape`.
       *
       * ## Por que prefixo e sufixo, e não dois textos alternativos
       *
       * A saída óbvia — um `<span>` largo e outro estreito com textos
       * diferentes — quebra a WCAG 2.5.3: o nome acessível precisa **conter** o
       * texto visível, e "Parar 3/5" não é pedaço de "Parar — 3 de 5". É
       * exatamente o defeito que o §340 registrou no botão "Carregar na mesa de
       * projeto", e repeti-lo aqui, sabendo, seria pior do que tê-lo achado.
       *
       * Escondendo só as pontas, o que sobra é sempre uma subcadeia do inteiro,
       * nos dois estados. E o número da parada é o que se perde no estreito —
       * a alternativa era perder a barra de navegação, que é a peça da rodada.
       */}
      {percorrendo ? (
        <>
          Parar
          <span className="so-no-largo">
            {" "}
            — {parada + 1} de {ATOS.length}
          </span>
        </>
      ) : (
        <>
          <span className="so-no-largo">Ver em </span>
          {SEGUNDOS_DO_CAMINHO} segundos
        </>
      )}
    </button>
  );
}

const containerEstilo: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--painel)",
  fontFamily: "system-ui, sans-serif",
};

const colunaEstilo: React.CSSProperties = { maxWidth: 700, margin: "0 auto" };

const botaoEntrarEstilo: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 16px",
  borderRadius: 7,
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
  color: "#fff",
  cursor: "pointer",
};

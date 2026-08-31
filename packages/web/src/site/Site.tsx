import { SeletorDeTema } from "../tema/SeletorDeTema";
import { AEvolucao, AsCamadas, OMapaDeConexoes } from "../demo/PecasDoConceito";
import { OMotor } from "../demo/OMotor";
import { OPassoContido } from "../demo/OPassoContido";
import { CicloDoProduto } from "../demo/CicloDoProduto";
import { OFluxoDoProcesso } from "../demo/OFluxoDoProcesso";
import { MarcaDoSite, MenuDoSite } from "./MenuDoSite";
import { PaginaArquitetura } from "./PaginaArquitetura";
import { PaginaCapa } from "./PaginaCapa";
import { PAGINAS, rotaDaPagina, type PaginaDoSite } from "./paginas";

/**
 * SPEC-95 (§342) — **o site público, em páginas.**
 *
 * ## O que esta rodada corrigiu da anterior
 *
 * O §341 leu *"está ficando longa"* como excesso numa página só e respondeu com
 * âncoras internas. O usuário corrigiu: ele queria **mais páginas, com menu
 * próprio**. Uma âncora rola dentro de um documento; uma página **é um destino**
 * — tem endereço próprio, não carrega o resto junto, e cresce sem tornar nenhuma
 * outra mais longa.
 *
 * A última é a que decide: com âncoras, todo conteúdo novo pioraria o problema
 * relatado.
 *
 * ## As peças não mudaram, e isso é régua
 *
 * As sete continuam exatamente como estavam — o usuário disse que gostou delas,
 * e a SPEC-95 §5 recusa refazê-las. **O que mudou foi onde cada uma mora.** Os
 * testes de cada peça passam sem alteração; se algum precisasse mudar, a peça
 * teria mudado por dentro e a rodada teria saído do escopo.
 *
 * ## O cabeçalho é o mesmo do §341, e de propósito
 *
 * As classes `landing-cabecalho`, `landing-atos` e a variável
 * `--altura-do-cabecalho` foram medidas em 360, 768 e 1440 px na rodada passada,
 * com E2E que compara a altura real com a declarada. Reusá-las herda a medição;
 * escrever um cabeçalho novo jogaria fora a única parte já verificada em pixel.
 */
export function Site({
  pagina,
  onEntrar,
  temSessao,
}: {
  pagina: PaginaDoSite;
  onEntrar: () => void;
  /** Quem já tem sessão vê "Ir para o app" — mandá-lo "Entrar" seria pedir de
   *  novo o que ele já fez. `undefined` (sessão ainda sendo verificada) mostra
   *  "Entrar", porque a página pública não espera a rede para ser útil. */
  temSessao?: boolean;
}) {
  const naCapa = pagina.id === "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--painel)", fontFamily: "system-ui, sans-serif" }}>
      <header className="landing-cabecalho">
        <div className="landing-cabecalho-linha">
          <MarcaDoSite />
          <div style={{ flex: 1 }} />
          {/* SPEC-93 — o tema também antes do login: quem chega pode preferir
              claro, e mandá-lo entrar para poder escolher seria pedir uma
              credencial em troca de conforto de leitura. */}
          <SeletorDeTema />
          <button
            onClick={temSessao ? irParaOApp : onEntrar}
            data-testid="entrar-no-app"
            style={{ ...botaoEntrarEstilo, marginLeft: 10 }}
          >
            {temSessao ? "Ir para o app" : "Entrar"}
          </button>
        </div>
        <div className="landing-cabecalho-linha landing-cabecalho-navegacao">
          <MenuDoSite atual={pagina} />
        </div>
      </header>

      {naCapa ? (
        <main style={{ padding: "56px 24px 64px" }}>
          <PaginaCapa onEntrar={onEntrar} />
        </main>
      ) : (
        <MolduraDaPagina pagina={pagina}>
          <ConteudoDaPagina pagina={pagina} />
        </MolduraDaPagina>
      )}

      <RodapeDaPagina pagina={pagina} onEntrar={onEntrar} />
    </div>
  );
}

/**
 * O chapéu da página — numeral, nome e a pergunta.
 *
 * **Não é um `<h2>`**, e o motivo foi medido no §333: cada peça já traz o seu
 * título, e ele é o mais específico dos dois. Um título de moldura empilhado
 * sobre o título da peça reconstruiria aquele defeito uma vez por página — e a
 * trava de abertura repetida acusaria, com razão.
 *
 * O `<h1>` da página é o título da peça protagonista, ou o da capa.
 */
function MolduraDaPagina({ pagina, children }: { pagina: PaginaDoSite; children: React.ReactNode }) {
  const largura = LARGURA_DA_PAGINA[pagina.id] ?? 700;
  const rotuloId = `pagina-rotulo-${pagina.id}`;

  return (
    <main
      id={pagina.id}
      data-testid={`pagina-${pagina.id}`}
      aria-labelledby={rotuloId}
      className="landing-ato"
      style={{ padding: "38px 24px 56px" }}
    >
      <div style={{ maxWidth: largura, margin: "0 auto" }}>
        <header style={{ margin: "0 0 22px" }}>
          <div
            id={rotuloId}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "var(--acento-gente-texto)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {String(PAGINAS.findIndex((p) => p.id === pagina.id) + 1).padStart(2, "0")}
            </span>
            <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--borda-forte)" }} />
            {pagina.nome}
          </div>
          {/**
           * A PERGUNTA é o `<h1>` da página, e isso não é enfeite semântico.
           *
           * Ao virar site, cada página passou a precisar de um título próprio — e
           * as páginas de conteúdo não tinham nenhum: as peças trazem `<h2>`, e o
           * chapéu é um rótulo. Um documento sem `h1` é um documento sem nome
           * para quem navega por cabeçalhos, que é como um leitor de tela varre
           * uma página que não conhece.
           *
           * **Por que a pergunta e não o nome.** "O ciclo" como `h1` colidiria com
           * "O ciclo, e onde a IA entra", o `h2` da peça, três linhas abaixo — o
           * defeito do §333, reconstruído uma vez por página. A trava de títulos
           * que abrem igual pegaria, e estaria certa.
           *
           * E a pergunta faz um trabalho que um nome não faz: diz a quem já sabe
           * a resposta que pode pular a página.
           */}
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--texto)", lineHeight: 1.35, margin: "8px 0 0" }}>
            {pagina.pergunta}
          </h1>
        </header>
        {children}
      </div>
    </main>
  );
}

/**
 * As larguras por página. O percurso é a mais larga porque o fluxo em raias tem
 * `viewBox` de 1356 unidades; as peças mais estreitas se centralizam sozinhas,
 * porque todas trazem o próprio `maxWidth`.
 *
 * Estas são as mesmas do §341, e lá elas nasceram de um defeito medido: chapéu e
 * peça começavam em `x` diferentes — 310 px de desalinhamento no percurso.
 */
const LARGURA_DA_PAGINA: Record<string, number> = {
  "o-ciclo": 760,
  "o-percurso": 1320,
};

function ConteudoDaPagina({ pagina }: { pagina: PaginaDoSite }) {
  switch (pagina.id) {
    case "o-problema":
      return <AEvolucao />;
    case "o-conceito":
      /* A ordem é argumento: as camadas dizem O QUE a coisa contém; o motor diz
         quem faz o quê dentro dela; e o passo contido MOSTRA, com movimento, a
         ausência de comportamento que os dois anteriores só conseguem afirmar
         (SPEC-85 fatia C). */
      return (
        <div style={{ display: "grid", gap: 34 }}>
          <AsCamadas />
          <OMotor />
          <OPassoContido />
        </div>
      );
    case "o-ciclo":
      return <CicloDoProduto />;
    case "o-percurso":
      /* O índice antes do percurso já aconteceu — o ciclo é a página anterior.
         Aqui ficam as duas peças que respondem à mesma pergunta: por onde passa,
         e onde fala com fora. */
      return (
        <div style={{ display: "grid", gap: 40 }}>
          <OFluxoDoProcesso />
          <OMapaDeConexoes />
        </div>
      );
    case "arquitetura":
      return <PaginaArquitetura />;
    default:
      return null;
  }
}

/**
 * O rodapé: **para onde ir depois**, e o convite.
 *
 * Num site em páginas isto não é enfeite. Sem ele, o fim de cada página é um
 * beco — a pessoa terminou de ler e a única saída visível é o menu lá em cima,
 * que exige rolar de volta tudo o que ela acabou de rolar.
 */
function RodapeDaPagina({ pagina, onEntrar }: { pagina: PaginaDoSite; onEntrar: () => void }) {
  /**
   * A capa tem `indice === -1`, e a próxima dela é a **primeira** página.
   *
   * A primeira escrita deixava o `-1` cair no ramo do "não há próxima", e a capa
   * terminava com o convite de última página — quem chegava ao fim dela não
   * recebia por onde começar, que é a única coisa que uma capa precisa dar.
   * Achado olhando a captura, não o teste.
   */
  const indice = PAGINAS.findIndex((p) => p.id === pagina.id);
  const proxima = indice < PAGINAS.length - 1 ? PAGINAS[indice + 1] : undefined;

  return (
    <footer
      className="landing-rodape"
      style={{
        borderTop: "1px solid var(--borda)",
        background: "var(--painel-alto)",
        padding: "28px 24px 40px",
      }}
    >
      <div
        style={{
          maxWidth: 700,
          margin: "0 auto",
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {proxima ? (
          <a href={rotaDaPagina(proxima)} data-testid="proxima-pagina" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 11.5, color: "var(--texto-fraco)", display: "block" }}>A seguir</span>
            <strong style={{ fontSize: 14.5, color: "var(--acento-gente-texto)" }}>{proxima.nome} →</strong>
          </a>
        ) : (
          <span style={{ fontSize: 13.5, color: "var(--texto-2)" }}>
            Comece pelo que é seu: o contexto do produto e as regras do time.
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onEntrar} style={{ ...botaoEntrarEstilo, padding: "9px 18px", fontSize: 13.5 }}>
          Entrar
        </button>
      </div>
    </footer>
  );
}

function irParaOApp() {
  window.location.hash = "#/";
}

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

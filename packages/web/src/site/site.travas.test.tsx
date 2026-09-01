import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Site } from "./Site";
import { PAGINAS, CAPA, paginaDoSite, rotaDaPagina, PREFIXO_DO_SITE } from "./paginas";
import { PROVAS } from "./provas";
import { CicloDoProduto } from "../demo/CicloDoProduto";
import { OFluxoDoProcesso } from "../demo/OFluxoDoProcesso";
import { ESTAGIOS_DO_CICLO } from "../demo/ciclo";
import { CAMADAS, CONEXOES, EVOLUCAO, contagemDasConexoes } from "../demo/conceito";
import { AREAS_CONFIG_CONHECIDAS, hashDaRota, rotaDoHash } from "../navegacao/rota";

/**
 * SPEC-83 fatia F, SPEC-95 fatia G — **as travas do site público.**
 *
 * ## O que elas guardam, e por que a régua é o site INTEIRO
 *
 * A SPEC-83 nasceu de dois defeitos medidos, e os dois eram de repetição: 4 das
 * 5 etapas da `Jornada` eram estágios que o círculo acabava de mostrar, e a tese
 * estava escrita em quatro lugares, nenhum canônico. Em ambos, cada versão
 * estava certa isoladamente — foi por isso que ninguém notou.
 *
 * **O §342 tornou isso mais fácil de acontecer, não menos.** Antes as peças
 * estavam todas na mesma página, e a repetição saltava aos olhos ao rolar. Agora
 * cada uma tem a sua, e duas páginas podem dizer a mesma coisa sem que ninguém
 * veja as duas juntas. Por isso as travas de repetição renderizam **todas as
 * páginas** e medem o conjunto.
 */

const AQUI = resolve(import.meta.dirname);
const RAIZ_DO_WEB = resolve(AQUI, "..");
const RAIZ_DO_REPO = resolve(RAIZ_DO_WEB, "..", "..", "..");

/** Uma página, renderizada isoladamente. */
function renderizar(pagina: (typeof PAGINAS)[number] | typeof CAPA) {
  return render(<Site pagina={pagina} onEntrar={() => {}} />);
}

/** O texto de TODAS as páginas, concatenado — a régua do conjunto. */
function textoDoSite(): string {
  let texto = "";
  for (const pagina of [CAPA, ...PAGINAS]) {
    const { unmount } = renderizar(pagina);
    texto += `\n${document.body.textContent ?? ""}`;
    unmount();
  }
  return texto;
}

describe("o site não pode se repetir (SPEC-83 fatia F)", () => {
  it("nenhuma página repete um TÍTULO de estágio do ciclo", () => {
    /**
     * O defeito do §323 virado trava: qualquer página que reintroduza um estágio
     * pelo título está contando a mesma coisa duas vezes.
     *
     * ## Por que a régua é calibrada, e não um número
     *
     * O número certo não é 1 nem 2: é **o que os componentes produzirem**. O
     * círculo cita cada título duas vezes (no círculo e na lista), e o fluxo os
     * cita de novo — porque sem os nomes não há percurso, só caixas com rótulo
     * de fase. Medir a linha de base contra eles mesmos faz a trava sobreviver a
     * eles mudarem de forma, e mede o que ela quer medir: repetição **fora**
     * deles.
     *
     * **SPEC-95 — e agora ela vale sobre o site inteiro.** Com uma página por
     * assunto, o risco mudou de lugar: o perigo não é mais repetir ao rolar, é a
     * página nova citar de novo o que outra já disse. A capa é a candidata
     * natural, e é por isso que os `resumo` de `paginas.ts` não nomeiam estágio.
     */
    const NOMEIAM_ESTAGIOS = [
      { nome: "CicloDoProduto", elemento: <CicloDoProduto /> },
      { nome: "OFluxoDoProcesso", elemento: <OFluxoDoProcesso /> },
    ];

    const base = new Map(ESTAGIOS_DO_CICLO.map((e) => [e.titulo, 0]));
    for (const { elemento } of NOMEIAM_ESTAGIOS) {
      const { unmount } = render(elemento);
      const texto = document.body.textContent ?? "";
      for (const e of ESTAGIOS_DO_CICLO) {
        base.set(e.titulo, (base.get(e.titulo) ?? 0) + (texto.split(e.titulo).length - 1));
      }
      unmount();
    }

    const texto = textoDoSite();
    const repetidos = ESTAGIOS_DO_CICLO.filter(
      (e) => texto.split(e.titulo).length - 1 > (base.get(e.titulo) ?? 0),
    ).map((e) => `${e.titulo}: ${texto.split(e.titulo).length - 1}× no site, ${base.get(e.titulo)}× nos componentes que nomeiam`);

    expect(repetidos, `estágios contados FORA do círculo e do fluxo:\n${repetidos.join("\n")}`).toEqual([]);
  });

  it("dois títulos da MESMA página não abrem com o mesmo assunto", () => {
    /**
     * SPEC-85 §0.1 — o defeito que a trava de cima não pegava: a página trazia
     * `<h2>O ciclo, e o que dele já existe</h2>` e o componente, três linhas
     * abaixo, trazia `<h2>O ciclo, e onde a IA entra</h2>`. "O ciclo" não é
     * estágio nenhum, então a repetição mais visível passava batida.
     *
     * ## Por que a PRIMEIRA palavra
     *
     * Similaridade de texto pede um limiar, e limiar é opinião com número. A
     * primeira escrita usou as três primeiras palavras significativas e deixou o
     * defeito passar — provei desligando a correção, e a trava ficou verde com o
     * `h2` duplicado de volta. O que colidia era **a palavra em que o olho bate
     * ao rolar**, e isso é mecânico de checar.
     *
     * **SPEC-95 — por página, e não pelo site.** Duas páginas diferentes podem
     * legitimamente abrir com a mesma palavra: elas nunca são lidas juntas, e é
     * disso que se trata a mudança para páginas. Medir o conjunto aqui
     * produziria falso positivo, que é como uma trava boa morre.
     */
    for (const pagina of [CAPA, ...PAGINAS]) {
      const { unmount } = renderizar(pagina);
      const titulos = [...document.querySelectorAll("h1, h2")].map((h) => h.textContent ?? "");

      const abertura = (t: string) =>
        t
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .split(/\s+/)
          .filter((p) => p.length > 2)
          .slice(0, 1)
          .join(" ");

      const vistos = new Map<string, string>();
      const colisoes: string[] = [];
      for (const titulo of titulos) {
        const chave = abertura(titulo);
        if (!chave) continue;
        const anterior = vistos.get(chave);
        if (anterior) colisoes.push(`"${anterior}" × "${titulo}"`);
        else vistos.set(chave, titulo);
      }
      unmount();

      expect(colisoes, `em "${pagina.nome}", títulos que abrem igual:\n${colisoes.join("\n")}`).toEqual([]);
    }
  });

  it("a `Jornada` NÃO é renderizada no site — ela é passo a passo de uso, e o lugar dela é pós-login", () => {
    /**
     * A poda do §323, afirmada. Sem isto, alguém a traz de volta "porque explica
     * bem" — e ela explica mesmo; o problema é onde.
     *
     * **Os comentários saem antes de medir**, e a primeira escrita esqueceu: o
     * cabeçalho explicava a poda citando `<Jornada />`, e a trava acusou a
     * própria explicação de ser o defeito. Uma trava que proíbe documentar o que
     * ela guarda ensina a apagar o comentário.
     */
    const fonte = varrer(join(RAIZ_DO_WEB, "site"))
      .map((f) => semComentarios(readFileSync(f, "utf-8")))
      .join("\n");

    expect(fonte).not.toMatch(/<Jornada\b/);
  });

  it("o `OMotor` tem UMA casa — não mora mais dentro da `Jornada`", () => {
    // O §323 mediu a tese em quatro lugares. Esta trava cuida do que estava sob
    // nosso controle direto: o componente não pode voltar a ter dois pais, senão
    // o site e o modal divergem no dia em que alguém editar um deles.
    const donos = varrer(RAIZ_DO_WEB).filter((f) => /<OMotor\b/.test(readFileSync(f, "utf-8")));

    expect(donos.map((f) => f.replace(RAIZ_DO_WEB, ""))).toHaveLength(1);
  });
});

describe("e não pode prometer o que o produto não faz (SPEC-83 fatia F)", () => {
  it("toda conexão AUSENTE aparece marcada, com o que falta", () => {
    /**
     * A régua da SPEC-76 aplicada às bordas. Cinco setas todas acesas seria a
     * maior promessa falsa que este site poderia fazer — e a honestidade vende
     * mais: *"é para cá que isto vai, e é daqui que já estamos"* é frase em que
     * um arquiteto de organização grande acredita.
     */
    renderizar(PAGINAS.find((p) => p.id === "o-percurso")!);

    for (const c of CONEXOES.filter((x) => x.estado !== "completo")) {
      const item = screen.getByTestId(`conexao-${c.id}`);
      expect(item.textContent, `a conexão "${c.titulo}" não diz o seu estado`).toMatch(/parcial|ainda não existe/);
      expect(item.textContent, `a conexão "${c.titulo}" não diz o que falta`).toContain("O que falta");
    }
  });

  it("conexão completa NÃO leva marca — marcar o que está certo é ruído", () => {
    // E ruído se aprende a ignorar, junto com o que importava. Mesma disciplina
    // que o `CicloDoProduto` já aplica aos estágios.
    renderizar(PAGINAS.find((p) => p.id === "o-percurso")!);

    for (const c of CONEXOES.filter((x) => x.estado === "completo")) {
      expect(screen.getByTestId(`conexao-${c.id}`).textContent).not.toContain("O que falta");
    }
  });

  it("o número que a página diz é CALCULADO, não digitado", () => {
    // Um número escrito à mão descola do dado no primeiro caminho que entrar, e
    // descola em silêncio — a página passaria a mentir sem ninguém mexer nela.
    const { existem, total } = contagemDasConexoes();
    renderizar(PAGINAS.find((p) => p.id === "o-percurso")!);

    expect(document.body.textContent).toContain(`${existem} de ${total} caminhos existem hoje`);
  });

  it("as três peças de conceito estão no site, e na ordem: problema → camadas → conexões", () => {
    /**
     * A ordem é a fatia D da SPEC-83: **o problema vem antes da solução.** O
     * site começava dizendo o que a ferramenta faz, para quem ainda não sabia
     * por que precisaria dela.
     *
     * **SPEC-95 — a ordem agora é a das PÁGINAS**, e é o menu que a carrega: o
     * problema é a primeira, o conceito a segunda, o percurso a quarta. Medir a
     * ordem do texto concatenado é medir a ordem em que este teste renderiza, e
     * isso seria um teste que verifica a si mesmo.
     */
    const ordem = PAGINAS.map((p) => p.id);

    expect(ordem.indexOf("o-problema")).toBeGreaterThanOrEqual(0);
    expect(ordem.indexOf("o-conceito")).toBeGreaterThan(ordem.indexOf("o-problema"));
    expect(ordem.indexOf("o-percurso")).toBeGreaterThan(ordem.indexOf("o-conceito"));

    // E as peças estão de fato em cada uma delas.
    const { unmount } = renderizar(PAGINAS[0]);
    expect(document.body.textContent).toContain(EVOLUCAO[0].titulo);
    unmount();

    const conceito = renderizar(PAGINAS.find((p) => p.id === "o-conceito")!);
    expect(document.body.textContent).toContain(CAMADAS[0].titulo);
    conceito.unmount();

    renderizar(PAGINAS.find((p) => p.id === "o-percurso")!);
    expect(document.body.textContent).toContain(CONEXOES[0].titulo);
  });

  it("a manchete fala de PERMANÊNCIA, não de trajeto", () => {
    /**
     * *"Do diagrama ao backlog"* prometia um destino, e o produto não termina —
     * ele volta. Era o defeito que o §314 achou no corpo da página sobrevivendo
     * no título, e o usuário decidiu trocá-lo: *"não é até o backlog, é esse
     * conceito que acompanha processos"*.
     */
    renderizar(CAPA);
    const texto = document.body.textContent ?? "";

    expect(texto).not.toContain("Do diagrama ao backlog");
    expect(texto.toLowerCase()).toMatch(/sobreviv|perene|acompanha/);
  });
});

describe("o site em páginas (SPEC-95 fatia G)", () => {
  it("todo item do menu resolve para uma página que existe", () => {
    /**
     * **A régua "não prometer o que o produto não faz" aplicada à navegação.** Um
     * item de menu é a promessa de que há algo do outro lado, e uma rota quebrada
     * é a forma mais barata de mentir que um site tem: não dá erro, não some, não
     * avisa — só leva ao lugar errado.
     */
    renderizar(CAPA);

    const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-testid^="menu-"]')];
    expect(links, "o menu não tem item nenhum").toHaveLength(PAGINAS.length);

    const quebrados = links
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => paginaDoSite(href)?.id !== href.replace(`${PREFIXO_DO_SITE}/`, ""));

    expect(quebrados, `itens de menu que não resolvem:\n${quebrados.join("\n")}`).toEqual([]);
  });

  it("nenhuma rota pública colide com uma rota do app", () => {
    /**
     * SPEC-92 §7.2 deixou isto como pergunta e o §341 respondeu pela metade:
     * âncoras não colidiam porque não começavam com `#/`. Agora **começam** — o
     * site vive em `#/site/…` —, então a pergunta voltou com dentes.
     *
     * As duas direções importam. Uma rota do app que caísse no site tiraria a
     * pessoa de dentro do produto; uma do site que o `rotaDoHash` reivindicasse
     * levaria um link público para uma tela que exige sessão.
     */
    for (const pagina of PAGINAS) {
      const rota = rotaDaPagina(pagina);
      expect(paginaDoSite(rota)?.id, `"${rota}" deixou de ser público`).toBe(pagina.id);
    }

    // E o caminho contrário: nenhuma tela do app é entendida como site.
    const rotasDoApp = [
      hashDaRota({ tela: "canvas" }),
      hashDaRota({ tela: "documento" }),
      hashDaRota({ tela: "sistema" }),
      hashDaRota({ tela: "ensaios" }),
      ...AREAS_CONFIG_CONHECIDAS.map((area) => hashDaRota({ tela: "config", area })),
    ];

    for (const rota of rotasDoApp) {
      expect(paginaDoSite(rota), `"${rota}" é do app e virou página pública`).toBeNull();
    }
  });

  it("segmento desconhecido sob `#/site` cai na capa, e não em tela branca", () => {
    // Link velho de página pública não pode virar nada — é a mesma régua que o
    // `rotaDoHash` já aplica ao hash desconhecido (SPEC-61 §6.7).
    expect(paginaDoSite("#/site/pagina-que-nunca-existiu")?.id).toBe("");
    expect(paginaDoSite("#/site")?.id).toBe("");
    expect(paginaDoSite("#/site/")?.id).toBe("");
    // E o que não é do site continua não sendo.
    expect(paginaDoSite("#/")).toBeNull();
    expect(paginaDoSite("")).toBeNull();
  });

  it("a capa aponta para TODAS as páginas — nenhuma fica órfã", () => {
    // Uma página só alcançável pelo menu é uma página que quem chega pela capa
    // nunca vê. O menu é para quem já está navegando; a capa é para quem chegou.
    renderizar(CAPA);

    for (const pagina of PAGINAS) {
      expect(screen.getByTestId(`capa-link-${pagina.id}`), `a capa não aponta para "${pagina.nome}"`).toBeTruthy();
    }
  });

  it("toda PROVA citada existe no repositório", () => {
    /**
     * SPEC-95 §3 — **a régua da própria régua.**
     *
     * A página de arquitetura afirma coisas e cita o arquivo que as sustenta. Uma
     * citação quebrada seria pior que nenhuma: seria uma promessa falsa *sobre o
     * mecanismo de não fazer promessas falsas* — e é justamente o argumento que
     * esta página usa para se distinguir de material de marketing.
     */
    const inexistentes = PROVAS.filter((p) => !existsSync(join(RAIZ_DO_REPO, p.arquivo))).map((p) => p.arquivo);

    expect(inexistentes, `provas citadas que não existem:\n${inexistentes.join("\n")}`).toEqual([]);
  });

  it("e o arquivo citado é um TESTE, ou o tipo que declara a fronteira", () => {
    // Citar um arquivo qualquer satisfaria a trava de cima sem provar nada. O que
    // sustenta uma afirmação é uma suíte que falha — ou, no caso da fronteira
    // entre regra medida e regra de checklist, o tipo que a declara.
    const semProva = PROVAS.filter((p) => !/\.test\.tsx?$/.test(p.arquivo) && !/types\.ts$/.test(p.arquivo)).map(
      (p) => p.arquivo,
    );

    expect(semProva, `citados que não são teste nem tipo:\n${semProva.join("\n")}`).toEqual([]);
  });

  it("o texto que cada página escreve por si cabe no teto", () => {
    /**
     * SPEC-92 fatia A, com o denominador que o §341 corrigiu e o §342 ajustou.
     *
     * A SPEC-92 pediu "≤ 400 palavras no `innerText`", e a medição mostrou que
     * isso mede a coisa errada: 97% do texto sai de `ciclo.ts` e `conceito.ts`, e
     * 41% estava em desdobramentos fechados que ninguém lê. O teto passou a ser
     * sobre a **prosa autoral** — a página menos as peças.
     *
     * **SPEC-95 §7.2 — e agora é POR PÁGINA, com valor próprio para a técnica.**
     * O teto de 160 foi calibrado para uma apresentação; uma página de
     * arquitetura com 160 palavras é um panfleto. O que a trava impede continua
     * sendo o mesmo: a página virar artigo sem ninguém perceber.
     */
    const conta = (t: string) => t.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;

    for (const pagina of [CAPA, ...PAGINAS]) {
      const { unmount } = renderizar(pagina);
      const total = conta(document.body.textContent ?? "");
      const nasPecas = [...document.querySelectorAll<HTMLElement>("section[data-testid]")]
        // As seções da própria página não são peças: descontá-las tiraria a
        // página inteira de si mesma.
        .filter((s) => {
          const id = s.dataset.testid ?? "";
          return !id.startsWith("pagina-") && !id.startsWith("arquitetura-") && !id.startsWith("capa");
        })
        .reduce((a, s) => a + conta(s.textContent ?? ""), 0);
      unmount();

      const autoral = total - nasPecas;
      const teto = TETO_DE_PROSA[pagina.id] ?? TETO_PADRAO;

      expect(autoral, `"${pagina.nome}" escreve ${autoral} palavras por si — o teto é ${teto}`).toBeLessThanOrEqual(teto);
    }
  });
});

/**
 * O teto por página.
 *
 * **Padrão 120:** uma página cujo trabalho é emoldurar uma peça precisa do
 * chapéu, da pergunta e do rodapé — e nada mais. Se passar disso, ou a peça
 * parou de se explicar, ou a moldura virou artigo.
 *
 * **A capa e a arquitetura têm valor próprio, e por motivos opostos.** A capa
 * apresenta cinco páginas, então carrega cinco resumos de uma linha — é o corpo
 * dela, não excesso. A arquitetura **é** prosa autoral: ela não emoldura peça
 * nenhuma, ela explica, e é a página que a SPEC-95 §7.2 previu como exceção.
 *
 * Nenhum destes números é medição: são escolhas, e estão ditas como escolhas. O
 * que os torna úteis é serem apertados o suficiente para que crescer exija vir
 * aqui e escrever por quê.
 */
const TETO_PADRAO = 120;
const TETO_DE_PROSA: Record<string, number> = {
  "": 220,
  /** A página escreve 886. 950 dá ~60 de folga — uma afirmação nova com a sua
   *  prova cabe; um parágrafo de discurso, não. */
  arquitetura: 950,
};

/** Bloco e linha. Trava que mede comentário acusa a própria explicação — e
 * ensina a apagá-la, que é o oposto do que este repositório quer. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function varrer(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...varrer(caminho));
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

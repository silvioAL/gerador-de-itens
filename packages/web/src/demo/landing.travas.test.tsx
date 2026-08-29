import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";
import { CicloDoProduto } from "./CicloDoProduto";
import { ESTAGIOS_DO_CICLO } from "./ciclo";
import { CAMADAS, CONEXOES, EVOLUCAO, contagemDasConexoes } from "./conceito";

/**
 * SPEC-83 fatia F — **as travas que impedem esta rodada de ser necessária de
 * novo.**
 *
 * ## O que elas guardam
 *
 * A SPEC-83 nasceu de dois defeitos medidos, e os dois são de repetição:
 *
 * - **4 das 5 etapas da `Jornada`** eram estágios que o círculo acabava de
 *   mostrar (§0.1);
 * - **a tese estava escrita em quatro lugares**, nenhum canônico (§0.2).
 *
 * Nos dois casos cada versão estava certa isoladamente, e foi por isso que
 * ninguém notou. Teste que só olha uma seção por vez nunca acharia — a régua
 * aqui é sobre a página INTEIRA.
 */

const AQUI = resolve(import.meta.dirname);
const RAIZ_DO_WEB = resolve(AQUI, "..");

function textoDaLanding(): string {
  render(<LandingPage onEntrar={() => {}} />);
  return document.body.textContent ?? "";
}

describe("a landing não pode se repetir (SPEC-83 fatia F)", () => {
  it("nenhuma seção repete um TÍTULO de estágio do ciclo", () => {
    /**
     * O defeito do §0.1, virado trava: qualquer seção que reintroduza um estágio
     * pelo título está contando a mesma coisa duas vezes — que é exatamente como
     * a `Jornada` acabou repetindo quatro.
     *
     * ## Por que a régua é calibrada, e não um número
     *
     * A primeira escrita tolerava **uma** ocorrência por estágio, supondo que o
     * círculo citasse cada título uma vez. **Ele cita duas** — no círculo e na
     * lista ao lado —, e o teste acusou os treze de uma vez.
     *
     * O número certo não é 1 nem 2: é **o que o `CicloDoProduto` produzir**.
     * Medir a linha de base contra o próprio componente faz a trava sobreviver a
     * ele mudar de forma, e mede o que ela quer medir — repetição **fora** do
     * círculo, não dentro dele.
     */
    const { unmount } = render(<CicloDoProduto />);
    const base = new Map(
      ESTAGIOS_DO_CICLO.map((e) => [e.titulo, (document.body.textContent ?? "").split(e.titulo).length - 1])
    );
    unmount();

    const texto = textoDaLanding();
    const repetidos = ESTAGIOS_DO_CICLO.filter(
      (e) => texto.split(e.titulo).length - 1 > (base.get(e.titulo) ?? 0)
    ).map((e) => `${e.titulo}: ${texto.split(e.titulo).length - 1}× na página, ${base.get(e.titulo)}× no círculo`);

    expect(repetidos, `estágios contados FORA do círculo:\n${repetidos.join("\n")}`).toEqual([]);
  });

  it("dois títulos da página não abrem com o mesmo assunto", () => {
    /**
     * SPEC-85 §0.1 — **o defeito que a trava de cima não pegava.**
     *
     * A página trazia `<h2>O ciclo, e o que dele já existe</h2>` e, três linhas
     * de rolagem abaixo, o componente trazia o seu: `<h2>O ciclo, e onde a IA
     * entra</h2>`. A trava do §323 compara títulos de ESTÁGIO, e "O ciclo" não é
     * estágio nenhum — então a repetição mais visível da página passou batida
     * por uma trava escrita para pegar repetição.
     *
     * ## Por que a PRIMEIRA palavra, e não "títulos parecidos"
     *
     * Similaridade de texto pede um limiar, e limiar é opinião com número.
     *
     * A primeira escrita desta trava usou as **três** primeiras palavras
     * significativas, e ela deixou o defeito passar: "o ciclo e o que dele ja
     * existe" abre em `ciclo que dele` e "o ciclo e onde a ia entra" abre em
     * `ciclo onde ia`. Provei desligando a correção — a trava ficou verde com o
     * `h2` duplicado de volta na página. Três palavras foi engenhosidade a mais
     * que mediu a coisa errada.
     *
     * O que realmente colidia era **a palavra em que o olho bate ao rolar**.
     * Dois títulos abrindo em "ciclo" é a repetição, e é mecânico de checar.
     *
     * Não pega tudo — dois títulos sobre o mesmo assunto com aberturas
     * diferentes passam. Pega o que dá para provar sem arbitrar, e pegaria este.
     */
    render(<LandingPage onEntrar={() => {}} />);
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

    expect(colisoes, `títulos que abrem igual:\n${colisoes.join("\n")}`).toEqual([]);
  });

  it("a `Jornada` NÃO é renderizada aqui — ela é passo a passo de uso, e o lugar dela é pós-login", () => {
    /**
     * A poda da fatia B, afirmada. Sem isto, alguém a traz de volta "porque
     * explica bem" — e ela explica mesmo; o problema é onde.
     *
     * **Os comentários saem antes de medir**, e a primeira escrita esqueceu: o
     * cabeçalho da `LandingPage` explica a poda citando `<Jornada />`, e a trava
     * acusou a própria explicação de ser o defeito. Uma trava que proíbe
     * documentar o que ela guarda ensina a apagar o comentário.
     */
    expect(semComentarios(readFileSync(join(AQUI, "LandingPage.tsx"), "utf-8"))).not.toMatch(/<Jornada\b/);
  });

  it("o `OMotor` tem UMA casa — não mora mais dentro da `Jornada`", () => {
    /**
     * O §0.2 mediu a tese em quatro lugares. Esta trava cuida do lugar que
     * estava sob o nosso controle direto: o componente não pode voltar a ser
     * renderizado por dois pais, senão a landing e o modal divergem no dia em
     * que alguém editar um deles.
     */
    const donos = varrer(RAIZ_DO_WEB).filter((f) => /<OMotor\b/.test(readFileSync(f, "utf-8")));

    expect(donos.map((f) => f.replace(RAIZ_DO_WEB, ""))).toHaveLength(1);
  });
});

describe("e não pode prometer o que o produto não faz (SPEC-83 fatia F)", () => {
  it("toda conexão AUSENTE aparece marcada, com o que falta", () => {
    /**
     * A régua da SPEC-76 aplicada às bordas. Cinco setas todas acesas seria a
     * maior promessa falsa que esta página já teria feito — e a honestidade
     * vende mais: *"é para cá que isto vai, e é daqui que já estamos"* é frase
     * em que um arquiteto de organização grande acredita.
     */
    textoDaLanding();

    for (const c of CONEXOES.filter((x) => x.estado !== "completo")) {
      const item = screen.getByTestId(`conexao-${c.id}`);
      expect(item.textContent, `a conexão "${c.titulo}" não diz o seu estado`).toMatch(/parcial|ainda não existe/);
      expect(item.textContent, `a conexão "${c.titulo}" não diz o que falta`).toContain("O que falta");
    }
  });

  it("conexão completa NÃO leva marca — marcar o que está certo é ruído", () => {
    // E ruído se aprende a ignorar, junto com o que importava. Mesma disciplina
    // que o `CicloDoProduto` já aplica aos estágios.
    textoDaLanding();

    for (const c of CONEXOES.filter((x) => x.estado === "completo")) {
      expect(screen.getByTestId(`conexao-${c.id}`).textContent).not.toContain("O que falta");
    }
  });

  it("o número que a página diz é CALCULADO, não digitado", () => {
    // Um número escrito à mão descola do dado no primeiro caminho que entrar, e
    // descola em silêncio — a página passaria a mentir sem ninguém mexer nela.
    const { existem, total } = contagemDasConexoes();

    expect(textoDaLanding()).toContain(`${existem} de ${total} caminhos existem hoje`);
  });

  it("as três peças de conceito estão na página, e na ordem: problema → camadas → conexões", () => {
    /**
     * A ordem é a fatia D: **o problema vem antes da solução.** A página
     * começava dizendo o que a ferramenta faz, para quem ainda não sabia por
     * que precisaria dela.
     */
    const texto = textoDaLanding();
    const posEvolucao = texto.indexOf(EVOLUCAO[0].titulo);
    const posCamadas = texto.indexOf(CAMADAS[0].titulo);
    const posConexoes = texto.indexOf(CONEXOES[0].titulo);

    expect(posEvolucao).toBeGreaterThan(-1);
    expect(posCamadas).toBeGreaterThan(posEvolucao);
    expect(posConexoes).toBeGreaterThan(posCamadas);
  });

  it("a manchete fala de PERMANÊNCIA, não de trajeto", () => {
    /**
     * *"Do diagrama ao backlog"* prometia um destino, e o produto não termina —
     * ele volta. Era o defeito que o §314 achou no corpo da página
     * sobrevivendo no título, e o usuário decidiu trocá-lo:
     * *"não é até o backlog, é esse conceito que acompanha processos"*.
     */
    const texto = textoDaLanding();

    expect(texto).not.toContain("Do diagrama ao backlog");
    expect(texto.toLowerCase()).toMatch(/sobreviv|perene|acompanha/);
  });
});

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

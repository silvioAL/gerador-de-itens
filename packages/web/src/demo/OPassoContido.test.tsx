import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OPassoContido } from "./OPassoContido";

const AQUI = resolve(__dirname);
const CSS = readFileSync(resolve(AQUI, "..", "styles.css"), "utf-8");

/**
 * SPEC-85 fatia C / SPEC-82 fase 1 — **as travas do movimento.**
 *
 * O que elas guardam não é aparência: é que a peça continue **dizendo a mesma
 * coisa** quando ninguém vê a animação, e que a informação que ela carrega não
 * seja apagada por alguém tentando deixá-la mais fluida.
 */
describe("o passo contido (SPEC-85 fatia C)", () => {
  it("a tese está em TEXTO, não só no movimento", () => {
    /**
     * Leitor de tela, movimento reduzido, imagem bloqueada, captura estática —
     * em todos, a animação não existe. Uma peça cuja tese só vive no tempo é uma
     * peça que a maior parte das pessoas não recebe.
     */
    render(<OPassoContido />);

    expect(screen.getByTestId("passo-contido")).toHaveTextContent("chega até um ponto e espera");
    expect(screen.getByTestId("passo-contido")).toHaveTextContent("alguém confirmando");
  });

  it("a figura tem descrição que conta a mesma história, na mesma ordem", () => {
    // "espera, e só passa DEPOIS que uma pessoa confirma" — a ordem é a tese.
    render(<OPassoContido />);

    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/espera.*depois que uma pessoa confirma/i);
  });

  it("a ESPERA ocupa a maior fatia do ciclo — é a informação, não um respiro", () => {
    /**
     * A proposta chega ao portão em 45% e fica até 85%: 40% do ciclo parada.
     *
     * Esta asserção existe porque a pressão futura é previsível — alguém vai
     * achar a peça "lenta" e encurtar a pausa. Encurtá-la apaga a peça: o que ela
     * mostra é justamente que a coisa NÃO passa sozinha.
     */
    const keyframes = CSS.slice(CSS.indexOf("@keyframes proposta-ate-o-portao"));
    const paradas = keyframes.match(/\b(\d+)%/g)?.map((p) => Number(p.replace("%", ""))) ?? [];
    const inicioDaEspera = paradas.find((p) => p === 45);
    const fimDaEspera = paradas.find((p) => p === 85);

    expect(inicioDaEspera, "a chegada ao portão sumiu do keyframe").toBeDefined();
    expect(fimDaEspera, "o fim da espera sumiu do keyframe").toBeDefined();
    expect(fimDaEspera! - inicioDaEspera!).toBeGreaterThanOrEqual(35);
  });

  it("o carimbo humano aparece ANTES de o portão abrir", () => {
    /**
     * Invertida, a animação contaria a história de um produto diferente: algo
     * que passa e depois é carimbado. A ordem é a régua inteira do produto —
     * primeiro alguém confirma, depois a coisa vale.
     */
    const carimbo = CSS.slice(CSS.indexOf("@keyframes carimbo-humano"));
    const aparece = Number(carimbo.match(/(\d+)%\s*\{\s*opacity: 1;\s*transform: scale\(1\.15\)/)?.[1] ?? NaN);

    // O portão abre no FIM da espera — a segunda parada do par `45%, 85%`, e
    // não a primeira. A escrita anterior pegava a chegada em vez da saída, e
    // comparava o carimbo com o momento errado.
    const proposta = CSS.slice(CSS.indexOf("@keyframes proposta-ate-o-portao"));
    const abreOPortao = Number(proposta.match(/45%,\s*\n?\s*(\d+)%/)?.[1] ?? NaN);

    expect(abreOPortao, "não achei o fim da espera no keyframe").toBe(85);
    expect(aparece, "o carimbo tem que aparecer ANTES de o portão abrir").toBeLessThan(abreOPortao);
  });

  it("movimento reduzido é respeitado — e no produto INTEIRO, não só aqui", () => {
    /**
     * Medido na SPEC-85 fatia C: havia catorze `@keyframes` no `styles.css` e
     * **zero** `prefers-reduced-motion`. Quem pede menos movimento pede por
     * vestíbulo, enxaqueca ou distração, e o sistema operacional já sabia a
     * resposta — ninguém estava perguntando.
     */
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    const guarda = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(guarda).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
  });

  it("sem movimento, a proposta fica NO PORTÃO — o quadro que carrega a tese", () => {
    // Parar a animação no início mostraria a proposta ainda na IA, que não diz
    // nada; parar no fim mostraria ela já do outro lado, que diz o contrário.
    const guarda = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(guarda).toMatch(/\.passo-contido-proposta\s*\{[^}]*offset-distance:\s*46%/);
  });
});

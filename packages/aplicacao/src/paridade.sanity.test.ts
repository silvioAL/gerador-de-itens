import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPEC-31 — a paridade entre os dois modos, verificada em vez de prometida.
 *
 * Toda a SPEC-31 existe porque as duas bordas divergiram sem ninguém perceber:
 * uma ganhava rota, a outra não, e o sintoma aparecia meses depois como "cliquei
 * e não aconteceu nada". Prometer paridade em documento não impediu isso quatro
 * vezes seguidas.
 *
 * Este teste lê as DUAS bordas — o roteador `node:http` do modo local e as rotas
 * Fastify do modo hospedado — e compara os conjuntos de caminho. Adicionar rota
 * num lado só passa a quebrar o build, que é a única forma de garantia que
 * sobreviveu à prática.
 *
 * Ele mora aqui, e não em nenhuma das bordas, porque é sobre a relação entre
 * elas: nenhum dos dois lados é dono desta regra.
 */
const RAIZ = resolve(import.meta.dirname, "..", "..", "..");

/** Caminhos que existem em UM modo por razão declarada, não por esquecimento. */
const SO_NO_LOCAL = new Set([
  // Instalação de modelo GGUF na máquina — não faz sentido em container, que
  // fala só HTTP com um gateway (ver `gateway.fronteira.test.ts`).
  "/ia/instalar",
  // Qual provedor usar. Só existe escolha onde há mais de um provedor; no
  // hospedado o gateway é o único caminho, por decisão da Fase 4.
  "/config/ia",
]);

const SO_NO_HOSPEDADO = new Set([
  // Autenticação, organização e times: o modo local não tem sessão nem
  // múltiplos times (as rotas de `/times` e `/convites` existem lá só para
  // devolver 501 e explicar).
  "/auth",
  "/acessos",
  "/permissoes",
  "/times",
  "/convites",
  "/membros",
  "/saude",
  // No modo local a derivação roda no NAVEGADOR, com o mesmo engine — uma ida
  // ao servidor só adicionaria um salto para calcular o que já está em memória.
  "/quebras/*/derivar",
]);

function normalizar(caminho: string): string {
  // `/quebras/:id/derivar` e `/quebras/([^/]+)/derivar` são o MESMO recurso —
  // o que interessa comparar é o recurso, não a sintaxe de cada roteador.
  return caminho
    .replace(/\/:[^/]+/g, "/*")
    .replace(/\/\(\[\^\/\]\+\)/g, "/*")
    .replace(/\/$/, "");
}

/** Os caminhos que o roteador local trata, lidos do próprio código. */
async function rotasDoModoLocal(): Promise<Set<string>> {
  const fonte = await readFile(resolve(RAIZ, "packages/cli/src/commands/openApiLocal.ts"), "utf-8");
  const rotas = new Set<string>();

  // `caminho === "/x"` e `caminho.match(/^\/x\/([^/]+)$/)`
  for (const [, valor] of fonte.matchAll(/caminho === "([^"]+)"/g)) rotas.add(normalizar(valor));
  // O caminho vem escapado dentro do literal de regex — `\/x\/([^/]+)`.
  for (const [, valor] of fonte.matchAll(/caminho\.match\(\/\^(.+?)\$\//g)) {
    rotas.add(normalizar(valor.replace(/\\\//g, "/").replace(/\(\[\^\/\]\+\)/g, "*")));
  }
  return rotas;
}

/** Os caminhos registrados no Fastify, lidos dos arquivos de rota. */
async function rotasDoModoHospedado(): Promise<Set<string>> {
  const dir = resolve(RAIZ, "packages/server/src/routes");
  const arquivos = (await readdir(dir)).filter((n) => n.endsWith(".ts") && !n.includes(".test."));
  const rotas = new Set<string>();

  for (const arquivo of arquivos) {
    const fonte = await readFile(resolve(dir, arquivo), "utf-8");
    for (const [, valor] of fonte.matchAll(/app\.(?:get|post|put|delete)\(\s*"([^"]+)"/g)) {
      rotas.add(normalizar(valor));
    }
  }
  return rotas;
}

/** Um caminho é "dispensado" se ele ou um prefixo dele está na lista. */
function dispensado(caminho: string, lista: Set<string>): boolean {
  return [...lista].some((prefixo) => caminho === prefixo || caminho.startsWith(`${prefixo}/`));
}

describe("paridade entre o modo local e o hospedado (SPEC-31)", () => {
  it("os dois modos expõem o MESMO conjunto de rotas, fora as dispensas declaradas", async () => {
    const local = await rotasDoModoLocal();
    const hospedado = await rotasDoModoHospedado();

    // Sanidade: se um dos lados vier vazio, o parser quebrou e o teste estaria
    // aprovando por acidente.
    expect(local.size).toBeGreaterThan(5);
    expect(hospedado.size).toBeGreaterThan(5);

    const faltandoNoHospedado = [...local].filter((r) => !hospedado.has(r) && !dispensado(r, SO_NO_LOCAL)).sort();
    const faltandoNoLocal = [...hospedado].filter((r) => !local.has(r) && !dispensado(r, SO_NO_HOSPEDADO)).sort();

    expect({ faltandoNoHospedado, faltandoNoLocal }).toEqual({ faltandoNoHospedado: [], faltandoNoLocal: [] });
  });

  it("as sete rotas de IA existem nos DOIS modos — era a divergência mais cara", async () => {
    const local = await rotasDoModoLocal();
    const hospedado = await rotasDoModoHospedado();

    for (const rota of ["/ia/status", "/ia/sugerir", "/ia/diagrama", "/ia/alterar-item", "/ia/sugerir-config", "/ia/credencial"]) {
      expect({ rota, local: local.has(rota), hospedado: hospedado.has(rota) }).toEqual({
        rota,
        local: true,
        hospedado: true,
      });
    }
    expect(local.has("/ia/pipeline/*")).toBe(true);
    expect(hospedado.has("/ia/pipeline/*")).toBe(true);
  });
});

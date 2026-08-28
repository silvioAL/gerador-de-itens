import { describe, expect, it } from "vitest";
import type { Quebra } from "@gerador/engine";
import { corpoQuebra } from "./quebras.js";

/**
 * SPEC-71 fatia C — a trava contra a QUINTA repetição.
 *
 * ## O que já não bastou
 *
 * O comentário da migração 0011 avisa, na própria tabela, que o Zod da borda
 * descarta chave desconhecida em silêncio. `repositorioDeQuebras.ts` repete a
 * lição três vezes, uma por SPEC (§184, SPEC-53, SPEC-57). E mesmo assim, entre
 * a SPEC-65 e a SPEC-70, **seis campos** foram acrescentados ao tipo `Quebra`
 * sem chegar à borda — e nenhum teste ficou vermelho, porque todos os testes de
 * persistência conferem os campos que eles próprios citam.
 *
 * "Lembrar de atualizar o Zod" foi exatamente o que não aconteceu. Este arquivo
 * troca a lembrança por uma falha.
 *
 * ## Como ele funciona, e por que precisa de duas metades
 *
 * `keyof Quebra` **não existe em runtime** — tipo some na compilação. E o Zod
 * só existe em runtime. Nenhum dos dois consegue perguntar sobre o outro
 * sozinho, então a ponte tem duas metades:
 *
 * 1. **O compilador** obriga o inventário abaixo a cobrir `keyof Quebra`. Campo
 *    novo no tipo sem entrada aqui é erro de build — não passa nem no `tsc`.
 * 2. **O teste** confronta o que o inventário declara com `corpoQuebra.shape`,
 *    que é o conjunto real de chaves que a borda conhece.
 *
 * Uma sem a outra não pega nada: escrever o inventário à mão devolveria o
 * problema (ele envelheceria junto), e ler só o Zod não sabe o que falta.
 *
 * ## O que ele NÃO pega
 *
 * Campo aninhado — `necessidades[].limiteMs`, `ajustes[].taxaRps`. Estes são a
 * forma mais comum de perda e a mais silenciosa, porque a linha volta e parece
 * certa. Quem os cobre é o round-trip por igualdade estrutural em `app.test.ts`,
 * que compara o objeto INTEIRO. Os dois testes existem porque cobrem coisas
 * diferentes.
 */

/** Por que um campo do tipo não atravessa a borda. Nenhum hoje — e é preciso
 * escrever o motivo para que o primeiro seja uma decisão, e não um esquecimento. */
type NaoAtravessa = { naoAtravessa: string };

const CAMPOS_DA_QUEBRA = {
  titulo: "atravessa",
  demandInfo: "atravessa",
  time: "atravessa",
  diagrama: "atravessa",
  respostasItens: "atravessa",
  anexosContexto: "atravessa",
  produtoId: "atravessa",
  especificacao: "atravessa",
  necessidades: "atravessa",
  volumetria: "atravessa",
  excecoes: "atravessa",
  decisoes: "atravessa",
  percursos: "atravessa",
  documentoEscrito: "atravessa",
  documentoStatus: "atravessa",
  leiturasDispensadas: "atravessa",
  cenariosDeLentidao: "atravessa",
} satisfies Record<keyof Quebra, "atravessa" | NaoAtravessa>;

describe("a borda de /quebras alcança o tipo Quebra (SPEC-71 fatia C)", () => {
  it("todo campo que deveria atravessar está no Zod da borda", () => {
    const naBorda = new Set(Object.keys(corpoQuebra.shape));

    const faltando = Object.entries(CAMPOS_DA_QUEBRA)
      .filter(([, papel]) => papel === "atravessa")
      .map(([campo]) => campo)
      .filter((campo) => !naBorda.has(campo));

    // A mensagem importa tanto quanto a asserção: quem vir isto vermelho
    // precisa saber que o campo existe no tipo e não chega ao banco.
    expect(faltando, `campos do tipo Quebra que a borda descarta em silêncio: ${faltando.join(", ")}`).toEqual([]);
  });

  it("e a borda não conhece campo que o tipo não tem", () => {
    // A direção contrária: chave no Zod sem campo no tipo é resíduo de
    // renomeação, e aceita no corpo algo que o produto ignora — o cliente
    // manda, a rota responde 200, e nada acontece.
    const doTipo = new Set(Object.keys(CAMPOS_DA_QUEBRA));

    const sobrando = Object.keys(corpoQuebra.shape).filter((chave) => !doTipo.has(chave));

    expect(sobrando, `chaves aceitas pela borda que não existem em Quebra: ${sobrando.join(", ")}`).toEqual([]);
  });
});

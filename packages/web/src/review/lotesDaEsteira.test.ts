import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANATOMIA_DO_PROMPT_PIPELINE, PREAMBULO_PADRAO_POR_PAPEL } from "@gerador/aplicacao";
import { PAPEIS_PADRAO } from "../api/client";
import { RESPOSTA_NAO_GERADA, corpoDoLote, simularEsteira } from "./lotesDaEsteira";
import { TAM_LOTE_ESTEIRA, type ItemFilaEsteira } from "./useEsteiraDeAgentes";

/**
 * #299 — "simular a esteira sem gastar chamada de IA (e ver o prompt que
 * sairia)".
 *
 * O risco da feature inteira é a simulação virar uma SEGUNDA versão do prompt:
 * aí ela responde "o que eu acho que sairia", que é pior do que não existir —
 * dá confiança sem base. Estes testes existem para recusar isso.
 */
function item(n: number, papeis: string[]): ItemFilaEsteira {
  return {
    atividadeChave: `n${n}::ep0`,
    atividadeRotulo: `Serviço ${n} — POST /recurso`,
    contextoNo: `Serviço (Java/Spring Boot), nó n${n}`,
    placeholdersPorPapel: Object.fromEntries(
      papeis.map((p) => [p, [{ chave: `campo-${p}`, tech: "java", rotulo: `Campo do ${p}` }]])
    ),
  };
}

const papeis = PAPEIS_PADRAO;

describe("simularEsteira reproduz a corrida sem chamar o modelo (#299)", () => {
  it("o corpo do lote da simulação é o MESMO que a corrida real envia", () => {
    // A prova estrutural: a corrida real chama `corpoDoLote` (o hook foi
    // alterado para isso nesta mesma mudança) e a simulação também. Aqui se
    // afirma o contrato dessa função — se alguém voltar a montar o corpo à mão
    // dentro do hook, o teste seguinte (leitura do fonte) é que morde.
    const corpo = corpoDoLote("po", [item(1, ["po"])], new Map(), "épico X");
    expect(corpo).toEqual({
      contextoEpico: "épico X",
      itens: [
        {
          chave: "n1::ep0",
          rotulo: "Serviço 1 — POST /recurso",
          contextoNo: "Serviço (Java/Spring Boot), nó n1",
          placeholders: [{ chave: "campo-po", tech: "java", rotulo: "Campo do po" }],
          respostasAnteriores: [],
        },
      ],
    });
  });

  it("o hook da corrida real NÃO monta o corpo por conta própria", () => {
    // Teste de fonte, e de propósito: é a única forma de impedir que alguém
    // reintroduza a montagem manual dentro do hook e faça a simulação passar a
    // mentir em silêncio. O defeito que isto previne não tem sintoma visível —
    // os dois prompts só divergem, e ninguém compara.
    const fonte = readFileSync(resolve(import.meta.dirname, "useEsteiraDeAgentes.ts"), "utf-8");
    expect(fonte).toContain("corpoDoLote(papel.id, lote, acumuladas, contextoEpico, contextoDoProduto)");
    expect(fonte).not.toContain("itens: lote.map((item) => ({");
  });

  it("o prompt simulado tem todas as partes que a anatomia declara", () => {
    const [primeiro] = simularEsteira({
      fila: [item(1, ["po"])],
      papeis,
      contextoEpico: "Portabilidade, 5 dias.",
      // SPEC-53 — o contexto do produto é parte declarada da anatomia: a
      // simulação tem que mostrá-lo, senão ela mente sobre o que sairia.
      contextoDoProduto: "## Produto: Consignado",
    });
    const ausentes = ANATOMIA_DO_PROMPT_PIPELINE.filter((p) => !primeiro.prompt.includes(p.marcador))
      .map((p) => p.id)
      // Duas exceções, e as duas por motivo declarado:
      // - `respostas-anteriores` não existe no PRIMEIRO papel: não há anterior.
      // - o marcador de `preambulo` é o texto GENÉRICO (é o que a anatomia pode
      //   ancorar sem saber de papel); aqui o papel é o PO, então o preâmbulo é
      //   o dele — conferido logo abaixo, por identidade.
      .filter((id) => id !== "respostas-anteriores" && id !== "preambulo");
    expect(ausentes).toEqual([]);
    expect(primeiro.prompt).toContain(PREAMBULO_PADRAO_POR_PAPEL.po);
  });

  it("respeita a divisão em lotes de TAM_LOTE_ESTEIRA — é o que decide o custo", () => {
    const fila = Array.from({ length: TAM_LOTE_ESTEIRA + 2 }, (_, i) => item(i + 1, ["po"]));
    const doPo = simularEsteira({ fila, papeis }).filter((l) => l.papelId === "po");

    expect(doPo).toHaveLength(2);
    expect(doPo[0]).toMatchObject({ indice: 1, total: 2 });
    expect(doPo[0].chaves).toHaveLength(TAM_LOTE_ESTEIRA);
    expect(doPo[1].chaves).toHaveLength(2);
  });

  it("papel sem placeholder num item não gera lote — ausência de trabalho não é chamada", () => {
    const simulados = simularEsteira({ fila: [item(1, ["po"])], papeis });
    expect(simulados.map((l) => l.papelId)).toEqual(["po"]);
  });

  it("papel desativado não aparece — a simulação segue a config, não os 4 de fábrica", () => {
    const semQa = papeis.map((p) => (p.id === "qa" ? { ...p, ativo: false } : p));
    const simulados = simularEsteira({ fila: [item(1, ["po", "qa"])], papeis: semQa });
    expect(simulados.map((l) => l.papelId)).toEqual(["po"]);
  });

  it("o encadeamento aparece a partir do SEGUNDO papel, com marcador honesto", () => {
    const simulados = simularEsteira({ fila: [item(1, ["po", "arquiteto"])], papeis });
    const arquiteto = simulados.find((l) => l.papelId === "arquiteto")!;

    expect(arquiteto.prompt).toContain("O que os papéis anteriores já definiram pra este item");
    // Inventar um texto plausível aqui faria a pessoa dimensionar a janela de
    // contexto por um número falso. O marcador diz o que é.
    expect(arquiteto.prompt).toContain(RESPOSTA_NAO_GERADA);
  });

  it("reporta o tamanho em caracteres do que iria — o número que decide se cabe", () => {
    const [lote] = simularEsteira({ fila: [item(1, ["po"])], papeis });
    expect(lote.caracteres).toBe(lote.prompt.length);
    expect(lote.caracteres).toBeGreaterThan(200);
  });
});

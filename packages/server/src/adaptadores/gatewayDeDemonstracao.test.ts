import { describe, expect, it } from "vitest";
import type { DestinoResolvido, ItemGeradoSalvo } from "@gerador/aplicacao";
import {
  ATRASO_DA_DEMONSTRACAO_MS,
  criarAnexadorDeSpecDeDemonstracao,
  criarExportadorDeItensDeDemonstracao,
} from "./gatewayDeDemonstracao.js";

/**
 * SPEC-115 fatia D — o dublê que espera e devolve sucesso.
 *
 * O `dormir` é injetado em todos os testes: uma suíte que espera 20 segundos de
 * verdade não prova nada além de paciência. O que se afirma aqui é o
 * COMPORTAMENTO — quanto tempo ele pede, por item, e que nada é chamado.
 */
const DESTINO: DestinoResolvido = {
  id: "demo-spec",
  operacao: "specDoItem",
  endpoint: "",
  rotulo: "Agente de demonstração",
  cabecalhos: {},
  metodo: "POST",
  envelope: "",
  espaco: "",
  demonstracao: true,
};

function espiaoDeEspera() {
  const esperas: number[] = [];
  return {
    esperas,
    dormir: async (ms: number) => {
      esperas.push(ms);
    },
  };
}

function item(chave: string): ItemGeradoSalvo {
  return {
    id: chave,
    quebraId: "q1",
    chave,
    titulo: `Item ${chave}`,
    tipo: "Task",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: `### ${chave}`,
    pendencias: 0,
    sugestoes: 0,
    estado: "gerado",
    linkExterno: null,
    specAnexada: false,
    specEnviadaEm: null,
    specErro: null,
    criadoEm: "2026-09-10T10:00:00.000Z",
  };
}

describe("o anexador de demonstração", () => {
  it("devolve sucesso para TODO item, determinístico", async () => {
    // Determinístico de propósito: um dublê que falha às vezes pareceria mais
    // realista e deixaria de provar o que ele existe para provar — a tela e a
    // experiência prontas. E quem assistisse não saberia de quem é o erro.
    const { dormir } = espiaoDeEspera();
    const anexador = criarAnexadorDeSpecDeDemonstracao(DESTINO, { dormir });

    const resultados = await anexador.anexar([
      { chave: "a", chaveExterna: "https://t/A-1", conteudo: "# Spec A" },
      { chave: "b", chaveExterna: "https://t/B-2", conteudo: "# Spec B" },
    ]);

    expect(resultados).toEqual([{ chave: "a" }, { chave: "b" }]);
  });

  it("espera POR ITEM, e não uma vez pelo lote — é o que torna o pipeline visível", async () => {
    /**
     * A SPEC-98 §3.2 recusou o arranjo em FASES ("sobe todas as histórias,
     * depois todas as specs") porque com um agente lento ninguém vê nada até o
     * fim. Uma espera única pelo lote é o mesmo defeito: os N itens acendem
     * juntos no fim, e a tela não tem o que mostrar no meio.
     */
    const { esperas, dormir } = espiaoDeEspera();
    const anexador = criarAnexadorDeSpecDeDemonstracao(DESTINO, { dormir });

    await anexador.anexar([
      { chave: "a", chaveExterna: "https://t/A-1", conteudo: "# A" },
      { chave: "b", chaveExterna: "https://t/B-2", conteudo: "# B" },
      { chave: "c", chaveExterna: "https://t/C-3", conteudo: "# C" },
    ]);

    expect(esperas).toEqual([ATRASO_DA_DEMONSTRACAO_MS, ATRASO_DA_DEMONSTRACAO_MS, ATRASO_DA_DEMONSTRACAO_MS]);
  });

  it("os ~20 segundos que o usuário pediu são o padrão, não um número escondido", () => {
    expect(ATRASO_DA_DEMONSTRACAO_MS).toBe(20_000);
  });

  it("lote vazio não espera nada — não há demonstração de coisa nenhuma", async () => {
    const { esperas, dormir } = espiaoDeEspera();
    await criarAnexadorDeSpecDeDemonstracao(DESTINO, { dormir }).anexar([]);
    expect(esperas).toEqual([]);
  });
});

describe("o exportador de demonstração", () => {
  it("devolve um link estável derivado da chave — reexportar dá o mesmo endereço", async () => {
    // `Atividade.chave` é estável entre regenerações (SPEC-41), e o dublê se
    // comporta como um tracker se comportaria: o mesmo item, o mesmo endereço.
    const { dormir } = espiaoDeEspera();
    const exportador = criarExportadorDeItensDeDemonstracao(DESTINO, { dormir });

    const primeira = await exportador.exportar([item("busca-por-sku")]);
    const segunda = await exportador.exportar([item("busca-por-sku")]);

    expect(primeira).toEqual(segunda);
  });

  it("o link aponta para um domínio que NUNCA resolve, e isso é a honestidade da peça", async () => {
    /**
     * `.invalid` é o TLD reservado (RFC 2606) que não aponta para lugar nenhum.
     * Um link de mentira que abrisse alguma coisa seria pior: confessar no
     * primeiro clique é o que impede a demonstração de se passar pelo real —
     * a recusa central da SPEC-115 §2.
     */
    const { dormir } = espiaoDeEspera();
    const [resultado] = await criarExportadorDeItensDeDemonstracao(DESTINO, { dormir }).exportar([item("a")]);

    expect(resultado).toEqual({ chave: "a", linkExterno: "https://demonstracao.invalid/a" });
  });
});

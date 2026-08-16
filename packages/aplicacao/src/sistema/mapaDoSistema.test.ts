import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "@gerador/engine";
import type { PapelConfigurado } from "../config/normalizacao.js";
import { montarMapaDoSistema } from "./mapaDoSistema.js";

function papel(p: Partial<PapelConfigurado> & { id: string }): PapelConfigurado {
  return { nome: p.id, grupo: "po", ativo: true, contextos: [], ...p };
}

const REGRAS: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {
    Backend: {
      checklistTecnico: [
        { texto: "timeout", contextos: [], checagem: { campo: "timeoutMs", operador: "lte", valor: 500 } },
        { texto: "sem régua", contextos: [] },
      ],
      testes: [{ tipo: "unitário", validacao: "x", dev: true, hlg: false, contextos: [] }],
    },
  },
  percursos: [{ texto: "orçamento", checagem: { campo: "timeoutMs", agregacao: "soma", operador: "lte", valor: 2000 } }],
};

describe("montarMapaDoSistema — a ferramenta lida a partir da própria config (SPEC-59 fatia A)", () => {
  it("a esteira vira SEQUÊNCIA, com o que cada papel escreve", () => {
    // A lista escondia as duas coisas: que eles rodam em ordem, e que cada um
    // é responsável por uma parte do item.
    const mapa = montarMapaDoSistema({
      papeis: [papel({ id: "po", nome: "PO", grupo: "po" }), papel({ id: "qa", nome: "QA", grupo: "qa" })],
      temCredencialDeIa: true,
    });

    expect(mapa.agentes.map((a) => [a.ordem, a.nome, a.escreve])).toEqual([
      [1, "PO", "história e critérios de aceite"],
      [2, "QA", "regras de teste e cenários"],
    ]);
  });

  it("papel ativo SEM modelo configurado é o defeito silencioso — e o mapa o nomeia", () => {
    // Hoje só se descobre olhando o item sair vazio.
    const mapa = montarMapaDoSistema({ papeis: [papel({ id: "po" })], temCredencialDeIa: false });

    expect(mapa.agentes[0].estado).toBe("sem-credencial");
    expect(mapa.avisos.join(" ")).toContain("não tem com quem falar");
  });

  it("papel DESLIGADO não é 'sem credencial' — a ordem da checagem importa", () => {
    // Dizer "sem credencial" num papel desligado mandaria a pessoa configurar
    // IA para resolver um problema que ela mesma criou.
    const mapa = montarMapaDoSistema({ papeis: [papel({ id: "po", ativo: false })], temCredencialDeIa: false });

    expect(mapa.agentes[0].estado).toBe("desligado");
    expect(mapa.avisos.join(" ")).not.toContain("não tem com quem falar");
  });

  it("todos desligados é um aviso próprio, diferente de não ter papel nenhum", () => {
    const semPapel = montarMapaDoSistema({ temCredencialDeIa: true });
    const todosDesligados = montarMapaDoSistema({
      papeis: [papel({ id: "po", ativo: false })],
      temCredencialDeIa: true,
    });

    expect(semPapel.avisos.join(" ")).toContain("Nenhum papel na esteira");
    expect(todosDesligados.avisos.join(" ")).toContain("Todos os papéis estão desligados");
  });

  it("as regras aparecem por tech, separando o que é TEXTO do que o motor confere", () => {
    const mapa = montarMapaDoSistema({ regras: REGRAS, temCredencialDeIa: true });

    expect(mapa.regras).toEqual([{ tech: "Backend", requisitos: 2, conferiveis: 1, testes: 1 }]);
    expect(mapa.regrasDePercurso).toBe(1);
  });

  it("regras que são só texto viram aviso — é o §244 na cara de quem configura", () => {
    // Config cheia de checklist e vazia de checagem parecia saudável, e a
    // conformidade nascia dormente.
    const soTexto: RegrasConfig = {
      tipos: [],
      tamanhos: [],
      porTech: { Backend: { checklistTecnico: [{ texto: "algo", contextos: [] }], testes: [] } },
      percursos: [{ texto: "x", checagem: { agregacao: "saltos", operador: "lte", valor: 3 } }],
    };

    const mapa = montarMapaDoSistema({ regras: soTexto, temCredencialDeIa: true });

    expect(mapa.avisos.join(" ")).toContain("Nenhum padrão conferível");
  });

  it("sem régua de percurso, o mapa diz o que deixa de ser medido", () => {
    const mapa = montarMapaDoSistema({ regras: { tipos: [], tamanhos: [], porTech: {} }, temCredencialDeIa: true });

    expect(mapa.avisos.join(" ")).toContain("Nenhuma régua de percurso");
  });

  it("o laço do PDCA só acende quando tem o que processar", () => {
    expect(montarMapaDoSistema({ feedbacksAbertos: 0 }).pdca.temTrabalho).toBe(false);
    expect(montarMapaDoSistema({ feedbacksAbertos: 3 }).pdca).toEqual({ feedbacksAbertos: 3, temTrabalho: true });
  });

  it("entrada vazia não quebra — instalação nova é caso de uso, não erro", () => {
    const mapa = montarMapaDoSistema();

    expect(mapa.agentes).toEqual([]);
    expect(mapa.regras).toEqual([]);
    expect(mapa.avisos.length).toBeGreaterThan(0);
  });
});

/**
 * SPEC-60 fatia B (§265) — o estado que faltava, agora vindo de linha gravada.
 */
describe("montarMapaDoSistema — falhou na última execução", () => {
  const PO = papel({ id: "po", nome: "PO", grupo: "po" });
  const FALHA = { papel: "po", ok: false, em: "2026-08-16T10:00:00.000Z", duracaoMs: 1200, erro: "502 do gateway" };

  it("papel cuja última execução falhou aparece como `falhou`", () => {
    const mapa = montarMapaDoSistema({ papeis: [PO], temCredencialDeIa: true, execucoes: [FALHA] });

    expect(mapa.agentes[0].estado).toBe("falhou");
    expect(mapa.agentes[0].ultimaExecucao).toEqual(FALHA_SEM_PAPEL);
  });

  it("execução que deu certo devolve o papel a `ativo`, e a última fica visível", () => {
    // O avatar tem que APAGAR o vermelho quando a próxima roda bem — um estado
    // que só acende é um alarme que se aprende a ignorar.
    const mapa = montarMapaDoSistema({
      papeis: [PO],
      temCredencialDeIa: true,
      execucoes: [{ papel: "po", ok: true, em: "2026-08-16T11:00:00.000Z", duracaoMs: 900 }],
    });

    expect(mapa.agentes[0].estado).toBe("ativo");
    expect(mapa.agentes[0].ultimaExecucao?.duracaoMs).toBe(900);
  });

  it("desligado e sem-credencial ganham de `falhou` — nessa ordem", () => {
    // Falha antiga de papel hoje desligado não é notícia; e sem credencial a
    // falha é consequência, não causa. Dizer "falhou" nos dois casos mandaria a
    // pessoa investigar o lugar errado.
    const desligado = montarMapaDoSistema({
      papeis: [papel({ id: "po", ativo: false })],
      temCredencialDeIa: true,
      execucoes: [FALHA],
    });
    const semCredencial = montarMapaDoSistema({ papeis: [PO], temCredencialDeIa: false, execucoes: [FALHA] });

    expect(desligado.agentes[0].estado).toBe("desligado");
    expect(semCredencial.agentes[0].estado).toBe("sem-credencial");
  });

  it("o rastro casa pelo ID do papel, não pelo nome", () => {
    // Casar por nome quebraria no dia em que alguém renomeasse o papel: o
    // rastro ficaria órfão e o avatar voltaria a verde sem nada ter melhorado.
    const mapa = montarMapaDoSistema({
      papeis: [papel({ id: "po", nome: "Product Owner" })],
      temCredencialDeIa: true,
      execucoes: [{ ...FALHA, papel: "Product Owner" }],
    });

    expect(mapa.agentes[0].estado).toBe("ativo");
    expect(mapa.agentes[0].ultimaExecucao).toBeUndefined();
  });

  it("papel que falhou vira AVISO — falha que não se anuncia sai como item incompleto", () => {
    const mapa = montarMapaDoSistema({ papeis: [PO], temCredencialDeIa: true, execucoes: [FALHA] });

    expect(mapa.avisos.some((a) => a.includes("falhou") && a.includes("PO"))).toBe(true);
  });

  it("sem rastro nenhum, o mapa é exatamente o de antes", () => {
    // A régua de toda dimensão nova: quem não a usa não é acusado por ela.
    const mapa = montarMapaDoSistema({ papeis: [PO], temCredencialDeIa: true });

    expect(mapa.agentes[0].estado).toBe("ativo");
    expect(mapa.agentes[0].ultimaExecucao).toBeUndefined();
    expect(mapa.avisos.some((a) => a.includes("falhou"))).toBe(false);
  });
});

const FALHA_SEM_PAPEL = { ok: false, em: "2026-08-16T10:00:00.000Z", duracaoMs: 1200, erro: "502 do gateway" };

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECURSOS, RECURSOS_SEM_ROTA, SECOES_DE_REGRAS, secoesDeRegrasAlteradas } from "./permissoes.js";

/**
 * O teste que faltava — e cuja falta é a história desta SPEC.
 *
 * A Fase 1 entregou o mecanismo de RBAC inteiro e aplicou em UMA rota, como
 * piloto. Aí foi marcada como concluída. Por várias versões, 14 dos 16 recursos
 * podiam ser concedidos e negados na tela de acessos sem que nenhuma rota
 * perguntasse: a permissão existia, era gravada, era resolvida — e ignorada.
 *
 * Nada apontava, porque o modo de falha de uma autorização ausente é o silêncio.
 * A suíte ficava verde, a UI mostrava a matriz completa, e o 403 simplesmente
 * nunca vinha.
 *
 * Este teste lê o CÓDIGO-FONTE das rotas, no mesmo espírito do
 * `paridade.sanity.test.ts`: é a diferença entre confiar que alguém lembrou e
 * não deixar esquecer. Acrescentar um recurso ao enum deixa de ser grátis —
 * ou ele é exigido em algum lugar, ou entra em `RECURSOS_SEM_ROTA` com motivo
 * escrito. A omissão continua possível; ela só não pode mais ser silenciosa.
 */
const DIR_ROTAS = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");

function fontesDasRotas(): string {
  return readdirSync(DIR_ROTAS)
    .filter((nome) => nome.endsWith(".ts") && !nome.includes(".test."))
    .map((nome) => readFileSync(join(DIR_ROTAS, nome), "utf-8"))
    .join("\n");
}

describe("SPEC-28 §10.1 — todo recurso é exigido por alguma rota", () => {
  it("nenhum recurso falha aberto sem estar declarado como tal", () => {
    const fontes = fontesDasRotas();
    const secoesDeRegras = Object.values(SECOES_DE_REGRAS) as string[];

    const semCobertura = RECURSOS.filter((recurso) => {
      if (RECURSOS_SEM_ROTA.includes(recurso)) return false;
      // Os quatro `regras.*` não aparecem literalmente numa rota: quem os exige
      // é `secoesDeRegrasAlteradas`, chamado por `config.ts` depois de ler o
      // corpo — porque os quatro viajam dentro do mesmo documento.
      if (secoesDeRegras.includes(recurso)) return !fontes.includes("secoesDeRegrasAlteradas");
      return !fontes.includes(`"${recurso}"`);
    });

    expect(semCobertura).toEqual([]);
  });

  it("`RECURSOS_SEM_ROTA` só aceita recurso que existe — lista não envelhece em silêncio", () => {
    for (const recurso of RECURSOS_SEM_ROTA) {
      expect(RECURSOS).toContain(recurso);
    }
  });
});

/**
 * A delegação que o usuário pediu — "padrões técnicos para um setor, checklists
 * de processo para outro" — depende inteiramente desta função, porque as quatro
 * seções moram no MESMO documento `regras`, salvo inteiro num `PUT` só.
 */
describe("secoesDeRegrasAlteradas — quem mexeu em quê dentro de `regras`", () => {
  const base = {
    tipos: ["Story"],
    tamanhos: ["P"],
    porTech: {
      java: {
        checklistTecnico: [{ texto: "definir pool", contextos: [] }],
        checklistProcesso: [{ texto: "abrir mudança", contextos: [] }],
        testes: [{ nome: "contrato" }],
        volumetria: { contextos: [] },
      },
    },
  };

  it("documento idêntico não exige permissão nenhuma", () => {
    expect(secoesDeRegrasAlteradas(base, structuredClone(base))).toEqual([]);
  });

  it("mexer só no checklist de processo exige só `regras.checklistProcesso`", () => {
    const depois = structuredClone(base);
    depois.porTech.java.checklistProcesso = [{ texto: "abrir mudança no ServiceNow", contextos: [] }];
    expect(secoesDeRegrasAlteradas(base, depois)).toEqual(["regras.checklistProcesso"]);
  });

  it("é isto que permite salvar a aba inteira sem poder editar tudo", () => {
    // O cenário real da UI: a tela de regras manda o documento COMPLETO de
    // volta, não um patch. Se a checagem fosse "tocou em `regras`", quem cuida
    // do processo levaria 403 por causa das seções que nem editou.
    const depois = structuredClone(base);
    depois.porTech.java.checklistProcesso.push({ texto: "avisar o time de dados", contextos: [] });
    const alteradas = secoesDeRegrasAlteradas(base, depois);
    expect(alteradas).not.toContain("regras.checklistTecnico");
    expect(alteradas).not.toContain("regras.testes");
  });

  it("ordem das chaves não conta como alteração — senão a UI levaria 403 sem ter editado", () => {
    const depois = {
      porTech: { java: { ...base.porTech.java } },
      tamanhos: base.tamanhos,
      tipos: base.tipos,
    };
    expect(secoesDeRegrasAlteradas(base, depois)).toEqual([]);
  });

  it("tech nova só exige as seções que ela traz", () => {
    const depois = structuredClone(base);
    (depois.porTech as Record<string, unknown>).kafka = { testes: [{ nome: "consumo" }] };
    expect(secoesDeRegrasAlteradas(base, depois)).toEqual(["regras.testes"]);
  });

  it("mexer na taxonomia compartilhada exige as quatro — `tipos`/`tamanhos` afetam todas", () => {
    const depois = structuredClone(base);
    depois.tipos = ["Story", "Spike"];
    expect(secoesDeRegrasAlteradas(base, depois).sort()).toEqual(
      [...Object.values(SECOES_DE_REGRAS)].sort()
    );
  });

  it("documento gravado ainda vazio (organização nova) não trava a primeira edição indevidamente", () => {
    // `obter` devolve o template da versão quando não há nada salvo; comparar
    // contra `undefined` não pode explodir.
    expect(secoesDeRegrasAlteradas(undefined, base).sort()).toEqual(
      [...Object.values(SECOES_DE_REGRAS)].sort()
    );
  });
});

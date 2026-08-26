import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "./types.js";
import type { Diagrama, No } from "../model/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import { camposVisiveis } from "../spec/campos.js";
import { derivar } from "../derive/derivar.js";

/**
 * §289 — o MOTOR de regras como componente do desenho.
 *
 * Relato: *"é muito comum inclusive na nossa implementação que o fluxo seja
 * implementado em um motor e que existam vários"*. O catálogo já tinha
 * "Regra de Negócio" (a regra solta) e "Fluxo Decisão (FICO)" (o fluxo de um
 * produto específico), e o conceito de motor só existia como texto livre num
 * campo do FICO — `motorPadrao`.
 *
 * O tipo é UM, e o que separa um motor do outro é o **domínio**: é o padrão do
 * resto do catálogo, onde o tipo é a categoria técnica ("Tabela SQL") e o nó é
 * a instância. Sete tipos de paleta seriam sete cópias do mesmo `spec`, e
 * divergiriam na primeira mudança.
 *
 * Este teste roda as funções REAIS sobre a config REAL — não uma
 * reimplementação —, pela mesma razão do `coberturaConfigPadrao`: se a regra
 * mudar, o teste acompanha em vez de mentir.
 */
const config = readConfigFile<DiagramaConfig>("diagrama.example.json");
const motor = config.nodeTypes.motor;

function no(respostas: Record<string, unknown>, status: "novo" | "existente" = "novo"): No {
  const spec = Object.fromEntries(
    Object.entries(respostas).map(([k, valor]) => [k, { valor, origem: "manual" }])
  );
  return { id: "m1", type: "motor", label: "Motor de Preço", x: 0, y: 0, status, spec, specNA: {} } as unknown as No;
}

describe("Motor de Regras — o tipo", () => {
  it("existe, é Backend e cai no contexto que já tem régua de auditoria e versionamento", () => {
    // `Backend-regras` não foi escolhido por parecer certo: é o contexto cujo
    // checklist já cobra "descrever os motores, rulesets ou fluxos de decisão
    // modificados" e o versionamento das regras. Sem isso, o tipo nasceria sem
    // ciclo de teste — a lacuna que o `coberturaConfigPadrao` existe para pegar.
    expect(motor.label).toBe("Motor de Regras");
    expect(motor.techs).toEqual(["Backend"]);
    expect(motor.contextos).toEqual(["Backend-regras"]);
  });

  it("os domínios do relato estão prontos, e há escape para os que não estão", () => {
    // A lista é o vocabulário que o time já usa. O "outro" existe porque
    // domínio de negócio é coisa de casa: fraude e antilavagem não estão aqui
    // e não deveriam exigir editar configuração para caber.
    const dominio = motor.spec.find((c) => c.key === "dominio")!;
    expect(dominio.required).toBe(true);
    expect(dominio.options).toEqual([
      "Precificação",
      "Renda",
      "Catálogo de produto",
      "Elegibilidade de produto",
      "Elegibilidade de crédito",
      "Configuração e estratégia de produto",
      "Limites",
      "outro",
    ]);
  });

  it("'qual domínio' só aparece quando o domínio é 'outro' — pergunta morta não se faz", () => {
    // Roda o avaliador de condições de verdade. Um `when` que o motor de
    // condições não soubesse avaliar deixaria o campo visível SEMPRE, e todo
    // motor de precificação nasceria com uma pergunta sem sentido pendente.
    const visivelCom = (dominio: string) =>
      camposVisiveis(motor.spec, no({ dominio }), []).map((c) => c.key);

    expect(visivelCom("Precificação")).not.toContain("dominioOutro");
    expect(visivelCom("outro")).toContain("dominioOutro");
  });

  it("o plano de migração só é cobrado de motor que já existe", () => {
    expect(camposVisiveis(motor.spec, no({}, "novo"), []).map((c) => c.key)).not.toContain("migracao");
    expect(camposVisiveis(motor.spec, no({}, "existente"), []).map((c) => c.key)).toContain("migracao");
  });

  it("cobra as três perguntas que só aparecem em produção se não forem feitas aqui", () => {
    // Quem publica a regra (o motor é compartilhado, quem desenha o fluxo
    // raramente é quem o altera), o que acontece com decisões já tomadas, e o
    // que o fluxo faz quando o motor não responde.
    const obrigatorios = motor.spec.filter((c) => c.required).map((c) => c.key);
    expect(obrigatorios).toEqual(
      expect.arrayContaining(["donoDasRegras", "versionamento", "fallback"])
    );
  });

  it("aceita ser chamado e ser orquestrado — é assim que ele entra num caminho", () => {
    // Sem aresta de entrada válida o motor viraria um retângulo solto, e as
    // réguas de caminho (SPEC-64) nunca o atravessariam.
    expect(config.edgeRules.motor.valid).toContain("http");
    expect(config.edgeRules.motor.default).toBe("http");
  });
});

describe("Motor de Regras — a derivação", () => {
  const diagrama = {
    nodes: [
      { ...no({ nome: "Preço", dominio: "Precificação", donoDasRegras: "time-pricing" }), id: "m1" },
      { ...no({ nome: "Limites", dominio: "Limites", donoDasRegras: "time-credito" }), id: "m2", label: "Motor de Limites" },
    ],
    edges: [],
  } as unknown as Diagrama;

  it("dois motores no mesmo desenho viram dois itens — é o 'existem vários' do relato", () => {
    const atividades = derivar(diagrama, config, {});
    const doMotor = atividades.filter((a) => a.origem?.nodeId?.startsWith("m"));

    // `::criacao` é o sufixo genérico: `derives: "motor"` não tem regra
    // dedicada no `derivar`, e não precisa ter — criar um motor é criar um
    // componente, e a diferença entre eles está no `specResumo`, não na forma
    // do item.
    expect(doMotor).toHaveLength(2);
    expect(doMotor.map((a) => a.chave)).toEqual(["m1::criacao", "m2::criacao"]);
  });

  it("o item carrega o domínio e o dono da regra — sem eles, dois motores viram dois cards iguais", () => {
    const atividades = derivar(diagrama, config, {});
    const item = atividades.find((a) => a.chave === "m1::criacao")!;

    expect(item.specResumo).toEqual({ dominio: "Precificação", donoDasRegras: "time-pricing" });
    expect(item.contextos).toEqual(["Backend-regras"]);
  });
});

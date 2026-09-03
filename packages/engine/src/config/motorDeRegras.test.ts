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
    //
    // SPEC-102 — `http` continua VÁLIDO e deixou de ser o DEFAULT. Motor de
    // regras exposto por HTTP existe e não vira proibição; o que mudou é o
    // palpite, porque quem chega num motor no caso comum é um fluxo de decisão
    // ou outro motor, e essa relação não atravessa a rede.
    expect(config.edgeRules.motor.valid).toContain("http");
    expect(config.edgeRules.motor.default).toBe("interno");
  });
});

/**
 * SPEC-102 — **a conexão que não é chamada.**
 *
 * Relato com print: `aprovacao-credito-fico → Motor de Regras` aparecia como
 * **HTTP**. Não era fixture errada — nenhum exemplo do repositório tem essa
 * aresta. Era a inferência de `edgeRules` (a mesma que faz serviço→exchange
 * nascer "publica") respondendo certo a uma tabela errada: não existia tipo de
 * aresta que significasse "invocação dentro do próprio motor".
 *
 * O dano não é o rótulo. `edgeTypes.http` carrega `timeoutMs`, `tentativas`,
 * `esperaEntreMs` e `disjuntor` — as perguntas de resiliência de uma chamada de
 * REDE. Chamar de `http` o que roda em processo faz a ferramenta cobrar as
 * quatro e faz a leitura de latência raciocinar sobre backoff de uma chamada
 * que nunca sai do processo.
 */
describe("SPEC-102 — a conexão interna", () => {
  const interno = config.edgeTypes.interno;

  it("existe, e a frase derivada dela é legível", () => {
    // O `verbo` não é enfeite: é o que `derivarEdgeGenerica` usa para montar
    // `${source.label} ${verbo} ${target.label}`.
    expect(interno.label).toBe("interno");
    expect(interno.verbo).toBe("decide internamente com");
  });

  it("NÃO pergunta timeout, tentativas nem disjuntor — é o defeito que a SPEC corrige", () => {
    // A ausência de `spec` é a afirmação inteira desta SPEC. Se alguém um dia
    // copiar o bloco do `http` para cá "por simetria", este teste cai — e é
    // exatamente para isso que ele existe.
    expect(interno.spec).toBeUndefined();

    const resiliencia = (config.edgeTypes.http.spec ?? []).map((c) => c.key);
    expect(resiliencia).toEqual(
      expect.arrayContaining(["timeoutMs", "tentativas", "esperaEntreMs", "disjuntor"])
    );
  });

  it("espera a resposta — invocação interna soma latência, só não soma latência de rede", () => {
    // `espera: false` faria a leitura da SPEC-65 tratar o caminho como
    // assíncrono e PARAR de somar um tempo que existe de verdade.
    expect(interno.espera).toBe(true);
  });

  it("o fluxo de decisão pode chegar no motor por dentro, e continua podendo ser chamado por fora", () => {
    expect(config.edgeRules.motor.valid).toContain("interno");
    // O caminho inverso (motor → fluxo) também acontece, e por isso `interno`
    // entra em `valid` do fico — mas o DEFAULT dele continua `http`, porque
    // quem chega num fluxo de decisão no caso comum é uma aplicação de fora.
    expect(config.edgeRules.fico.valid).toContain("interno");
    expect(config.edgeRules.fico.default).toBe("http");
  });
});

/**
 * SPEC-102 §7.2 — **a unidade de medida.**
 *
 * Decisão do usuário: *"precisa de nós que desdobra em tasks, assim mantemos a
 * unidade de medida"*.
 *
 * O campo de texto `fico.spec.motorPadrao` nomeia o motor e **não produz item
 * nenhum** — a derivação só olha nós e arestas. Motor declarado em texto é
 * trabalho que não aparece no backlog. É por isso que fazer a conexão nascer
 * `interno` importa além do rótulo: ela pressupõe um nó `motor` de verdade, e
 * nó desdobra.
 */
describe("SPEC-102 — o desenho do relato desdobra em trabalho contável", () => {
  const diagrama = {
    nodes: [
      {
        id: "f1",
        type: "fico",
        label: "aprovacao-credito-fico",
        x: 0,
        y: 0,
        status: "novo",
        spec: { nome: { valor: "aprovacao-credito-fico", origem: "manual" } },
        specNA: {},
      },
      {
        id: "m1",
        type: "motor",
        label: "Motor de Regras",
        x: 300,
        y: 0,
        status: "novo",
        spec: { nome: { valor: "Motor de Regras", origem: "manual" }, dominio: { valor: "Limites", origem: "manual" } },
        specNA: {},
      },
    ],
    edges: [{ id: "e1", source: "f1", target: "m1", type: "interno" }],
  } as unknown as Diagrama;

  it("o fluxo, o motor e a conexão entre eles viram três itens", () => {
    const atividades = derivar(diagrama, config, {});
    const chaves = atividades.map((a) => a.chave);

    // O nó do fluxo, o nó do motor e a aresta. Se a aresta deixasse de gerar
    // atividade (`gerarAtividade: false`), o trabalho de integrar os dois
    // sumiria do backlog sem nada acusar.
    expect(chaves).toEqual(expect.arrayContaining(["f1::criacao", "m1::criacao", "e1::interno"]));
  });

  it("a frase do item diz o que a conexão é — e não diz HTTP", () => {
    const atividades = derivar(diagrama, config, {});
    const daConexao = atividades.find((a) => a.chave === "e1::interno")!;

    expect(daConexao.descricao).toBe("aprovacao-credito-fico decide internamente com Motor de Regras.");
    expect(daConexao.descricao).not.toContain("HTTP");
    // Contexto vem do destino (o motor), que é o recurso sendo usado.
    expect(daConexao.contextos).toEqual(["Backend-regras"]);
  });

  it("integrar depende de os dois lados existirem — a ordem sai de graça", () => {
    const atividades = derivar(diagrama, config, {});
    const daConexao = atividades.find((a) => a.chave === "e1::interno")!;

    // Os dois nós são `novo`, então a conexão depende da criação de ambos. É o
    // que faz `resolverDependencias` colocá-la depois dos dois.
    expect(daConexao.dependencias).toEqual([
      { type: "dependent", alvoChave: "f1::criacao" },
      { type: "dependent", alvoChave: "m1::criacao" },
    ]);
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

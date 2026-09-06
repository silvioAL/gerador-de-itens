import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CenarioDeLentidao, Diagrama, DiagramaConfig, VolumetriaDaDemanda } from "@gerador/engine";
import { executarFuncao } from "@gerador/aplicacao";
import { BancadaDeEnsaios, type LeituraDoEnsaio } from "./BancadaDeEnsaios";

/**
 * SPEC-107 G4 — o `executar` do teste É o executor real da aplicação (o mesmo
 * que a fiação roda no servidor): os números daqui são os números de lá, e um
 * desencontro entre a bancada e o executor quebraria AQUI, não em produção.
 */
function executarPeloExecutor(diag: Diagrama, volumetria?: VolumetriaDaDemanda) {
  return async (cenario?: CenarioDeLentidao): Promise<LeituraDoEnsaio> => {
    const { leitura } = executarFuncao(
      "ensaio",
      { desenho: { diagrama: diag, volumetria }, ...(cenario ? { cenario } : {}) },
      { diagramaConfig: config }
    ) as { leitura: LeituraDoEnsaio };
    return leitura;
  };
}

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
    external: {
      label: "API Externa",
      derives: "external",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }],
    },
  },
  edgeTypes: {
    http: { label: "HTTP", espera: true, spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }] },
  },
  edgeRules: {},
};

function diagrama(): Diagrama {
  return {
    nodes: [
      { id: "api", type: "service", label: "api", x: 0, y: 0, status: "novo", spec: {}, specNA: {} },
      {
        id: "bureau",
        type: "external",
        label: "bureau",
        x: 0,
        y: 0,
        status: "novo",
        spec: { timeoutMs: { valor: 2000, origem: "manual" } },
        specNA: {},
      },
    ],
    edges: [
      {
        id: "e1",
        source: "api",
        target: "bureau",
        type: "http",
        spec: { timeoutMs: { valor: 1000, origem: "manual" } },
      },
    ],
  } as unknown as Diagrama;
}

function montar(cenarios: CenarioDeLentidao[] = [], props: Partial<React.ComponentProps<typeof BancadaDeEnsaios>> = {}) {
  const onMudar = vi.fn();
  const diag = props.diagrama ?? diagrama();
  render(
    <BancadaDeEnsaios
      diagrama={diag}
      config={config}
      cenarios={cenarios}
      onMudar={onMudar}
      onVoltar={vi.fn()}
      executar={executarPeloExecutor(diag, props.volumetria)}
      {...props}
    />
  );
  return { onMudar };
}

/**
 * SPEC-66 fatias B, C e D — a bancada de ensaio.
 */
describe("BancadaDeEnsaios — a âncora e o Δ", () => {
  it("a linha de HOJE fica na tabela — sem a referência, todo número é solto", async () => {
    montar();

    // 1000 (conexão) + 2000 (bureau) = 3000. O número chega pela FIAÇÃO (G4),
    // então a linha existe já e o valor aparece quando a medição volta.
    await waitFor(() => expect(screen.getByTestId("linha-hoje")).toHaveTextContent("3,0 s"));
  });

  it("o cenário mostra a resposta, o Δ contra hoje, e QUEM domina", async () => {
    montar([
      { id: "c1", nome: "bureau 3×", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", fator: 3 }] },
    ]);

    const linha = await screen.findByTestId("linha-c1");
    // 1000 + 6000 = 7000, e o Δ é +4000. A linha nasce com "—" e o número
    // chega quando a medição da fiação volta — daí a espera pelo conteúdo.
    await waitFor(() => expect(linha).toHaveTextContent("7,0 s"));
    expect(linha).toHaveTextContent("+4,0 s");
    // O total diz que dói; esta coluna diz onde.
    expect(linha).toHaveTextContent("bureau");
  });

  it("cenário que melhora aparece em VERDE e com sinal de menos", async () => {
    montar([{ id: "c1", nome: "sla curto", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", ms: 500 }] }]);

    // Hoje: 1000 (conexão) + 2000 (bureau) = 3000. Com o bureau em 500:
    // 1000 + 500 = 1500, então o Δ é −1,5 s.
    await waitFor(() => expect(screen.getByTestId("linha-c1")).toHaveTextContent("−1,5 s"));
  });
});

describe("BancadaDeEnsaios — mexer sem IA nenhuma", () => {
  it("criar um cenário é escrever o nome e apertar — é o caminho principal", () => {
    // A sugestão é atalho; capacidade que só existe com IA ligada é capacidade
    // que metade dos times não tem.
    const { onMudar } = montar();

    fireEvent.change(screen.getByLabelText("Nome do cenário"), { target: { value: "Bureau degradado" } });
    fireEvent.click(screen.getByTestId("criar-cenario"));

    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({ id: "cen-bureau-degradado", nome: "Bureau degradado", origem: "manual" }),
    ]);
  });

  it("o slider muda o fator, e é o que faz o número acompanhar o gesto", async () => {
    const { onMudar } = montar([
      { id: "c1", nome: "x", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", fator: 2 }] },
    ]);

    fireEvent.click(await screen.findByTestId("ajustar-c1"));
    fireEvent.change(screen.getByTestId("fator-bureau"), { target: { value: "5" } });

    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({ ajustes: [{ tipo: "no", id: "bureau", fator: 5, ms: undefined }] }),
    ]);
  });

  it("sem tempo nenhum no desenho, DIZ isso — melhor que uma tabela de zeros", () => {
    // §248: uma tabela de zeros pareceria medição, e não é.
    montar([], { diagrama: { nodes: [], edges: [] } as unknown as Diagrama });

    expect(screen.getByTestId("ensaios-sem-tempo")).toBeInTheDocument();
  });
});

describe("BancadaDeEnsaios — a proposta do modelo", () => {
  const sugerido: CenarioDeLentidao = {
    id: "c-ia",
    nome: "bureau em pico",
    porque: "fim de mês concentra consulta",
    origem: "sugerido",
    aceito: false,
    ajustes: [{ tipo: "no", id: "bureau", fator: 4 }],
  };

  it("chega marcado como sugerido e POR AVALIAR — e por avaliar cobra", async () => {
    // §69 §4: todo ensaio cobra. Se só o assumido cobrasse, o débito que
    // ninguém olhou continuaria invisível — que é o inconsciente que a SPEC
    // existe para acabar.
    montar([sugerido]);

    const linha = await screen.findByTestId("linha-c-ia");
    expect(linha).toHaveTextContent("sugerido");
    expect(within(linha).getByTestId("estado-por-avaliar")).toBeInTheDocument();
    expect(within(linha).getByTestId("assumir-c-ia")).toBeInTheDocument();
  });

  it("o porquê vem junto — nome bonito sem circunstância ninguém sabe avaliar", async () => {
    montar([sugerido]);

    expect(await screen.findByTestId("linha-c-ia")).toHaveTextContent("fim de mês concentra consulta");
  });

  it("assumir EXIGE motivo — sem ele isto seria um botão de silenciar", async () => {
    // §242: sem o motivo escrito, quem abrir o documento depois não saberá se
    // aquilo foi decisão ou cansaço.
    const { onMudar } = montar([sugerido], { autor: "alguem@time" });

    fireEvent.click(await screen.findByTestId("assumir-c-ia"));
    const confirmar = screen.getByTestId("confirmar-assumir-c-ia");
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Por que assumir este débito"), {
      target: { value: "o pico dura 2h/mês e o negócio aceita a espera" },
    });
    fireEvent.click(confirmar);

    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "c-ia",
        estado: "aceito",
        debito: expect.objectContaining({
          motivo: "o pico dura 2h/mês e o negócio aceita a espera",
          autor: "alguem@time",
        }),
      }),
    ]);
  });

  it("sem quem sugira, o botão não aparece — e a tela segue inteira", () => {
    montar();

    expect(screen.queryByTestId("sugerir-cenarios")).toBeNull();
    expect(screen.getByTestId("criar-cenario")).toBeInTheDocument();
  });

  it("falha ao sugerir vira MOTIVO na tela, não botão inerte", () => {
    montar([], { onSugerir: () => Promise.reject(new Error("nenhum modelo configurado")) });

    fireEvent.click(screen.getByTestId("sugerir-cenarios"));

    return screen.findByTestId("erro-sugestao").then((el) => {
      expect(el).toHaveTextContent("nenhum modelo configurado");
    });
  });
});

describe("BancadaDeEnsaios — o desenho mudou debaixo do cenário", () => {
  it("ajuste sem alvo é DECLARADO, não engolido", async () => {
    // §57 — um ensaio que ignorou parte do que lhe pediram tem que dizer,
    // senão o número mente por omissão.
    montar([{ id: "c1", nome: "velho", origem: "manual", ajustes: [{ tipo: "no", id: "sumiu", fator: 3 }] }]);

    expect(await screen.findByTestId("sem-alvo-c1")).toHaveTextContent("não existem mais no desenho");
  });
});

/**
 * SPEC-68 — a repaginação: o ensaio deixa de ser só sobre tempo.
 *
 * O nome era "e se ficar lento?", e um nome estreito FECHA A PORTA para o que
 * cabe dentro: retry não é lentidão, pico de tráfego não é lentidão, disjuntor
 * desligado não é lentidão.
 */
describe("BancadaDeEnsaios — as condições que não são lentidão", () => {
  it("a tela se chama ENSAIAR ESTE DESENHO, e a frase diz o que cabe nela", () => {
    montar();

    // §305 — o nome deixou de ser uma pergunta sobre lentidão. A porta na faixa
    // de saúde diz a MESMA coisa: um nome só, e ele não fecha o escopo.
    expect(screen.getByText("Ensaiar este desenho")).toBeInTheDocument();
    expect(screen.getByTestId("tela-ensaios")).toHaveTextContent("pico de tráfego");
  });

  it("um ensaio de TAXA faz a saturação aparecer — e ela não é lentidão", async () => {
    // Lei de Little: 100 req/s × 1000 ms = 100 simultâneas; o pool declara 10.
    montar(
      [{ id: "c1", nome: "Black Friday", origem: "manual", ajustes: [{ tipo: "no", id: "api", taxaRps: 100 }] }],
      {
        diagrama: {
          nodes: [
            {
              id: "api",
              type: "service",
              label: "api",
              x: 0,
              y: 0,
              status: "novo",
              spec: { chamadasSimultaneas: { valor: 10, origem: "manual" } },
              specNA: {},
            },
            { id: "bureau", type: "external", label: "bureau", x: 0, y: 0, status: "novo", spec: {}, specNA: {} },
          ],
          edges: [
            {
              id: "e1",
              source: "api",
              target: "bureau",
              type: "http",
              spec: { timeoutMs: { valor: 1000, origem: "manual" } },
            },
          ],
        } as unknown as Diagrama,
      }
    );

    const bloco = await screen.findByTestId("contradicoes-c1");
    expect(bloco).toHaveTextContent("100 necessárias");
    expect(bloco).toHaveTextContent("10 chamadas simultâneas");
    // §242 — o porquê é o que separa ensinar de cobrar.
    expect(bloco).toHaveTextContent("Lei de Little");
  });

  it("a insistência tem coluna PRÓPRIA — somá-la à resposta faria o alarme gritar lobo", async () => {
    // SPEC-56 §12.1.1: inflar o pior caso é o defeito que faz as pessoas
    // aprenderem a ignorar o número. São duas perguntas, e ficam em duas colunas.
    montar([
      { id: "c1", nome: "com retry", origem: "manual", ajustes: [{ tipo: "aresta", id: "e1", tentativas: 3 }] },
    ]);

    // 1000 × 3 = 3000 de insistência, e a resposta segue sendo a soma dos
    // timeouts (não multiplicada).
    await waitFor(() => expect(screen.getByTestId("linha-c1")).toHaveTextContent("3,0 s"));
  });

  it("taxa só aparece em NÓ, tentativas e disjuntor só em CONEXÃO", async () => {
    // Oferecer os três em tudo daria controle que não controla nada.
    const { onMudar } = montar([
      { id: "c1", nome: "x", origem: "manual", ajustes: [{ tipo: "aresta", id: "e1", fator: 2 }] },
    ]);
    fireEvent.click(await screen.findByTestId("ajustar-c1"));

    expect(screen.getByTestId("tentativas-e1")).toBeInTheDocument();
    expect(screen.getByTestId("disjuntor-e1")).toBeInTheDocument();
    expect(screen.queryByTestId("taxa-e1")).toBeNull();

    fireEvent.change(screen.getByTestId("tentativas-e1"), { target: { value: "4" } });
    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({ ajustes: [expect.objectContaining({ tentativas: 4 })] }),
    ]);
  });
});

/**
 * §298 — a espera tem que parecer construção.
 *
 * O botão dizia "sugerindo…" e mais nada — três pontos parados num produto que
 * já tem uma gramática para "a IA está trabalhando".
 */
describe("BancadaDeEnsaios — a espera da sugestão", () => {
  /** Uma promessa que não resolve: é o estado "enquanto monta". */
  const nuncaResolve = () => new Promise<never>(() => {});

  it("enquanto monta, a TABELA abre o lugar — é o que dá sensação de construção", async () => {
    montar([], { onSugerir: nuncaResolve });

    expect(screen.queryAllByTestId("ensaio-fantasma")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("sugerir-cenarios"));

    const fantasmas = await screen.findAllByTestId("ensaio-fantasma");
    expect(fantasmas).toHaveLength(3);
    // O atraso ESCALONADO é o que separa "construindo" de "piscando junto".
    expect(fantasmas.map((l) => (l as HTMLElement).style.animationDelay)).toEqual(["0ms", "90ms", "180ms"]);
  });

  it("o botão respira com a mesma classe do resto do produto", async () => {
    // `pensando-ao-vivo` é como a esteira diz "estou trabalhando" antes do
    // primeiro token. Uma animação nova aqui seria a segunda gramática.
    montar([], { onSugerir: nuncaResolve });
    fireEvent.click(screen.getByTestId("sugerir-cenarios"));

    const botao = await screen.findByTestId("sugerir-cenarios");
    expect(botao.querySelector(".pensando-ao-vivo")).not.toBeNull();
    expect(botao).toHaveTextContent("montando");
  });

  it("o convite de tabela vazia SOME enquanto monta — os dois juntos se contradizem", async () => {
    montar([], { onSugerir: nuncaResolve });
    fireEvent.click(screen.getByTestId("sugerir-cenarios"));

    await screen.findAllByTestId("ensaio-fantasma");
    expect(screen.queryByTestId("sem-cenarios")).toBeNull();
  });

  it("a fantasma é invisível para leitor de tela — ela não é conteúdo", async () => {
    montar([], { onSugerir: nuncaResolve });
    fireEvent.click(screen.getByTestId("sugerir-cenarios"));

    const [linha] = await screen.findAllByTestId("ensaio-fantasma");
    expect(linha).toHaveAttribute("aria-hidden", "true");
  });
});

/**
 * SPEC-69 — o débito consciente: o fluxo mapeado.
 *
 * *"o fluxo é avaliar, revisar, e aceitar ou modificar — mas precisa ser um
 * processo muito bem mapeado."*
 */
describe("BancadaDeEnsaios — avaliar → revisar → assumir", () => {
  const porAvaliar: CenarioDeLentidao = {
    id: "c1",
    nome: "Bureau em pico",
    origem: "manual",
    ajustes: [{ tipo: "no", id: "bureau", fator: 3 }],
  };

  it("revisar move o estado — senão o mapa do fluxo seria decoração", async () => {
    const { onMudar } = montar([porAvaliar]);

    fireEvent.click(await screen.findByTestId("ajustar-c1"));

    expect(onMudar).toHaveBeenCalledWith([expect.objectContaining({ estado: "em-revisao" })]);
  });

  it("estar EM REVISÃO não tira do placar — o que tira é assumir", async () => {
    // Sair da cobrança por ter aberto a linha seria a fórmula de fazer as
    // pessoas abrirem tudo sem ler.
    montar([{ ...porAvaliar, estado: "em-revisao" }]);

    expect(await screen.findByTestId("estado-em-revisao")).toBeInTheDocument();
    expect(screen.getByTestId("assumir-c1")).toBeInTheDocument();
  });

  it("§283 — assumido tem volta, e reabrir devolve à cobrança", async () => {
    const { onMudar } = montar([
      { ...porAvaliar, estado: "aceito", debito: { motivo: "cabe no SLA", autor: "x@time" } },
    ]);

    expect(await screen.findByTestId("estado-aceito")).toBeInTheDocument();
    expect(screen.getByTestId("debito-c1")).toHaveTextContent("cabe no SLA");

    fireEvent.click(screen.getByTestId("reabrir-c1"));
    expect(onMudar).toHaveBeenCalledWith([
      expect.objectContaining({ estado: "por-avaliar", debito: undefined }),
    ]);
  });

  it("quebra gravada antes da SPEC migra: `aceito: true` vira débito assumido", async () => {
    montar([{ ...porAvaliar, aceito: true }]);

    expect(await screen.findByTestId("estado-aceito")).toBeInTheDocument();
  });
});

describe("BancadaDeEnsaios — a conclusão escrita (§4.0.1)", () => {
  it("com prazo do NEGÓCIO, a frase compara com o que foi prometido", async () => {
    // "24 s" sozinho não decide nada; "24 s contra os 5 s que prometemos" decide.
    montar(
      [{ id: "c1", nome: "pico", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", fator: 4 }] }],
      { necessidades: [{ texto: "aprovar na hora", limiteMs: 5000 }] }
    );

    // Hoje soma 3000 (1000 da conexão + 2000 do bureau); com o bureau 4× são
    // 1000 + 8000 = 9000, acima dos 5000 prometidos.
    expect(await screen.findByTestId("conclusao-c1")).toHaveTextContent("acima do prazo de 5,0 s");
  });

  it("sem prazo declarado, compara com hoje e NÃO inventa julgamento", async () => {
    montar([{ id: "c1", nome: "pico", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", fator: 4 }] }]);

    const f = await screen.findByTestId("conclusao-c1");
    expect(f).toHaveTextContent("de 3,0 s para 9,0 s");
    expect(f).not.toHaveTextContent("acima do prazo");
  });

  it("a conclusão nomeia o dominante — é o que vira 'ruim por causa disto'", async () => {
    montar([{ id: "c1", nome: "pico", origem: "manual", ajustes: [{ tipo: "no", id: "bureau", fator: 4 }] }]);

    expect(await screen.findByTestId("conclusao-c1")).toHaveTextContent("bureau responde por");
  });
});

/**
 * SPEC-69 fatia D — o passo que faltava depois de assumir.
 *
 * Assumir já põe o ensaio na seção de riscos do documento. Anexá-lo a uma
 * decisão é o que o leva ao ITEM, ao lado do critério de aceite — e é ali que
 * "sob pico esta chamada leva 24 s" muda como o código é escrito.
 */
describe("BancadaDeEnsaios — anexar o ensaio assumido a uma decisão", () => {
  const assumido: CenarioDeLentidao = {
    id: "cen-pico",
    nome: "Bureau em pico",
    origem: "manual",
    estado: "aceito",
    debito: { motivo: "o parceiro não tem SLA melhor", autor: "ana@empresa.com" },
    ajustes: [{ tipo: "no", id: "bureau", ms: 24000 }],
  };

  it("o ensaio ASSUMIDO oferece o anexo; o que ainda cobra, não", async () => {
    // O anexo é sobre evidência de uma escolha feita. Oferecê-lo antes de
    // alguém assumir seria pedir para anexar o que ninguém decidiu conviver.
    montar([assumido, { id: "cen-novo", nome: "Outro", origem: "manual", estado: "por-avaliar", ajustes: [] }], {
      decisoes: [{ id: "d1", titulo: "Chamar o bureau de forma síncrona" }],
      onAnexar: vi.fn(),
    });

    expect(await screen.findByTestId("anexar-cen-pico")).toBeTruthy();
    expect(screen.queryByTestId("anexar-cen-novo")).toBeNull();
  });

  it("escolher a decisão anexa o ensaio a ela", async () => {
    const onAnexar = vi.fn();
    montar([assumido], {
      decisoes: [{ id: "d1", titulo: "Chamar o bureau de forma síncrona" }],
      onAnexar,
    });

    fireEvent.change(await screen.findByTestId("anexar-cen-pico"), { target: { value: "d1" } });

    expect(onAnexar).toHaveBeenCalledWith("cen-pico", "d1");
  });

  it("já anexado, o seletor mostra QUAL decisão — e não volta a dizer 'anexar'", async () => {
    montar([assumido], {
      decisoes: [{ id: "d1", titulo: "Chamar o bureau de forma síncrona", ensaioIds: ["cen-pico"] }],
      onAnexar: vi.fn(),
    });

    expect(((await screen.findByTestId("anexar-cen-pico")) as HTMLSelectElement).value).toBe("d1");
    expect(screen.getByText(/Sustenta a decisão:/)).toBeTruthy();
  });

  it("sem decisão registrada, diz ONDE o gesto existe em vez de um seletor vazio", async () => {
    // §244 — um controle com zero opções é pior que a ausência dele: ele
    // promete um caminho e não leva a lugar nenhum, que é o defeito que esta
    // SPEC inteira existe para corrigir.
    montar([assumido], { decisoes: [], onAnexar: vi.fn() });

    expect(await screen.findByTestId("sem-decisao-cen-pico")).toHaveTextContent(/Registre uma decisão no componente/);
    expect(screen.queryByTestId("anexar-cen-pico")).toBeNull();
  });

  it("sem `onAnexar`, nada aparece — a tela segue inteira sem esta capacidade", async () => {
    montar([assumido], { decisoes: [{ id: "d1", titulo: "X" }] });

    await screen.findByTestId("linha-cen-pico");
    expect(screen.queryByTestId("anexar-cen-pico")).toBeNull();
    expect(screen.queryByTestId("sem-decisao-cen-pico")).toBeNull();
  });
});

/**
 * §305 — a guarda que nunca disparava.
 *
 * A SPEC-66 escreveu `ensaios-sem-tempo` para impedir "uma tabela de zeros que
 * parece uma medição" (§248), e perguntou `tempoDoPiorTrecho === undefined`.
 * Um desenho com conexões que ESPERAM e nenhum número devolve `ms: 0` — medido
 * no navegador, a bancada mostrava "hoje ≥ 0 ms" e um ensaio concluindo "a
 * resposta fica em 0 ms".
 */
describe("BancadaDeEnsaios — o desenho que espera e não declara número", () => {
  /** api →http→ bureau, os dois SEM tempo. É o caso que a guarda antiga
   *  deixava passar: `lerDesenho` devolve `ms: 0`, não `undefined`. */
  const semNumeros = () =>
    ({
      nodes: [
        { id: "api", type: "service", label: "api", x: 0, y: 0, status: "novo", spec: {}, specNA: {} },
        { id: "bureau", type: "external", label: "bureau", x: 0, y: 0, status: "novo", spec: {}, specNA: {} },
      ],
      edges: [{ id: "e1", source: "api", target: "bureau", type: "http", spec: {} }],
    }) as unknown as Diagrama;

  it("avisa — e o aviso diz ONDE preencher, não só que falta", () => {
    montar([], { diagrama: semNumeros() });

    const aviso = screen.getByTestId("ensaios-sem-tempo");
    expect(aviso).toHaveTextContent("zero não é uma medição");
    expect(aviso).toHaveTextContent("bureau");
  });

  it("a linha de HOJE não mostra '≥ 0 ms' — seria o produto se contradizendo", () => {
    // O aviso logo acima diz "zero não é uma medição"; um número zero na mesma
    // tela desmentiria a frase.
    montar([], { diagrama: semNumeros() });

    expect(screen.getByTestId("linha-hoje")).not.toHaveTextContent("0 ms");
  });

  it("com um número declarado, o aviso some e a resposta aparece", async () => {
    montar();

    expect(screen.queryByTestId("ensaios-sem-tempo")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("linha-hoje")).toHaveTextContent("3,0 s"));
  });
});

import { describe, expect, it } from "vitest";
import type { Diagrama } from "@gerador/engine";
import { normalizarDadosQuebra, type RepositorioDeQuebras } from "./repositorioDeQuebras.js";

/**
 * SPEC-31 §8 — a suíte de contrato da porta de Quebras.
 *
 * **A mesma pergunta feita aos dois adaptadores.** É esta suíte, e não a
 * disciplina de quem escreve, que impede arquivo e Postgres de divergirem de
 * novo — a divergência que produziu o hospedado sem IA (§105), sem tabela de
 * regras (§108) e sem `respostasItens` (§110).
 *
 * Cada adaptador roda isto no seu próprio pacote, contra a sua infraestrutura
 * de verdade: o de arquivo contra um diretório temporário, o de Postgres contra
 * o `gerador_test`. Adaptador novo (Mongo, na Fase 5) é aprovado quando passa
 * aqui — não quando passa em testes escritos sob medida para ele.
 */

const DIAGRAMA: Diagrama = {
  nodes: [{ id: "n1", type: "service", label: "srv-teste", x: 0, y: 0, status: "novo", spec: {}, specNA: {} }],
  edges: [],
} as unknown as Diagrama;

export interface AmbienteDeContrato {
  repo: RepositorioDeQuebras;
  /** Chamado antes de cada teste — deixa o repositório vazio. */
  limpar: () => Promise<void>;
}

export function testarContratoDeQuebras(nomeDoAdaptador: string, criarAmbiente: () => Promise<AmbienteDeContrato>) {
  describe(`RepositorioDeQuebras — contrato (${nomeDoAdaptador})`, () => {
    async function comRepo() {
      const ambiente = await criarAmbiente();
      await ambiente.limpar();
      return ambiente.repo;
    }

    it("criar devolve a quebra inteira, com identidade e carimbos", async () => {
      const repo = await comRepo();
      const criada = await repo.criar(normalizarDadosQuebra({ titulo: "Crédito", time: "time-a", diagrama: DIAGRAMA }));

      expect(criada.id).toBeTruthy();
      expect(criada.titulo).toBe("Crédito");
      expect(criada.time).toBe("time-a");
      expect(criada.diagrama).toEqual(DIAGRAMA);
      // ISO-8601, não Date nem número — o formato atravessa HTTP.
      expect(criada.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(criada.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("o que a esteira escreveu SOBREVIVE ao salvar e voltar", async () => {
      // O teste que reprova o Postgres de antes da migração 0011: `quebras`
      // tinha seis colunas e o Zod da borda descartava estes três campos em
      // silêncio. Quem rodava a esteira no modo hospedado perdia o trabalho.
      const repo = await comRepo();
      const respostasItens = { "n1::ep0": { historiaUsuario: { valor: "Como cliente…", origem: "sugerido" as const } } };
      const criada = await repo.criar(
        normalizarDadosQuebra({
          diagrama: DIAGRAMA,
          respostasItens,
          demandInfo: "Aprovação de crédito com bureau externo.",
          anexosContexto: ["ata-refinamento.md", "contrato-bureau.pdf"],
        })
      );

      const lida = await repo.obter(criada.id);
      expect(lida?.respostasItens).toEqual(respostasItens);
      expect(lida?.demandInfo).toBe("Aprovação de crédito com bureau externo.");
      expect(lida?.anexosContexto).toEqual(["ata-refinamento.md", "contrato-bureau.pdf"]);
    });

    it("campos omitidos viram o mesmo default nos dois lados", async () => {
      // Antes, cada adaptador inventava o seu: arquivo caía em {}/""/[],
      // Postgres em undefined e depois null. O cliente via formas diferentes.
      const repo = await comRepo();
      const criada = await repo.criar(normalizarDadosQuebra({ diagrama: DIAGRAMA }));

      expect(criada.titulo).toBeNull();
      expect(criada.time).toBeNull();
      expect(criada.respostasItens).toEqual({});
      expect(criada.demandInfo).toBe("");
      expect(criada.anexosContexto).toEqual([]);
      expect(criada.necessidades).toEqual([]);
      expect(criada.excecoes).toEqual([]);
    });

    it("o PROPÓSITO sobrevive ao salvar e voltar, com vínculo e proveniência", async () => {
      // Mesma lição da migração 0011 e da SPEC-53, terceira vez: campo novo
      // que não é ligado ponta a ponta some em silêncio entre a borda e o
      // banco, e o defeito só aparece quando alguém salva e perde o trabalho.
      const repo = await comRepo();
      const necessidades = [
        {
          id: "r1",
          texto: "o pedido não pode ser cobrado duas vezes",
          prioridade: "alta" as const,
          origem: "manual" as const,
          atendidaPor: ["n1"],
        },
        {
          id: "r2",
          texto: "proposta do agente, ainda não confirmada",
          origem: "sugerido" as const,
          confirmado: false,
          atendidaPor: [],
        },
      ];

      const criada = await repo.criar(normalizarDadosQuebra({ diagrama: DIAGRAMA, necessidades }));
      const lida = await repo.obter(criada.id);

      expect(lida?.necessidades).toEqual(necessidades);
    });

    it("§242 — a exceção de padrão sobrevive, com motivo e autor", async () => {
      // Exceção sem motivo/autor é só o vermelho desligado. Se ela se perdesse
      // entre a borda e o banco, o vermelho voltaria na próxima abertura e a
      // decisão de alguém teria sido descartada em silêncio.
      const repo = await comRepo();
      const excecoes = [
        {
          noId: "n1",
          campo: "timeoutMs",
          motivo: "O parceiro não suporta menos que 800ms.",
          autor: "silvio@exemplo",
          em: "2026-08-15T10:00:00.000Z",
        },
      ];

      const criada = await repo.criar(normalizarDadosQuebra({ diagrama: DIAGRAMA, excecoes }));
      expect((await repo.obter(criada.id))?.excecoes).toEqual(excecoes);
    });

    it("SPEC-57 fatia C — a decisão sobrevive COM as alternativas descartadas", async () => {
      // O que se perde num round-trip mal feito não é a escolha (essa a pessoa
      // lembra), é o leque. Uma decisão que volta do banco só com a escolhida
      // documenta o que foi feito e perde exatamente o que serve daqui a um ano.
      const repo = await comRepo();
      const decisoes = [
        {
          id: "d1",
          noId: "n1",
          titulo: "Fila em vez de chamada síncrona",
          contexto: "O parceiro cai duas vezes por semana.",
          alternativas: [
            { titulo: "Chamada síncrona", consequencia: "a queda do parceiro derruba o checkout junto" },
            { titulo: "Fila com retry" },
          ],
          escolhida: "Fila com retry",
          porque: "Desacopla a disponibilidade do parceiro da nossa.",
          status: "aceita" as const,
          origem: "manual" as const,
          autor: "silvio@exemplo",
          em: "2026-08-15T10:00:00.000Z",
        },
      ];

      const criada = await repo.criar(normalizarDadosQuebra({ diagrama: DIAGRAMA, decisoes }));
      const lida = await repo.obter(criada.id);

      expect(lida?.decisoes).toEqual(decisoes);
      expect(lida?.decisoes?.[0].alternativas[0].consequencia).toContain("derruba o checkout");
    });

    it("SPEC-57 fatia E — o percurso CONFIRMADO sobrevive, com a ordem dos nós", async () => {
      // A ordem é o percurso: `[a,b,c]` e `[a,c,b]` são caminhos diferentes, e
      // um round-trip que reordenasse trocaria a medida sem trocar nada visível.
      const repo = await comRepo();
      const percursos = [
        {
          id: "pc::n1>n2>n3",
          rotulo: "web → api → mongo",
          nos: ["n1", "n2", "n3"],
          origem: "inferido" as const,
          confirmado: true,
        },
      ];

      const criada = await repo.criar(normalizarDadosQuebra({ diagrama: DIAGRAMA, percursos }));
      const lida = await repo.obter(criada.id);

      expect(lida?.percursos).toEqual(percursos);
      expect(lida?.percursos?.[0].nos).toEqual(["n1", "n2", "n3"]);
    });

    it("SPEC-58 — o que a PESSOA escreveu no documento sobrevive, com o status", async () => {
      // A regra 3 da SPEC-58: se a ida e volta apagar isto uma única vez,
      // ninguém escreve de novo — e o documento volta a ser o export de antes.
      const repo = await comRepo();
      const documentoEscrito = {
        tradeOffs: "Aceitamos latência maior na escrita para a leitura ficar barata.",
        riscos: "O parceiro pode mudar o contrato sem aviso.",
      };

      const criada = await repo.criar(
        normalizarDadosQuebra({ diagrama: DIAGRAMA, documentoEscrito, documentoStatus: "aprovado" })
      );
      const lida = await repo.obter(criada.id);

      expect(lida?.documentoEscrito).toEqual(documentoEscrito);
      expect(lida?.documentoStatus).toBe("aprovado");
    });

    it("SPEC-58 — quebra nunca gerada tem status nulo, não string vazia", async () => {
      // Dois jeitos de dizer "nada" é como o campo morre em silêncio na borda
      // (a lição do §184 e da SPEC-53, aqui aplicada antes de doer).
      const repo = await comRepo();
      const criada = await repo.criar(normalizarDadosQuebra({ diagrama: DIAGRAMA }));

      expect((await repo.obter(criada.id))?.documentoStatus).toBeNull();
      expect((await repo.obter(criada.id))?.documentoEscrito).toEqual({});
    });

    it("atualizar troca as necessidades inteiras, sem mesclar com as antigas", async () => {
      // Coleção da quebra é substituída, não fundida: mesclar faria uma
      // necessidade apagada na tela voltar do banco, que é o tipo de
      // ressurreição que ninguém entende olhando a UI.
      const repo = await comRepo();
      const criada = await repo.criar(
        normalizarDadosQuebra({
          diagrama: DIAGRAMA,
          necessidades: [{ id: "r1", texto: "primeira", origem: "manual", atendidaPor: [] }],
        })
      );

      const atualizada = await repo.atualizar(
        criada.id,
        normalizarDadosQuebra({
          diagrama: DIAGRAMA,
          necessidades: [{ id: "r2", texto: "segunda", origem: "manual", atendidaPor: ["n1"] }],
        })
      );

      expect(atualizada?.necessidades?.map((n) => n.id)).toEqual(["r2"]);
    });

    it("obter id inexistente devolve null — ausência é resposta, não exceção", async () => {
      const repo = await comRepo();
      await expect(repo.obter("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
    });

    it("atualizar preserva identidade e data de criação", async () => {
      const repo = await comRepo();
      const criada = await repo.criar(normalizarDadosQuebra({ titulo: "Antes", diagrama: DIAGRAMA }));

      const atualizada = await repo.atualizar(criada.id, normalizarDadosQuebra({ titulo: "Depois", diagrama: DIAGRAMA }));

      expect(atualizada?.id).toBe(criada.id);
      expect(atualizada?.titulo).toBe("Depois");
      expect(atualizada?.criadoEm).toBe(criada.criadoEm);
    });

    it("atualizar id inexistente devolve null — PUT nunca cria por acidente", async () => {
      const repo = await comRepo();
      const r = await repo.atualizar("00000000-0000-0000-0000-000000000000", normalizarDadosQuebra({ diagrama: DIAGRAMA }));
      expect(r).toBeNull();
    });

    it("listar devolve resumo, mais recente primeiro", async () => {
      const repo = await comRepo();
      const primeira = await repo.criar(normalizarDadosQuebra({ titulo: "Primeira", diagrama: DIAGRAMA }));
      // Espera o relógio virar: em disco a resolução do mtime é de milissegundo,
      // e duas escritas no mesmo instante empatariam a ordenação.
      await new Promise((r) => setTimeout(r, 15));
      const segunda = await repo.criar(normalizarDadosQuebra({ titulo: "Segunda", diagrama: DIAGRAMA }));

      const lista = await repo.listar();
      expect(lista.map((q) => q.id)).toEqual([segunda.id, primeira.id]);
      // Resumo é resumo: a tela de abrir não carrega diagrama de todas.
      expect(lista[0]).not.toHaveProperty("diagrama");
    });

    it("listar num repositório vazio é lista vazia, não erro", async () => {
      const repo = await comRepo();
      await expect(repo.listar()).resolves.toEqual([]);
    });
  });
}

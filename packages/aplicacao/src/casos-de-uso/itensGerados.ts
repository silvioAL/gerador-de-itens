import { MARCADOR_ESPECIFICAR } from "@gerador/engine";
import type { AnexadorDeSpec } from "../portas/anexadorDeSpec.js";
import type { ExportadorDeItens } from "../portas/exportadorDeItens.js";
import type {
  DadosItemGerado,
  ItemGeradoSalvo,
  RepositorioDeItensGerados,
} from "../portas/repositorioDeItensGerados.js";

/**
 * SPEC-41 Parte B — casos de uso dos itens gerados. Quem CALCULA os itens é o
 * engine (`gerarItensDeTrabalho`), no cliente, com o mesmo material do
 * documento; aqui só se persiste e se lê o conjunto. A exportação (Fase 2)
 * entra como caso de uso novo usando a porta `ExportadorDeItens`.
 */
export function criarCasosDeUsoDeItensGerados(repo: RepositorioDeItensGerados) {
  /**
   * SPEC-115 fatia E — **a primeira metade, a que responde rápido.**
   *
   * Decide quem entra, MARCA esses itens como "indo" no banco e devolve o
   * plano. A rota responde com isto sem esperar o gateway — e é essa divisão
   * que faz o envio sobreviver ao F5: quando a resposta chega à tela, o estado
   * já está persistido, então recarregar no segundo seguinte lê itens "indo"
   * em vez de não achar rastro nenhum.
   *
   * Marcar ANTES de chamar, e não depois, é o ponto todo. Depois seria tarde
   * exatamente na janela que dura minutos.
   */
  async function planejarAnexoDeSpec(
    quebraId: string,
    specsPorItem: { chave: string; conteudo: string }[]
  ): Promise<{
    pedidos: { chave: string; chaveExterna: string; conteudo: string }[];
    semLinkExterno: string[];
    comLacuna: string[];
  }> {
    const todos = await repo.listarDaQuebra(quebraId);
    const porChave = new Map(todos.map((i) => [i.chave, i]));

    const comLacuna: string[] = [];
    const semLinkExterno: string[] = [];
    const pedidos: { chave: string; chaveExterna: string; conteudo: string }[] = [];

    for (const s of specsPorItem) {
      if (s.conteudo.includes(MARCADOR_ESPECIFICAR)) {
        comLacuna.push(s.chave);
        continue;
      }
      const item = porChave.get(s.chave);
      // Item removido do desenho, ou já anexado numa rodada anterior — em
      // ambos os casos não há o que fazer, e não é erro reenviar.
      if (!item || item.specAnexada) continue;
      if (!item.linkExterno) {
        semLinkExterno.push(s.chave);
        continue;
      }
      pedidos.push({ chave: s.chave, chaveExterna: item.linkExterno, conteudo: s.conteudo });
    }

    await repo.marcarSpecEnviando(
      quebraId,
      pedidos.map((p) => p.chave)
    );
    return { pedidos, semLinkExterno, comLacuna };
  }

  /**
   * SPEC-115 fatia E — **a segunda metade, a que demora.**
   *
   * Chama o gateway e escreve o desfecho de cada item. Quem chama pode esperar
   * (o teste, e `anexarSpecNaQuebra`) ou não (a rota) — o resultado é o mesmo
   * no banco, que é onde a tela vai buscá-lo.
   *
   * Erro vira estado PERSISTIDO, não exceção: um envio que falha enquanto
   * ninguém está olhando precisa deixar rastro, senão o item fica eternamente
   * "indo" para quem voltar depois.
   */
  async function concluirAnexoDeSpec(
    quebraId: string,
    pedidos: { chave: string; chaveExterna: string; conteudo: string }[],
    anexador: AnexadorDeSpec
  ): Promise<{ anexadas: ItemGeradoSalvo[]; erros: { chave: string; erro: string }[] }> {
    if (pedidos.length === 0) return { anexadas: [], erros: [] };

    let resultados: Awaited<ReturnType<AnexadorDeSpec["anexar"]>>;
    try {
      resultados = await anexador.anexar(pedidos);
    } catch (erro) {
      // O contrato da porta é "falha parcial é resposta, não exceção"; um
      // adaptador que estoura mesmo assim não pode deixar o lote inteiro preso
      // em "indo" para sempre.
      const motivo = erro instanceof Error ? erro.message : String(erro);
      resultados = pedidos.map((p) => ({ chave: p.chave, erro: motivo }));
    }

    const anexadas: ItemGeradoSalvo[] = [];
    const erros: { chave: string; erro: string }[] = [];
    for (const resultado of resultados) {
      if ("erro" in resultado) {
        erros.push(resultado);
        await repo.marcarFalhaDeSpec(quebraId, resultado.chave, resultado.erro);
        continue;
      }
      const salvo = await repo.marcarSpecAnexada(quebraId, resultado.chave);
      if (salvo) anexadas.push(salvo);
    }

    /**
     * O item que o adaptador simplesmente não mencionou continuaria "indo"
     * eternamente. É o que a SPEC-115 §1.2 chama de "a tela lê de onde parou":
     * se não parou em lugar nenhum, ela leria uma espera infinita.
     */
    const respondidos = new Set(resultados.map((r) => r.chave));
    for (const pedido of pedidos) {
      if (respondidos.has(pedido.chave)) continue;
      const erro = "o envio terminou sem notícia deste item";
      erros.push({ chave: pedido.chave, erro });
      await repo.marcarFalhaDeSpec(quebraId, pedido.chave, erro);
    }

    return { anexadas, erros };
  }

  return {
    planejarAnexoDeSpec,
    concluirAnexoDeSpec,

    listarDaQuebra(quebraId: string): Promise<ItemGeradoSalvo[]> {
      return repo.listarDaQuebra(quebraId);
    },

    regerarDaQuebra(quebraId: string, itens: DadosItemGerado[]): Promise<ItemGeradoSalvo[]> {
      return repo.substituirDaQuebra(quebraId, itens);
    },

    /**
     * SPEC-49 — exporta os itens PRONTOS (a régua da SPEC-44/47: nenhum campo
     * pedindo "✍️ especificar", nenhuma sugestão sem confirmação). Item pela
     * metade não vira issue meia-boca no tracker de ninguém.
     *
     * Falha é por item: quem subiu fica `exportado` com link, quem falhou
     * continua `gerado` e o motivo volta pra tela.
     */
    async exportarDaQuebra(
      quebraId: string,
      exportador: ExportadorDeItens
    ): Promise<{ exportados: ItemGeradoSalvo[]; erros: { chave: string; erro: string }[]; ignorados: string[] }> {
      const todos = await repo.listarDaQuebra(quebraId);
      const prontos = todos.filter((i) => i.estado !== "exportado" && i.pendencias === 0 && i.sugestoes === 0);
      const ignorados = todos.filter((i) => !prontos.includes(i) && i.estado !== "exportado").map((i) => i.chave);

      const resultados = await exportador.exportar(prontos);
      const exportados: ItemGeradoSalvo[] = [];
      const erros: { chave: string; erro: string }[] = [];
      for (const resultado of resultados) {
        if ("erro" in resultado) {
          erros.push(resultado);
          continue;
        }
        const salvo = await repo.marcarExportado(quebraId, resultado.chave, resultado.linkExterno);
        if (salvo) exportados.push(salvo);
      }
      return { exportados, erros, ignorados };
    },

    /**
     * SPEC-114 — a SEGUNDA chamada: anexa a spec de cada item ao issue que a
     * exportação já criou. `specsPorItem` chega uma entrada por item — a
     * SPEC-114 §2.2 é explícita: cada item tem a SUA spec, não uma cópia da
     * spec da demanda inteira.
     *
     * Três formas de um item não entrar, e nenhuma é erro — são estados
     * esperados, nomeados separado (a régua do §276: não somar estados
     * diferentes num rótulo só):
     *   - a spec ainda tem lacuna (`comLacuna`) — "enviar spec com lacuna" é
     *     recusa (SPEC-98 §6), então nem chega a tentar a chamada;
     *   - o item ainda não tem `linkExterno` (`semLinkExterno`) — história
     *     não subiu, não tem onde anexar;
     *   - o item já tem `specAnexada` — reenviar manda só o que falta.
     */
    async anexarSpecNaQuebra(
      quebraId: string,
      specsPorItem: { chave: string; conteudo: string }[],
      anexador: AnexadorDeSpec
    ): Promise<{
      anexadas: ItemGeradoSalvo[];
      erros: { chave: string; erro: string }[];
      semLinkExterno: string[];
      comLacuna: string[];
    }> {
      const plano = await planejarAnexoDeSpec(quebraId, specsPorItem);
      const { anexadas, erros } = await concluirAnexoDeSpec(quebraId, plano.pedidos, anexador);
      return { anexadas, erros, semLinkExterno: plano.semLinkExterno, comLacuna: plano.comLacuna };
    },
  };
}

export type CasosDeUsoDeItensGerados = ReturnType<typeof criarCasosDeUsoDeItensGerados>;

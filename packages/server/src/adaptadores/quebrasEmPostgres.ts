import { desc, eq } from "drizzle-orm";
import type {
  DadosQuebra,
  QuebraSalva,
  RepositorioDeQuebras,
  ResumoQuebra,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { quebras } from "../db/schema.js";

/**
 * SPEC-31 Fase 1 — adaptador Postgres da porta de Quebras.
 *
 * Só traduz forma: `Date` do driver vira ISO-8601 (o formato que atravessa
 * HTTP e que o adaptador de arquivo já devolvia), `null` de coluna vira o
 * default do contrato. Nenhuma regra aqui — regra mora no engine, orquestração
 * no caso de uso.
 *
 * As três colunas de `respostas_itens`, `demand_info` e `anexos_contexto` são
 * da migração 0011: antes dela a tabela tinha seis colunas e a suíte de
 * contrato reprovava este adaptador — que é exatamente o que ela existe para
 * fazer.
 */
type LinhaQuebra = typeof quebras.$inferSelect;

function comoQuebraSalva(linha: LinhaQuebra): QuebraSalva {
  return {
    id: linha.id,
    titulo: linha.titulo ?? null,
    time: linha.time ?? null,
    diagrama: linha.diagrama as QuebraSalva["diagrama"],
    respostasItens: (linha.respostasItens ?? {}) as QuebraSalva["respostasItens"],
    demandInfo: linha.demandInfo ?? "",
    anexosContexto: (linha.anexosContexto ?? []) as QuebraSalva["anexosContexto"],
    produtoId: linha.produtoId ?? null,
    necessidades: (linha.necessidades ?? []) as QuebraSalva["necessidades"],
    excecoes: (linha.excecoes ?? []) as QuebraSalva["excecoes"],
    decisoes: (linha.decisoes ?? []) as QuebraSalva["decisoes"],
    percursos: (linha.percursos ?? []) as QuebraSalva["percursos"],
    documentoEscrito: (linha.documentoEscrito ?? {}) as QuebraSalva["documentoEscrito"],
    documentoStatus: (linha.documentoStatus ?? null) as QuebraSalva["documentoStatus"],
    // SPEC-71 — `volumetria` sem `?? {}`: ausência é afirmação aqui ("ninguém
    // declarou volume"), e um objeto vazio faria o motor tratar como declarado.
    volumetria: (linha.volumetria ?? undefined) as QuebraSalva["volumetria"],
    leiturasDispensadas: (linha.leiturasDispensadas ?? []) as QuebraSalva["leiturasDispensadas"],
    cenariosDeLentidao: (linha.cenariosDeLentidao ?? []) as QuebraSalva["cenariosDeLentidao"],
    especificacao: linha.especificacao ?? null,
    especificacaoGeradaEm: linha.especificacaoGeradaEm?.toISOString() ?? null,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

/**
 * SPEC-72 fatia C — o conteúdo gravado é o mesmo que está chegando?
 *
 * Comparação por JSON, e não campo a campo: campo novo entra na conta sozinho,
 * e a alternativa — uma segunda lista de campos a manter em dia — é exatamente
 * o que a SPEC-71 acabou de provar que não se mantém.
 *
 * `jsonb` volta do Postgres com as chaves noutra ordem, então comparar o texto
 * cru daria "mudou" sempre. `estavel` ordena as chaves antes de serializar.
 */
function mesmoConteudo(anterior: Record<string, unknown>, novo: Record<string, unknown>): boolean {
  const estavel = (v: unknown): string =>
    JSON.stringify(v, (_chave, valor: unknown) =>
      valor && typeof valor === "object" && !Array.isArray(valor)
        ? Object.fromEntries(Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
        : valor
    );
  return Object.keys(novo).every((chave) => estavel(anterior[chave]) === estavel(novo[chave]));
}

export function criarRepositorioDeQuebrasEmPostgres(db: BancoDeDados): RepositorioDeQuebras {
  async function buscarLinha(id: string): Promise<LinhaQuebra | undefined> {
    const [linha] = await db.select().from(quebras).where(eq(quebras.id, id));
    return linha;
  }

  return {
    async listar(): Promise<ResumoQuebra[]> {
      const linhas = await db
        .select({
          id: quebras.id,
          titulo: quebras.titulo,
          time: quebras.time,
          criadoEm: quebras.criadoEm,
          atualizadoEm: quebras.atualizadoEm,
        })
        .from(quebras)
        .orderBy(desc(quebras.atualizadoEm));
      return linhas.map((l) => ({
        id: l.id,
        titulo: l.titulo ?? null,
        time: l.time ?? null,
        criadoEm: l.criadoEm.toISOString(),
        atualizadoEm: l.atualizadoEm.toISOString(),
      }));
    },

    async obter(id: string): Promise<QuebraSalva | null> {
      // Id fora do formato uuid faz o Postgres reclamar em vez de responder
      // "não achei" — e ausência é resposta, não exceção (contrato da porta).
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const linha = await buscarLinha(id);
      return linha ? comoQuebraSalva(linha) : null;
    },

    async criar(dados: DadosQuebra): Promise<QuebraSalva> {
      const [criada] = await db
        .insert(quebras)
        .values({
          titulo: dados.titulo,
          time: dados.time,
          diagrama: dados.diagrama,
          respostasItens: dados.respostasItens,
          demandInfo: dados.demandInfo,
          anexosContexto: dados.anexosContexto,
          produtoId: dados.produtoId ?? null,
          necessidades: dados.necessidades ?? [],
          excecoes: dados.excecoes ?? [],
          decisoes: dados.decisoes ?? [],
          percursos: dados.percursos ?? [],
          documentoEscrito: dados.documentoEscrito ?? {},
          documentoStatus: dados.documentoStatus ?? null,
          volumetria: dados.volumetria ?? null,
          leiturasDispensadas: dados.leiturasDispensadas ?? [],
          cenariosDeLentidao: dados.cenariosDeLentidao ?? [],
          especificacao: dados.especificacao ?? null,
          // A data marca a VERSÃO da especificação — só quando o texto vem.
          especificacaoGeradaEm: dados.especificacao ? new Date() : null,
        })
        .returning();
      return comoQuebraSalva(criada);
    },

    async atualizar(id: string, dados: DadosQuebra): Promise<QuebraSalva | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

      /**
       * SPEC-72 fatia C — o carimbo só muda quando o CONTEÚDO muda.
       *
       * O autosave depende do objeto `quebra` inteiro: mexer no `timeoutMs` de
       * um nó reenvia contexto, anexos, decisões, percursos, itens e documento.
       * Hoje isso custa ~4 kB e é irrelevante — **a régua que importa não é o
       * byte, é o `atualizadoEm`**. Toda gravação carimbava a linha, e por isso
       * "quando esta demanda mudou pela última vez" respondia *"quando alguém
       * arrastou um nó"*. É sobre esse carimbo que a SPEC-58 §5 constrói o
       * "documento desatualizado", e é por ele que a tela de Abrir… ordena.
       *
       * A SPEC deixou a escolha em aberto entre "o autosave para de reenviar o
       * que não mudou" e "o carimbo passa a distinguir". Aqui é a segunda, por
       * um motivo: ensinar o autosave a mandar só o diferente é o começo do
       * salvamento incremental que a §4 recusa em voz alta — e criaria a classe
       * de defeito em que metade da quebra é de uma versão e metade de outra.
       *
       * O custo é um SELECT a mais por PUT. Contra um UPDATE de vinte colunas,
       * é ruído.
       */
      const anterior = await buscarLinha(id);
      if (!anterior) return null;

      const conteudo = {
        titulo: dados.titulo,
        time: dados.time,
        diagrama: dados.diagrama,
        respostasItens: dados.respostasItens,
        demandInfo: dados.demandInfo,
        anexosContexto: dados.anexosContexto,
        produtoId: dados.produtoId ?? null,
        necessidades: dados.necessidades ?? [],
        excecoes: dados.excecoes ?? [],
        decisoes: dados.decisoes ?? [],
        percursos: dados.percursos ?? [],
        documentoEscrito: dados.documentoEscrito ?? {},
        documentoStatus: dados.documentoStatus ?? null,
        volumetria: dados.volumetria ?? null,
        leiturasDispensadas: dados.leiturasDispensadas ?? [],
        cenariosDeLentidao: dados.cenariosDeLentidao ?? [],
        especificacao: dados.especificacao ?? null,
      };
      const mudou = !mesmoConteudo(anterior, conteudo);
      // A data da ESPECIFICAÇÃO marca a versão dela, e pelo mesmo raciocínio só
      // se move quando o texto dela muda — recarimbar a cada autosave faria
      // "gerada em" responder pela última tecla digitada em qualquer campo.
      const especificacaoMudou = (anterior.especificacao ?? null) !== conteudo.especificacao;

      const [atualizada] = await db
        .update(quebras)
        .set({
          ...conteudo,
          ...(conteudo.especificacao && especificacaoMudou ? { especificacaoGeradaEm: new Date() } : {}),
          ...(mudou ? { atualizadoEm: new Date() } : {}),
        })
        .where(eq(quebras.id, id))
        .returning();
      return atualizada ? comoQuebraSalva(atualizada) : null;
    },
  };
}

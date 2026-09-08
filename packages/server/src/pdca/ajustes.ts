import { and, eq } from "drizzle-orm";
import {
  aplicarOperacao,
  aplicarOperacaoNoPipeline,
  recursoAlvoDaOperacao,
  secaoDaOperacao,
  type RecursoDeAjuste,
  type OperacaoDeAjuste,
  type PipelineComPapeis,
  type RegrasConfig,
} from "@gerador/engine";
import { CAMPO_GLOBAL, criarCasosDeUsoDeCamposAresta, criarCasosDeUsoDeCamposNo } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { registrarAuditoria } from "../auditoria.js";
import { SECOES_DE_REGRAS, type Recurso } from "../auth/permissoes.js";
import { ALVO_CONFLITO_CONFIG, configDocumentos, pdcaFeedback, solicitacoesAjuste } from "../db/schema.js";
import { aplicarOperacaoDeCampo, type PortaDeFicha } from "./aplicarNosCampos.js";
import { criarRepositorioDeCamposNoEmPostgres } from "../adaptadores/camposNoEmPostgres.js";
import { criarRepositorioDeCamposArestaEmPostgres } from "../adaptadores/camposArestaEmPostgres.js";
import { templateDaVersao } from "../config/templateDaVersao.js";

/**
 * SPEC-110 fatia G — **criar e aplicar um ajuste, num lugar só.**
 *
 * A aba PDCA sempre teve as duas ações; agora um FLUXO também as tem
 * (`config-propor-ajuste` e `config-aplicar-ajuste`). Duas implementações do
 * mesmo ato divergiriam na primeira variante nova de operação — e a divergência
 * apareceria como "aplicou pela aba e não pelo fluxo", que é o tipo de defeito
 * que ninguém reproduz.
 *
 * O que ficou de FORA daqui, de propósito: o portão de permissão. Ele é
 * decisão de quem chama (`podePermissao`), porque a rota e o executor de fluxo
 * o traduzem de formas diferentes — 403 lá, falha nomeada no rastro aqui. A
 * REGRA é a mesma; a apresentação não.
 */

/** Os quatro DOCUMENTOS versionados + as duas fichas por tipo. */
export const RECURSOS_SOLICITAVEIS = [
  "regras",
  "pipeline-agentes",
  "especificacao-template",
  "campos-no",
  "campos-aresta",
] as const;

/** O recurso RBAC que autoriza DECIDIR cada solicitação. */
const RECURSO_DA_DECISAO: Record<(typeof RECURSOS_SOLICITAVEIS)[number], Recurso> = {
  regras: "regras.checklistTecnico",
  "pipeline-agentes": "pipeline-agentes",
  "especificacao-template": "especificacao-template",
  "campos-no": "campos-no",
  "campos-aresta": "campos-aresta",
};

/**
 * SPEC-46 — quem decide é o dono da SEÇÃO, não o do checklist técnico.
 * SPEC-50 — e quem manda é a OPERAÇÃO, não o rótulo do pedido: um ajuste de
 * papel é do dono do pipeline, mesmo que o pedido tenha nascido marcado como
 * "regras".
 *
 * SPEC-110 fatia G — mudou de lugar (era inline em `routes/pdca.ts`) porque o
 * nó `config-aplicar-ajuste` precisa do MESMO mapeamento para montar o
 * portão. Duas tabelas de dono divergiriam mandando o pedido para pessoas
 * diferentes conforme o caminho — e ninguém veria.
 */
export function recursoDaSolicitacao(pedido: { recurso: string; operacao: unknown }): Recurso {
  if (pedido.operacao) {
    const op = pedido.operacao as OperacaoDeAjuste;
    const alvo = recursoAlvoDaOperacao(op);
    if (alvo === "pipeline-agentes") return "pipeline-agentes";
    // SPEC-52 — a ficha tem dono próprio (quem edita campos por componente ou
    // por conexão), e não é o dono de nenhuma seção das regras.
    if (alvo === "campos-no" || alvo === "campos-aresta") return alvo;
    return SECOES_DE_REGRAS[secaoDaOperacao(op)];
  }
  return RECURSO_DA_DECISAO[pedido.recurso as (typeof RECURSOS_SOLICITAVEIS)[number]] ?? "regras.checklistTecnico";
}

export class AjusteRecusado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "AjusteRecusado";
  }
}

const GLOBAL = CAMPO_GLOBAL;

/**
 * Os alvos que são DOCUMENTO de config. As fichas (`campos-no`,
 * `campos-aresta`) são tabela com escopo, e nunca têm template a resolver —
 * excluí-las aqui é o que deixa o tipo dizer a verdade, em vez de aceitar
 * qualquer alvo e falhar na hora de procurar um template que não existe.
 */
export type AlvoComDocumento = Exclude<RecursoDeAjuste, "campos-no" | "campos-aresta">;

export interface DependenciasDoAjuste {
  db: OpcoesApp["db"];
  /** O template da versão para o alvo, quando a organização ainda não gravou
   * documento nenhum (§303) — a base é o template, não um erro. O tipo é o
   * do PRÓPRIO alvo (`recursoAlvoDaOperacao`), e não `string`: alargar aqui
   * faria o chamador precisar de um cast, e cast é onde erro de chave se
   * esconde. */
  templateDoAlvo: (alvo: AlvoComDocumento) => Promise<unknown>;
  fichaDeNos: PortaDeFicha;
  fichaDeArestas: PortaDeFicha;
}

/**
 * SPEC-110 fatia G — **as dependências do aplicador, montadas num lugar só.**
 *
 * A aba e o fluxo precisam das mesmas fichas e do mesmo template. Montá-las
 * duas vezes foi o que eu fiz primeiro, e é exatamente a duplicação que este
 * módulo existe para matar: a segunda cópia teria ficado para trás na primeira
 * mudança de escopo de campo.
 */
export function criarDependenciasDoAjuste(db: OpcoesApp["db"], diretorioConfig: string): DependenciasDoAjuste {
  const camposNo = criarCasosDeUsoDeCamposNo(criarRepositorioDeCamposNoEmPostgres(db));
  const camposAresta = criarCasosDeUsoDeCamposAresta(criarRepositorioDeCamposArestaEmPostgres(db));
  return {
    db,
    templateDoAlvo: (alvo) => templateDaVersao(alvo, diretorioConfig),
    fichaDeNos: {
      listar: async (tipoNo, timeId) => (await camposNo.listarEfetivos(timeId)).filter((c) => c.tipoNo === tipoNo),
      criar: ({ chaveDoComponente, timeId, campo, ordem }) =>
        camposNo
          .salvar({
            timeId,
            tipoNo: chaveDoComponente,
            key: campo.key,
            label: campo.label,
            type: campo.tipoCampo,
            required: campo.obrigatorio,
            ajuda: campo.ajuda ?? null,
            opcoes: campo.opcoes ?? null,
            ordem,
          })
          .then(() => undefined),
      excluir: (id) => camposNo.excluir(id),
    },
    fichaDeArestas: {
      listar: async (tipoAresta, timeId) =>
        (await camposAresta.listarEfetivos(timeId)).filter((c) => c.tipoAresta === tipoAresta),
      criar: ({ chaveDoComponente, timeId, campo, ordem }) =>
        camposAresta
          .salvar({
            timeId,
            tipoAresta: chaveDoComponente,
            key: campo.key,
            label: campo.label,
            // A ficha de conexão não tem `lista` — o tipo proposto já exclui.
            type: campo.tipoCampo,
            required: campo.obrigatorio,
            ajuda: campo.ajuda ?? null,
            opcoes: campo.opcoes ?? null,
            ordem,
          })
          .then(() => undefined),
      excluir: (id) => camposAresta.excluir(id),
    },
  };
}

/**
 * A validade do pedido é uma FOTO: a versão do documento-alvo no instante em
 * que ele foi feito. Entre o pedido e a decisão a config pode ter mudado, e
 * aprovar sobre uma base que já é outra é aprovar no escuro.
 */
export async function versaoDoDocumento(db: OpcoesApp["db"], recurso: string): Promise<Date | null> {
  const [doc] = await db
    .select({ atualizadoEm: configDocumentos.atualizadoEm })
    .from(configDocumentos)
    .where(and(eq(configDocumentos.chave, recurso), eq(configDocumentos.timeId, GLOBAL)))
    .limit(1);
  return doc?.atualizadoEm ?? null;
}

export interface EntradaDaSolicitacao {
  organizacaoId: string;
  solicitante: string;
  recurso: string;
  descricao: string;
  timeId?: string | null;
  operacao?: OperacaoDeAjuste | null;
  /** De qual feedback este pedido nasceu — fecha a ponte do ciclo. */
  feedbackId?: string | null;
}

/** Cria a solicitação PENDENTE e, quando ela nasceu de um feedback, marca o
 * feedback como tratado — senão o card continuaria pedindo tratamento para
 * sempre, que foi a queixa que originou a ponte. */
export async function criarSolicitacao(db: OpcoesApp["db"], entrada: EntradaDaSolicitacao) {
  const [criada] = await db
    .insert(solicitacoesAjuste)
    .values({
      organizacaoId: entrada.organizacaoId,
      timeId: entrada.timeId ?? null,
      solicitante: entrada.solicitante,
      recurso: entrada.recurso,
      descricao: entrada.descricao,
      versaoAlvo: await versaoDoDocumento(db, entrada.recurso),
      operacao: entrada.operacao ?? null,
    })
    .returning();

  if (entrada.feedbackId) {
    await db
      .update(pdcaFeedback)
      .set({ estado: "virou-ajuste", solicitacaoId: criada.id })
      .where(eq(pdcaFeedback.id, entrada.feedbackId));
  }
  registrarAuditoria(db, {
    email: entrada.solicitante,
    acao: "criar",
    recurso: "solicitacoes_ajuste",
    recursoId: criada.id,
  });
  return criada;
}

/**
 * **Aprova** um pedido pendente, conferindo a foto da validade.
 *
 * Separado do aplicar porque são dois atos com duas perguntas: "isto deve
 * acontecer?" e "faça acontecer". O fluxo do PDCA faz os dois em sequência —
 * quem está na tela de revisão É quem decide —, mas a auditoria registra os
 * dois, e é assim que "quem aprovou?" continua tendo resposta.
 */
export async function aprovarSolicitacao(
  db: OpcoesApp["db"],
  { id, email }: { id: string; email: string }
): Promise<void> {
  const [pedido] = await db.select().from(solicitacoesAjuste).where(eq(solicitacoesAjuste.id, id)).limit(1);
  if (!pedido) throw new AjusteRecusado(`não conheço a solicitação "${id}"`);
  if (pedido.estado === "aprovada") return; // Idempotente: aprovar de novo não é erro.
  if (pedido.estado !== "pendente") throw new AjusteRecusado(`solicitação já está "${pedido.estado}"`);

  const alvo = pedido.operacao ? recursoAlvoDaOperacao(pedido.operacao as OperacaoDeAjuste) : pedido.recurso;
  const versaoAtual = await versaoDoDocumento(db, alvo);
  if ((pedido.versaoAlvo?.getTime() ?? null) !== (versaoAtual?.getTime() ?? null)) {
    await db
      .update(solicitacoesAjuste)
      .set({ estado: "invalida", decididoPor: email, decididoEm: new Date() })
      .where(eq(solicitacoesAjuste.id, id));
    throw new AjusteRecusado(
      `a configuração de "${alvo}" mudou depois deste pedido — ele virou inválido e precisa ser refeito sobre o estado novo`
    );
  }

  await db
    .update(solicitacoesAjuste)
    .set({ estado: "aprovada", decididoPor: email, decididoEm: new Date() })
    .where(eq(solicitacoesAjuste.id, id));
  registrarAuditoria(db, { email, acao: "atualizar", recurso: "solicitacoes_ajuste", recursoId: id });
}

export interface AjusteAplicado {
  id: string;
  estado: string;
  aplicadaPor: string | null;
  /** As chaves de campo criadas e removidas — listas, não contagens: a tela
   * diz QUAIS campos entraram, e um número não responde isso. */
  criados?: string[];
  removidos?: string[];
}

/**
 * **Aplica** o ajuste aprovado — o *Act* do ciclo.
 *
 * É determinístico: a MESMA função pura que a prévia usou para mostrar o efeito
 * antes de decidir. Só solicitação `aprovada` aplica, e só uma vez.
 */
export async function aplicarSolicitacao(
  deps: DependenciasDoAjuste,
  { id, email }: { id: string; email: string }
): Promise<AjusteAplicado> {
  const { db } = deps;
  const [pedido] = await db.select().from(solicitacoesAjuste).where(eq(solicitacoesAjuste.id, id)).limit(1);
  if (!pedido) throw new AjusteRecusado(`não conheço a solicitação "${id}"`);
  if (pedido.estado !== "aprovada") {
    throw new AjusteRecusado(`só solicitação aprovada aplica — esta está "${pedido.estado}"`);
  }
  if (!pedido.operacao) {
    throw new AjusteRecusado("este pedido é só texto (sem operação) — abra a configuração e edite à mão");
  }
  const operacao = pedido.operacao as OperacaoDeAjuste;
  const alvo = recursoAlvoDaOperacao(operacao);

  /**
   * SPEC-52 — a ficha não é documento: campos por componente e por conexão são
   * tabela, com escopo. Aplicar aqui grava linha, mas o QUE gravar sai da
   * mesma função pura que a tela usou na prévia.
   */
  if (alvo === "campos-no" || alvo === "campos-aresta") {
    const escopo = pedido.timeId ?? GLOBAL;
    const resultado = await aplicarOperacaoDeCampo(
      operacao,
      escopo,
      alvo === "campos-no" ? deps.fichaDeNos : deps.fichaDeArestas
    );
    if (!resultado.ok) throw new AjusteRecusado(resultado.motivo);

    const [emCampos] = await db
      .update(solicitacoesAjuste)
      .set({ estado: "aplicada", aplicadaEm: new Date(), aplicadaPor: email })
      .where(eq(solicitacoesAjuste.id, id))
      .returning();
    registrarAuditoria(db, {
      email,
      acao: "atualizar",
      recurso: alvo === "campos-no" ? "campos_no" : "campos_aresta",
      recursoId: escopo,
    });
    return {
      id,
      estado: emCampos.estado,
      aplicadaPor: emCampos.aplicadaPor,
      criados: resultado.criados,
      removidos: resultado.removidos,
    };
  }

  const [doc] = await db
    .select()
    .from(configDocumentos)
    .where(and(eq(configDocumentos.chave, alvo), eq(configDocumentos.timeId, GLOBAL)))
    .limit(1);

  /**
   * §303 — sem linha gravada, a base é o TEMPLATE, não um erro. "Não
   * encontrado" é o estado normal de toda organização que ainda não salvou
   * config nenhuma, e tratá-lo como falha deixava o PDCA inteiro inalcançável
   * numa instalação nova.
   */
  const base = doc?.documento ?? (await deps.templateDoAlvo(alvo));
  const documentoNovo =
    alvo === "pipeline-agentes"
      ? aplicarOperacaoNoPipeline(base as PipelineComPapeis, operacao)
      : aplicarOperacao(base as RegrasConfig, operacao);

  if (doc) {
    await db
      .update(configDocumentos)
      .set({ documento: documentoNovo, atualizadoEm: new Date() })
      .where(eq(configDocumentos.id, doc.id));
  } else {
    // A primeira gravação da organização. `onConflictDoUpdate` porque duas
    // aplicações simultâneas nasceriam as duas sem linha, e a segunda
    // estouraria na chave única em vez de gravar.
    await db
      .insert(configDocumentos)
      .values({ chave: alvo, timeId: GLOBAL, documento: documentoNovo })
      .onConflictDoUpdate({
        target: [...ALVO_CONFLITO_CONFIG],
        set: { documento: documentoNovo, atualizadoEm: new Date() },
      });
  }

  const [aplicada] = await db
    .update(solicitacoesAjuste)
    .set({ estado: "aplicada", aplicadaEm: new Date(), aplicadaPor: email })
    .where(eq(solicitacoesAjuste.id, id))
    .returning();
  registrarAuditoria(db, { email, acao: "atualizar", recurso: "config_documentos", recursoId: alvo });
  return { id, estado: aplicada.estado, aplicadaPor: aplicada.aplicadaPor };
}

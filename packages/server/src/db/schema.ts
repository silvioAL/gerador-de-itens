import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * `diagrama` guarda { nodes, edges } exatamente como packages/engine espera
 * (Diagrama do model) — o server nunca reformata isso, só persiste e devolve.
 * Não tem mais `produto` (JOURNEY.md §21) — era "informação do épico, não do
 * item", e a única entidade que este banco modela é a quebra em si.
 */
export const quebras = pgTable("quebras", {
  id: uuid("id").primaryKey().defaultRandom(),
  titulo: text("titulo"),
  time: text("time"),
  diagrama: jsonb("diagrama").notNull(),
  /**
   * SPEC-31 Fase 1 / migração 0011. Estes três existiam só no modo local: a
   * tabela tinha seis colunas e o Zod da borda descartava em silêncio o que a
   * esteira escreveu e o contexto do épico. Quem rodava os agentes no modo
   * hospedado salvava e perdia o trabalho.
   */
  respostasItens: jsonb("respostas_itens").notNull().default({}),
  demandInfo: text("demand_info").notNull().default(""),
  anexosContexto: jsonb("anexos_contexto").$type<string[]>().notNull().default([]),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Forma relacional do mesmo `PerfilTime` de packages/engine
 * (Record<tipoNo, Record<campo, valor>>) — uma linha por (time, tipo, campo)
 * em vez de um blob aninhado, pra dar pra fazer UPDATE de um valor só sem
 * reescrever o objeto inteiro (é exatamente o que a edição inline da aba
 * "Perfis de time" precisa).
 */
export const perfisTime = pgTable(
  "perfis_time",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timeId: text("time_id")
      .notNull()
      .references(() => times.id),
    tipoNo: text("tipo_no").notNull(),
    campo: text("campo").notNull(),
    valor: text("valor").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("perfis_time_chave_unica").on(t.timeId, t.tipoNo, t.campo)]
);

/** Sentinela usada em `campos_no.time_id` pra campo compartilhado por todo mundo —
 * nunca NULL, porque Postgres trata NULL≠NULL em índice único (duas linhas
 * globais do mesmo tipoNo/key colidiriam sem ser barradas). */
export const CAMPO_GLOBAL = "__global__";

/**
 * Definição de campo de formulário por tipo de nó — substitui o que antes só
 * existia estático em `config/diagrama.json` (`nodeTypes[tipo].spec`), sem
 * CRUD nenhum. `timeId = CAMPO_GLOBAL` é campo compartilhado por todo mundo;
 * qualquer outro valor é um campo extra só daquele time, que se sobrepõe ao
 * global de mesma `key` (mesma regra de override de `perfisTime`).
 */
export const camposNo = pgTable(
  "campos_no",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timeId: text("time_id").notNull().default(CAMPO_GLOBAL),
    tipoNo: text("tipo_no").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    required: boolean("required").notNull().default(false),
    valorPadrao: text("valor_padrao"),
    opcoes: jsonb("opcoes").$type<string[]>(),
    ajuda: text("ajuda"),
    permiteNA: boolean("permite_na").notNull().default(false),
    ordem: integer("ordem").notNull().default(0),
    /** Só quando `type === "lista"` — a forma de cada item (ex.: os
     * sub-campos method/path/request/response de um endpoint). Nulo pros
     * outros tipos de campo. */
    itemSpec: jsonb("item_spec").$type<{ key: string; label: string; type: string; options?: string[] }[]>(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("campos_no_chave_unica").on(t.timeId, t.tipoNo, t.key)]
);

/**
 * Organização → Times → Membros (Fase B.2, corrige SPEC-09 §3.3). Uma
 * organização só por deploy — nada de multi-tenant de verdade nesta rodada —
 * mas tabela de verdade, não conceitual, porque este projeto pode um dia ser
 * usado por mais de uma empresa. Sem UI pra criar/renomear organização ainda:
 * a única linha é semeada pela migração, igual aos usuários de seed do modo dev.
 */
export const organizacoes = pgTable("organizacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Time como entidade de verdade (antes só existia implicitamente como
 * string solta em `usuarioTime.timeId`). `id` continua sendo a mesma string
 * de sempre (ex. "time-pagamentos") — deliberadamente **globalmente única**,
 * não uma chave composta `(organizacaoId, id)`: com uma organização só, isso
 * já é o comportamento certo, e virar composta no futuro é uma migração
 * pequena e isolada, não um redesenho de todo o resto que hoje mostra esse
 * id direto como rótulo (EscolherTimeScreen, MembrosTab, PerfisTimeTab...).
 */
export const times = pgTable("times", {
  id: text("id").primaryKey(),
  organizacaoId: uuid("organizacao_id")
    .notNull()
    .references(() => organizacoes.id),
  nome: text("nome").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Fonte de verdade de quais times uma pessoa pertence — usada pela sessão
 * (JWT) pra saber quais `timeId` autorizar. Onboarding: criar um time novo
 * (`POST /times`, qualquer sessão) ou convite por link (`convitesTime`) ou
 * administração direta (rotas `/times/:timeId/membros`, SPEC-09 §3-4) — sem
 * papel de admin separado, qualquer membro do time administra a própria
 * lista de membros.
 */
export const usuarioTime = pgTable(
  "usuario_time",
  {
    email: text("email").notNull(),
    timeId: text("time_id")
      .notNull()
      .references(() => times.id),
  },
  (t) => [uniqueIndex("usuario_time_chave_unica").on(t.email, t.timeId)]
);

/**
 * SPEC-28 — gestão de acessos. Papel é da ORGANIZAÇÃO, não do time: o mesmo
 * "Agilidade" pode valer na organização inteira ou só num time, e quem decide
 * isso é `usuarioPapel.escopoTimeId`, não a definição do papel. Foi essa
 * separação que permitiu atender "numa empresa é por área, noutra é por time"
 * sem dois modelos (SPEC-28 §4.1).
 */
export const papeisAcesso = pgTable(
  "papeis_acesso",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacaoId: uuid("organizacao_id")
      .notNull()
      .references(() => organizacoes.id),
    nome: text("nome").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("papeis_acesso_nome_unico").on(t.organizacaoId, t.nome)]
);

/**
 * O que um papel pode fazer. `recurso` e `acao` são validados contra listas
 * FECHADAS em `auth/permissoes.ts` antes de chegar aqui — permissão sobre
 * recurso inventado nunca seria checada por rota nenhuma, ou seja, falharia
 * aberta e em silêncio (SPEC-28 §4.2).
 */
export const papelPermissao = pgTable(
  "papel_permissao",
  {
    papelId: uuid("papel_id")
      .notNull()
      .references(() => papeisAcesso.id, { onDelete: "cascade" }),
    recurso: text("recurso").notNull(),
    acao: text("acao").notNull(),
  },
  (t) => [uniqueIndex("papel_permissao_chave_unica").on(t.papelId, t.recurso, t.acao)]
);

/**
 * Quem tem qual papel, e ONDE. `escopoTimeId` nulo = vale na organização
 * inteira; preenchido = só naquele time. É o terceiro eixo da SPEC-28 §4.1
 * inteiro num campo.
 */
export const usuarioPapel = pgTable(
  "usuario_papel",
  {
    email: text("email").notNull(),
    papelId: uuid("papel_id")
      .notNull()
      .references(() => papeisAcesso.id, { onDelete: "cascade" }),
    escopoTimeId: text("escopo_time_id").references(() => times.id),
  },
  (t) => [uniqueIndex("usuario_papel_chave_unica").on(t.email, t.papelId, t.escopoTimeId)]
);

/**
 * Convite de time por link (SPEC-09 §3) — só quem já é do time gera um
 * (`POST /times/:timeId/convites`), qualquer pessoa logada aceita
 * (`POST /convites/:token/aceitar`). Single-use: `usadoPor`/`usadoEm`
 * preenchidos = convite morto, mesmo ainda dentro da validade.
 */
export const convitesTime = pgTable("convites_time", {
  token: uuid("token").primaryKey().defaultRandom(),
  timeId: text("time_id")
    .notNull()
    .references(() => times.id),
  criadoPor: text("criado_por").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  usadoPor: text("usado_por"),
  usadoEm: timestamp("usado_em", { withTimezone: true }),
});

/**
 * Template da especificação de entrega (SPEC-14) — um documento por quebra
 * inteira (não mais por atividade/tipo de item), então é um template só por
 * `timeId`: base global (`CAMPO_GLOBAL`), override quando o time tem o seu
 * próprio. Mesmo padrão de override de `campos_no`/`perfis_time`.
 */
export const especificacaoTemplates = pgTable(
  "especificacao_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timeId: text("time_id").notNull().default(CAMPO_GLOBAL),
    conteudo: text("conteudo").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("especificacao_templates_chave_unica").on(t.timeId)]
);

/**
 * Log de auditoria simples (SPEC-10 §4) — "quem mexeu em quê e quando", não
 * um sistema de histórico/diff. Gravado fire-and-forget depois de uma escrita
 * já ter tido sucesso nas rotas protegidas por `exigirSessao`/`exigirTime`.
 */
export const auditoria = pgTable("auditoria", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  acao: text("acao").notNull(),
  recurso: text("recurso").notNull(),
  recursoId: text("recurso_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * SPEC-31 Fase 3 — documentos de configuração (`regras`, `pipeline-agentes`,
 * `prompt-unico`) no modo hospedado, que até agora só existiam como arquivo no
 * modo local. Documento é `jsonb` opaco: quem sabe interpretá-lo é o engine.
 *
 * `versaoTemplate` guarda qual versão do gerador semeou o documento — nulo é
 * legítimo (config gravada antes desta fase) e é o caso que o diagnóstico de
 * config desatualizada atende.
 */
export const configDocumentos = pgTable(
  "config_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chave: text("chave").notNull(),
    timeId: text("time_id").notNull().default(CAMPO_GLOBAL),
    documento: jsonb("documento").notNull(),
    versaoTemplate: text("versao_template"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("config_documentos_chave_unica").on(t.chave, t.timeId)]
);

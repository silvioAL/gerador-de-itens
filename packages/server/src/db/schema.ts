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

/**
 * Substitui o armazenamento de trecho de código local (config/referencias/*.json)
 * por metadado + ponteiro — a fonte da verdade do conteúdo publicado é um
 * destino externo (Obsidian local via `gerador export-vault`, ou Confluence),
 * não este banco. `codigoRelacionado` é só o caminho — nunca o código em si
 * (mesma disciplina da Fase A) — usado pra linkar a referência à nota real
 * que o Graphify já gera pro arquivo (SPEC-16). `linkExterno` (era
 * `linkConfluence`) é genérico de propósito: Obsidian local não tem URL
 * (é arquivo), então continua opcional mesmo com a referência "existindo"
 * no vault.
 */
export const referencias = pgTable("referencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  timeId: text("time_id"),
  titulo: text("titulo").notNull(),
  racional: text("racional").notNull(),
  designPatterns: jsonb("design_patterns").$type<string[]>().notNull().default([]),
  codigoRelacionado: jsonb("codigo_relacionado").$type<string[]>().notNull().default([]),
  linkExterno: text("link_externo"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

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

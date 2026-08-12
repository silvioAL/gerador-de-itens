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
 * SPEC-38 Fase 2 — o catálogo de perfis de stack. A stack deixou de ser
 * atributo do time (`perfis_time` morreu na migração 0020): o time APONTA um
 * perfil nomeado ("Java + Spring Boot") via `times.perfil_stack_id`, e trocar
 * de tecnologia é trocar o ponteiro. Curadoria: recurso RBAC `perfis-stack` —
 * sem papel nenhum com ele, o catálogo é aberto a owners de time (D1).
 */
export const perfisStack = pgTable(
  "perfis_stack",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacaoId: uuid("organizacao_id")
      .notNull()
      .references(() => organizacoes.id),
    nome: text("nome").notNull(),
    criadoPor: text("criado_por").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("perfis_stack_nome_unico").on(t.organizacaoId, t.nome)]
);

/** Mesma forma relacional do antigo `perfis_time` (uma linha por valor, pra
 * UPDATE pontual) — só que pendurada no PERFIL, não no time. */
export const perfilStackValores = pgTable(
  "perfil_stack_valores",
  {
    perfilId: uuid("perfil_id")
      .notNull()
      .references(() => perfisStack.id, { onDelete: "cascade" }),
    tipoNo: text("tipo_no").notNull(),
    campo: text("campo").notNull(),
    valor: text("valor").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("perfil_stack_valores_chave_unica").on(t.perfilId, t.tipoNo, t.campo)]
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
  /** SPEC-38 Fase 2 — o perfil de stack que este time usa (nullable: time sem
   * stack declarada). Apontar é ato de owner DO TIME, sempre. */
  perfilStackId: uuid("perfil_stack_id").references(() => perfisStack.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Fonte de verdade de quais times uma pessoa pertence — usada pela sessão
 * (JWT) pra saber quais `timeId` autorizar. Onboarding: criar um time novo
 * (`POST /times`, qualquer sessão — o criador nasce `owner`) ou convite por
 * link (`convitesTime`, que carrega o nível) ou administração direta
 * (rotas `/times/:timeId/membros`, SPEC-09 §3-4).
 *
 * SPEC-38 Fase 1 — cada participação carrega um `nivel`:
 * `visualizar` (lê quebras) · `operar` (o dia a dia: criar/derivar/refinar) ·
 * `owner` (configurações do time, membros e níveis). O default `operar`
 * garante que um insert que esqueça o nível nunca nasce com poder de
 * configuração; a validação de valor mora no CHECK da migração 0019 e na
 * lista fechada de `auth/niveis.ts`.
 */
export const usuarioTime = pgTable(
  "usuario_time",
  {
    email: text("email").notNull(),
    timeId: text("time_id")
      .notNull()
      .references(() => times.id),
    nivel: text("nivel").notNull().default("operar"),
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
 * SPEC-38 Fase 3 — papel portado por TIME. Diferente de `usuarioPapel` (por
 * e-mail): aqui o papel acompanha a composição do time — entrar/sair/mudar de
 * nível atualiza a permissão sozinho. Herdam só os membros de nível OWNER do
 * time portador (coerente com a D3). O papel herdado vale com escopo
 * ORGANIZACIONAL: é o caso de uso literal ("o time de arquitetura edita
 * prompts e fluxo"), que não é por-time.
 */
export const timePapel = pgTable(
  "time_papel",
  {
    timeId: text("time_id")
      .notNull()
      .references(() => times.id),
    papelId: uuid("papel_id")
      .notNull()
      .references(() => papeisAcesso.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("time_papel_chave_unica").on(t.timeId, t.papelId)]
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
  /** SPEC-38 — o nível com que o aceite entra no time. O teto (nível pedido ≤
   * nível de quem convida) é aplicado na criação do convite, não aqui. */
  nivel: text("nivel").notNull().default("operar"),
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

/**
 * SPEC-31 Fase 4 — credencial do provedor de IA, por organização.
 *
 * No modo local a credencial é da pessoa (`~/.gerador/credenciais.json`); aqui
 * é da organização e é usada por terceiros. Quem lê a chave inteira é só o
 * adaptador do provedor, na hora da chamada — a API expõe apenas o resumo
 * mascarado.
 */
export const credenciaisIa = pgTable(
  "credenciais_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacaoId: uuid("organizacao_id")
      .notNull()
      .references(() => organizacoes.id),
    provedorId: text("provedor_id").notNull(),
    baseUrl: text("base_url"),
    chave: text("chave"),
    modelo: text("modelo"),
    cabecalhos: jsonb("cabecalhos").$type<Record<string, string>>(),
    formatoJson: text("formato_json"),
    /** SPEC-30 — a voz pode ir pra outro endereço (o Ollama não transcreve). */
    baseUrlTranscricao: text("base_url_transcricao"),
    /** SPEC-30 Fase 2 — "este modelo enxerga imagem", marcado à mão. */
    visao: boolean("visao").notNull().default(false),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("credenciais_ia_chave_unica").on(t.organizacaoId, t.provedorId)]
);

/**
 * SPEC-31 (paridade) — campos por tipo de conexão. A SPEC-21 criou isto no
 * modo local e nunca chegou aqui: quem subia o Docker não conseguia configurar
 * campo de conexão nenhum. Mesma forma de `camposNo`, sem `itemSpec`
 * (`CampoAresta` não aceita campo do tipo "lista").
 */
export const camposAresta = pgTable(
  "campos_aresta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timeId: text("time_id").notNull().default(CAMPO_GLOBAL),
    tipoAresta: text("tipo_aresta").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    required: boolean("required").notNull().default(false),
    valorPadrao: text("valor_padrao"),
    opcoes: jsonb("opcoes").$type<string[]>(),
    ajuda: text("ajuda"),
    ordem: integer("ordem").notNull().default(0),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("campos_aresta_chave_unica").on(t.timeId, t.tipoAresta, t.key)]
);

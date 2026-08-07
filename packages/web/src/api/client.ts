import type { Diagrama, PerfisConfig, Quebra } from "@gerador/engine";

/**
 * Base do @gerador/server — configurável em runtime via `VITE_API_URL`
 * (mesmo espírito de config-em-runtime de `loadConfig.ts`: o mesmo bundle
 * estático não deve travar num host fixo).
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function requisitar<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    ...opcoes,
    // A sessão viaja em cookie httpOnly (ver packages/server/src/auth/sessao.ts) —
    // sem isso o browser nunca envia o cookie numa requisição cross-origin
    // (web em :5173/:8080, server em :4000).
    credentials: "include",
    // Content-Type só quando há corpo de verdade — o Fastify rejeita com 400
    // (FST_ERR_CTP_EMPTY_JSON_BODY) uma requisição com esse header e corpo
    // vazio (achado real: POST /auth/logout, /times/:id/convites e
    // /convites/:token/aceitar não mandam corpo — todos 400avam sempre; os
    // testes de servidor usam `app.inject()`, que não seta esse header, então
    // nunca pegaram isso).
    headers: opcoes?.body !== undefined ? { "Content-Type": "application/json", ...opcoes?.headers } : opcoes?.headers,
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    // As rotas devolvem `{ erro: "mensagem em português" }` pro caso comum
    // (ver packages/server/src/routes/*.ts) — mostra só isso, nunca o dump
    // técnico (método/caminho/HTTP/JSON) na tela de quem está usando o app.
    // `erro` também pode ser um objeto de validação do Zod (400) — sem
    // mensagem pronta pra mostrar, cai num texto genérico.
    const mensagem = typeof corpo.erro === "string" ? corpo.erro : "Não foi possível completar a operação.";
    throw new Error(mensagem);
  }
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export interface QuebraResumo {
  id: string;
  titulo: string | null;
  time: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface QuebraSalva {
  id: string;
  titulo: string | null;
  time: string | null;
  diagrama: Diagrama;
  criadoEm: string;
  atualizadoEm: string;
}

export interface SessaoUsuario {
  email: string;
  timeIds: string[];
}

export const apiAuth = {
  /** `null` (não lança) quando não há sessão — App.tsx usa isso pra decidir entre app/tela de login. */
  async me(): Promise<SessaoUsuario | null> {
    const resposta = await fetch(`${BASE_URL}/auth/me`, { credentials: "include" });
    if (resposta.status === 401) return null;
    if (!resposta.ok) throw new Error(`GET /auth/me falhou (HTTP ${resposta.status})`);
    return (await resposta.json()) as SessaoUsuario;
  },
  /** Qual UI de login mostrar — achado real: LoginScreen sempre renderizou o
   * formulário de e-mail do modo dev, mesmo com AUTH_MODE=oidc no servidor.
   * "local" é o CLI (openApiLocal.ts) — nunca mostra tela de login nenhuma,
   * mas o tipo precisa incluir o valor real que o servidor local devolve. */
  async modo(): Promise<"dev" | "oidc" | "local"> {
    const resposta = await fetch(`${BASE_URL}/auth/modo`, { credentials: "include" });
    if (!resposta.ok) return "dev";
    const corpo = (await resposta.json()) as { modo: "dev" | "oidc" | "local" };
    return corpo.modo;
  },
  /** Modo oidc: nunca um fetch — navegação de página inteira, o servidor
   * redireciona pro provedor (Google) e depois de volta pro app. */
  urlLoginOidc: () => `${BASE_URL}/auth/login`,
  /** Modo dev (AUTH_MODE=dev, default local/E2E) — sem handshake OIDC nenhum, ver SPEC-08 §2.1.
   * Só e-mail: login não escolhe time (pode ser vários, pode ser nenhum — quem
   * decide isso é App.tsx depois que a sessão existe, não o formulário de login). */
  entrarDev: (email: string) =>
    requisitar<SessaoUsuario>("/auth/login", { method: "POST", body: JSON.stringify({ email }) }),
  sair: () => requisitar<{ ok: boolean }>("/auth/logout", { method: "POST" }),
};

/** Forma de um sub-campo dentro de um campo `type: "lista"` (ex.: method/path/
 * request/response de um endpoint) — deliberadamente mais simples que
 * `FieldSpec` completo (sem `when`/`permiteNA`/`itemSpec` aninhado): é a
 * autoria de uma linha repetível, não outro nível de condicional. */
export interface ItemSpecCampo {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select";
  options?: string[];
}

export interface CampoNo {
  id: string;
  timeId: string;
  tipoNo: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "lista";
  required: boolean;
  valorPadrao: string | null;
  opcoes: string[] | null;
  ajuda: string | null;
  permiteNA: boolean;
  ordem: number;
  /** Só quando `type === "lista"` — a forma de cada item. */
  itemSpec: ItemSpecCampo[] | null;
}

export interface DadosCampoNo {
  timeId?: string;
  tipoNo: string;
  key: string;
  label: string;
  type: CampoNo["type"];
  required?: boolean;
  valorPadrao?: string;
  opcoes?: string[];
  ajuda?: string;
  permiteNA?: boolean;
  ordem?: number;
  itemSpec?: ItemSpecCampo[];
}

export const apiCamposNo = {
  listar: (timeId?: string) =>
    requisitar<CampoNo[]>(`/campos-no${timeId ? `?timeId=${encodeURIComponent(timeId)}` : ""}`),
  criar: (dados: DadosCampoNo) => requisitar<CampoNo>("/campos-no", { method: "POST", body: JSON.stringify(dados) }),
  atualizar: (id: string, dados: Partial<DadosCampoNo>) =>
    requisitar<CampoNo>(`/campos-no/${id}`, { method: "PUT", body: JSON.stringify(dados) }),
  excluir: (id: string) => requisitar<void>(`/campos-no/${id}`, { method: "DELETE" }),
};

export const apiQuebras = {
  listar: () => requisitar<QuebraResumo[]>("/quebras"),
  buscar: (id: string) => requisitar<QuebraSalva>(`/quebras/${id}`),
  criar: (quebra: Quebra) =>
    requisitar<QuebraSalva>("/quebras", { method: "POST", body: JSON.stringify(quebra) }),
  atualizar: (id: string, quebra: Quebra) =>
    requisitar<QuebraSalva>(`/quebras/${id}`, { method: "PUT", body: JSON.stringify(quebra) }),
};

export const apiPerfisTime = {
  listar: () => requisitar<PerfisConfig>("/perfis-time"),
  atualizar: (timeId: string, tipoNo: string, valores: Record<string, unknown>) =>
    requisitar<Record<string, unknown>>(`/perfis-time/${encodeURIComponent(timeId)}`, {
      method: "PUT",
      body: JSON.stringify({ tipoNo, valores }),
    }),
};

export interface EspecificacaoTemplate {
  id: string;
  timeId: string;
  conteudo: string;
  atualizadoEm: string;
}

/** Template da especificação de entrega (SPEC-14) — 1 documento por quebra
 * inteira, então 1 template por time (não mais por tipo de item). */
export const apiEspecificacaoTemplate = {
  /** Efetivo: template do time se existir, senão o global — SPEC-14 §6. */
  buscar: (timeId?: string) =>
    requisitar<EspecificacaoTemplate>(`/especificacao-template${timeId ? `?timeId=${encodeURIComponent(timeId)}` : ""}`),
  /** Upsert por timeId — 400 se o template usar `{{variavel}}` desconhecida. */
  salvar: (dados: { timeId?: string; conteudo: string }) =>
    requisitar<EspecificacaoTemplate>("/especificacao-template", { method: "PUT", body: JSON.stringify(dados) }),
};

export interface ConviteTime {
  token: string;
  timeId: string;
  expiraEm: string;
  url: string;
}

/** Convite e administração de membros de time (SPEC-09 §3-4) — sem papel de
 * admin separado, qualquer membro do time administra a própria lista. */
export const apiTimes = {
  /** Qualquer sessão pode criar um time novo — só falha (409) se o nome já
   * existir (aí é convite, não criação). Correção do SPEC-09 §3.3: bootstrap
   * não depende mais de alguém já estar no sistema antes. */
  criarTime: (timeId: string) => requisitar<{ timeId: string }>("/times", { method: "POST", body: JSON.stringify({ timeId }) }),
  criarConvite: (timeId: string) =>
    requisitar<ConviteTime>(`/times/${encodeURIComponent(timeId)}/convites`, { method: "POST" }),
  aceitarConvite: (token: string) => requisitar<{ timeId: string }>(`/convites/${token}/aceitar`, { method: "POST" }),
  listarMembros: (timeId: string) => requisitar<string[]>(`/times/${encodeURIComponent(timeId)}/membros`),
  adicionarMembro: (timeId: string, email: string) =>
    requisitar<{ email: string; timeId: string }>(`/times/${encodeURIComponent(timeId)}/membros`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  removerMembro: (timeId: string, email: string) =>
    requisitar<void>(`/times/${encodeURIComponent(timeId)}/membros/${encodeURIComponent(email)}`, {
      method: "DELETE",
    }),
};

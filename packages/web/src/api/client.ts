import type { Diagrama, PerfisConfig, Quebra, RegrasConfig, ValorSpec } from "@gerador/engine";

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
  /** Respostas (humanas ou IA confirmada) aos placeholders "<- ✍️ especificar"
   * do refinamento técnico/volumetria (Fase 1, SPEC-23). */
  respostasItens?: Record<string, Record<string, ValorSpec>>;
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

/** Só o modo local (`gerador open`) tem essa rota — hospedado e `npm run dev`
 * não têm nada aqui, o que é esperado (não é um erro, mesma disciplina de
 * `.catch(() => [])` já usada pra recursos opcionais). Achado real: sem isso
 * visível na tela, o usuário não tinha como confirmar que `npm install -g
 * gerador-de-itens@latest` de fato trouxe a versão nova. */
export const apiVersao = {
  async buscar(): Promise<string | undefined> {
    try {
      const resposta = await fetch(`${BASE_URL}/versao`, { credentials: "include" });
      if (!resposta.ok) return undefined;
      const corpo = (await resposta.json()) as { versao?: string };
      return corpo.versao;
    } catch {
      return undefined;
    }
  },
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

/**
 * Campo customizado por tipo de aresta (SPEC-21) — mesmo modelo de `CampoNo`
 * (global vs. por time, sobrescrita de campo padrão), mas deliberadamente sem
 * `type: "lista"`/`itemSpec`: campo repetível numa conexão é caso hipotético
 * que ninguém pediu ainda; se aparecer, resolve-se então, mesma disciplina do
 * `when` de aresta não avaliado (ver SPEC-21).
 */
export interface CampoAresta {
  id: string;
  timeId: string;
  tipoAresta: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select";
  required: boolean;
  valorPadrao: string | null;
  opcoes: string[] | null;
  ajuda: string | null;
  ordem: number;
}

export interface DadosCampoAresta {
  timeId?: string;
  tipoAresta: string;
  key: string;
  label: string;
  type: CampoAresta["type"];
  required?: boolean;
  valorPadrao?: string;
  opcoes?: string[];
  ajuda?: string;
  ordem?: number;
}

export const apiCamposAresta = {
  listar: (timeId?: string) =>
    requisitar<CampoAresta[]>(`/campos-aresta${timeId ? `?timeId=${encodeURIComponent(timeId)}` : ""}`),
  criar: (dados: DadosCampoAresta) =>
    requisitar<CampoAresta>("/campos-aresta", { method: "POST", body: JSON.stringify(dados) }),
  atualizar: (id: string, dados: Partial<DadosCampoAresta>) =>
    requisitar<CampoAresta>(`/campos-aresta/${id}`, { method: "PUT", body: JSON.stringify(dados) }),
  excluir: (id: string) => requisitar<void>(`/campos-aresta/${id}`, { method: "DELETE" }),
};

export const apiQuebras = {
  listar: () => requisitar<QuebraResumo[]>("/quebras"),
  buscar: (id: string) => requisitar<QuebraSalva>(`/quebras/${id}`),
  criar: (quebra: Quebra) =>
    requisitar<QuebraSalva>("/quebras", { method: "POST", body: JSON.stringify(quebra) }),
  atualizar: (id: string, quebra: Quebra) =>
    requisitar<QuebraSalva>(`/quebras/${id}`, { method: "PUT", body: JSON.stringify(quebra) }),
};

export interface PedidoSugestaoIa {
  tech: string;
  rotulo: string;
  contextoNo: string;
  /** Contexto do épico/demanda (Fase 1b, SPEC-23) — `demandInfo` + conteúdo
   * dos anexos, quando o usuário preencheu. Opcional pra não quebrar
   * chamadas existentes sem esse dado. */
  contextoEpico?: string;
}

/** Um modelo de chat alternável e seu estado no disco (SPEC-25). */
export interface StatusModeloChat {
  id: string;
  nome: string;
  papel: string;
  instalado: boolean;
  tamanhoAproximadoBytes: number;
  raciocinador: boolean;
  selecionado: boolean;
  /** SPEC-25 Fase 2 — provedor remoto: não se baixa, se configura (base URL,
   * chave, modelo). O card troca "baixar" pelos três campos. */
  remoto?: boolean;
}

/** O que dá pra mostrar da credencial do gateway sem expor a chave. */
export interface ResumoGateway {
  configurado: boolean;
  baseUrl?: string;
  modelo?: string;
  /** `sk-…1234`. A chave inteira nunca trafega de volta pro navegador. */
  chaveMascarada?: string;
}

export interface StatusIa {
  /** Do modelo SELECIONADO — é o que libera a esteira. */
  chatInstalado: boolean;
  embeddingInstalado: boolean;
  pronto: boolean;
  caminhoModelos: string;
  /** SPEC-25 — ausentes em servidor antigo; a UI trata como lista vazia. */
  provedor?: string;
  modelosChat?: StatusModeloChat[];
  gateway?: ResumoGateway;
}

export interface ConfigIa {
  provedorPadrao: string;
}

/** SPEC-25 Fase 0 — qual provedor/modelo a IA usa neste projeto
 * (`config/ia.json`). Trocar aqui derruba o modelo carregado no servidor: o
 * próximo pedido sobe o novo. */
export const apiConfigIa = {
  obter: () => requisitar<ConfigIa>("/config/ia"),
  salvar: (dados: ConfigIa) =>
    requisitar<ConfigIa>("/config/ia", { method: "PUT", body: JSON.stringify(dados) }),
};

/** Fase 1d-ii (SPEC-23) — um placeholder a resolver dentro da ficha de um
 * item (chave namespaced por tech, ou `_historiaUsuario`/`_criteriosAceite`). */
export interface PlaceholderPedidoItemIa {
  chave: string;
  tech: string;
  rotulo: string;
}

/** SPEC-24 Fase E — um item dentro do LOTE mandado pra um papel da esteira
 * (achado real do usuário: chamada por item era lento demais; agora todo o
 * material de um grupo de itens vai numa chamada só por agente). */
/** Um artefato já escrito por um papel anterior (ou pelo usuário), mandado
 * como insumo pro papel seguinte — o encadeamento que faz a esteira ser um
 * pipeline de verdade, não 4 geradores independentes. */
export interface RespostaAnteriorIa {
  rotulo: string;
  valor: string;
}

export interface ItemPedidoPipelineIa {
  chave: string;
  rotulo: string;
  contextoNo: string;
  placeholders: PlaceholderPedidoItemIa[];
  respostasAnteriores?: RespostaAnteriorIa[];
}

export interface PedidoPipelineIa {
  contextoEpico?: string;
  itens: ItemPedidoPipelineIa[];
}

/** SPEC-24 Fase F — o id de um papel da esteira. Não é mais um union fixo:
 * o pipeline é configurável (`config/pipeline-agentes.json`), papéis custom
 * têm ids livres. As SEÇÕES da ficha continuam fixas — ver `GrupoFicha`. */
export type PapelPipeline = string;

/** As 4 seções da ficha que a esteira preenche — dado do engine, NÃO
 * configurável (os placeholders existem na ficha independente de quantos
 * papéis a esteira tenha). Todo papel configurado escreve em exatamente um
 * grupo; papéis custom escolhem qual. */
export type GrupoFicha = "po" | "arquiteto" | "especialista" | "qa";

/** Um papel da esteira, como configurado em `config/pipeline-agentes.json`
 * (SPEC-24 Fase F). A ordem do array É a ordem de execução. */
export interface PapelConfigurado {
  id: string;
  nome: string;
  descricao?: string;
  /** Seção da ficha que este papel escreve. */
  grupo: GrupoFicha;
  /** Preâmbulo custom do prompt — vazio/ausente usa o padrão do grupo
   * (resolvido no servidor, que é quem monta o prompt). */
  preambulo?: string;
  ativo: boolean;
  /** Techs/contextos em que este papel se aplica (ex.: "Backend-mensagens").
   * Vazio = todos os itens. Quando mais de um papel ativo do MESMO grupo
   * casa com um item, o primeiro da lista leva — coloque o contextual antes
   * do geral pra ele "roubar" os itens do contexto dele. */
  contextos: string[];
}

/** Os 4 papéis padrão — o pipeline de fábrica, usado quando a config não
 * define `papeis` (projetos antigos) e como base do editor na Fase F. */
export const PAPEIS_PADRAO: PapelConfigurado[] = [
  { id: "po", nome: "PO", descricao: "Escreve a história e os critérios de aceite", grupo: "po", ativo: true, contextos: [] },
  { id: "arquiteto", nome: "Arquiteto", descricao: "Amarra o item ao nó e escreve o contrato", grupo: "arquiteto", ativo: true, contextos: [] },
  { id: "especialista", nome: "Especialista técnico", descricao: "Aplica a tabela de regras do contexto", grupo: "especialista", ativo: true, contextos: [] },
  { id: "qa", nome: "QA", descricao: "Deriva as regras de teste e escreve os cenários", grupo: "qa", ativo: true, contextos: [] },
];

export const apiIa = {
  /** Se o modelo local está instalado e pronto pra uso — usado antes de
   * disparar a geração ao vivo (Fase 1d, SPEC-23) sem forçar IA em quem não
   * instalou os modelos. */
  status: () => requisitar<StatusIa>("/ia/status"),
  /** SPEC-25 Fase 2 — grava a credencial do gateway em `~/.gerador`, NUNCA em
   * `config/` (que é versionável). Chave vazia = manter a que já está lá. */
  salvarCredencial: (dados: { baseUrl: string; chave: string; modelo: string }) =>
    requisitar<{ ok: true }>("/ia/credencial", { method: "PUT", body: JSON.stringify(dados) }),
  /** Bate no gateway de verdade com um prompt mínimo. Falha de conexão volta
   * como `{ok: false, erro}` (HTTP 200): o resultado do teste É a falha. */
  testarCredencial: (dados: { baseUrl: string; chave: string; modelo: string }) =>
    requisitar<{ ok: boolean; amostra?: string; duracaoMs?: number; erro?: string }>("/ia/credencial/testar", {
      method: "POST",
      body: JSON.stringify(dados),
    }),
  /** Fluxo 3 (Fase 1, SPEC-23) — pede ao modelo local uma sugestão de texto
   * pra um placeholder "<- ✍️ especificar". Streaming de verdade desde a Fase
   * 1c: a resposta chega em pedaços (`text/plain`, chunked), entregues via
   * `onPedaco` conforme o modelo gera — quem não passar esse callback recebe
   * só o texto completo no final, igual antes. Não usa `requisitar()` (que
   * assume corpo JSON, usado por todas as outras rotas deste arquivo) porque
   * o corpo de sucesso aqui é texto puro, não JSON. Lança se os modelos não
   * estiverem instalados (HTTP 503) ou a geração falhar (500) — mesmo
   * tratamento de erro de sempre (`{erro: "mensagem"}` JSON, corpo de sucesso
   * é que muda). */
  async sugerir(pedido: PedidoSugestaoIa, onPedaco?: (pedaco: string) => void): Promise<{ valor: string }> {
    const resposta = await fetch(`${BASE_URL}/ia/sugerir`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      const mensagem = typeof corpo.erro === "string" ? corpo.erro : "Não foi possível completar a operação.";
      throw new Error(mensagem);
    }
    // `response.body` pode faltar em ambiente sem suporte a streams (ex.:
    // alguns runtimes de teste) — cai pro texto completo de uma vez, mesmo
    // resultado final, só sem os pedaços intermediários.
    const leitor = resposta.body?.getReader();
    if (!leitor) {
      const valor = await resposta.text();
      onPedaco?.(valor);
      return { valor };
    }
    const decoder = new TextDecoder();
    let valor = "";
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      const pedaco = decoder.decode(value, { stream: true });
      valor += pedaco;
      onPedaco?.(pedaco);
    }
    return { valor };
  },
  /** SPEC-24 Fase B/C/E — esteira de agentes (PO → Arquiteto → Especialista
   * técnico → QA): a IA escreve os campos de um LOTE de itens de um papel
   * numa chamada só (schema aninhado item→campos, montado no servidor).
   * O servidor troca o preâmbulo do prompt conforme `papel`; quem decide
   * QUAIS itens/placeholders mandar (só os da seção daquele papel, em
   * grupos de `TAM_LOTE_ESTEIRA`) é quem chama, não esta função. */
  sugerirPipeline: async (
    papel: PapelPipeline,
    pedido: PedidoPipelineIa,
    onTexto?: (acumulado: string) => void
  ): Promise<Record<string, Record<string, string>>> => {
    // SPEC-24 Fase E — a rota streama o texto CRU do JSON restrito por GBNF
    // conforme o modelo escreve ("mostrar o que está rodando no modelo, tal
    // como a experiência que existe com o Claude"). Acumula os pedaços,
    // repassa o acumulado pra UI mostrar ao vivo, e parseia no final — o
    // corpo completo é sempre JSON válido (a grammar garante).
    const resposta = await fetch(`${BASE_URL}/ia/pipeline/${encodeURIComponent(papel)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      const mensagem = typeof corpo.erro === "string" ? corpo.erro : "Não foi possível gerar a ficha.";
      throw new Error(mensagem);
    }
    let acumulado = "";
    const leitor = resposta.body?.getReader();
    if (leitor) {
      const decodificador = new TextDecoder();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decodificador.decode(value, { stream: true });
        onTexto?.(acumulado);
      }
      acumulado += decodificador.decode();
    } else {
      acumulado = await resposta.text();
    }
    return JSON.parse(acumulado) as Record<string, Record<string, string>>;
  },
  /** SPEC-23 Fluxo 2 — configurar com apoio de IA ("poder ajustar as
   * configurações com apoio de IA"). Devolve um OBJETO no schema do `alvo`
   * (campo de nó, campo de aresta, papel da esteira), pra UI pré-preencher o
   * formulário que já existe. A IA nunca grava configuração: quem salva é o
   * usuário, pela rota de sempre. Mesmo contrato de streaming do pipeline —
   * texto cru do JSON, parse no fim. */
  sugerirConfig: async <T>(
    pedido: { alvo: AlvoSugestaoConfig; instrucao: string; contexto?: string },
    onTexto?: (acumulado: string) => void
  ): Promise<T> => {
    const resposta = await fetch(`${BASE_URL}/ia/sugerir-config`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      const mensagem = typeof corpo.erro === "string" ? corpo.erro : "Não foi possível gerar a sugestão.";
      throw new Error(mensagem);
    }
    let acumulado = "";
    const leitor = resposta.body?.getReader();
    if (leitor) {
      const decodificador = new TextDecoder();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decodificador.decode(value, { stream: true });
        onTexto?.(acumulado);
      }
      acumulado += decodificador.decode();
    } else {
      acumulado = await resposta.text();
    }
    return JSON.parse(acumulado) as T;
  },
  /** SPEC-27 Fase 1 — a conversa do desenho: descreve a demanda, recebe o
   * diagrama proposto. O `tipo` de cada nó/conexão é restrito no servidor aos
   * ids que a configuração REAL tem, então a proposta nunca cita um tipo que
   * a ferramenta não sabe criar. */
  proporDiagrama: async (
    pedido: PedidoDiagramaIa,
    onTexto?: (acumulado: string) => void
  ): Promise<DiagramaProposto> => {
    const resposta = await fetch(`${BASE_URL}/ia/diagrama`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      const mensagem = typeof corpo.erro === "string" ? corpo.erro : "Não foi possível propor o diagrama.";
      throw new Error(mensagem);
    }
    let acumulado = "";
    const leitor = resposta.body?.getReader();
    if (leitor) {
      const decodificador = new TextDecoder();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decodificador.decode(value, { stream: true });
        onTexto?.(acumulado);
      }
      acumulado += decodificador.decode();
    } else {
      acumulado = await resposta.text();
    }
    return JSON.parse(acumulado) as DiagramaProposto;
  },
  /** SPEC-27 Fase 2 — a conversa da especificação: propõe alterações nos
   * campos de UM item. Uma chamada por item de propósito (a resposta fica
   * pequena, e o lote grande foi o que truncou e apagou trabalho antes). */
  alterarItem: async (pedido: PedidoAlterarItemIa, onTexto?: (acumulado: string) => void): Promise<AlteracoesPropostas> => {
    const resposta = await fetch(`${BASE_URL}/ia/alterar-item`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      const mensagem = typeof corpo.erro === "string" ? corpo.erro : "Não foi possível propor a alteração.";
      throw new Error(mensagem);
    }
    let acumulado = "";
    const leitor = resposta.body?.getReader();
    if (leitor) {
      const decodificador = new TextDecoder();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decodificador.decode(value, { stream: true });
        onTexto?.(acumulado);
      }
      acumulado += decodificador.decode();
    } else {
      acumulado = await resposta.text();
    }
    return JSON.parse(acumulado) as AlteracoesPropostas;
  },
};

export interface PedidoAlterarItemIa {
  instrucao: string;
  itemRotulo: string;
  contextoNo?: string;
  campos: { chave: string; rotulo: string; valorAtual?: string }[];
  /** Só no "revise os demais": o que mudou em outro item. É o que transforma
   * reescrita em propagação. */
  oQueMudou?: string;
  contextoEpico?: string;
}

export interface AlteracoesPropostas {
  alteracoes: { campo: string; valor: string; motivo: string }[];
}

export interface PedidoDiagramaIa {
  descricao: string;
  tiposDeNo: { id: string; rotulo: string }[];
  tiposDeConexao: { id: string; rotulo: string }[];
  techs?: string[];
  contextos?: string[];
  perfilTime?: string;
}

/** O que a IA propõe. `motivo` é obrigatório de propósito: é o que a pessoa lê
 * pra decidir se aceita — proposta sem porquê é caixa-preta pedindo confiança
 * cega (SPEC-27 §5). */
export interface DiagramaProposto {
  nos: { id: string; tipo: string; rotulo: string; motivo: string }[];
  arestas: { de: string; para: string; tipo: string; motivo: string }[];
}

/** Alvos que o servidor sabe sugerir (`ALVOS_SUGESTAO_CONFIG` no CLI). */
export type AlvoSugestaoConfig =
  | "campo-no"
  | "campo-aresta"
  | "papel"
  | "regra-refinamento"
  | "item-processo"
  | "teste-automatizado";

/** O que a IA devolve pro alvo "teste-automatizado". */
export interface SugestaoTeste {
  tipo: string;
  validacao: string;
  contextos: string[];
  dev: boolean;
  hlg: boolean;
}

/** O que a IA devolve pro alvo "regra-refinamento" — o `when` (condição sobre
 * os nós) fica de fora de propósito: é a parte mais sutil da configuração e
 * não deve ser adivinhada; quem precisa dele edita o arquivo. */
export interface SugestaoRegra {
  texto: string;
  contextos: string[];
}

/** O que a IA devolve pro alvo "campo-no"/"campo-aresta" — subconjunto de
 * `DadosCampoNo` que faz sentido a IA propor (nada de `ordem`, `timeId` ou
 * `tipoNo`, que são do contexto, não da sugestão). */
export interface SugestaoCampo {
  key: string;
  label: string;
  type: CampoNo["type"];
  ajuda: string;
  opcoes: string[];
  required: boolean;
  permiteNA: boolean;
}

/** O que a IA devolve pro alvo "papel" — sem `grupo`/`ativo`/`ordem`, que a
 * UI decide (um papel novo nasce ativo, no fim da fila, no grupo escolhido
 * por quem está configurando). */
export interface SugestaoPapel {
  id: string;
  nome: string;
  descricao: string;
  preambulo: string;
  contextos: string[];
}

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

/** SPEC-28 — gestão de acessos (só modo hospedado; no local não há login). */
export interface PapelAcesso {
  id: string;
  nome: string;
  permissoes: { recurso: string; acao: string }[];
  membros: { email: string; escopoTimeId: string | null }[];
}

export interface PermissoesMinhas {
  /** `false` = organização ainda sem papel nenhum: tudo liberado (SPEC-28
   * §4.3). A UI não deve esconder nada nesse estado. */
  rbacAtivo: boolean;
  porRecurso: Record<string, string[]>;
}

export const apiAcessos = {
  /** Catálogo vem do SERVIDOR, não de uma lista copiada aqui — uma cópia no
   * front envelheceria em silêncio quando um recurso novo nascesse. */
  catalogo: () => requisitar<{ recursos: string[]; acoes: string[] }>("/acessos/catalogo"),
  papeis: () => requisitar<PapelAcesso[]>("/acessos/papeis"),
  criarPapel: (dados: { nome: string; permissoes: { recurso: string; acao: string }[] }) =>
    requisitar<PapelAcesso>("/acessos/papeis", { method: "POST", body: JSON.stringify(dados) }),
  salvarPapel: (id: string, dados: { nome: string; permissoes: { recurso: string; acao: string }[] }) =>
    requisitar<PapelAcesso>(`/acessos/papeis/${id}`, { method: "PUT", body: JSON.stringify(dados) }),
  excluirPapel: (id: string) => requisitar<void>(`/acessos/papeis/${id}`, { method: "DELETE" }),
  adicionarMembro: (id: string, dados: { email: string; escopoTimeId?: string }) =>
    requisitar<{ email: string; escopoTimeId: string | null }>(`/acessos/papeis/${id}/membros`, {
      method: "POST",
      body: JSON.stringify(dados),
    }),
  removerMembro: (id: string, email: string) =>
    requisitar<void>(`/acessos/papeis/${id}/membros/${encodeURIComponent(email)}`, { method: "DELETE" }),
  /** O que EU posso — a UI usa pra esconder o que seria negado. Esconder é
   * conveniência: a negação real acontece no servidor, em cada rota. */
  minhas: (timeId?: string) =>
    requisitar<PermissoesMinhas>(`/permissoes/minhas${timeId ? `?timeId=${encodeURIComponent(timeId)}` : ""}`),
};

/** SPEC-25 §5.5 / Fase 2.1 — o template do prompt único (`config/prompt-unico-template.md`). */
export interface PromptUnicoTemplate {
  conteudo: string;
  /** Variáveis que o motor sabe preencher — a UI lista pra quem edita. */
  variaveis: string[];
}

export const apiPromptUnicoTemplate = {
  obter: () => requisitar<PromptUnicoTemplate>("/prompt-unico-template"),
  /** 400 se o template citar `{{variavel}}` que o motor não preenche — aqui o
   * erro é caro: viraria texto cru no prompt já colado no chat da empresa. */
  salvar: (conteudo: string) =>
    requisitar<PromptUnicoTemplate>("/prompt-unico-template", { method: "PUT", body: JSON.stringify({ conteudo }) }),
};

export interface ConfigPipelineAgentes {
  confirmacaoObrigatoria: boolean;
  /** SPEC-24 Fase F — lista ordenada de papéis da esteira. Ausente em
   * configs antigas (só o toggle) — quem consome cai em `PAPEIS_PADRAO`. */
  papeis?: PapelConfigurado[];
}

/** SPEC-24 Fase E — achado real do usuário: "pode avançar sozinho até o fim,
 * ou ir parando conforme está hoje". `confirmacaoObrigatoria: true` (default)
 * é o comportamento de hoje — cada campo sugerido pela IA fica pendente até o
 * usuário confirmar. `false` faz a esteira aplicar direto, sem pausa, como o
 * protótipo de referência sempre fez. */
export const apiPipelineAgentes = {
  obter: () => requisitar<ConfigPipelineAgentes>("/config/pipeline-agentes"),
  salvar: (dados: ConfigPipelineAgentes) =>
    requisitar<ConfigPipelineAgentes>("/config/pipeline-agentes", { method: "PUT", body: JSON.stringify(dados) }),
};

/** SPEC-23 fluxo 5 — `config/regras.json` (a tabela de requisitos de
 * refinamento por tech/contexto). Era o único arquivo de configuração sem
 * rota nem UI: só dava pra editar à mão. O tipo é o do engine, sem cópia. */
export const apiRegras = {
  obter: () => requisitar<RegrasConfig>("/config/regras"),
  salvar: (dados: RegrasConfig) =>
    requisitar<RegrasConfig>("/config/regras", { method: "PUT", body: JSON.stringify(dados) }),
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
